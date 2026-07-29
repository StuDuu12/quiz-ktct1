import Image from "next/image";
import Link from "next/link";

import styles from "./landing-page.module.css";

export function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Phòng luyện thi KTCT">
          <span aria-hidden="true">KT</span>
          <strong>Phòng luyện thi KTCT</strong>
        </Link>

        <nav
          className={styles.navigation}
          aria-label="Điều hướng trang giới thiệu"
        >
          <Link className={styles.sectionLink} href="#gioi-thieu">
            Giới thiệu
          </Link>
          <Link className={styles.sectionLink} href="#lo-trinh">
            Lộ trình
          </Link>
          <Link className={styles.sectionLink} href="#vai-tro">
            Vai trò
          </Link>
          <Link className={styles.loginLink} href="/login">
            Đăng nhập
          </Link>
        </nav>
      </header>

      <section className={styles.hero} id="gioi-thieu">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Kinh tế chính trị Mác - Lênin</p>
          <h1>
            Học có lộ trình.{" "}
            <span>Tự tin khi vào thi.</span>
          </h1>
          <p className={styles.lead}>
            Ôn theo chương, luyện đề có thời gian và lưu toàn bộ tiến độ
            trong một hệ thống rõ ràng.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/login">
              Đăng nhập
            </Link>
            <Link className={styles.secondaryAction} href="/register">
              Tạo tài khoản
            </Link>
          </div>
        </div>

        <div className={styles.heroImage}>
          <Image
            src="/images/ktct-study-hero.png"
            alt="Hai sinh viên đang cùng ôn tập trong thư viện"
            width={1536}
            height={1024}
            priority
            unoptimized
            sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) 52vw, 54vw"
          />
        </div>
      </section>

      <section
        className={styles.facts}
        id="lo-trinh"
        aria-label="Thông tin học phần"
      >
        <div>
          <strong>497</strong>{" "}
          <span>Câu hỏi đã đối chiếu</span>
        </div>
        <div>
          <strong>6</strong>{" "}
          <span>Chương học</span>
        </div>
        <div>
          <strong>40 câu</strong>{" "}
          <span>Thi thử trong 60 phút</span>
        </div>
      </section>

      <section className={styles.roles} id="vai-tro">
        <article className={styles.studentRole}>
          <p>Dành cho sinh viên</p>
          <div>
            <h2>Luyện tập, thi thử và nhìn rõ tiến bộ.</h2>
            <p>
              Mỗi lần làm bài được lưu để bạn tiếp tục đúng chỗ và ôn lại
              phần còn yếu.
            </p>
          </div>
        </article>

        <div className={styles.roleStack}>
          <article className={styles.instructorRole}>
            <h2>Không gian giảng viên</h2>
            <p>
              Quản lý nội dung và báo cáo trong phạm vi học phần được phân
              công.
            </p>
          </article>
          <article className={styles.adminRole}>
            <h2>Trung tâm quản trị</h2>
            <p>
              Điều hành người dùng, vai trò, nội dung và nhật ký hệ thống.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.closing}>
        <div>
          <h2>Sẵn sàng bắt đầu?</h2>
          <p>
            Đăng nhập một lần, hệ thống đưa bạn tới đúng không gian làm việc.
          </p>
        </div>
        <Link href="/login">Đăng nhập</Link>
      </section>
    </main>
  );
}
