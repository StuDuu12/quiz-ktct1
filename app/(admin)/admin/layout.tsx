import { AdminShell } from "@/src/features/admin/components/admin-shell";
import { requireViewer } from "@/src/features/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer(["admin", "instructor"]);
  return (
    <AdminShell role={viewer.role} email={viewer.email}>
      {children}
    </AdminShell>
  );
}
