"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireActiveStudio, requireProject } from "@/lib/auth";
import { bucket, db } from "@/lib/env";
import { hashPassword, newId, newSlug } from "@/lib/crypto";
import { DAY, DELIVERY_DAYS } from "@/lib/format";
import { comments, films, filmVersions, photos, projects, sets } from "@/db/schema";

export type FormState = { error: string };

function str(form: FormData, key: string, max = 500): string {
  return String(form.get(key) ?? "").trim().slice(0, max);
}
function bool(form: FormData, key: string): boolean {
  return form.get(key) === "on";
}

function projectFields(form: FormData) {
  return {
    title: str(form, "title", 140),
    clientName: str(form, "clientName", 140),
    category: str(form, "category", 80),
    shotDate: str(form, "shotDate", 10) || null,
    nda: bool(form, "nda"),
    rawEnabled: bool(form, "rawEnabled"),
    licenceUsage: str(form, "licenceUsage", 140),
    licenceTerritory: str(form, "licenceTerritory", 140),
    licenceTerm: str(form, "licenceTerm", 140),
    licenceCredit: str(form, "licenceCredit", 140),
    licenceTerms: str(form, "licenceTerms", 4000),
  };
}

export async function createProject(_prev: FormState, form: FormData): Promise<FormState> {
  const { studio } = await requireActiveStudio();
  const fields = projectFields(form);
  if (!fields.title) return { error: "Give the project a title." };
  const password = str(form, "password", 200);
  const now = new Date();
  const id = newId();
  await db()
    .insert(projects)
    .values({
      id,
      studioId: studio.id,
      slug: newSlug(),
      ...fields,
      passwordHash: password ? await hashPassword(password) : null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + DELIVERY_DAYS * DAY),
    });
  const setNames = str(form, "sets", 500)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (setNames.length) {
    await db()
      .insert(sets)
      .values(setNames.map((name, i) => ({ id: newId(), projectId: id, name, sort: i })));
  }
  revalidatePath("/admin");
  redirect(`/admin/p/${id}`);
}

export async function updateProject(projectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  await requireProject(projectId);
  const fields = projectFields(form);
  if (!fields.title) return { error: "Give the project a title." };
  const password = str(form, "password", 200);
  const clearPassword = bool(form, "clearPassword");
  const update: Partial<typeof projects.$inferInsert> = { ...fields };
  if (clearPassword) update.passwordHash = null;
  else if (password) update.passwordHash = await hashPassword(password);
  await db().update(projects).set(update).where(eq(projects.id, projectId));
  revalidatePath(`/admin/p/${projectId}`);
  revalidatePath("/admin");
  return { error: "" };
}

export async function setArchived(projectId: string, archived: boolean) {
  await requireProject(projectId);
  const update: Partial<typeof projects.$inferInsert> = { archived };
  // Restoring an expired delivery gives it another 30 days.
  if (!archived) {
    const p = await db().query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (p && p.expiresAt.getTime() < Date.now() + 30 * DAY) update.expiresAt = new Date(Date.now() + 30 * DAY);
  }
  await db().update(projects).set(update).where(eq(projects.id, projectId));
  revalidatePath(`/admin/p/${projectId}`);
  revalidatePath("/admin");
}

export async function extendProject(projectId: string, days: number) {
  await requireProject(projectId);
  await db()
    .update(projects)
    .set({ expiresAt: sql`${projects.expiresAt} + ${days * DAY}` })
    .where(eq(projects.id, projectId));
  revalidatePath(`/admin/p/${projectId}`);
  revalidatePath("/admin");
}

export async function newLink(projectId: string) {
  await requireProject(projectId);
  await db().update(projects).set({ slug: newSlug() }).where(eq(projects.id, projectId));
  revalidatePath(`/admin/p/${projectId}`);
}

