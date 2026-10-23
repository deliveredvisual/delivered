import { redirect } from "next/navigation";
import { currentOrg, homeFor } from "@/lib/auth";

export default async function Home() {
  redirect(homeFor(await currentOrg()));
}
