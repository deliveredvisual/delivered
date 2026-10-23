import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/next-url";
import { AuthShell } from "./auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeNext((await searchParams).next) ?? "";
  const q = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <AuthShell title="Sign in" footer={<>New here? <Link href={`/signup${q}`}>Create an account</Link></>}>
      <LoginForm next={next} />
    </AuthShell>
  );
}
