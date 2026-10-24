import { currentStudio } from "@/lib/auth";
import { fail, json, studioProject } from "@/lib/api";
import { projectStatus, pump, queueExisting, retryFailed } from "@/lib/cloud/jobs";
import { isProvider } from "@/lib/cloud/providers";

/**
 * The project page asks here how the copies to Dropbox / Google Drive are going. While some are waiting, each
 * ask also does a few seconds of copying, so they move along quickly while someone's watching.
 */
export async function GET(request: Request): Promise<Response> {
  const projectId = new URL(request.url).searchParams.get("project");
  const access = await studioProject(projectId);
  if ("denied" in access) return access.denied;
  const { project } = access;
  let status = await projectStatus(project.id, project.studioId);
  if (status.some((x) => x.waiting && !x.error)) {
    await pump({ projectId: project.id, budgetMs: 12_000 });
    status = await projectStatus(project.id, project.studioId);
  }
  return json({ status });
}

/** "Copy existing files" and "Try again", from the project page or the Team page. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { op?: string; provider?: string; projectId?: string };
  if (!isProvider(body.provider)) return fail("Unknown service");
  if (body.projectId) {
    const access = await studioProject(body.projectId);
    if ("denied" in access) return access.denied;
    const { project } = access;
    if (body.op === "copy_existing") await queueExisting(project.id, body.provider);
    else if (body.op === "retry") await retryFailed(project.studioId, body.provider, project.id);
    else return fail("Unknown op");
    return json({ status: await projectStatus(project.id, project.studioId) });
  }
  const s = await currentStudio();
  if (!s || s.studio.status !== "active") return fail("Not signed in", 401);
  if (body.op !== "retry") return fail("Unknown op");
  await retryFailed(s.studio.id, body.provider);
  return json({ ok: true });
}
