"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { enableSide, normaliseEmail, requireActiveStudio, requireProject, validEmail } from "@/lib/auth";
import { logEvent, logStudio } from "@/lib/history";
import { bucket, db } from "@/lib/env";
import { hashPassword, newId, newSlug } from "@/lib/crypto";
import { DAY, DELIVERY_DAYS, formatDate, plural } from "@/lib/format";
import { comments, films, filmVersions, memberships, orgDeliveries, photos, projects, sets, studios, users, type Project } from "@/db/schema";
import { LANDING_LAYOUTS, LANDING_SPACING, validHex } from "@/lib/landing";

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
  await logStudio(id, "create");
  revalidatePath("/admin");
  redirect(`/admin/p/${id}`);
}

/** Names of the settings that differ, in plain words, for the history. */
const FIELD_NAMES: Record<string, string> = {
  title: "title",
  clientName: "client",
  category: "type of work",
  shotDate: "shot date",
  nda: "NDA mode",
  rawEnabled: "RAW downloads",
  licenceUsage: "licence",
  licenceTerritory: "licence",
  licenceTerm: "licence",
  licenceCredit: "licence",
  licenceTerms: "licence",
};

export async function updateProject(projectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { project: before } = await requireProject(projectId);
  const fields = projectFields(form);
  if (!fields.title) return { error: "Give the project a title." };
  const password = str(form, "password", 200);
  const clearPassword = bool(form, "clearPassword");
  const update: Partial<typeof projects.$inferInsert> = { ...fields };
  if (clearPassword) update.passwordHash = null;
  else if (password) update.passwordHash = await hashPassword(password);
  await db().update(projects).set(update).where(eq(projects.id, projectId));
  const changed = new Set<string>();
  for (const [k, v] of Object.entries(fields)) {
    if ((before as Record<string, unknown>)[k] !== v && FIELD_NAMES[k]) changed.add(FIELD_NAMES[k]);
  }
  if (clearPassword && before.passwordHash) changed.add("password removed");
  else if (password) changed.add(before.passwordHash ? "new password" : "password added");
  if (changed.size) await logStudio(projectId, "edit", [...changed].join(", "));
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
  await logStudio(projectId, archived ? "archive" : "restore", update.expiresAt ? `live until ${formatDate(update.expiresAt)}` : "");
  revalidatePath(`/admin/p/${projectId}`);
  revalidatePath("/admin");
}

export async function extendProject(projectId: string, days: number) {
  await requireProject(projectId);
  await db()
    .update(projects)
    .set({ expiresAt: sql`${projects.expiresAt} + ${days * DAY}` })
    .where(eq(projects.id, projectId));
  const p = await db().query.projects.findFirst({ where: eq(projects.id, projectId) });
  await logStudio(projectId, "extend", `${plural(days, "day")} more, live until ${p ? formatDate(p.expiresAt) : ""}`);
  revalidatePath(`/admin/p/${projectId}`);
  revalidatePath("/admin");
}

