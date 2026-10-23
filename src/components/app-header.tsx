import Link from "next/link";
import { isSiteOwner, type StudioSession } from "@/lib/auth";
import { logout } from "@/app/login/actions";

type View = "creative" | "client" | "team" | "studios";

/**
 * The header on every signed-in page: a switch between the Creative dashboard (deliveries you send) and the
 * Client dashboard (deliveries sent to you), the links for the current one, and who you are.
 */
export async function AppHeader({ s, view }: { s: StudioSession; view: View }) {
  const siteOwner = await isSiteOwner();
  const { studio: org, user } = s;
  const side = view === "client" ? "client" : view === "creative" ? "creative" : null;
  return (
    <header className="topbar" style={{ paddingTop: 16, paddingBottom: 16 }}>
      <div className="row" style={{ gap: 24 }}>
        <Link href="/" className="wordmark">
          Delivered <span className="light">Visual</span>
        </Link>
        <nav className="switcher" aria-label="Dashboard">
          <Link href={org.creative ? "/admin" : "/team#dashboards"} aria-current={side === "creative" ? "page" : undefined} className={org.creative ? "" : "off"}>
            {org.creative ? "Creative" : "+ Creative"}
          </Link>
          <Link href={org.client ? "/me" : "/team#dashboards"} aria-current={side === "client" ? "page" : undefined} className={org.client ? "" : "off"}>
            {org.client ? "Client" : "+ Client"}
          </Link>
        </nav>
        <nav className="nav" aria-label="Main">
          {side === "creative" ? (
            <>
              <Link href="/admin">Projects</Link>
              {org.status === "active" ? <Link href="/admin/new">New project</Link> : null}
            </>
          ) : null}
          {side === "client" ? <Link href="/me">Deliveries</Link> : null}
          <Link href="/team" aria-current={view === "team" ? "page" : undefined}>Team</Link>
          {siteOwner ? <Link href="/admin/studios" aria-current={view === "studios" ? "page" : undefined}>Studios</Link> : null}
        </nav>
      </div>
      <div className="row small">
        <span className="muted">{user && user.name !== org.name ? `${user.name} · ${org.name}` : org.name}</span>
        <form action={logout}>
          <button type="submit" className="btn btn-small">Sign out</button>
        </form>
      </div>
    </header>
  );
}
