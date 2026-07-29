import { AdminShell } from "@/src/features/admin/components/admin-shell";
import { requireViewer } from "@/src/features/auth/session";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer();
  if (viewer.role === "student") redirect("/dashboard?access=denied");
  return (
    <AdminShell role={viewer.role} email={viewer.email}>
      {children}
    </AdminShell>
  );
}
