import { BookOpen, FunnelSimple, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { requireViewer } from "@/src/features/auth/session";
import { HistoryList } from "@/src/features/history/components/history-list";
import {
  getAttemptHistory,
  getHistoryChapters,
  parseHistoryFilters,
  type HistorySearchParams,
} from "@/src/features/history/queries";
import { ContextBackLink } from "@/src/components/context-back-link";

type PageProps = {
  searchParams: Promise<HistorySearchParams>;
};

function valueOf(
  searchParams: HistorySearchParams,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function HistoryPage({ searchParams }: PageProps) {
  const viewer = await requireViewer(["student", "instructor", "admin"]);
  const rawFilters = await searchParams;
  const filters = parseHistoryFilters(rawFilters);
  const loaded = await Promise.all([
    getAttemptHistory(viewer.id, filters),
    getHistoryChapters(),
  ]).catch(() => null);

  return (
    <main className="history-shell">
      <header className="history-header">
        <Link href="/dashboard" className="brand-mark">
          <BookOpen size={24} weight="fill" aria-hidden="true" />
          Ôn thi KTCT
        </Link>
        <nav aria-label="Điều hướng học viên">
          <ContextBackLink href="/dashboard" label="Về tổng quan" />
          <Link href="/history" aria-current="page">
            Lịch sử
          </Link>
        </nav>
      </header>

      <section className="history-hero" aria-labelledby="history-title">
        <p className="history-kicker">NHẬT KÝ HỌC TẬP</p>
        <h1 id="history-title">Lịch sử làm bài</h1>
        <p>
          Xem mọi lượt luyện tập và thi thử, lọc theo chương, thời gian hoặc
          mức điểm.
        </p>
      </section>

      <form className="history-filters" action="/history" method="get">
        <div className="history-filter-heading">
          <FunnelSimple size={20} weight="duotone" aria-hidden="true" />
          <strong>Bộ lọc</strong>
        </div>
        <label>
          Hình thức
          <select name="kind" defaultValue={filters.kind ?? ""}>
            <option value="">Tất cả</option>
            <option value="practice">Luyện tập</option>
            <option value="mock_exam">Thi thử</option>
          </select>
        </label>
        <label>
          Chương
          <select name="chapter" defaultValue={filters.chapterId ?? ""}>
            <option value="">Tất cả chương</option>
            {(loaded?.[1] ?? []).map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                Chương {chapter.position}: {chapter.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Từ ngày
          <input
            type="date"
            name="from"
            defaultValue={valueOf(rawFilters, "from") ?? ""}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            name="to"
            defaultValue={valueOf(rawFilters, "to") ?? ""}
          />
        </label>
        <label>
          Mức điểm
          <select name="score" defaultValue={filters.scoreBand ?? ""}>
            <option value="">Tất cả điểm</option>
            <option value="0-49">Dưới 50%</option>
            <option value="50-79">Từ 50% đến 79%</option>
            <option value="80-100">Từ 80% đến 100%</option>
          </select>
        </label>
        <div className="history-filter-actions">
          <button type="submit">Áp dụng</button>
          <Link href="/history">Xóa bộ lọc</Link>
        </div>
      </form>

      {!loaded ? (
        <section className="history-error" role="alert">
          <WarningCircle size={28} weight="duotone" aria-hidden="true" />
          <div>
            <h2>Chưa tải được lịch sử</h2>
            <p>Kết nối có thể đang gián đoạn. Hãy thử tải lại trang.</p>
          </div>
          <Link href="/history">Thử lại</Link>
        </section>
      ) : (
        <HistoryList
          attempts={loaded[0]}
          page={filters.page}
          pageSize={filters.pageSize}
          filters={{
            kind: valueOf(rawFilters, "kind"),
            chapter: valueOf(rawFilters, "chapter"),
            from: valueOf(rawFilters, "from"),
            to: valueOf(rawFilters, "to"),
            score: valueOf(rawFilters, "score"),
          }}
        />
      )}
    </main>
  );
}
