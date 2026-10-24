import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { bucket, db, env } from "../env";
import { newId, seal, unseal } from "../crypto";
import { cloudFolders, cloudJobs, cloudLinks, films, filmVersions, photos, projects, sets, type CloudJob, type CloudLink, type CloudProvider } from "@/db/schema";
import {
  AuthError,
  RetryError,
  chunkSize,
  cleanName,
  dropboxCreateFolder,
  dropboxPiece,
  driveCreateFolder,
  drivePiece,
  providerName,
  refreshAccess,
} from "./providers";

/**
 * Copying uploads to Dropbox / Google Drive, one way. Each upload adds a job per connected service; jobs are worked
 * through in the background (every minute, right after an upload, and while someone has the project page open),
 * one piece of up to 32 MB at a time, so a 5 GB video simply takes more turns.
 */

const LEASE = 90_000;
const MAX_ATTEMPTS = 8;
const secret = () => env().SESSION_SECRET;

// ---------- Connections ----------

export async function linksFor(studioId: string): Promise<CloudLink[]> {
  return db().select().from(cloudLinks).where(eq(cloudLinks.studioId, studioId));
}

export async function saveLink(studioId: string, provider: CloudProvider, t: { access: string; expiresIn: number; refresh: string }, account: string, by: string) {
  const row = {
    studioId,
    provider,
    account,
    refreshToken: await seal(t.refresh, secret()),
    accessToken: await seal(t.access, secret()),
    accessExpires: new Date(Date.now() + (t.expiresIn - 120) * 1000),
    rootId: null,
    connectedBy: by,
    error: null,
    createdAt: new Date(),
  };
  await db()
    .insert(cloudLinks)
    .values(row)
    .onConflictDoUpdate({ target: [cloudLinks.studioId, cloudLinks.provider], set: { ...row, rootId: sql`${cloudLinks.rootId}` } });
}

export async function removeLink(studioId: string, provider: CloudProvider) {
  await db().delete(cloudLinks).where(and(eq(cloudLinks.studioId, studioId), eq(cloudLinks.provider, provider)));
  // Copies still waiting would have nowhere to go.
  await db().delete(cloudJobs).where(and(eq(cloudJobs.studioId, studioId), eq(cloudJobs.provider, provider), eq(cloudJobs.status, "waiting")));
}

/** A working access token, refreshed when it's about to run out. */
async function accessFor(link: CloudLink): Promise<string> {
  if (link.accessToken && link.accessExpires && link.accessExpires.getTime() > Date.now()) {
    const t = await unseal(link.accessToken, secret());
    if (t) return t;
  }
  const refresh = await unseal(link.refreshToken, secret());
  if (!refresh) throw new AuthError("The saved connection can't be read.");
  const t = await refreshAccess(link.provider, refresh);
  const update: Partial<CloudLink> = { accessToken: await seal(t.access, secret()), accessExpires: new Date(Date.now() + (t.expiresIn - 120) * 1000) };
  if (t.refresh) update.refreshToken = await seal(t.refresh, secret());
  await db().update(cloudLinks).set(update).where(and(eq(cloudLinks.studioId, link.studioId), eq(cloudLinks.provider, link.provider)));
  return t.access;
}

// ---------- Adding jobs ----------

type NewJob = { kind: "folder" | "file"; r2Key?: string; folder?: string; name?: string; size?: number };

/** Saves new jobs for the given services, skipping any already there. Returns how many were added. */
async function insertJobs(project: { id: string; studioId: string }, providers: CloudProvider[], items: NewJob[]): Promise<number> {
  const now = new Date();
  const rows = providers.flatMap((provider) =>
    items.map((it) => ({
      id: newId(),
      studioId: project.studioId,
      projectId: project.id,
      provider,
      kind: it.kind,
      r2Key: it.r2Key ?? "",
      folder: it.folder ? cleanName(it.folder) : "",
      name: it.name ? cleanName(it.name) : "",
      size: it.size ?? 0,
      nextAt: now,
      createdAt: now,
    })),
  );
  // D1 takes at most 100 values per statement: 13 per row here, so 7 rows at a time.
  let added = 0;
  for (let i = 0; i < rows.length; i += 7) {
    const r = await db().insert(cloudJobs).values(rows.slice(i, i + 7)).onConflictDoNothing().returning({ id: cloudJobs.id });
    added += r.length;
  }
  if (added) kick(project.studioId);
  return added;
}

/** Adds copies for every service the project's studio has connected (and that is working). */
async function enqueue(projectId: string, items: NewJob[]): Promise<number> {
  if (!items.length) return 0;
  const project = await db().query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return 0;
  const links = (await linksFor(project.studioId)).filter((l) => !l.error);
  if (!links.length) return 0;
  return insertJobs(project, links.map((l) => l.provider), items);
}

