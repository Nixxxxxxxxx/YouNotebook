"use client";

import { useRef } from "react";
import styles from "./diary-app.module.css";

export function DynamicBackground() {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={styles.background}
      aria-hidden="true"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--pointer-x",
          `${event.clientX - bounds.left}px`,
        );
        event.currentTarget.style.setProperty(
          "--pointer-y",
          `${event.clientY - bounds.top}px`,
        );
      }}
    >
      <div className={styles.pointerGlow} />
      <div className={styles.blueMist} />
      <div className={styles.orb}>
        <span className={styles.orbCore} />
        <span className={`${styles.orbRing} ${styles.orbRingOne}`} />
        <span className={`${styles.orbRing} ${styles.orbRingTwo}`} />
        <span className={`${styles.orbRing} ${styles.orbRingThree}`} />
      </div>
      <div className={styles.bottomAtmosphere} />
    </div>
  );
}

