import {
  useId,
  type InputHTMLAttributes,
} from "react";

import styles from "./refound-input.module.css";

type RefoundInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  error?: string;
  id?: string;
  label: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function RefoundInput({
  className,
  error,
  id,
  label,
  ...props
}: RefoundInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <label
      className={cx(styles.field, className)}
      data-error={error ? "true" : "false"}
      htmlFor={inputId}
    >
      <span className={styles.label}>{label}</span>
      <input
        id={inputId}
        aria-describedby={error ? errorId : props["aria-describedby"]}
        aria-invalid={error ? "true" : props["aria-invalid"]}
        {...props}
      />
      <svg
        className={styles.underline}
        viewBox="0 0 409 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M1 14 C18 9 25 23 42 15 C57 8 64 6 81 16 C98 25 116 20 133 14 C153 7 166 6 180 3 C181 21 195 15 213 15 C235 14 252 14 270 15 C289 16 302 18 314 10 C326 1 337 19 349 15 C371 8 386 22 408 13" />
      </svg>
      <span
        className={styles.error}
        id={errorId}
        role="status"
        aria-live="polite"
      >
        {error || " "}
      </span>
    </label>
  );
}
