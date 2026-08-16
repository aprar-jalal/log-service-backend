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
    <div className="panel">
      <p className="eyebrow">Log stream · {logs.length} shown</p>
      <div className="log-table-wrap">
        <table className="log-table">
          <thead>
            <tr>
              <th style={{ width: 170 }}>Time</th>
              <th style={{ width: 70 }}>Level</th>
              <th style={{ width: 120 }}>Service</th>
              <th>Message</th>
              <th style={{ width: 220 }}>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className={`row-${log.level}`}>
                <td className="ts">{new Date(log.timestamp).toLocaleString()}</td>
                <td>
                  <span className={`lvl-badge lvl-${log.level}`}>{log.level}</span>
                </td>
                <td>{log.service}</td>
                <td className="msg">{log.message}</td>
                <td className="attrs" title={formatAttrs(log.attributes)}>
                  {formatAttrs(log.attributes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && !loading && <div className="empty-state">No logs match these filters yet.</div>}
      </div>
      <div className="footer-row">
        <span>{loading ? "loading…" : hasMore ? "more results available" : "end of results"}</span>
        <button className="btn secondary" onClick={onLoadMore} disabled={!hasMore || loading}>
          Load more
        </button>
      </div>
    </div>
  );
}
