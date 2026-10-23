"use client";

import { downloadZip } from "client-zip";

export type ZipEntry = {
  name: string; // path inside the zip
  size: number; // best guess, used to decide whether the browser can hold it in memory
  url: string; // where to fetch the file
};

const IN_MEMORY_LIMIT = 2 * 1000 * 1000 * 1000; // browsers without a save picker must hold the whole zip in memory

type SaveTarget = { kind: "stream"; writable: WritableStream } | { kind: "memory" };

/**
 * Must be called straight from a click, before any other await, because the save dialog needs a user gesture.
 * Chrome and Edge get a real "Save as" and the zip streams to disk, so size doesn't matter.
 */
export async function chooseSaveTarget(zipName: string, totalSize: number): Promise<SaveTarget | null> {
  const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ createWritable: () => Promise<WritableStream> }> };
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: zipName, types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }] });
      return { kind: "stream", writable: await handle.createWritable() };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null; // they cancelled
    }
  }
  if (totalSize > IN_MEMORY_LIMIT) {
    throw new Error("This download is too big for this browser to zip in one go. Open the link in Chrome or Edge, or download one set at a time.");
  }
  return { kind: "memory" };
}

export async function writeZip(
  target: SaveTarget,
  zipName: string,
  entries: ZipEntry[],
  onProgress: (done: number, total: number) => void,
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  let done = 0;
  async function* files() {
    for (const e of entries) {
      try {
        const res = await fetch(e.url);
        if (!res.ok) throw new Error(String(res.status));
        yield { name: e.name, input: res };
      } catch {
        failed.push(e.name);
      }
      done++;
      onProgress(done, entries.length);
    }
  }
  const zip = downloadZip(files());
  if (target.kind === "stream") {
    await zip.body!.pipeTo(target.writable);
  } else {
    const blob = await zip.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
  return { failed };
}
