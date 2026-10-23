import "server-only";
import { and, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "./env";
import { currentOrg } from "./auth";
import { events, projects } from "@/db/schema";
import { newId } from "./crypto";
import { plural } from "./format";

export type Side = "client" | "studio";
export type HistoryEvent = typeof events.$inferSelect;

/** Quick repeats of these (picking 20 photos, uploading 300) become one line: "picked 20 photos". */
export const MERGES = new Set(["pick", "unpick", "upload", "upload_raw", "reorder", "move", "delete_photos", "folder_add", "folder_remove", "landing", "edit"]);
const MERGE_WINDOW = 15 * 60 * 1000;

/**
 * Adds a line to a delivery's history. `count` is how many things the line is about (photos uploaded, moved…).
 * Repeats of the same action by the same person within 15 minutes are folded into the previous line.
 */
export async function logEvent(
  projectId: string,
  viewer: string,
  action: string,
  detail = "",
  opts: { side?: Side; count?: number } = {},
) {
  const side = opts.side ?? "client";
  const count = Math.max(1, Math.round(opts.count ?? 1));
  const d = db();
  const now = new Date();
  // Opening the delivery or watching a film is noted at most once an hour per person.
  if (action === "view" || action === "view_film") {
    const recent = await d
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.projectId, projectId), eq(events.action, action), eq(events.viewer, viewer), eq(events.detail, detail), gt(events.createdAt, new Date(now.getTime() - 3600_000))))
      .limit(1);
    if (recent.length) return;
  }
  if (MERGES.has(action)) {
    const [last] = await d
      .select()
      .from(events)
      .where(eq(events.projectId, projectId))
      .orderBy(desc(events.createdAt))
      .limit(1);
    if (last && last.action === action && last.viewer === viewer && last.side === side && now.getTime() - last.createdAt.getTime() < MERGE_WINDOW) {
      // Keep a short list of what it was about ("AP_0412.jpg, AP_0413.jpg, …"); the count says how many.
      const names = last.detail ? last.detail.split(", ") : [];
      if (detail && !names.includes(detail) && last.detail.length < 160 && action !== "move") names.push(detail);
      const keepDetail = action === "move" || action === "landing" || action === "edit" ? mergeList(last.detail, detail) : names.join(", ");
      await d
        .update(events)
        .set({ count: action === "landing" ? 1 : last.count + count, detail: keepDetail.slice(0, 400), createdAt: now })
        .where(eq(events.id, last.id));
      return;
    }
  }
  await d.insert(events).values({ id: newId(), projectId, viewer, side, action, detail: detail.slice(0, 400), count, createdAt: now });
}

/** For "edit"/"landing"/"move": a set of distinct names, e.g. the settings changed. */
function mergeList(a: string, b: string): string {
  const all = [...a.split(", "), ...b.split(", ")].filter(Boolean);
  return [...new Set(all)].join(", ");
}

/** Who on the studio side did this: their name, or the studio's when signed in with the backup password. */
export async function studioActor(): Promise<string> {
  const s = await currentOrg();
  return s?.user?.name || s?.studio.name || "Studio";
}

/** Logs something the studio did. */
export async function logStudio(projectId: string, action: string, detail = "", count = 1) {
  await logEvent(projectId, await studioActor(), action, detail, { side: "studio", count });
}

/** Logs that someone opened the delivery (at most once an hour each). */
export async function logView(projectId: string, viewer: string) {
  await logEvent(projectId, viewer, "view");
}

export type HistoryRow = HistoryEvent & { projectTitle: string };

