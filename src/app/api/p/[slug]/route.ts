import { and, eq } from "drizzle-orm";
import { fail, json } from "@/lib/api";
import { getViewer, isAdmin, projectForViewer, setViewer } from "@/lib/auth";
import { db, studio } from "@/lib/env";
import { newId } from "@/lib/crypto";
import { logEvent } from "@/lib/queries";
import { formatTimecode } from "@/lib/format";
import { comments, films, filmVersions, photos, picks } from "@/db/schema";

type Body =
  | { op: "viewer"; name: string }
  | { op: "pick"; photoId: string; on: boolean }
  | { op: "event"; action: "download" | "view_film"; detail: string }
  | { op: "comment"; versionId: string; timecode: number; body: string; org?: string }
  | { op: "resolve"; commentId: string; resolved: boolean }
  | { op: "approve"; versionId: string };

/** Everything a client can do on a delivery: set their name, pick photos, comment on and approve films. */
export async function POST(request: Request, ctx: RouteContext<"/api/p/[slug]">): Promise<Response> {
  const { slug } = await ctx.params;
  const project = await projectForViewer(slug);
  if (!project) return fail("Not found", 404);
  const body = (await request.json()) as Body;
  const d = db();

  if (body.op === "viewer") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) return fail("Enter your name");
    await setViewer(name);
    return json({ ok: true, viewer: name });
  }

  const viewer = await getViewer();
  const admin = await isAdmin();
  if (!viewer) return fail("Name needed", 428);

  switch (body.op) {
    case "pick": {
      const photo = await d.query.photos.findFirst({ where: and(eq(photos.id, body.photoId), eq(photos.projectId, project.id)) });
      if (!photo) return fail("No such photo", 404);
      if (body.on) {
        await d
          .insert(picks)
          .values({ projectId: project.id, photoId: photo.id, viewer, createdAt: new Date() })
          .onConflictDoNothing();
      } else {
        await d.delete(picks).where(and(eq(picks.projectId, project.id), eq(picks.photoId, photo.id), eq(picks.viewer, viewer)));
      }
      if (!admin) await logEvent(project.id, viewer, body.on ? "pick" : "unpick", photo.filename);
      return json({ ok: true });
    }
    case "event": {
      if (!admin && (body.action === "download" || body.action === "view_film")) {
        await logEvent(project.id, viewer, body.action, String(body.detail ?? "").slice(0, 200));
      }
      return json({ ok: true });
    }
    case "comment": {
      const version = await versionInProject(body.versionId, project.id);
      if (!version) return fail("No such version", 404);
      const text = String(body.body ?? "").trim().slice(0, 2000);
      if (!text) return fail("Write a comment first");
      const row = {
        id: newId(),
        versionId: version.v.id,
        author: viewer,
        org: admin ? studio().name : String(body.org ?? "").trim().slice(0, 60),
        timecode: Math.max(0, Math.round(Number(body.timecode) || 0)),
        body: text,
        resolved: false,
        createdAt: new Date(),
      };
      await d.insert(comments).values(row);
      if (!admin) await logEvent(project.id, viewer, "comment", `${version.f.title} v${version.v.version} at ${formatTimecode(row.timecode)}`);
      return json({ ok: true, comment: row });
    }
    case "resolve": {
      const c = await d.query.comments.findFirst({ where: eq(comments.id, body.commentId) });
      if (!c || !(await versionInProject(c.versionId, project.id))) return fail("No such comment", 404);
      await d.update(comments).set({ resolved: !!body.resolved }).where(eq(comments.id, c.id));
      return json({ ok: true });
    }
    case "approve": {
      const version = await versionInProject(body.versionId, project.id);
      if (!version) return fail("No such version", 404);
      await d.update(filmVersions).set({ approvedAt: new Date(), approvedBy: viewer }).where(eq(filmVersions.id, version.v.id));
      if (!admin) await logEvent(project.id, viewer, "approve", `${version.f.title} v${version.v.version}`);
      return json({ ok: true });
    }
    default:
      return fail("Unknown op");
  }
}

async function versionInProject(versionId: string, projectId: string) {
  const rows = await db()
    .select({ v: filmVersions, f: films })
    .from(filmVersions)
    .innerJoin(films, eq(films.id, filmVersions.filmId))
    .where(and(eq(filmVersions.id, versionId), eq(films.projectId, projectId)))
    .limit(1);
  return rows[0] ?? null;
}
