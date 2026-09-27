import type { NextConfig } from "next";

// basePath lets the same build serve from a sub-folder (GitHub Pages: /jd-one)
// or from the domain root (Vercel / app.myjdgroup.com) with zero code change.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  // Exposed to the client so the service worker + manifest can be registered
  // under the right prefix.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
