import { notFound } from "next/navigation";

import { CourseOverview } from "@/src/features/catalog/components/course-overview";
import { getCourseDashboard } from "@/src/features/catalog/queries";
import { requireViewer } from "@/src/features/auth/session";

export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  const { courseSlug } = await params;
  const { data, error } = await getCourseDashboard(viewer, courseSlug);

  if (!data && !error) notFound();
  if (error) return <main className="learner-shell"><section className="message-state" role="alert"><h1>Chưa tải được học phần</h1><p>{error}</p><a href={`/courses/${courseSlug}`}>Thử lại</a></section></main>;
  return <CourseOverview dashboard={data!} />;
}
