"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { AnimatedGradientButton } from "@/components/ui/animated-gradient-button";
import type { AuthUser } from "@/lib/auth/types";

import styles from "./profile-popover.module.css";

type ProfileUser = Pick<AuthUser, "email" | "id" | "lastActiveAt">;

type TelegramLink = {
  telegramUserId: string;
  createdAt: string;
};

type ProfileResponse = {
  telegramLinks: TelegramLink[];
  user: ProfileUser;
};

type ProfilePopoverProps = {
  user?: ProfileUser;
};

const popoverTransition = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1],
} as const;

const telegramBotName = "@YouTodayWithBot";
const telegramBotUrl = "https://t.me/YouTodayWithBot";

function getInitial(email?: string) {
  return (email?.trim()[0] || "N").toUpperCase();
}

async function readError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Не получилось сохранить. Попробуйте еще раз";
  } catch {
    return "Не получилось сохранить. Попробуйте еще раз";
  }
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={styles.statusDot}
      data-connected={connected ? "true" : "false"}
      aria-hidden="true"
    />
  );
}

function SectionHeader({
  children,
  meta,
}: {
  children: string;
  meta?: ReactNode;
}) {
  return (
    <div className={styles.sectionHeader}>
      <h3>{children}</h3>
      {meta}
    </div>
  );
}

