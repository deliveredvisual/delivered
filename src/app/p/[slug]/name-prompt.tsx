"use client";

import { useEffect, useRef, useState } from "react";

export async function api(slug: string, body: object): Promise<Response> {
  return fetch(`/api/p/${slug}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function NamePrompt({ slug, onDone, onCancel }: { slug: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="lightbox" style={{ background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} role="dialog" aria-modal="true" aria-labelledby="name-title">
      <form
        className="stack panel"
        style={{ background: "#fff", color: "var(--ink)", width: "min(420px, calc(100vw - 32px))" }}
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await api(slug, { op: "viewer", name });
          if (res.ok) onDone(name.trim());
          else setErr("Please enter your name.");
        }}
      >
        <h2 id="name-title" className="h3">What’s your name?</h2>
        <p className="small muted" style={{ margin: 0 }}>So everyone knows whose selects and comments are whose.</p>
        <input ref={ref} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah Whitfield" aria-label="Your name" required maxLength={60} />
        {err ? <p className="error">{err}</p> : null}
        <div className="row">
          <button type="submit" className="btn btn-primary">Continue</button>
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
