import type { ReactNode } from "react";

/** Top bar every client sees: your studio name, with a small "Powered by" credit. */
export function ClientTopbar({ studio }: { studio: string }) {
  return (
    <header className="topbar">
      <div className="wordmark">{studio}</div>
      <div className="powered">
        Powered by <strong>Delivered</strong> Visual
      </div>
    </header>
  );
}

export function CenteredCard({ studio, children }: { studio: string; children: ReactNode }) {
  return (
    <>
      <ClientTopbar studio={studio} />
      <main style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="stack" style={{ width: "min(420px, 100%)", gap: 20 }}>{children}</div>
      </main>
    </>
  );
}
