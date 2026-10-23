import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fail, json, projectIdFromKey, studioProject } from "@/lib/api";
import { db } from "@/lib/env";
import { films, filmVersions } from "@/db/schema";

type NewVersion = {
  projectId: string;
  filmId: string;
  id: string;
  fileKey: string;
  posterKey: string | null;
  filename: string;
  size: number;
  duration: number | null;
};

/** Registers a newly uploaded film file as the next version (v1, v2, …). */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as NewVersion;
  const access = await studioProject(String(body.projectId ?? ""));
  if ("denied" in access) return access.denied;
  const d = db();
  const film = await d.query.films.findFirst({ where: and(eq(films.id, body.filmId), eq(films.projectId, body.projectId)) });
  if (!film) return fail("No such film", 404);
  if (!/^[a-z0-9]{16}$/.test(body.id)) return fail("Bad id");
  if (projectIdFromKey(body.fileKey) !== film.projectId) return fail("Bad key");
  if (body.posterKey && projectIdFromKey(body.posterKey) !== film.projectId) return fail("Bad key");

  const [{ top }] = await d.select({ top: max(filmVersions.version) }).from(filmVersions).where(eq(filmVersions.filmId, film.id));
  const version = (top ?? 0) + 1;
  await d.insert(filmVersions).values({
    id: body.id,
    filmId: film.id,
    version,
    fileKey: body.fileKey,
    posterKey: body.posterKey,
    filename: body.filename.slice(0, 200),
    size: body.size,
    duration: body.duration ? Math.round(body.duration) : null,
    createdAt: new Date(),
  });
  revalidatePath(`/admin/p/${film.projectId}`);
  return json({ ok: true, version });
}
