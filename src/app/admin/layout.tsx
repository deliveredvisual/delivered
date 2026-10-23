import { requireStudio } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

/** The creative dashboard: deliveries this organisation makes and sends. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const s = await requireStudio();
  return (
    <>
      <AppHeader s={s} view="creative" />
      {children}
    </>
  );
}
