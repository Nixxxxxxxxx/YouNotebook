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
  { className: styles.cardOne, src: "/refound/ref-1.png" },
  { className: styles.cardTwo, src: "/refound/ref-2.png" },
  { className: styles.cardThree, src: "/refound/ref-3.png" },
  { className: styles.cardFour, src: "/refound/ref-4.png" },
  { className: styles.cardFive, src: "/refound/ref-5.png" },
  { className: styles.cardSix, src: "/refound/ref-6.png" },
  { className: styles.cardSeven, src: "/refound/ref-7.png" },
] as const;

const STEP_PROGRESS = [0, 0.13, 0.32, 0.53, 0.76, 1] as const;
const LINE_EASING = [0.22, 1, 0.36, 1] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5;

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
      }, 820);
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
              transition={{ duration: 0.32, ease: LINE_EASING }}
            >
              {step > 1 ? <OnboardingPath progress={STEP_PROGRESS[step]} /> : null}
              <button
                className={styles.backButton}
                type="button"
                disabled={isAnimating}
                onClick={() => moveToStep((step - 1) as Step)}
              >
                Назад
              </button>
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <AuthWelcomeStep
                    key="auth-welcome"
                    onDone={() => moveToStep(2)}
                  />
                ) : null}
                {step === 2 ? (
                  <StepShell key="welcome">
                    <h1>Спасибо, что зашёл потыкать сервис</h1>
                    <p>
                      Refound помогает быстро забирать рефы из Pinterest,
                      Are.na, Dribbble и Telegram, складывать их в одно место и
                      потом спокойно разбирать по коллекциям
                    </p>
                    <RefoundButton
                      disabled={isAnimating}
                      onClick={() => moveToStep(3)}
                    >
                      Поехали
                    </RefoundButton>
                  </StepShell>
                ) : null}
                {step === 3 ? (
                  <StepShell key="account" wide>
                    <h1>Создай своё место для рефов</h1>
                    <p>
                      Нужен аккаунт, чтобы Refound понял, куда складывать рефы
                      из плагина и Telegram-бота
                    </p>
                    <AuthForm
                      className={styles.accountForm}
                      buttonLabel="Создать аккаунт"
                      loadingLabel="Создаём..."
                      mode="register"
                      onSuccess={() => {
                        router.refresh();
                        moveToStep(4);
                      }}
                      showSwitch
                      switchHref="/login"
                    />
                  </StepShell>
                ) : null}
                {step === 4 ? (
                  <StepShell key="connect">
                    <h1>Сначала подключим входы</h1>
                    <p>
                      Refound работает через два быстрых входа: плагин и
                      Telegram-бота. Без них рефы просто неоткуда будет
                      забирать
                    </p>
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
                      onClick={() => moveToStep(5)}
                    >
                      Готово, дальше
                    </RefoundButton>
                  </StepShell>
                ) : null}
                {step === 5 ? (
                  <StepShell key="final">
                    <h1>Сначала кидай. Разберёшь потом.</h1>
                    <p>
                      Все новые рефы попадают во входящие. Там можно быстро
                      убрать лишнее, раскидать находки по коллекциям и собрать
                      shortlist под проект
                    </p>
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
        {CARD_IMAGES.map((card, index) => (
          <motion.img
            alt=""
            className={`${styles.fallingCard} ${card.className}`}
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    rotate: index % 2 === 0 ? -4 : 4,
                    y: -220 - index * 26,
                  }
            }
            animate={{
              opacity: 0.8,
              rotate: index % 2 === 0 ? -2 : 2,
              y: 0,
            }}
            transition={{
              delay: reduceMotion ? 0 : 0.08 + index * 0.08,
              duration: 0.9,
              ease: LINE_EASING,
            }}
            key={card.src}
            src={card.src}
          />
        ))}
      </div>
      <div className={styles.coverGlass}>
        <div className={styles.coverCopy}>
          <p className={styles.coverTitle}>Кидай рефы</p>
          <div className={styles.brandLockup}>
            <Image
              className={styles.coverMark}
              src="/refound/cover-mark.svg"
              alt=""
              width={970}
              height={294}
              priority
            />
            <Image
              className={styles.coverLine}
              src="/refound/cover-line.svg"
              alt=""
              width={922}
              height={345}
              priority
            />
            <span className={styles.refoundStamp}>Refound</span>
            <span className={styles.sorts}>разберёт</span>
          </div>
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

function AuthWelcomeStep({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => onDoneRef.current(),
      reduceMotion ? 420 : 1320,
    );

    return () => window.clearTimeout(timeout);
  }, [reduceMotion]);

  return (
    <motion.div
      className={styles.authWelcome}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
      transition={{
        delay: reduceMotion ? 0 : 0.12,
        duration: 0.48,
        ease: LINE_EASING,
      }}
    >
      <span>Добро пожаловать в</span>
      <span className={styles.authLogoLockup} aria-label="Refound">
        <Image
          className={styles.authLogoLine}
          src="/refound/auth-logo-line.svg"
          alt=""
          width={366}
          height={5}
          priority
        />
        <span className={styles.authLogoBlob} />
        <span className={styles.authLogoText}>Refound</span>
      </span>
      <Image
        className={styles.authPathStart}
        src="/refound/auth-path-start.svg"
        alt=""
        width={488}
        height={739}
        priority
      />
    </motion.div>
  );
}

function OnboardingPath({ progress }: { progress: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      className={styles.pathSvg}
      viewBox="0 0 1920 1080"
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
        d="M982 -34 C926 156 1042 262 900 330 C732 410 912 576 1004 484 C1084 404 1144 530 1008 610 C850 706 762 818 860 910 C940 986 898 1128 822 1170"
      />
      <motion.path
        className={styles.pathActive}
        d="M982 -34 C926 156 1042 262 900 330 C732 410 912 576 1004 484 C1084 404 1144 530 1008 610 C850 706 762 818 860 910 C940 986 898 1128 822 1170"
        pathLength={1}
        strokeDasharray="1"
        initial={false}
        animate={{ strokeDashoffset: 1 - progress }}
        transition={{
          duration: reduceMotion ? 0 : 0.78,
          ease: LINE_EASING,
        }}
      />
    </svg>
  );
}

function StepShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
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
        delay: reduceMotion ? 0 : 0.16,
        duration: 0.48,
        ease: LINE_EASING,
      }}
    >
      {children}
    </motion.div>
  );
}