export function ProfilePopover({ user: initialUser }: ProfilePopoverProps) {
  const shouldReduceMotion = useReducedMotion();
  const currentPasswordId = useId();
  const nextPasswordId = useId();
  const telegramId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [profileUser, setProfileUser] = useState<ProfileUser | undefined>(
    initialUser,
  );
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [telegramValue, setTelegramValue] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegramSaving, setIsTelegramSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const connected = telegramLinks.length > 0;
  const telegramStatusLabel = isLoading
    ? "Проверяем"
    : connected
      ? "Подключен"
      : "Не подключен";
  const email = profileUser?.email ?? initialUser?.email ?? "Тихое пространство";
  const initial = getInitial(email);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let canceled = false;

    async function loadProfile() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/profile", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(await readError(response));
        }

        const data = (await response.json()) as ProfileResponse;

        if (!canceled) {
          setProfileUser(data.user);
          setTelegramLinks(data.telegramLinks);
        }
      } catch (loadError) {
        if (!canceled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не получилось загрузить профиль",
          );
        }
      } finally {
        if (!canceled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      canceled = true;
    };
  }, [open]);

  async function submitTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTelegramSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/profile/telegram-links", {
        body: JSON.stringify({ telegramUserId: telegramValue }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { telegramLinks: TelegramLink[] };
      setTelegramLinks(data.telegramLinks);
      setTelegramValue("");
      setStatusMessage("Telegram подключен. Бот будет складывать мысли сюда.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не получилось подключить Telegram",
      );
    } finally {
      setIsTelegramSaving(false);
    }
  }

  async function connectTelegramWithStart() {
    setIsTelegramSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/profile/telegram-links/start-token", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { telegramUrl?: string };

      if (!data.telegramUrl) {
        throw new Error("Не получилось создать ссылку подключения");
      }

      window.open(data.telegramUrl, "_blank", "noopener,noreferrer");
      setStatusMessage("Открыл Telegram. Нажмите /start в боте — и склад подключится сам.");
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Не получилось открыть Telegram",
      );
    } finally {
      setIsTelegramSaving(false);
    }
  }

  async function removeTelegram(telegramUserId: string) {
    setIsTelegramSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/profile/telegram-links", {
        body: JSON.stringify({ telegramUserId }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { telegramLinks: TelegramLink[] };
      setTelegramLinks(data.telegramLinks);
      setStatusMessage("Telegram отключен от этого пространства.");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не получилось отключить Telegram",
      );
    } finally {
      setIsTelegramSaving(false);
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPasswordSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch("/api/profile/password", {
        body: JSON.stringify({ currentPassword, nextPassword }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setCurrentPassword("");
      setNextPassword("");
      setStatusMessage("Пароль обновлен. Пространство закрыто крепче.");
    } catch (passwordError) {
      setError(
        passwordError instanceof Error
          ? passwordError.message
          : "Не получилось обновить пароль",
      );
    } finally {
      setIsPasswordSaving(false);
    }
  }

  async function logout() {
    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className={styles.profileRoot}>
      <button
        ref={triggerRef}
        className={styles.profileButton}
        type="button"
        aria-label="Открыть профиль"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{initial}</span>
        <span className={styles.tooltip}>Профиль</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={popoverRef}
            className={styles.popover}
            role="dialog"
            aria-label="Профиль Quietly"
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, x: -8, y: 10, scale: 0.96, filter: "blur(10px)" }
            }
            animate={
              shouldReduceMotion
                ? undefined
                : { opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }
            }
            exit={
              shouldReduceMotion
                ? undefined
                : { opacity: 0, x: -6, y: 6, scale: 0.97, filter: "blur(8px)" }
            }
            transition={popoverTransition}
          >
            <header className={styles.header}>
              <div className={styles.avatar} aria-hidden="true">
                <span>{initial}</span>
              </div>
              <div>
                <h2>Профиль</h2>
                <p>{email}</p>
              </div>
            </header>

            <section className={styles.section}>
              <SectionHeader
                meta={
                  <span className={styles.status}>
                    <StatusDot connected={connected} />
                    {telegramStatusLabel}
                  </span>
                }
              >
                Telegram-бот
              </SectionHeader>

              {connected ? (
                <div className={styles.telegramConnected}>
                  <p>
                    Откройте бота и пересылайте ему посты, ссылки или сообщения.
                    Они появятся в «Складе мыслей».
                  </p>
                  <a
                    className={styles.telegramBotLink}
                    href={telegramBotUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть {telegramBotName}
                  </a>
                  <div className={styles.linkList}>
                    {telegramLinks.map((link) => (
                      <button
                        key={link.telegramUserId}
                        type="button"
                        disabled={isTelegramSaving}
                        onClick={() => void removeTelegram(link.telegramUserId)}
                      >
                        <span>ID {link.telegramUserId}</span>
                        <b>Отключить</b>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.telegramHint}>
                    Одна кнопка откроет бота. После /start он сам привяжет
                    Telegram к вашему складу мыслей.
                  </p>
                  <AnimatedGradientButton
                    className={styles.primaryButton}
                    type="button"
                    fullWidth
                    disabled={isTelegramSaving}
                    onClick={() => void connectTelegramWithStart()}
                  >
                    {isTelegramSaving ? "Открываем..." : "Подключить Telegram"}
                  </AnimatedGradientButton>
                  <details className={styles.manualTelegram}>
                    <summary>Если Telegram не открылся</summary>
                    <form onSubmit={submitTelegram}>
                      <label className={styles.field} htmlFor={telegramId}>
                        <span>Telegram user id</span>
                        <input
                          id={telegramId}
                          inputMode="numeric"
                          placeholder="Telegram user ID"
                          value={telegramValue}
                          disabled={isTelegramSaving}
                          onChange={(event) =>
                            setTelegramValue(event.target.value)
                          }
                        />
                      </label>
                      <button
                        className={styles.secondaryButton}
                        type="submit"
                        disabled={isTelegramSaving}
                      >
                        Подключить вручную
                      </button>
                    </form>
                  </details>
                </>
              )}
            </section>

            <form className={styles.section} onSubmit={submitPassword}>
              <SectionHeader>Пароль</SectionHeader>
              <label className={styles.field} htmlFor={currentPasswordId}>
                <span>Текущий пароль</span>
                <input
                  id={currentPasswordId}
                  autoComplete="current-password"
                  type="password"
                  placeholder="Текущий пароль"
                  value={currentPassword}
                  disabled={isPasswordSaving}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label className={styles.field} htmlFor={nextPasswordId}>
                <span>Новый пароль</span>
                <input
                  id={nextPasswordId}
                  autoComplete="new-password"
                  type="password"
                  placeholder="Новый пароль"
                  value={nextPassword}
                  disabled={isPasswordSaving}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </label>
              <button
                className={styles.secondaryButton}
                type="submit"
                disabled={isPasswordSaving}
              >
                {isPasswordSaving ? "Обновляем..." : "Обновить пароль"}
              </button>
            </form>

            <p
              className={styles.feedback}
              data-visible={error || statusMessage ? "true" : "false"}
              data-error={error ? "true" : "false"}
              role="status"
              aria-live="polite"
            >
              {error || statusMessage || " "}
            </p>

            <button
              className={styles.logoutButton}
              type="button"
              disabled={isLoggingOut}
              onClick={() => void logout()}
            >
              {isLoggingOut ? "Выходим..." : "Выйти из пространства"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
