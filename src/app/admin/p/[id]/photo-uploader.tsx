"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clientId, ext, imageVariants, isImage, isRaw, pool, safeName, uploadBlob } from "@/lib/upload-client";

type Item = { name: string; size: number; sent: number; state: "waiting" | "uploading" | "done" | "error"; note?: string };

export function PhotoUploader({ projectId, sets }: { projectId: string; sets: { id: string; name: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [setId, setSetId] = useState<string>(sets[0]?.id ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const update = (i: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function start(files: File[]) {
    const wanted = files.filter((f) => isImage(f.name) || isRaw(f.name));
    if (!wanted.length || busy) return;
    // JPEGs first so RAW files find their partner by name.
    wanted.sort((a, b) => Number(isRaw(a.name)) - Number(isRaw(b.name)) || a.name.localeCompare(b.name));
    setItems(wanted.map((f) => ({ name: f.name, size: f.size, sent: 0, state: "waiting" })));
    setBusy(true);
    const firstRaw = wanted.findIndex((f) => isRaw(f.name));
    const images = firstRaw === -1 ? wanted : wanted.slice(0, firstRaw);
    const raws = firstRaw === -1 ? [] : wanted.slice(firstRaw);

    const job = async (file: File, i: number) => {
      update(i, { state: "uploading" });
      try {
        const id = clientId();
        if (isRaw(file.name)) {
          const key = `p/${projectId}/photos/${id}/raw.${ext(file.name)}`;
          await uploadBlob(key, file, (sent) => update(i, { sent }));
          const res = await fetch("/api/admin/photos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ op: "raw", projectId, setId: setId || null, filename: file.name, key, size: file.size }),
          }).then((r) => r.json() as Promise<{ paired?: boolean }>);
          update(i, { state: "done", sent: file.size, note: res.paired ? "paired" : "no JPEG yet" });
          return;
        }
        const variants = await imageVariants(file);
        const folder = `p/${projectId}/photos/${id}`;
        const originalKey = `${folder}/${safeName(file.name)}`;
        await uploadBlob(originalKey, file, (sent) => update(i, { sent }));
        let previewKey: string | null = null;
        let thumbKey: string | null = null;
        if (variants) {
          previewKey = `${folder}/preview.jpg`;
          thumbKey = `${folder}/thumb.jpg`;
          await uploadBlob(previewKey, variants.preview);
          await uploadBlob(thumbKey, variants.thumb);
        }
        const r = await fetch("/api/admin/photos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: "photo",
            projectId,
            id,
            setId: setId || null,
            filename: file.name,
            size: file.size,
            width: variants?.width ?? null,
            height: variants?.height ?? null,
            originalKey,
            previewKey,
            thumbKey,
          }),
        });
        if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Couldn't save");
        update(i, { state: "done", sent: file.size, note: variants ? undefined : "no preview" });
      } catch (e) {
        update(i, { state: "error", note: e instanceof Error ? e.message : "Failed" });
      }
    };

    await pool(images, 3, (f, i) => job(f, i));
    await pool(raws, 2, (f, i) => job(f, images.length + i));
    setBusy(false);
    router.refresh();
  }

  const total = items.reduce((s, it) => s + it.size, 0);
  const sent = items.reduce((s, it) => s + Math.min(it.sent, it.size), 0);
  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "error").length;

  return (
    <div className="stack">
      {sets.length ? (
        <div className="row">
          <label className="label" htmlFor="upload-set">Add to folder</label>
          <select id="upload-set" className="select" style={{ width: "auto" }} value={setId} onChange={(e) => setSetId(e.target.value)} disabled={busy}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="">No folder</option>
          </select>
        </div>
      ) : null}
      <div
        className={`dropzone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          start([...e.dataTransfer.files]);
        }}
      >
        <div>Drop your exported JPEGs here, along with RAW files if you’re offering them.</div>
        <div className="small muted">RAW files are matched to their JPEG by file name (AP_0412.ARW goes with AP_0412.jpg).</div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={[".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic", ".arw", ".cr2", ".cr3", ".nef", ".raf", ".dng", ".orf", ".rw2", ".iiq", ".3fr"].join(",")}
          onChange={(e) => {
            start([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
          Choose files
        </button>
      </div>
      {items.length ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row between small">
            <span>
              {busy ? "Uploading" : "Finished"}: {done} of {items.length} files{failed ? `, ${failed} failed` : ""}
            </span>
            <span className="muted">{Math.round((sent / Math.max(total, 1)) * 100)}%</span>
          </div>
          <div className="progress" aria-hidden="true"><div style={{ width: `${(sent / Math.max(total, 1)) * 100}%` }} /></div>
          <div className="upload-list">
            {items.map((it, i) => (
              <div key={i} className="upload-item">
                <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                <div className="progress"><div style={{ width: `${(Math.min(it.sent, it.size) / Math.max(it.size, 1)) * 100}%` }} /></div>
                <span className={it.state === "error" ? "error small" : "small muted"} title={it.note}>
                  {it.state === "done" ? it.note ?? "Done" : it.state === "error" ? "Failed" : it.state === "uploading" ? "…" : "Queued"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
