const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const serverOnlyRequired = ["SUPABASE_SERVICE_ROLE_KEY"] as const;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? "",
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:3000",
  GITHUB_ACTIONS_TOKEN: process.env.GITHUB_ACTIONS_TOKEN ?? "",
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER ?? "",
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME ?? "",
  GITHUB_WORKFLOW_FILE: process.env.GITHUB_WORKFLOW_FILE ?? "parser-worker.yml",
  GITHUB_WORKFLOW_REF: process.env.GITHUB_WORKFLOW_REF ?? "main",
};

export function assertClientEnv(): void {
  required.forEach((k) => getEnv(k));
}

export function assertServerEnv(): void {
  assertClientEnv();
  serverOnlyRequired.forEach((k) => getEnv(k));
}
