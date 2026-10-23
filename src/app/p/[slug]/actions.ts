"use server";

import { redirect } from "next/navigation";
import { getProjectBySlug, grantProjectAccess } from "@/lib/auth";
import { checkPassword } from "@/lib/crypto";

export async function unlock(slug: string, _prev: { error: string }, form: FormData): Promise<{ error: string }> {
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "This link isn't valid." };
  if (project.passwordHash) {
    const ok = await checkPassword(String(form.get("password") ?? ""), project.passwordHash);
    if (!ok) return { error: "That password isn't right." };
  }
  await grantProjectAccess(slug);
  redirect(`/p/${slug}`);
}
