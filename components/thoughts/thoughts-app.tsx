"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AppTabs } from "@/components/app-tabs";
import type { Thought, ThoughtBranch } from "@/lib/thoughts/types";

import styles from "./thoughts-app.module.css";

type ActiveView =
  | { kind: "inbox" }
  | { kind: "useful" }
  | { kind: "branch"; branchId: string };

type ThoughtsResponse = {
  branches: ThoughtBranch[];
  thoughts: Thought[];
  unassignedCount: number;
  error?: string;
};

const viewTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
} as const;
const THOUGHT_COLUMN_COUNT = 3;

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8.5L12 4.75L19 8.5V16L12 19.75L5 16V8.5Z" />
      <path d="M5.35 8.7L12 12.25L18.65 8.7" />
      <path d="M12 12.25V19.35" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.75 7.75C3.75 6.78 4.53 6 5.5 6H9L10.6 8H18.5C19.47 8 20.25 8.78 20.25 9.75V17.5C20.25 18.47 19.47 19.25 18.5 19.25H5.5C4.53 19.25 3.75 18.47 3.75 17.5V7.75Z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20C9.2 17.74 4.75 14.08 4.75 9.95C4.75 7.72 6.45 6 8.58 6C9.86 6 11.08 6.63 12 7.7C12.92 6.63 14.14 6 15.42 6C17.55 6 19.25 7.72 19.25 9.95C19.25 14.08 14.8 17.74 12 20Z" />
    </svg>
  );
}

function BranchTick() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 1V7.5H4.5" />
    </svg>
  );
}

