"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AppTabs } from "@/components/app-tabs";
import { AddTaskIcon, TrashIcon } from "@/components/icons/app-icons";
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
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});

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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 6V18H17L14.5 15" />
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
  const columns = Array.from(
    { length: THOUGHT_COLUMN_COUNT },
    () => [] as Thought[],
  );

  thoughts.forEach((thought, index) => {
    columns[index % THOUGHT_COLUMN_COUNT].push(thought);
  });

  return columns;
}

function getLocalDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getDayKey(value: string) {
  return getLocalDayKey(new Date(value));
}

function getDayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  const dateKey = getLocalDayKey(date);
  const todayKey = getLocalDayKey(today);

  yesterday.setDate(today.getDate() - 1);

  if (dateKey === todayKey) {
    return "Сегодня";
  }

  if (dateKey === getLocalDayKey(yesterday)) {
    return "Вчера";
  }

  return SHORT_DATE_FORMATTER.format(date);
}

function groupThoughtsByDay(thoughts: Thought[]) {
  return thoughts.reduce(
    (groups, thought) => {
      const key = getDayKey(thought.createdAt);
      const existing = groups.find((group) => group.key === key);

      if (existing) {
        existing.thoughts.push(thought);
        return groups;
      }

      groups.push({
        key,
        label: getDayLabel(thought.createdAt),
        thoughts: [thought],
      });

      return groups;
    },
    [] as Array<{ key: string; label: string; thoughts: Thought[] }>,
  );
}

