"use client";

import { useState } from "react";

export function TriggerParserButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function triggerNow() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/parser/trigger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "manual_dashboard_click" }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setMessage(body.message || (response.ok ? "Triggered." : "Failed to trigger parser"));
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button className="button secondary" onClick={triggerNow} disabled={busy}>
        {busy ? "Triggering..." : "Run Parser Now"}
      </button>
      {message ? (
        <span className={`badge ${message.includes("Failed") || message.includes("failed") ? "badge--error" : "badge--success"}`}>
          <span className="badge__dot" />
          {message}
        </span>
      ) : null}
    </div>
  );
}