/** A page of history, newest first: one delivery's, or every delivery of a studio's. */
export async function loadHistory(q: { studioId: string; projectId?: string; side?: Side; before?: number; limit?: number }): Promise<HistoryRow[]> {
  const limit = q.limit ?? 60;
  return db()
    .select({
      id: events.id,
      projectId: events.projectId,
      viewer: events.viewer,
      side: events.side,
      action: events.action,
      detail: events.detail,
      count: events.count,
      createdAt: events.createdAt,
      projectTitle: projects.title,
    })
    .from(events)
    .innerJoin(projects, eq(projects.id, events.projectId))
    .where(
      and(
        eq(projects.studioId, q.studioId),
        q.projectId ? eq(events.projectId, q.projectId) : undefined,
        q.side ? eq(events.side, q.side) : undefined,
        q.before ? lt(events.createdAt, new Date(q.before)) : undefined,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

/** How many lines of history a delivery has (for the tab count). */
export async function historyCount(projectId: string): Promise<number> {
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(events).where(eq(events.projectId, projectId));
  return Number(n);
}

const photosN = (n: number) => plural(n, "photo");

/**
 * Folds neighbouring lines of the same kind by the same person (e.g. photos uploaded side by side, which can't
 * always be merged as they're saved) into one, so the history reads "uploaded 40 photos" rather than 40 lines.
 */
export function foldHistory<T extends HistoryRow>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const prev = out.at(-1);
    if (
      prev &&
      MERGES.has(r.action) &&
      prev.action === r.action &&
      prev.viewer === r.viewer &&
      prev.side === r.side &&
      prev.projectId === r.projectId &&
      prev.createdAt.getTime() - r.createdAt.getTime() < MERGE_WINDOW
    ) {
      const names = [...new Set([...prev.detail.split(", "), ...r.detail.split(", ")].filter(Boolean))];
      out[out.length - 1] = { ...prev, count: r.action === "landing" ? 1 : prev.count + r.count, detail: names.join(", ").slice(0, 400) };
    } else out.push(r);
  }
  return out;
}

/** The sentence for one line of history, e.g. "Sarah Lee picked 12 photos". */
export function describeEvent(e: { viewer: string; action: string; detail: string; count?: number }): string {
  const who = e.viewer || "Someone";
  const n = e.count ?? 1;
  const d = e.detail;
  switch (e.action) {
    // Client side
    case "view":
      return `${who} opened the delivery`;
    case "view_film":
      return `${who} watched ${d}`;
    case "pick":
      return n > 1 ? `${who} selected ${photosN(n)}` : `${who} selected ${d}`;
    case "unpick":
      return n > 1 ? `${who} removed ${photosN(n)} from their selects` : `${who} removed ${d} from their selects`;
    case "download":
      return `${who} downloaded ${d}`;
    case "comment":
      return `${who} commented on ${d}`;
    case "approve":
      return `${who} approved ${d}`;
    case "unapprove":
      return `${who} undid their approval of ${d}`;
    case "message":
      return `${who} sent a message${d ? `: “${d}”` : ""}`;
    case "folder":
      return `${who} made a folder: ${d}`;
    case "folder_rename":
      return `${who} renamed a folder: ${d}`;
    case "folder_delete":
      return `${who} deleted the folder ${d}`;
    case "folder_add":
      return `${who} added ${photosN(n)} to ${d}`;
    case "folder_remove":
      return `${who} took ${photosN(n)} out of ${d}`;
    case "resolve":
      return `${who} marked a comment done on ${d}`;
    case "reopen":
      return `${who} reopened a comment on ${d}`;
    // Studio side
    case "create":
      return `${who} created the delivery`;
    case "edit":
      return `${who} changed the settings: ${d}`;
    case "extend":
      return `${who} extended the delivery: ${d}`;
    case "archive":
      return `${who} archived the delivery`;
    case "restore":
      return `${who} restored the delivery${d ? `: ${d}` : ""}`;
    case "relink":
      return `${who} made a new client link (the old one stopped working)`;
    case "invite":
      return `${who} added ${d} to this delivery`;
    case "uninvite":
      return `${who} removed ${d} from this delivery`;
    case "landing":
      return `${who} changed the landing page${d ? `: ${d}` : ""}`;
    case "upload":
      return `${who} uploaded ${photosN(n)}`;
    case "upload_raw":
      return `${who} added ${plural(n, "RAW file")}`;
    case "reorder":
      return `${who} changed the photo order`;
    case "move":
      return `${who} moved ${photosN(n)} to ${d || "no folder"}`;
    case "delete_photos":
      return `${who} deleted ${photosN(n)}`;
    case "set_add":
      return `${who} added the folder ${d}`;
    case "set_rename":
      return `${who} renamed a folder: ${d}`;
    case "set_delete":
      return `${who} deleted the folder ${d}`;
    case "film_add":
      return `${who} added the video ${d}`;
    case "film_delete":
      return `${who} deleted the video ${d}`;
    case "version":
      return `${who} uploaded ${d}`;
    case "version_delete":
      return `${who} deleted ${d}`;
    case "message_delete":
      return `${who} deleted a message`;
    default:
      return `${who}: ${e.action} ${d}`.trim();
  }
}

/** The file names behind a merged line, shown underneath it ("AP_0412.jpg, AP_0413.jpg…"). */
export function eventFiles(e: { action: string; detail: string; count: number }): string {
  if ((e.action === "pick" || e.action === "unpick") && e.count > 1) return e.detail + (e.detail.split(", ").length < e.count ? "…" : "");
  if ((e.action === "upload" || e.action === "upload_raw" || e.action === "delete_photos") && e.detail) return e.detail + (e.detail.split(", ").length < e.count ? "…" : "");
  return "";
}
