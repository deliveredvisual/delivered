import type { Metadata } from "next";
import { ProjectForm } from "../project-form";
import { createProject } from "../actions";
import { requireActiveStudio } from "@/lib/auth";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireActiveStudio();
  return (
    <main className="wrap stack" style={{ paddingTop: 48, gap: 32, maxWidth: 900 }}>
      <h1 className="h2 page-title">New project</h1>
      <ProjectForm action={createProject} submitLabel="Create project" />
    </main>
  );
}
