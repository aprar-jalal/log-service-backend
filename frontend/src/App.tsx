import { useEffect, useState } from "react";
import { fetchAggregate, fetchHealth, fetchLogs, type AggregateBucket, type Filters, type LogEntry } from "./api";
import { FiltersBar } from "./components/FiltersBar";
import { LogsTable } from "./components/LogsTable";
import { AggregateChart } from "./components/AggregateChart";

function localToIso(local: string | undefined): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default function App() {
  const [filters, setFilters] = useState<Filters>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [buckets, setBuckets] = useState<AggregateBucket[]>([]);
  const [loadingAgg, setLoadingAgg] = useState(false);
  const [bucketSize, setBucketSize] = useState<"1m" | "5m" | "1h" | "1d">("5m");
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiFilters: Filters = {
    service: filters.service || undefined,
    level: filters.level || undefined,
    q: filters.q || undefined,
    since: localToIso(filters.since),
    until: localToIso(filters.until),
  };

  async function loadLogs(reset: boolean) {
    setLoadingLogs(true);
    setError(null);
    try {
      const res = await fetchLogs(apiFilters, reset ? null : cursor);
      setLogs((prev) => (reset ? res.logs : [...prev, ...res.logs]));
      setCursor(res.next_cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function loadAggregate() {
    setLoadingAgg(true);
    try {
      const until = apiFilters.until ?? new Date().toISOString();
      const since = apiFilters.since ?? new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const res = await fetchAggregate(apiFilters, since, until, bucketSize);
      setBuckets(res.buckets);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingAgg(false);
    }
  }

  function refresh() {
    void loadLogs(true);
    void loadAggregate();
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAggregate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketSize]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchHealth().then(setOnline);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            pulse<span>.</span>logs
          </span>
          <span className="brand-sub">ingestion &amp; query console</span>
        </div>
        <div className="status">
          <span className={`pulse-dot ${online ? "" : "offline"}`} />
          {online ? "connected" : "unreachable"}
        </div>
      </header>

      <main className="main">
        <FiltersBar filters={filters} onChange={setFilters} onRefresh={refresh} />

        {error && <div className="error-banner">{error}</div>}

        <div className="grid-two">
          <LogsTable logs={logs} loading={loadingLogs} hasMore={cursor !== null} onLoadMore={() => loadLogs(false)} />
          <AggregateChart buckets={buckets} bucketSize={bucketSize} onBucketSizeChange={setBucketSize} loading={loadingAgg} />
        </div>
      </main>
    </div>
  );
}
