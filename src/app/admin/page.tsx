import type { Metadata } from "next";
import Link from "next/link";
import { listProjects, describeEvent, type ProjectSummary } from "@/lib/queries";
import { requireStudio } from "@/lib/auth";
import { daysLeft, formatBytes, formatDate, plural, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Projects" };

type Filter = "live" | "soon" | "archived" | "all";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "soon", label: "Archiving soon" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

function status(p: ProjectSummary): "live" | "soon" | "archived" {
  const left = daysLeft(p.project.expiresAt);
  if (p.project.archived || left <= 0) return "archived";
  if (left <= 30) return "soon";
  return "live";
}

export default async function ProjectsPage({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.id === sp.f)?.id ?? "live") as Filter;
  const { studio } = await requireStudio();
  if (studio.status !== "active") {
    return (
      <main className="wrap stack" style={{ paddingTop: 48, gap: 20, maxWidth: 640 }}>
        <h1 className="h2" style={{ fontSize: 40 }}>Welcome to Delivered Visual</h1>
        <div className="notice">
          Your studio, <strong>{studio.name}</strong>, is waiting for approval. You&rsquo;ll be able to create deliveries as soon as it&rsquo;s switched on.
        </div>
      </main>
    );
  }
  const all = await listProjects(studio.id);
  const counts = {
    live: all.filter((p) => status(p) === "live").length,
    soon: all.filter((p) => status(p) === "soon").length,
    archived: all.filter((p) => status(p) === "archived").length,
    all: all.length,
  };
  const rows = all.filter((p) => filter === "all" || status(p) === filter || (filter === "live" && status(p) === "soon"));

  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 28 }}>
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <h1 className="h2" style={{ fontSize: 40 }}>Projects</h1>
        <Link href="/admin/new" className="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          New project
        </Link>
      </div>

      <nav className="row" aria-label="Filter projects" style={{ gap: 6 }}>
        {FILTERS.map((f) => (
          <Link key={f.id} href={`/admin?f=${f.id}`} className="btn btn-small pill" aria-pressed={filter === f.id}>
            {f.label} · {counts[f.id]}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="notice">
          {all.length === 0 ? (
            <>No projects yet. <Link href="/admin/new">Create your first delivery</Link>.</>
          ) : (
            "Nothing here."
          )}
        </div>
      ) : (
        <div className="table-box">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Shot</th>
                <th scope="col">Files</th>
                <th scope="col">Live for</th>
                <th scope="col">Invoice</th>
                <th scope="col">Latest activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.project;
                const st = status(r);
                const left = daysLeft(p.expiresAt);
                const files = [r.photoCount ? plural(Number(r.photoCount), "photo") : "", r.filmCount ? plural(Number(r.filmCount), "film") : ""]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/p/${p.id}`} style={{ textDecoration: "none", fontWeight: 500, fontSize: 15 }}>
                        {p.title}
                      </Link>
                      <div className="small muted" style={{ marginTop: 4 }}>{p.clientName || "No client set"}</div>
                      {p.nda ? <div className="badge" style={{ marginTop: 8 }}>NDA · no sharing</div> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.shotDate) || <span className="muted">—</span>}</td>
                    <td>
                      {files || <span className="muted">Empty</span>}
                      <div className="mono muted" style={{ marginTop: 4 }}>{formatBytes(Number(r.photoBytes) + Number(r.filmBytes))}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} className={st === "soon" ? "warn" : st === "archived" ? "muted" : ""}>
                      {st === "archived" ? "Archived" : plural(left, "day")}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }} className={p.invoicePaid ? "good" : "warn"}>
                      {p.invoicePaid ? "Paid" : p.holdUntilPaid ? "Unpaid · full-res held" : "Unpaid"}
                    </td>
                    <td className="small" style={{ color: "var(--ink-2)" }}>
                      {r.latest ? (
                        <>
                          {describeEvent(r.latest)}
                          <div className="muted">{timeAgo(r.latest.createdAt)}</div>
                        </>
                      ) : (
                        <span className="muted">Not opened yet</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
