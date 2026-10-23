"use server";

import { redirect } from "next/navigation";
import { currentOrg, homeFor, signIn, signOut } from "@/lib/auth";
import { safeNext } from "@/lib/next-url";

export type LoginState = { error: string; email?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").slice(0, 200);
  const r = await signIn(email, String(form.get("password") ?? ""));
  if (!r.ok) return { error: r.error, email };
  const next = safeNext(form.get("next"));
  if (next) redirect(next);
  redirect(homeFor(await currentOrg()));
}

export async function logout(): Promise<void> {
  await signOut();
  redirect("/login");
}
