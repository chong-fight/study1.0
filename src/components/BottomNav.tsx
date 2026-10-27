"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  House,
  LibraryBig,
  RotateCcw,
  UserRound,
} from "lucide-react";

const items = [
  { href: "/", label: "今日", icon: House, parent: "/" },
  { href: "/learn", label: "学习", icon: BookOpen, parent: "/learn" },
  {
    href: "/library",
    label: "短语库",
    icon: LibraryBig,
    parent: "/library",
  },
  { href: "/review", label: "复习", icon: RotateCcw, parent: "/review" },
  {
    href: "/profile",
    label: "我的",
    icon: UserRound,
    parent: "/profile",
  },
];

function normalizedPath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

export default function BottomNav() {
  const pathname = normalizedPath(usePathname());
  const parentPath = pathname.startsWith("/import")
    ? "/library"
    : pathname;

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {items.map((item) => {
        const Icon = item.icon;
        const active = parentPath === item.parent;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-link"
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon aria-hidden="true" />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
