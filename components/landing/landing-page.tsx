import Link from "next/link";

import { MorphicBackground } from "@/components/ui/morphic-background";

import styles from "./landing-page.module.css";

const FEATURES = [
  {
    description: "Мысли и записи",
    title: "Дневник",
  },
  {
    description: "Задачи на день",
    title: "Планировщик",
  },
  {
    description: "Идеи, ссылки, материалы",
    title: "Склад мыслей",
  },
  {
    description: "Быстрое сохранение",
    title: "Telegram-бот",
  },
] as const;

export function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.desktopStage} aria-label="Quietly">
        <aside className={styles.sidePanel}>
          <Link className={styles.logo} href="/auth" aria-label="Quietly">
            Quietly
          </Link>

          <div className={styles.featureBlock}>
            <p className={styles.featureEyebrow}>Внутри Quietly</p>
            <dl className={styles.featureList}>
              {FEATURES.map((feature) => (
                <div className={styles.featureItem} key={feature.title}>
                  <dt>{feature.title}</dt>
                  <dd>{feature.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        <section className={styles.heroPanel}>
          <p className={styles.spaceLabel} aria-hidden="true">
            Quiet Space
          </p>

          <div className={styles.heroCopy}>
            <h1>Выгрузите голову в одно спокойное пространство</h1>
            <p>
              Дневник, задачи и склад мыслей — чтобы быстро записать важное,
              разобрать позже и держать нужное под рукой
            </p>
            <div className={styles.actions} aria-label="Действия авторизации">
              <Link className={styles.primaryAction} href="/register">
                Создать пространство
              </Link>
              <Link className={styles.secondaryAction} href="/login">
                Войти
              </Link>
            </div>
          </div>

          <div className={styles.visualPanel} aria-hidden="true">
            <MorphicBackground className={styles.visualMotion} />
            <div className={styles.visualDividers}>
              <span data-divider="vertical-one" />
              <span data-divider="vertical-two" />
              <span data-divider="vertical-three" />
              <span data-divider="horizontal-one" />
              <span data-divider="horizontal-two" />
              <span data-divider="horizontal-three" />
            </div>
          </div>
        </section>
      </section>

      <section
        className={styles.unsupported}
        aria-label="Устройство не поддерживается"
      >
        <p className={styles.unsupportedLogo}>Quietly</p>
        <div>
          <h1>Пока только на большом экране</h1>
          <p>
            Мобильная и планшетная версии еще не поддерживаются. Откройте
            Quietly на ноутбуке или desktop, чтобы продолжить.
          </p>
        </div>
      </section>
    </main>
  );
}
