import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { studio } from "@/lib/env";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const { name } = studio();
  return (
    <>
      <header className="topbar" style={{ paddingTop: 16, paddingBottom: 16 }}>
        <div className="row" style={{ gap: 28 }}>
          <Link href="/admin" className="wordmark">
            Delivered <span className="light">Visual</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/admin">Projects</Link>
            <Link href="/admin/new">New project</Link>
          </nav>
        </div>
        <div className="row small">
          <span className="muted">{name}</span>
          <form action={logout}>
            <button type="submit" className="btn btn-small">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
