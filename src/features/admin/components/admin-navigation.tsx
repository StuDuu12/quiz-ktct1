import {
  BookOpenText,
  ChartBar,
  FileArrowUp,
  Gauge,
  Question,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import type { AppRole } from "@/src/features/auth/roles";

const items: Array<{
  href: string;
  label: string;
  icon: typeof Gauge;
  roles: AppRole[];
}> = [
  { href: "/admin", label: "Tổng quan", icon: Gauge, roles: ["admin", "instructor"] },
  {
    href: "/admin/courses",
    label: "Khóa học",
    icon: BookOpenText,
    roles: ["admin", "instructor"],
  },
  {
    href: "/admin/questions",
    label: "Câu hỏi",
    icon: Question,
    roles: ["admin", "instructor"],
  },
  {
    href: "/admin/import",
    label: "Nhập Markdown",
    icon: FileArrowUp,
    roles: ["admin", "instructor"],
  },
  {
    href: "/admin/users",
    label: "Người dùng",
    icon: UsersThree,
    roles: ["admin"],
  },
  {
    href: "/admin/reports",
    label: "Báo cáo",
    icon: ChartBar,
    roles: ["admin", "instructor"],
  },
];

export function AdminNavigation({
  role,
  currentPath,
}: {
  role: AppRole;
  currentPath: string;
}) {
  return (
    <nav aria-label="Điều hướng quản trị" className="admin-navigation">
      {items
        .filter((item) => item.roles.includes(role))
        .map(({ href, label, icon: Icon }) => {
          const active =
            currentPath === href ||
            (href !== "/admin" && currentPath.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
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
