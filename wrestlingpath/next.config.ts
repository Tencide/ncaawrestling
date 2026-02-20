import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH ?? "";
const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
