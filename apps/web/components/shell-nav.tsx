"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary navigation. Programs, Classes and People are staff pages; students
 * reach their programs and classes from the home page.
 */
export function ShellNav({ staff }: { staff: boolean }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const items = [
    { href: "/", label: t("home") },
    ...(staff
      ? [
          { href: "/programs", label: t("programs") },
          { href: "/classes", label: t("classes") },
          { href: "/people", label: t("people") },
        ]
      : []),
  ];

  return (
    <nav aria-label={t("main")} className="flex gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex h-8 items-center rounded-[10px] px-3 text-[13px] whitespace-nowrap text-muted transition-colors hover:bg-subtle-2 hover:text-body aria-[current=page]:bg-subtle-2 aria-[current=page]:font-medium aria-[current=page]:text-body"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
