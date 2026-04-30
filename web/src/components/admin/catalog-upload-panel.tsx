"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type StageStatus = "pending" | "active" | "done" | "error";

interface UploadStage {
  id: string;
  label: string;
  status: StageStatus;
  detail?: string;
}

interface CatalogUploadPanelProps {
  children?: ReactNode;
}

const initialStages: UploadStage[] = [
  { id: "selected", label: "PDF selected", status: "pending" },
  { id: "storage", label: "Supabase Storage upload", status: "pending" },
  { id: "catalog", label: "Catalog row created", status: "pending" },
  { id: "job", label: "Parser job created", status: "pending" },
  { id: "dispatch", label: "GitHub Actions dispatch", status: "pending" },
  { id: "run", label: "GitHub Actions run confirmed", status: "pending" },
  { id: "claimed", label: "Parser job claimed", status: "pending" },
  { id: "processing", label: "Parser processing", status: "pending" },
  { id: "final", label: "Review ready or failed", status: "pending" },
];

function setStage(
  stages: UploadStage[],
  id: string,
  status: StageStatus,
  detail?: string,
) {
  return stages.map((stage) =>
    stage.id === id ? { ...stage, status, detail } : stage,
  );
}

export function CatalogUploadPanel({ children }: CatalogUploadPanelProps) {
  const router = useRouter();
  const [versionLabel, setVersionLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<UploadStage[]>(initialStages);
  const [message, setMessage] = useState("");
  const [activeCatalogId, setActiveCatalogId] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    if (!activeCatalogId) return;

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/admin/catalogs/${activeCatalogId}/parser-status`, {
        cache: "no-store",
      });
      if (!response.ok) return;

      const body = await response.json().catch(() => null) as {
        health?: { kind?: string; label?: string; message?: string; progressPercent?: number };
        parserJob?: { id?: string; status?: string; attempts?: number; progress_label?: string };
      } | null;
      const health = body?.health;
      const parserJob = body?.parserJob;
      if (!health) return;

      if (parserJob?.status === "processing" || Number(parserJob?.attempts ?? 0) > 0) {
        setStages((current) => setStage(current, "claimed", "done", parserJob?.id));
      }
      if (health.kind === "processing") {
        setStages((current) =>
          setStage(
            setStage(current, "processing", "active", `${health.progressPercent ?? 0}% - ${parserJob?.progress_label ?? "processing"}`),
            "final",
            "pending",
          ),
        );
      }
      if (health.kind === "ready_for_review") {
        setStages((current) =>
          setStage(
            setStage(current, "processing", "done", "100%"),
            "final",
            "done",
            "Ready for review",
          ),
        );
        setMessage("Parser finished. Catalog is ready for review.");
        router.refresh();
        window.clearInterval(timer);
      }
      if (health.kind === "failed" || health.kind === "stuck_queued" || health.kind === "stalled_processing") {
        setStages((current) =>
          setStage(current, health.kind === "failed" ? "final" : "claimed", "error", health.message),
        );
        setMessage(health.label ?? "Parser needs attention.");
        router.refresh();
        window.clearInterval(timer);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeCatalogId, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !versionLabel.trim()) return;

    setBusy(true);
    setMessage("");
    setActiveCatalogId("");
    setStages((current) => setStage(current, "storage", "active", file.name));
    const supabase = createSupabaseBrowserClient();

    const cleanName = file.name.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const path = `catalogs/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from("catalog-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      setBusy(false);
      setStages((current) => setStage(current, "storage", "error", uploadError.message));
      setMessage("Upload failed before the catalog was queued.");
      return;
    }

    setStages((current) => setStage(current, "storage", "done", path));
    setStages((current) => setStage(current, "catalog", "active", "Creating catalog row"));

    const response = await fetch("/api/admin/catalogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        versionLabel: versionLabel.trim(),
        pdfStoragePath: path,
      }),
    });

    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setStages((current) => setStage(current, "catalog", "error", body.details || body.error || "Catalog create failed"));
      setMessage(body.error || "Catalog create failed");
      return;
    }

    setStages((current) => setStage(current, "catalog", "done", body.catalog_id));
    setStages((current) => setStage(current, "job", "done", body.parser_job_id));
    setStages((current) =>
      setStage(
        current,
        "dispatch",
        body.parser_triggered ? "done" : "error",
        body.parser_trigger_message,
      ),
    );
    setStages((current) =>
      setStage(
        current,
        "run",
        body.workflow_run_confirmed ? "done" : "error",
        body.workflow_run_url ?? (body.parser_triggered ? "Dispatch accepted, but no run confirmed yet." : "GitHub Actions did not start."),
      ),
    );
    setMessage(
      body.next_action === "wait_for_parser"
        ? "Catalog queued. Watching for the parser worker to claim it."
        : "Catalog queued, but parser startup needs attention.",
    );
    setActiveCatalogId(body.catalog_id ?? "");
    setVersionLabel("");
    setFile(null);
    setFileInputKey((key) => key + 1);
    router.refresh();
  }

  return (
    <div className="card catalog-upload">
      <form onSubmit={onSubmit}>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <h2 className="section-header__title">Upload catalog</h2>
          <span className="badge badge--processing">
            <span className="badge__dot" />
            PDF primary
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "1 1 220px" }}>
            <label className="form-label">Version label</label>
            <input
              className="input"
              placeholder="BLOOMS CATALOG 4.28.2026"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 260px" }}>
            <label className="form-label">PDF file</label>
            <input
              key={fileInputKey}
              className="input"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0] ?? null;
                setFile(selectedFile);
                setStages(
                  selectedFile
                    ? setStage(initialStages, "selected", "done", selectedFile.name)
                    : initialStages,
                );
                setMessage("");
              }}
              required
            />
          </div>
          <button className="button" style={{ flex: "0 0 auto" }} disabled={busy || !file}>
            {busy ? "Uploading..." : "Upload + Queue Parse"}
          </button>
        </div>
      </form>

      <ol className="upload-timeline">
        {stages.map((stage) => (
          <li key={stage.id} className={`upload-timeline__item upload-timeline__item--${stage.status}`}>
            <span className="upload-timeline__status" />
            <div>
              <strong>{stage.label}</strong>
              {stage.detail && <span>{stage.detail}</span>}
            </div>
          </li>
        ))}
      </ol>

      {message && (
        <div style={{ marginTop: 8 }}>
          <span className={`badge ${message.includes("failed") || message.includes("attention") ? "badge--error" : "badge--success"}`}>
            <span className="badge__dot" />
            {message}
          </span>
        </div>
      )}

      {children && (
        <details className="secondary-import">
          <summary>Import or update from CSV/XLSX</summary>
          {children}
        </details>
      )}
    </div>
  );
}