/** Works on copies for a little while after the response has gone back, so they start straight away. */
function kick(studioId: string) {
  try {
    getCloudflareContext().ctx.waitUntil(pump({ studioId, budgetMs: 20_000 }).catch(() => {}));
  } catch {
    // No request context (shouldn't happen): the every-minute run picks them up.
  }
}

export async function queueProjectFolder(projectId: string) {
  await enqueue(projectId, [{ kind: "folder" }]);
}

export async function queuePhoto(projectId: string, photoId: string) {
  const p = await db().query.photos.findFirst({ where: eq(photos.id, photoId) });
  if (!p) return;
  await enqueue(projectId, await photoJobs([p]));
}

export async function queueRaw(projectId: string, key: string, filename: string, size: number) {
  const p = await db().query.photos.findFirst({ where: and(eq(photos.projectId, projectId), eq(photos.rawKey, key)) });
  const folder = p?.setId ? (await db().query.sets.findFirst({ where: eq(sets.id, p.setId) }))?.name ?? "" : "";
  await enqueue(projectId, [{ kind: "file", r2Key: key, folder, name: filename, size }]);
}

export async function queueVersion(projectId: string, versionId: string) {
  const rows = await db()
    .select({ v: filmVersions, title: films.title })
    .from(filmVersions)
    .innerJoin(films, eq(films.id, filmVersions.filmId))
    .where(eq(filmVersions.id, versionId))
    .limit(1);
  const r = rows[0];
  if (!r?.v.fileKey) return;
  await enqueue(projectId, [videoJob(r.title, r.v)]);
}

const extOf = (s: string) => (s.split(".").pop() ?? "").toLowerCase();
const baseOf = (s: string) => s.replace(/\.[^.]+$/, "");

function videoJob(title: string, v: { fileKey: string | null; version: number; size: number; filename: string }): NewJob {
  return { kind: "file", r2Key: v.fileKey!, folder: "Videos", name: `${title} v${v.version}.${extOf(v.filename || v.fileKey!)}`, size: v.size };
}

async function photoJobs(list: (typeof photos.$inferSelect)[]): Promise<NewJob[]> {
  if (!list.length) return [];
  const setRows = await db().select().from(sets).where(eq(sets.projectId, list[0].projectId));
  const folderOf = (id: string | null) => setRows.find((s) => s.id === id)?.name ?? "";
  return list.flatMap((p) => [
    ...(p.originalKey ? [{ kind: "file" as const, r2Key: p.originalKey, folder: folderOf(p.setId), name: p.filename, size: p.size }] : []),
    ...(p.rawKey ? [{ kind: "file" as const, r2Key: p.rawKey, folder: folderOf(p.setId), name: `${baseOf(p.filename)}.${extOf(p.rawKey)}`, size: p.rawSize }] : []),
  ]);
}

/** Everything in a project that would be copied: full-res photos, RAWs and every video version. */
async function allProjectJobs(projectId: string): Promise<NewJob[]> {
  const ph = await db().select().from(photos).where(eq(photos.projectId, projectId)).orderBy(asc(photos.sort));
  const vids = await db()
    .select({ v: filmVersions, title: films.title })
    .from(filmVersions)
    .innerJoin(films, eq(films.id, filmVersions.filmId))
    .where(eq(films.projectId, projectId));
  return [{ kind: "folder" }, ...(await photoJobs(ph)), ...vids.filter((r) => r.v.fileKey).map((r) => videoJob(r.title, r.v))];
}

/** "Copy existing files": adds whatever in the project hasn't been copied (or queued) yet, for one service. */
export async function queueExisting(projectId: string, provider: CloudProvider): Promise<number> {
  const project = await db().query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return 0;
  const link = (await linksFor(project.studioId)).find((l) => l.provider === provider && !l.error);
  if (!link) return 0;
  return insertJobs(project, [provider], await allProjectJobs(projectId));
}

/** Puts failed copies back in line. */
export async function retryFailed(studioId: string, provider: CloudProvider, projectId?: string) {
  await db()
    .update(cloudJobs)
    .set({ status: "waiting", attempts: 0, error: null, nextAt: new Date(), leaseUntil: null })
    .where(and(eq(cloudJobs.studioId, studioId), eq(cloudJobs.provider, provider), eq(cloudJobs.status, "failed"), projectId ? eq(cloudJobs.projectId, projectId) : undefined));
  kick(studioId);
}

// ---------- Working through jobs ----------

