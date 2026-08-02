import { ArrowLeft } from "@phosphor-icons/react/ssr";
import Link from "next/link";

export function ContextBackLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      className={["context-back-link", className].filter(Boolean).join(" ")}
      href={href}
    >
      <ArrowLeft size={18} weight="bold" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
