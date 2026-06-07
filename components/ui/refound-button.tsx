import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./refound-button.module.css";

type SharedProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  showGlyph?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

type RefoundButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type RefoundLinkProps = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function RefoundGlyph() {
  return (
    <span className={styles.glyph} aria-hidden="true">
      <svg viewBox="0 0 56 46" role="presentation">
        <defs>
          <linearGradient id="refound-button-thread" x1="8" x2="54" y1="23" y2="23">
            <stop stopColor="#ff1f1f" />
            <stop offset="0.55" stopColor="#d9d900" />
            <stop offset="1" stopColor="#04d95a" />
          </linearGradient>
        </defs>
        <circle className={styles.ringOne} cx="18" cy="23" r="15" />
        <circle className={styles.ringTwo} cx="18" cy="23" r="13" />
        <path
          className={styles.thread}
          d="M10 25 C22 3 30 40 46 26 C51 22 52 18 53 15"
        />
      </svg>
    </span>
  );
}

function ButtonContent({
  children,
  showGlyph,
}: {
  children: ReactNode;
  showGlyph: boolean;
}) {
  return (
    <>
      {showGlyph ? <RefoundGlyph /> : null}
      <span className={styles.label}>{children}</span>
    </>
  );
}

export function RefoundButton(props: RefoundButtonProps | RefoundLinkProps) {
  const {
    children,
    className,
    fullWidth = false,
    showGlyph = true,
    variant = "primary",
    ...rest
  } = props;
  const buttonClassName = cx(
    styles.button,
    styles[variant],
    fullWidth && styles.fullWidth,
    className,
  );

  if ("href" in rest && rest.href) {
    const { href, ...linkProps } = rest;

    return (
      <Link className={buttonClassName} href={href} {...linkProps}>
        <ButtonContent showGlyph={showGlyph}>{children}</ButtonContent>
      </Link>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button
      {...buttonProps}
      className={buttonClassName}
      type={buttonProps.type || "button"}
    >
      <ButtonContent showGlyph={showGlyph}>{children}</ButtonContent>
    </button>
  );
}
