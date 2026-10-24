import "server-only";
import type { CloudProvider } from "@/db/schema";
import { env } from "../env";

/**
 * Talking to Dropbox and Google Drive: signing in (OAuth), making folders, and sending a file across in pieces.
 * Everything here is plain HTTP, so a stand-in server can play both services in local tests (CLOUD_TEST_BASE).
 */

export const PROVIDERS: { id: CloudProvider; name: string }[] = [
  { id: "dropbox", name: "Dropbox" },
  { id: "gdrive", name: "Google Drive" },
];
export const providerName = (p: CloudProvider) => PROVIDERS.find((x) => x.id === p)?.name ?? p;
export const isProvider = (p: unknown): p is CloudProvider => p === "dropbox" || p === "gdrive";

/** The connection has been cut on their side (access removed, password changed): needs reconnecting. */
export class AuthError extends Error {}
/** Worth trying again later (busy, network trouble). */
export class RetryError extends Error {}

function urls() {
  const t = env().CLOUD_TEST_BASE?.replace(/\/$/, "");
  return {
    dropboxAuth: t ? `${t}/dropbox/authorize` : "https://www.dropbox.com/oauth2/authorize",
    dropboxApi: t ? `${t}/dropbox/api` : "https://api.dropboxapi.com",
    dropboxContent: t ? `${t}/dropbox/content` : "https://content.dropboxapi.com",
    googleAuth: t ? `${t}/google/authorize` : "https://accounts.google.com/o/oauth2/v2/auth",
    googleToken: t ? `${t}/google/token` : "https://oauth2.googleapis.com/token",
    googleApi: t ? `${t}/google/api` : "https://www.googleapis.com",
  };
}

export function credentials(p: CloudProvider): { id: string; secret: string } | null {
  const e = env();
  const [id, secret] = p === "dropbox" ? [e.DROPBOX_APP_KEY, e.DROPBOX_APP_SECRET] : [e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET];
  return id && secret ? { id, secret } : null;
}

export function chunkSize(): number {
  const n = Number(env().CLOUD_CHUNK);
  return Number.isFinite(n) && n >= 256 * 1024 ? n : 32 * 1024 * 1024; // 32 MiB: a multiple of 256 KiB, as Google needs
}

// ---------- Signing in ----------

export function authorizeUrl(p: CloudProvider, redirectUri: string, state: string): string {
  const c = credentials(p)!;
  const u = urls();
  const q: Record<string, string> =
    p === "dropbox"
      ? {
          client_id: c.id,
          response_type: "code",
          token_access_type: "offline",
          redirect_uri: redirectUri,
          state,
          scope: "account_info.read files.metadata.read files.metadata.write files.content.write",
        }
      : {
          client_id: c.id,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          redirect_uri: redirectUri,
          state,
          // Only the files and folders this site makes: it can't see anything else in the Drive.
          scope: "https://www.googleapis.com/auth/drive.file",
        };
  return `${p === "dropbox" ? u.dropboxAuth : u.googleAuth}?${new URLSearchParams(q)}`;
}

export type Tokens = { access: string; expiresIn: number; refresh?: string };

async function tokenRequest(p: CloudProvider, form: Record<string, string>): Promise<Tokens> {
  const c = credentials(p);
  if (!c) throw new AuthError(`${providerName(p)} isn't set up on this site yet.`);
  const u = urls();
  const res = await fetch(p === "dropbox" ? `${u.dropboxApi}/oauth2/token` : u.googleToken, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...form, client_id: c.id, client_secret: c.secret }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    if (res.status === 400 || res.status === 401) throw new AuthError(`${providerName(p)} turned down the sign-in (${data.error ?? res.status}).`);
    throw new RetryError(`${providerName(p)} sign-in failed (${res.status}).`);
  }
  return { access: data.access_token, expiresIn: data.expires_in ?? 3600, refresh: data.refresh_token };
}

export function exchangeCode(p: CloudProvider, code: string, redirectUri: string) {
  return tokenRequest(p, { code, grant_type: "authorization_code", redirect_uri: redirectUri });
}

