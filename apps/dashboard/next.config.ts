import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship built dist/ (tsup); no transpilePackages needed.
  // The legacy mockup bridge (Slice 0B) mounts client-only under app/(os).
  reactStrictMode: true,
};

export default nextConfig;
