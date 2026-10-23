"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fileUrl } from "@/lib/urls";
import { formatBytes, formatTimecode, plural } from "@/lib/format";
import { chooseSaveTarget, writeZip, type ZipEntry } from "@/lib/zip-client";
import type { FolderView } from "@/lib/chat-types";
import { api } from "./name-prompt";
import { PinIcon, useShell } from "./client-shell";

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
  email: string;
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
  folders: FolderView[];
  /** Open this photo straight away (from a pinned photo in the chat). */
  focus?: string;
};

type Preset = "full" | "web" | "raw";

const baseName = (f: string) => f.replace(/\.[^.]+$/, "");
const zipSafe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim();

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" style={{ verticalAlign: -2 }}><path d="M3 6.5h6l2 2h10V19H3z" /></svg>
);

export function Gallery(props: GalleryProps) {
  const { slug, project, sets, photos, films } = props;
  const { viewer, who, needName, pin } = useShell();
  const [picks, setPicks] = useState(props.picks);
  const [folders, setFolders] = useState(props.folders);
  const [tab, setTab] = useState<string>("all");
  // A pinned photo in the chat leads here with ?photo=… : open it straight away.
  const [open, setOpen] = useState<number | null>(() => {
    const i = props.focus ? photos.findIndex((p) => p.id === props.focus) : -1;
    return i >= 0 ? i : null;
  });
  const [dlOpen, setDlOpen] = useState(false);
  const [fdOpen, setFdOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "selects" | "tab">("all");
  const [dlState, setDlState] = useState<{ label: string; done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState("");
  const [visible, setVisible] = useState(60);
  const [newFolder, setNewFolder] = useState("");
  const [withSelects, setWithSelects] = useState(true);
  const [folderError, setFolderError] = useState("");

  const mine = useMemo(() => new Set(picks.filter((p) => p.viewer === viewer).map((p) => p.photoId)), [picks, viewer]);
  const teamPicked = useMemo(() => new Set(picks.map((p) => p.photoId)), [picks]);
  const others = useMemo(() => [...new Set(picks.map((p) => p.viewer))].filter((v) => v !== viewer), [picks, viewer]);
  const openFolder = tab.startsWith("cf:") ? folders.find((f) => `cf:${f.id}` === tab) ?? null : null;

  const tabs = useMemo(() => {
    const t: { id: string; label: string; count: number; client?: boolean }[] = [{ id: "all", label: "All", count: photos.length }];
    for (const s of sets) {
      const n = photos.filter((p) => p.setId === s.id).length;
      if (n) t.push({ id: s.id, label: s.name, count: n });
    }
    for (const f of folders) t.push({ id: `cf:${f.id}`, label: f.name, count: f.photoIds.length, client: true });
    if (mine.size) t.push({ id: "mine", label: "My selects", count: mine.size });
    if (others.length) t.push({ id: "team", label: "Team selects", count: teamPicked.size });
    return t;
  }, [photos, sets, folders, mine, others, teamPicked]);

  const shown = useMemo(() => {
    if (tab === "all") return photos;
    if (tab === "mine") return photos.filter((p) => mine.has(p.id));
    if (tab === "team") return photos.filter((p) => teamPicked.has(p.id));
    if (tab.startsWith("cf:")) {
      const f = folders.find((x) => `cf:${x.id}` === tab);
      const ids = new Set(f?.photoIds ?? []);
      return photos.filter((p) => ids.has(p.id));
    }
    return photos.filter((p) => p.setId === tab);
  }, [photos, tab, mine, teamPicked, folders]);

  const picksRef = useRef(picks);
  useEffect(() => {
    picksRef.current = picks;
  }, [picks]);

  const togglePick = useCallback(
    (photoId: string) => {
      needName(async () => {
        const me = who();
        const has = (list: typeof picks) => list.some((p) => p.photoId === photoId && p.viewer === me);
        const on = !has(picksRef.current);
        const add = (prev: typeof picks) => (has(prev) ? prev : [...prev, { photoId, viewer: me }]);
        const remove = (prev: typeof picks) => prev.filter((p) => !(p.photoId === photoId && p.viewer === me));
        setPicks(on ? add : remove);
        const res = await api(slug, { op: "pick", photoId, on });
        if (!res.ok) setPicks(on ? remove : add);
      });
    },
    [slug, needName, who],
  );

  const pinPhoto = (p: GalleryPhoto) => pin({ type: "photo", id: p.id, label: p.filename, thumbKey: p.thumbKey });

  // ----- client folders -----
  async function folderOp(body: object): Promise<{ id?: string } | null> {
    setFolderError("");
    const res = await api(slug, body);
    if (!res.ok) {
      setFolderError("That didn't work. Try again.");
      return null;
    }
    const data = (await res.json()) as { folders: FolderView[]; id?: string };
    setFolders(data.folders);
    return data;
  }

  function createFolder(name: string, photoIds: string[], then?: (id: string) => void) {
    const clean = name.trim();
    if (!clean) return;
    needName(async () => {
      const r = await folderOp({ op: "folder_create", name: clean, photoIds });
      if (r?.id) {
        setNewFolder("");
        then?.(r.id);
      }
    });
  }

  function addToFolder(folderId: string, photoIds: string[]) {
    if (!photoIds.length) return;
    needName(() => folderOp({ op: "folder_add", folderId, photoIds }));
  }

  function lightboxFolder(value: string, photoId: string) {
    if (value === "__new") {
      const name = prompt("Name the new folder");
      if (name) createFolder(name, [photoId]);
    } else if (value) {
      addToFolder(value, [photoId]);
    }
  }

  // ----- downloads -----
  const scopePhotos = scope === "all" ? photos : scope === "selects" ? photos.filter((p) => mine.has(p.id)) : shown;
  const scopeLabel = scope === "all" ? "All" : scope === "selects" ? "Selects" : tabs.find((t) => t.id === tab)?.label ?? "Folder";
  const setName = (id: string | null) => sets.find((s) => s.id === id)?.name ?? "";
  const folder = (p: GalleryPhoto) => (sets.length && setName(p.setId) ? `${zipSafe(setName(p.setId))}/` : "");

  function entriesFor(preset: Preset): ZipEntry[] {
    const list = scopePhotos;
    switch (preset) {
      case "full":
        return list.filter((p) => p.originalKey).map((p) => ({ name: folder(p) + p.filename, size: p.size, url: fileUrl(p.originalKey) }));
      case "web":
        return list.filter((p) => p.previewKey).map((p) => ({ name: folder(p) + baseName(p.filename) + ".jpg", size: 1_500_000, url: fileUrl(p.previewKey) }));
      case "raw":
        return list
          .filter((p) => p.rawKey)
          .map((p) => ({ name: folder(p) + baseName(p.filename) + "." + (p.rawKey!.split(".").pop() ?? "raw"), size: p.rawSize, url: fileUrl(p.rawKey) }));
    }
  }

  const presets: { id: Preset; label: string; detail: string }[] = [
    {
      id: "full",
      label: "Full resolution",
      detail: `${plural(entriesFor("full").length, "file")} · ${formatBytes(entriesFor("full").reduce((s, e) => s + e.size, 0))}`,
    },
    { id: "web", label: "Web", detail: `JPEG, 2560px long edge · ${plural(entriesFor("web").length, "file")}` },
  ];
  if (project.rawEnabled && photos.some((p) => p.rawKey)) {
    const raws = entriesFor("raw");
    presets.push({
      id: "raw",
      label: "RAW originals",
      detail: `Camera files · ${plural(raws.length, "file")} · ${formatBytes(raws.reduce((s, e) => s + e.size, 0))}`,
    });
  }

  async function download(preset: Preset) {
    const entries = entriesFor(preset);
    if (!entries.length) return;
    const label = presets.find((p) => p.id === preset)!.label;
    const zipName = `${zipSafe(project.title)} - ${zipSafe(scopeLabel)} - ${label}.zip`;
    setDlError("");
    try {
      const target = await chooseSaveTarget(zipName, entries.reduce((s, e) => s + e.size, 0));
      if (!target) return;
      setDlOpen(false);
      setDlState({ label: `${label} · ${scopeLabel}`, done: 0, total: entries.length });
      const { failed } = await writeZip(target, zipName, entries, (done, total) => setDlState({ label: `${label} · ${scopeLabel}`, done, total }));
      api(slug, { op: "event", action: "download", detail: `${label} · ${scopeLabel} (${plural(entries.length, "file")})` });
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
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, .chat-drawer")) return;
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
      <section className="stack" style={{ padding: "40px 0 32px", gap: 14 }}>
        <Link href={`/p/${slug}`} className="small" style={{ textDecoration: "none", color: "#4a4a4a", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          Overview
        </Link>
        {project.eyebrow ? <div className="eyebrow">{project.eyebrow}</div> : null}
        <h1 className="h1">{project.title}</h1>
        <div className="meta">
          {project.shot ? <span>Shot {project.shot}</span> : null}
          <span>
            {plural(photos.length, "photo")}
            {films.length ? ` · ${plural(films.length, "film")}` : ""}
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
            <nav className="tabs" aria-label="Folders">
              {tabs.map((t) => (
                <button key={t.id} type="button" className="tab" aria-current={tab === t.id} onClick={() => {
                  setTab(t.id);
                  setVisible(60);
                }}>
                  {t.client ? <><FolderIcon />{" "}</> : null}
                  {t.label} <span className="count">{t.count}</span>
                </button>
              ))}
            </nav>
            <div className="row" style={{ padding: "8px 0" }}>
              <div className="dl-wrap">
                <button type="button" className="btn" aria-expanded={fdOpen} onClick={() => { setFdOpen((o) => !o); setDlOpen(false); }}>
                  <FolderIcon /> Folders
                </button>
                {fdOpen ? (
                  <div className="dl-menu" role="dialog" aria-label="Your folders">
                    <div className="stack" style={{ gap: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>Your folders</div>
                      <div className="small muted">Sort photos your own way. Everyone on your side sees these folders, and so does the studio.</div>
                    </div>
                    <form
                      className="stack"
                      style={{ gap: 8 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        createFolder(newFolder, withSelects ? [...mine] : [], (id) => {
                          setTab(`cf:${id}`);
                          setFdOpen(false);
                        });
                      }}
                    >
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <input className="input" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder, e.g. Website hero" aria-label="New folder name" maxLength={60} />
                        <button type="submit" className="btn btn-small" disabled={!newFolder.trim()}>Create</button>
                      </div>
                      {mine.size ? (
                        <label className="check small">
                          <input type="checkbox" checked={withSelects} onChange={(e) => setWithSelects(e.target.checked)} />
                          <span>Put my {plural(mine.size, "select")} in it</span>
                        </label>
                      ) : null}
                    </form>
                    {folders.length ? (
                      <div>
                        {folders.map((f) => (
                          <div key={f.id} className="dl-row">
                            <button type="button" className="stack" style={{ gap: 2, background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => { setTab(`cf:${f.id}`); setFdOpen(false); }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}><FolderIcon /> {f.name}</span>
                              <span className="small muted">{plural(f.photoIds.length, "photo")}{f.createdBy ? ` · made by ${f.createdBy}` : ""}</span>
                            </button>
                            {mine.size ? (
                              <button type="button" className="btn btn-small" onClick={() => addToFolder(f.id, [...mine])}>Add my selects</button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {folderError ? <p className="error" role="alert">{folderError}</p> : null}
                    <div className="small muted">Add single photos from the large view, or tick selects and add them all at once.</div>
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn" onClick={() => setTab(mine.size ? "mine" : tab)} title="Tick photos to add them to your selects">
                <CheckIcon /> Selects · {mine.size}
              </button>
              <div className="dl-wrap">
                <button type="button" className="btn btn-primary" aria-expanded={dlOpen} onClick={() => { setDlOpen((o) => !o); setFdOpen(false); }} disabled={!!dlState}>
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
                            <div className="small muted">{p.detail}</div>
                          </div>
                          <button type="button" className="btn btn-small" disabled={!entriesFor(p.id).length} onClick={() => download(p.id)} aria-label={`Download ${p.label} as ZIP`}>
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

          {openFolder ? (
            <div className="row between small" style={{ paddingTop: 16 }}>
              <span className="muted">
                Your folder{openFolder.createdBy ? `, made by ${openFolder.createdBy}` : ""}.{openFolder.photoIds.length ? "" : " Empty so far: add photos from the large view or the Folders menu."}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-small" onClick={() => {
                  const name = prompt("Rename folder", openFolder.name);
                  if (name?.trim()) needName(() => folderOp({ op: "folder_rename", folderId: openFolder.id, name }));
                }}>Rename</button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => {
                  if (confirm(`Delete the folder “${openFolder.name}”? The photos stay in the gallery.`)) {
                    folderOp({ op: "folder_delete", folderId: openFolder.id });
                    setTab("all");
                  }
                }}>Delete folder</button>
              </span>
            </div>
          ) : null}

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
                  <button type="button" className="pin-btn" onClick={() => pinPhoto(p)} aria-label={`Pin ${p.filename} to a message`} title="Pin to a message">
                    <PinIcon />
                  </button>
                  <button type="button" className="pick" aria-pressed={mine.has(p.id)} aria-label={`${mine.has(p.id) ? "Remove" : "Add"} ${p.filename} ${mine.has(p.id) ? "from" : "to"} your selects`} onClick={() => togglePick(p.id)}>
                    <CheckIcon />
                  </button>
                  {others.length && picks.some((k) => k.photoId === p.id && k.viewer !== viewer) ? (
                    <span className="pick-count">{picks.filter((k) => k.photoId === p.id && k.viewer !== viewer).map((k) => k.viewer.split(" ")[0]).join(", ")}</span>
                  ) : null}
                </div>
                <figcaption className="tile-cap">
                  <span>{p.filename}</span>
                  {openFolder ? (
                    <button type="button" className="chat-del" style={{ padding: 0 }} onClick={() => folderOp({ op: "folder_remove", folderId: openFolder.id, photoIds: [p.id] })}>Remove from folder</button>
                  ) : (
                    <span>{setName(p.setId)}</span>
                  )}
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

      <footer id="terms" className="stack" style={{ marginTop: 80, paddingTop: 24, paddingBottom: 96, borderTop: "1px solid var(--line)", gap: 12 }}>
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
              <button type="button" className="lb-btn" onClick={() => pinPhoto(current)}>
                <PinIcon /> Pin
              </button>
              <select
                className="lb-btn lb-select"
                value=""
                aria-label="Add to folder"
                onChange={(e) => lightboxFolder(e.target.value, current.id)}
              >
                <option value="">Add to folder…</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id} disabled={f.photoIds.includes(current.id)}>
                    {f.name}{f.photoIds.includes(current.id) ? " ✓" : ""}
                  </option>
                ))}
                <option value="__new">+ New folder…</option>
              </select>
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
    </main>
  );
}