export function refreshAccess(p: CloudProvider, refresh: string) {
  return tokenRequest(p, { refresh_token: refresh, grant_type: "refresh_token" });
}

/** The connected account's name and email, to show on the Team page. */
export async function accountName(p: CloudProvider, access: string): Promise<string> {
  const u = urls();
  if (p === "dropbox") {
    const res = await fetch(`${u.dropboxApi}/2/users/get_current_account`, { method: "POST", headers: { authorization: `Bearer ${access}` } });
    const d = (await res.json().catch(() => ({}))) as { name?: { display_name?: string }; email?: string };
    return [d.name?.display_name, d.email].filter(Boolean).join(" · ");
  }
  const res = await fetch(`${u.googleApi}/drive/v3/about?fields=user(displayName,emailAddress)`, { headers: { authorization: `Bearer ${access}` } });
  const d = (await res.json().catch(() => ({}))) as { user?: { displayName?: string; emailAddress?: string } };
  return [d.user?.displayName, d.user?.emailAddress].filter(Boolean).join(" · ");
}

// ---------- Shared ----------

/** Turns an error response into the right kind of error. */
async function failure(p: CloudProvider, res: Response, what: string): Promise<Error> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 401) return new AuthError(`${providerName(p)} access was removed.`);
  if (res.status === 429 || res.status >= 500) return new RetryError(`${providerName(p)} is busy (${res.status}) while ${what}.`);
  if (res.status === 403 && /quota|storage|insufficient_space|rateLimit/i.test(text)) return new RetryError(`${providerName(p)}: ${/rateLimit/i.test(text) ? "too many requests" : "out of storage space"}.`);
  if (res.status === 409 && /insufficient_space/.test(text)) return new RetryError("Dropbox is out of storage space.");
  return new Error(`${providerName(p)} refused ${what} (${res.status}${text ? `: ${text.slice(0, 160)}` : ""}).`);
}

/** Characters folders and files can't have on either service. */
export function cleanName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "").slice(0, 120) || "Untitled";
}

// ---------- Dropbox (an app folder: Apps › <app name> › <project>) ----------

/** Dropbox wants its JSON header in plain ASCII, with anything else written as \uXXXX. */
const dbxArg = (o: object) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

export async function dropboxCreateFolder(access: string, path: string): Promise<string> {
  const res = await fetch(`${urls().dropboxApi}/2/files/create_folder_v2`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ path, autorename: true }),
  });
  if (!res.ok) throw await failure("dropbox", res, "making a folder");
  const d = (await res.json()) as { metadata: { path_display: string } };
  return d.metadata.path_display;
}

/**
 * Sends one piece of a file. Small files go in one request; big ones open an upload session, add pieces, and
 * finish with the last piece. Returns the new offset and session (null when the file is complete).
 */
export async function dropboxPiece(
  access: string,
  job: { offset: number; size: number; session: string | null },
  path: string,
  body: ArrayBuffer,
): Promise<{ offset: number; session: string | null; done: boolean }> {
  const base = urls().dropboxContent;
  const headers = (arg: object) => ({ authorization: `Bearer ${access}`, "content-type": "application/octet-stream", "dropbox-api-arg": dbxArg(arg) });
  const commit = { path, mode: "overwrite", autorename: false, mute: true };
  const end = job.offset + body.byteLength;
  const last = end >= job.size;

  if (job.offset === 0 && last) {
    const res = await fetch(`${base}/2/files/upload`, { method: "POST", headers: headers(commit), body });
    if (!res.ok) throw await failure("dropbox", res, "taking the file");
    return { offset: end, session: null, done: true };
  }
  if (job.offset === 0 || !job.session) {
    const res = await fetch(`${base}/2/files/upload_session/start`, { method: "POST", headers: headers({ close: false }), body: job.offset === 0 ? body : new ArrayBuffer(0) });
    if (!res.ok) throw await failure("dropbox", res, "starting the upload");
    const { session_id } = (await res.json()) as { session_id: string };
    // A restarted session begins again from the start of the file.
    return { offset: job.offset === 0 ? end : 0, session: session_id, done: false };
  }
  const cursor = { session_id: job.session, offset: job.offset };
  const res = last
    ? await fetch(`${base}/2/files/upload_session/finish`, { method: "POST", headers: headers({ cursor, commit }), body })
    : await fetch(`${base}/2/files/upload_session/append_v2`, { method: "POST", headers: headers({ cursor, close: false }), body });
  if (res.status === 409) {
    const text = await res.text();
    // Dropbox already has more (or less) than we thought: carry on from where it is.
    const m = /"correct_offset":\s*(\d+)/.exec(text);
    if (m) return { offset: Number(m[1]), session: job.session, done: false };
    if (/not_found|closed|session/i.test(text)) return { offset: 0, session: null, done: false };
    throw new Error(`Dropbox refused the file (${text.slice(0, 160)}).`);
  }
  if (!res.ok) throw await failure("dropbox", res, "taking the file");
  return { offset: end, session: last ? null : job.session, done: last };
}

