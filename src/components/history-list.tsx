"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

export type HistoryItem = {
  id: string;
  side: "client" | "studio";
  text: string;
  files: string;
  at: number;
  project?: { title: string; href: string };
};

/** Times are shown in the reader's own time zone, so they are formatted in the browser. */
const noop = () => () => {};
function useLocal() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** A delivery's history, grouped by day, newest first. */
export function HistoryList({ items, empty }: { items: HistoryItem[]; empty: string }) {
  const local = useLocal();
  if (!items.length) return <p className="muted small" style={{ margin: 0 }}>{empty}</p>;
  const groups: { label: string; key: string; items: HistoryItem[] }[] = [];
  for (const it of items) {
    const key = local ? new Date(it.at).toDateString() : new Date(it.at).toISOString().slice(0, 10);
    const g = groups.at(-1);
    if (g && g.key === key) g.items.push(it);
    else groups.push({ key, label: local ? dayLabel(it.at) : key, items: [it] });
  }
  return (
    <div className="history">
      {groups.map((g) => (
        <section key={g.key} className="history-day">
          <h3 className="h3 history-date">{g.label}</h3>
          <ul className="history-list">
            {g.items.map((it) => (
              <li key={it.id} className="history-item">
                <span className={`history-tag ${it.side}`}>{it.side === "studio" ? "Studio" : "Client"}</span>
                <span className="history-text">
                  <span>{it.text}</span>
                  {it.files ? <span className="mono muted history-files">{it.files}</span> : null}
                  {it.project ? (
                    <Link href={it.project.href} className="small muted history-project">{it.project.title}</Link>
                  ) : null}
                </span>
                <time className="small muted history-time" dateTime={new Date(it.at).toISOString()} suppressHydrationWarning>
                  {local ? new Date(it.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
