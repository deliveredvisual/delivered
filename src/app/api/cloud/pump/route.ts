import { env } from "@/lib/env";
import { timingSafeEqual } from "@/lib/crypto";
import { anythingDue, pump } from "@/lib/cloud/jobs";
import { fail, json } from "@/lib/api";

/**
 * The every-minute background run (see worker.ts) calls this to carry on copying to Dropbox / Google Drive.
 * Only the site itself knows the key.
 */
export async function POST(request: Request): Promise<Response> {
  const key = request.headers.get("x-pump-key") ?? "";
  if (!env().SESSION_SECRET || !timingSafeEqual(key, env().SESSION_SECRET)) return fail("Not allowed", 403);
  if (!(await anythingDue())) return json({ steps: 0 });
  return json(await pump({ budgetMs: 45_000 }));
}
