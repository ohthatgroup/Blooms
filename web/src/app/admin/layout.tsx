import { requireAdminPage } from "@/lib/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="admin-layout">
      <AdminNavigation />
      <div className="admin-layout__content">{children}</div>
    </div>
  );
}
