import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Uploads are sent in chunks through route handlers; keep the server body limit generous.
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
