import type { Filters, LogLevel } from "../api";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  onRefresh: () => void;
}

const LEVELS: Array<LogLevel | ""> = ["", "debug", "info", "warn", "error"];

export function FiltersBar({ filters, onChange, onRefresh }: Props) {
  return (
    <section className="query-card">
      <div className="query-title">
        <div className="query-heading">
          <div className="query-icon">⌕</div>
          <div>
            <strong>Query &amp; filters</strong>
            <small>Search, narrow down and inspect your application logs</small>
          </div>
        </div>

        <button
          className="clear"
          onClick={() => onChange({ service: "", level: "", q: "", since: "", until: "" })}
        >
          Clear all
        </button>
      </div>

      <div className="query-grid">
        <div className="field">
          <label>Search message</label>
          <div className="search">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search logs, errors, requests..."
              value={filters.q ?? ""}
              onChange={(e) => onChange({ ...filters, q: e.target.value })}
            />
            <span className="shortcut">⌘ K</span>
          </div>
        </div>

        <div className="field">
          <label>Service</label>
          <input
            type="text"
            placeholder="e.g. checkout"
            value={filters.service ?? ""}
            onChange={(e) => onChange({ ...filters, service: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Level</label>
          <select
            value={filters.level ?? ""}
            onChange={(e) =>
              onChange({ ...filters, level: e.target.value as LogLevel | "" })
            }
          >
            {LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl === "" ? "All levels" : lvl}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="time-row">
        <div className="time-title">
          Time range
          <small>Filter by timestamp</small>
        </div>

        <div className="time-fields">
          <div className="time-field">
            <span>FROM</span>
            <input
              type="datetime-local"
              value={filters.since ?? ""}
              onChange={(e) => onChange({ ...filters, since: e.target.value })}
            />
          </div>

          <span className="time-arrow">→</span>

          <div className="time-field">
            <span>TO</span>
            <input
              type="datetime-local"
              value={filters.until ?? ""}
              onChange={(e) => onChange({ ...filters, until: e.target.value })}
            />
          </div>

          <button className="btn btn-primary run" onClick={onRefresh}>
            Run query →
          </button>
        </div>
      </div>
    </section>
  );
}
