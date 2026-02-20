import { ScanDebugClient } from "@/components/admin/scan-debug-client";

export default async function AdminDebugScanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const sessionRaw = resolvedSearchParams.session;
  const tokenRaw = resolvedSearchParams.token;
  const session = Array.isArray(sessionRaw) ? sessionRaw[0] ?? "" : sessionRaw ?? "";
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] ?? "" : tokenRaw ?? "";

  return (
    <div className="container grid">
      <div className="section-header">
        <h2 className="section-header__title">Scanner Debug</h2>
      </div>
      <ScanDebugClient initialSessionId={session} initialToken={token} />
    </div>
  );
}
