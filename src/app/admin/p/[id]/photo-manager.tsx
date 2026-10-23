"use client";

import { useMemo, useState, useTransition } from "react";
import { fileUrl } from "@/lib/urls";
import { formatBytes } from "@/lib/format";
import { createSetWithPhotos, deletePhotos, movePhotos } from "../../actions";

type PhotoLite = {
  id: string;
  filename: string;
  setId: string | null;
  thumbKey: string | null;
  rawKey: string | null;
  originalKey: string | null;
  size: number;
  rawSize: number;
  picks: number;
};

export function PhotoManager({
  projectId,
  photos,
  sets,
  clientFolders = [],
}: {
  projectId: string;
  photos: PhotoLite[];
  sets: { id: string; name: string }[];
  clientFolders?: { id: string; name: string; photoIds: string[] }[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(sets[0]?.id ?? "__new");
  const [pending, start] = useTransition();

  const shown = useMemo(
    () =>
      photos.filter((p) =>
        filter === "all"
          ? true
          : filter === "none"
            ? !p.setId
            : filter === "picked"
              ? p.picks > 0
              : filter.startsWith("cf:")
                ? !!clientFolders.find((f) => `cf:${f.id}` === filter)?.photoIds.includes(p.id)
                : p.setId === filter,
      ),
    [photos, filter, clientFolders],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];
  const setName = (id: string | null) => sets.find((s) => s.id === id)?.name ?? "No folder";

  return (
    <div className="stack">
      <div className="row between">
        <div className="row" style={{ gap: 6 }}>
          {[{ id: "all", name: `All · ${photos.length}` }, ...sets.map((s) => ({ id: s.id, name: `${s.name} · ${photos.filter((p) => p.setId === s.id).length}` })), ...(photos.some((p) => !p.setId) && sets.length ? [{ id: "none", name: "No folder" }] : []), ...clientFolders.map((f) => ({ id: `cf:${f.id}`, name: `Client folder: ${f.name} · ${f.photoIds.length}` })), { id: "picked", name: `Picked by client · ${photos.filter((p) => p.picks > 0).length}` }].map((f) => (
            <button key={f.id} type="button" className="btn btn-small pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.name}
            </button>
          ))}
        </div>
        <div className="row small">
          <button type="button" className="btn btn-small" onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>Select shown</button>
          {selected.size ? <button type="button" className="btn btn-small" onClick={() => setSelected(new Set())}>Clear</button> : null}
        </div>
      </div>

      {selected.size ? (
        <div className="notice row between">
          <span>{selected.size} selected</span>
          <div className="row">
            <>
                <label className="label" htmlFor="move-to">Move to folder</label>
                <select id="move-to" className="select" style={{ width: "auto", minHeight: 34, padding: "4px 8px" }} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="">No folder</option>
                  <option value="__new">+ New folder…</option>
                </select>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={pending}
                  onClick={() => {
                    if (target === "__new") {
                      const name = prompt("Name the new folder");
                      if (!name?.trim()) return;
                      start(async () => {
                        await createSetWithPhotos(projectId, name, ids);
                        setSelected(new Set());
                      });
                      return;
                    }
                    start(async () => {
                      await movePhotos(projectId, ids, target || null);
                      setSelected(new Set());
                    });
                  }}
                >
                  Move
                </button>
              </>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled={pending}
              onClick={() => {
                if (confirm(`Delete ${selected.size} photo${selected.size === 1 ? "" : "s"} and their files? This can't be undone.`)) {
                  start(async () => {
                    await deletePhotos(projectId, ids);
                    setSelected(new Set());
                  });
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="muted small">No photos here yet.</p>
      ) : (
        <div className="thumbs-admin">
          {shown.map((p) => (
            <figure key={p.id}>
              <label className="t" style={{ position: "relative", display: "block", cursor: "pointer", outline: selected.has(p.id) ? "2px solid var(--ink)" : "none", outlineOffset: 2 }}>
                {p.thumbKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p.thumbKey)} alt="" loading="lazy" />
                ) : (
                  <span className="mono muted" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.originalKey ? "No preview" : "RAW only"}
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`Select ${p.filename}`}
                  style={{ position: "absolute", top: 6, left: 6, width: 18, height: 18 }}
                />
                {p.picks ? <span className="pick-count">{p.picks} pick{p.picks === 1 ? "" : "s"}</span> : null}
              </label>
              <figcaption className="mono muted" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.filename}>{p.filename}</span>
                <span>{p.rawKey ? "RAW" : ""}</span>
              </figcaption>
              <span className="mono muted" style={{ fontSize: 11 }}>{setName(p.setId)} · {formatBytes(p.size + p.rawSize)}</span>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