/**
 * Takes the next job that's due, skipping services whose connection needs fixing and projects already being worked
 * on (so a project's folder is only made once). One statement, so two runs can't take the same job.
 */
async function claim(filter: { studioId?: string; projectId?: string }): Promise<CloudJob | null> {
  const now = Date.now();
  const rows = await db().all<Record<string, unknown>>(sql`
    update cloud_jobs set lease_until = ${now + LEASE}
    where id = (
      select j.id from cloud_jobs j
      join cloud_links l on l.studio_id = j.studio_id and l.provider = j.provider and l.error is null
      where j.status = 'waiting' and j.next_at <= ${now}
        and (j.lease_until is null or j.lease_until < ${now})
        ${filter.studioId ? sql`and j.studio_id = ${filter.studioId}` : sql``}
        ${filter.projectId ? sql`and j.project_id = ${filter.projectId}` : sql``}
        and not exists (
          select 1 from cloud_jobs k where k.project_id = j.project_id and k.provider = j.provider and k.status = 'waiting' and k.lease_until >= ${now}
        )
      order by (j.kind = 'folder') desc, j.created_at, j.id
      limit 1
    )
    returning id`);
  const id = rows[0]?.id as string | undefined;
  if (!id) return null;
  return (await db().query.cloudJobs.findFirst({ where: eq(cloudJobs.id, id) })) ?? null;
}

/** The project's folder on the other side (made the first time), and the folder inside it for this file. */
async function folderFor(link: CloudLink, access: string, projectId: string, inner: string): Promise<string> {
  const d = db();
  const cached = async (path: string) =>
    (await d.query.cloudFolders.findFirst({ where: and(eq(cloudFolders.projectId, projectId), eq(cloudFolders.provider, link.provider), eq(cloudFolders.path, path)) }))?.remote;
  const remember = (path: string, remote: string) => d.insert(cloudFolders).values({ projectId, provider: link.provider, path, remote }).onConflictDoNothing();

  let top = await cached("");
  if (!top) {
    const p = await d.query.projects.findFirst({ where: eq(projects.id, projectId) });
    const name = cleanName([p?.shotDate, p?.title].filter(Boolean).join(" ") || "Project");
    if (link.provider === "dropbox") {
      top = await dropboxCreateFolder(access, `/${name}`);
    } else {
      let root = link.rootId;
      if (!root) {
        root = await driveCreateFolder(access, "Delivered Visual", null);
        await d.update(cloudLinks).set({ rootId: root }).where(and(eq(cloudLinks.studioId, link.studioId), eq(cloudLinks.provider, link.provider)));
      }
      top = await driveCreateFolder(access, name, root);
    }
    await remember("", top);
  }
  if (!inner) return top;
  if (link.provider === "dropbox") return `${top}/${inner}`; // Dropbox makes folders along the way
  let sub = await cached(inner);
  if (!sub) {
    sub = await driveCreateFolder(access, inner, top);
    await remember(inner, sub);
  }
  return sub;
}

async function readPiece(key: string, offset: number, size: number): Promise<ArrayBuffer> {
  const length = Math.min(chunkSize(), size - offset);
  if (length <= 0) return new ArrayBuffer(0);
  const obj = await bucket().get(key, { range: { offset, length } });
  if (!obj) throw new Error("GONE");
  return obj.arrayBuffer();
}

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", tif: "image/tiff", tiff: "image/tiff", webp: "image/webp", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm" };

/** Does one step of a job: makes the folder, or sends the next piece of the file. */
async function step(job: CloudJob, link: CloudLink): Promise<Partial<CloudJob>> {
  const access = await accessFor(link);
  if (job.kind === "folder") {
    await folderFor(link, access, job.projectId, "");
    return { status: "done", doneAt: new Date() };
  }
  const head = await bucket().head(job.r2Key);
  if (!head) throw new Error("GONE");
  const size = head.size;
  const folder = await folderFor(link, access, job.projectId, job.folder);
  const j = { offset: job.offset, size, session: job.session };
  const r =
    link.provider === "dropbox"
      ? await dropboxPiece(access, j, `${folder}/${job.name}`, await readPiece(job.r2Key, job.offset, size))
      : await drivePiece(access, j, job.name, folder, TYPES[extOf(job.name)] ?? "application/octet-stream", (o) => readPiece(job.r2Key, o, size));
  return r.done
    ? { status: "done", offset: size, size, session: null, doneAt: new Date(), error: null }
    : { offset: r.offset, session: r.session, size };
}

/**
 * Works through due jobs until the time budget runs out (or nothing is due). Each step is one piece, so a run that
 * gets cut off loses at most one piece's work.
 */
