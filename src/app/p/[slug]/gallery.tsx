"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fileUrl } from "@/lib/urls";
import { formatBytes, formatTimecode } from "@/lib/format";
import { chooseSaveTarget, socialCrop, writeZip, type ZipEntry } from "@/lib/zip-client";
import { NamePrompt, api } from "./name-prompt";

export type GalleryPhoto = {
  id: string;
  filename: string;
  setId: string | null;
  thumbKey: string | null;
  previewKey: string | null;
  originalKey: string | null;
  rawKey: string | null;
  size: number;
  rawSize: number;
};

export type GalleryFilm = {
  id: string;
  title: string;
  aspect: string;
  posterKey: string | null;
  duration: number | null;
  version: number;
  approved: boolean;
  openComments: number;
};

export type GalleryProps = {
  slug: string;
  studio: string;
  email: string;
  viewer: string;
  project: {
    title: string;
    eyebrow: string;
    shot: string;
    liveUntil: string;
    nda: boolean;
    rawEnabled: boolean;
    licence: { usage: string; territory: string; term: string; credit: string; terms: string };
  };
  sets: { id: string; name: string }[];
  photos: GalleryPhoto[];
  films: GalleryFilm[];
  picks: { photoId: string; viewer: string }[];
};

type Preset = "full" | "web" | "social" | "raw";

const baseName = (f: string) => f.replace(/\.[^.]+$/, "");
const zipSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();


const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

