"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./animated-gradient-button.module.css";

type AnimatedGradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  iconOnly?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AnimatedGradientButton({
  children,
  className,
  fullWidth = false,
  iconOnly = false,
  type = "button",
  ...props
}: AnimatedGradientButtonProps) {
  return (
    <button
      className={cx(
        styles.button,
        fullWidth && styles.fullWidth,
        iconOnly && styles.iconOnly,
        className,
      )}
      type={type}
      {...props}
    >
      <span className={styles.content}>{children}</span>
    </button>
  );
}
