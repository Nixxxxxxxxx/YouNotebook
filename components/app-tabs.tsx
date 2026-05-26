/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./app-tabs.module.css";

type AppTabsProps = {
  active: "diary" | "planner" | "thoughts";
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

export function AppTabs({ active, selectionMenu }: AppTabsProps) {
  if (selectionMenu) {
    return <div className={styles.actionDock}>{selectionMenu}</div>;
  }

  return (
    <div className={styles.menuDock}>
      <nav className={styles.tabs} aria-label="Разделы YouNotebook">
        <span className={styles.logo} aria-label="Quietly">
          Q
        </span>
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
        <button
          className={styles.profileButton}
          type="button"
          aria-label="Профиль в разработке"
        >
          <span aria-hidden="true">N</span>
          <span className={styles.tooltip}>Профиль скоро</span>
        </button>
      </nav>
    </div>
  );
}
