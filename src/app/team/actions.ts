"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { enableSide, joinStudio, requireOrg, validEmail, normaliseEmail } from "@/lib/auth";
import { db } from "@/lib/env";
import { newId, newSlug } from "@/lib/crypto";
import { invites, memberships, studios } from "@/db/schema";

const INVITE_DAYS = 14;

async function requireOwner() {
  const s = await requireOrg();
  if (s.role !== "owner") redirect("/team");
  return s;
}

export async function updateStudio(_prev: { error: string }, form: FormData): Promise<{ error: string }> {
  const { studio } = await requireOwner();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = normaliseEmail(String(form.get("email") ?? ""));
  if (!name) return { error: "Enter your organisation's name." };
  if (email && !validEmail(email)) return { error: "Enter a valid contact email, or leave it empty." };
  await db().update(studios).set({ name, email }).where(eq(studios.id, studio.id));
  revalidatePath("/", "layout");
  return { error: "" };
}

/** Turns on the other dashboard. The creative side waits for the site owner's approval before it can upload. */
export async function activateSide(side: "creative" | "client") {
  const { studio } = await requireOwner();
  await enableSide(studio.id, side);
  revalidatePath("/", "layout");
  redirect(side === "client" ? "/me" : "/admin");
}

/** Anyone in the organisation can bring in a colleague. */
export async function createInvite() {
  const { studio } = await requireOrg();
  const now = Date.now();
  await db().insert(invites).values({
    token: newSlug() + newId(),
    studioId: studio.id,
    createdAt: new Date(now),
    expiresAt: new Date(now + INVITE_DAYS * 24 * 60 * 60 * 1000),
  });
  revalidatePath("/team");
}

export async function revokeInvite(token: string) {
  const { studio } = await requireOrg();
  await db().delete(invites).where(and(eq(invites.token, token), eq(invites.studioId, studio.id)));
  revalidatePath("/team");
}

export async function removeMember(userId: string) {
  const { studio, user } = await requireOwner();
  if (user && user.id === userId) return; // the owner can't remove themselves
  await db()
    .delete(memberships)
    .where(and(eq(memberships.studioId, studio.id), eq(memberships.userId, userId), ne(memberships.role, "owner")));
  revalidatePath("/team");
}

/** For the main studio, signed in with the backup password: create the owner's own email sign-in. */
export async function claimOwnerAccount(_prev: { error: string }, form: FormData): Promise<{ error: string }> {
  const s = await requireOwner();
  if (s.user) return { error: "You're already signed in with an account." };
  const r = await joinStudio(
    s.studio.id,
    {
      name: String(form.get("name") ?? "").slice(0, 80),
      email: String(form.get("email") ?? "").slice(0, 200),
      password: String(form.get("password") ?? "").slice(0, 500),
    },
    "owner",
  );
  if ("error" in r) return r;
  // An existing account joining as owner: make sure its role is owner.
  await db()
    .update(memberships)
    .set({ role: "owner" })
    .where(and(eq(memberships.studioId, s.studio.id), eq(memberships.userId, r.userId)));
  revalidatePath("/", "layout");
  return { error: "" };
}
