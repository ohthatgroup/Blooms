"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

interface ScanDebugEventRow {
  id: number;
  session_id: string;
  source: string;
  event_type: string;
  message: string;
  details: Record<string, unknown> | null;
  page_url: string | null;
  created_at: string;
  customer_links?: { customer_name?: string | null; token?: string | null } | null;
}

interface ScanDebugClientProps {
  initialSessionId?: string;
  initialToken?: string;
}

export function ScanDebugClient({
  initialSessionId = "",
  initialToken = "",
}: ScanDebugClientProps) {
  const [sessionInput, setSessionInput] = useState(initialSessionId);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [filters, setFilters] = useState({
    session_id: initialSessionId,
    token: initialToken,
  });
  const [events, setEvents] = useState<ScanDebugEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const linkDebugUrl = useMemo(() => {
    if (!filters.token || !filters.session_id) return "";
    const params = new URLSearchParams({
      debugScan: "true",
      debugSession: filters.session_id,
    });
    return `/o/${filters.token}?${params.toString()}`;
  }, [filters.session_id, filters.token]);

  const loadEvents = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true);
      }
      setError("");

      const params = new URLSearchParams({ limit: "200" });
      if (filters.session_id) params.set("session_id", filters.session_id);
      if (filters.token) params.set("token", filters.token);

      try {
        const response = await fetch(`/api/admin/debug/scan?${params.toString()}`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(body.error || "Failed to load debug events");
          return;
        }
        setEvents((body.events ?? []) as ScanDebugEventRow[]);
        setLastRefreshedAt(new Date().toISOString());
      } catch {
        setError("Failed to load debug events");
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [filters.session_id, filters.token],
  );

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void loadEvents({ silent: true });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [autoRefresh, loadEvents]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters({
      session_id: sessionInput.trim(),
      token: tokenInput.trim(),
    });
  };

  async function copyToClipboard(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      window.prompt("Copy this value:", value);
    }
  }

  return (
    <div className="grid">
      <form className="card" onSubmit={applyFilters}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Live Scanner Debug</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr auto" }}>
          <input
            className="input"
            placeholder="debugSession (required for focused stream)"
            value={sessionInput}
            onChange={(event) => setSessionInput(event.target.value)}
          />
          <input
            className="input"
            placeholder="link token (optional, narrows stream)"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
          />
          <button type="submit" className="button" disabled={loading}>
            Apply
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh (1.5s)
          </label>
          <button
            type="button"
            className="button secondary"
            style={{ padding: "6px 10px" }}
            onClick={() => void loadEvents()}
            disabled={loading}
          >
            Refresh now
          </button>
          {linkDebugUrl ? (
            <>
              <a href={linkDebugUrl} target="_blank" rel="noreferrer">
                Open customer debug URL
              </a>
              <button
                type="button"
                className="button secondary"
                style={{ padding: "6px 10px" }}
                onClick={() => void copyToClipboard(linkDebugUrl)}
              >
                Copy URL
              </button>
            </>
          ) : null}
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Filters: session={filters.session_id || "(none)"} | token=
          {filters.token ? `${filters.token.slice(0, 8)}...` : "(none)"} | events=
          {events.length} | refreshed=
          {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleTimeString() : "never"}
        </div>
        {error ? (
          <span className="badge badge--error" style={{ marginTop: 8 }}>
            <span className="badge__dot" />
            {error}
          </span>
        ) : null}
      </form>

      <div className="table-container">
        <div className="table-container__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Recent Events</h3>
          {loading ? <span className="muted">Loading...</span> : null}
        </div>
        <div className="table-container__body">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th>Source</th>
                <th>Message</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No events found for current filters.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td>{new Date(event.created_at).toLocaleTimeString()}</td>
                    <td>{event.session_id}</td>
                    <td>{event.source}</td>
                    <td>
                      {event.message}
                      {event.customer_links?.customer_name ? (
                        <div className="muted" style={{ fontSize: 11 }}>
                          {event.customer_links.customer_name}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 11,
                          lineHeight: 1.35,
                        }}
                      >
                        {JSON.stringify(event.details ?? {}, null, 0)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
