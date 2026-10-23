import { redirect } from "next/navigation";

/** The team page moved to /team (it's shared by both dashboards). */
export default function OldTeamPage() {
  redirect("/team");
}
