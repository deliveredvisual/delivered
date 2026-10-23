import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectFull, logView, picksFor } from "@/lib/queries";
import { loadClientFolders } from "@/lib/chat";
import { formatDate } from "@/lib/format";
import { ClientTopbar } from "../client-chrome";
import { ClientShell } from "../client-shell";
import { openDelivery } from "../gate";
import { Gallery } from "../gallery";

export const metadata: Metadata = { title: "Gallery" };

/** The working view: browse by folder, pick selects, sort into folders, download. */
export default async function GalleryPage({ params, searchParams }: PageProps<"/p/[slug]/gallery">) {
  const { slug } = await params;
  const sp = await searchParams;
  const focus = sp.photo;
  const opened = await openDelivery(slug);
  if ("screen" in opened) return opened.screen;
  const { project, studio, admin, viewer } = opened.ok;

  const full = await getProjectFull(project.id);
  if (!full) notFound();
  const [picks, folders] = await Promise.all([picksFor(project.id), loadClientFolders(project.id)]);
  if (!admin) await logView(project.id, viewer);

  return (
    <ClientShell slug={slug} viewer={viewer} isStudio={admin}>
      <ClientTopbar studio={studio.name} next={`/p/${slug}/gallery`} home={`/p/${slug}`} />
      <Gallery
        key={typeof focus === "string" ? focus : "gallery"}
        slug={slug}
        email={studio.email}
        project={{
          title: project.title,
          eyebrow: [project.clientName, project.category].filter(Boolean).join(" · "),
          shot: formatDate(project.shotDate),
          liveUntil: formatDate(project.expiresAt),
          nda: project.nda,
          rawEnabled: project.rawEnabled,
          licence: {
            usage: project.licenceUsage,
            territory: project.licenceTerritory,
            term: project.licenceTerm,
            credit: project.licenceCredit,
            terms: project.licenceTerms,
          },
        }}
        sets={full.sets.map((s) => ({ id: s.id, name: s.name }))}
        photos={full.photos.map((p) => ({
          id: p.id,
          filename: p.filename,
          setId: p.setId,
          thumbKey: p.thumbKey,
          previewKey: p.previewKey,
          originalKey: p.originalKey,
          rawKey: project.rawEnabled || admin ? p.rawKey : null,
          size: p.size,
          rawSize: p.rawSize,
          width: p.width,
          height: p.height,
        }))}
        films={full.films
          .filter((f) => f.current)
          .map((f) => ({
            id: f.id,
            title: f.title,
            aspect: f.aspect,
            posterKey: f.current!.posterKey,
            duration: f.current!.duration,
            version: f.current!.version,
            approved: !!f.current!.approvedAt,
            openComments: f.openComments,
          }))}
        picks={picks.map((k) => ({ photoId: k.photoId, viewer: k.viewer }))}
        folders={folders}
        focus={typeof focus === "string" ? focus : undefined}
        initialView={sp.view === "list" ? "list" : "grid"}
      />
    </ClientShell>
  );
}
