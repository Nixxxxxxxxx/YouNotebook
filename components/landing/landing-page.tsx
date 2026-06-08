"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AuthForm } from "@/components/auth/auth-screen";
import { RefoundButton } from "@/components/ui/refound-button";

import styles from "./landing-page.module.css";

const CARD_IMAGES = [
  { className: styles.cardOne, height: 1497, src: "/refound/ref-1.png", width: 1200 },
  { className: styles.cardTwo, height: 630, src: "/refound/ref-2.png", width: 1200 },
  { className: styles.cardThree, height: 552, src: "/refound/ref-3.png", width: 736 },
  { className: styles.cardFour, height: 453, src: "/refound/ref-4.png", width: 684 },
  { className: styles.cardFive, height: 438, src: "/refound/ref-5.png", width: 736 },
  { className: styles.cardSix, height: 361, src: "/refound/ref-6.png", width: 523 },
  { className: styles.cardSeven, height: 736, src: "/refound/ref-7.png", width: 736 },
] as const;

const STEP_PROGRESS = [0, 0.58, 0.82, 1] as const;
const LINE_EASING = [0.22, 1, 0.36, 1] as const;

type Step = 0 | 1 | 2 | 3;

export function LandingPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const timeoutRef = useRef<number | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [connectMessage, setConnectMessage] = useState("");

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function moveToStep(nextStep: Step) {
    if (isAnimating || nextStep === step) return;

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    setIsAnimating(!reduceMotion);
    setStep(nextStep);

    if (!reduceMotion) {
      timeoutRef.current = window.setTimeout(() => {
        setIsAnimating(false);
        timeoutRef.current = null;
      }, 1180);
    }
  }

  async function openTelegramBot() {
    setConnectMessage("");

    try {
      const response = await fetch("/api/profile/telegram-links/start-token", {
        method: "POST",
      });

      if (!response.ok) {
        setConnectMessage("Сначала создай аккаунт, потом подключим Telegram");
        return;
      }

      const data = (await response.json()) as { telegramUrl?: string };

      if (data.telegramUrl) {
        window.open(data.telegramUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      setConnectMessage("Не получилось открыть бота. Попробуй ещё раз");
    }
  }

  function openExtensionConnect() {
    window.open("/extension-connect", "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.page}>
      <section className={styles.desktopStage} aria-label="Refound onboarding">
        <AnimatePresence mode="wait">
          {step === 0 ? (
            <CoverStep
              isAnimating={isAnimating}
              onStart={() => moveToStep(1)}
            />
          ) : (
            <motion.section
              key="onboarding"
              className={styles.onboarding}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.62, ease: LINE_EASING }}
            >
              <OnboardingPath progress={STEP_PROGRESS[step]} />
              <button
                className={styles.backButton}
                type="button"
                disabled={isAnimating}
                onClick={() => moveToStep(step === 1 ? 0 : ((step - 1) as Step))}
              >
                Назад
              </button>
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <StepShell
                    key="account"
                    wide
                    title="Создай своё место для рефов"
                    description="Нужен аккаунт, чтобы Refound понял, куда складывать рефы из плагина и Telegram-бота"
                  >
                    <AuthForm
                      className={styles.accountForm}
                      buttonLabel="Создать аккаунт"
                      loadingLabel="Создаём..."
                      mode="register"
                      onSuccess={() => {
                        router.refresh();
                        moveToStep(2);
                      }}
                      showSwitch
                      switchHref="/login"
                    />
                  </StepShell>
                ) : null}
                {step === 2 ? (
                  <StepShell
                    key="connect"
                    title="Сначала подключим входы"
                    description="Refound работает через два быстрых входа: плагин и Telegram-бота. Без них рефы просто неоткуда будет забирать"
                  >
                    <div className={styles.connectActions}>
                      <RefoundButton
                        variant="secondary"
                        showGlyph={false}
                        disabled={isAnimating}
                        onClick={openExtensionConnect}
                      >
                        Скачать плагин
                      </RefoundButton>
                      <RefoundButton
                        variant="secondary"
                        showGlyph={false}
                        disabled={isAnimating}
                        onClick={() => void openTelegramBot()}
                      >
                        Открыть бота
                      </RefoundButton>
                      <button className={styles.whyButton} type="button">
                        А для чего это все делать?
                      </button>
                    </div>
                    <p
                      className={styles.connectMessage}
                      data-visible={connectMessage ? "true" : "false"}
                      role="status"
                      aria-live="polite"
                    >
                      {connectMessage || " "}
                    </p>
                    <RefoundButton
                      disabled={isAnimating}
                      onClick={() => moveToStep(3)}
                    >
                      Готово, дальше
                    </RefoundButton>
                  </StepShell>
                ) : null}
                {step === 3 ? (
                  <StepShell
                    key="final"
                    title="Сначала кидай. Разберёшь потом."
                    description="Все новые рефы попадают во входящие. Там можно быстро убрать лишнее, раскидать находки по коллекциям и собрать shortlist под проект"
                  >
                    <RefoundButton href="/">Открыть Refound</RefoundButton>
                  </StepShell>
                ) : null}
              </AnimatePresence>
            </motion.section>
          )}
        </AnimatePresence>
      </section>

      <section
        className={styles.unsupported}
        aria-label="Устройство не поддерживается"
      >
        <p className={styles.unsupportedLogo}>Refound</p>
        <div>
          <h1>Пока только на большом экране</h1>
          <p>
            Мобильная и планшетная версии onboarding пока не поддерживаются.
            Открой Refound на ноутбуке или desktop, чтобы продолжить.
          </p>
        </div>
      </section>
    </main>
  );
}

