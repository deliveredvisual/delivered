import { eq } from "drizzle-orm";
import { projectIdFromKey } from "@/lib/api";
import { fullResHeld, hasProjectAccess, isExpired, managesProject } from "@/lib/auth";
import { bucket, db } from "@/lib/env";
import { projects } from "@/db/schema";

/** Web-size variants anyone with access can always see; everything else counts as full-resolution. */
function isPreviewKey(key: string): boolean {
  return /\/(preview|thumb|poster)\.jpg$/.test(key);
}
function isFilmFile(key: string): boolean {
  return /\/films\/[a-z0-9]{16}\/[a-z0-9]{16}\/film\.[a-z0-9]+$/.test(key);
}

function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/file?k=<key>[&dl=<filename>]
 * Streams a file from R2 after checking the viewer may see it. Supports Range requests so films can seek.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("k") ?? "";
  const dl = url.searchParams.get("dl");
  const projectId = projectIdFromKey(key);
  if (!projectId) return new Response("Not found", { status: 404 });

  const project = await db().query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return new Response("Not found", { status: 404 });
  if (!(await managesProject(project))) {
    if (!(await hasProjectAccess(project)) || isExpired(project)) {
      return new Response("Not found", { status: 404 });
    }
    const held = fullResHeld(project);
    const isRawKey = /\/raw\.[a-z0-9]+$/.test(key);
    if (isRawKey && !project.rawEnabled) return new Response("Not available", { status: 403 });
    // Streaming a film to watch it is fine; downloading it, or any full-res photo, waits for payment when held.
    if (held && !isPreviewKey(key) && (!isFilmFile(key) || dl)) {
      return new Response("Full-resolution files are available once the invoice is settled.", { status: 403 });
    }
  }

  const obj = await bucket().get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", isPreviewKey(key) ? "private, max-age=86400" : "private, max-age=3600");
  headers.set("x-robots-tag", "noindex");
  if (dl) headers.set("content-disposition", contentDisposition(dl));

  if (!("body" in obj) || !obj.body) {
    // Conditional request matched (If-None-Match etc.)
    return new Response(null, { status: 304, headers });
  }

  const range = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range && request.headers.has("range")) {
    const offset = range.offset ?? (range.suffix !== undefined ? obj.size - range.suffix : 0);
    const length = range.length ?? obj.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
