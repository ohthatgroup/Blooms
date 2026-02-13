import { env } from "@/lib/env";

interface TriggerParserWorkflowArgs {
  reason: string;
  catalogId?: string;
}

interface TriggerParserWorkflowResult {
  triggered: boolean;
  status?: number;
  message: string;
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

  const url = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/actions/workflows/${env.GITHUB_WORKFLOW_FILE}/dispatches`;
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

  return {
    triggered: true,
    status: response.status,
    message: "Parser workflow triggered successfully.",
  };
}

