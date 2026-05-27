import thoughtStyles from "@/components/thoughts/thoughts-app.module.css";
import styles from "./loading.module.css";

const CARD_COUNT = 6;

export default function ThoughtsLoading() {
  return (
    <main className={thoughtStyles.shell}>
      <aside className={thoughtStyles.sidebar}>
        <div className={styles.skeletonButton} />
        <nav className={styles.skeletonNav} aria-label="Загрузка склада мыслей">
          {[136, 112, 96, 124].map((width) => (
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
            {["Сегодня", "Вчера"].map((label) => (
              <section className={styles.skeletonGroup} key={label}>
                <div className={styles.skeletonHeader}>
                  <span
                    className={styles.skeletonLine}
                    style={{ width: label === "Сегодня" ? 84 : 118 }}
                  />
                  <span className={styles.skeletonLine} style={{ flex: 1 }} />
                </div>
                <div className={styles.skeletonGrid}>
                  {Array.from({ length: 3 }).map((_, columnIndex) => (
                    <div className={styles.skeletonColumn} key={columnIndex}>
                      {Array.from({ length: CARD_COUNT / 3 }).map((__, index) => (
                        <div
                          className={styles.skeletonCard}
                          key={`${columnIndex}-${index}`}
                        />
                      ))}
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
