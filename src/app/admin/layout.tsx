import Link from "next/link";
import { isSiteOwner, requireStudio } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { studio, user } = await requireStudio();
  const siteOwner = await isSiteOwner();
  const active = studio.status === "active";
  return (
    <>
      <header className="topbar" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <div className="row" style={{ gap: 28 }}>
          <Link href="/admin" className="wordmark">
            Delivered <span className="light">Visual</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/admin">Projects</Link>
            {active ? <Link href="/admin/new">New project</Link> : null}
            <Link href="/admin/team">Team</Link>
            {siteOwner ? <Link href="/admin/studios">Studios</Link> : null}
          </nav>
        </div>
        <div className="row small">
          <span className="muted">{user && user.name !== studio.name ? `${user.name} · ${studio.name}` : studio.name}</span>
          <form action={logout}>
            <button type="submit" className="btn btn-small">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
