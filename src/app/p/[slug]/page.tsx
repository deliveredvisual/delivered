import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectFull, logView } from "@/lib/queries";
import { formatDate, plural } from "@/lib/format";
import { isDarkBg, landingTheme, LANDING_SPACING } from "@/lib/landing";
import { ClientTopbar } from "./client-chrome";
import { ClientShell } from "./client-shell";
import { openDelivery } from "./gate";
import { Landing } from "./landing";

export const metadata: Metadata = { title: "Delivery" };

/** What a client sees first: the cover, a note from the studio, films, then every photo laid out beautifully. */
export default async function LandingPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const opened = await openDelivery(slug);
  if ("screen" in opened) return opened.screen;
  const { project: p, studio, admin, viewer } = opened.ok;

  const full = await getProjectFull(p.id);
  if (!full) notFound();
  if (!admin) await logView(p.id, viewer);

  const photos = full.photos.filter((x) => x.previewKey || x.thumbKey);
  const cover = photos.find((x) => x.id === p.landingCoverId) ?? photos[0] ?? null;
  const films = full.films.filter((f) => f.current);
  const style = { ...landingTheme(p.landingBg), "--gap": `${LANDING_SPACING[p.landingSpacing] ?? 12}px` } as React.CSSProperties;

  return (
    <div className="landing" data-tone={isDarkBg(p.landingBg) ? "dark" : "light"} style={style}>
      <ClientShell slug={slug} viewer={viewer} isStudio={admin}>
        <ClientTopbar studio={studio.name} next={`/p/${slug}`} home={`/p/${slug}`} />
        <Landing
          slug={slug}
          email={studio.email}
          layout={p.landingLayout}
          groupFolders={p.landingGroupFolders}
          nda={p.nda}
          project={{
            title: p.title,
            eyebrow: [p.clientName, p.category].filter(Boolean).join(" · "),
            intro: p.landingIntro,
            meta: [
              p.shotDate ? `Shot ${formatDate(p.shotDate)}` : "",
              [photos.length ? plural(photos.length, "photo") : "", films.length ? plural(films.length, "film") : ""].filter(Boolean).join(" · "),
              `Live until ${formatDate(p.expiresAt)}`,
            ].filter(Boolean),
            credit: p.licenceCredit,
            date: formatDate(p.shotDate ?? p.createdAt.toISOString().slice(0, 10)),
          }}
          titleOnCover={p.landingTitleOnCover}
          coverDim={p.landingCoverDim}
          cover={cover ? { id: cover.id, previewKey: cover.previewKey, thumbKey: cover.thumbKey, width: cover.width, height: cover.height } : null}
          folders={full.sets.map((s) => ({ id: s.id, name: s.name }))}
          photos={photos.map((x) => ({ id: x.id, filename: x.filename, setId: x.setId, thumbKey: x.thumbKey, previewKey: x.previewKey, width: x.width, height: x.height }))}
          films={films.map((f) => ({
            id: f.id,
            title: f.title,
            aspect: f.aspect,
            posterKey: f.current!.posterKey,
            duration: f.current!.duration,
            version: f.current!.version,
            versionId: f.current!.id,
            approved: !!f.current!.approvedAt,
          }))}
        />
      </ClientShell>
    </div>
  );
}
