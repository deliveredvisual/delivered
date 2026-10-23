"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fileUrl } from "@/lib/urls";
import { formatBytes, formatTimecode } from "@/lib/format";
import { api } from "../../name-prompt";
import { PinIcon, useShell } from "../../client-shell";

type Version = {
  id: string;
  version: number;
  fileKey: string;
  posterKey: string | null;
  filename: string;
  size: number;
  duration: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
};

type CommentRow = {
  id: string;
  versionId: string;
  author: string;
  org: string;
  timecode: number;
  body: string;
  resolved: boolean;
};

export function Review(props: {
  slug: string;
  projectTitle: string;
  startVersion?: string;
  startAt?: number;
  film: { id: string; title: string; aspect: string };
  versions: Version[];
  comments: CommentRow[];
}) {
  const { slug, film } = props;
  const [versions, setVersions] = useState(props.versions);
  const [versionId, setVersionId] = useState(props.startVersion ?? props.versions.at(-1)!.id);
  const [comments, setComments] = useState(props.comments);
  const { viewer, who, needName, pin } = useShell();
  const startAt = useRef(props.startAt);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState("");
  const [draftAt, setDraftAt] = useState(0);
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);

  const v = versions.find((x) => x.id === versionId)!;
  const list = useMemo(() => comments.filter((c) => c.versionId === versionId).sort((a, b) => a.timecode - b.timecode), [comments, versionId]);
  const open = list.filter((c) => !c.resolved).length;
  const total = duration || v.duration || 0;

  useEffect(() => {
    api(slug, { op: "event", action: "view_film", detail: `${film.title} v${v.version}` });
  }, [slug, film.title, v.version]);

  // Opened from a pinned moment: jump there once the video knows its length (it may already, before this runs).
  useEffect(() => {
    const el = video.current;
    const at = startAt.current;
    if (!el || at === undefined) return;
    const go = () => {
      el.currentTime = at;
      startAt.current = undefined;
    };
    if (el.readyState >= 1) go();
    else el.addEventListener("loadedmetadata", go, { once: true });
    return () => el.removeEventListener("loadedmetadata", go);
  }, [versionId]);

  function pinMoment() {
    const at = Math.floor(video.current?.currentTime ?? time);
    video.current?.pause();
    pin({ type: "film", id: film.id, label: film.title, thumbKey: v.posterKey, versionId: v.id, version: v.version, timecode: at });
  }

  function seek(sec: number) {
    if (!video.current) return;
    video.current.currentTime = sec;
    video.current.pause();
  }

  async function post() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    const res = await api(slug, { op: "comment", versionId, timecode: draftAt, body: text, org });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't post that comment. Try again.");
      return;
    }
    const { comment } = (await res.json()) as { comment: CommentRow };
    setComments((prev) => [...prev, comment]);
    setDraft("");
  }

  async function resolve(c: CommentRow) {
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, resolved: !c.resolved } : x)));
    const res = await api(slug, { op: "resolve", commentId: c.id, resolved: !c.resolved });
    if (!res.ok) setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, resolved: c.resolved } : x)));
  }

  async function approve() {
    const res = await api(slug, { op: "approve", versionId });
    if (res.ok) {
      setVersions((prev) => prev.map((x) => (x.id === versionId ? { ...x, approvedBy: who(), approvedAt: new Date().toISOString() } : x)));
    }
  }

  async function undoApprove() {
    const res = await api(slug, { op: "unapprove", versionId });
    if (res.ok) {
      setVersions((prev) => prev.map((x) => (x.id === versionId ? { ...x, approvedBy: null, approvedAt: null } : x)));
    }
  }

  return (
    <main className="wrap stack" style={{ paddingTop: 32, gap: 24 }}>
      <Link href={`/p/${slug}`} className="small" style={{ textDecoration: "none", color: "#4a4a4a", minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        {props.projectTitle}
      </Link>

      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="h2 page-title">{film.title}</h1>
          <div className="small" style={{ color: "#4a4a4a" }}>
            {film.aspect}
            {total ? ` · ${formatTimecode(total)}` : ""} · {formatBytes(v.size)}
          </div>
        </div>
        {versions.length > 1 ? (
          <div className="row" role="group" aria-label="Versions" style={{ gap: 6 }}>
            {versions.map((x) => (
              <button key={x.id} type="button" className="btn pill" aria-pressed={x.id === versionId} onClick={() => setVersionId(x.id)} style={{ minWidth: 52 }}>
                v{x.version}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="review">
        <div className="review-main">
          <div className="stage">
            <video
              key={v.id}
              ref={video}
              src={fileUrl(v.fileKey)}
              poster={v.posterKey ? fileUrl(v.posterKey) : undefined}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            />
          </div>
          <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
            <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
              {formatTimecode(time)} / {formatTimecode(total)}
            </span>
            <div className="scrub">
              <div className="scrub-line" />
              <div className="scrub-fill" style={{ width: `${total ? (time / total) * 100 : 0}%` }} />
              {total
                ? list.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`marker${c.resolved ? " done" : ""}`}
                      style={{ left: `${Math.min(100, (c.timecode / total) * 100)}%` }}
                      title={`${formatTimecode(c.timecode)} · ${c.author}`}
                      aria-label={`Jump to comment at ${formatTimecode(c.timecode)}`}
                      onClick={() => seek(c.timecode)}
                    />
                  ))
                : null}
            </div>
          </div>
          <div className="row">
            {v.approvedAt ? (
              <>
                <span className="good small" style={{ fontWeight: 600 }}>
                  Approved by {v.approvedBy}
                </span>
                <button type="button" className="btn btn-small" onClick={() => needName(undoApprove)}>
                  Undo approval
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => needName(approve)}>
                Approve v{v.version}
              </button>
            )}
            <button type="button" className="btn" onClick={pinMoment} title="Pin this film at the current moment to a message">
              <PinIcon /> Pin at {formatTimecode(Math.floor(time))}
            </button>
            <a className="btn" href={fileUrl(v.fileKey, `${props.projectTitle} - ${film.title} v${v.version}.${v.filename.split(".").pop() ?? "mp4"}`)}>
              Download v{v.version}
            </a>
          </div>
        </div>

        <aside className="review-side" aria-label="Comments">
          <div className="row between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
            <span className="h3">Comments</span>
            <span className="small muted">{open} open</span>
          </div>
          {list.length === 0 ? <p className="small muted" style={{ padding: "16px 20px", margin: 0 }}>No comments on v{v.version} yet.</p> : null}
          {list.map((c) => (
            <div key={c.id} className={`comment${c.resolved ? " done" : ""}`}>
              <div className="row between" style={{ alignItems: "baseline", flexWrap: "nowrap" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {c.author} {c.org ? <span className="muted" style={{ fontWeight: 400 }}>· {c.org}</span> : null}
                </div>
                <button type="button" className="tc" onClick={() => seek(c.timecode)} aria-label={`Jump to ${formatTimecode(c.timecode)}`}>
                  {formatTimecode(c.timecode)}
                </button>
              </div>
              <div className="body" style={{ fontSize: 14, whiteSpace: "pre-line" }}>{c.body}</div>
              <button type="button" className="btn btn-small" style={{ alignSelf: "flex-start", minHeight: 32 }} onClick={() => resolve(c)}>
                {c.resolved ? "Reopen" : "Resolve"}
              </button>
            </div>
          ))}
          <form
            className="stack"
            style={{ padding: "16px 20px", gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              needName(post);
            }}
          >
            <label htmlFor="new-comment" className="small" style={{ color: "var(--ink-2)" }}>
              Comment at <span className="mono">{formatTimecode(draftAt)}</span>
            </label>
            <textarea
              id="new-comment"
              className="textarea"
              rows={3}
              placeholder="What should change here?"
              value={draft}
              onFocus={() => {
                video.current?.pause();
                setDraftAt(Math.floor(video.current?.currentTime ?? time));
              }}
              onChange={(e) => setDraft(e.target.value)}
            />
            {!viewer ? null : (
              <input className="input" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Company (optional)" aria-label="Your company" maxLength={60} />
            )}
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }} disabled={busy || !draft.trim()}>
              {busy ? "Posting…" : "Post"}
            </button>
          </form>
        </aside>
      </div>

    </main>
  );
}
