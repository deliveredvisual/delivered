import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/env";
import { safeNext } from "@/lib/next-url";
import { invites, studios } from "@/db/schema";
import { AuthShell } from "../login/auth-shell";
import { ClientSignup, CreativeSignup, InviteSignup } from "./signup-forms";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? "";
  const q = next ? `next=${encodeURIComponent(next)}` : "";
  const signIn = <>Already have an account? <Link href={`/login${q ? `?${q}` : ""}`}>Sign in</Link></>;

  // Joining a studio's team from an invite link
  if (typeof sp.invite === "string") {
    const rows = await db()
      .select({ studio: studios.name })
      .from(invites)
      .innerJoin(studios, eq(studios.id, invites.studioId))
      .where(and(eq(invites.token, sp.invite), isNull(invites.usedBy), gt(invites.expiresAt, new Date())))
      .limit(1);
    if (!rows[0]) {
      return (
        <AuthShell title="Invite expired" footer={signIn}>
          <p className="muted" style={{ margin: 0 }}>This invite link has expired or was already used. Ask whoever sent it for a new one.</p>
        </AuthShell>
      );
    }
    return (
      <AuthShell title={`Join ${rows[0].studio}`} footer={signIn}>
        <InviteSignup token={sp.invite} />
      </AuthShell>
    );
  }

  const creative = sp.as === "creative";
  const tab = (as: string) => `/signup?${[as === "creative" ? "as=creative" : "", q].filter(Boolean).join("&")}`;
  return (
    <AuthShell title="Create an account" footer={signIn}>
      <nav className="row" aria-label="Account type" style={{ gap: 6 }}>
        <Link href={tab("client")} className="btn btn-small pill" aria-pressed={!creative} replace scroll={false}>I&rsquo;m a client</Link>
        <Link href={tab("creative")} className="btn btn-small pill" aria-pressed={creative} replace scroll={false}>I&rsquo;m a creative</Link>
      </nav>
      <p className="small muted" style={{ margin: 0 }}>
        {creative
          ? "For photographers, videographers and other creatives: deliver work to your clients. You can also turn on a client dashboard later."
          : "Every delivery sent to your company in one place, shared with your colleagues. You can also turn on a creative dashboard later."}
      </p>
      {creative ? <CreativeSignup /> : <ClientSignup next={next} />}
    </AuthShell>
  );
}
