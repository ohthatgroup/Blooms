import { env } from "@/lib/env";

interface TriggerParserWorkflowArgs {
  reason: string;
  catalogId?: string;
}

interface TriggerParserWorkflowResult {
  triggered: boolean;
  status?: number;
  message: string;
  workflowRunUrl?: string;
  workflowRunConfirmed?: boolean;
}

function hasWorkflowConfig() {
  return Boolean(
    env.GITHUB_ACTIONS_TOKEN &&
      env.GITHUB_REPO_OWNER &&
      env.GITHUB_REPO_NAME &&
      env.GITHUB_WORKFLOW_FILE,
  );
}

export async function triggerParserWorkflow(
  args: TriggerParserWorkflowArgs,
): Promise<TriggerParserWorkflowResult> {
  if (!hasWorkflowConfig()) {
    return {
      triggered: false,
      message:
        "GitHub workflow trigger is not configured. Add GITHUB_ACTIONS_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in Vercel env vars.",
    };
  }

  const requestedAt = new Date();
  const workflowBaseUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}`;
  const url = `${workflowBaseUrl}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "blooms-web-trigger",
    },
    body: JSON.stringify({
      ref: env.GITHUB_WORKFLOW_REF,
      inputs: {
        reason: args.reason,
        catalog_id: args.catalogId ?? "",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      triggered: false,
      status: response.status,
      message: `GitHub workflow dispatch failed (${response.status}): ${text || "Unknown error"}`,
    };
  }

  const recentRun = await findRecentWorkflowRun(workflowBaseUrl, requestedAt);

  return {
    triggered: true,
    status: response.status,
    message: recentRun
      ? "Parser workflow triggered successfully."
      : "Parser workflow dispatch was accepted, but no recent GitHub Actions run was confirmed yet.",
    workflowRunUrl: recentRun?.html_url,
    workflowRunConfirmed: Boolean(recentRun),
  };
}

async function findRecentWorkflowRun(
  workflowBaseUrl: string,
  requestedAt: Date,
): Promise<{ html_url: string } | null> {
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const runsUrl = new URL(`${workflowBaseUrl}/runs`);
  runsUrl.searchParams.set("event", "workflow_dispatch");
  runsUrl.searchParams.set("branch", env.GITHUB_WORKFLOW_REF);
  runsUrl.searchParams.set("per_page", "10");

  const response = await fetch(runsUrl, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "blooms-web-trigger",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const body = (await response.json().catch(() => ({}))) as {
    workflow_runs?: Array<{ html_url?: string; created_at?: string }>;
  };
  const thresholdMs = requestedAt.getTime() - 30_000;
  const recent = body.workflow_runs?.find((run) => {
    if (!run.html_url || !run.created_at) return false;
    return new Date(run.created_at).getTime() >= thresholdMs;
  });

  return recent?.html_url ? { html_url: recent.html_url } : null;
}
