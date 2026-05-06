"use client";

import styles from "./diary-app.module.css";

export function DynamicBackground() {
  return (
    <div className={styles.background} aria-hidden="true">
      <div className={styles.orb} />
    </div>
  );
}
