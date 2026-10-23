import "server-only";
import { isAdmin } from "./auth";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** Returns a 401 response when the caller isn't signed in as admin, otherwise null. */
export async function adminGuard(): Promise<Response | null> {
  return (await isAdmin()) ? null : fail("Not signed in", 401);
}

/** Every stored object lives under p/<projectId>/… so a key can be checked against its project. */
export function projectIdFromKey(key: string): string | null {
  const m = /^p\/([a-z0-9]{16})\/[A-Za-z0-9._\-/]+$/.exec(key);
  if (!m || key.includes("..")) return null;
  return m[1];
}
