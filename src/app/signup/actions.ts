"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { joinStudio, signUpClient, signUpCreative } from "@/lib/auth";
import { db } from "@/lib/env";
import { safeNext } from "@/lib/next-url";
import { invites } from "@/db/schema";

export type SignupState = { error: string; values?: Record<string, string>; n?: number };

function field(form: FormData, key: string, max = 200): string {
  return String(form.get(key) ?? "").slice(0, max);
}

/** What to put back in the form after a mistake, so nothing has to be retyped except the password. */
function keep(form: FormData, prev: SignupState, error: string): SignupState {
  const values: Record<string, string> = {};
  for (const k of ["name", "email", "company", "studioName"]) values[k] = field(form, k);
  return { error, values, n: (prev.n ?? 0) + 1 };
}

function account(form: FormData) {
  return {
    name: field(form, "name", 80),
    email: field(form, "email"),
    password: field(form, "password", 500),
    company: field(form, "company", 120),
  };
}

export async function signupClient(prev: SignupState, form: FormData): Promise<SignupState> {
  const error = await signUpClient(account(form));
  if (error) return keep(form, prev, error);
  redirect(safeNext(form.get("next")) ?? "/me");
}

export async function signupCreative(prev: SignupState, form: FormData): Promise<SignupState> {
  const error = await signUpCreative({ ...account(form), studioName: field(form, "studioName", 80) });
  if (error) return keep(form, prev, error);
  redirect("/admin");
}

export async function acceptInvite(token: string, prev: SignupState, form: FormData): Promise<SignupState> {
  const invite = await db().query.invites.findFirst({
    where: and(eq(invites.token, token), isNull(invites.usedBy), gt(invites.expiresAt, new Date())),
  });
  if (!invite) return keep(form, prev, "This invite link has expired or was already used. Ask for a new one.");
  const r = await joinStudio(invite.studioId, account(form));
  if ("error" in r) return keep(form, prev, r.error);
  await db().update(invites).set({ usedBy: r.userId }).where(eq(invites.token, token));
  redirect("/admin");
}
