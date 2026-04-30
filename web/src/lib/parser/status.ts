import type { Catalog, ParserJob } from "@/lib/types";

export type ParserHealthKind =
  | "queued_waiting"
  | "stuck_queued"
  | "processing"
  | "stalled_processing"
  | "failed"
  | "ready_for_review";

export type ParserNextAction =
  | "wait_for_parser"
  | "retry_trigger"
  | "review_catalog";

export interface ParserHealth {
  kind: ParserHealthKind;
  label: string;
  badge: "processing" | "error" | "complete";
  message: string;
  progressPercent: number;
  nextAction: ParserNextAction;
  canRetry: boolean;
}

const DEFAULT_STUCK_AFTER_MS = 2 * 60 * 1000;
const DEFAULT_PROCESSING_STALLED_AFTER_MS = 20 * 60 * 1000;

function clampProgress(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function classifyParserHealth(
  catalog: Pick<Catalog, "parse_status" | "parse_summary">,
  parserJob?: Partial<Pick<
    ParserJob,
    | "status"
    | "attempts"
    | "created_at"
    | "started_at"
    | "error_log"
    | "progress_percent"
    | "failed_items"
  >> | null,
  options: { now?: Date; stuckAfterMs?: number; processingStalledAfterMs?: number } = {},
): ParserHealth {
  const now = options.now ?? new Date();
  const stuckAfterMs = options.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
  const processingStalledAfterMs =
    options.processingStalledAfterMs ?? DEFAULT_PROCESSING_STALLED_AFTER_MS;
  const summary = catalog.parse_summary ?? {};
  const failedItems = Number(parserJob?.failed_items ?? summary.failed_items ?? 0);
  const fallbackProgress =
    catalog.parse_status === "complete" || catalog.parse_status === "needs_review"
      ? 100
      : 0;
  const progressPercent = clampProgress(
    parserJob?.progress_percent ?? summary.progress_percent,
    fallbackProgress,
  );

  if (catalog.parse_status === "failed" || parserJob?.status === "failed" || failedItems > 0) {
    return {
      kind: "failed",
      label: "Parser failed",
      badge: "error",
      message: parserJob?.error_log || String(summary.error ?? "Parser failed. Retry after checking the parser log."),
      progressPercent,
      nextAction: "retry_trigger",
      canRetry: true,
    };
  }

  if (catalog.parse_status === "complete" || catalog.parse_status === "needs_review") {
    return {
      kind: "ready_for_review",
      label: "Ready for review",
      badge: "complete",
      message: "Parser finished and the catalog can be reviewed.",
      progressPercent: 100,
      nextAction: "review_catalog",
      canRetry: false,
    };
  }

  if (parserJob?.status === "processing" || parserJob?.started_at || catalog.parse_status === "processing") {
    const startedAt = parserJob?.started_at ? new Date(parserJob.started_at) : null;
    const isProcessingStalled =
      parserJob?.status === "processing" &&
      startedAt !== null &&
      now.getTime() - startedAt.getTime() >= processingStalledAfterMs;

    if (isProcessingStalled) {
      return {
        kind: "stalled_processing",
        label: "Parser stalled",
        badge: "error",
        message: parserJob?.error_log || "Parser worker claimed this job but did not finish before the workflow timeout.",
        progressPercent,
        nextAction: "retry_trigger",
        canRetry: true,
      };
    }

    return {
      kind: "processing",
      label: "Parser running",
      badge: "processing",
      message: "Parser worker has claimed this job.",
      progressPercent,
      nextAction: "wait_for_parser",
      canRetry: false,
    };
  }

  if (parserJob?.status === "queued" && Number(parserJob.attempts ?? 0) > 0) {
    const paused = parserJob.error_log?.includes("paused before the GitHub Actions timeout");
    return {
      kind: "queued_waiting",
      label: paused ? "Parser paused, waiting to resume" : "Queued, waiting for parser",
      badge: "processing",
      message: paused
        ? parserJob.error_log ?? "Parser paused before the GitHub Actions timeout."
        : "Catalog is queued. Waiting for the parser worker to claim it.",
      progressPercent,
      nextAction: "wait_for_parser",
      canRetry: false,
    };
  }

  const createdAt = parserJob?.created_at ? new Date(parserJob.created_at) : null;
  const isStuck =
    parserJob?.status === "queued" &&
    Number(parserJob.attempts ?? 0) === 0 &&
    createdAt !== null &&
    now.getTime() - createdAt.getTime() >= stuckAfterMs;

  if (isStuck) {
    return {
      kind: "stuck_queued",
      label: "Parser workflow not started",
      badge: "error",
      message: "Parser workflow has not claimed this job yet.",
      progressPercent,
      nextAction: "retry_trigger",
      canRetry: true,
    };
  }

  return {
    kind: "queued_waiting",
    label: "Queued, waiting for parser",
    badge: "processing",
    message: "Catalog is queued. Waiting for the parser worker to claim it.",
    progressPercent,
    nextAction: "wait_for_parser",
    canRetry: false,
  };
}
