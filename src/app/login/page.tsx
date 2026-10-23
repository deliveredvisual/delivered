import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="stack" style={{ width: "min(380px, 100%)", gap: 28 }}>
        <div className="wordmark">
          Delivered <span className="light">Visual</span>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
