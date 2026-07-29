import {
  BookOpenText,
  ChartBar,
  FileArrowUp,
  Gauge,
  Question,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

const items = [
  { href: "/instructor", label: "Tổng quan", icon: Gauge },
  { href: "/instructor/courses", label: "Học phần", icon: BookOpenText },
  { href: "/instructor/questions", label: "Ngân hàng câu hỏi", icon: Question },
  { href: "/instructor/import", label: "Nhập dữ liệu", icon: FileArrowUp },
  { href: "/instructor/reports", label: "Báo cáo", icon: ChartBar },
];

export function InstructorNavigation({ currentPath }: { currentPath: string }) {
  return (
    <nav aria-label="Điều hướng giảng viên" className="admin-navigation">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          currentPath === href ||
          (href !== "/instructor" && currentPath.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} weight={active ? "fill" : "duotone"} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
