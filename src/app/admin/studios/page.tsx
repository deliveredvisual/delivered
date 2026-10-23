import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { isSiteOwner } from "@/lib/auth";
import { db } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { DEFAULT_STUDIO_ID, studios } from "@/db/schema";
import { setStudioStatus } from "./actions";

export const metadata: Metadata = { title: "Studios" };

/** Site owner only: every creative who has signed up, and switching their studio on. */
export default async function StudiosPage() {
  if (!(await isSiteOwner())) notFound();
  const rows = await db()
    .select({
      studio: studios,
      owner: sql<string | null>`(select u.name || ' · ' || u.email from memberships m join users u on u.id = m.user_id where m.studio_id = "studios"."id" and m.role = 'owner' limit 1)`,
      people: sql<number>`(select count(*) from memberships m where m.studio_id = "studios"."id")`,
      projects: sql<number>`(select count(*) from projects p where p.studio_id = "studios"."id")`,
    })
    .from(studios)
    .orderBy(sql`case when ${studios.status} = 'pending' then 0 else 1 end`, desc(studios.createdAt));
  const waiting = rows.filter((r) => r.studio.status === "pending").length;

  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 28 }}>
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="h2" style={{ fontSize: 40 }}>Studios</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          Creatives who sign up get a studio that waits here until you switch it on, so nobody can upload to your storage without your say-so.
          {waiting ? ` ${waiting} waiting.` : ""}
        </p>
      </div>
      <div className="table-box">
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr><th scope="col">Studio</th><th scope="col">Owner</th><th scope="col">Signed up</th><th scope="col">Size</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {rows.map(({ studio: s, owner, people, projects }) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td className="small">{owner ?? <span className="muted">—</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}>{formatDate(s.createdAt)}</td>
                <td className="small">{Number(people)} people · {Number(projects)} projects</td>
                <td>
                  {s.id === DEFAULT_STUDIO_ID ? (
                    <span className="muted">Your studio</span>
                  ) : s.status === "pending" ? (
                    <form action={setStudioStatus.bind(null, s.id, "active")}>
                      <button type="submit" className="btn btn-small btn-primary">Approve</button>
                    </form>
                  ) : (
                    <form action={setStudioStatus.bind(null, s.id, "pending")} className="row" style={{ gap: 10 }}>
                      <span className="good">Active</span>
                      <button type="submit" className="btn btn-small">Pause</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
