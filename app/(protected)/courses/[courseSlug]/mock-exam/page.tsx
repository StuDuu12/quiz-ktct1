import {
  ArrowLeft,
  ArrowRight,
  ClipboardText,
  Clock,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getMockExamLaunch,
  startMockExamForCourse,
} from "@/src/features/exam/actions";

type PageProps = {
  params: Promise<{ courseSlug: string }>;
};

export default async function MockExamLaunchPage({ params }: PageProps) {
  const { courseSlug } = await params;
  const launch = await getMockExamLaunch(courseSlug).catch(() => null);
  if (!launch) notFound();
  const startAction = startMockExamForCourse.bind(null, courseSlug);

  return (
    <main className="exam-launch-shell">
      <section aria-labelledby="exam-launch-title">
        <Link href={`/courses/${courseSlug}`} className="exam-launch-back">
          <ArrowLeft size={18} /> Trở về học phần
        </Link>
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
        <form action={startAction}>
          <button type="submit">
            Bắt đầu thi thử <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}
