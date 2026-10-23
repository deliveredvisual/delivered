/** Only allow redirects to pages on this site (never "//other.site"). */
export function safeNext(next: unknown): string | null {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s.slice(0, 300) : null;
}
