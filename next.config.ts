import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // agentmail dynamically imports the optional @x402/fetch payments extra, which
  // the bundler cannot resolve; like pg/bullmq it is server-only anyway.
  serverExternalPackages: ["pg", "bullmq", "ioredis", "agentmail"],
};

export default nextConfig;
