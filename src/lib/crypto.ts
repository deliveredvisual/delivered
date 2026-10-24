import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijkmnopqrstuvwxyz"; // no "l" to avoid 1/l confusion in links
export const newId = customAlphabet(alphabet, 16);
export const newSlug = customAlphabet(alphabet, 12);

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64url(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): string {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Signs a JSON payload into a compact token: base64url(payload).hexsig */
export async function sign(payload: object, secret: string): Promise<string> {
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toHex(sig)}`;
}

export async function verify<T>(token: string | undefined, secret: string): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f]+$/.test(sig) || sig.length % 2) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromHex(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const data = JSON.parse(unb64url(body)) as T & { exp?: number };
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** PBKDF2 password hash for client gallery passwords: salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt.buffer)}$${hash}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hash] = stored.split("$");
  if (!saltHex || !hash) return false;
  const candidate = await pbkdf2(password, fromHex(saltHex));
  return timingSafeEqual(candidate, hash);
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Encrypting stored secrets (Dropbox / Google tokens) ----------

async function aesKey(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`${secret}:stored-secrets`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Encrypts a short secret with a key made from SESSION_SECRET: base64(iv).base64(ciphertext) */
export async function seal(text: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(text));
  return `${toB64(iv)}.${toB64(ct)}`;
}

export async function unseal(sealed: string, secret: string): Promise<string | null> {
  const [iv, ct] = sealed.split(".");
  if (!iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(secret), fromB64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
