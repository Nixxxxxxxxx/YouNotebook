"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { RefoundButton } from "@/components/ui/refound-button";
import { RefoundInput } from "@/components/ui/refound-input";
import { AuthError } from "@/lib/auth/types";
import { validateAuthInput } from "@/lib/auth/validation";

import styles from "./auth-screen.module.css";

type AuthMode = "login" | "register";
type FieldErrorTarget = "email" | "password" | "form" | "";

type AuthScreenProps = {
  mode: AuthMode;
  switchHref?: string;
};

type AuthFormProps = {
  buttonLabel?: string;
  className?: string;
  loadingLabel?: string;
  mode: AuthMode;
  onSuccess?: () => Promise<void> | void;
  showLegal?: boolean;
  showSwitch?: boolean;
  switchHref?: string;
};

const COPY = {
  login: {
    button: "Войти",
    loading: "Входим...",
    passwordLabel: "Пароль",
    subtitle: "Войдите, чтобы продолжить работу со своим пространством",
    switchHref: "/register",
    switchText: "Нет аккаунта? Создать",
    title: "С возвращением",
  },
  register: {
    button: "Создать аккаунт",
    loading: "Создаём...",
    passwordLabel: "Пароль",
    subtitle:
      "Нужен аккаунт, чтобы Refound понял, куда складывать рефы из плагина и Telegram-бота",
    switchHref: "/login",
    switchText: "Уже есть аккаунт? Войти",
    title: "Создай своё место для рефов",
  },
} satisfies Record<AuthMode, Record<string, string>>;

function getFieldTarget(code?: string): FieldErrorTarget {
  if (code?.startsWith("email")) return "email";
  if (code?.startsWith("password")) return "password";

  return "form";
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as {
      code?: string;
      error?: string;
    };

    return {
      message: data.error || "Не получилось продолжить. Попробуйте ещё раз",
      target: getFieldTarget(data.code),
    };
  } catch {
    return {
      message: "Не получилось продолжить. Попробуйте ещё раз",
      target: "form" as const,
    };
  }
}

export function AuthForm({
  buttonLabel,
  className,
  loadingLabel,
  mode,
  onSuccess,
  showLegal = mode === "register",
  showSwitch = true,
  switchHref,
}: AuthFormProps) {
  const router = useRouter();
  const copy = COPY[mode];
  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [errorTarget, setErrorTarget] = useState<FieldErrorTarget>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      validateAuthInput(email, password, mode);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Не получилось продолжить. Попробуйте ещё раз",
      );
      setErrorTarget(
        validationError instanceof AuthError
          ? getFieldTarget(validationError.code)
          : "form",
      );
      return;
    }

    setIsSubmitting(true);
    setError("");
    setErrorTarget("");

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const nextError = await readError(response);

        setError(nextError.message);
        setErrorTarget(nextError.target);
        return;
      }

      if (onSuccess) {
        await onSuccess();
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Не получилось продолжить. Попробуйте ещё раз");
      setErrorTarget("form");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={`${styles.form} ${className || ""}`} onSubmit={submit} noValidate>
      <RefoundInput
        id={emailId}
        autoComplete="email"
        disabled={isSubmitting}
        error={errorTarget === "email" ? error : ""}
        inputMode="email"
        label="E-mail"
        placeholder="E-mail"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <RefoundInput
        id={passwordId}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        disabled={isSubmitting}
        error={errorTarget === "password" ? error : ""}
        label={copy.passwordLabel}
        placeholder="Пароль"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {mode === "register" ? (
        <p className={styles.hint}>Минимум 8 символов</p>
      ) : null}
      <p
        className={styles.formError}
        data-visible={errorTarget === "form" && error ? "true" : "false"}
        id={formErrorId}
        role="status"
        aria-live="polite"
      >
        {errorTarget === "form" ? error : " "}
      </p>
      <RefoundButton
        className={styles.submitButton}
        disabled={isSubmitting}
        fullWidth
        type="submit"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? loadingLabel || copy.loading : buttonLabel || copy.button}
      </RefoundButton>
      {showSwitch ? (
        <Link className={styles.switchLink} href={switchHref || copy.switchHref}>
          {copy.switchText}
        </Link>
      ) : null}
      {showLegal ? (
        <p className={styles.legal}>
          Создавая аккаунт, вы соглашаетесь с условиями сервиса и политикой
          конфиденциальности.
        </p>
      ) : null}
    </form>
  );
}

export function AuthScreen({ mode, switchHref }: AuthScreenProps) {
  const copy = COPY[mode];

  return (
    <main className={styles.screen} data-mode={mode}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <Link className={styles.logo} href="/auth" aria-label="Refound">
          Refound
        </Link>
        <div className={styles.copy}>
          <h1 id="auth-title">{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <AuthForm mode={mode} switchHref={switchHref} />
      </section>
    </main>
  );
}
