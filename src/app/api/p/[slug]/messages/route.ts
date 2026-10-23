import { json, fail } from "@/lib/api";
import { projectForViewer } from "@/lib/auth";
import { loadMessages } from "@/lib/chat";

/** The project chat, for the panel to load and refresh. */
export async function GET(_req: Request, ctx: RouteContext<"/api/p/[slug]/messages">): Promise<Response> {
  const { slug } = await ctx.params;
  const project = await projectForViewer(slug);
  if (!project) return fail("Not found", 404);
  return json({ messages: await loadMessages(project.id) });
}
