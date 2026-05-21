import Link from "next/link";
import styles from "./app-tabs.module.css";

type AppTabsProps = {
  active: "diary" | "planner" | "thoughts";
};

export function AppTabs({ active }: AppTabsProps) {
  return (
    <>
      <nav className={styles.tabs} aria-label="Разделы YouNotebook">
        <Link
          className={`${styles.tab} ${active === "diary" ? styles.tabActive : ""}`}
          href="/"
        >
          Дневник
        </Link>
        <Link
          className={`${styles.tab} ${active === "planner" ? styles.tabActive : ""}`}
          href="/planner"
        >
          Планировщик
        </Link>
        <Link
          className={`${styles.tab} ${active === "thoughts" ? styles.tabActive : ""}`}
          href="/thoughts"
        >
          Склад мыслей
        </Link>
      </nav>
      <div className={styles.divider} aria-hidden="true" />
    </>
  );
}