async function deletePrefix(prefix: string) {
  const b = bucket();
  let cursor: string | undefined;
  do {
    const list = await b.list({ prefix, cursor, limit: 1000 });
    if (list.objects.length) await b.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}

export async function deleteProject(projectId: string) {
  await requireProject(projectId);
  await deletePrefix(`p/${projectId}/`);
  await db().delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/admin");
  redirect("/admin?f=all");
}

// ---------- Sets ----------

export async function addSet(projectId: string, form: FormData) {
  await requireProject(projectId);
  const name = str(form, "name", 60);
  if (!name) return;
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(sets).where(eq(sets.projectId, projectId));
  await db().insert(sets).values({ id: newId(), projectId, name, sort: Number(n) });
  revalidatePath(`/admin/p/${projectId}`);
}

export async function renameSet(projectId: string, setId: string, form: FormData) {
  await requireProject(projectId);
  const name = str(form, "name", 60);
  if (!name) return;
  await db().update(sets).set({ name }).where(and(eq(sets.id, setId), eq(sets.projectId, projectId)));
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteSet(projectId: string, setId: string) {
  await requireProject(projectId);
  await db().update(photos).set({ setId: null }).where(and(eq(photos.setId, setId), eq(photos.projectId, projectId)));
  await db().delete(sets).where(and(eq(sets.id, setId), eq(sets.projectId, projectId)));
  revalidatePath(`/admin/p/${projectId}`);
}

export async function movePhotos(projectId: string, photoIds: string[], setId: string | null) {
  await requireProject(projectId);
  if (!photoIds.length) return;
  if (setId) {
    const set = await db().query.sets.findFirst({ where: and(eq(sets.id, setId), eq(sets.projectId, projectId)) });
    if (!set) return;
  }
  await db()
    .update(photos)
    .set({ setId })
    .where(and(eq(photos.projectId, projectId), inArray(photos.id, photoIds.slice(0, 1000))));
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deletePhotos(projectId: string, photoIds: string[]) {
  await requireProject(projectId);
  if (!photoIds.length) return;
  const rows = await db()
    .select()
    .from(photos)
    .where(and(eq(photos.projectId, projectId), inArray(photos.id, photoIds.slice(0, 1000))));
  const keys = rows.flatMap((r) => [r.originalKey, r.previewKey, r.thumbKey, r.rawKey]).filter((k): k is string => !!k);
  for (let i = 0; i < keys.length; i += 1000) await bucket().delete(keys.slice(i, i + 1000));
  await db()
    .delete(photos)
    .where(inArray(photos.id, rows.map((r) => r.id)));
  revalidatePath(`/admin/p/${projectId}`);
}

// ---------- Films ----------

export async function addFilm(projectId: string, form: FormData) {
  await requireProject(projectId);
  const title = str(form, "title", 100);
  if (!title) return;
  const aspect = str(form, "aspect", 10) || "16:9";
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(films).where(eq(films.projectId, projectId));
  await db().insert(films).values({ id: newId(), projectId, title, aspect, sort: Number(n), createdAt: new Date() });
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteFilm(projectId: string, filmId: string) {
  await requireProject(projectId);
  await deletePrefix(`p/${projectId}/films/${filmId}/`);
  await db().delete(films).where(and(eq(films.id, filmId), eq(films.projectId, projectId)));
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteVersion(projectId: string, versionId: string) {
  await requireProject(projectId);
  const rows = await db()
    .select({ v: filmVersions })
    .from(filmVersions)
    .innerJoin(films, eq(films.id, filmVersions.filmId))
    .where(and(eq(filmVersions.id, versionId), eq(films.projectId, projectId)))
    .limit(1);
  const v = rows[0]?.v;
  if (!v) return;
  const keys = [v.fileKey, v.posterKey].filter((k): k is string => !!k);
  if (keys.length) await bucket().delete(keys);
  await db().delete(comments).where(eq(comments.versionId, versionId));
  await db().delete(filmVersions).where(eq(filmVersions.id, versionId));
  revalidatePath(`/admin/p/${projectId}`);
}
