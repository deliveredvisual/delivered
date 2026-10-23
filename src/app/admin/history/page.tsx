import type { Metadata } from "next";
import { requireStudio } from "@/lib/auth";
import { HistoryPanel } from "@/components/history-panel";

export const metadata: Metadata = { title: "History" };

/** Every change across all of this studio's deliveries, by the studio and by clients, newest first. */
export default async function HistoryPage({ searchParams }: PageProps<"/admin/history">) {
  const sp = await searchParams;
  const { studio } = await requireStudio();
  return (
    <main className="wrap stack" style={{ paddingTop: 40, gap: 20 }}>
      <h1 className="h2 page-title">History</h1>
      <p className="muted small" style={{ margin: 0, maxWidth: 640 }}>
        What has happened across all your projects: uploads and changes by you and your team, and views, selects, comments, approvals and downloads by clients.
      </p>
      <HistoryPanel
        studioId={studio.id}
        base="/admin/history"
        side={typeof sp.side === "string" ? sp.side : undefined}
        before={typeof sp.before === "string" ? sp.before : undefined}
      />
    </main>
  );
}
