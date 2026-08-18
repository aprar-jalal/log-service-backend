import type { LogEntry } from "../api";

interface Props {
  logs: LogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

function formatAttrs(attrs: LogEntry["attributes"]): string {
  const entries = Object.entries(attrs ?? {});
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}=${v}`).join("  ");
}

export function LogsTable({ logs, loading, hasMore, onLoadMore }: Props) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Log results</h2>
          <p>Events matching the current query</p>
        </div>

        <div className="panel-tools">
          <span className="count">{logs.length.toLocaleString()} shown</span>
          <span className="live"><i />LIVE</span>
        </div>
      </div>

      <div className="log-wrap">
        <table className="log-table">
          <thead>
            <tr>
              <th style={{ width: 175 }}>Timestamp</th>
              <th style={{ width: 85 }}>Level</th>
              <th style={{ width: 130 }}>Service</th>
              <th>Message</th>
              <th style={{ width: 230 }}>Attributes</th>
            </tr>
          </thead>

          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="ts">
                  {new Date(log.timestamp).toLocaleString()}
                </td>

                <td>
                  <span className={`level ${log.level}`}>
                    <i />
                    {log.level}
                  </span>
                </td>

                <td className="service">{log.service}</td>

                <td className="msg">{log.message}</td>

                <td
                  className="attrs"
                  title={formatAttrs(log.attributes)}
                >
                  {formatAttrs(log.attributes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && !loading && (
          <div className="empty">
            <div className="empty-icon">⌕</div>
            <strong>No logs found</strong>
            <span>Try changing your filters or time range.</span>
          </div>
        )}

        {loading && (
          <div className="loading">
            Loading log events...
          </div>
        )}
      </div>

      <div className="panel-foot">
        <span>
          {loading
            ? "Fetching results..."
            : hasMore
              ? "More results available"
              : "End of results"}
        </span>

        <button
          className="btn btn-secondary"
          onClick={onLoadMore}
          disabled={!hasMore || loading}
        >
          {loading ? "Loading..." : "Load more ↓"}
        </button>
      </div>
    </section>
  );
}
