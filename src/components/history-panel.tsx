import Link from "next/link";
import { describeEvent, eventFiles, foldHistory, loadHistory, type Side } from "@/lib/history";
import { HistoryList } from "./history-list";

const PAGE = 80;

/**
 * History with an Everyone / Client / Studio filter and "Show older". Used on a project's History tab and on the
 * all-projects History page. `base` is the page's own address including any fixed query (e.g. "?tab=history").
 */
export async function HistoryPanel({
  studioId,
  projectId,
  base,
  side,
  before,
}: {
  studioId: string;
  projectId?: string;
  base: string;
  side?: string;
  before?: string;
}) {
  const filter: Side | undefined = side === "client" || side === "studio" ? side : undefined;
  const beforeMs = Number(before) || undefined;
  const rows = await loadHistory({ studioId, projectId, side: filter, before: beforeMs, limit: PAGE + 1 });
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const join = base.includes("?") ? "&" : "?";
  const href = (s?: Side, b?: number) => base + [s ? `side=${s}` : "", b ? `before=${b}` : ""].filter(Boolean).map((x, i) => (i === 0 ? join : "&") + x).join("");

  return (
    <div className="stack" style={{ gap: 20 }}>
      <nav className="chips" aria-label="Show">
        {([
          [undefined, "Everyone"],
          ["client", "Clients"],
          ["studio", "Studio"],
        ] as [Side | undefined, string][]).map(([s, label]) => (
          <Link key={label} href={href(s)} className="btn btn-small pill" aria-pressed={filter === s} scroll={false}>
            {label}
          </Link>
        ))}
      </nav>
      <HistoryList
        items={foldHistory(page).map((e) => ({
          id: e.id,
          side: e.side,
          text: describeEvent(e),
          files: eventFiles(e),
          at: e.createdAt.getTime(),
          project: projectId ? undefined : { title: e.projectTitle, href: `/admin/p/${e.projectId}?tab=history` },
        }))}
        empty={
          beforeMs
            ? "Nothing older."
            : filter === "studio"
              ? "No changes by the studio yet."
              : filter === "client"
                ? "Nothing from clients yet. Views, selects, comments, approvals and downloads show up here."
                : "Nothing yet. Uploads, changes, views, selects, comments and downloads all show up here."
        }
      />
      <div className="row">
        {beforeMs ? <Link href={href(filter)} className="btn btn-small" scroll={false}>Back to newest</Link> : null}
        {more ? <Link href={href(filter, page.at(-1)!.createdAt.getTime())} className="btn btn-small" scroll={false}>Show older</Link> : null}
      </div>
    </div>
  );
}