function SourceMark({ thought }: { thought: Thought }) {
  if (thought.faviconUrl) {
    return (
      <img className={styles.favicon} src={thought.faviconUrl} alt="" />
    );
  }

  return (
    <span className={styles.sourceMark} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function getThoughtPreview(thought: Thought) {
  return thought.summary || thought.contentText || thought.rawInput || "";
}

function isImageThought(thought: Thought) {
  return Boolean(thought.imageUrl);
}

function isArticleThought(thought: Thought) {
  return !isImageThought(thought) && getThoughtPreview(thought).length > 180;
}

function distributeThoughtsByColumn(thoughts: Thought[]) {
  const columns = Array.from({ length: THOUGHT_COLUMN_COUNT }, () => [] as Thought[]);

  thoughts.forEach((thought, index) => {
    columns[index % THOUGHT_COLUMN_COUNT].push(thought);
  });

  return columns;
}

function ThoughtCard({
  onOpen,
  thought,
}: {
  onOpen: (thought: Thought) => void;
  thought: Thought;
}) {
  const hasImage = isImageThought(thought);
  const isArticle = isArticleThought(thought);

  return (
    <motion.button
      type="button"
      className={`${styles.card} ${
        hasImage
          ? styles.cardWithImage
          : isArticle
            ? styles.cardArticle
            : styles.cardNote
      }`}
      onClick={() => onOpen(thought)}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={viewTransition}
    >
      {hasImage ? (
        <>
          <img
            className={styles.cardImage}
            src={thought.imageUrl ?? ""}
            alt=""
          />
          <span className={styles.cardSource}>
            <SourceMark thought={thought} />
            <span>{thought.title}</span>
          </span>
        </>
      ) : (
        <>
          {isArticle ? <h2>{thought.title}</h2> : <SourceMark thought={thought} />}
          <p>{getThoughtPreview(thought)}</p>
          {isArticle ? (
            <span className={styles.cardSource}>
              <SourceMark thought={thought} />
              <span>{thought.sourceUrl ?? thought.title}</span>
            </span>
          ) : null}
        </>
      )}
    </motion.button>
  );
}

export function ThoughtsApp() {
  const shouldReduceMotion = useReducedMotion();
  const [activeView, setActiveView] = useState<ActiveView>({ kind: "inbox" });
  const [branches, setBranches] = useState<ThoughtBranch[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draftInput, setDraftInput] = useState("");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [draftUseful, setDraftUseful] = useState(false);
  const [branchDraft, setBranchDraft] = useState("");
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thoughtColumns = useMemo(
    () => distributeThoughtsByColumn(thoughts),
    [thoughts],
  );

  const activeBranch = useMemo(() => {
    if (activeView.kind !== "branch") {
      return null;
    }

    return branches.find((branch) => branch.id === activeView.branchId) ?? null;
  }, [activeView, branches]);
  const activeTitle =
    activeView.kind === "branch"
      ? activeBranch?.name ?? "Коллекция"
      : activeView.kind === "useful"
        ? "Под рукой"
        : "Входящие";

  async function loadThoughts(nextView = activeView) {
    setIsLoading(true);
    setError(null);

    const query =
      nextView.kind === "branch"
        ? `?view=branch&branchId=${nextView.branchId}`
        : nextView.kind === "useful"
          ? "?view=useful"
          : "";
    const response = await fetch(`/api/thoughts${query}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as ThoughtsResponse;

    if (!response.ok) {
      throw new Error(data.error || "Не удалось открыть склад");
    }

    setBranches(data.branches);
    setThoughts(data.thoughts);
    setUnassignedCount(data.unassignedCount);
    setIsLoading(false);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadThoughts().catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : "Ошибка склада",
        );
        setIsLoading(false);
      });
    });

    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView.kind, activeView.kind === "branch" ? activeView.branchId : ""]);

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = branchDraft.trim();

    if (!name) {
      return;
    }

    const response = await fetch("/api/thought-branches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = (await response.json()) as {
      branch?: ThoughtBranch;
      error?: string;
    };

    if (!response.ok || !data.branch) {
      setError(data.error || "Не удалось создать ветку");
      return;
    }

    setBranchDraft("");
    setBranchFormOpen(false);
    setActiveView({ kind: "branch", branchId: data.branch.id });
  }

  async function createThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draftInput.trim()) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: draftInput,
          branchId: draftBranchId || null,
          isUseful: draftUseful,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Не удалось скинуть мысль");
      }

      setDraftInput("");
      setDraftBranchId("");
      setDraftUseful(false);
      setAddOpen(false);
      await loadThoughts();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось скинуть мысль",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function patchThought(id: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/thoughts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as {
      thought?: Thought;
      error?: string;
    };

    if (!response.ok || !data.thought) {
      setError(data.error || "Не удалось обновить мысль");
      return;
    }

    setSelectedThought(data.thought);
    await loadThoughts();
  }

  function switchView(nextView: ActiveView) {
    setActiveView(nextView);
    setSelectedThought(null);
  }

  return (
    <main className={styles.shell}>
      <AppTabs active="thoughts" />

      <aside className={styles.sidebar}>
        <button
          className={styles.addButton}
          type="button"
          onClick={() => setAddOpen(true)}
        >
          Добавить мысль
        </button>

        <nav className={styles.sideNav} aria-label="Склад мыслей">
          <button
            className={styles.sideItem}
            data-active={activeView.kind === "inbox" ? "true" : "false"}
            type="button"
            onClick={() => switchView({ kind: "inbox" })}
          >
            <InboxIcon />
            <span>Входящие</span>
            <b>{unassignedCount}</b>
          </button>

          <div className={styles.collectionGroup}>
            <button
              className={styles.sideItem}
              type="button"
              onClick={() => setBranchFormOpen((current) => !current)}
            >
              <FolderIcon />
              <span>Коллекции</span>
              <i className={styles.chevron}>⌃</i>
            </button>

            <div className={styles.branchList}>
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  className={styles.branchItem}
                  data-active={
                    activeView.kind === "branch" &&
                    activeView.branchId === branch.id
                      ? "true"
                      : "false"
                  }
                  type="button"
                  onClick={() =>
                    switchView({ kind: "branch", branchId: branch.id })
                  }
                >
                  <BranchTick />
                  <span>{branch.name}</span>
                </button>
              ))}

              <AnimatePresence initial={false}>
                {branchFormOpen ? (
                  <motion.form
                    className={styles.branchForm}
                    onSubmit={createBranch}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={viewTransition}
                  >
                    <input
                      autoFocus
                      value={branchDraft}
                      placeholder="Название ветки"
                      onChange={(event) => setBranchDraft(event.target.value)}
                    />
                  </motion.form>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <button
            className={styles.sideItem}
            data-active={activeView.kind === "useful" ? "true" : "false"}
            type="button"
            onClick={() => switchView({ kind: "useful" })}
          >
            <HeartIcon />
            <span>Под рукой</span>
          </button>
        </nav>
      </aside>

      <section className={styles.content}>
        <motion.h1
          key={activeTitle}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={viewTransition}
        >
          {activeTitle}
        </motion.h1>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.masonryGrid}>
          {thoughtColumns.map((column, index) => (
            <motion.div
              className={styles.masonryColumn}
              data-column={index}
              key={index}
              layout
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {column.map((thought) => (
                  <ThoughtCard
                    key={thought.id}
                    thought={thought}
                    onOpen={setSelectedThought}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {!isLoading && thoughts.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Здесь пока пусто. Скинь мысль вручную или перешли пост боту.</p>
          </div>
        ) : null}
      </section>

      <AnimatePresence>
        {addOpen ? (
          <motion.div
            className={styles.overlay}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          >
            <motion.form
              className={styles.addDialog}
              onSubmit={createThought}
              initial={
                shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }
              }
              animate={
                shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }
              }
              transition={viewTransition}
            >
              <div className={styles.dialogHeader}>
                <h2>Скинуть мысль</h2>
                <button type="button" onClick={() => setAddOpen(false)}>
                  Закрыть
                </button>
              </div>
              <textarea
                autoFocus
                value={draftInput}
                placeholder="Текст, ссылка, пост, таблица — всё, что нужно сохранить."
                onChange={(event) => setDraftInput(event.target.value)}
              />
              <div className={styles.dialogControls}>
                <select
                  value={draftBranchId}
                  onChange={(event) => setDraftBranchId(event.target.value)}
                >
                  <option value="">Во входящие</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    checked={draftUseful}
                    type="checkbox"
                    onChange={(event) => setDraftUseful(event.target.checked)}
                  />
                  Полезное
                </label>
              </div>
              <button className={styles.submitButton} disabled={isSaving}>
                {isSaving ? "Сохраняю..." : "Сохранить"}
              </button>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedThought ? (
          <motion.div
            className={styles.readerOverlay}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          >
            <motion.article
              className={styles.reader}
              initial={
                shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.985 }
              }
              animate={
                shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                shouldReduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.985 }
              }
              transition={viewTransition}
            >
              <div className={styles.readerTop}>
                <div>
                  <p>{selectedThought.sourceUrl ?? selectedThought.sourceType}</p>
                  <h2>{selectedThought.title}</h2>
                </div>
                <button type="button" onClick={() => setSelectedThought(null)}>
                  Закрыть
                </button>
              </div>
              <div className={styles.readerActions}>
                <select
                  value={selectedThought.branchId ?? ""}
                  onChange={(event) =>
                    void patchThought(selectedThought.id, {
                      branchId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Входящие</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    checked={selectedThought.isUseful}
                    type="checkbox"
                    onChange={(event) =>
                      void patchThought(selectedThought.id, {
                        isUseful: event.target.checked,
                      })
                    }
                  />
                  Под рукой
                </label>
              </div>
              {selectedThought.imageUrl ? (
                <img
                  className={styles.readerImage}
                  src={selectedThought.imageUrl}
                  alt=""
                />
              ) : null}
              <div
                className={styles.readerContent}
                dangerouslySetInnerHTML={{ __html: selectedThought.contentHtml }}
              />
            </motion.article>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
