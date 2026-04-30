import { describe, expect, it } from "vitest";
import { classifyParserHealth } from "@/lib/parser/status";
import type { Catalog, ParserJob } from "@/lib/types";

const now = new Date("2026-04-30T18:00:00Z");

function catalog(overrides: Partial<Catalog> = {}): Pick<Catalog, "parse_status" | "parse_summary"> {
  return {
    parse_status: "queued",
    parse_summary: {},
    ...overrides,
  };
}

function parserJob(overrides: Partial<ParserJob> = {}): Partial<ParserJob> {
  return {
    status: "queued",
    attempts: 0,
    created_at: "2026-04-30T17:59:30Z",
    progress_percent: 0,
    ...overrides,
  };
}

describe("classifyParserHealth", () => {
  it("keeps a fresh queued job in waiting state", () => {
    const health = classifyParserHealth(catalog(), parserJob(), { now });

    expect(health.kind).toBe("queued_waiting");
    expect(health.label).toBe("Queued, waiting for parser");
    expect(health.canRetry).toBe(false);
  });

  it("flags a queued unclaimed job as stuck after the threshold", () => {
    const health = classifyParserHealth(
      catalog(),
      parserJob({ created_at: "2026-04-30T17:55:00Z" }),
      { now },
    );

    expect(health.kind).toBe("stuck_queued");
    expect(health.nextAction).toBe("retry_trigger");
    expect(health.canRetry).toBe(true);
  });

  it("treats a claimed job as processing", () => {
    const health = classifyParserHealth(
      catalog({ parse_status: "processing" }),
      parserJob({
        status: "processing",
        attempts: 1,
        started_at: "2026-04-30T17:59:45Z",
        progress_percent: 42,
      }),
      { now },
    );

    expect(health.kind).toBe("processing");
    expect(health.progressPercent).toBe(42);
    expect(health.canRetry).toBe(false);
  });

  it("flags an old claimed job as stalled", () => {
    const health = classifyParserHealth(
      catalog({ parse_status: "processing" }),
      parserJob({
        status: "processing",
        attempts: 1,
        started_at: "2026-04-30T17:35:00Z",
        progress_percent: 64,
      }),
      { now },
    );

    expect(health.kind).toBe("stalled_processing");
    expect(health.label).toBe("Parser stalled");
    expect(health.canRetry).toBe(true);
  });

  it("describes a paused queued retry without marking it failed", () => {
    const health = classifyParserHealth(
      catalog({ parse_status: "queued" }),
      parserJob({
        status: "queued",
        attempts: 1,
        error_log: "Parser paused before the GitHub Actions timeout. The next scheduled or manual parser run will resume from cached item progress.",
        progress_percent: 68,
      }),
      { now },
    );

    expect(health.kind).toBe("queued_waiting");
    expect(health.label).toBe("Parser paused, waiting to resume");
    expect(health.progressPercent).toBe(68);
    expect(health.canRetry).toBe(false);
  });

  it("preserves parser error details in failed state", () => {
    const health = classifyParserHealth(
      catalog({ parse_status: "failed" }),
      parserJob({
        status: "failed",
        attempts: 1,
        error_log: "Stream has ended unexpectedly",
      }),
      { now },
    );

    expect(health.kind).toBe("failed");
    expect(health.message).toBe("Stream has ended unexpectedly");
    expect(health.canRetry).toBe(true);
  });

  it("marks complete catalogs ready for review", () => {
    const health = classifyParserHealth(
      catalog({ parse_status: "needs_review", parse_summary: { progress_percent: 100 } }),
      parserJob({ status: "success", progress_percent: 100 }),
      { now },
    );

    expect(health.kind).toBe("ready_for_review");
    expect(health.nextAction).toBe("review_catalog");
    expect(health.progressPercent).toBe(100);
  });
});
