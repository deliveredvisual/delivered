import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fail, json, projectIdFromKey, studioProject } from "@/lib/api";
import { db } from "@/lib/env";
import { photos, sets } from "@/db/schema";
import { newId } from "@/lib/crypto";
import { logStudio } from "@/lib/history";
import { queuePhoto, queueRaw } from "@/lib/cloud/jobs";

type RegisterPhoto = {
  op: "photo";
  projectId: string;
  id: string;
  setId: string | null;
  filename: string;
  size: number;
  width: number | null;
  height: number | null;
  originalKey: string;
  previewKey: string | null;
  thumbKey: string | null;
};

type AttachRaw = {
  op: "raw";
  projectId: string;
  setId: string | null;
  filename: string; // e.g. AP_0412.ARW
  key: string;
  size: number;
};

function base(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").toLowerCase();
}

function keyBelongs(key: string | null, projectId: string): boolean {
  return key === null || projectIdFromKey(key) === projectId;
}

/** Registers uploaded photos (after their files are in R2) and pairs RAW files with their JPEGs by name. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as RegisterPhoto | AttachRaw;
  const d = db();
  const access = await studioProject(String(body.projectId ?? ""));
  if ("denied" in access) return access.denied;
  const { project } = access;
  if (body.setId) {
    const set = await d.query.sets.findFirst({ where: and(eq(sets.id, body.setId), eq(sets.projectId, project.id)) });
    if (!set) return fail("No such set");
  }

  if (body.op === "photo") {
    if (!/^[a-z0-9]{16}$/.test(body.id)) return fail("Bad id");
    for (const k of [body.originalKey, body.previewKey, body.thumbKey]) {
      if (!keyBelongs(k, project.id)) return fail("Bad key");
    }
    // If a RAW with the same name arrived first, fill in that row instead of making a second one.
    const existing = await d.select().from(photos).where(eq(photos.projectId, project.id));
    const twin = existing.find((p) => base(p.filename) === base(body.filename) && !p.originalKey);
    const n = existing.length;
    if (twin) {
      await d
        .update(photos)
        .set({
          filename: body.filename.slice(0, 200),
          size: body.size,
          width: body.width,
          height: body.height,
          originalKey: body.originalKey,
          previewKey: body.previewKey,
          thumbKey: body.thumbKey,
        })
        .where(eq(photos.id, twin.id));
    } else {
      await d.insert(photos).values({
        id: body.id,
        projectId: project.id,
        setId: body.setId,
        filename: body.filename.slice(0, 200),
        size: body.size,
        width: body.width,
        height: body.height,
        originalKey: body.originalKey,
        previewKey: body.previewKey,
        thumbKey: body.thumbKey,
        sort: Number(n),
        createdAt: new Date(),
      });
    }
    await logStudio(project.id, "upload", body.filename.slice(0, 200));
    await queuePhoto(project.id, twin ? twin.id : body.id);
    revalidatePath(`/admin/p/${project.id}`);
    return json({ ok: true });
  }

  if (body.op === "raw") {
    if (!keyBelongs(body.key, project.id)) return fail("Bad key");
    const rows = await d.select().from(photos).where(eq(photos.projectId, project.id));
    const match = rows.find((p) => base(p.filename) === base(body.filename));
    if (match) {
      await d.update(photos).set({ rawKey: body.key, rawSize: body.size }).where(eq(photos.id, match.id));
    } else {
      // RAW with no JPEG yet: keep it as its own entry; a JPEG uploaded later with the same name joins it.
      await d.insert(photos).values({
        id: newId(),
        projectId: project.id,
        setId: body.setId,
        filename: body.filename.slice(0, 200),
        rawKey: body.key,
        rawSize: body.size,
        sort: rows.length,
        createdAt: new Date(),
      });
    }
    await logStudio(project.id, "upload_raw", body.filename.slice(0, 200));
    await queueRaw(project.id, body.key, body.filename.slice(0, 200), body.size);
    revalidatePath(`/admin/p/${project.id}`);
    return json({ ok: true, paired: !!match });
  }

  return fail("Unknown op");
}
