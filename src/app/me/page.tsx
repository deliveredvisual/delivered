import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { currentStudio, currentUser, isExpired } from "@/lib/auth";
import { db } from "@/lib/env";
import { fileUrl } from "@/lib/urls";
import { formatDate } from "@/lib/format";
import { projects, savedDeliveries, studios } from "@/db/schema";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: "Your deliveries" };

/** A signed-in client's home: every delivery they've opened, newest first. */
export default async function MyDeliveries() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/me");
  if (await currentStudio()) redirect("/admin");

  const rows = await db()
    .select({
      project: projects,
      studio: studios.name,
      cover: sql<string | null>`(select coalesce(p.thumb_key, null) from photos p where p.project_id = "projects"."id" and p.thumb_key is not null order by p.sort, p.filename limit 1)`,
    })
    .from(savedDeliveries)
    .innerJoin(projects, eq(projects.id, savedDeliveries.projectId))
    .innerJoin(studios, eq(studios.id, projects.studioId))
    .where(eq(savedDeliveries.userId, user.id))
    .orderBy(desc(savedDeliveries.savedAt));

  return (
    <>
      <header className="topbar">
        <div className="wordmark">
          Delivered <span className="light">Visual</span>
        </div>
        <div className="row small">
          <span className="muted">{user.name}{user.company ? ` · ${user.company}` : ""}</span>
          <form action={logout}>
            <button type="submit" className="btn btn-small">Sign out</button>
          </form>
        </div>
      </header>
      <main className="wrap stack" style={{ paddingTop: 48, gap: 8 }}>
        <h1 className="h2" style={{ fontSize: 40 }}>Your deliveries</h1>
        {rows.length === 0 ? (
          <div className="notice" style={{ marginTop: 20, maxWidth: 560 }}>
            Nothing here yet. When a studio sends you a delivery link, open it while you&rsquo;re signed in and it will be saved here.
          </div>
        ) : (
          <div className="photo-grid">
            {rows.map(({ project: p, studio, cover }) => {
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
                    <Link href={`/p/${p.slug}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 15 }}>{p.title}</Link>
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
