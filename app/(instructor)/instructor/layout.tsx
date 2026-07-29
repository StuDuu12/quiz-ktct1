import { InstructorShell } from "@/src/features/instructor/components/instructor-shell";
import { requireViewer } from "@/src/features/auth/session";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer(["instructor"]);
  return <InstructorShell email={viewer.email}>{children}</InstructorShell>;
}
