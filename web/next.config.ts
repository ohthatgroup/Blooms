import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Keep Turbopack root aligned with Next's tracing root in monorepo deploys.
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
