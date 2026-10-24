import { redirect } from "next/navigation";
import { currentStudio } from "@/lib/auth";
import { env } from "@/lib/env";
import { sign } from "@/lib/crypto";
import { authorizeUrl, credentials, isProvider } from "@/lib/cloud/providers";

/** Team page → "Connect Dropbox / Google Drive": sends the studio owner to sign in there and allow access. */
export async function GET(request: Request, ctx: RouteContext<"/api/cloud/[provider]/connect">): Promise<Response> {
  const { provider } = await ctx.params;
  const s = await currentStudio();
  if (!s) redirect("/login");
  if (!isProvider(provider) || s.role !== "owner" || !credentials(provider)) redirect("/team#cloud");
  const origin = new URL(request.url).origin;
  const state = await sign({ s: s.studio.id, u: s.user?.id ?? "", p: provider, exp: Date.now() + 15 * 60_000 }, env().SESSION_SECRET);
  redirect(authorizeUrl(provider, `${origin}/api/cloud/${provider}/callback`, state));
}