export async function pump(opts: { studioId?: string; projectId?: string; budgetMs: number }): Promise<{ steps: number }> {
  const start = Date.now();
  let steps = 0;
  while (Date.now() - start < opts.budgetMs) {
    const job = await claim(opts);
    if (!job) break;
    steps++;
    const link = await db().query.cloudLinks.findFirst({ where: and(eq(cloudLinks.studioId, job.studioId), eq(cloudLinks.provider, job.provider)) });
    if (!link) {
      await db().delete(cloudJobs).where(eq(cloudJobs.id, job.id));
      continue;
    }
    try {
      const update = await step(job, link);
      await db().update(cloudJobs).set({ ...update, leaseUntil: null, attempts: 0, error: null }).where(eq(cloudJobs.id, job.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "GONE") {
        // Deleted from the site before it was copied: nothing to send.
        await db().delete(cloudJobs).where(eq(cloudJobs.id, job.id));
      } else if (e instanceof AuthError) {
        await db().update(cloudLinks).set({ error: `${msg} Reconnect ${providerName(link.provider)} on the Team page.` }).where(and(eq(cloudLinks.studioId, link.studioId), eq(cloudLinks.provider, link.provider)));
        await db().update(cloudJobs).set({ leaseUntil: null }).where(eq(cloudJobs.id, job.id));
      } else {
        const attempts = job.attempts + 1;
        // Busy or out-of-space errors get more chances (spread over a day or so) than outright refusals.
        const giveUp = attempts >= (e instanceof RetryError ? MAX_ATTEMPTS * 3 : MAX_ATTEMPTS);
        await db()
          .update(cloudJobs)
          .set({
            attempts,
            error: msg.slice(0, 300),
            leaseUntil: null,
            status: giveUp ? "failed" : "waiting",
            nextAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000),
          })
          .where(eq(cloudJobs.id, job.id));
      }
    }
  }
  return { steps };
}

// ---------- How far along it is ----------

export type CloudStatus = {
  provider: CloudProvider;
  name: string;
  account: string;
  error: string | null;
  done: number;
  waiting: number;
  failed: number;
  bytesLeft: number;
  lastError: string | null;
  /** Files in the project not copied or queued yet (uploaded before connecting). */
  missing: number;
};

export async function projectStatus(projectId: string, studioId: string): Promise<CloudStatus[]> {
  const links = await linksFor(studioId);
  if (!links.length) return [];
  const counts = await db()
    .select({
      provider: cloudJobs.provider,
      status: cloudJobs.status,
      n: sql<number>`count(*)`,
      left: sql<number>`coalesce(sum(${cloudJobs.size} - ${cloudJobs.offset}), 0)`,
      lastError: sql<string | null>`max(${cloudJobs.error})`,
    })
    .from(cloudJobs)
    .where(and(eq(cloudJobs.projectId, projectId), eq(cloudJobs.kind, "file")))
    .groupBy(cloudJobs.provider, cloudJobs.status);
  const total = (await allProjectJobs(projectId)).filter((j) => j.kind === "file").length;
  return links.map((l) => {
    const c = (s: string) => counts.find((x) => x.provider === l.provider && x.status === s);
    const done = Number(c("done")?.n ?? 0);
    const waiting = Number(c("waiting")?.n ?? 0);
    const failed = Number(c("failed")?.n ?? 0);
    return {
      provider: l.provider,
      name: providerName(l.provider),
      account: l.account,
      error: l.error,
      done,
      waiting,
      failed,
      bytesLeft: Number(c("waiting")?.left ?? 0),
      lastError: c("failed")?.lastError ?? c("waiting")?.lastError ?? null,
      missing: Math.max(0, total - done - waiting - failed),
    };
  });
}

export async function studioCounts(studioId: string) {
  const rows = await db()
    .select({ provider: cloudJobs.provider, status: cloudJobs.status, n: sql<number>`count(*)` })
    .from(cloudJobs)
    .where(and(eq(cloudJobs.studioId, studioId), eq(cloudJobs.kind, "file")))
    .groupBy(cloudJobs.provider, cloudJobs.status);
  return (p: CloudProvider, s: "done" | "waiting" | "failed") => Number(rows.find((r) => r.provider === p && r.status === s)?.n ?? 0);
}

/** For the background runner: is anything due at all? (Cheap check before doing more.) */
export async function anythingDue(): Promise<boolean> {
  const r = await db()
    .select({ id: cloudJobs.id })
    .from(cloudJobs)
    .where(and(eq(cloudJobs.status, "waiting"), sql`${cloudJobs.nextAt} <= ${Date.now()}`, isNull(cloudJobs.doneAt)))
    .limit(1);
  return r.length > 0;
}
