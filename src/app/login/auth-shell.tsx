import type { ReactNode } from "react";
import Link from "next/link";

/** The centred, minimal frame shared by the sign-in and sign-up pages. */
export function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="stack" style={{ width: "min(400px, 100%)", gap: 28 }}>
        <Link href="/" className="wordmark" style={{ color: "inherit", textDecoration: "none" }}>
          Delivered <span className="light">Visual</span>
        </Link>
        <h1 className="h2" style={{ margin: 0 }}>{title}</h1>
        {children}
        {footer ? <p className="small muted" style={{ margin: 0 }}>{footer}</p> : null}
      </div>
    </main>
  );
}
