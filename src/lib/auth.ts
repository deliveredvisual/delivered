import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { env, db } from "./env";
import { sign, verify, timingSafeEqual, hashPassword, checkPassword, newId } from "./crypto";
import {
  DEFAULT_STUDIO_ID,
  memberships,
  orgDeliveries,
  projects,
  signinFailures,
  studios,
  users,
  type Project,
  type Studio,
  type User,
} from "@/db/schema";

const SESSION_COOKIE = "dv_session";
const ADMIN_COOKIE = "dv_admin"; // the original single-password sign-in, kept as a backup way into the main studio
const VIEWER_COOKIE = "dv_viewer";
const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;

function secret(): string {
  const s = env().SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

const cookieBase = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 200);
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const MIN_PASSWORD = 10;

// ---------- Sessions ----------

async function startSession(userId: string): Promise<void> {
  const token = await sign({ uid: userId, exp: Date.now() + SESSION_DAYS * DAY }, secret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_DAYS * 24 * 60 * 60 });
  jar.delete(VIEWER_COOKIE);
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ADMIN_COOKIE);
}

/** The signed-in person, or null. Looked up once per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const data = await verify<{ uid: string }>(token, secret());
  if (!data?.uid) return null;
  return (await db().query.users.findFirst({ where: eq(users.id, data.uid) })) ?? null;
});

async function legacyAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const data = await verify<{ role: string }>(token, secret());
  return data?.role === "admin";
}

export type StudioSession = {
  studio: Studio;
  role: "owner" | "member";
  user: User | null; // null when signed in with the backup studio password
};

/** The organisation the signed-in person belongs to (with whichever dashboards it has), or null for visitors. */
export const currentOrg = cache(async (): Promise<StudioSession | null> => {
  const user = await currentUser();
  if (user) {
    const rows = await db()
      .select({ studio: studios, role: memberships.role })
      .from(memberships)
      .innerJoin(studios, eq(studios.id, memberships.studioId))
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (rows[0]) return { studio: rows[0].studio, role: rows[0].role, user };
  }
  if (await legacyAdmin()) {
    const studio = await db().query.studios.findFirst({ where: eq(studios.id, DEFAULT_STUDIO_ID) });
    if (studio) return { studio, role: "owner", user };
  }
  return null;
});

/** The signed-in organisation, when its creative dashboard is on (approved or still waiting). */
export const currentStudio = cache(async (): Promise<StudioSession | null> => {
  const s = await currentOrg();
  return s && s.studio.creative ? s : null;
});

/** Any signed-in page: sends visitors to sign in. */
export async function requireOrg(): Promise<StudioSession> {
  const s = await currentOrg();
  if (s) return s;
  redirect("/login");
}

/** Creative dashboard pages. Organisations without it are sent to their client dashboard (where they can turn it on). */
export async function requireStudio(): Promise<StudioSession> {
  const s = await requireOrg();
  if (!s.studio.creative) redirect("/me");
  return s;
}

/** Where someone lands after signing in: the dashboard they signed up for, if it's still on. */
export function homeFor(s: StudioSession | null): string {
  if (!s) return "/login";
  if (s.studio.primaryView === "client" && s.studio.client) return "/me";
  if (s.studio.creative) return "/admin";
  return "/me";
}

/** Switches on the other dashboard. The creative side then waits for the site owner's approval. */
export async function enableSide(orgId: string, side: "creative" | "client"): Promise<void> {
  if (side === "client") {
    await db().update(studios).set({ client: true }).where(eq(studios.id, orgId));
  } else {
    await db().update(studios).set({ creative: true }).where(eq(studios.id, orgId));
  }
}

/** Like requireStudio, but a studio still waiting for approval can't create or change deliveries. */
export async function requireActiveStudio(): Promise<StudioSession> {
  const s = await requireStudio();
  if (s.studio.status !== "active") redirect("/admin");
  return s;
}

/** Loads one of the signed-in studio's projects; any other studio's project is "not found". */
export async function requireProject(projectId: string): Promise<{ s: StudioSession; project: Project }> {
  const s = await requireActiveStudio();
  const project = await db().query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.studioId, s.studio.id)),
  });
  if (!project) notFound();
  return { s, project };
}

/** The person who runs the whole site (Alec): owner of the original studio. Approves new creatives. */
export async function isSiteOwner(): Promise<boolean> {
  const s = await currentOrg();
  return !!s && s.studio.id === DEFAULT_STUDIO_ID && s.role === "owner";
}

/** True when the signed-in person is in the organisation that made this delivery. */
export async function managesProject(project: Project): Promise<boolean> {
  const s = await currentOrg();
  return !!s && s.studio.id === project.studioId;
}

// ---------- Sign-in and sign-up ----------

