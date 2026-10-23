"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fileUrl } from "@/lib/urls";
import { formatTimecode } from "@/lib/format";
import { pinHref, type ChatMessage, type PinView } from "@/lib/chat-types";
import { NamePrompt, api } from "./name-prompt";

type Shell = {
  slug: string;
  viewer: string;
  isStudio: boolean;
  /** The current name, right now (even straight after they've typed it). */
  who: () => string;
  /** Runs `fn` once we know the person's name, asking for it first if needed. */
  needName: (fn: () => void) => void;
  /** Adds a photo or film to the message being written. */
  pin: (p: PinView) => void;
  openChat: () => void;
};

const Ctx = createContext<Shell | null>(null);

export function useShell(): Shell {
  const s = useContext(Ctx);
  if (!s) throw new Error("useShell outside ClientShell");
  return s;
}

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 4h6l-1 6 4 3v2h-5v5l-1 1-1-1v-5H6v-2l4-3z" /></svg>
);
export { PinIcon };

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
);

function when(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

function pinCaption(p: PinView): string {
  if (p.type === "photo") return p.label;
  return `${p.label}${p.version ? ` v${p.version}` : ""}${p.timecode !== undefined ? ` · ${formatTimecode(p.timecode)}` : ""}`;
}

function PinChip({ slug, p, newTab, onRemove }: { slug: string; p: PinView; newTab?: boolean; onRemove?: () => void }) {
  const inner = (
    <>
      <span className="pin-thumb">
        {p.thumbKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl(p.thumbKey)} alt="" loading="lazy" />
        ) : (
          <span className="mono" style={{ fontSize: 10 }}>{p.type === "film" ? "FILM" : "PHOTO"}</span>
        )}
        {p.type === "film" ? <span className="pin-play" aria-hidden="true">▶</span> : null}
      </span>
      <span className="pin-cap">{pinCaption(p)}</span>
    </>
  );
  if (onRemove) {
    return (
      <span className="pin-chip">
        {inner}
        <button type="button" className="pin-x" onClick={onRemove} aria-label={`Unpin ${pinCaption(p)}`}>×</button>
      </span>
    );
  }
  return (
    <a className="pin-chip" href={pinHref(slug, p)} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined}>
      {inner}
    </a>
  );
}

/**
 * Wraps every client page (and the studio's project page): knows who is looking, and owns the project chat —
 * a button in the corner that opens a side panel, with photos and films pinned into messages.
 */
