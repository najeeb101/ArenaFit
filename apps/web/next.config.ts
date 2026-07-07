import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@arenafit/shared", "@arenafit/pose"],
  // Without this, Next.js guesses the workspace root from the nearest
  // lockfile above this directory, which in a pnpm monorepo can be the
  // wrong one — pin it explicitly to this repo's root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