const MAX_FAILURES = 8;
const FAILURE_WINDOW = 15 * 60 * 1000;

async function tooManyFailures(email: string): Promise<boolean> {
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(signinFailures)
    .where(and(eq(signinFailures.email, email), gt(signinFailures.at, new Date(Date.now() - FAILURE_WINDOW))));
  return Number(n) >= MAX_FAILURES;
}

export type SignInResult = { ok: true; user: User | null } | { ok: false; error: string };

/**
 * Email + password. The original studio password still works as a backup: with it, any email
 * (or none) signs you into the main studio.
 */
export async function signIn(emailRaw: string, password: string): Promise<SignInResult> {
  const email = normaliseEmail(emailRaw);
  const backup = env().ADMIN_PASSWORD;
  if (backup && timingSafeEqual(password, backup)) {
    const token = await sign({ role: "admin", exp: Date.now() + SESSION_DAYS * DAY }, secret());
    (await cookies()).set(ADMIN_COOKIE, token, { ...cookieBase, maxAge: SESSION_DAYS * 24 * 60 * 60 });
    return { ok: true, user: null };
  }
  if (!email) return { ok: false, error: "Enter your email." };
  if (await tooManyFailures(email)) {
    return { ok: false, error: "Too many attempts. Wait 15 minutes and try again." };
  }
  const user = await db().query.users.findFirst({ where: eq(users.email, email) });
  const ok = user ? await checkPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    await db().insert(signinFailures).values({ id: newId(), email, at: new Date() });
    return { ok: false, error: "That email and password don't match." };
  }
  await startSession(user.id);
  return { ok: true, user };
}

type NewAccount = { name: string; email: string; password: string; company?: string };

function checkNewAccount(a: NewAccount): string | null {
  if (!a.name.trim()) return "Enter your name.";
  if (!validEmail(normaliseEmail(a.email))) return "Enter a valid email address.";
  if (a.password.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  return null;
}

async function insertUser(a: NewAccount, kind: User["kind"]): Promise<{ user: User } | { error: string }> {
  const problem = checkNewAccount(a);
  if (problem) return { error: problem };
  const email = normaliseEmail(a.email);
  const exists = await db().query.users.findFirst({ where: eq(users.email, email) });
  if (exists) return { error: "There's already an account with that email. Sign in instead." };
  const user: User = {
    id: newId(),
    email,
    name: a.name.trim().slice(0, 80),
    company: (a.company ?? "").trim().slice(0, 120),
    kind,
    passwordHash: await hashPassword(a.password),
    createdAt: new Date(),
  };
  await db().insert(users).values(user);
  return { user };
}

async function createOrg(name: string, email: string, side: "creative" | "client"): Promise<string> {
  const id = newId();
  await db()
    .insert(studios)
    .values({
      id,
      name: name.trim().slice(0, 80),
      email: side === "creative" ? email : "",
      status: "pending",
      creative: side === "creative",
      client: side === "client",
      primaryView: side,
      createdAt: new Date(),
    });
  return id;
}

/**
 * A client account: a new organisation (their company) with its client dashboard on. Colleagues join it from an
 * invite link, and every delivery shared with it is seen by all of them.
 */
export async function signUpClient(a: NewAccount): Promise<string | null> {
  const r = await insertUser(a, "client");
  if ("error" in r) return r.error;
  const orgId = await createOrg(r.user.company || r.user.name, r.user.email, "client");
  await db().insert(memberships).values({ studioId: orgId, userId: r.user.id, role: "owner", createdAt: new Date() });
  await startSession(r.user.id);
  return null;
}

/**
 * A creative (photographer, filmmaker, retoucher…) account: a new organisation with its creative dashboard on.
 * The site owner approves it before it can create deliveries.
 */
export async function signUpCreative(a: NewAccount & { studioName: string }): Promise<string | null> {
  const studioName = a.studioName.trim().slice(0, 80);
  if (!studioName) return "Enter your studio or business name.";
  const r = await insertUser(a, "creative");
  if ("error" in r) return r.error;
  const orgId = await createOrg(studioName, r.user.email, "creative");
  await db().insert(memberships).values({ studioId: orgId, userId: r.user.id, role: "owner", createdAt: new Date() });
  await startSession(r.user.id);
  return null;
}

/**
 * Joins an organisation from an invite. Signs in an existing account (with its password) or creates one.
 * Someone who is alone in their own organisation moves across, bringing its deliveries; someone with colleagues
 * elsewhere has to be removed there first.
 */
export async function joinStudio(
  studioId: string,
  a: NewAccount,
  role: "owner" | "member" = "member",
): Promise<{ error: string } | { userId: string }> {
  const email = normaliseEmail(a.email);
  let user = await db().query.users.findFirst({ where: eq(users.email, email) });
  if (user) {
    if (!(await checkPassword(a.password, user.passwordHash))) {
      return { error: "You already have an account with that email. Enter its password to join." };
    }
    const other = await db().query.memberships.findFirst({ where: eq(memberships.userId, user.id) });
    if (other && other.studioId !== studioId) {
      const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(memberships).where(eq(memberships.studioId, other.studioId));
      const [{ made }] = await db().select({ made: sql<number>`count(*)` }).from(projects).where(eq(projects.studioId, other.studioId));
      if (Number(n) > 1 || Number(made) > 0) {
        return { error: "That account already belongs to another organisation with its own team or deliveries. Ask its owner to remove you first." };
      }
      // Bring their received deliveries along, then leave the old (now empty) organisation.
      const theirs = await db().select().from(orgDeliveries).where(eq(orgDeliveries.orgId, other.studioId));
      for (const d of theirs) {
        await db().insert(orgDeliveries).values({ ...d, orgId: studioId }).onConflictDoNothing();
      }
      await db().delete(studios).where(eq(studios.id, other.studioId));
      if (theirs.length) await enableSide(studioId, "client");
    }
  } else {
    const r = await insertUser(a, "client");
    if ("error" in r) return r;
    user = r.user;
  }
  await db()
    .insert(memberships)
    .values({ studioId, userId: user.id, role, createdAt: new Date() })
    .onConflictDoNothing();
  await startSession(user.id);
  return { userId: user.id };
}

// ---------- Client access to a project ----------

function projectCookie(slug: string) {
  return `dv_p_${slug}`;
}

export async function grantProjectAccess(slug: string): Promise<void> {
  const token = await sign({ slug, exp: Date.now() + 30 * DAY }, secret());
  (await cookies()).set(projectCookie(slug), token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 });
}

