import { requireViewer } from "@/src/features/auth/session";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireViewer();
  return <>{children}</>;
}
