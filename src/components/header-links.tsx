"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The header links, with the one for the current page marked. A project page counts as Projects. */
export function HeaderLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const current = (href: string) =>
    href === "/admin" ? path === "/admin" || path.startsWith("/admin/p/") || path === "/admin/new" : path === href || path.startsWith(href + "/");
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={current(l.href) ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
