import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Shown by /api/health, to tell which version is live (GitHub Actions sets GITHUB_SHA)
  env: {
    BUILD_SHA: (process.env.GITHUB_SHA ?? 'local').slice(0, 7),
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