export async function newLink(projectId: string) {
  await requireProject(projectId);
  await db().update(projects).set({ slug: newSlug() }).where(eq(projects.id, projectId));
  await logStudio(projectId, "relink");
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

// ---------- Clients with access ----------

export type InviteState = { error: string; added?: string };

/**
 * Shares a delivery with a client's organisation, found by the email of anyone in it: it appears on the client
 * dashboard of everyone there (and anyone who joins later) and opens without the link or password.
 */
export async function inviteClient(projectId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const { s } = await requireProject(projectId);
  const email = normaliseEmail(str(form, "email", 200));
  if (!validEmail(email)) return { error: "Enter your client's email address." };
  const user = await db().query.users.findFirst({ where: eq(users.email, email) });
  const member = user ? await db().query.memberships.findFirst({ where: eq(memberships.userId, user.id) }) : null;
  if (!user || !member) {
    return {
      error:
        "No account uses that email yet. Send them the client link instead: once they create an account and open it while signed in, it stays on their dashboard.",
    };
  }
  if (member.studioId === s.studio.id) return { error: "That's someone in your own organisation." };
  const org = await db().query.studios.findFirst({ where: eq(studios.id, member.studioId) });
  if (!org) return { error: "Couldn't find their organisation." };
  const existing = await db().query.orgDeliveries.findFirst({
    where: and(eq(orgDeliveries.orgId, org.id), eq(orgDeliveries.projectId, projectId)),
  });
  if (existing) return { error: `${org.name} already has this delivery.` };
  const by = s.user?.name || s.studio.name;
  await db().insert(orgDeliveries).values({ orgId: org.id, projectId, savedAt: new Date(), addedBy: by });
  // Being sent a delivery switches on their client dashboard, so they can see it.
  if (!org.client) await enableSide(org.id, "client");
  await logEvent(projectId, by, "invite", org.name, { side: "studio" });
  revalidatePath(`/admin/p/${projectId}`);
  return { error: "", added: org.name };
}

export async function removeClientAccess(projectId: string, orgId: string) {
  await requireProject(projectId);
  const org = await db().query.studios.findFirst({ where: eq(studios.id, orgId) });
  await db().delete(orgDeliveries).where(and(eq(orgDeliveries.projectId, projectId), eq(orgDeliveries.orgId, orgId)));
  if (org) await logStudio(projectId, "uninvite", org.name);
  revalidatePath(`/admin/p/${projectId}`);
}

// ---------- Landing page ----------

export type LandingState = { error: string; savedAt?: number };

export async function updateLanding(projectId: string, _prev: LandingState, form: FormData): Promise<LandingState> {
  const { project: before } = await requireProject(projectId);
  const layout = str(form, "layout", 20);
  const spacing = str(form, "spacing", 20);
  const bg = str(form, "bg", 7);
  const cover = str(form, "cover", 20);
  if (!LANDING_LAYOUTS.some((l) => l.id === layout)) return { error: "Pick a layout." };
  if (!(spacing in LANDING_SPACING)) return { error: "Pick the spacing." };
  if (!validHex(bg)) return { error: "Pick a background colour." };
  let coverId: string | null = null;
  if (cover) {
    const ph = await db().query.photos.findFirst({ where: and(eq(photos.id, cover), eq(photos.projectId, projectId)) });
    coverId = ph ? ph.id : null;
  }
  const next = {
    landingLayout: layout as Project["landingLayout"],
    landingSpacing: spacing as Project["landingSpacing"],
    landingBg: bg.toLowerCase(),
    landingCoverId: coverId,
    landingIntro: str(form, "intro", 2000),
    landingGroupFolders: bool(form, "groupFolders"),
    landingTitleOnCover: bool(form, "titleOnCover"),
    landingCoverDim: Math.max(0, Math.min(80, Math.round(Number(str(form, "coverDim", 3)) || 0))),
  };
  await db().update(projects).set(next).where(eq(projects.id, projectId));
  const names: Record<keyof typeof next, string> = {
    landingLayout: "layout",
    landingSpacing: "spacing",
    landingBg: "background",
    landingCoverId: "cover photo",
    landingIntro: "note",
    landingGroupFolders: "sections",
    landingTitleOnCover: "title on cover",
    landingCoverDim: "cover darkening",
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => before[k] !== next[k]).map((k) => names[k]);
  if (changed.length) await logStudio(projectId, "landing", [...new Set(changed)].join(", "));
  revalidatePath(`/admin/p/${projectId}`);
  return { error: "", savedAt: Date.now() };
}

// ---------- Folders (called sets in the code) ----------

export async function addSet(projectId: string, form: FormData) {
  await requireProject(projectId);
  const name = str(form, "name", 60);
  if (!name) return;
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(sets).where(eq(sets.projectId, projectId));
  await db().insert(sets).values({ id: newId(), projectId, name, sort: Number(n) });
  await logStudio(projectId, "set_add", name);
  revalidatePath(`/admin/p/${projectId}`);
}

/** Saves the photo order (the full list of this project's photo ids, first to last). */
export async function reorderPhotos(projectId: string, photoIds: string[]) {
  await requireProject(projectId);
  const ids = photoIds.filter((x) => /^[a-z0-9]{16}$/.test(x)).slice(0, 20000);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const cases = sql.join(chunk.map((id, j) => sql`when ${id} then ${i + j}`), sql` `);
    await db()
      .update(photos)
      .set({ sort: sql`case ${photos.id} ${cases} else ${photos.sort} end` })
      .where(and(eq(photos.projectId, projectId), inArray(photos.id, chunk)));
  }
  if (ids.length) await logStudio(projectId, "reorder");
  revalidatePath(`/admin/p/${projectId}`);
}

