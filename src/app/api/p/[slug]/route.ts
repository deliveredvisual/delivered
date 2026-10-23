import { and, eq, inArray } from "drizzle-orm";
import { fail, json } from "@/lib/api";
import { currentUser, getViewer, managesProject, projectForViewer, setViewer, studioFor } from "@/lib/auth";
import { cleanPins, loadClientFolders, loadMessages } from "@/lib/chat";
import { db } from "@/lib/env";
import { newId } from "@/lib/crypto";
import { logEvent } from "@/lib/queries";
import { formatTimecode } from "@/lib/format";
import { clientFolderPhotos, clientFolders, comments, films, filmVersions, messages, photos, picks } from "@/db/schema";

type Body =
  | { op: "viewer"; name: string }
  | { op: "pick"; photoId: string; on: boolean }
  | { op: "event"; action: "download" | "view_film"; detail: string }
  | { op: "comment"; versionId: string; timecode: number; body: string; org?: string }
  | { op: "resolve"; commentId: string; resolved: boolean }
  | { op: "approve"; versionId: string }
  | { op: "unapprove"; versionId: string }
  | { op: "message"; body: string; pins?: unknown }
  | { op: "delete_message"; messageId: string }
  | { op: "folder_create"; name: string; photoIds?: string[] }
  | { op: "folder_rename"; folderId: string; name: string }
  | { op: "folder_delete"; folderId: string }
  | { op: "folder_add"; folderId: string; photoIds: string[] }
  | { op: "folder_remove"; folderId: string; photoIds: string[] };

/** Everything a client can do on a delivery: set their name, pick photos, comment on and approve films, chat, sort photos into folders. */
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

  const viewer = await getViewer(project);
  const admin = await managesProject(project);
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
        org: admin ? (await studioFor(project)).name : String(body.org ?? "").trim().slice(0, 60),
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
    case "unapprove": {
      const version = await versionInProject(body.versionId, project.id);
      if (!version) return fail("No such version", 404);
      await d.update(filmVersions).set({ approvedAt: null, approvedBy: null }).where(eq(filmVersions.id, version.v.id));
      if (!admin) await logEvent(project.id, viewer, "unapprove", `${version.f.title} v${version.v.version}`);
      return json({ ok: true });
    }
    case "message": {
      const text = String(body.body ?? "").trim().slice(0, 4000);
      const pins = await cleanPins(project.id, body.pins);
      if (!text && !pins.length) return fail("Write a message first");
      const user = admin ? await currentUser() : null;
      await d.insert(messages).values({
        id: newId(),
        projectId: project.id,
        author: admin ? user?.name || viewer : viewer,
        fromStudio: admin,
        body: text,
        pins,
        createdAt: new Date(),
      });
      if (!admin) await logEvent(project.id, viewer, "message", text.slice(0, 80));
      return json({ ok: true, messages: await loadMessages(project.id) });
    }
    case "delete_message": {
      if (!admin) return fail("Only the studio can delete messages", 403);
      await d.delete(messages).where(and(eq(messages.id, String(body.messageId)), eq(messages.projectId, project.id)));
      return json({ ok: true, messages: await loadMessages(project.id) });
    }
    case "folder_create": {
      const name = String(body.name ?? "").trim().slice(0, 60);
      if (!name) return fail("Name the folder");
      const id = newId();
      await d.insert(clientFolders).values({ id, projectId: project.id, name, createdBy: viewer, createdAt: new Date() });
      if (body.photoIds?.length) await addToFolder(id, project.id, body.photoIds);
      if (!admin) await logEvent(project.id, viewer, "folder", name);
      return json({ ok: true, id, folders: await loadClientFolders(project.id) });
    }
    case "folder_rename":
    case "folder_delete":
    case "folder_add":
    case "folder_remove": {
      const folder = await d.query.clientFolders.findFirst({ where: and(eq(clientFolders.id, String(body.folderId)), eq(clientFolders.projectId, project.id)) });
      if (!folder) return fail("No such folder", 404);
      if (body.op === "folder_rename") {
        const name = String(body.name ?? "").trim().slice(0, 60);
        if (!name) return fail("Name the folder");
        await d.update(clientFolders).set({ name }).where(eq(clientFolders.id, folder.id));
      } else if (body.op === "folder_delete") {
        await d.delete(clientFolders).where(eq(clientFolders.id, folder.id));
      } else if (body.op === "folder_add") {
        await addToFolder(folder.id, project.id, body.photoIds);
      } else {
        const ids = (Array.isArray(body.photoIds) ? body.photoIds : []).slice(0, 2000).map(String);
        if (ids.length) await d.delete(clientFolderPhotos).where(and(eq(clientFolderPhotos.folderId, folder.id), inArray(clientFolderPhotos.photoId, ids)));
      }
      return json({ ok: true, folders: await loadClientFolders(project.id) });
    }
    default:
      return fail("Unknown op");
  }
}

/** Adds this project's photos (ignoring any others) to a client folder. */
async function addToFolder(folderId: string, projectId: string, photoIds: unknown) {
  const ids = (Array.isArray(photoIds) ? photoIds : []).slice(0, 2000).map(String);
  if (!ids.length) return;
  const d = db();
  const own: string[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await d.select({ id: photos.id }).from(photos).where(and(eq(photos.projectId, projectId), inArray(photos.id, ids.slice(i, i + 90))));
    own.push(...rows.map((r) => r.id));
  }
  const now = Date.now();
  for (let i = 0; i < own.length; i += 30) {
    await d
      .insert(clientFolderPhotos)
      .values(own.slice(i, i + 30).map((photoId, j) => ({ folderId, photoId, addedAt: new Date(now + i + j) })))
      .onConflictDoNothing();
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