function ThoughtCard({
  onDelete,
  onOpen,
  thought,
}: {
  onDelete: (thought: Thought) => void;
  onOpen: (thought: Thought) => void;
  thought: Thought;
}) {
  const hasImage = isImageThought(thought);
  const isArticle = isArticleThought(thought);

  return (
    <motion.article
      className={`${styles.card} ${
        hasImage
          ? styles.cardWithImage
          : isArticle
            ? styles.cardArticle
            : styles.cardNote
      }`}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={viewTransition}
    >
      <button
        className={styles.cardOpen}
        type="button"
        onClick={() => onOpen(thought)}
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
            {isArticle ? (
              <h2>{thought.title}</h2>
            ) : (
              <SourceMark thought={thought} />
            )}
            <p>{getThoughtPreview(thought)}</p>
            {isArticle ? (
              <span className={styles.cardSource}>
                <SourceMark thought={thought} />
                <span>{thought.sourceUrl ?? thought.title}</span>
              </span>
            ) : null}
          </>
        )}
      </button>
      <button
        className={styles.deleteCardButton}
        type="button"
        aria-label={`Удалить мысль ${thought.title}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(thought);
        }}
      >
        <TrashIcon />
      </button>
    </motion.article>
  );
}

type ThoughtEditorValues = {
  branchId: string;
  content: string;
  isUseful: boolean;
  title: string;
};

function getThoughtEditorValues(thought: Thought): ThoughtEditorValues {
  return {
    branchId: thought.branchId ?? "",
    content: thought.contentText || thought.summary || thought.rawInput || "",
    isUseful: thought.isUseful,
    title: thought.title,
  };
}

type ThoughtWorkspaceProps = {
  branches: ThoughtBranch[];
  content: string;
  imageUrl?: string | null;
  isSaving: boolean;
  isUseful: boolean;
  mode: "create" | "edit";
  onBranchChange: (value: string) => void;
  onClose: () => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onUsefulChange: (value: boolean) => void;
  selectedBranchId: string;
  shouldReduceMotion: boolean | null;
  sourceLabel?: string | null;
  title: string;
};

function ThoughtWorkspace({
  branches,
  content,
  imageUrl,
  isSaving,
  isUseful,
  mode,
  onBranchChange,
  onClose,
  onContentChange,
  onSubmit,
  onTitleChange,
  onUsefulChange,
  selectedBranchId,
  shouldReduceMotion,
  sourceLabel,
  title,
}: ThoughtWorkspaceProps) {
  const isCreateMode = mode === "create";

  return (
    <motion.form
      className={styles.thoughtWorkspace}
      onSubmit={onSubmit}
      initial={
        shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.992 }
      }
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      exit={
        shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.992 }
      }
      transition={viewTransition}
    >
      <button
        className={styles.readerClose}
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
      >
        ×
      </button>

      <aside className={styles.editorSettings}>
        <h2>Настройки</h2>
        <label className={styles.editorField}>
          <span>Коллекция</span>
          <span className={styles.editorSelectWrap}>
            <select
              value={selectedBranchId}
              onChange={(event) => onBranchChange(event.target.value)}
            >
              <option value="">Входящие</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <BranchTick />
          </span>
        </label>
        <label className={styles.editorCheckbox}>
          <input
            checked={isUseful}
            type="checkbox"
            onChange={(event) => onUsefulChange(event.target.checked)}
          />
          <span aria-hidden="true" />
          <b>Всегда под рукой</b>
        </label>
      </aside>

      <section className={styles.editorCanvas}>
        <p className={styles.editorEyebrow}>Рабочая область</p>
        <input
          className={styles.editorTitleInput}
          value={title}
          placeholder={
            isCreateMode
              ? "Название мысли"
              : "Название сохраненного материала"
          }
          onChange={(event) => onTitleChange(event.target.value)}
        />
        {sourceLabel ? (
          <p className={styles.editorSourceLabel}>{sourceLabel}</p>
        ) : null}
        {imageUrl ? (
          <img className={styles.editorImage} src={imageUrl} alt="" />
        ) : null}
        <textarea
          className={styles.editorBodyInput}
          value={content}
          placeholder="Добавь текст, ссылку, заметку, список или любой материал, который хочется сохранить."
          onChange={(event) => onContentChange(event.target.value)}
        />
      </section>

      <button className={styles.editorSubmitButton} disabled={isSaving}>
        {isSaving
          ? "Сохраняю..."
          : isCreateMode
            ? "Добавить мысль"
            : "Сохранить изменения"}
      </button>
    </motion.form>
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
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [draftUseful, setDraftUseful] = useState(false);
  const [selectedDraft, setSelectedDraft] =
    useState<ThoughtEditorValues | null>(null);
  const [branchDraft, setBranchDraft] = useState("");
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thoughtGroups = useMemo(
    () =>
      groupThoughtsByDay(thoughts).map((group) => ({
        ...group,
        columns: distributeThoughtsByColumn(group.thoughts),
      })),
    [thoughts],
  );

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

    const title = draftTitle.trim();
    const content = draftContent.trim();
    const input = [title, content].filter(Boolean).join("\n\n");

    if (!input) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input,
          branchId: draftBranchId || null,
          isUseful: draftUseful,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Не удалось скинуть мысль");
      }

      setDraftTitle("");
      setDraftContent("");
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

  async function saveSelectedThought(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedThought || !selectedDraft) {
      return;
    }

    const title = selectedDraft.title.trim();
    const content = selectedDraft.content.trim();

    if (!title && !content) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/thoughts/${selectedThought.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: selectedDraft.branchId || null,
          contentText: content || title,
          isUseful: selectedDraft.isUseful,
          title,
        }),
      });
      const data = (await response.json()) as {
        thought?: Thought;
        error?: string;
      };

      if (!response.ok || !data.thought) {
        throw new Error(data.error || "Не удалось сохранить мысль");
      }

      setSelectedThought(data.thought);
      setSelectedDraft(getThoughtEditorValues(data.thought));
      await loadThoughts();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить мысль",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteThought(thought: Thought) {
    const response = await fetch(`/api/thoughts/${thought.id}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(data.error || "Не удалось удалить мысль");
      return;
    }

    if (selectedThought?.id === thought.id) {
      setSelectedThought(null);
      setSelectedDraft(null);
    }

    await loadThoughts();
  }

  function openThought(thought: Thought) {
    setSelectedThought(thought);
    setSelectedDraft(getThoughtEditorValues(thought));
  }

  function closeThought() {
    setSelectedThought(null);
    setSelectedDraft(null);
  }

  function switchView(nextView: ActiveView) {
    setActiveView(nextView);
    setSelectedThought(null);
    setSelectedDraft(null);
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
          Скинуть мысль
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
            <div className={styles.collectionHeader}>
              <button
                className={styles.sideItem}
                type="button"
                onClick={() => setBranchFormOpen((current) => !current)}
              >
                <FolderIcon />
                <span>Коллекции</span>
              </button>
              <button
                className={styles.collectionAdd}
                type="button"
                aria-label="Добавить коллекцию"
                onClick={() => setBranchFormOpen(true)}
              >
                <AddTaskIcon />
              </button>
            </div>

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
                    <span className={styles.branchAddIcon} aria-hidden="true">
                      <AddTaskIcon />
                    </span>
                    <input
                      autoFocus
                      value={branchDraft}
                      placeholder="Новая коллекция"
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

      <section className={styles.contentScroller}>
        <div className={styles.content}>
          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.dayStack}>
            {thoughtGroups.map((group, groupIndex) => (
              <section className={styles.daySection} key={group.key}>
                <div
                  className={styles.dayHeader}
                  data-first={groupIndex === 0 ? "true" : "false"}
                >
                  <span>{group.label}</span>
                  <i aria-hidden="true" />
                </div>
                <div className={styles.masonryGrid}>
                  {group.columns.map((column, index) => (
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
                            onDelete={(nextThought) =>
                              void deleteThought(nextThought)
                            }
                            onOpen={openThought}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {!isLoading && thoughts.length === 0 ? (
            <div className={styles.emptyState}>
              <p>Здесь пока пусто. Скинь мысль вручную или перешли пост боту.</p>
            </div>
          ) : null}
        </div>
      </section>

      <AnimatePresence>
        {addOpen ? (
          <motion.div
            className={styles.readerOverlay}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          >
            <ThoughtWorkspace
              branches={branches}
              content={draftContent}
              isSaving={isSaving}
              isUseful={draftUseful}
              mode="create"
              selectedBranchId={draftBranchId}
              shouldReduceMotion={shouldReduceMotion}
              title={draftTitle}
              onSubmit={createThought}
              onBranchChange={setDraftBranchId}
              onClose={() => setAddOpen(false)}
              onContentChange={setDraftContent}
              onTitleChange={setDraftTitle}
              onUsefulChange={setDraftUseful}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedThought && selectedDraft ? (
          <motion.div
            className={styles.readerOverlay}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
          >
            <ThoughtWorkspace
              branches={branches}
              content={selectedDraft.content}
              imageUrl={selectedThought.imageUrl}
              isSaving={isSaving}
              isUseful={selectedDraft.isUseful}
              mode="edit"
              selectedBranchId={selectedDraft.branchId}
              shouldReduceMotion={shouldReduceMotion}
              sourceLabel={selectedThought.sourceUrl ?? selectedThought.sourceType}
              title={selectedDraft.title}
              onSubmit={saveSelectedThought}
              onBranchChange={(value) =>
                setSelectedDraft((current) =>
                  current ? { ...current, branchId: value } : current,
                )
              }
              onClose={closeThought}
              onContentChange={(value) =>
                setSelectedDraft((current) =>
                  current ? { ...current, content: value } : current,
                )
              }
              onTitleChange={(value) =>
                setSelectedDraft((current) =>
                  current ? { ...current, title: value } : current,
                )
              }
              onUsefulChange={(value) =>
                setSelectedDraft((current) =>
                  current ? { ...current, isUseful: value } : current,
                )
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
