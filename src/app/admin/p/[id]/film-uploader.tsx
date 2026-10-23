"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clientId, ext, isVideo, uploadBlob, videoInfo } from "@/lib/upload-client";

/** Uploads a new version (v1, v2, …) of one film. */
export function FilmUploader({ projectId, filmId, nextVersion }: { projectId: string; filmId: string; nextVersion: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (!isVideo(file.name)) {
      setError("Upload an MP4, MOV or WebM file.");
      return;
    }
    setError("");
    setProgress(0);
    try {
      const id = clientId();
      const folder = `p/${projectId}/films/${filmId}/${id}`;
      const info = await videoInfo(file);
      const fileKey = `${folder}/film.${ext(file.name)}`;
      await uploadBlob(fileKey, file, (sent) => setProgress(sent / file.size));
      let posterKey: string | null = null;
      if (info.poster) {
        posterKey = `${folder}/poster.jpg`;
        await uploadBlob(posterKey, info.poster);
      }
      const r = await fetch("/api/admin/films", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, filmId, id, fileKey, posterKey, filename: file.name, size: file.size, duration: info.duration }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Couldn't save");
      setProgress(null);
      router.refresh();
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input
        ref={input}
        type="file"
        hidden
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button type="button" className="btn btn-small" onClick={() => input.current?.click()} disabled={progress !== null}>
        {progress !== null ? `Uploading v${nextVersion}… ${Math.round(progress * 100)}%` : `Upload v${nextVersion}`}
      </button>
      {progress !== null ? <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