/** Makes a new folder and moves the chosen photos into it. */
export async function createSetWithPhotos(projectId: string, name: string, photoIds: string[]) {
  await requireProject(projectId);
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(sets).where(eq(sets.projectId, projectId));
  const id = newId();
  await db().insert(sets).values({ id, projectId, name: clean, sort: Number(n) });
  if (photoIds.length) {
    await db()
      .update(photos)
      .set({ setId: id })
      .where(and(eq(photos.projectId, projectId), inArray(photos.id, photoIds.slice(0, 1000))));
  }
  await logStudio(projectId, "set_add", clean);
  if (photoIds.length) await logStudio(projectId, "move", clean, Math.min(photoIds.length, 1000));
  revalidatePath(`/admin/p/${projectId}`);
}

export async function renameSet(projectId: string, setId: string, form: FormData) {
  await requireProject(projectId);
  const name = str(form, "name", 60);
  if (!name) return;
  const old = await db().query.sets.findFirst({ where: and(eq(sets.id, setId), eq(sets.projectId, projectId)) });
  if (!old) return;
  await db().update(sets).set({ name }).where(and(eq(sets.id, setId), eq(sets.projectId, projectId)));
  if (old.name !== name) await logStudio(projectId, "set_rename", `${old.name} → ${name}`);
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteSet(projectId: string, setId: string) {
  await requireProject(projectId);
  const old = await db().query.sets.findFirst({ where: and(eq(sets.id, setId), eq(sets.projectId, projectId)) });
  if (!old) return;
  await db().update(photos).set({ setId: null }).where(and(eq(photos.setId, setId), eq(photos.projectId, projectId)));
  await db().delete(sets).where(and(eq(sets.id, setId), eq(sets.projectId, projectId)));
  await logStudio(projectId, "set_delete", old.name);
  revalidatePath(`/admin/p/${projectId}`);
}

export async function movePhotos(projectId: string, photoIds: string[], setId: string | null) {
  await requireProject(projectId);
  if (!photoIds.length) return;
  let setName = "";
  if (setId) {
    const set = await db().query.sets.findFirst({ where: and(eq(sets.id, setId), eq(sets.projectId, projectId)) });
    if (!set) return;
    setName = set.name;
  }
  await db()
    .update(photos)
    .set({ setId })
    .where(and(eq(photos.projectId, projectId), inArray(photos.id, photoIds.slice(0, 1000))));
  await logStudio(projectId, "move", setName, Math.min(photoIds.length, 1000));
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
  if (rows.length) await logStudio(projectId, "delete_photos", rows.slice(0, 6).map((r) => r.filename).join(", "), rows.length);
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
  await logStudio(projectId, "film_add", title);
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteFilm(projectId: string, filmId: string) {
  await requireProject(projectId);
  const film = await db().query.films.findFirst({ where: and(eq(films.id, filmId), eq(films.projectId, projectId)) });
  if (!film) return;
  await deletePrefix(`p/${projectId}/films/${filmId}/`);
  await db().delete(films).where(and(eq(films.id, filmId), eq(films.projectId, projectId)));
  await logStudio(projectId, "film_delete", film.title);
  revalidatePath(`/admin/p/${projectId}`);
}

export async function deleteVersion(projectId: string, versionId: string) {
  await requireProject(projectId);
  const rows = await db()
    .select({ v: filmVersions, title: films.title })
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
  await logStudio(projectId, "version_delete", `${rows[0].title} v${v.version}`);
  revalidatePath(`/admin/p/${projectId}`);
}
