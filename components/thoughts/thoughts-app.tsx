"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { AppTabs } from "@/components/app-tabs";
import { AddTaskIcon, TrashIcon } from "@/components/icons/app-icons";
import type {
  Thought,
  ThoughtBranch,
  ThoughtListResult,
} from "@/lib/thoughts/types";

import styles from "./thoughts-app.module.css";

type ActiveView =
  | { kind: "inbox" }
  | { kind: "collections" }
  | { kind: "useful" }
  | { kind: "branch"; branchId: string };

type ThoughtsResponse = {
  branches: ThoughtBranch[];
  thoughts: Thought[];
  unassignedCount: number;
  error?: string;
};

type ThoughtsAppProps = {
  initialData?: ThoughtListResult;
};

const viewTransition = {
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
} as const;
const THOUGHT_COLUMN_COUNT = 3;
const CREATE_THOUGHT_FORM_ID = "thought-create-form";
const EDIT_THOUGHT_FORM_ID = "thought-edit-form";
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
});

type ThoughtGroup = {
  branchId?: string;
  key: string;
  label: string;
  thoughts: Thought[];
};

function getActiveViewKey(view: ActiveView) {
  return view.kind === "branch" ? `${view.kind}:${view.branchId}` : view.kind;
}

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

function EditBranchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 18L8.75 17.45L17.25 8.95L14.55 6.25L6.05 14.75L6 18Z" />
      <path d="M13.75 7.05L16.45 9.75" />
    </svg>
  );
}

function DropdownChevron() {
  return (
    <svg
      className={styles.editorSelectChevron}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M4 6L8 10L12 6" />
    </svg>
  );
}

function MenuChevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 6L8 10L12 6" />
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

function getThoughtImages(thought: Thought) {
  return thought.imageUrls.length > 0
    ? thought.imageUrls
    : thought.imageUrl
      ? [thought.imageUrl]
      : [];
}

function getPrimaryThoughtImage(thought: Thought) {
  return getThoughtImages(thought)[0] ?? null;
}

function isImageThought(thought: Thought) {
  return getThoughtImages(thought).length > 0;
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
    [] as ThoughtGroup[],
  );
}

function groupThoughtsByBranch(
  thoughts: Thought[],
  branches: ThoughtBranch[],
) {
  return branches.reduce((groups, branch) => {
    const branchThoughts = thoughts.filter(
      (thought) => thought.branchId === branch.id,
    );

    if (branchThoughts.length === 0) {
      return groups;
    }

    groups.push({
      branchId: branch.id,
      key: branch.id,
      label: branch.name,
      thoughts: branchThoughts,
    });

    return groups;
  }, [] as ThoughtGroup[]);
}

