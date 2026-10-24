// The site's Cloudflare Worker: the Next.js app, plus a run every minute that carries on copying uploads to
// Dropbox / Google Drive (see src/lib/cloud/jobs.ts). Built by `opennextjs-cloudflare build`, which makes
// .open-next/worker.js first.
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    const request = new Request("https://deliveredvisual.com/api/cloud/pump", {
      method: "POST",
      headers: { "x-pump-key": env.SESSION_SECRET },
    });
    ctx.waitUntil(handler.fetch(request, env, ctx));
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
