import type { Metadata } from "next";
import { headers } from "next/headers";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { requireStudio } from "@/lib/auth";
import { db } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { invites, memberships, users } from "@/db/schema";
import { CopyLink } from "../p/[id]/copy-link";
import { ConfirmButton } from "../confirm-button";
import { createInvite, removeMember, revokeInvite } from "./actions";
import { ClaimForm, StudioForm } from "./forms";

export const metadata: Metadata = { title: "Studio & team" };

export default async function TeamPage() {
  const { studio, role, user } = await requireStudio();
  const owner = role === "owner";
  const [team, open] = await Promise.all([
    db()
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.studioId, studio.id))
      .orderBy(asc(memberships.createdAt)),
    owner
      ? db()
          .select()
          .from(invites)
          .where(and(eq(invites.studioId, studio.id), isNull(invites.usedBy), gt(invites.expiresAt, new Date())))
          .orderBy(asc(invites.createdAt))
      : Promise.resolve([]),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const hasOwnerAccount = team.some((t) => t.role === "owner");

  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 48, maxWidth: 900 }}>
      <h1 className="h2" style={{ fontSize: 40 }}>Studio &amp; team</h1>

      {!user && !hasOwnerAccount ? (
        <section className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Create your sign-in</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            You signed in with the studio password. Create your own email sign-in to become this studio&rsquo;s owner. The studio password keeps working as a backup.
          </p>
          <ClaimForm />
        </section>
      ) : null}

      {owner ? (
        <section className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Studio</h2>
          <StudioForm name={studio.name} email={studio.email} />
        </section>
      ) : null}

      <section className="stack" style={{ gap: 16 }}>
        <h2 className="h3">Team</h2>
        {team.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No one has an email sign-in for this studio yet.</p>
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
                          <ConfirmButton message={`Remove ${t.name} from the team? They'll no longer see any projects.`}>Remove</ConfirmButton>
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

      {owner ? (
        <section className="stack" style={{ gap: 16 }}>
          <h2 className="h3">Invite someone</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
            Make a link and send it to the person you want on the team. They create a sign-in from it and can then upload and manage every project. Each link works once and lasts 14 days.
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
      ) : null}
    </main>
  );
}
