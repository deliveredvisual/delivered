import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fullResHeld, getProjectBySlug, getViewer, hasProjectAccess, isAdmin, isExpired } from "@/lib/auth";
import { studio as getStudio } from "@/lib/env";
import { getProjectFull, logView, picksFor } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { CenteredCard, ClientTopbar } from "./client-chrome";
import { UnlockForm } from "./unlock-form";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Delivery" };

export default async function DeliveryPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const studio = getStudio();
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const admin = await isAdmin();

  if (isExpired(project) && !admin) {
    return (
      <CenteredCard studio={studio.name}>
        <h1 className="h2">This delivery has been archived</h1>
        <p className="muted" style={{ margin: 0 }}>
          The files for <strong style={{ color: "var(--ink)" }}>{project.title}</strong> are no longer online.
          {studio.email ? (
            <>
              {" "}To get them back, email <a href={`mailto:${studio.email}`}>{studio.email}</a>.
            </>
          ) : null}
        </p>
      </CenteredCard>
    );
  }

  if (!(await hasProjectAccess(project))) {
    return (
      <CenteredCard studio={studio.name}>
        <div className="eyebrow">{project.clientName || "Private delivery"}</div>
        <h1 className="h2">{project.title}</h1>
        <UnlockForm slug={slug} />
      </CenteredCard>
    );
  }

  const full = await getProjectFull(project.id);
  if (!full) notFound();
  const [picks, viewer] = await Promise.all([picksFor(project.id), getViewer()]);

  if (!admin) await logView(project.id, viewer);

  return (
    <>
      <ClientTopbar studio={studio.name} />
      <Gallery
        slug={slug}
        studio={studio.name}
        email={studio.email}
        viewer={viewer}
        project={{
          title: project.title,
          eyebrow: [project.clientName, project.category].filter(Boolean).join(" · "),
          shot: formatDate(project.shotDate),
          liveUntil: formatDate(project.expiresAt),
          nda: project.nda,
          held: fullResHeld(project) && !admin,
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
      />
    </>
  );
}
