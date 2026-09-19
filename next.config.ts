import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
};

export default nextConfig;
