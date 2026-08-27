import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship built dist/ (tsup); no transpilePackages needed.
  // The legacy mockup bridge (Slice 0B) mounts client-only under app/(os).
  reactStrictMode: true,
  env: {
    // Inlined at build time so the surface cache can key on it synchronously,
    // before first paint. A deploy that changes a viewmodel's shape must not
    // restore the old shape into new components — a new sha starts cold.
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
};

export default nextConfig;
