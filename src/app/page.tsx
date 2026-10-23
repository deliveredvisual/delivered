import { redirect } from "next/navigation";
import { currentStudio, currentUser } from "@/lib/auth";

export default async function Home() {
  if (await currentStudio()) redirect("/admin");
  if (await currentUser()) redirect("/me");
  redirect("/login");
}