function CoverStep({
  isAnimating,
  onStart,
}: {
  isAnimating: boolean;
  onStart: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className={styles.cover}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.34, ease: LINE_EASING }}
    >
      <div className={styles.fallingCards} aria-hidden="true">
        {CARD_IMAGES.map((card) => (
          <Image
            alt=""
            className={`${styles.fallingCard} ${card.className}`}
            data-motion={reduceMotion ? "off" : "on"}
            height={card.height}
            key={card.src}
            src={card.src}
            width={card.width}
          />
        ))}
      </div>
      <div className={styles.coverGlass}>
        <div className={styles.coverCopy}>
          <p className={styles.coverTitle}>Кидай рефы</p>
          <Image
            className={styles.coverHeroMark}
            src="/refound/group-3.svg"
            alt="Refound разберёт"
            width={1060}
            height={512}
            priority
          />
        </div>
        <div className={styles.coverActions}>
          <RefoundButton disabled={isAnimating} onClick={onStart}>
            Войти / зарегистрироваться
          </RefoundButton>
          <Link className={styles.loginLink} href="/login">
            Уже есть аккаунт? Войти
          </Link>
        </div>
      </div>
    </motion.section>
  );
}

function OnboardingPath({ progress }: { progress: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      className={styles.authPathSvg}
      viewBox="0 0 490 741"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="refound-path-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#ff1f1f" />
          <stop offset="0.55" stopColor="#f1a800" />
          <stop offset="1" stopColor="#15cc59" />
        </linearGradient>
      </defs>
      <path
        className={styles.pathFuture}
        d="M489 1C488.788 1 443.441 1.19846 371.879 1.92003C339.484 2.24666 327.464 5.69534 311.449 10.8684C286.444 18.9456 261.037 32.7574 235.525 50.437C220.601 60.7788 203.386 76.2809 184.034 96.0843C164.682 115.888 144.157 140.131 124.077 169.085C103.997 198.039 84.9848 230.97 73.0716 255.681C44.7132 314.503 50.7907 351.79 57.8282 370.888C60.7286 378.759 94.955 382.832 147.66 391.576C201.1 400.442 233.319 397.729 245.664 395.16C293.177 385.27 324.746 356.999 338.445 342.746C355.05 325.47 357.59 292.088 357.477 274.315C357.437 268.004 350.355 263.705 342.678 259.465C334.339 254.858 302.372 254.25 260.447 253.936C241.491 253.794 228.997 257.562 209.432 264.371C185.717 272.624 157.418 292.836 121.547 324.168C75.6164 364.287 52.9525 401.761 43.3915 416.846C19.8783 453.943 13.0134 493.053 6.14599 538.102C-3.10635 598.796 2.68945 638.293 3.94799 648.043C8.00763 689.802 9.42545 724.442 11.2142 730.186C12.3149 733.053 13.8074 735.821 17.1709 740"
      />
      <motion.path
        className={styles.pathActive}
        d="M489 1C488.788 1 443.441 1.19846 371.879 1.92003C339.484 2.24666 327.464 5.69534 311.449 10.8684C286.444 18.9456 261.037 32.7574 235.525 50.437C220.601 60.7788 203.386 76.2809 184.034 96.0843C164.682 115.888 144.157 140.131 124.077 169.085C103.997 198.039 84.9848 230.97 73.0716 255.681C44.7132 314.503 50.7907 351.79 57.8282 370.888C60.7286 378.759 94.955 382.832 147.66 391.576C201.1 400.442 233.319 397.729 245.664 395.16C293.177 385.27 324.746 356.999 338.445 342.746C355.05 325.47 357.59 292.088 357.477 274.315C357.437 268.004 350.355 263.705 342.678 259.465C334.339 254.858 302.372 254.25 260.447 253.936C241.491 253.794 228.997 257.562 209.432 264.371C185.717 272.624 157.418 292.836 121.547 324.168C75.6164 364.287 52.9525 401.761 43.3915 416.846C19.8783 453.943 13.0134 493.053 6.14599 538.102C-3.10635 598.796 2.68945 638.293 3.94799 648.043C8.00763 689.802 9.42545 724.442 11.2142 730.186C12.3149 733.053 13.8074 735.821 17.1709 740"
        pathLength={1}
        strokeDasharray="1"
        initial={false}
        animate={{ strokeDashoffset: 1 - progress }}
        transition={{
          duration: reduceMotion ? 0 : 1.08,
          ease: LINE_EASING,
        }}
      />
    </svg>
  );
}

function StepShell({
  children,
  description,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
  wide?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={styles.step}
      data-wide={wide ? "true" : "false"}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{
        delay: reduceMotion ? 0 : 0.26,
        duration: 0.72,
        ease: LINE_EASING,
      }}
    >
      <TypewriterHeading text={title} />
      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 18, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{
          delay: reduceMotion ? 0 : 0.58,
          duration: 0.72,
          ease: LINE_EASING,
        }}
      >
        {description}
      </motion.p>
      <motion.div
        className={styles.stepBody}
        initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          delay: reduceMotion ? 0 : 0.74,
          duration: 0.7,
          ease: LINE_EASING,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function TypewriterHeading({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  let characterIndex = 0;

  return (
    <h1 aria-label={text}>
      {text.split(" ").map((word, wordIndex) => (
        <span
          className={styles.typeWord}
          key={`${word}-${wordIndex}`}
          aria-hidden="true"
        >
          {Array.from(word).map((character) => {
            const currentIndex = characterIndex;
            characterIndex += 1;

            return (
              <motion.span
                className={styles.typeChar}
                key={`${character}-${currentIndex}`}
                initial={reduceMotion ? false : { opacity: 0, y: "0.55em" }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: reduceMotion ? 0 : 0.2 + currentIndex * 0.024,
                  duration: 0.22,
                  ease: LINE_EASING,
                }}
              >
                {character}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
