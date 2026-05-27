"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { AnimatedGradientButton } from "@/components/ui/animated-gradient-button";
import { MorphicBackground } from "@/components/ui/morphic-background";
import { validateAuthInput } from "@/lib/auth/validation";

import styles from "./auth-screen.module.css";

type AuthMode = "login" | "register";

type AuthScreenProps = {
  mode: AuthMode;
  switchHref?: string;
};

const COPY = {
  login: {
    button: "Войти",
    loading: "Входим…",
    passwordPlaceholder: "Введите пароль",
    subtitle: "Войдите, чтобы продолжить работу со своим пространством",
    switchHref: "/register",
    switchText: "Нет аккаунта? Создать",
    title: "С возвращением",
  },
  register: {
    button: "Создать пространство",
    loading: "Создаём…",
    passwordPlaceholder: "Придумайте пароль",
    subtitle:
      "Место, где можно записывать мысли, планировать день и сохранять полезное без лишнего шума",
    switchHref: "/login",
    switchText: "Уже есть аккаунт? Войти",
    title: "Создайте своё пространство",
  },
} satisfies Record<AuthMode, Record<string, string>>;

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Не получилось продолжить. Попробуйте ещё раз";
  } catch {
    return "Не получилось продолжить. Попробуйте ещё раз";
  }
}

export function AuthScreen({ mode, switchHref }: AuthScreenProps) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const hintId = useId();
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Не получилось продолжить. Попробуйте ещё раз");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.screen} data-mode={mode}>
      <section className={styles.formPanel} aria-labelledby="auth-title">
        <div className={styles.logo} aria-label="Quietly">
          Q
        </div>
        <div className={styles.copy}>
          <h1 id="auth-title">{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field} htmlFor={emailId}>
            <span>Email</span>
            <input
              id={emailId}
              autoComplete="email"
              disabled={isSubmitting}
              inputMode="email"
              placeholder="Введите E-mail"
              type="email"
              value={email}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={styles.field} htmlFor={passwordId}>
            <span>Пароль</span>
            <input
              id={passwordId}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              disabled={isSubmitting}
              placeholder={copy.passwordPlaceholder}
              type="password"
              value={password}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={
                [mode === "register" ? hintId : "", error ? errorId : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "register" ? (
            <p className={styles.hint} id={hintId}>
              Минимум 8 символов
            </p>
          ) : null}
          <p
            className={styles.error}
            id={errorId}
            role="status"
            aria-live="polite"
            data-visible={error ? "true" : "false"}
          >
            {error || " "}
          </p>
          <AnimatedGradientButton
            className={styles.submitButton}
            disabled={isSubmitting}
            fullWidth
            type="submit"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? copy.loading : copy.button}
          </AnimatedGradientButton>
        </form>
        <Link className={styles.switchLink} href={switchHref || copy.switchHref}>
          {copy.switchText}
        </Link>
        {mode === "register" ? (
          <p className={styles.legal}>
            Создавая аккаунт, вы соглашаетесь с условиями сервиса и политикой
            конфиденциальности.
          </p>
        ) : null}
      </section>
      <AuthQuietIllustration />
    </main>
  );
}

function AuthQuietIllustration() {
  return (
    <section className={styles.visual} aria-hidden="true">
      <div className={styles.unionShape}>
        <MorphicBackground className={styles.morphicLayer} />
        <div className={styles.dividers}>
          <span data-divider="vertical-one" />
          <span data-divider="vertical-two" />
          <span data-divider="vertical-three" />
          <span data-divider="horizontal-one" />
          <span data-divider="horizontal-two" />
          <span data-divider="horizontal-three" />
        </div>
      </div>
    </section>
  );
}
