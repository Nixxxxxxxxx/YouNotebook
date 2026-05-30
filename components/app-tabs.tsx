 "use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ProfilePopover } from "@/components/profile/profile-popover";
import type { AuthUser } from "@/lib/auth/types";

import styles from "./app-tabs.module.css";

type AppSection = "diary" | "planner" | "thoughts";

type AppTabsProps = {
  active: AppSection;
  selectionMenu?: ReactNode;
};

const MENU_ITEMS = [
  {
    id: "planner",
    href: "/planner",
    icon: "/icons/check-square.svg",
    label: "Планировщик",
  },
  {
    id: "diary",
    href: "/",
    icon: "/icons/book-open.svg",
    label: "Дневник",
  },
  {
    id: "thoughts",
    href: "/thoughts",
    icon: "/icons/box-2.svg",
    label: "Склад мыслей",
  },
] as const;

function getActiveSection(pathname: string): AppSection {
  if (pathname.startsWith("/planner")) {
    return "planner";
  }

  if (pathname.startsWith("/thoughts")) {
    return "thoughts";
  }

  return "diary";
}

function NavigationRail({
  active,
  user,
}: {
  active: AppSection;
  user?: Pick<AuthUser, "email" | "id" | "lastActiveAt">;
}) {
  return (
    <div className={styles.menuDock}>
      <nav className={styles.tabs} aria-label="Разделы YouNotebook">
        <Link
          className={styles.logo}
          href="/auth"
          aria-label="Открыть экран авторизации"
        >
          Q
          <span className={styles.tooltip}>Авторизация</span>
        </Link>
        <span className={styles.separator} aria-hidden="true" />
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.id}
            className={styles.tab}
            data-active={active === item.id ? "true" : "false"}
            href={item.href}
            aria-label={item.label}
          >
            <img src={item.icon} alt="" width="24" height="24" />
            <span className={styles.tooltip}>{item.label}</span>
          </Link>
        ))}
        <span className={styles.separator} aria-hidden="true" />
        <ProfilePopover user={user} />
      </nav>
    </div>
  );
}

export function AppNavigation({
  user,
}: {
  user?: Pick<AuthUser, "email" | "id" | "lastActiveAt">;
}) {
  const pathname = usePathname();

  return <NavigationRail active={getActiveSection(pathname)} user={user} />;
}

export function AppActionDock({ children }: { children?: ReactNode }) {
  if (!children) {
    return null;
  }

  return <div className={styles.actionDock}>{children}</div>;
}

export function AppTabs({ active, selectionMenu }: AppTabsProps) {
  if (selectionMenu) {
    return <AppActionDock>{selectionMenu}</AppActionDock>;
  }

  return <NavigationRail active={active} />;
}
