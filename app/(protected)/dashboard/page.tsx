import { CourseOverview } from "@/src/features/catalog/components/course-overview";
import { getCourseDashboard } from "@/src/features/catalog/queries";
import { requireViewer } from "@/src/features/auth/session";

const KTCT_SLUG = "kinh-te-chinh-tri-mac-lenin";

export default async function DashboardPage() {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  const { data, error } = await getCourseDashboard(viewer, KTCT_SLUG);

  if (error) return <main className="learner-shell"><section className="message-state" role="alert"><h1>Chưa tải được trang học tập</h1><p>{error}</p><a href="/dashboard">Thử lại</a></section></main>;
  if (!data) return <main className="learner-shell"><section className="message-state"><h1>Chưa có học phần để hiển thị</h1><p>Học phần Kinh tế chính trị Mác – Lênin sẽ xuất hiện ở đây khi được xuất bản.</p></section></main>;

  return <CourseOverview dashboard={data} viewerRole={viewer.role} />;
}
