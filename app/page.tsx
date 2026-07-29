import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          <span aria-hidden="true">KT</span>
          <strong>Phòng luyện thi KTCT</strong>
        </Link>
        <nav aria-label="Tài khoản">
          <Link className="landing-login" href="/login">Đăng nhập</Link>
          <Link className="landing-register" href="/register">Tạo tài khoản</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-kicker">Kinh tế chính trị Mác – Lênin</p>
          <h1>Luyện chắc từng chương. Tự tin bước vào phòng thi.</h1>
          <p className="landing-lead">
            Một không gian ôn tập rõ ràng, tập trung và lưu lại toàn bộ tiến
            trình của bạn — từ câu luyện đầu tiên đến bài thi thử cuối cùng.
          </p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/register">
              Bắt đầu luyện tập <span aria-hidden="true">→</span>
            </Link>
            <Link className="landing-secondary" href="/login">Đăng nhập</Link>
          </div>
          <div className="landing-trust" aria-label="Dữ liệu học phần">
            <span><strong>497</strong> câu hỏi đã đối chiếu</span>
            <span><strong>06</strong> chương học</span>
            <span><strong>40 / 60&apos;</strong> thi thử</span>
          </div>
        </div>

        <div className="landing-preview" aria-label="Xem trước phòng thi">
          <div className="preview-topline">
            <span>Đề thi thử tổng hợp</span>
            <strong>60:00</strong>
          </div>
          <p className="preview-label">Tiến độ làm bài</p>
          <div className="preview-progress">
            <span style={{ width: "62%" }} />
          </div>
          <div className="preview-grid" aria-hidden="true">
            {Array.from({ length: 20 }, (_, index) => (
              <i
                className={
                  index < 9 ? "is-done" : index === 11 ? "is-flagged" : ""
                }
                key={index}
              >
                {index + 1}
              </i>
            ))}
          </div>
          <div className="preview-question">
            <span>Câu 13 / 40</span>
            <strong>Mỗi câu trả lời là một bước tiến có thể theo dõi.</strong>
          </div>
        </div>
      </section>

      <section className="landing-method" aria-labelledby="method-title">
        <div>
          <p className="landing-kicker">Lộ trình gọn, hiệu quả rõ</p>
          <h2 id="method-title">Một nhịp học xuyên suốt</h2>
        </div>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Luyện theo chương</strong>
              <p>Nhận phản hồi đúng sai ngay sau mỗi lựa chọn.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Thi thử có chiến thuật</strong>
              <p>Đặt cờ, chuyển câu nhanh và kiểm tra lại trước khi nộp.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Nhìn lại để tiến bộ</strong>
              <p>Lịch sử, điểm số và toàn bộ đáp án được lưu sau mỗi lượt.</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="landing-footer">
        <strong>Phòng luyện thi KTCT</strong>
        <span>Ôn tập có cấu trúc. Tiến bộ có dữ liệu.</span>
      </footer>
    </main>
  );
}
