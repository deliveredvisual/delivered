import type { ReactNode } from "react";
import Link from "next/link";
import { currentStudio, currentUser } from "@/lib/auth";

/**
 * Top bar every client sees: the studio's name, a small "Powered by" credit, and an account link —
 * "Your deliveries" when signed in, otherwise an offer to keep this delivery in a free account.
 */
export async function ClientTopbar({ studio, next, home }: { studio: string; next?: string; home?: string }) {
  const [user, team] = await Promise.all([currentUser(), currentStudio()]);
  const after = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <header className="topbar">
      {home ? (
        <Link href={home} className="wordmark" style={{ color: "inherit", textDecoration: "none" }}>{studio}</Link>
      ) : (
        <div className="wordmark">{studio}</div>
      )}
      <div className="row small" style={{ gap: 20 }}>
        {team ? (
          <Link href="/admin" className="muted">Studio</Link>
        ) : user ? (
          <Link href="/me" className="muted">Your deliveries</Link>
        ) : (
          <>
            <Link href={`/login${after}`} className="muted">Sign in</Link>
            <Link href={`/signup${after}`} className="muted">Create account</Link>
          </>
        )}
        <div className="powered">
          Powered by <strong>Delivered</strong> Visual
        </div>
      </div>
    </header>
  );
}

export function CenteredCard({ studio, next, children }: { studio: string; next?: string; children: ReactNode }) {
  return (
    <>
      <ClientTopbar studio={studio} next={next} />
      <main style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="stack" style={{ width: "min(420px, 100%)", gap: 20 }}>{children}</div>
      </main>
    </>
  );
}
