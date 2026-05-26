import thoughtStyles from "@/components/thoughts/thoughts-app.module.css";

import styles from "./loading.module.css";

export default function ThoughtsLoading() {
  return (
    <main className={thoughtStyles.shell}>
      <aside className={thoughtStyles.sidebar}>
        <div className={styles.skeletonButton} />
        <nav className={styles.skeletonNav} aria-label="Загрузка склада мыслей">
          {["136px", "112px", "96px", "124px"].map((width) => (
            <div className={styles.skeletonNavRow} key={width}>
              <span className={styles.skeletonBadge} />
              <span className={styles.skeletonLine} style={{ width }} />
            </div>
          ))}
        </nav>
      </aside>

      <section className={thoughtStyles.contentScroller}>
        <div className={thoughtStyles.content}>
          <div className={styles.skeletonContent}>
            {[0, 1].map((group) => (
              <section className={styles.skeletonGroup} key={group}>
                <div className={styles.skeletonHeader}>
                  <span
                    className={styles.skeletonLine}
                    style={{ width: group === 0 ? 84 : 118 }}
                  />
                  <span className={styles.skeletonLine} style={{ flex: 1 }} />
                </div>
                <div className={styles.skeletonGrid}>
                  {[0, 1, 2].map((column) => (
                    <div className={styles.skeletonColumn} key={column}>
                      <div className={styles.skeletonCard} />
                      <div className={styles.skeletonCard} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
