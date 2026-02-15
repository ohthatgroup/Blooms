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
    <form className="card" onSubmit={onSubmit}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: "1 1 200px", width: "auto" }}
          placeholder="Version label, e.g. BLOOMS CATALOG 2.10.2026"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          required
        />
        <input
          className="input"
          style={{ flex: "0 0 auto", width: "auto", maxWidth: 260 }}
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
        <button className="button" style={{ flex: "0 0 auto" }} disabled={busy || !file}>
          {busy ? "Uploading..." : "Upload + Queue Parse"}
        </button>
      </div>
      {message && (
        <div style={{ marginTop: 8 }}>
          <span className={`badge ${message.startsWith("Upload failed") || message.startsWith("Catalog create failed") ? "badge--error" : "badge--success"}`}>
            <span className="badge__dot" />
            {message}
          </span>
        </div>
      )}
    </form>
  );
}
