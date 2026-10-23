/** Landing page look: colours worked out from the chosen background so text always reads well. */

export const LANDING_SWATCHES = [
  { label: "White", value: "#ffffff" },
  { label: "Paper", value: "#f4f2ee" },
  { label: "Stone", value: "#e4e1db" },
  { label: "Graphite", value: "#2a2a2a" },
  { label: "Charcoal", value: "#161616" },
  { label: "Black", value: "#000000" },
] as const;

export const LANDING_LAYOUTS = [
  { id: "collage", label: "Collage", hint: "Rows of photos at their natural shape, edge to edge" },
  { id: "masonry", label: "Masonry", hint: "Columns, like a pinboard" },
  { id: "grid", label: "Grid", hint: "Even tiles, all the same size" },
  { id: "large", label: "Large", hint: "One big photo after another" },
] as const;

export const LANDING_SPACING = { tight: 4, normal: 12, airy: 28 } as const;

export function validHex(s: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function isDarkBg(bg: string): boolean {
  return luminance(validHex(bg) ? bg : "#ffffff") < 0.25;
}

/** CSS variables for a landing page with this background. */
export function landingTheme(bg: string): Record<string, string> {
  const base = validHex(bg) ? bg : "#ffffff";
  const dark = luminance(base) < 0.25;
  return dark
    ? { "--ground": base, "--ground-2": "rgba(255,255,255,0.06)", "--ink": "#f4f4f2", "--ink-2": "#d6d6d2", "--muted": "#9d9d98", "--line": "rgba(255,255,255,0.14)", "--line-strong": "rgba(255,255,255,0.32)" }
    : { "--ground": base, "--ground-2": "rgba(0,0,0,0.04)", "--ink": "#111111", "--ink-2": "#3d3d3d", "--muted": "#6b6b6b", "--line": "rgba(0,0,0,0.10)", "--line-strong": "rgba(0,0,0,0.22)" };
}
