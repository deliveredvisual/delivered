/** URL for a stored file. Pass `download` to make the browser save it under that name. */
export function fileUrl(key: string | null | undefined, download?: string): string {
  if (!key) return "";
  const q = new URLSearchParams({ k: key });
  if (download) q.set("dl", download);
  return `/api/file?${q.toString()}`;
}
