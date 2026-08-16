# Pulse — Log Ingestion and Query Service

A high-throughput log ingestion/query/aggregation service, built to the required API
contract in the assignment brief. Backend: **Node.js + TypeScript + Fastify + PostgreSQL**.
Frontend: **React + Vite + TypeScript** dashboard.

```
docker compose up
```

- API: `http://localhost:8080`
- Dashboard: `http://localhost:5173`

That's it — no environment file or manual setup is required. The default configuration is
the plain, unauthenticated core service described in the brief.

---

## 1. Architecture at a glance

```
┌────────────┐      ┌──────────────────┐      ┌──────────────────────────┐
│  frontend  │ HTTP │     backend       │ SQL  │        postgres          │
│ React/Vite │─────▶│ Fastify + node-pg │─────▶│ logs (RANGE partitioned) │
│  (nginx)   │      │  (0.5 CPU/256MB)  │      │      (1 CPU/1GB)         │
└────────────┘      └──────────────────┘      └──────────────────────────┘
```

- **backend/** — the API. Plain parameterized SQL via `pg` (no ORM), Fastify for low
  request overhead. Structure:
  - `src/routes/` — one file per endpoint group (health, logs, aggregate). Thin: parse →
    delegate → respond.
  - `src/lib/` — `validation.ts` (entry validation), `queryBuilder.ts` (parameterized
    filter/WHERE construction shared by `GET /logs` and `GET /logs/aggregate`),
    `cursor.ts` (opaque pagination cursor), `retention.ts` (partition maintenance).
  - `src/middleware/auth.ts` — optional bearer-token auth (off by default).
  - `src/db/migrations/*.sql` — plain, idempotent SQL migrations, applied on every boot.
  - Query-building and persistence are intentionally kept out of the route handlers
    (separation of concerns) so they're independently testable — see
    `src/lib/*.test.ts`.
- **frontend/** — a small dashboard: filterable log table with cursor-based "load more",
  and a time-bucketed volume chart. Talks to the API over plain `fetch`.

---

## 2. Schema and index design

```sql
CREATE TABLE logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY,
  ts         TIMESTAMPTZ NOT NULL,
  level      TEXT NOT NULL CHECK (level IN ('debug','info','warn','error')),
  service    TEXT NOT NULL,
  message    TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);
```

`logs` is **RANGE partitioned by day on `ts`**. A `logs_default` partition catches any
row that lands outside a pre-created daily partition (clock skew near a boundary), so
ingestion never fails with "no partition found". Partitions are created ahead of time
(today + a 3-day lookahead) by a background sweep, and each partition carries its own
set of indexes:

| Index | Purpose |
|---|---|
| `(ts DESC, id DESC)` btree | The primary access path: `GET /logs` keyset pagination and time-range scans. |
| `(service, ts DESC)` btree | `service=` filter. |
| `(level, ts DESC)` btree | `level=` filter. |
| `attributes` GIN (`jsonb_path_ops`) | Future containment queries over attributes; see §3 for why arbitrary `attr.<key>=` filters don't hit this today. |
| `message` GIN (`gin_trgm_ops`, pg_trgm) | Case-insensitive substring search (`q=`) without a full sequential scan. |

Why partition by day instead of one flat table? It's what makes **retention cheap**
(§5) and it keeps indexes small and cache-friendly: a query scoped to "the last hour"
only ever touches one day's worth of index pages, not a month's.

---

## 3. Attribute storage strategy

Attributes are stored as a single `JSONB` column rather than a fixed set of columns or
an EAV (entity-attribute-value) table. Reasoning:

- **The key set is arbitrary and per-caller** (`user_id`, `request_id`, `region`, ...),
  which rules out fixed columns.
- An EAV table (one row per attribute) would multiply the number of rows written per
  log line, which directly fights the 15k+ logs/sec ingestion target — every extra
  write is an extra WAL record and extra index maintenance. JSONB keeps the whole
  attribute bag as part of the single row already being written.
- JSONB gives typed storage (string/number/boolean preserved) plus `->>` for text
  extraction and `@>` for containment, and is directly indexable with GIN.

**Trade-off, stated plainly:** the spec requires `attr.<key>=<value>` to compare *as
strings* (`attr.retries=3` matches a stored `"retries": 3`). That's implemented as
`(attributes ->> $key) = $value` in `queryBuilder.ts`. A GIN index cannot accelerate an
arbitrary-key `->>` extraction directly (only `@>` containment on a *known* key/value
pair), so today an `attr.` filter is evaluated as a filter after the `service` /
`level` / time-range predicates have already narrowed the row set via their own
indexes — it is not itself index-accelerated. On ~1.5M rows this was fast enough in
testing when combined with a time-bounded query (attribute filters are typically used
alongside a service or time filter in practice), but a workload that filters *only* on
a rare attribute value across the full dataset would fall back to a partition-local
scan. Documented as a known limitation in §7.

---

## 4. Ingestion path

- `POST /logs` validates every entry independently (`src/lib/validation.ts`) — one bad
  entry never fails the batch, and rejected entries report their original array index
  and reason.
- Accepted entries are written with a single **multi-row `INSERT ... SELECT * FROM
  unnest($1::timestamptz[], $2::text[], ...)`** per chunk (default chunk size 2000),
  rather than one `INSERT` per row. This is the single biggest ingestion-throughput
  lever: it turns N round-trips into one, while remaining fully parameterized (no
  string-built SQL, so no injection surface).
- A batch is only ever acknowledged with `200` **after** the insert has committed —
  the service never returns success for data it hasn't durably written.

---

## 5. Retention strategy

Retention is enforced by **dropping whole daily partitions**, never `DELETE`:

```sql
SELECT drop_log_partition('2026-07-01');  -- DROP TABLE logs_2026_07_01
```

A background sweep (`src/lib/retention.ts`, default interval 60s, configurable via
`RETENTION_SWEEP_INTERVAL_MS`) does two things on every tick:

1. Pre-creates partitions for today + `PARTITION_LOOKAHEAD_DAYS` (default 3) so
   ingestion never blocks on partition creation.
2. Drops any partition whose entire day falls outside `RETENTION_DAYS` (default 30).

`DROP TABLE` on a partition is a fast metadata operation that takes a brief
`ACCESS EXCLUSIVE` lock on **that partition only** — it doesn't scan rows, doesn't
bloat the table, and doesn't compete with autovacuum the way a row-by-row `DELETE`
over a month of data would. This satisfies the brief's requirement that retention not
introduce long-running locks or major ingestion disruption: partitions being ingested
into today are never candidates for the drop, so live ingestion is untouched.

---

## 6. API contract implementation notes

- **Pagination**: `next_cursor` is a base64url-encoded `{ts, id}` pair
  (`src/lib/cursor.ts`). Paging is a keyset predicate — `WHERE (ts, id) <
  ($cursor_ts, $cursor_id)` — matching the `(ts DESC, id DESC)` index, so page N costs
  the same as page 1 (no `OFFSET` scan cost that grows with depth).
- **Validation errors** (`GET /logs`, `GET /logs/aggregate`): a shared
  `parseFilters`/`buildWhere` module in `src/lib/queryBuilder.ts` is used by both
  endpoints, so filter semantics (and their error messages) can't drift between them.
- **Auth is fully optional and off by default** — see `AUTH_ENABLED` below. When
  disabled, an `Authorization` header sent by a caller is read by nothing and never
  rejected, per the load-generator contract.
- **Malformed JSON / bad top-level shape** on `POST /logs` returns `400` via a
  Fastify `setErrorHandler`, not a `500`.

---

## 7. Known limitations

- **`attr.<key>=` filters are not index-accelerated** for arbitrary keys (§3) — they
  ride on whatever `service`/`level`/time-range predicates narrow the scan to first.
- **No true multi-tenant data isolation.** The optional `api_keys` table supports
  per-key scopes and a `tenant` label, but log rows are not partitioned or filtered by
  tenant — every key currently sees the same global dataset. Documented rather than
  silently assumed away.
- **Rate limiting is a simple in-process fixed-window counter**, not distributed —
  fine for a single backend replica (the assignment's target topology) but would need
  a shared store (e.g. Redis) behind multiple replicas.
- **`logs_default` partition is unindexed beyond the parent's constraint** and is only
  ever expected to hold a handful of rows near a partition boundary; it is not
  optimized for a large sustained volume.
- The **aggregate bucket set is fixed** to `1m`/`5m`/`1h`/`1d` per the spec; arbitrary
  bucket widths aren't supported.

---

## 8. Optional features implemented

All are **off by default** — `docker compose up` with no configuration yields exactly
the unauthenticated core service on all four required endpoints.

| Feature | Env var(s) | Default | Notes |
|---|---|---|---|
| Authentication / API keys | `AUTH_ENABLED`, `LOADGEN_API_KEY` | `AUTH_ENABLED=false` | Bearer token (also accepts `X-API-Key`). The seeded key is idempotently created at startup with `ingest`+`query` scope, before the service reports healthy; restarts never invalidate it. `401` on missing/bad credential, `403` on insufficient scope. |
| Rate limiting | `RATE_LIMIT_ENABLED`, `RATE_LIMIT_PER_SECOND` | `false` | Fixed-window counter; the seeded load-generator key is always exempt when auth is on. Returns `429` + `Retry-After`. |
| Configurable retention | `RETENTION_DAYS`, `RETENTION_SWEEP_INTERVAL_MS`, `PARTITION_LOOKAHEAD_DAYS` | 30 days / 60s / 3 days | See §5. |
| Dashboard | — | n/a (separate `frontend` container) | Filterable log table + aggregate volume chart. |

To run with auth on:

```bash
AUTH_ENABLED=true LOADGEN_API_KEY=your-key docker compose up
```

---

## 9. Load-test methodology and measured results

### Test environment

⚠️ **Honest caveat first:** these numbers were captured in a development sandbox with
Postgres and the API installed directly on a **single shared CPU core** (not the
target topology of separate 0.5 CPU / 1 CPU containers). Where that mattered, it's
called out below. The project also includes `scripts/smoke-test.sh` and the
`loadtest/` scripts used to generate these numbers so they can be re-run against the
real `docker compose` topology or the grading infrastructure.

- Postgres 16, backend on Node 20/Fastify, both on one shared vCPU / 4GB host during
  measurement (vs. the target 0.5 CPU app + 1 CPU Postgres in separate containers).
- Dataset: synthetic logs across 6 services × 4 levels × 4 regions, 4 JSON attributes
  per entry.
- Batch size: 500 entries/request.
- Ingestion tool: `loadtest/ingest-load.js` (N concurrent workers firing
  `POST /logs` batches continuously for a fixed duration).
- Query tool: `loadtest/query-load.js` (sequential `GET /logs` + `GET /logs/aggregate`
  loop, reporting latency percentiles).

### Ingestion throughput

| Run | Concurrency | Duration | Accepted | Logs/sec | Errors |
|---|---|---|---|---|---|
| Sustained | 24 workers | 60s | 952,500 | **~15,790/s** | 0 |
| Shorter warm-up | 20 workers | 20s | 274,000 | ~13,340/s | 0 |

Zero dropped/errored requests across all runs; ingestion held the 15,000 logs/sec
baseline target on a single shared core.

### Query / aggregate latency (at rest, ~1.49M rows in the table)

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| `GET /logs` (filtered, `limit=100`) | 5.3 ms | **8.3 ms** | 23.7 ms |
| `GET /logs/aggregate` (`bucket=5m`, `group_by=service`, 24h window) | 290 ms | **312 ms** | 951 ms |

Both comfortably under the 1s p95 aggregate target at the ~1M-row scale called for in
the brief.

### Query latency *while ingestion is active* (concurrent, same shared core)

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /logs` | 200 ms | 562 ms |
| `GET /logs/aggregate` | 1.32 s | 1.9 s |

This is the one number that **misses the target**, and it's the most useful bottleneck
this exercise surfaced: with ingestion workers, Postgres's insert path, and Postgres's
own parallel aggregate workers all fighting for the *same single CPU core*, aggregate
latency degrades sharply. In the actual deployment topology the app container (doing
the ingestion HTTP handling) and the Postgres container (doing the inserts *and* the
aggregate query) are separate cgroups, so the app's ingestion work no longer directly
steals cycles from Postgres — but Postgres itself still has only 1 CPU to split
between concurrent inserts and an aggregate scan, so this is a real trade-off worth
re-measuring on the actual grading infrastructure (`loadgen.foothilltech.net`), not an
artifact to hand-wave away.

### Bottlenecks discovered and optimizations applied

1. **Bucketing function.** The first aggregate implementation computed bucket start
   with `to_timestamp(floor(extract(epoch FROM ts)/N)*N)`. Switching to Postgres's
   native `date_bin(interval, ts, origin)` cut the query's own execution time from
   ~1.5s to ~450ms at 1.2M rows (verified with `EXPLAIN ANALYZE`) — a single native
   function call per row instead of three composed ones.
2. **Per-row inserts vs. bulk `unnest`.** Switching ingestion from row-at-a-time
   `INSERT`s to chunked multi-row inserts via `unnest()` was the change that made the
   15k/s target reachable at all; row-at-a-time inserts were network-round-trip bound
   well before they were CPU or disk bound.
3. **`synchronous_commit=off`** in the Postgres tuning (docker-compose `command:`)
   trades a small, bounded durability window (loss of the most recent commits only on
   an OS crash, not on a Postgres crash) for materially lower commit latency under
   sustained write load — an acceptable trade for a logs pipeline, called out
   explicitly here rather than left silent.
4. **Concurrent ingest+aggregate contention** (above) — identified but not fully
   resolved within this exercise; documented as the top follow-up item rather than
   papered over.

---

## 10. CI

`.github/workflows/ci.yml` runs on every push/PR:

1. Backend: type-check, build, unit tests (`vitest`) — 18 tests covering entry
   validation and the parameterized filter/query builder.
2. Frontend: build.
3. `docker compose up` against the real `Dockerfile`s, then
   `scripts/smoke-test.sh` against **both** required auth configurations
   (`AUTH_ENABLED=false` and `AUTH_ENABLED=true` with a seeded key), asserting all
   four endpoints are reachable and behave per the contract in each mode.

---

## 11. Local development

```bash
# backend
cd backend && npm install
npm run dev        # tsx watch, expects DATABASE_URL pointing at a running Postgres
npm test           # vitest

# frontend
cd frontend && npm install
npm run dev         # http://localhost:5173, expects VITE_API_BASE_URL or defaults to :8080
```

Migrations live in `backend/src/db/migrations/*.sql` and are applied automatically on
every backend boot (idempotent — safe to re-run).
