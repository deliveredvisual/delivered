import { adminGuard, fail, json, projectIdFromKey } from "@/lib/api";
import { bucket } from "@/lib/env";

/**
 * Chunked upload into R2, driven by the browser.
 *   POST ?op=put&key=…            body = whole file (small files, ≤ 50 MB)
 *   POST ?op=start&key=…          → { uploadId }
 *   POST ?op=part&key=…&uploadId=…&part=N   body = chunk → { etag }
 *   POST ?op=complete&key=…&uploadId=…      body = { parts: [{ partNumber, etag }] }
 *   POST ?op=abort&key=…&uploadId=…
 * Chunks go through the app because a Worker request can be up to 100 MB; files are split into 50 MB parts.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = await adminGuard();
  if (denied) return denied;

  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  const key = url.searchParams.get("key") ?? "";
  if (!projectIdFromKey(key)) return fail("Bad key");
  const contentType = url.searchParams.get("type") || "application/octet-stream";
  const b = bucket();

  switch (op) {
    case "put": {
      if (!request.body) return fail("Empty body");
      const obj = await b.put(key, request.body, { httpMetadata: { contentType } });
      return json({ ok: true, size: obj?.size ?? 0 });
    }
    case "start": {
      const upload = await b.createMultipartUpload(key, { httpMetadata: { contentType } });
      return json({ uploadId: upload.uploadId });
    }
    case "part": {
      const uploadId = url.searchParams.get("uploadId") ?? "";
      const partNumber = Number(url.searchParams.get("part"));
      if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) return fail("Bad part");
      if (!request.body) return fail("Empty body");
      const upload = b.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNumber, request.body);
      return json({ partNumber: part.partNumber, etag: part.etag });
    }
    case "complete": {
      const uploadId = url.searchParams.get("uploadId") ?? "";
      const { parts } = (await request.json()) as { parts: R2UploadedPart[] };
      const upload = b.resumeMultipartUpload(key, uploadId);
      const obj = await upload.complete(parts);
      return json({ ok: true, size: obj.size });
    }
    case "abort": {
      const uploadId = url.searchParams.get("uploadId") ?? "";
      await b.resumeMultipartUpload(key, uploadId).abort();
      return json({ ok: true });
    }
    default:
      return fail("Unknown op");
  }
}
