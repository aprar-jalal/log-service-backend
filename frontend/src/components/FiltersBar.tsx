import type { Filters, LogLevel } from "../api";

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  onRefresh: () => void;
}

const LEVELS: Array<LogLevel | ""> = ["", "debug", "info", "warn", "error"];

export function FiltersBar({ filters, onChange, onRefresh }: Props) {
  return (
    <div className="filters">
      <input
        type="text"
        placeholder="service (e.g. checkout)"
        value={filters.service ?? ""}
        onChange={(e) => onChange({ ...filters, service: e.target.value })}
      />
      <select
        value={filters.level ?? ""}
        onChange={(e) => onChange({ ...filters, level: e.target.value as LogLevel | "" })}
      >
        {LEVELS.map((lvl) => (
          <option key={lvl} value={lvl}>
            {lvl === "" ? "all levels" : lvl}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="search message…"
        value={filters.q ?? ""}
        onChange={(e) => onChange({ ...filters, q: e.target.value })}
        style={{ minWidth: 220 }}
      />
      <input
        type="datetime-local"
        value={filters.since ?? ""}
        onChange={(e) => onChange({ ...filters, since: e.target.value })}
        title="since"
      />
      <input
        type="datetime-local"
        value={filters.until ?? ""}
        onChange={(e) => onChange({ ...filters, until: e.target.value })}
        title="until"
      />
      <button className="btn" onClick={onRefresh}>
        Refresh
      </button>
      <button
        className="btn secondary"
        onClick={() => onChange({ service: "", level: "", q: "", since: "", until: "" })}
      >
        Clear
      </button>
    </div>
  );
}
