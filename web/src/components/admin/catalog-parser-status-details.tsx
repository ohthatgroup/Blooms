"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParserHealth } from "@/lib/parser/status";
import type { ParserJob } from "@/lib/types";

interface CatalogParserStatusDetailsProps {
  catalogId: string;
  parserJob: Partial<ParserJob> | null;
  health: ParserHealth;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function valueOrDash(value: unknown) {
  return value === undefined || value === null || value === "" ? "-" : String(value);
}

export function CatalogParserStatusDetails({
  catalogId,
  parserJob,
  health,
}: CatalogParserStatusDetailsProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const [retryError, setRetryError] = useState("");

  async function retryParser() {
    setRetrying(true);
    setRetryMessage("");
    setRetryError("");

    const response = await fetch("/api/admin/parser/trigger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "admin_retry_from_catalog_status",
        catalog_id: catalogId,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setRetrying(false);

    if (!response.ok) {
      setRetryError(body.message || body.error || "Parser retry failed");
      return;
    }

    const workflow = body.workflow_run_url
      ? ` Run: ${body.workflow_run_url}`
      : body.workflow_run_confirmed === false
        ? " GitHub accepted the dispatch, but no run was confirmed yet."
        : "";
    setRetryMessage(`${body.message || "Parser retry requested."}${workflow}`);
    router.refresh();
  }

  return (
    <details className="parser-debug">
      <summary>Parser details</summary>
      <div className="parser-debug__grid">
        <div><strong>Catalog id</strong><span>{catalogId}</span></div>
        <div><strong>Parser job id</strong><span>{valueOrDash(parserJob?.id)}</span></div>
        <div><strong>Job status</strong><span>{valueOrDash(parserJob?.status)}</span></div>
        <div><strong>Attempts</strong><span>{valueOrDash(parserJob?.attempts)}</span></div>
        <div><strong>Created</strong><span>{formatDate(parserJob?.created_at)}</span></div>
        <div><strong>Started</strong><span>{formatDate(parserJob?.started_at)}</span></div>
        <div><strong>Finished</strong><span>{formatDate(parserJob?.finished_at)}</span></div>
        <div><strong>Progress label</strong><span>{valueOrDash(parserJob?.progress_label)}</span></div>
        <div><strong>Progress</strong><span>{health.progressPercent}%</span></div>
        <div><strong>Items</strong><span>{valueOrDash(parserJob?.processed_items)} processed / {valueOrDash(parserJob?.total_items)} total</span></div>
        <div><strong>Pages</strong><span>{valueOrDash(parserJob?.parsed_pages)} parsed / {valueOrDash(parserJob?.total_pages)} total</span></div>
      </div>
      <p className="muted parser-debug__message">{health.message}</p>
      {parserJob?.error_log && (
        <pre className="parser-debug__error">{parserJob.error_log}</pre>
      )}
      {health.canRetry && (
        <button className="button secondary" onClick={retryParser} disabled={retrying}>
          {retrying ? "Retrying..." : "Retry parser"}
        </button>
      )}
      {retryMessage && (
        <div className="badge badge--success parser-debug__notice">
          <span className="badge__dot" />
          {retryMessage}
        </div>
      )}
      {retryError && (
        <div className="badge badge--error parser-debug__notice">
          <span className="badge__dot" />
          {retryError}
        </div>
      )}
    </details>
  );
}