// ---------- Google Drive (My Drive › Delivered Visual › <project>) ----------

export async function driveCreateFolder(access: string, name: string, parent: string | null): Promise<string> {
  const res = await fetch(`${urls().googleApi}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
  });
  if (!res.ok) throw await failure("gdrive", res, "making a folder");
  return ((await res.json()) as { id: string }).id;
}

async function driveStartSession(access: string, name: string, parent: string, size: number, type: string): Promise<string> {
  const res = await fetch(`${urls().googleApi}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(size),
      "x-upload-content-type": type,
    },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  if (!res.ok) throw await failure("gdrive", res, "starting the upload");
  const loc = res.headers.get("location");
  if (!loc) throw new RetryError("Google Drive didn't start the upload.");
  return loc;
}

/** How much of the file Google already has, from a 308 reply's Range header ("bytes=0-1234"). */
const rangeEnd = (res: Response) => {
  const m = /bytes=0-(\d+)/.exec(res.headers.get("range") ?? "");
  return m ? Number(m[1]) + 1 : 0;
};

/**
 * Sends one piece of a file through a resumable upload. Before each piece after the first it asks Google how much
 * it already has, so a piece that was cut off halfway is simply sent again.
 */
export async function drivePiece(
  access: string,
  job: { offset: number; size: number; session: string | null },
  name: string,
  parent: string,
  type: string,
  read: (offset: number) => Promise<ArrayBuffer>,
): Promise<{ offset: number; session: string | null; done: boolean }> {
  let session = job.session;
  let offset = job.offset;
  if (!session) {
    session = await driveStartSession(access, name, parent, job.size, type);
    offset = 0;
  } else if (offset > 0) {
    const check = await fetch(session, { method: "PUT", headers: { authorization: `Bearer ${access}`, "content-range": `bytes */${job.size}` } });
    if (check.status === 200 || check.status === 201) return { offset: job.size, session: null, done: true };
    if (check.status === 404 || check.status === 410) return { offset: 0, session: null, done: false }; // session expired: start again
    if (check.status !== 308) throw await failure("gdrive", check, "checking the upload");
    offset = rangeEnd(check);
  }
  if (job.size === 0) {
    const res = await fetch(session, { method: "PUT", headers: { authorization: `Bearer ${access}`, "content-range": "bytes */0" } });
    if (!res.ok) throw await failure("gdrive", res, "taking the file");
    return { offset: 0, session: null, done: true };
  }
  const body = await read(offset);
  const end = offset + body.byteLength;
  const res = await fetch(session, {
    method: "PUT",
    headers: { authorization: `Bearer ${access}`, "content-range": `bytes ${offset}-${end - 1}/${job.size}` },
    body,
  });
  if (res.status === 200 || res.status === 201) return { offset: job.size, session: null, done: true };
  if (res.status === 308) return { offset: rangeEnd(res), session, done: false };
  if (res.status === 404 || res.status === 410) return { offset: 0, session: null, done: false };
  throw await failure("gdrive", res, "taking the file");
}
