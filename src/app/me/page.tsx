import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { isExpired, requireOrg } from "@/lib/auth";
import { db } from "@/lib/env";
import { fileUrl } from "@/lib/urls";
import { formatDate } from "@/lib/format";
import { orgDeliveries, projects, studios } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { activateSide } from "../team/actions";

export const metadata: Metadata = { title: "Deliveries" };

/** The client dashboard: every delivery shared with this organisation, newest first. */
export default async function MyDeliveries() {
  const s = await requireOrg();
  const org = s.studio;

  if (!org.client) {
    return (
      <>
        <AppHeader s={s} view="client" />
        <main className="wrap stack" style={{ paddingTop: 48, gap: 20, maxWidth: 640 }}>
          <h1 className="h2" style={{ fontSize: 40 }}>Client dashboard</h1>
          <p className="muted" style={{ margin: 0 }}>
            Receive deliveries from other studios here: everyone at {org.name} sees them, and you can chat, pick selects, sort into folders and download.
          </p>
          {s.role === "owner" ? (
            <form action={activateSide.bind(null, "client")}>
              <button type="submit" className="btn btn-primary">Turn on the client dashboard</button>
            </form>
          ) : (
            <div className="notice">Ask the owner of {org.name} to turn it on, on the Team page.</div>
          )}
        </main>
      </>
    );
  }

  const rows = await db()
    .select({
      project: projects,
      studio: studios.name,
      addedBy: orgDeliveries.addedBy,
      openedAt: orgDeliveries.openedAt,
      cover: sql<string | null>`(select coalesce(p.thumb_key, null) from photos p where p.project_id = "projects"."id" and p.thumb_key is not null order by p.sort, p.filename limit 1)`,
    })
    .from(orgDeliveries)
    .innerJoin(projects, eq(projects.id, orgDeliveries.projectId))
    .innerJoin(studios, eq(studios.id, projects.studioId))
    .where(eq(orgDeliveries.orgId, org.id))
    .orderBy(desc(orgDeliveries.savedAt));

  return (
    <>
      <AppHeader s={s} view="client" />
      <main className="wrap stack" style={{ paddingTop: 48, gap: 8 }}>
        <h1 className="h2" style={{ fontSize: 40 }}>Deliveries</h1>
        <p className="small muted" style={{ margin: 0 }}>Sent to {org.name}. Everyone on your team sees these.</p>
        {rows.length === 0 ? (
          <div className="notice" style={{ marginTop: 20, maxWidth: 560 }}>
            Nothing here yet. When a studio adds {org.name} to a delivery it appears here, and so does any delivery link someone on your team opens while signed in.
          </div>
        ) : (
          <div className="photo-grid">
            {rows.map(({ project: p, studio, cover, openedAt }) => {
              const gone = isExpired(p);
              return (
                <figure key={p.id} className="tile">
                  <Link href={`/p/${p.slug}`} className="tile-media" style={{ display: "block" }} aria-label={p.title}>
                    {cover && !gone ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(cover)} alt="" loading="lazy" style={{ cursor: "pointer" }} />
                    ) : (
                      <span className="noimg small muted">{gone ? "Archived" : "No photos"}</span>
                    )}
                  </Link>
                  <figcaption className="stack" style={{ gap: 4 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <Link href={`/p/${p.slug}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 15 }}>{p.title}</Link>
                      {!openedAt && !gone ? <span className="badge">New</span> : null}
                    </span>
                    <span className="tile-cap" style={{ justifyContent: "flex-start" }}>
                      {studio}
                      {gone ? " · archived" : ` · live until ${formatDate(p.expiresAt)}`}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