export function ClientShell({
  slug,
  viewer: initialViewer,
  isStudio = false,
  newTabLinks = false,
  children,
}: {
  slug: string;
  viewer: string;
  isStudio?: boolean;
  newTabLinks?: boolean;
  children: ReactNode;
}) {
  const [viewer, setViewer] = useState(initialViewer);
  const viewerRef = useRef(initialViewer);
  const [askName, setAskName] = useState<null | (() => void)>(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pins, setPins] = useState<PinView[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const seenKey = `dv_seen_${slug}`;
  // When this person last read the chat (kept in their browser). Messages load after the page does, so the
  // server and browser agree on "no unread" during the first render.
  const [seen, setSeen] = useState(() => {
    try {
      return typeof window === "undefined" ? 0 : Number(localStorage.getItem(seenKey)) || 0;
    } catch {
      return 0;
    }
  });
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/p/${slug}/messages`, { cache: "no-store" });
      if (res.ok) setMsgs(((await res.json()) as { messages: ChatMessage[] }).messages);
    } catch {}
  }, [slug]);

  // Check for new messages: often while the panel is open, now and then while it's closed.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, open ? 8000 : 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, open]);

  const latest = msgs?.at(-1)?.at ?? 0;
  const mine = useCallback((m: ChatMessage) => (isStudio ? m.fromStudio : !m.fromStudio && m.author === viewer), [isStudio, viewer]);
  const unread = useMemo(() => (msgs ?? []).filter((m) => m.at > seen && !mine(m)).length, [msgs, seen, mine]);

  // Opening or closing the panel marks everything as read.
  const markRead = useCallback(() => {
    if (!latest) return;
    setSeen(latest);
    try {
      localStorage.setItem(seenKey, String(latest));
    } catch {}
  }, [latest, seenKey]);
  const openPanel = useCallback(() => {
    markRead();
    setOpen(true);
  }, [markRead]);
  const closePanel = useCallback(() => {
    markRead();
    setOpen(false);
  }, [markRead]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, msgs?.length]);

  useEffect(() => {
    if (!open) return;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePanel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, closePanel]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const needName = useCallback((fn: () => void) => (viewerRef.current ? fn() : setAskName(() => fn)), []);

  const pin = useCallback((p: PinView) => {
    setPins((prev) => {
      const key = JSON.stringify(p);
      return prev.some((x) => JSON.stringify(x) === key) ? prev : [...prev, p];
    });
    setToast(`Pinned ${pinCaption(p)}`);
  }, []);

  async function send() {
    if (!draft.trim() && !pins.length) return;
    setSending(true);
    setError("");
    const res = await api(slug, {
      op: "message",
      body: draft,
      pins: pins.map((p) => (p.type === "photo" ? { type: "photo", id: p.id } : { type: "film", id: p.id, versionId: p.versionId, timecode: p.timecode })),
    });
    setSending(false);
    if (!res.ok) {
      setError("Couldn't send that. Try again.");
      return;
    }
    setMsgs(((await res.json()) as { messages: ChatMessage[] }).messages);
    setDraft("");
    setPins([]);
  }

  async function remove(id: string) {
    if (!confirm("Delete this message for everyone?")) return;
    const res = await api(slug, { op: "delete_message", messageId: id });
    if (res.ok) setMsgs(((await res.json()) as { messages: ChatMessage[] }).messages);
  }

  const shell = useMemo<Shell>(
    () => ({ slug, viewer, isStudio, who: () => viewerRef.current, needName, pin, openChat: openPanel }),
    [slug, viewer, isStudio, needName, pin, openPanel],
  );

  return (
    <Ctx.Provider value={shell}>
      {children}

      <button type="button" className="chat-fab" onClick={openPanel} aria-label={`Messages${unread ? `, ${unread} new` : ""}`} hidden={open}>
        <ChatIcon /> Messages
        {unread ? <span className="chat-badge">{unread}</span> : pins.length ? <span className="chat-badge muted-badge">{pins.length} pinned</span> : null}
      </button>

      {toast && !open ? (
        <div className="chat-toast" role="status">
          <PinIcon /> {toast}
          <button type="button" className="btn btn-small" onClick={openPanel}>Write message</button>
        </div>
      ) : null}

      {open ? (
        <aside className="chat-drawer" aria-label="Messages">
          <div className="row between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", flexWrap: "nowrap" }}>
            <span className="h3">Messages</span>
            <button type="button" className="btn btn-small" onClick={closePanel} aria-label="Close messages">Close</button>
          </div>
          <div className="chat-list" ref={listRef}>
            {msgs === null ? <p className="small muted" style={{ margin: 0 }}>Loading…</p> : null}
            {msgs?.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                {isStudio
                  ? "No messages yet. Anything you write here is seen by everyone with the link."
                  : "Ask a question or leave a note for the studio. Pin photos or a moment in a film so everyone knows exactly what you mean."}
              </p>
            ) : null}
            {msgs?.map((m) => (
              <div key={m.id} className={`chat-msg${m.fromStudio ? " studio" : ""}`}>
                <div className="row between" style={{ flexWrap: "nowrap", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {m.author}
                    {m.fromStudio ? <span className="chat-tag">Studio</span> : null}
                  </span>
                  <span className="small muted" style={{ whiteSpace: "nowrap" }}>{when(m.at)}</span>
                </div>
                {m.body ? <div style={{ whiteSpace: "pre-line", fontSize: 14 }}>{m.body}</div> : null}
                {m.pins.length ? (
                  <div className="pin-row">
                    {m.pins.map((p, i) => <PinChip key={i} slug={slug} p={p} newTab={newTabLinks} />)}
                  </div>
                ) : null}
                {isStudio ? (
                  <button type="button" className="chat-del small" onClick={() => remove(m.id)}>Delete</button>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              needName(send);
            }}
          >
            {pins.length ? (
              <div className="pin-row">
                {pins.map((p, i) => <PinChip key={i} slug={slug} p={p} onRemove={() => setPins((prev) => prev.filter((_, j) => j !== i))} />)}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                <PinIcon /> {isStudio ? "To pin photos or films, open the delivery as a client and use Pin." : "Use Pin on any photo or film to attach it."}
              </p>
            )}
            <label htmlFor="chat-box" className="sr-only">Message</label>
            <textarea
              id="chat-box"
              ref={boxRef}
              className="textarea"
              rows={3}
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  needName(send);
                }
              }}
            />
            {error ? <p className="error" role="alert">{error}</p> : null}
            <div className="row between">
              <span className="small muted">{viewer ? `As ${viewer}` : ""}</span>
              <button type="submit" className="btn btn-primary" disabled={sending || (!draft.trim() && !pins.length)}>{sending ? "Sending…" : "Send"}</button>
            </div>
          </form>
        </aside>
      ) : null}

      {askName ? (
        <NamePrompt
          slug={slug}
          onDone={(name) => {
            viewerRef.current = name;
            setViewer(name);
            const fn = askName;
            setAskName(null);
            setTimeout(() => fn(), 0);
          }}
          onCancel={() => setAskName(null)}
        />
      ) : null}
    </Ctx.Provider>
  );
}
