import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arenafit/shared", "@arenafit/pose"],
};

export default nextConfig;
