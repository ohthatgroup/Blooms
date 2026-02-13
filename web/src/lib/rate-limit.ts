import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let ratelimit: Ratelimit | null = null;

function getLimiter() {
  if (ratelimit) return ratelimit;
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 m"),
  });

  return ratelimit;
}

export async function enforcePublicRateLimit(ipOrToken: string) {
  const limiter = getLimiter();
  if (!limiter) {
    return { success: true };
  }

  return limiter.limit(ipOrToken);
}

