import "server-only";
import { and, eq } from "drizzle-orm";
import { currentStudio } from "./auth";
import { db } from "./env";
import { projects, type Project } from "@/db/schema";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * For studio-only API calls: the project, when the caller works in the (approved) studio that owns it,
 * otherwise an error response to send back.
 */
export async function studioProject(projectId: string | null): Promise<{ project: Project } | { denied: Response }> {
  const s = await currentStudio();
  if (!s) return { denied: fail("Not signed in", 401) };
  if (s.studio.status !== "active") return { denied: fail("Your studio is waiting for approval", 403) };
  const project = projectId
    ? await db().query.projects.findFirst({ where: and(eq(projects.id, projectId), eq(projects.studioId, s.studio.id)) })
    : undefined;
  if (!project) return { denied: fail("No such project", 404) };
  return { project };
}

/** Every stored object lives under p/<projectId>/… so a key can be checked against its project. */
export function projectIdFromKey(key: string): string | null {
  const m = /^p\/([a-z0-9]{16})\/[A-Za-z0-9._\-/]+$/.exec(key);
  if (!m || key.includes("..")) return null;
  return m[1];
}
