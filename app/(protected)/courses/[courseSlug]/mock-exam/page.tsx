import {
  ClipboardText,
  Clock,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import {
  getMockExamLaunch,
  startMockExamForCourse,
} from "@/src/features/exam/actions";
import { ExamLaunchForm } from "@/src/features/exam/components/exam-launch-form";
import { ContextBackLink } from "@/src/components/context-back-link";

type PageProps = {
  params: Promise<{ courseSlug: string }>;
};

export default async function MockExamLaunchPage({ params }: PageProps) {
  const { courseSlug } = await params;
  const launch = await getMockExamLaunch(courseSlug).catch(() => null);
  if (!launch) {
    return (
      <main className="exam-launch-shell">
        <section aria-labelledby="exam-unavailable-title">
          <ContextBackLink
            href={`/courses/${courseSlug}`}
            label="Về học phần"
            className="exam-launch-back"
          />
          <p className="exam-kicker">THI THỬ TỔNG HỢP</p>
          <h1 id="exam-unavailable-title">Thi thử chưa được cấu hình</h1>
          <p>
            Đề thi thử hiện chưa sẵn sàng. Vui lòng quay lại sau khi quản trị
            viên hoàn tất cấu hình.
          </p>
        </section>
      </main>
    );
  }
  const startAction = startMockExamForCourse.bind(null, courseSlug);

  return (
    <main className="exam-launch-shell">
      <section aria-labelledby="exam-launch-title">
        <ContextBackLink
          href={`/courses/${courseSlug}`}
          label="Về học phần"
          className="exam-launch-back"
        />
        <p className="exam-kicker">THI THỬ TỔNG HỢP</p>
        <h1 id="exam-launch-title">{launch.config.title}</h1>
        <p>
          {launch.course.description ||
            `Đánh giá kiến thức của học phần ${launch.course.title}.`}
        </p>
        <div className="exam-launch-facts">
          <span>
            <ClipboardText size={22} weight="duotone" />
            <strong>40 câu</strong>
            Một câu mỗi màn hình
          </span>
          <span>
            <Clock size={22} weight="duotone" />
            <strong>60 phút</strong>
            Thời gian do máy chủ tính
          </span>
          <span>
            <ShieldCheck size={22} weight="duotone" />
            <strong>Tự động lưu</strong>
            Tải lại không đặt lại giờ
          </span>
        </div>
        <div className="exam-launch-note">
          Khi bắt đầu, đồng hồ chạy ngay. Bài sẽ tự nộp khi hết giờ bằng những
          đáp án đã lưu gần nhất.
        </div>
        <ExamLaunchForm action={startAction} />
      </section>
    </main>
  );
}
