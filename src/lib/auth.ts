import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { env, db } from "./env";
import { sign, verify, timingSafeEqual } from "./crypto";
import { projects, type Project } from "@/db/schema";

const ADMIN_COOKIE = "dv_admin";
const VIEWER_COOKIE = "dv_viewer";
const DAY = 24 * 60 * 60 * 1000;

function secret(): string {
  const s = env().SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return s;
}

const cookieBase = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

// ---------- Admin (you) ----------

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const data = await verify<{ role: string }>(token, secret());
  return data?.role === "admin";
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/login");
}

export async function loginAdmin(password: string): Promise<boolean> {
  const expected = env().ADMIN_PASSWORD;
  if (!expected || !timingSafeEqual(password, expected)) return false;
  const token = await sign({ role: "admin", exp: Date.now() + 30 * DAY }, secret());
  (await cookies()).set(ADMIN_COOKIE, token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 });
  return true;
}

export async function logoutAdmin(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}

// ---------- Client access to a project ----------

function projectCookie(slug: string) {
  return `dv_p_${slug}`;
}

export async function grantProjectAccess(slug: string): Promise<void> {
  const token = await sign({ slug, exp: Date.now() + 30 * DAY }, secret());
  (await cookies()).set(projectCookie(slug), token, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 });
}

export async function hasProjectAccess(project: Project): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!project.passwordHash) return true;
  const token = (await cookies()).get(projectCookie(project.slug))?.value;
  const data = await verify<{ slug: string }>(token, secret());
  return data?.slug === project.slug;
}

export function isExpired(project: Project): boolean {
  return project.archived || project.expiresAt.getTime() < Date.now();
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  return db().query.projects.findFirst({ where: eq(projects.slug, slug) });
}

/**
 * Loads a project for a client-facing request and checks access.
 * Returns null when the link is wrong, the password has not been entered, or the delivery has expired
 * (you, as admin, can always see it).
 */
export async function projectForViewer(slug: string): Promise<Project | null> {
  const project = await getProjectBySlug(slug);
  if (!project) return null;
  if (!(await hasProjectAccess(project))) return null;
  if (isExpired(project) && !(await isAdmin())) return null;
  return project;
}

// ---------- Who is looking (for selects and comments) ----------

export async function getViewer(): Promise<string> {
  if (await isAdmin()) return env().STUDIO_NAME || "Studio";
  return (await cookies()).get(VIEWER_COOKIE)?.value ?? "";
}

export async function setViewer(name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  (await cookies()).set(VIEWER_COOKIE, clean, { ...cookieBase, httpOnly: false, maxAge: 365 * 24 * 60 * 60 });
}

/** Full-resolution and RAW downloads are held when you've ticked "hold until paid" and the invoice is open. */
export function fullResHeld(project: Project): boolean {
  return project.holdUntilPaid && !project.invoicePaid;
}
