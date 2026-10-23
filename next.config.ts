import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Uploads are sent in chunks through route handlers; keep the server body limit generous.
  // Videos used to live at /p/<link>/film/<id>; old links and bookmarks still work.
  async redirects() {
    return [{ source: "/p/:slug/film/:id", destination: "/p/:slug/video/:id", permanent: true }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
