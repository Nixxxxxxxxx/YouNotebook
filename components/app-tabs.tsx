import Link from "next/link";
import styles from "./app-tabs.module.css";

type AppTabsProps = {
  active: "diary" | "planner";
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
      </nav>
      <div className={styles.divider} aria-hidden="true" />
    </>
  );
}
