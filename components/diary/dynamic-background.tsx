"use client";

import { DottedSurface } from "@/components/ui/dotted-surface";
import styles from "./diary-app.module.css";

export function DynamicBackground() {
  return <DottedSurface className={styles.dottedSurface} aria-hidden="true" />;
}
