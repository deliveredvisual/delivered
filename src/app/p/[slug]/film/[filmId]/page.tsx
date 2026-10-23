import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { fullResHeld, getViewer, managesProject, projectForViewer, studioFor } from "@/lib/auth";
import { db } from "@/lib/env";
import { comments, filmVersions, films } from "@/db/schema";
import { ClientTopbar } from "../../client-chrome";
import { Review } from "./review";

export const metadata: Metadata = { title: "Film review" };

export default async function FilmPage({ params }: PageProps<"/p/[slug]/film/[filmId]">) {
  const { slug, filmId } = await params;
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
  const [viewer, admin, studio] = await Promise.all([getViewer(project), managesProject(project), studioFor(project)]);

  return (
    <>
      <ClientTopbar studio={studio.name} next={`/p/${slug}`} />
      <Review
        slug={slug}
        projectTitle={project.title}
        viewer={viewer}
        canDownload={!fullResHeld(project) || admin}
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
    </>
  );
}
