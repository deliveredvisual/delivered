import Link from "next/link";
import { isSiteOwner, type StudioSession } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { HeaderLinks } from "./header-links";

type View = "creative" | "client" | "team";

/**
 * The header on every signed-in page. Organisations with both dashboards get a switch between Creative (deliveries
 * you send) and Client (deliveries sent to you); everyone else just sees their own links. The other dashboard is
 * turned on from the Team page.
 */
export async function AppHeader({ s, view }: { s: StudioSession; view: View }) {
  const siteOwner = await isSiteOwner();
  const { studio: org, user } = s;
  const side = view === "client" ? "client" : view === "team" ? null : "creative";
  const both = org.creative && org.client;
  const links: { href: string; label: string }[] = [];
  if (org.creative && side !== "client") links.push({ href: "/admin", label: "Projects" }, { href: "/admin/history", label: "History" });
  if (org.client && (side === "client" || !org.creative)) links.push({ href: "/me", label: "Deliveries" });
  links.push({ href: "/team", label: "Team" });
  if (siteOwner) links.push({ href: "/admin/studios", label: "Approvals" });
  return (
    <header className="appbar">
      <Link href="/" className="wordmark">
        Delivered <span className="light">Visual</span>
      </Link>
      <div className="appbar-nav">
        {both ? (
          <nav className="switcher" aria-label="Dashboard">
            <Link href="/admin" aria-current={side === "creative" ? "page" : undefined}>Creative</Link>
            <Link href="/me" aria-current={side === "client" ? "page" : undefined}>Client</Link>
          </nav>
        ) : null}
        <HeaderLinks links={links} />
      </div>
      <div className="appbar-user small">
        <span className="muted appbar-name">{user && user.name !== org.name ? `${user.name} · ${org.name}` : org.name}</span>
        <form action={logout}>
          <button type="submit" className="btn btn-small">Sign out</button>
        </form>
      </div>
    </header>
  );
}
