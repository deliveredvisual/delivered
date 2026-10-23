"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fileUrl } from "@/lib/urls";
import { formatTimecode } from "@/lib/format";
import { PinIcon, useShell } from "./client-shell";

type LPhoto = { id: string; filename: string; setId: string | null; thumbKey: string | null; previewKey: string | null; width: number | null; height: number | null };
type LFilm = { id: string; title: string; aspect: string; posterKey: string | null; duration: number | null; version: number; versionId: string; approved: boolean };
type Layout = "collage" | "masonry" | "grid" | "large";

const ratio = (p: { width: number | null; height: number | null }) => (p.width && p.height ? p.width / p.height : 1.5);

function srcFor(p: { thumbKey: string | null; previewKey: string | null }) {
  const set = [p.thumbKey ? `${fileUrl(p.thumbKey)} 800w` : "", p.previewKey ? `${fileUrl(p.previewKey)} 2560w` : ""].filter(Boolean).join(", ");
  return { src: fileUrl(p.previewKey ?? p.thumbKey), srcSet: set || undefined };
}

const SIZES: Record<Layout, string> = {
  collage: "(max-width: 700px) 100vw, 50vw",
  masonry: "(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 34vw",
  grid: "(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 34vw",
  large: "100vw",
};

export function Landing(props: {
  slug: string;
  email: string;
  layout: Layout;
  groupFolders: boolean;
  nda: boolean;
  project: { title: string; eyebrow: string; intro: string; meta: string[]; credit: string; date: string };
  titleOnCover: boolean;
  coverDim: number;
  cover: { id: string; previewKey: string | null; thumbKey: string | null; width: number | null; height: number | null } | null;
  folders: { id: string; name: string }[];
  photos: LPhoto[];
  films: LFilm[];
}) {
  const { slug, layout, photos, films, project, cover } = props;
  const { pin, openChat } = useShell();
  const [open, setOpen] = useState<number | null>(null);
  const touchX = useRef<number | null>(null);
  const overlay = props.titleOnCover && !!cover;
  const noSave = props.nda ? { onContextMenu: (e: React.MouseEvent) => e.preventDefault(), draggable: false } : {};

  // Photos grouped by the studio's folders (in folder order), or all together.
  const groups = useMemo(() => {
    const used = props.folders.filter((f) => photos.some((p) => p.setId === f.id));
    if (!props.groupFolders || used.length < 1 || (used.length === 1 && photos.every((p) => p.setId === used[0].id))) {
      return [{ id: "all", name: "", items: photos }];
    }
    const out = used.map((f) => ({ id: f.id, name: f.name, items: photos.filter((p) => p.setId === f.id) }));
    const loose = photos.filter((p) => !used.some((f) => f.id === p.setId));
    if (loose.length) out.push({ id: "more", name: "More", items: loose });
    return out;
  }, [photos, props.folders, props.groupFolders]);
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const index = useMemo(() => new Map(order.map((p, i) => [p.id, i])), [order]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, .chat-drawer")) return;
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : Math.min(order.length - 1, i + 1)));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, order.length]);

  const current = open !== null ? order[open] : null;
  const pinPhoto = (p: LPhoto) => pin({ type: "photo", id: p.id, label: p.filename, thumbKey: p.thumbKey });

  function item(p: LPhoto) {
    const { src, srcSet } = srcFor(p);
    const r = ratio(p);
    return (
      <figure
        key={p.id}
        className="landing-item"
        style={layout === "collage" ? { flex: `${r} 1 calc(var(--row) * ${r})` } : undefined}
      >
        <button type="button" className="landing-open" onClick={() => setOpen(index.get(p.id) ?? 0)} aria-label={`View ${p.filename}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            srcSet={srcSet}
            sizes={SIZES[layout]}
            alt={p.filename}
            loading="lazy"
            decoding="async"
            style={{ aspectRatio: layout === "grid" ? "3 / 2" : `${r}` }}
            {...noSave}
          />
        </button>
        <button type="button" className="pin-btn" onClick={() => pinPhoto(p)} aria-label={`Pin ${p.filename} to a message`} title="Pin to a message">
          <PinIcon />
        </button>
      </figure>
    );
  }

  return (
    <main>
      {cover ? (
        <div className="landing-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...srcFor(cover)} sizes="100vw" alt="" fetchPriority="high" {...noSave} />
          {overlay ? (
            <>
              <div className="landing-hero-shade" style={{ background: `linear-gradient(to top, rgba(0,0,0,${Math.min(0.9, props.coverDim / 100 + 0.2)}) 0%, rgba(0,0,0,${props.coverDim / 100}) 45%, rgba(0,0,0,${props.coverDim / 100}) 100%)` }} />
              <div className="landing-hero-text">
                {project.eyebrow ? <div className="eyebrow" style={{ color: "rgba(255,255,255,0.8)" }}>{project.eyebrow}</div> : null}
                <h1 className="h1" style={{ fontSize: "clamp(40px, 7vw, 96px)", color: "#fff" }}>{project.title}</h1>
                <div style={{ fontSize: "clamp(14px, 1.4vw, 17px)", color: "rgba(255,255,255,0.88)" }}>{project.date}</div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <section className="landing-head">
        <div className="stack" style={{ gap: 14, maxWidth: 820 }}>
          {overlay ? null : project.eyebrow ? <div className="eyebrow">{project.eyebrow}</div> : null}
          {overlay ? null : <h1 className="h1" style={{ fontSize: "clamp(40px, 6.5vw, 84px)" }}>{project.title}</h1>}
          {project.intro ? <p className="landing-intro">{project.intro}</p> : null}
          <div className="meta" style={{ color: "var(--ink-2)" }}>
            {project.meta.map((m) => <span key={m}>{m}</span>)}
          </div>
        </div>
        <div className="row landing-actions" style={{ gap: 10 }}>
          <Link href={`/p/${slug}/gallery`} className="btn btn-primary">
            Select &amp; download
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </Link>
          <button type="button" className="btn" onClick={openChat}>Messages</button>
        </div>
      </section>

      {props.nda ? (
        <div className="landing-band">
          <div className="notice"><strong>Confidential.</strong> This delivery is under NDA. Please don’t forward the link or share the images outside your team.</div>
        </div>
      ) : null}

      {films.length ? (
        <section className="landing-band" aria-label="Films">
          <div className="eyebrow" style={{ marginBottom: 16 }}>Films</div>
          <div className={`landing-films${films.length === 1 ? " one" : ""}`}>
            {films.map((f) => (
              <div key={f.id} className="landing-film">
                <Link href={`/p/${slug}/film/${f.id}`} className="landing-film-media" aria-label={`Watch ${f.title}`}>
                  {f.posterKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.posterKey)} alt="" loading="lazy" {...noSave} />
                  ) : null}
                  <span className="landing-play" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                  </span>
                </Link>
                <div className="row between" style={{ alignItems: "baseline" }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <Link href={`/p/${slug}/film/${f.id}`} style={{ textDecoration: "none", fontSize: 17, fontWeight: 500 }}>{f.title}</Link>
                    <span className="small muted">
                      {f.aspect}{f.duration ? ` · ${formatTimecode(f.duration)}` : ""} · v{f.version}{f.approved ? " · Approved" : ""}
                    </span>
                  </div>
                  <button type="button" className="btn btn-small" onClick={() => pin({ type: "film", id: f.id, label: f.title, thumbKey: f.posterKey, versionId: f.versionId, version: f.version })}>
                    <PinIcon /> Pin
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {order.length ? (
        groups.map((g) => (
          <section key={g.id} className="landing-band" aria-label={g.name || "Photos"}>
            {g.name ? (
              <div className="row between" style={{ marginBottom: 16, alignItems: "baseline" }}>
                <h2 className="h3">{g.name}</h2>
                <span className="small muted">{g.items.length}</span>
              </div>
            ) : null}
            <div className={`landing-photos lp-${layout}`}>{g.items.map(item)}</div>
          </section>
        ))
      ) : !films.length ? (
        <section className="landing-band">
          <p className="muted">The files for this delivery are on their way.</p>
        </section>
      ) : null}

      <footer className="landing-band landing-foot small muted" style={{ paddingTop: 48, paddingBottom: 110 }}>
        <span>{project.credit ? `Credit: ${project.credit}` : ""}</span>
        <span className="row" style={{ gap: 20 }}>
          <Link href={`/p/${slug}/gallery`}>Select &amp; download</Link>
          {props.email ? <a href={`mailto:${props.email}`}>{props.email}</a> : null}
        </span>
      </footer>

      {current ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={current.filename}>
          <div className="lightbox-top">
            <span className="mono lb-name">{current.filename} · {open! + 1} / {order.length}</span>
            <button type="button" className="lb-btn" onClick={() => setOpen(null)} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div
            className="lightbox-stage"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              const start = touchX.current;
              touchX.current = null;
              if (start === null) return;
              const dx = e.changedTouches[0].clientX - start;
              if (dx < -50 && open! < order.length - 1) setOpen(open! + 1);
              else if (dx > 50 && open! > 0) setOpen(open! - 1);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(current.previewKey ?? current.thumbKey)} alt={current.filename} {...noSave} />
            {open! > 0 ? (
              <button type="button" className="lb-btn lb-nav lb-prev" onClick={() => setOpen(open! - 1)} aria-label="Previous photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
            ) : null}
            {open! < order.length - 1 ? (
              <button type="button" className="lb-btn lb-nav lb-next" onClick={() => setOpen(open! + 1)} aria-label="Next photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            ) : null}
          </div>
          <div className="lightbox-bottom">
            <div className="lb-actions">
              <button type="button" className="lb-btn" onClick={() => pinPhoto(current)}><PinIcon /> Pin</button>
              <Link className="lb-btn" href={`/p/${slug}/gallery?photo=${current.id}`}>Select &amp; download</Link>
            </div>
            <span className="small lb-hint">← → to move · Esc to close{props.nda ? " · Confidential" : ""}</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
