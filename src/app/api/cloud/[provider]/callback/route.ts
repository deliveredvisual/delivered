import { redirect } from "next/navigation";
import { currentStudio } from "@/lib/auth";
import { env } from "@/lib/env";
import { verify } from "@/lib/crypto";
import { accountName, exchangeCode, isProvider } from "@/lib/cloud/providers";
import { saveLink } from "@/lib/cloud/jobs";

/** Dropbox / Google sends the owner back here after they allow access; the connection is saved for the studio. */
export async function GET(request: Request, ctx: RouteContext<"/api/cloud/[provider]/callback">): Promise<Response> {
  const { provider } = await ctx.params;
  const url = new URL(request.url);
  const back = (msg: string): never => redirect(`/team?cloud=${encodeURIComponent(msg)}#cloud`);
  if (!isProvider(provider)) back("unknown");
  if (url.searchParams.get("error")) back("cancelled");
  const s = await currentStudio();
  if (!s) redirect("/login");
  const state = await verify<{ s: string; u: string; p: string }>(url.searchParams.get("state") ?? "", env().SESSION_SECRET);
  const code = url.searchParams.get("code");
  if (!state || state.s !== s.studio.id || state.p !== provider || s.role !== "owner" || !code) back("failed");
  let ok = false;
  try {
    const t = await exchangeCode(provider as "dropbox" | "gdrive", code!, `${url.origin}/api/cloud/${provider}/callback`);
    if (t.refresh) {
      const account = await accountName(provider as "dropbox" | "gdrive", t.access).catch(() => "");
      await saveLink(s.studio.id, provider as "dropbox" | "gdrive", { access: t.access, expiresIn: t.expiresIn, refresh: t.refresh }, account, s.user?.name ?? s.studio.name);
      ok = true;
    }
  } catch {
    ok = false;
  }
  return back(ok ? `connected-${provider}` : "failed");
}
