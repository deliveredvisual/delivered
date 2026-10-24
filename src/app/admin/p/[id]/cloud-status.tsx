"use client";

import { useEffect, useState } from "react";
import { formatBytes, plural } from "@/lib/format";
import type { CloudStatus } from "@/lib/cloud/jobs";

/**
 * One line per connected service under the client link: "Dropbox: all 40 files copied", "Google Drive: copying,
 * 12 left (1.2 GB)". While files are waiting it checks every few seconds, which also keeps the copying moving.
 */
export function CloudStatusLine({ projectId, initial }: { projectId: string; initial: CloudStatus[] }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const active = status.some((s) => s.waiting > 0 && !s.error);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/admin/cloud?project=${projectId}`, { cache: "no-store" });
        if (r.ok && !stop) setStatus(((await r.json()) as { status: CloudStatus[] }).status);
      } catch {}
    };
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [active, projectId]);

  async function act(op: "copy_existing" | "retry", provider: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/cloud", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, provider, projectId }) });
      if (r.ok) setStatus(((await r.json()) as { status: CloudStatus[] }).status);
    } finally {
      setBusy(false);
    }
  }

  if (!status.length) return null;
  return (
    <div className="cloud-status small">
      {status.map((s) => (
        <div key={s.provider} className="cloud-line">
          <span className={`cloud-dot ${s.error || s.failed ? "bad" : s.waiting ? "busy" : s.done ? "ok" : ""}`} aria-hidden="true" />
          <span>
            <strong style={{ fontWeight: 500 }}>{s.name}:</strong>{" "}
            {s.error
              ? "paused, reconnect it on the Team page"
              : s.waiting
                ? `copying, ${s.waiting} left${s.bytesLeft ? ` (${formatBytes(s.bytesLeft)})` : ""}`
                : s.done
                  ? `${s.done === 1 ? "1 file" : `all ${s.done} files`} copied`
                  : s.missing
                    ? "nothing copied yet"
                    : "new uploads will be copied"}
            {s.failed ? <span className="warn">{` · ${plural(s.failed, "file")} failed`}</span> : null}
          </span>
          {s.failed && !s.error ? (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => act("retry", s.provider)} title={s.lastError ?? undefined}>Try again</button>
          ) : null}
          {s.missing && !s.error ? (
            <button type="button" className="btn btn-small" disabled={busy} onClick={() => act("copy_existing", s.provider)}>
              Copy {plural(s.missing, "earlier file")}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
