"use client";

import { useActionState, useState } from "react";
import { fileUrl } from "@/lib/urls";
import { LANDING_LAYOUTS, LANDING_SWATCHES, landingTheme, validHex } from "@/lib/landing";
import { updateLanding, type LandingState } from "../../actions";

type Settings = { layout: string; bg: string; coverId: string | null; intro: string; spacing: string; groupFolders: boolean; titleOnCover: boolean; coverDim: number };

/** Little drawings of each layout, so the choice is obvious at a glance. */
function LayoutSketch({ id }: { id: string }) {
  const b = { fill: "currentColor", opacity: 0.55 } as const;
  const shapes: Record<string, React.ReactNode> = {
    collage: (
      <>
        <rect x="0" y="0" width="34" height="18" {...b} /><rect x="36" y="0" width="20" height="18" {...b} /><rect x="58" y="0" width="22" height="18" {...b} />
        <rect x="0" y="20" width="22" height="18" {...b} /><rect x="24" y="20" width="36" height="18" {...b} /><rect x="62" y="20" width="18" height="18" {...b} />
      </>
    ),
    masonry: (
      <>
        <rect x="0" y="0" width="25" height="22" {...b} /><rect x="0" y="24" width="25" height="14" {...b} />
        <rect x="27" y="0" width="26" height="12" {...b} /><rect x="27" y="14" width="26" height="24" {...b} />
        <rect x="55" y="0" width="25" height="26" {...b} /><rect x="55" y="28" width="25" height="10" {...b} />
      </>
    ),
    grid: (
      <>
        <rect x="0" y="0" width="25" height="18" {...b} /><rect x="27" y="0" width="26" height="18" {...b} /><rect x="55" y="0" width="25" height="18" {...b} />
        <rect x="0" y="20" width="25" height="18" {...b} /><rect x="27" y="20" width="26" height="18" {...b} /><rect x="55" y="20" width="25" height="18" {...b} />
      </>
    ),
    large: (
      <>
        <rect x="6" y="0" width="68" height="24" {...b} /><rect x="6" y="26" width="68" height="12" {...b} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 80 38" width="80" height="38" aria-hidden="true">{shapes[id]}</svg>
  );
}

export function LandingForm({
  projectId,
  settings,
  photos,
  title,
  date,
}: {
  projectId: string;
  settings: Settings;
  photos: { id: string; filename: string; thumbKey: string | null }[];
  title: string;
  date: string;
}) {
  const [state, action, pending] = useActionState<LandingState, FormData>(updateLanding.bind(null, projectId), { error: "" });
  const [layout, setLayout] = useState(settings.layout);
  const [bg, setBg] = useState(settings.bg);
  const [custom, setCustom] = useState(settings.bg);
  const [spacing, setSpacing] = useState(settings.spacing);
  const [cover, setCover] = useState(settings.coverId ?? "");
  const [onCover, setOnCover] = useState(settings.titleOnCover);
  const [dim, setDim] = useState(settings.coverDim);
  const coverThumb = (photos.find((ph) => ph.id === cover) ?? photos[0])?.thumbKey ?? null;
  const [dirty, setDirty] = useState(false);
  const setSaved = (v: boolean) => setDirty(!v);
  const theme = landingTheme(bg) as React.CSSProperties;

  return (
    <form
      action={action}
      onSubmit={() => setDirty(false)}
      className="stack"
      style={{ gap: 28, maxWidth: 900 }}
      onChange={() => setSaved(false)}
    >
      <input type="hidden" name="layout" value={layout} />
      <input type="hidden" name="bg" value={bg} />
      <input type="hidden" name="spacing" value={spacing} />
      <input type="hidden" name="cover" value={cover} />

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
        <legend className="h3" style={{ marginBottom: 10 }}>Photo layout</legend>
        <div className="landing-choices">
          {LANDING_LAYOUTS.map((l) => (
            <button key={l.id} type="button" className="landing-choice" aria-pressed={layout === l.id} onClick={() => { setLayout(l.id); setSaved(false); }} style={{ ...theme, background: "var(--ground)", color: "var(--ink)" }}>
              <LayoutSketch id={l.id} />
              <span style={{ fontWeight: 500 }}>{l.label}</span>
              <span className="small" style={{ color: "var(--muted)" }}>{l.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
        <legend className="h3" style={{ marginBottom: 10 }}>Background</legend>
        <div className="row" style={{ gap: 10 }}>
          {LANDING_SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              className="swatch"
              aria-pressed={bg.toLowerCase() === s.value}
              aria-label={s.label}
              title={s.label}
              onClick={() => { setBg(s.value); setSaved(false); }}
              style={{ background: s.value }}
            />
          ))}
          <label className="row small" style={{ gap: 8, marginLeft: 6 }}>
            <input
              type="color"
              value={validHex(custom) ? custom : "#ffffff"}
              onChange={(e) => { setCustom(e.target.value); setBg(e.target.value); setSaved(false); }}
              aria-label="Custom background colour"
              style={{ width: 44, height: 44, padding: 0, border: "1px solid var(--line-strong)", background: "none", cursor: "pointer" }}
            />
            Custom <span className="mono muted">{bg}</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
        <legend className="h3" style={{ marginBottom: 10 }}>Spacing between photos</legend>
        <div className="row" style={{ gap: 6 }}>
          {[["tight", "Tight"], ["normal", "Normal"], ["airy", "Airy"]].map(([id, label]) => (
            <button key={id} type="button" className="btn btn-small pill" aria-pressed={spacing === id} onClick={() => { setSpacing(id); setSaved(false); }}>{label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
        <legend className="h3" style={{ marginBottom: 10 }}>Cover photo</legend>
        {photos.length ? (
          <div className="cover-pick" role="radiogroup" aria-label="Cover photo">
            <button type="button" role="radio" aria-checked={!cover} className="cover-opt auto" onClick={() => { setCover(""); setSaved(false); }}>
              <span className="small">First photo</span>
            </button>
            {photos.map((ph) => (
              <button key={ph.id} type="button" role="radio" aria-checked={cover === ph.id} className="cover-opt" onClick={() => { setCover(ph.id); setSaved(false); }} title={ph.filename} aria-label={ph.filename}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileUrl(ph.thumbKey)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>Upload photos to choose a cover. Until then the page opens with the title.</p>
        )}
      </fieldset>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 12 }}>
        <legend className="h3" style={{ marginBottom: 10 }}>Title on the cover</legend>
        <label className="check">
          <input type="checkbox" name="titleOnCover" checked={onCover} onChange={(e) => { setOnCover(e.target.checked); setDirty(true); }} />
          <span>Show the title and date over the cover photo, with the photo darkened so they read clearly</span>
        </label>
        {onCover ? (
          <div className="row" style={{ gap: 20, alignItems: "flex-start" }}>
            <div className="field" style={{ minWidth: 240 }}>
              <label htmlFor="cover-dim">Darken the photo: <span className="mono">{dim}%</span></label>
              <input id="cover-dim" name="coverDim" type="range" min={0} max={80} step={5} value={dim} onChange={(e) => { setDim(Number(e.target.value)); setDirty(true); }} />
            </div>
            <div className="cover-preview" aria-hidden="true">
              {coverThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(coverThumb)} alt="" />
              ) : null}
              <div className="cover-shade" style={{ background: `rgba(0,0,0,${dim / 100})` }} />
              <div className="cover-text">
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.1 }}>{title}</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>{date}</div>
              </div>
            </div>
          </div>
        ) : (
          <input type="hidden" name="coverDim" value={dim} />
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="landing-intro" className="h3" style={{ marginBottom: 4 }}>Note to your client</label>
        <textarea id="landing-intro" name="intro" className="textarea" rows={3} defaultValue={settings.intro} maxLength={2000} placeholder="e.g. Thanks for a great day at Fuji. Here are the finals from the launch shoot. Videos are at the top." />
        <span className="small muted">Shown under the title. Leave empty for none.</span>
      </div>

      <label className="check">
        <input type="checkbox" name="groupFolders" defaultChecked={settings.groupFolders} />
        <span>Show photos in sections by folder</span>
      </label>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save landing page"}</button>
        {state.savedAt && !dirty && !pending && !state.error ? <span className="small good" role="status">Saved</span> : null}
      </div>
    </form>
  );
}
