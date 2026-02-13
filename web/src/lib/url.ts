import { env } from "@/lib/env";

interface ResolveAppBaseUrlArgs {
  request?: Request;
  headers?: Headers;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalhostHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized.startsWith("localhost") ||
    normalized.startsWith("127.0.0.1") ||
    normalized.startsWith("[::1]")
  );
}

function isValidPublicBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return !isLocalhostHost(parsed.host);
  } catch {
    return false;
  }
}

export function resolveAppBaseUrl(args?: ResolveAppBaseUrlArgs): string {
  if (env.APP_BASE_URL && isValidPublicBaseUrl(env.APP_BASE_URL)) {
    return trimTrailingSlash(env.APP_BASE_URL);
  }

  const headers = args?.request?.headers ?? args?.headers;
  const forwardedHost =
    headers?.get("x-forwarded-host") ?? headers?.get("host") ?? "";
  const forwardedProto = headers?.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${trimTrailingSlash(forwardedHost)}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${trimTrailingSlash(process.env.VERCEL_URL)}`;
  }

  if (env.APP_BASE_URL) {
    return trimTrailingSlash(env.APP_BASE_URL);
  }

  return "http://localhost:3000";
}
