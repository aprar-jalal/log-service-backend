-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Migration bookkeeping
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- logs: the source-of-truth table.
--
-- Attribute storage strategy: attributes are stored as JSONB. Logs have a
-- small, mostly-consistent set of keys per service but the *set* of keys
-- is not known up front (arbitrary key/value pairs), which rules out a
-- fixed-column schema and makes an EAV (one row per attribute) table too
-- expensive to write and join at 15k logs/sec. JSONB gives us:
--   - O(1) storage of the whole bag of attributes per row (no extra join
--     on the write path, which matters most for ingestion throughput)
--   - ->> for typed/string extraction on the read path
--   - a GIN index for containment/existence queries
--
-- Partitioning strategy: the table is RANGE partitioned by day on `ts`.
-- This is what makes retention cheap: expiring data is a `DROP TABLE`
-- of a whole partition (a fast metadata operation with only a brief
-- lock), never a row-by-row DELETE that bloats the table and fights the
-- autovacuum daemon under sustained ingestion.
-- =====================================================================
CREATE TABLE IF NOT EXISTS logs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY,
  ts         TIMESTAMPTZ NOT NULL,
  level      TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  service    TEXT NOT NULL,
  message    TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

-- A default partition catches any row that lands outside a pre-created
-- daily partition (e.g. clock skew near a boundary) so ingestion never
-- fails with "no partition found".
CREATE TABLE IF NOT EXISTS logs_default PARTITION OF logs DEFAULT;

-- Creates (if missing) the daily partition covering the given day, plus
-- the indexes every partition needs. Called at startup for a lookahead
-- window and periodically by the retention sweep for the next day.
CREATE OR REPLACE FUNCTION ensure_log_partition(day DATE)
RETURNS void AS $$
DECLARE
  part_name   TEXT := 'logs_' || to_char(day, 'YYYY_MM_DD');
  range_start TIMESTAMPTZ := day::timestamptz;
  range_end   TIMESTAMPTZ := (day + 1)::timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF logs FOR VALUES FROM (%L) TO (%L)',
      part_name, range_start, range_end
    );
    -- Primary access path: recent-first pagination / range scans.
    EXECUTE format('CREATE INDEX %I ON %I (ts DESC, id DESC)', part_name || '_ts_id_idx', part_name);
    -- Equality filters used by every query endpoint.
    EXECUTE format('CREATE INDEX %I ON %I (service, ts DESC)', part_name || '_service_idx', part_name);
    EXECUTE format('CREATE INDEX %I ON %I (level, ts DESC)', part_name || '_level_idx', part_name);
    -- Arbitrary attr.<key> lookups and future containment queries.
    EXECUTE format('CREATE INDEX %I ON %I USING GIN (attributes jsonb_path_ops)', part_name || '_attrs_idx', part_name);
    -- Case-insensitive substring search on message (q= param).
    EXECUTE format('CREATE INDEX %I ON %I USING GIN (message gin_trgm_ops)', part_name || '_message_trgm_idx', part_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drops the partition for a given day (used by retention). DROP TABLE on
-- a partition takes only a brief ACCESS EXCLUSIVE lock on the partition
-- itself (not the parent) and does not scan rows, so it is safe to run
-- while ingestion continues against other partitions.
CREATE OR REPLACE FUNCTION drop_log_partition(day DATE)
RETURNS void AS $$
DECLARE
  part_name TEXT := 'logs_' || to_char(day, 'YYYY_MM_DD');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format('DROP TABLE %I', part_name);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Pre-create partitions for yesterday, today, and a short lookahead so the
-- very first ingest requests never race partition creation.
SELECT ensure_log_partition((current_date + offs)::date)
FROM generate_series(-1, 3) AS offs;

INSERT INTO schema_migrations (id) VALUES ('001_init')
ON CONFLICT (id) DO NOTHING;
