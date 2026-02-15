"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function CatalogUploadPanel() {
  const [versionLabel, setVersionLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !versionLabel.trim()) return;

    setBusy(true);
    setMessage("");
    const supabase = createSupabaseBrowserClient();

    const cleanName = file.name.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    const path = `catalogs/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from("catalog-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      setBusy(false);
      setMessage(`Upload failed: ${uploadError.message}`);
      return;
    }

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
      setMessage(body.error || "Catalog create failed");
      return;
    }

    const workflow = body.parser_triggered
      ? "Parser started."
      : `Parser not auto-triggered: ${body.parser_trigger_message || "run parser manually"}`;
    setMessage(`Catalog queued: ${body.catalog_id}. ${workflow}`);
    setVersionLabel("");
    setFile(null);
    window.location.reload();
  }

  return (
    <form className="card card--prominent form-section" onSubmit={onSubmit}>
      <div className="form-group">
        <label className="form-label">Catalog Version Label</label>
        <input
          className="input"
          placeholder="e.g. BLOOMS CATALOG 2.10.2026"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">PDF File</label>
        <input
          className="input"
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </div>
      {message && (
        <span className={`badge ${message.startsWith("Upload failed") || message.startsWith("Catalog create failed") ? "badge--error" : "badge--success"}`}>
          <span className="badge__dot" />
          {message}
        </span>
      )}
      <button className="button" disabled={busy || !file}>
        {busy ? "Uploading..." : "Upload + Queue Parse"}
      </button>
    </form>
  );
}
