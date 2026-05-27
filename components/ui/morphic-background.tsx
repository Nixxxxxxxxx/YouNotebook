"use client";

import type { CSSProperties } from "react";

import styles from "./morphic-background.module.css";

export type MorphicBackgroundProps = {
  ballColor?: string;
  className?: string;
};

const BALLS = [
  { delay: -1.2, drift: 74, duration: 18, opacity: 0.72, size: 54, x: 8 },
  { delay: -8.4, drift: -96, duration: 24, opacity: 0.58, size: 96, x: 20 },
  { delay: -14.8, drift: 120, duration: 28, opacity: 0.42, size: 132, x: 32 },
  { delay: -5.6, drift: -72, duration: 20, opacity: 0.7, size: 64, x: 47 },
  { delay: -18.2, drift: 84, duration: 26, opacity: 0.52, size: 112, x: 62 },
  { delay: -11.6, drift: -126, duration: 30, opacity: 0.4, size: 154, x: 78 },
  { delay: -22.4, drift: 64, duration: 22, opacity: 0.64, size: 72, x: 90 },
  { delay: -27.2, drift: -44, duration: 34, opacity: 0.34, size: 190, x: 12 },
  { delay: -3.8, drift: 106, duration: 25, opacity: 0.5, size: 88, x: 55 },
  { delay: -16.6, drift: -86, duration: 29, opacity: 0.46, size: 128, x: 84 },
] as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function MorphicBackground({
  ballColor = "#5382fe",
  className,
}: MorphicBackgroundProps) {
  return (
    <div
      className={cx(styles.root, className)}
      style={{ "--morphic-ball": ballColor } as CSSProperties}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.particleField} aria-hidden="true">
        {BALLS.map((ball, index) => (
          <span
            key={`${ball.x}-${ball.size}-${ball.delay}`}
            className={styles.ball}
            data-variant={index % 3}
            style={
              {
                "--ball-delay": `${ball.delay}s`,
                "--ball-drift": `${ball.drift}px`,
                "--ball-drift-mid": `${Math.round(ball.drift * 0.42)}px`,
                "--ball-duration": `${ball.duration}s`,
                "--ball-opacity": ball.opacity,
                "--ball-size": `${ball.size}px`,
                "--ball-x": `${ball.x}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className={styles.grain} aria-hidden="true" />
      <svg className={styles.filterSvg} aria-hidden="true" focusable="false">
        <defs>
          <filter id="quietly-morphic-goo">
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="14" />
            <feColorMatrix
              in="blur"
              result="goo"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