export function Gallery(props: GalleryProps) {
  const { slug, project, sets, photos, films } = props;
  const [viewer, setViewerName] = useState(props.viewer);
  const [picks, setPicks] = useState(props.picks);
  const [tab, setTab] = useState<string>("all");
  const [open, setOpen] = useState<number | null>(null);
  const [askName, setAskName] = useState<null | (() => void)>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "selects" | "tab">("all");
  const [dlState, setDlState] = useState<{ label: string; done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState("");
  const [visible, setVisible] = useState(60);

  const mine = useMemo(() => new Set(picks.filter((p) => p.viewer === viewer).map((p) => p.photoId)), [picks, viewer]);
  const teamPicked = useMemo(() => new Set(picks.map((p) => p.photoId)), [picks]);
  const others = useMemo(() => [...new Set(picks.map((p) => p.viewer))].filter((v) => v !== viewer), [picks, viewer]);

  const tabs = useMemo(() => {
    const t = [{ id: "all", label: "All", count: photos.length }];
    for (const s of sets) {
      const n = photos.filter((p) => p.setId === s.id).length;
      if (n) t.push({ id: s.id, label: s.name, count: n });
    }
    if (mine.size) t.push({ id: "mine", label: "My selects", count: mine.size });
    if (others.length) t.push({ id: "team", label: "Team selects", count: teamPicked.size });
    return t;
  }, [photos, sets, mine, others, teamPicked]);

  const shown = useMemo(() => {
    if (tab === "all") return photos;
    if (tab === "mine") return photos.filter((p) => mine.has(p.id));
    if (tab === "team") return photos.filter((p) => teamPicked.has(p.id));
    return photos.filter((p) => p.setId === tab);
  }, [photos, tab, mine, teamPicked]);

  // Refs so a pick made right after someone types their name uses that name, not the stale one.
  const viewerRef = useRef(props.viewer);
  const picksRef = useRef(picks);
  useEffect(() => {
    picksRef.current = picks;
  }, [picks]);

  const togglePick = useCallback(
    (photoId: string) => {
      const run = async () => {
        const me = viewerRef.current;
        const has = (list: typeof picks) => list.some((p) => p.photoId === photoId && p.viewer === me);
        const on = !has(picksRef.current);
        const add = (prev: typeof picks) => (has(prev) ? prev : [...prev, { photoId, viewer: me }]);
        const remove = (prev: typeof picks) => prev.filter((p) => !(p.photoId === photoId && p.viewer === me));
        setPicks(on ? add : remove);
        const res = await api(slug, { op: "pick", photoId, on });
        if (!res.ok) setPicks(on ? remove : add);
      };
      if (viewerRef.current) run();
      else setAskName(() => run);
    },
    [slug],
  );

  // ----- downloads -----
  const scopePhotos = scope === "all" ? photos : scope === "selects" ? photos.filter((p) => mine.has(p.id)) : shown;
  const scopeLabel = scope === "all" ? "All" : scope === "selects" ? "Selects" : tabs.find((t) => t.id === tab)?.label ?? "Set";
  const setName = (id: string | null) => sets.find((s) => s.id === id)?.name ?? "";
  const folder = (p: GalleryPhoto) => (sets.length && setName(p.setId) ? `${zipSafe(setName(p.setId))}/` : "");

  function entriesFor(preset: Preset): ZipEntry[] {
    const list = scopePhotos;
    switch (preset) {
      case "full":
        return list.filter((p) => p.originalKey).map((p) => ({ name: folder(p) + p.filename, size: p.size, url: fileUrl(p.originalKey) }));
      case "web":
        return list.filter((p) => p.previewKey).map((p) => ({ name: folder(p) + baseName(p.filename) + ".jpg", size: 1_500_000, url: fileUrl(p.previewKey) }));
      case "social":
        return list
          .filter((p) => p.previewKey)
          .flatMap((p) => [
            { name: `4x5/${baseName(p.filename)}_4x5.jpg`, size: 500_000, make: () => socialCrop(fileUrl(p.previewKey), 4, 5) },
            { name: `9x16/${baseName(p.filename)}_9x16.jpg`, size: 500_000, make: () => socialCrop(fileUrl(p.previewKey), 9, 16) },
          ]);
      case "raw":
        return list
          .filter((p) => p.rawKey)
          .map((p) => ({ name: folder(p) + baseName(p.filename) + "." + (p.rawKey!.split(".").pop() ?? "raw"), size: p.rawSize, url: fileUrl(p.rawKey) }));
    }
  }

  const presets: { id: Preset; label: string; detail: string; disabled?: string }[] = [
    {
      id: "full",
      label: "Full resolution",
      detail: `${entriesFor("full").length} files · ${formatBytes(entriesFor("full").reduce((s, e) => s + e.size, 0))}`,
    },
    { id: "web", label: "Web", detail: `JPEG, 2560px long edge · ${entriesFor("web").length} files` },
    { id: "social", label: "Social crops", detail: `4:5 and 9:16, 1080px wide · ${entriesFor("web").length} of each` },
  ];
  if (project.rawEnabled && photos.some((p) => p.rawKey)) {
    const raws = entriesFor("raw");
    presets.push({
      id: "raw",
      label: "RAW originals",
      detail: `Camera files · ${raws.length} files · ${formatBytes(raws.reduce((s, e) => s + e.size, 0))}`,
    });
  }

  async function download(preset: Preset) {
    const entries = entriesFor(preset);
    if (!entries.length) return;
    const label = presets.find((p) => p.id === preset)!.label;
    const zipName = `${zipSafe(project.title)} - ${scopeLabel} - ${label}.zip`;
    setDlError("");
    try {
      const target = await chooseSaveTarget(zipName, entries.reduce((s, e) => s + e.size, 0));
      if (!target) return;
      setDlOpen(false);
      setDlState({ label: `${label} · ${scopeLabel}`, done: 0, total: entries.length });
      const { failed } = await writeZip(target, zipName, entries, (done, total) => setDlState({ label: `${label} · ${scopeLabel}`, done, total }));
      api(slug, { op: "event", action: "download", detail: `${label} · ${scopeLabel} (${entries.length} files)` });
      setDlState(null);
      if (failed.length) setDlError(`${failed.length} file${failed.length === 1 ? "" : "s"} couldn’t be added. Try again, or download them one at a time.`);
    } catch (e) {
      setDlState(null);
      setDlError(e instanceof Error ? e.message : "The download didn’t finish.");
    }
  }

  // ----- lightbox keys -----
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      else if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : Math.min(shown.length - 1, i + 1)));
      else if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
      else if (e.key.toLowerCase() === "p" && shown[open]) togglePick(shown[open].id);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, shown, togglePick]);

  const lic = project.licence;
  const hasLicence = lic.usage || lic.territory || lic.term || lic.credit;
  const noSave = project.nda ? { onContextMenu: (e: React.MouseEvent) => e.preventDefault(), draggable: false } : {};
  const current = open !== null ? shown[open] : null;

  return (
    <main className="wrap">
      <section className="stack" style={{ padding: "56px 0 32px", gap: 14 }}>
        {project.eyebrow ? <div className="eyebrow">{project.eyebrow}</div> : null}
        <h1 className="h1">{project.title}</h1>
        <div className="meta">
          {project.shot ? <span>Shot {project.shot}</span> : null}
          <span>
            {photos.length} photo{photos.length === 1 ? "" : "s"}
            {films.length ? ` · ${films.length} film${films.length === 1 ? "" : "s"}` : ""}
          </span>
          <span>Live until {project.liveUntil}</span>
        </div>
      </section>

      {project.nda ? (
        <div className="notice" style={{ marginBottom: 12 }}>
          <strong>Confidential.</strong> This delivery is under NDA. Please don’t forward the link or share the images outside your team.
        </div>
      ) : null}

      {hasLicence ? (
        <section className="licence">
          <div className="items">
            <span className="tag">Usage licence</span>
            {lic.usage ? <span>{lic.usage}</span> : null}
            {lic.territory ? <span>{lic.territory}</span> : null}
            {lic.term ? <span>{lic.term}</span> : null}
            {lic.credit ? <span>Credit: {lic.credit}</span> : null}
          </div>
          {lic.terms ? <a href="#terms">Full terms</a> : null}
        </section>
      ) : null}

      {films.length ? (
        <section style={{ paddingTop: 40 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Films</div>
          <div className="film-cards">
            {films.map((f) => (
              <Link key={f.id} href={`/p/${slug}/film/${f.id}`} className="film-card">
                <div className="film-thumb">
                  {f.posterKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.posterKey)} alt="" {...noSave} />
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                  )}
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{f.title}</div>
                  <div className="small muted">{f.aspect}{f.duration ? ` · ${formatTimecode(f.duration)}` : ""}</div>
                  <div className={`small ${f.approved ? "good" : f.openComments ? "warn" : "muted"}`} style={{ fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12 }}>
                    v{f.version} · {f.approved ? "Approved" : f.openComments ? `${f.openComments} open comment${f.openComments === 1 ? "" : "s"}` : "Ready to review"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {photos.length ? (
        <>
          <section className="tabs-bar" style={{ marginTop: 40 }}>
            <nav className="tabs" aria-label="Sets">
              {tabs.map((t) => (
                <button key={t.id} type="button" className="tab" aria-current={tab === t.id} onClick={() => {
                  setTab(t.id);
                  setVisible(60);
                }}>
                  {t.label} <span className="count">{t.count}</span>
                </button>
              ))}
            </nav>
            <div className="row" style={{ padding: "8px 0" }}>
              <button type="button" className="btn" onClick={() => setTab(mine.size ? "mine" : tab)} title="Tick photos to add them to your selects">
                <CheckIcon /> Selects · {mine.size}
              </button>
              <div className="dl-wrap">
                <button type="button" className="btn btn-primary" aria-expanded={dlOpen} onClick={() => setDlOpen((o) => !o)} disabled={!!dlState}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" /></svg>
                  {dlState ? `Zipping ${dlState.done}/${dlState.total}` : "Download"}
                </button>
                {dlOpen ? (
                  <div className="dl-menu" role="dialog" aria-label="Download options">
                    <div className="row" style={{ gap: 6 }}>
                      {(
                        [
                          ["all", `All ${photos.length}`],
                          ["selects", `My selects (${mine.size})`],
                          ...(tab !== "all" ? [["tab", "This tab"]] : []),
                        ] as [typeof scope, string][]
                      ).map(([id, label]) => (
                        <button key={id} type="button" className="btn btn-small pill" aria-pressed={scope === id} onClick={() => setScope(id)} disabled={id === "selects" && !mine.size}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div>
                      {presets.map((p) => (
                        <div key={p.id} className="dl-row">
                          <div className="stack" style={{ gap: 3 }}>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{p.label}</div>
                            <div className="small muted">{p.disabled ?? p.detail}</div>
                          </div>
                          <button type="button" className="btn btn-small" disabled={!!p.disabled || !entriesFor(p.id).length} onClick={() => download(p.id)} aria-label={`Download ${p.label} as ZIP`}>
                            ZIP
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="small muted">Large downloads save straight to disk in Chrome and Edge.</div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
          {dlState ? (
            <div className="stack" style={{ gap: 6, paddingTop: 12 }}>
              <div className="small">Preparing {dlState.label}: {dlState.done} of {dlState.total} files. Keep this tab open.</div>
              <div className="progress"><div style={{ width: `${(dlState.done / Math.max(dlState.total, 1)) * 100}%` }} /></div>
            </div>
          ) : null}
          {dlError ? <p className="error" role="alert" style={{ paddingTop: 12 }}>{dlError}</p> : null}

          <section aria-label="Photos" className="photo-grid">
            {shown.slice(0, visible).map((p, i) => (
              <figure key={p.id} className="tile">
                <div className="tile-media">
                  {p.thumbKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(p.thumbKey)} alt={p.filename} loading="lazy" onClick={() => setOpen(i)} {...noSave} />
                  ) : (
                    <button type="button" className="noimg mono muted" onClick={() => setOpen(i)} style={{ background: "none", border: 0, width: "100%" }}>
                      {p.rawKey && !p.originalKey ? "RAW file" : "No preview"}
                    </button>
                  )}
                  <button type="button" className="pick" aria-pressed={mine.has(p.id)} aria-label={`${mine.has(p.id) ? "Remove" : "Add"} ${p.filename} ${mine.has(p.id) ? "from" : "to"} your selects`} onClick={() => togglePick(p.id)}>
                    <CheckIcon />
                  </button>
                  {others.length && picks.some((k) => k.photoId === p.id && k.viewer !== viewer) ? (
                    <span className="pick-count">{picks.filter((k) => k.photoId === p.id && k.viewer !== viewer).map((k) => k.viewer.split(" ")[0]).join(", ")}</span>
                  ) : null}
                </div>
                <figcaption className="tile-cap">
                  <span>{p.filename}</span>
                  <span>{setName(p.setId)}</span>
                </figcaption>
              </figure>
            ))}
          </section>
          {shown.length > visible ? (
            <div className="row" style={{ justifyContent: "center", paddingTop: 48 }}>
              <button type="button" className="btn" onClick={() => setVisible((v) => v + 60)}>
                Show more ({shown.length - visible} left)
              </button>
            </div>
          ) : null}
          {tab === "mine" && !mine.size ? <p className="muted">Tick photos to add them to your selects.</p> : null}
        </>
      ) : null}

      <footer id="terms" className="stack" style={{ marginTop: 80, paddingTop: 24, borderTop: "1px solid var(--line)", gap: 12 }}>
        {lic.terms ? (
          <details>
            <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Full licence terms</summary>
            <p className="small" style={{ whiteSpace: "pre-line", maxWidth: 760 }}>{lic.terms}</p>
          </details>
        ) : null}
        <div className="row between small muted">
          <span>Files stay live until {project.liveUntil}, then move to an archive you can request.</span>
          {props.email ? <a href={`mailto:${props.email}`}>{props.email}</a> : null}
        </div>
      </footer>

      {current ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={current.filename}>
          <div className="lightbox-top">
            <span className="mono" style={{ color: "#ccc" }}>{current.filename} · {open! + 1} / {shown.length}</span>
            <div className="row">
              <button type="button" className="lb-btn" aria-pressed={mine.has(current.id)} onClick={() => togglePick(current.id)}>
                <CheckIcon /> {mine.has(current.id) ? "Selected" : "Select"}
              </button>
              {current.previewKey ? (
                <a className="lb-btn" href={fileUrl(current.previewKey, baseName(current.filename) + "_web.jpg")}>Web</a>
              ) : null}
              {current.originalKey ? (
                <a className="lb-btn" href={fileUrl(current.originalKey, current.filename)}>Full res</a>
              ) : null}
              <button type="button" className="lb-btn" onClick={() => setOpen(null)} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          </div>
          <div className="lightbox-stage">
            {current.previewKey ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(current.previewKey)} alt={current.filename} {...noSave} />
            ) : (
              <span className="mono" style={{ color: "#aaa" }}>No preview for this file</span>
            )}
            {open! > 0 ? (
              <button type="button" className="lb-btn lb-nav lb-prev" onClick={() => setOpen(open! - 1)} aria-label="Previous photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
            ) : null}
            {open! < shown.length - 1 ? (
              <button type="button" className="lb-btn lb-nav lb-next" onClick={() => setOpen(open! + 1)} aria-label="Next photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            ) : null}
          </div>
          <div className="lightbox-bottom small" style={{ color: "#aaa" }}>
            <span>← → to move · P to select · Esc to close</span>
            {project.nda ? <span>Confidential</span> : null}
          </div>
        </div>
      ) : null}

      {askName ? (
        <NamePrompt
          slug={slug}
          onDone={(name) => {
            viewerRef.current = name;
            setViewerName(name);
            const fn = askName;
            setAskName(null);
            // Run the action that asked for a name, now under that name.
            setTimeout(() => fn(), 0);
          }}
          onCancel={() => setAskName(null)}
        />
      ) : null}
    </main>
  );
}