/** True when this delivery has been shared with the signed-in person's organisation. */
export async function sharedWithMyOrg(project: Project): Promise<boolean> {
  const s = await currentOrg();
  if (!s) return false;
  const row = await db().query.orgDeliveries.findFirst({
    where: and(eq(orgDeliveries.orgId, s.studio.id), eq(orgDeliveries.projectId, project.id)),
  });
  return !!row;
}

export async function hasProjectAccess(project: Project): Promise<boolean> {
  if (await managesProject(project)) return true;
  if (!project.passwordHash) return true;
  const token = (await cookies()).get(projectCookie(project.slug))?.value;
  const data = await verify<{ slug: string }>(token, secret());
  if (data?.slug === project.slug) return true;
  // Shared with their organisation (added by the studio, or a colleague unlocked it): no password needed.
  return sharedWithMyOrg(project);
}

/**
 * Puts a delivery on the signed-in person's client dashboard (call only once they've been let in), and notes that
 * their organisation has opened it. Skipped for the studio that made it, and for organisations without a client
 * dashboard.
 */
export async function saveDelivery(project: Project): Promise<void> {
  const s = await currentOrg();
  if (!s || !s.user || !s.studio.client || s.studio.id === project.studioId) return;
  const now = new Date();
  await db()
    .insert(orgDeliveries)
    .values({ orgId: s.studio.id, projectId: project.id, savedAt: now, openedAt: now })
    .onConflictDoUpdate({ target: [orgDeliveries.orgId, orgDeliveries.projectId], set: { openedAt: now } });
}

export function isExpired(project: Project): boolean {
  return project.archived || project.expiresAt.getTime() < Date.now();
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  return db().query.projects.findFirst({ where: eq(projects.slug, slug) });
}

/** Name and contact email shown to clients on a delivery. */
export async function studioFor(project: Project): Promise<{ name: string; email: string }> {
  const s = await db().query.studios.findFirst({ where: eq(studios.id, project.studioId) });
  return { name: s?.name || "Studio", email: s?.email || "" };
}

/**
 * Loads a project for a client-facing request and checks access.
 * Returns null when the link is wrong, the password has not been entered, or the delivery has expired
 * (the studio that made it can always see it).
 */
export async function projectForViewer(slug: string): Promise<Project | null> {
  const project = await getProjectBySlug(slug);
  if (!project) return null;
  if (!(await hasProjectAccess(project))) return null;
  if (isExpired(project) && !(await managesProject(project))) return null;
  return project;
}

// ---------- Who is looking (for selects and comments) ----------

export async function getViewer(project: Project): Promise<string> {
  if (await managesProject(project)) return (await studioFor(project)).name;
  const user = await currentUser();
  if (user) return user.name;
  return (await cookies()).get(VIEWER_COOKIE)?.value ?? "";
}

export async function setViewer(name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  (await cookies()).set(VIEWER_COOKIE, clean, { ...cookieBase, httpOnly: false, maxAge: 365 * 24 * 60 * 60 });
}