function ThoughtCard({
  onDelete,
  onOpen,
  onToggleSelect,
  selectable,
  selected,
  thought,
}: {
  onDelete: (thought: Thought) => void;
  onOpen: (thought: Thought) => void;
  onToggleSelect: (thought: Thought) => void;
  selectable: boolean;
  selected: boolean;
  thought: Thought;
}) {
  const hasImage = isImageThought(thought);
  const isArticle = isArticleThought(thought);
  const primaryImage = getPrimaryThoughtImage(thought);

  return (
    <motion.article
      className={`${styles.card} ${
        hasImage
          ? styles.cardWithImage
          : isArticle
            ? styles.cardArticle
            : styles.cardNote
      } ${selectable ? styles.cardSelectable : ""} ${
        selected ? styles.cardSelected : ""
      }`}
      data-selected={selected ? "true" : "false"}
      layout
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={viewTransition}
    >
      {selectable ? (
        <button
          className={styles.cardSelectButton}
          type="button"
          aria-label={
            selected
              ? `Снять выбор ${thought.title}`
              : `Выбрать мысль ${thought.title}`
          }
          data-selected={selected ? "true" : "false"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(thought);
          }}
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
      <button
        className={styles.cardOpen}
        type="button"
        onClick={() => onOpen(thought)}
      >
        {hasImage ? (
          <>
            <img
              className={styles.cardImage}
              src={primaryImage ?? ""}
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

type BulkSelectionMenuProps = {
  branches: ThoughtBranch[];
  count: number;
  dropdownOpen: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onMove: (branchId: string) => void;
  onMoveToUseful: () => void;
  onToggleDropdown: () => void;
};

function BulkSelectionMenu({
  branches,
  count,
  dropdownOpen,
  isSaving,
  onCancel,
  onDelete,
  onMove,
  onMoveToUseful,
  onToggleDropdown,
}: BulkSelectionMenuProps) {
  return (
    <motion.div
      className={styles.bulkMenu}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={viewTransition}
    >
      <div className={styles.bulkActionWrap}>
        <AnimatePresence>
          {dropdownOpen ? (
            <motion.div
              className={styles.bulkDropdown}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={viewTransition}
            >
              <button
                className={styles.bulkDropdownPrimary}
                type="button"
                disabled={isSaving}
                onClick={onMoveToUseful}
              >
                Под рукой
              </button>
              {branches.length > 0 ? (
                branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    disabled={isSaving}
                    onClick={() => onMove(branch.id)}
                  >
                    {branch.name}
                  </button>
                ))
              ) : (
                <span>Коллекций пока нет</span>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <button
          className={styles.bulkMoveButton}
          type="button"
          disabled={isSaving}
          onClick={onToggleDropdown}
        >
          <span>Добавить в коллекцию</span>
          <MenuChevron className={styles.bulkChevron} />
        </button>
      </div>
      <button
        className={styles.bulkDeleteButton}
        type="button"
        aria-label={`Удалить выбранные мысли: ${count}`}
        disabled={isSaving}
        onClick={onDelete}
      >
        <TrashIcon />
      </button>
      <button
        className={styles.bulkCancelButton}
        type="button"
        aria-label="Отменить массовый выбор"
        disabled={isSaving}
        onClick={onCancel}
      >
        ×
      </button>
    </motion.div>
  );
}

type ThoughtEditorActionMenuProps = {
  formId: string;
  isSaving: boolean;
  mode: "create" | "edit";
  onClose: () => void;
};

function ThoughtEditorActionMenu({
  formId,
  isSaving,
  mode,
  onClose,
}: ThoughtEditorActionMenuProps) {
  const label = mode === "create" ? "Добавить мысль" : "Сохранить изменения";

  return (
    <motion.div
      className={styles.editorActionMenu}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={viewTransition}
    >
      <button
        className={styles.editorSaveButton}
        type="submit"
        form={formId}
        disabled={isSaving}
      >
        {isSaving ? "Сохраняю..." : label}
      </button>
      <button
        className={styles.bulkCancelButton}
        type="button"
        aria-label="Закрыть редактор"
        disabled={isSaving}
        onClick={onClose}
      >
        ×
      </button>
    </motion.div>
  );
}

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
  contentHtml?: string | null;
  formId: string;
  imageUrls?: string[];
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
  contentHtml,
  formId,
  imageUrls = [],
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
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <motion.form
      id={formId}
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
            <DropdownChevron />
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
        {imageUrls.length > 0 ? (
          <div
            className={styles.editorImageGallery}
            data-count={Math.min(imageUrls.length, 5)}
          >
            {imageUrls.map((imageUrl, index) => (
              <motion.button
                className={styles.editorImageTile}
                key={imageUrl}
                type="button"
                data-wide={index % 5 === 0 ? "true" : "false"}
                layout
                whileHover={shouldReduceMotion ? undefined : { scale: 0.985 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                onClick={() => setLightboxImage(imageUrl)}
              >
                <img src={imageUrl} alt="" />
              </motion.button>
            ))}
          </div>
        ) : null}
        {contentHtml ? (
          <div
            className={styles.editorBodyPreview}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        ) : (
          <textarea
            className={styles.editorBodyInput}
            value={content}
            placeholder="Добавь текст, ссылку, заметку, список или любой материал, который хочется сохранить."
            onChange={(event) => onContentChange(event.target.value)}
          />
        )}
      </section>

      <AnimatePresence>
        {lightboxImage ? (
          <motion.div
            className={styles.imageLightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Просмотр изображения"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={viewTransition}
            onClick={() => setLightboxImage(null)}
          >
            <button
              className={styles.imageLightboxClose}
              type="button"
              aria-label="Закрыть изображение"
              onClick={(event) => {
                event.stopPropagation();
                setLightboxImage(null);
              }}
            >
              ×
            </button>
            <motion.img
              src={lightboxImage}
              alt=""
              initial={
                shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }
              }
              animate={
                shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                shouldReduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }
              }
              transition={viewTransition}
              onClick={(event) => event.stopPropagation()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.form>
  );
}

export function ThoughtsApp({ initialData }: ThoughtsAppProps) {
  const shouldReduceMotion = useReducedMotion();
  const branchSectionRefs = useRef(new Map<string, HTMLElement>());
  const pendingScrollBranchIdRef = useRef<string | null>(null);
  const didUseInitialDataRef = useRef(Boolean(initialData));
  const viewCacheRef = useRef(
    new Map<string, ThoughtListResult>(
      initialData ? [["inbox", initialData]] : [],
    ),
  );
  const [activeView, setActiveView] = useState<ActiveView>({ kind: "inbox" });
  const [branches, setBranches] = useState<ThoughtBranch[]>(
    () => initialData?.branches ?? [],
  );
  const [thoughts, setThoughts] = useState<Thought[]>(
    () => initialData?.thoughts ?? [],
  );
  const [unassignedCount, setUnassignedCount] = useState(
    () => initialData?.unassignedCount ?? 0,
  );
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [selectedThoughtIds, setSelectedThoughtIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftBranchId, setDraftBranchId] = useState("");
  const [draftUseful, setDraftUseful] = useState(false);
  const [selectedDraft, setSelectedDraft] =
    useState<ThoughtEditorValues | null>(null);
  const [branchDraft, setBranchDraft] = useState("");
  const [branchFormOpen, setBranchFormOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editingBranchName, setEditingBranchName] = useState("");
  const [branchMutationId, setBranchMutationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedThoughtCount = selectedThoughtIds.size;
  const activeViewKey = getActiveViewKey(activeView);
  const thoughtGroups = useMemo(
    () =>
      (activeView.kind === "collections"
        ? groupThoughtsByBranch(thoughts, branches)
        : groupThoughtsByDay(thoughts)
      ).map((group) => ({
        ...group,
        columns: distributeThoughtsByColumn(group.thoughts),
      })),
    [activeView.kind, branches, thoughts],
  );

  async function loadThoughts(nextView = activeView) {
    setIsLoading(true);
    setError(null);

    const query =
      nextView.kind === "branch"
        ? `?view=branch&branchId=${nextView.branchId}`
        : nextView.kind === "collections"
          ? "?view=collections"
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

    viewCacheRef.current.set(getActiveViewKey(nextView), data);
    setBranches(data.branches);
    setThoughts(data.thoughts);
    setUnassignedCount(data.unassignedCount);
    setIsLoading(false);
  }

  useEffect(() => {
    if (didUseInitialDataRef.current && activeView.kind === "inbox") {
      didUseInitialDataRef.current = false;
      return;
    }

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

  useEffect(() => {
    if (activeView.kind !== "collections") {
      return;
    }

    const branchId = pendingScrollBranchIdRef.current;

    if (!branchId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      branchSectionRefs.current.get(branchId)?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "start",
      });
      pendingScrollBranchIdRef.current = null;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeView.kind, shouldReduceMotion, thoughtGroups]);

  function setBranchSectionRef(branchId: string) {
    return (node: HTMLElement | null) => {
      if (node) {
        branchSectionRefs.current.set(branchId, node);
        return;
      }

      branchSectionRefs.current.delete(branchId);
    };
  }

  function clearBulkSelection() {
    setSelectedThoughtIds(new Set());
    setBulkDropdownOpen(false);
  }

  function invalidateViewCache() {
    viewCacheRef.current.clear();
  }

  function prepareViewChange(nextView: ActiveView) {
    const nextViewKey = getActiveViewKey(nextView);

    if (getActiveViewKey(activeView) === nextViewKey) {
      return;
    }

    const cachedData = viewCacheRef.current.get(nextViewKey);

    if (cachedData) {
      setBranches(cachedData.branches);
      setThoughts(cachedData.thoughts);
      setUnassignedCount(cachedData.unassignedCount);
      setIsLoading(false);
    } else {
      setThoughts([]);
      setIsLoading(true);
    }

    setError(null);
  }

  function openCollections(branchId?: string) {
    const nextView: ActiveView = { kind: "collections" };

    prepareViewChange(nextView);
    setActiveView(nextView);
    setFocusedBranchId(branchId ?? null);
    setSelectedThought(null);
    setSelectedDraft(null);
    clearBulkSelection();

    if (!branchId) {
      return;
    }

    pendingScrollBranchIdRef.current = branchId;

    if (activeView.kind === "collections") {
      window.requestAnimationFrame(() => {
        branchSectionRefs.current.get(branchId)?.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "start",
        });
        pendingScrollBranchIdRef.current = null;
      });
    }
  }

  function startEditBranch(branch: ThoughtBranch) {
    setBranchFormOpen(false);
    setBranchDraft("");
    setEditingBranchId(branch.id);
    setEditingBranchName(branch.name);
    setError(null);
  }

  function cancelEditBranch() {
    setEditingBranchId(null);
    setEditingBranchName("");
  }

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
    invalidateViewCache();
    pendingScrollBranchIdRef.current = data.branch.id;
    setFocusedBranchId(data.branch.id);
    setActiveView({ kind: "collections" });
    await loadThoughts({ kind: "collections" });
  }

  async function renameBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingBranchId) {
      return;
    }

    const name = editingBranchName.trim();
    const currentBranch = branches.find(
      (branch) => branch.id === editingBranchId,
    );

    if (!name) {
      return;
    }

    if (currentBranch?.name === name) {
      cancelEditBranch();
      return;
    }

    setBranchMutationId(editingBranchId);
    setError(null);

    try {
      const response = await fetch(`/api/thought-branches/${editingBranchId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as {
        branch?: ThoughtBranch;
        error?: string;
      };

      if (!response.ok || !data.branch) {
        throw new Error(data.error || "Не удалось переименовать коллекцию");
      }

      const updatedBranch = data.branch;

      setBranches((current) =>
        current.map((branch) =>
          branch.id === updatedBranch.id ? updatedBranch : branch,
        ),
      );
      invalidateViewCache();
      cancelEditBranch();
    } catch (renameError) {
      setError(
        renameError instanceof Error
          ? renameError.message
          : "Не удалось переименовать коллекцию",
      );
    } finally {
      setBranchMutationId(null);
    }
  }

  async function deleteBranch(branch: ThoughtBranch) {
    const shouldDelete = window.confirm(
      `Удалить коллекцию «${branch.name}»? Мысли останутся и вернутся во «Входящие».`,
    );

    if (!shouldDelete) {
      return;
    }

    const nextView: ActiveView =
      activeView.kind === "branch" && activeView.branchId === branch.id
        ? { kind: "inbox" }
        : activeView;

    setBranchMutationId(branch.id);
    setError(null);

    try {
      const response = await fetch(`/api/thought-branches/${branch.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Не удалось удалить коллекцию");
      }

      if (editingBranchId === branch.id) {
        cancelEditBranch();
      }

      if (draftBranchId === branch.id) {
        setDraftBranchId("");
      }

      if (focusedBranchId === branch.id) {
        setFocusedBranchId(null);
      }

      setSelectedDraft((current) =>
        current?.branchId === branch.id
          ? { ...current, branchId: "" }
          : current,
      );
      setBranches((current) =>
        current.filter((nextBranch) => nextBranch.id !== branch.id),
      );
      invalidateViewCache();
      setActiveView(nextView);
      await loadThoughts(nextView);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить коллекцию",
      );
      setIsLoading(false);
    } finally {
      setBranchMutationId(null);
    }
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
      invalidateViewCache();
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
    const originalDraft = getThoughtEditorValues(selectedThought);

    if (!title && !content) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const patchBody: {
        branchId: string | null;
        contentText?: string;
        isUseful: boolean;
        title: string;
      } = {
        branchId: selectedDraft.branchId || null,
        isUseful: selectedDraft.isUseful,
        title,
      };

      if (selectedDraft.content !== originalDraft.content) {
        patchBody.contentText = content || title;
      }

      const response = await fetch(`/api/thoughts/${selectedThought.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody),
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
      invalidateViewCache();
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

    setSelectedThoughtIds((current) => {
      if (!current.has(thought.id)) {
        return current;
      }

      const next = new Set(current);
      next.delete(thought.id);
      return next;
    });

    invalidateViewCache();
    await loadThoughts();
  }

  function toggleThoughtSelection(thought: Thought) {
    if (activeView.kind !== "inbox") {
      return;
    }

    setSelectedThoughtIds((current) => {
      const next = new Set(current);

      if (next.has(thought.id)) {
        next.delete(thought.id);
      } else {
        next.add(thought.id);
      }

      return next;
    });
    setBulkDropdownOpen(false);
  }

  async function moveSelectedThoughts(branchId: string) {
    const ids = Array.from(selectedThoughtIds);

    if (ids.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/thoughts/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, branchId }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Не удалось перенести мысли");
      }

      clearBulkSelection();
      invalidateViewCache();
      pendingScrollBranchIdRef.current = branchId;
      setFocusedBranchId(branchId);
      setActiveView({ kind: "collections" });
      await loadThoughts({ kind: "collections" });
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Не удалось перенести мысли",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function moveSelectedThoughtsToUseful() {
    const ids = Array.from(selectedThoughtIds);

    if (ids.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/thoughts/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, isUseful: true }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Не удалось добавить мысли в Под рукой");
      }

      clearBulkSelection();
      invalidateViewCache();
      setFocusedBranchId(null);
      setActiveView({ kind: "useful" });
      await loadThoughts({ kind: "useful" });
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Не удалось добавить мысли в Под рукой",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedThoughts() {
    const ids = Array.from(selectedThoughtIds);

    if (ids.length === 0) {
      return;
    }

    const shouldDelete = window.confirm(
      `Удалить выбранные мысли: ${ids.length}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/thoughts/${id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error("Не удалось удалить выбранные мысли");
          }
        }),
      );

      clearBulkSelection();
      invalidateViewCache();
      await loadThoughts();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить выбранные мысли",
      );
    } finally {
      setIsSaving(false);
    }
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
    prepareViewChange(nextView);
    setActiveView(nextView);
    setFocusedBranchId(null);
    setSelectedThought(null);
    setSelectedDraft(null);
    clearBulkSelection();
  }

  return (
    <main className={styles.shell}>
      <AppTabs
        active="thoughts"
        selectionMenu={
          addOpen ? (
            <ThoughtEditorActionMenu
              formId={CREATE_THOUGHT_FORM_ID}
              isSaving={isSaving}
              mode="create"
              onClose={() => setAddOpen(false)}
            />
          ) : selectedThought && selectedDraft ? (
            <ThoughtEditorActionMenu
              formId={EDIT_THOUGHT_FORM_ID}
              isSaving={isSaving}
              mode="edit"
              onClose={closeThought}
            />
          ) : selectedThoughtCount > 0 ? (
            <BulkSelectionMenu
              branches={branches}
              count={selectedThoughtCount}
              dropdownOpen={bulkDropdownOpen}
              isSaving={isSaving}
              onCancel={clearBulkSelection}
              onDelete={() => void deleteSelectedThoughts()}
              onMove={(branchId) => void moveSelectedThoughts(branchId)}
              onMoveToUseful={() => void moveSelectedThoughtsToUseful()}
              onToggleDropdown={() =>
                setBulkDropdownOpen((current) => !current)
              }
            />
          ) : undefined
        }
      />

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
                data-active={
                  activeView.kind === "collections" ? "true" : "false"
                }
                type="button"
                onClick={() => openCollections()}
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
              {branches.map((branch) => {
                const isActive =
                  activeView.kind === "collections" &&
                  focusedBranchId === branch.id;
                const isEditing = editingBranchId === branch.id;
                const isMutating = branchMutationId === branch.id;

                return (
                  <motion.div
                    className={styles.branchRow}
                    key={branch.id}
                    layout
                    transition={viewTransition}
                  >
                    {isEditing ? (
                      <motion.form
                        className={styles.branchEditForm}
                        onSubmit={renameBranch}
                        initial={
                          shouldReduceMotion
                            ? false
                            : { opacity: 0, x: -4, scale: 0.98 }
                        }
                        animate={
                          shouldReduceMotion
                            ? undefined
                            : { opacity: 1, x: 0, scale: 1 }
                        }
                        exit={
                          shouldReduceMotion
                            ? undefined
                            : { opacity: 0, x: -4, scale: 0.98 }
                        }
                        transition={viewTransition}
                      >
                        <BranchTick />
                        <input
                          autoFocus
                          value={editingBranchName}
                          disabled={isMutating}
                          placeholder="Название коллекции"
                          onChange={(event) =>
                            setEditingBranchName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              cancelEditBranch();
                            }
                          }}
                        />
                        <span className={styles.branchEditControls}>
                          <button
                            className={styles.branchActionButton}
                            type="submit"
                            aria-label="Сохранить название коллекции"
                            disabled={isMutating}
                          >
                            ✓
                          </button>
                          <button
                            className={styles.branchActionButton}
                            type="button"
                            aria-label="Отменить переименование"
                            disabled={isMutating}
                            onClick={cancelEditBranch}
                          >
                            ×
                          </button>
                        </span>
                      </motion.form>
                    ) : (
                      <>
                        <button
                          className={styles.branchItem}
                          data-active={isActive ? "true" : "false"}
                          disabled={isMutating}
                          type="button"
                          onClick={() => openCollections(branch.id)}
                        >
                          <BranchTick />
                          <span>{branch.name}</span>
                        </button>
                        <span className={styles.branchActions}>
                          <button
                            className={styles.branchActionButton}
                            type="button"
                            aria-label={`Переименовать коллекцию ${branch.name}`}
                            disabled={isMutating}
                            onClick={() => startEditBranch(branch)}
                          >
                            <EditBranchIcon />
                          </button>
                          <button
                            className={styles.branchActionButton}
                            data-danger="true"
                            type="button"
                            aria-label={`Удалить коллекцию ${branch.name}`}
                            disabled={isMutating}
                            onClick={() => void deleteBranch(branch)}
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      </>
                    )}
                  </motion.div>
                );
              })}

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

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeViewKey}
              className={styles.contentStage}
              initial={
                shouldReduceMotion
                  ? false
                  : { opacity: 0, y: 10, filter: "blur(6px)" }
              }
              animate={
                shouldReduceMotion
                  ? undefined
                  : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              exit={
                shouldReduceMotion
                  ? undefined
                  : { opacity: 0, y: -8, filter: "blur(5px)" }
              }
              transition={viewTransition}
            >
              <div className={styles.dayStack}>
                {thoughtGroups.map((group, groupIndex) => (
                  <section
                    className={styles.daySection}
                    key={group.key}
                    ref={
                      group.branchId ? setBranchSectionRef(group.branchId) : null
                    }
                  >
                    <div
                      className={styles.dayHeader}
                      data-first={
                        groupIndex === 0 && activeView.kind !== "collections"
                          ? "true"
                          : "false"
                      }
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
                                selectable={activeView.kind === "inbox"}
                                selected={selectedThoughtIds.has(thought.id)}
                                onDelete={(nextThought) =>
                                  void deleteThought(nextThought)
                                }
                                onOpen={openThought}
                                onToggleSelect={toggleThoughtSelection}
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
                  <p>
                    Здесь пока пусто. Скинь мысль вручную или перешли пост боту.
                  </p>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
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
              formId={CREATE_THOUGHT_FORM_ID}
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
              contentHtml={
                selectedThought.sourceType === "telegram"
                  ? selectedThought.contentHtml
                  : null
              }
              imageUrls={getThoughtImages(selectedThought)}
              formId={EDIT_THOUGHT_FORM_ID}
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
