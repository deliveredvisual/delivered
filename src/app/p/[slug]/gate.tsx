import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getProjectBySlug, getViewer, hasProjectAccess, isExpired, managesProject, saveDelivery, studioFor } from "@/lib/auth";
import type { Project } from "@/db/schema";
import { CenteredCard } from "./client-chrome";
import { UnlockForm } from "./unlock-form";

export type Opened = {
  project: Project;
  studio: { name: string; email: string };
  admin: boolean;
  viewer: string;
};

/**
 * Every client page starts here: finds the delivery, and either lets the person in or returns the screen to show
 * instead (password needed, or archived).
 */
export async function openDelivery(slug: string): Promise<{ ok: Opened } | { screen: ReactNode }> {
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const [admin, studio] = await Promise.all([managesProject(project), studioFor(project)]);

  if (isExpired(project) && !admin) {
    return {
      screen: (
        <CenteredCard studio={studio.name} next={`/p/${slug}`}>
          <h1 className="h2">This delivery has been archived</h1>
          <p className="muted" style={{ margin: 0 }}>
            The files for <strong style={{ color: "var(--ink)" }}>{project.title}</strong> are no longer online.
            {studio.email ? (
              <>
                {" "}To get them back, email <a href={`mailto:${studio.email}`}>{studio.email}</a>.
              </>
            ) : null}
          </p>
        </CenteredCard>
      ),
    };
  }

  if (!(await hasProjectAccess(project))) {
    return {
      screen: (
        <CenteredCard studio={studio.name} next={`/p/${slug}`}>
          <div className="eyebrow">{project.clientName || "Private delivery"}</div>
          <h1 className="h2">{project.title}</h1>
          <UnlockForm slug={slug} />
        </CenteredCard>
      ),
    };
  }

  const [viewer] = await Promise.all([getViewer(project), saveDelivery(project)]);
  return { ok: { project, studio, admin, viewer } };
}
