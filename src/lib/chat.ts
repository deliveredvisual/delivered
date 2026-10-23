import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./env";
import type { ChatMessage, FolderView, PinView } from "./chat-types";
import { clientFolderPhotos, clientFolders, filmVersions, films, messages, photos, type Pin } from "@/db/schema";

const MAX_PINS = 24;

/** Keeps only pins that point at this project's own photos and films. */
export async function cleanPins(projectId: string, raw: unknown): Promise<Pin[]> {
  if (!Array.isArray(raw)) return [];
  const wanted = raw.slice(0, MAX_PINS).filter((p): p is Pin => !!p && typeof p === "object" && (p.type === "photo" || p.type === "film") && typeof p.id === "string");
  const photoIds = wanted.filter((p) => p.type === "photo").map((p) => p.id);
  const filmIds = wanted.filter((p) => p.type === "film").map((p) => p.id);
  const d = db();
  const [okPhotos, okFilms, okVersions] = await Promise.all([
    photoIds.length ? d.select({ id: photos.id }).from(photos).where(and(eq(photos.projectId, projectId), inArray(photos.id, photoIds))) : [],
    filmIds.length ? d.select({ id: films.id }).from(films).where(and(eq(films.projectId, projectId), inArray(films.id, filmIds))) : [],
    filmIds.length ? d.select({ id: filmVersions.id, filmId: filmVersions.filmId }).from(filmVersions).where(inArray(filmVersions.filmId, filmIds)) : [],
  ]);
  const photoOk = new Set(okPhotos.map((r) => r.id));
  const filmOk = new Set(okFilms.map((r) => r.id));
  const out: Pin[] = [];
  const seen = new Set<string>();
  for (const p of wanted) {
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    if (p.type === "photo" && photoOk.has(p.id)) out.push({ type: "photo", id: p.id });
    if (p.type === "film" && filmOk.has(p.id)) {
      const pin: Pin = { type: "film", id: p.id };
      if (p.versionId && okVersions.some((v) => v.id === p.versionId && v.filmId === p.id)) pin.versionId = p.versionId;
      const tc = Number(p.timecode);
      if (Number.isFinite(tc) && tc >= 0) pin.timecode = Math.round(tc);
      out.push(pin);
    }
  }
  return out;
}

export async function loadMessages(projectId: string): Promise<ChatMessage[]> {
  const d = db();
  const rows = await d.select().from(messages).where(eq(messages.projectId, projectId)).orderBy(asc(messages.createdAt)).limit(1000);
  const photoIds = [...new Set(rows.flatMap((m) => m.pins.filter((p) => p.type === "photo").map((p) => p.id)))];
  const filmIds = [...new Set(rows.flatMap((m) => m.pins.filter((p) => p.type === "film").map((p) => p.id)))];
  const [photoRows, filmRows, versionRows] = await Promise.all([
    photoIds.length ? d.select({ id: photos.id, filename: photos.filename, thumbKey: photos.thumbKey }).from(photos).where(inArray(photos.id, photoIds)) : [],
    filmIds.length ? d.select({ id: films.id, title: films.title }).from(films).where(inArray(films.id, filmIds)) : [],
    filmIds.length
      ? d.select({ id: filmVersions.id, filmId: filmVersions.filmId, version: filmVersions.version, posterKey: filmVersions.posterKey }).from(filmVersions).where(inArray(filmVersions.filmId, filmIds)).orderBy(asc(filmVersions.version))
      : [],
  ]);
  const photoMap = new Map(photoRows.map((r) => [r.id, r]));
  const filmMap = new Map(filmRows.map((r) => [r.id, r]));
  return rows.map((m) => ({
    id: m.id,
    author: m.author,
    fromStudio: m.fromStudio,
    body: m.body,
    at: m.createdAt.getTime(),
    pins: m.pins.flatMap((p): PinView[] => {
      if (p.type === "photo") {
        const ph = photoMap.get(p.id);
        return ph ? [{ type: "photo", id: p.id, label: ph.filename, thumbKey: ph.thumbKey }] : [];
      }
      const f = filmMap.get(p.id);
      if (!f) return [];
      const versions = versionRows.filter((v) => v.filmId === p.id);
      const v = versions.find((x) => x.id === p.versionId) ?? versions.at(-1);
      return [{ type: "film", id: p.id, label: f.title, thumbKey: v?.posterKey ?? null, versionId: v?.id, version: v?.version, timecode: p.timecode }];
    }),
  }));
}

export async function loadClientFolders(projectId: string): Promise<FolderView[]> {
  const d = db();
  const folders = await d.select().from(clientFolders).where(eq(clientFolders.projectId, projectId)).orderBy(asc(clientFolders.createdAt));
  if (!folders.length) return [];
  const links = await d
    .select()
    .from(clientFolderPhotos)
    .where(inArray(clientFolderPhotos.folderId, folders.map((f) => f.id)))
    .orderBy(asc(clientFolderPhotos.addedAt));
  return folders.map((f) => ({ id: f.id, name: f.name, createdBy: f.createdBy, photoIds: links.filter((l) => l.folderId === f.id).map((l) => l.photoId) }));
}
