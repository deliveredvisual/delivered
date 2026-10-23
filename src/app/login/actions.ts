"use server";

import { redirect } from "next/navigation";
import { loginAdmin, logoutAdmin } from "@/lib/auth";

export async function login(_prev: { error: string }, form: FormData): Promise<{ error: string }> {
  const ok = await loginAdmin(String(form.get("password") ?? ""));
  if (!ok) return { error: "That password isn't right." };
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await logoutAdmin();
  redirect("/login");
}
