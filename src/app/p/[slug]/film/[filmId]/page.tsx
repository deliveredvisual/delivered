import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getViewer, managesProject, projectForViewer, studioFor } from "@/lib/auth";
import { db } from "@/lib/env";
import { comments, filmVersions, films } from "@/db/schema";
import { ClientTopbar } from "../../client-chrome";
import { ClientShell } from "../../client-shell";
import { Review } from "./review";

export const metadata: Metadata = { title: "Film review" };

export default async function FilmPage({ params, searchParams }: PageProps<"/p/[slug]/film/[filmId]">) {
  const { slug, filmId } = await params;
  const sp = await searchParams;
  const project = await projectForViewer(slug);
  if (!project) redirect(`/p/${slug}`); // shows the password or archived screen
  const d = db();
  const film = await d.query.films.findFirst({ where: and(eq(films.id, filmId), eq(films.projectId, project.id)) });
  if (!film) notFound();
  const versions = (await d.select().from(filmVersions).where(eq(filmVersions.filmId, film.id)).orderBy(asc(filmVersions.version))).filter((v) => v.fileKey);
  if (!versions.length) notFound();
  const commentRows = await d
    .select()
    .from(comments)
    .where(inArray(comments.versionId, versions.map((v) => v.id)))
    .orderBy(asc(comments.timecode), asc(comments.createdAt));
  const [viewer, studio, admin] = await Promise.all([getViewer(project), studioFor(project), managesProject(project)]);
  // From a pinned moment in the chat: ?v=<version>&t=<seconds>
  const startVersion = typeof sp.v === "string" && versions.some((v) => v.id === sp.v) ? sp.v : undefined;
  const startAt = typeof sp.t === "string" && Number.isFinite(Number(sp.t)) ? Math.max(0, Number(sp.t)) : undefined;

  return (
    <ClientShell slug={slug} viewer={viewer} isStudio={admin}>
      <ClientTopbar studio={studio.name} next={`/p/${slug}`} home={`/p/${slug}`} />
      <Review
        slug={slug}
        projectTitle={project.title}
        startVersion={startVersion}
        startAt={startAt}
        film={{ id: film.id, title: film.title, aspect: film.aspect }}
        versions={versions.map((v) => ({
          id: v.id,
          version: v.version,
          fileKey: v.fileKey!,
          posterKey: v.posterKey,
          filename: v.filename,
          size: v.size,
          duration: v.duration,
          approvedBy: v.approvedBy,
          approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
        }))}
        comments={commentRows.map((c) => ({
          id: c.id,
          versionId: c.versionId,
          author: c.author,
          org: c.org,
          timecode: c.timecode,
          body: c.body,
          resolved: c.resolved,
        }))}
      />
    </ClientShell>
  );
}
