// Shapes shared by the server and the browser for the project chat and client folders.

/** A pin as the chat shows it: what it points at, plus a picture and a label. */
export type PinView =
  | { type: "photo"; id: string; label: string; thumbKey: string | null }
  | { type: "film"; id: string; label: string; thumbKey: string | null; versionId?: string; version?: number; timecode?: number };

export type ChatMessage = {
  id: string;
  author: string;
  fromStudio: boolean;
  body: string;
  pins: PinView[];
  at: number;
};

export type FolderView = { id: string; name: string; createdBy: string; photoIds: string[] };

/** Where a pin leads when clicked. */
export function pinHref(slug: string, p: PinView): string {
  if (p.type === "photo") return `/p/${slug}/gallery?photo=${p.id}`;
  const q = new URLSearchParams();
  if (p.versionId) q.set("v", p.versionId);
  if (p.timecode !== undefined) q.set("t", String(p.timecode));
  const qs = q.toString();
  return `/p/${slug}/film/${p.id}${qs ? `?${qs}` : ""}`;
}
