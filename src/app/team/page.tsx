import type { Metadata } from "next";
import { headers } from "next/headers";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { invites, memberships, users } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { CopyLink } from "../admin/p/[id]/copy-link";
import { ConfirmButton } from "../admin/confirm-button";
import { activateSide, createInvite, removeMember, revokeInvite } from "./actions";
import { ClaimForm, StudioForm } from "./forms";

export const metadata: Metadata = { title: "Team" };

/** The organisation: its name, which dashboards it has, who's in it, and invite links for colleagues. */
export default async function TeamPage() {
  const s = await requireOrg();
  const { studio: org, role, user } = s;
  const owner = role === "owner";
  const [team, open] = await Promise.all([
    db()
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.studioId, org.id))
      .orderBy(asc(memberships.createdAt)),
    db()
      .select()
      .from(invites)
      .where(and(eq(invites.studioId, org.id), isNull(invites.usedBy), gt(invites.expiresAt, new Date())))
      .orderBy(asc(invites.createdAt)),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const hasOwnerAccount = team.some((t) => t.role === "owner");

  return (
    <>
      <AppHeader s={s} view="team" />
      <main className="wrap stack" style={{ paddingTop: 48, gap: 48, maxWidth: 900 }}>
        <h1 className="h2" style={{ fontSize: 40 }}>{org.name}</h1>

        {!user && !hasOwnerAccount ? (
          <section className="stack" style={{ gap: 16 }}>
            <h2 className="h3">Create your sign-in</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
              You signed in with the studio password. Create your own email sign-in to become this organisation&rsquo;s owner. The studio password keeps working as a backup.
            </p>
            <ClaimForm />
          </section>
        ) : null}

        <section id="dashboards" className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Dashboards</h2>
          <div className="dash-cards">
            <div className="panel stack" style={{ gap: 10 }}>
              <div className="row between">
                <span style={{ fontWeight: 600 }}>Creative</span>
                <span className={`small ${org.creative ? (org.status === "active" ? "good" : "warn") : "muted"}`}>
                  {org.creative ? (org.status === "active" ? "On" : "Waiting for approval") : "Off"}
                </span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Make deliveries and send them to clients: upload photos and films, landing pages, chat, client folders.</p>
              {!org.creative && owner ? (
                <form action={activateSide.bind(null, "creative")}>
                  <button type="submit" className="btn btn-small">Turn on</button>
                </form>
              ) : null}
              {org.creative && org.status !== "active" ? (
                <p className="small muted" style={{ margin: 0 }}>You can look around now; uploading opens once it&rsquo;s approved.</p>
              ) : null}
            </div>
            <div className="panel stack" style={{ gap: 10 }}>
              <div className="row between">
                <span style={{ fontWeight: 600 }}>Client</span>
                <span className={`small ${org.client ? "good" : "muted"}`}>{org.client ? "On" : "Off"}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Receive deliveries from other studios: everyone here sees them, and can chat, pick, sort into folders and download.</p>
              {!org.client && owner ? (
                <form action={activateSide.bind(null, "client")}>
                  <button type="submit" className="btn btn-small">Turn on</button>
                </form>
              ) : null}
            </div>
          </div>
          {!owner && (!org.creative || !org.client) ? (
            <p className="small muted" style={{ margin: 0 }}>Only the owner can turn dashboards on.</p>
          ) : null}
        </section>

        {owner ? (
          <section className="stack" style={{ gap: 16 }}>
            <h2 className="h3">Organisation</h2>
            <StudioForm name={org.name} email={org.email} />
          </section>
        ) : null}

        <section className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Team</h2>
          {team.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No one has an email sign-in here yet.</p>
          ) : (
            <div className="table-box">
              <table className="table" style={{ minWidth: 560 }}>
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {team.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}{user?.id === t.id ? <span className="muted"> (you)</span> : null}</td>
                      <td className="mono small">{t.email}</td>
                      <td>{t.role === "owner" ? "Owner" : "Team member"}</td>
                      <td style={{ textAlign: "right" }}>
                        {owner && t.role !== "owner" ? (
                          <form action={removeMember.bind(null, t.id)}>
                            <ConfirmButton message={`Remove ${t.name} from ${org.name}? They'll no longer see any of its deliveries.`}>Remove</ConfirmButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Invite a colleague</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 600 }}>
            Make a link and send it to someone you work with, like your social media manager. They create a sign-in from it and see everything {org.name} has, on both dashboards. Each link works once and lasts 14 days.
          </p>
          {open.map((inv) => (
            <div key={inv.token} className="stack" style={{ gap: 6 }}>
              <CopyLink url={`${origin}/signup?invite=${inv.token}`} label="Invite link" />
              <div className="row small muted" style={{ gap: 12 }}>
                <span>Expires {formatDate(inv.expiresAt)}</span>
                <form action={revokeInvite.bind(null, inv.token)}>
                  <button type="submit" className="btn btn-small">Cancel link</button>
                </form>
              </div>
            </div>
          ))}
          <form action={createInvite}>
            <button type="submit" className="btn">Create invite link</button>
          </form>
        </section>
      </main>
    </>
  );
}
