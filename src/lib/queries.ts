import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./env";
import { comments, events, films, filmVersions, photos, picks, projects, sets } from "@/db/schema";
import { newId } from "./crypto";

export type ProjectSummary = Awaited<ReturnType<typeof listProjects>>[number];

export async function listProjects() {
  const d = db();
  const rows = await d
    .select({
      project: projects,
      photoCount: sql<number>`(select count(*) from photos p where p.project_id = ${projects.id})`,
      photoBytes: sql<number>`(select coalesce(sum(p.size + p.raw_size), 0) from photos p where p.project_id = ${projects.id})`,
      filmCount: sql<number>`(select count(*) from films f where f.project_id = ${projects.id})`,
      filmBytes: sql<number>`(select coalesce(sum(v.size), 0) from film_versions v join films f on f.id = v.film_id where f.project_id = ${projects.id})`,
    })
    .from(projects)
    .orderBy(desc(projects.createdAt));

  const latest = await d
    .select({ projectId: events.projectId, viewer: events.viewer, action: events.action, detail: events.detail, createdAt: events.createdAt })
    .from(events)
    .where(
      sql`${events.createdAt} = (select max(e2.created_at) from events e2 where e2.project_id = ${events.projectId})`,
    );
  const byProject = new Map(latest.map((e) => [e.projectId, e]));

  return rows.map((r) => ({ ...r, latest: byProject.get(r.project.id) ?? null }));
}

export async function getProjectFull(projectId: string) {
  const d = db();
  const project = await d.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return null;
  const [setRows, photoRows, filmRows] = await Promise.all([
    d.select().from(sets).where(eq(sets.projectId, projectId)).orderBy(asc(sets.sort), asc(sets.name)),
    d.select().from(photos).where(eq(photos.projectId, projectId)).orderBy(asc(photos.sort), asc(photos.filename)),
    d.select().from(films).where(eq(films.projectId, projectId)).orderBy(asc(films.sort), asc(films.createdAt)),
  ]);
  const versionRows = filmRows.length
    ? await d
        .select()
        .from(filmVersions)
        .where(sql`${filmVersions.filmId} in (select id from films where project_id = ${projectId})`)
        .orderBy(asc(filmVersions.version))
    : [];
  const openComments = versionRows.length
    ? await d
        .select({ versionId: comments.versionId, n: sql<number>`count(*)` })
        .from(comments)
        .where(and(eq(comments.resolved, false), sql`${comments.versionId} in (select v.id from film_versions v join films f on f.id = v.film_id where f.project_id = ${projectId})`))
        .groupBy(comments.versionId)
    : [];
  const openByVersion = new Map(openComments.map((c) => [c.versionId, Number(c.n)]));
  const filmsWithVersions = filmRows.map((f) => {
    const versions = versionRows.filter((v) => v.filmId === f.id);
    const current = versions.filter((v) => v.fileKey).at(-1) ?? null;
    return { ...f, versions, current, openComments: current ? openByVersion.get(current.id) ?? 0 : 0 };
  });
  return { project, sets: setRows, photos: photoRows, films: filmsWithVersions };
}

export async function picksFor(projectId: string) {
  return db().select().from(picks).where(eq(picks.projectId, projectId));
}

export async function recentEvents(projectId: string, limit = 30) {
  return db()
    .select()
    .from(events)
    .where(eq(events.projectId, projectId))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function logEvent(projectId: string, viewer: string, action: string, detail = "") {
  await db()
    .insert(events)
    .values({ id: newId(), projectId, viewer, action, detail, createdAt: new Date() });
}

/** Human sentence for the activity feed. */
export function describeEvent(e: { viewer: string; action: string; detail: string }): string {
  const who = e.viewer || "Someone";
  switch (e.action) {
    case "view":
      return `${who} opened the delivery`;
    case "view_film":
      return `${who} watched ${e.detail}`;
    case "pick":
      return `${who} picked ${e.detail}`;
    case "unpick":
      return `${who} removed ${e.detail} from selects`;
    case "download":
      return `${who} downloaded ${e.detail}`;
    case "comment":
      return `${who} commented on ${e.detail}`;
    case "approve":
      return `${who} approved ${e.detail}`;
    default:
      return `${who}: ${e.action} ${e.detail}`.trim();
  }
}
