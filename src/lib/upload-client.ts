"use client";

import { customAlphabet } from "nanoid";

export const clientId = customAlphabet("0123456789abcdefghijkmnopqrstuvwxyz", 16);

const PART = 50 * 1024 * 1024; // 50 MiB: under the 100 MB request limit, above R2's 5 MiB minimum part

export const RAW_EXT = ["arw", "cr2", "cr3", "nef", "nrw", "raf", "dng", "orf", "rw2", "pef", "srw", "3fr", "iiq", "x3f", "erf", "mos", "rwl"];
export const IMAGE_EXT = ["jpg", "jpeg", "png", "tif", "tiff", "webp", "heic", "heif"];
export const VIDEO_EXT = ["mp4", "mov", "m4v", "webm"];

export function ext(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}
export const isRaw = (n: string) => RAW_EXT.includes(ext(n));
export const isImage = (n: string) => IMAGE_EXT.includes(ext(n));
export const isVideo = (n: string) => VIDEO_EXT.includes(ext(n));

export function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function post(url: string, body: Blob | string | null, onProgress?: (loaded: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (typeof body === "string") xhr.setRequestHeader("content-type", "application/json");
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}

async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof Error && /Not signed in|Bad key/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw last;
}

/** Uploads one blob to R2 under `key`, in 50 MB parts when it's large. Reports bytes sent. */
export async function uploadBlob(key: string, blob: Blob, onProgress?: (sent: number) => void): Promise<void> {
  const type = encodeURIComponent(blob.type || "application/octet-stream");
  const base = `/api/admin/upload?key=${encodeURIComponent(key)}&type=${type}`;
  if (blob.size <= PART) {
    await retry(() => post(`${base}&op=put`, blob, onProgress));
    onProgress?.(blob.size);
    return;
  }
  const { uploadId } = await retry(() => post(`${base}&op=start`, null));
  const parts: { partNumber: number; etag: string }[] = [];
  let done = 0;
  try {
    for (let offset = 0, n = 1; offset < blob.size; offset += PART, n++) {
      const chunk = blob.slice(offset, offset + PART);
      const part = await retry(() =>
        post(`${base}&op=part&uploadId=${encodeURIComponent(uploadId)}&part=${n}`, chunk, (l) => onProgress?.(done + l)),
      );
      parts.push({ partNumber: part.partNumber, etag: part.etag });
      done += chunk.size;
      onProgress?.(done);
    }
    await retry(() => post(`${base}&op=complete&uploadId=${encodeURIComponent(uploadId)}`, JSON.stringify({ parts })));
  } catch (e) {
    post(`${base}&op=abort&uploadId=${encodeURIComponent(uploadId)}`, null).catch(() => {});
    throw e;
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, quality: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), "image/jpeg", quality));
}

function scaled(bitmap: ImageBitmap, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  return { w: Math.round(bitmap.width * scale), h: Math.round(bitmap.height * scale) };
}

async function resizeTo(bitmap: ImageBitmap, longEdge: number, quality: number): Promise<Blob> {
  const { w, h } = scaled(bitmap, longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvasToJpeg(canvas, quality);
}

/** Web-size preview (2560px) and grid thumbnail (800px). Returns null if the browser can't decode the file (e.g. TIFF in Chrome). */
export async function imageVariants(file: Blob) {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
  try {
    const preview = await resizeTo(bitmap, 2560, 0.86);
    const thumb = await resizeTo(bitmap, 800, 0.8);
    return { preview, thumb, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/** A poster frame (about a second in) and the duration of a video file. */
export function videoInfo(file: File): Promise<{ poster: Blob | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    let duration: number | null = null;
    const finish = (poster: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve({ poster, duration });
    };
    const timer = setTimeout(() => finish(null), 15000);
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : null;
      video.currentTime = Math.min(1, (duration ?? 2) / 2);
    };
    video.onseeked = async () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(await canvasToJpeg(canvas, 0.82));
      } catch {
        finish(null);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
  });
}

/** Runs async jobs with a fixed number in flight. */
export async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}
