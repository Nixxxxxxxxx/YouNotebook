"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DynamicBackground } from "@/components/diary/dynamic-background";
import {
  AddTaskIcon,
  TaskCheckIcon,
  TrashIcon,
} from "@/components/icons/app-icons";
import type {
  PlannerTask as ServerPlannerTask,
  PlannerVoiceUsageSummary,
} from "@/lib/planner/types";
import styles from "./planner-app.module.css";

type PlannerTask = ServerPlannerTask;
type PlannerVoiceUsage = PlannerVoiceUsageSummary;

type PlannerState = Record<string, PlannerTask[]>;

type PlannerDay = {
  id: string;
  date: Date;
  dateLabel: string;
  isPast: boolean;
  isToday: boolean;
  title: string;
  weekday: string;
};

type CompletionSummary = {
  completed: number;
  total: number;
  label: string;
  message: string;
  progress: number;
};

const STORAGE_KEY = "younotebook:planner:v2";
const SERVER_MIGRATION_KEY = "younotebook:planner:v2:migrated-to-server";
const COMPLETION_REORDER_DELAY = 500;
const TITLE_SAVE_DELAY = 420;
const REORDER_TRANSITION = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
} as const;
const INITIAL_PAST_DAYS = 7;
const INITIAL_DAY_COUNT = 42;
const TIMELINE_BATCH_DAYS = 14;
const TIMELINE_FALLBACK_LEFT_CLIP = 33;
const TIMELINE_TODAY_START_GUTTER = 28;
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
});
const DAY_MONTH_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});
const animateSortableLayoutChanges: AnimateLayoutChanges = (args) => {
  if (!args.isSorting && !args.wasDragging) {
    return false;
  }

  return defaultAnimateLayoutChanges(args);
};

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getTimelineTodayStartInset(timeline: HTMLElement) {
  const rail = document.querySelector<HTMLElement>("[data-planner-rail]");

  if (!rail) {
    return TIMELINE_FALLBACK_LEFT_CLIP + TIMELINE_TODAY_START_GUTTER;
  }

  const timelineRect = timeline.getBoundingClientRect();
  const railRect = rail.getBoundingClientRect();
  const overlapsVertically =
    railRect.bottom > timelineRect.top && railRect.top < timelineRect.bottom;

  if (!overlapsVertically) {
    return 0;
  }

  return (
    Math.max(railRect.right - timelineRect.left, 0) +
    TIMELINE_TODAY_START_GUTTER
  );
}

function isSameDay(first: Date, second: Date) {
  return toDateKey(first) === toDateKey(second);
}

function formatVoiceMinutes(seconds: number) {
  const minutes = seconds / 60;

  if (minutes < 1 && seconds > 0) {
    return "<1 мин";
  }

  return `${Math.round(minutes)} мин`;
}

function getCurrentTimestamp() {
  return Date.now();
}

function getRecordingDurationSeconds(startedAt: number | null) {
  return Math.max(
    1,
    Math.ceil((getCurrentTimestamp() - (startedAt ?? getCurrentTimestamp())) / 1000),
  );
}

function isDayId(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function capitalizeFirst(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

function buildPlannerDay(date: Date, today = getToday()): PlannerDay {
  const weekday = capitalizeFirst(WEEKDAY_FORMATTER.format(date));
  const dateLabel = DAY_MONTH_FORMATTER.format(date);

  return {
    id: toDateKey(date),
    date,
    dateLabel,
    isPast: date.getTime() < today.getTime(),
    isToday: isSameDay(date, today),
    title: `${weekday} ${dateLabel}`,
    weekday,
  };
}

function buildTimelineDays(
  startDate: Date,
  count: number,
  today = getToday(),
) {
  return Array.from({ length: count }, (_, index) =>
    buildPlannerDay(addDays(startDate, index), today),
  );
}

function ensurePlannerDays(state: PlannerState, days: PlannerDay[]) {
  const next = clonePlanner(state);

  days.forEach((day) => {
    next[day.id] = next[day.id] ?? [];
  });

  return next;
}

function clonePlanner(state: PlannerState): PlannerState {
  return Object.fromEntries(
    Object.entries(state).map(([dayId, tasks]) => [
      dayId,
      tasks.map((task) => ({ ...task })),
    ]),
  );
}

function createOptimisticTask(dayId: string): PlannerTask {
  const now = new Date().toISOString();

  return {
    completed: false,
    completedAt: null,
    createdAt: now,
    date: dayId,
    id: `temp-${dayId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sortOrder: 0,
    source: "web",
    title: "",
    updatedAt: now,
  };
}

function isTemporaryTaskId(taskId: string) {
  return taskId.startsWith("temp-");
}

function getMeaningfulTasks(tasks: PlannerTask[]) {
  return tasks.filter((task) => task.title.trim().length > 0);
}

function toggleTaskCompletionState(tasks: PlannerTask[], taskId: string) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task,
  );
}

function moveTaskToCompletionPosition(tasks: PlannerTask[], taskId: string) {
  const taskIndex = tasks.findIndex((task) => task.id === taskId);

  if (taskIndex < 0) {
    return tasks;
  }

  const targetTask = tasks[taskIndex];
  const remainingTasks = tasks.filter((task) => task.id !== taskId);

  if (targetTask.completed) {
    return [...remainingTasks, targetTask];
  }

  return [targetTask, ...remainingTasks];
}

function insertTaskBeforeCompleted(tasks: PlannerTask[], task: PlannerTask) {
  const firstCompletedIndex = tasks.findIndex((item) => item.completed);

  if (firstCompletedIndex < 0) {
    return [...tasks, task];
  }

  return [
    ...tasks.slice(0, firstCompletedIndex),
    task,
    ...tasks.slice(firstCompletedIndex),
  ];
}

function getTimelineRange(days: PlannerDay[]) {
  return {
    from: days[0]?.id ?? toDateKey(getToday()),
    to: days.at(-1)?.id ?? toDateKey(getToday()),
  };
}

function mergeServerTasksForDays(
  state: PlannerState,
  days: PlannerDay[],
  tasks: PlannerTask[],
) {
  const next = ensurePlannerDays(state, days);

  days.forEach((day) => {
    next[day.id] = [];
  });
  tasks.forEach((task) => {
    next[task.date] = next[task.date] ?? [];
    next[task.date].push(task);
  });

  return next;
}

function getStoredPlannerMigrationTasks() {
  let storedPlanner: PlannerState | null = null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    storedPlanner = stored ? normalizeStoredPlanner(JSON.parse(stored)) : null;
  } catch {
    storedPlanner = null;
  }

  if (!storedPlanner) {
    return [];
  }

  return Object.entries(storedPlanner).flatMap(([date, tasks]) =>
    tasks
      .filter((task) => task.title.trim().length > 0)
      .map((task, index) => ({
        completed: task.completed,
        date,
        sortOrder: index,
        source: "web" as const,
        title: task.title,
      })),
  );
}

async function fetchPlannerTasks(from: string, to: string) {
  const response = await fetch(`/api/planner/tasks?from=${from}&to=${to}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load planner tasks");
  }

  const data = (await response.json()) as { tasks?: PlannerTask[] };

  return data.tasks ?? [];
}

async function createPlannerTaskRequest(date: string, title = "") {
  const response = await fetch("/api/planner/tasks", {
    body: JSON.stringify({ date, title }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to create planner task");
  }

  const data = (await response.json()) as { task: PlannerTask };

  return data.task;
}

async function createPlannerTasksRequest(
  tasks: ReturnType<typeof getStoredPlannerMigrationTasks>,
) {
  const response = await fetch("/api/planner/tasks", {
    body: JSON.stringify({ tasks }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to migrate planner tasks");
  }
}

async function updatePlannerTaskRequest(
  taskId: string,
  patch: Partial<Pick<PlannerTask, "completed" | "date" | "sortOrder" | "title">>,
) {
  if (isTemporaryTaskId(taskId)) {
    return null;
  }

  const response = await fetch(`/api/planner/tasks/${taskId}`, {
    body: JSON.stringify(patch),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("Failed to update planner task");
  }

  const data = (await response.json()) as { task: PlannerTask };

  return data.task;
}

async function deletePlannerTaskRequest(taskId: string) {
  if (isTemporaryTaskId(taskId)) {
    return;
  }

  const response = await fetch(`/api/planner/tasks/${taskId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete planner task");
  }
}

async function reorderPlannerTasksRequest(dayId: string, tasks: PlannerTask[]) {
  const ids = tasks
    .filter((task) => !isTemporaryTaskId(task.id))
    .map((task) => task.id);

  if (ids.length === 0) {
    return;
  }

  const response = await fetch("/api/planner/tasks/reorder", {
    body: JSON.stringify({ date: dayId, ids }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error("Failed to reorder planner tasks");
  }
}

async function fetchPlannerVoiceUsageRequest() {
  const response = await fetch("/api/planner/voice", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load planner voice usage");
  }

  const data = (await response.json()) as { usage?: PlannerVoiceUsage };

  return data.usage ?? null;
}

async function uploadPlannerVoiceRequest(
  dayId: string,
  audio: Blob,
  durationSeconds: number,
) {
  const formData = new FormData();

  formData.set("date", dayId);
  formData.set("audio", audio, "planner-voice.webm");
  formData.set("durationSeconds", String(durationSeconds));

  const response = await fetch("/api/planner/voice", {
    body: formData,
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to process planner voice");
  }

  const data = (await response.json()) as {
    tasks?: PlannerTask[];
    transcript?: string;
    usage?: PlannerVoiceUsage;
  };

  return {
    tasks: data.tasks ?? [],
    usage: data.usage ?? null,
  };
}

function getCompletionMessage(completed: number, total: number) {
  if (total === 0) {
    return "Пока нечего считать. Добавь задачу, если день просит формы.";
  }

  if (completed === 0) {
    return "Пока ноль. Зато теперь понятно, куда бить.";
  }

  const progress = completed / total;

  if (progress < 0.34) {
    return "Уже не пусто. Маленький ход — тоже ход.";
  }

  if (progress < 0.7) {
    return "Половина зверя приручена. Продолжаем спокойно.";
  }

  if (progress < 1) {
    return "Почти закрыто. Осталось не испугаться финиша.";
  }

  return "И ты хочешь сказать, что гордишься этим?";
}

function getCompletionSummary({
  isToday,
  tasks,
}: {
  isToday: boolean;
  tasks: PlannerTask[];
}): CompletionSummary {
  const meaningfulTasks = getMeaningfulTasks(tasks);
  const completed = meaningfulTasks.filter((task) => task.completed).length;
  const total = meaningfulTasks.length;

  return {
    completed,
    total,
    label: isToday ? "Выполнено сегодня" : "Выполнено за день",
    message: getCompletionMessage(completed, total),
    progress: total > 0 ? completed / total : 0,
  };
}

function findTaskContainer(state: PlannerState, taskId: string) {
  return Object.entries(state).find(([, tasks]) =>
    tasks.some((task) => task.id === taskId),
  )?.[0];
}

function findTask(state: PlannerState, taskId: string) {
  const dayId = findTaskContainer(state, taskId);

  if (!dayId) {
    return null;
  }

  return state[dayId]?.find((task) => task.id === taskId) ?? null;
}

function getOverContainer(state: PlannerState, overId: string) {
  if (state[overId] || isDayId(overId)) {
    return overId;
  }

  return findTaskContainer(state, overId) ?? null;
}

function moveTaskBetweenDays(
  state: PlannerState,
  activeId: string,
  overId: string,
) {
  const activeDay = findTaskContainer(state, activeId);
  const overDay = getOverContainer(state, overId);

  if (!activeDay || !overDay || activeDay === overDay) {
    return state;
  }

  const activeTask = state[activeDay]?.find((task) => task.id === activeId);

  if (!activeTask) {
    return state;
  }

  const next = clonePlanner(state);
  next[activeDay] = (next[activeDay] ?? []).filter(
    (task) => task.id !== activeId,
  );
  next[overDay] = next[overDay] ?? [];

  const overIndex = next[overDay].findIndex((task) => task.id === overId);
  const insertAt = overIndex >= 0 ? overIndex : next[overDay].length;
  next[overDay] = [
    ...next[overDay].slice(0, insertAt),
    activeTask,
    ...next[overDay].slice(insertAt),
  ];

  return next;
}

function normalizeStoredPlanner(value: unknown): PlannerState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const next: PlannerState = {};

  entries.forEach(([dayId, tasks]) => {
    if (!Array.isArray(tasks)) {
      return;
    }

    next[dayId] = tasks
      .filter((task): task is Pick<PlannerTask, "completed" | "id" | "title"> => {
        return (
          Boolean(task) &&
          typeof task === "object" &&
          typeof (task as Pick<PlannerTask, "id">).id === "string" &&
          typeof (task as Pick<PlannerTask, "title">).title === "string" &&
          typeof (task as Pick<PlannerTask, "completed">).completed ===
            "boolean"
        );
      })
      .map((task, index) => {
        const now = new Date().toISOString();

        return {
          completed: task.completed,
          completedAt: task.completed ? now : null,
          createdAt: now,
          date: dayId,
          id: task.id,
          sortOrder: index,
          source: "web" as const,
          title: task.title,
          updatedAt: now,
        };
      });
  });

  return next;
}

function PlannerDayStatus({
  isLoading = false,
  summary,
}: {
  isLoading?: boolean;
  summary: CompletionSummary;
}) {
  const shouldReduceMotion = useReducedMotion();
  const statusKey = isLoading
    ? "loading"
    : `${summary.completed}-${summary.total}-${summary.message}`;

  return (
    <motion.section
      className={styles.dayStatus}
      data-loading={isLoading ? "true" : "false"}
      aria-label={`${summary.label}: ${summary.completed} из ${summary.total}`}
      aria-busy={isLoading}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className={styles.dayStatusLabel}>{summary.label}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.strong
          key={`count-${summary.completed}-${summary.total}`}
          className={styles.dayStatusCount}
          initial={
            shouldReduceMotion
              ? false
              : { opacity: 0, y: 12, filter: "blur(6px)" }
          }
          animate={
            shouldReduceMotion
              ? undefined
              : { opacity: 1, y: 0, filter: "blur(0px)" }
          }
          exit={
            shouldReduceMotion
              ? undefined
              : { opacity: 0, y: -12, filter: "blur(6px)" }
          }
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          {isLoading ? "0/0" : `${summary.completed}/${summary.total}`}
        </motion.strong>
      </AnimatePresence>
      <div className={styles.dayStatusTrack} aria-hidden="true">
        <motion.span
          className={styles.dayStatusProgress}
          initial={false}
          animate={{ scaleX: isLoading ? 0 : summary.progress }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 180, damping: 24, mass: 1 }
          }
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={statusKey}
          className={styles.dayStatusMessage}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        >
          {summary.message}
        </motion.p>
      </AnimatePresence>
    </motion.section>
  );
}

function PlannerVoicePanel({
  isLoading,
  recordingDayTitle,
  status,
  usage,
}: {
  isLoading: boolean;
  recordingDayTitle: string | null;
  status: string | null;
  usage: PlannerVoiceUsage | null;
}) {
  const shouldReduceMotion = useReducedMotion();
  const usedSeconds = usage?.totalSecondsToday ?? 0;
  const dailyLimitSeconds = usage?.dailyLimitSeconds ?? 0;
  const remainingSeconds = Math.max(dailyLimitSeconds - usedSeconds, 0);
  const progress = usage?.progress ?? 0;
  const providerLabel = usage?.providerLabel ?? "Cloudflare Whisper";
  const usedLabel = formatVoiceMinutes(usedSeconds);
  const limitLabel = dailyLimitSeconds
    ? formatVoiceMinutes(dailyLimitSeconds)
    : "без лимита";
  const remainingLabel = dailyLimitSeconds
    ? `${formatVoiceMinutes(remainingSeconds)} осталось сегодня`
    : "лимит не задан";
  const liveStatus = recordingDayTitle
    ? `Записываю: ${recordingDayTitle}`
    : status;

  return (
    <motion.section
      className={styles.voicePanel}
      aria-label="Голосовой ввод и лимит расшифровки"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={styles.voicePanelHeader}>
        <span>Голосовой ввод</span>
        <span>{providerLabel}</span>
      </div>
      <div
        className={styles.voiceLive}
        data-active={recordingDayTitle ? "true" : "false"}
      >
        <span className={styles.voiceLiveDot} aria-hidden="true" />
        <span aria-live="polite">
          {liveStatus ?? "Нажми «Голосом» под нужным днем"}
        </span>
      </div>
      <div className={styles.voiceLimit}>
        <span>Лимит</span>
        <strong>{isLoading ? "..." : `${usedLabel} / ${limitLabel}`}</strong>
      </div>
      <div className={styles.voiceLimitTrack} aria-hidden="true">
        <motion.span
          initial={false}
          animate={{ scaleX: isLoading ? 0 : progress }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
          }
        />
      </div>
      <p className={styles.voiceHint}>
        {isLoading
          ? "Сверяю лимит..."
          : `${remainingLabel}. Просто говори задачами, можно без тире.`}
      </p>
    </motion.section>
  );
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  const selection = window.getSelection();

  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function PlannerTaskRow({
  autoFocus,
  task,
  onDelete,
  onTitleChange,
  onToggle,
}: {
  autoFocus: boolean;
  task: PlannerTask;
  onDelete: () => void;
  onTitleChange: (title: string) => void;
  onToggle: () => void;
}) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition: sortableTransition,
    isDragging,
  } = useSortable({
    id: task.id,
    animateLayoutChanges: animateSortableLayoutChanges,
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: sortableTransition,
  };
  const hasTitle = task.title.trim().length > 0;

  useEffect(() => {
    if (!titleRef.current || document.activeElement === titleRef.current) {
      return;
    }

    titleRef.current.innerText = task.title;
  }, [task.id, task.title]);

  useEffect(() => {
    if (!autoFocus || !titleRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const titleElement = titleRef.current;

      if (!titleElement) {
        return;
      }

      titleElement.focus();
      placeCaretAtEnd(titleElement);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus]);

  function commitTitle() {
    const title = titleRef.current?.innerText.trim() ?? "";

    setIsEditing(false);

    if (!title) {
      onDelete();
      return;
    }

    onTitleChange(title);

    if (titleRef.current) {
      titleRef.current.innerText = title;
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    event.stopPropagation();

    if (event.key === "Enter") {
      event.preventDefault();
      titleRef.current?.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();

      if (titleRef.current) {
        titleRef.current.innerText = task.title;
        titleRef.current.dataset.empty = task.title.trim() ? "false" : "true";
      }

      titleRef.current?.blur();
    }
  }

  function handleToggleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setRippleKey((current) => current + 1);
    onToggle();
  }

  return (
    <motion.div
      ref={setNodeRef}
      className={styles.taskItem}
      data-completed={task.completed ? "true" : "false"}
      data-dragging={isDragging ? "true" : "false"}
      layout={shouldReduceMotion ? false : "position"}
      initial={false}
      animate={
        shouldReduceMotion
          ? undefined
          : {
              opacity: isDragging ? 0.28 : 1,
            }
      }
      transition={{
        layout: REORDER_TRANSITION,
        opacity: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
      }}
      {...attributes}
      {...listeners}
    >
      <div
        className={styles.taskRow}
        data-completed={task.completed ? "true" : "false"}
        data-empty={hasTitle ? "false" : "true"}
        data-editing={isEditing ? "true" : "false"}
        data-dragging={isDragging ? "true" : "false"}
        data-task-row
        style={sortableStyle}
      >
        <motion.button
          className={styles.checkbox}
          data-checked={task.completed ? "true" : "false"}
          type="button"
          aria-label={task.completed ? "Отметить невыполненной" : "Выполнить"}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          onClick={handleToggleClick}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {rippleKey > 0 ? (
            <span
              key={rippleKey}
              className={styles.checkboxRipple}
              aria-hidden="true"
            />
          ) : null}
          <TaskCheckIcon />
        </motion.button>
        <span
          ref={titleRef}
          className={styles.taskTitle}
          contentEditable="plaintext-only"
          data-empty={hasTitle ? "false" : "true"}
          dir="auto"
          aria-multiline="true"
          role="textbox"
          spellCheck
          suppressContentEditableWarning
          tabIndex={0}
          onBlur={commitTitle}
          onFocus={() => setIsEditing(true)}
          onInput={(event) => {
            const title = event.currentTarget.innerText;

            event.currentTarget.dataset.empty = title.trim()
              ? "false"
              : "true";
            onTitleChange(title);
          }}
          onKeyDown={handleTitleKeyDown}
        />
        <button
          className={styles.deleteTask}
          type="button"
          aria-label={`Удалить задачу ${task.title || "без названия"}`}
          disabled={!hasTitle || isEditing}
          onClick={onDelete}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <TrashIcon />
        </button>
      </div>
    </motion.div>
  );
}

function DayColumn({
  day,
  index,
  editingTaskId,
  isRecording,
  tasks,
  onAddTask,
  onDeleteTask,
  onTitleChange,
  onToggleTask,
  onVoiceTask,
}: {
  day: PlannerDay;
  index: number;
  editingTaskId: string | null;
  isRecording: boolean;
  tasks: PlannerTask[];
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onTitleChange: (taskId: string, title: string) => void;
  onToggleTask: (taskId: string) => void;
  onVoiceTask: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { isOver, setNodeRef } = useDroppable({ id: day.id });

  return (
    <motion.section
      ref={setNodeRef}
      className={styles.dayColumn}
      data-day-column
      data-day-id={day.id}
      data-over={isOver ? "true" : "false"}
      data-past={day.isPast ? "true" : "false"}
      data-today={day.isToday ? "true" : "false"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.025,
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <h2 aria-label={day.title}>
        <span className={styles.dayHeadingLine}>
          {day.isToday ? (
            <motion.span
              className={styles.todayIndicator}
              aria-hidden="true"
              initial={false}
              animate={
                shouldReduceMotion
                  ? undefined
                  : {
                      filter: [
                        "brightness(1)",
                        "brightness(1.36)",
                        "brightness(1)",
                      ],
                      scale: [1, 1.08, 1],
                    }
              }
              transition={{
                duration: 1.2,
                ease: [0.22, 1, 0.36, 1],
                repeat: Infinity,
                repeatDelay: 0.12,
              }}
            >
              {shouldReduceMotion ? null : (
                <motion.span
                  className={styles.todayIndicatorPulse}
                  aria-hidden="true"
                  initial={false}
                  animate={{
                    opacity: [0.72, 0],
                    scale: [0.72, 2.55],
                  }}
                  transition={{
                    duration: 1.2,
                    ease: [0.22, 1, 0.36, 1],
                    repeat: Infinity,
                    repeatDelay: 0.12,
                  }}
                />
              )}
            </motion.span>
          ) : null}
          <span>{day.weekday}</span>
        </span>
        <time dateTime={day.id}>{day.dateLabel}</time>
      </h2>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <motion.div
          className={styles.taskList}
          data-task-list
          layout={shouldReduceMotion ? false : true}
          transition={{
            layout: REORDER_TRANSITION,
          }}
        >
          {tasks.map((task) => (
            <PlannerTaskRow
              key={task.id}
              autoFocus={editingTaskId === task.id}
              task={task}
              onDelete={() => onDeleteTask(task.id)}
              onTitleChange={(title) => onTitleChange(task.id, title)}
              onToggle={() => onToggleTask(task.id)}
            />
          ))}
          <button
            className={styles.addTask}
            data-add-task
            type="button"
            onClick={onAddTask}
          >
            <span className={styles.addTaskIcon} aria-hidden="true">
              <AddTaskIcon />
            </span>
            <span className={styles.addTaskLabel}>Добавить задачу</span>
          </button>
          <button
            className={styles.voiceTask}
            data-recording={isRecording ? "true" : "false"}
            type="button"
            aria-label={
              isRecording ? "Остановить надиктовку" : "Надиктовать задачи"
            }
            onClick={onVoiceTask}
          >
            <span aria-hidden="true" />
            <span>{isRecording ? "Слушаю" : "Голосом"}</span>
          </button>
        </motion.div>
      </SortableContext>
    </motion.section>
  );
}

function TaskOverlay({ task }: { task: PlannerTask }) {
  return (
    <div className={styles.taskOverlay}>
      <span
        className={styles.checkbox}
        data-checked={task.completed ? "true" : "false"}
      >
        <TaskCheckIcon />
      </span>
      <span className={styles.taskTitle}>{task.title}</span>
    </div>
  );
}

export function PlannerApp() {
  const [today, setToday] = useState(() => getToday());
  const [timelineStartDate, setTimelineStartDate] = useState(() =>
    addDays(getToday(), -INITIAL_PAST_DAYS),
  );
  const [timelineDayCount, setTimelineDayCount] =
    useState(INITIAL_DAY_COUNT);
  const [planner, setPlanner] = useState<PlannerState>({});
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [recordingDayId, setRecordingDayId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [voiceUsage, setVoiceUsage] = useState<PlannerVoiceUsage | null>(null);
  const [voiceUsageReady, setVoiceUsageReady] = useState(false);
  const dragStartDayRef = useRef<string | null>(null);
  const loadedDayIdsRef = useRef<Set<string>>(new Set());
  const plannerRef = useRef<PlannerState>({});
  const timelineRef = useRef<HTMLDivElement>(null);
  const didInitialTimelineScrollRef = useRef(false);
  const isAnchoringTimelineRef = useRef(true);
  const isPrependingTimelineRef = useRef(false);
  const isAppendingTimelineRef = useRef(false);
  const reorderTimeoutsRef = useRef<Record<string, number>>({});
  const titleSaveTimeoutsRef = useRef<Record<string, number>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStartedAtRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const days = useMemo(
    () => buildTimelineDays(timelineStartDate, timelineDayCount, today),
    [timelineDayCount, timelineStartDate, today],
  );
  const activeTask = activeTaskId ? findTask(planner, activeTaskId) : null;
  const todayDayId = toDateKey(today);
  const dayStatus = useMemo(
    () =>
      getCompletionSummary({
        isToday: true,
        tasks: planner[todayDayId] ?? [],
      }),
    [planner, todayDayId],
  );
  const recordingDayTitle = recordingDayId
    ? (days.find((day) => day.id === recordingDayId)?.title ?? null)
    : null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function commitPlanner(next: PlannerState) {
    plannerRef.current = next;
    setPlanner(next);
  }

  function markDaysLoaded(daysToMark: PlannerDay[]) {
    daysToMark.forEach((day) => loadedDayIdsRef.current.add(day.id));
  }

  function persistTaskOrder(dayId: string, tasks = plannerRef.current[dayId] ?? []) {
    void reorderPlannerTasksRequest(dayId, tasks).catch(() => {
      // The next server fetch will repair order if a transient write fails.
    });
  }

  function clearTitleSave(taskId: string) {
    const timeoutId = titleSaveTimeoutsRef.current[taskId];

    if (!timeoutId) {
      return;
    }

    window.clearTimeout(timeoutId);
    delete titleSaveTimeoutsRef.current[taskId];
  }

  function mergeVoiceTasks(tasks: PlannerTask[]) {
    if (tasks.length === 0) {
      return;
    }

    const current = plannerRef.current;
    const next = clonePlanner(current);

    tasks.forEach((task) => {
      next[task.date] = insertTaskBeforeCompleted(next[task.date] ?? [], task);
    });

    commitPlanner(next);
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function startVoiceRecording(dayId: string) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus("Микрофон не поддерживается");
      window.setTimeout(() => setVoiceStatus(null), 2800);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);

    voiceChunksRef.current = [];
    voiceStartedAtRef.current = getCurrentTimestamp();
    mediaRecorderRef.current = recorder;
    setRecordingDayId(dayId);
    setVoiceStatus("Слушаю...");

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        voiceChunksRef.current.push(event.data);
      }
    });
    recorder.addEventListener("stop", () => {
      const durationSeconds = getRecordingDurationSeconds(
        voiceStartedAtRef.current,
      );
      const audio = new Blob(voiceChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });

      stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      voiceChunksRef.current = [];
      voiceStartedAtRef.current = null;
      setRecordingDayId(null);
      setVoiceStatus("Разбираю голос...");

      if (audio.size === 0) {
        setVoiceStatus(null);
        return;
      }

      void uploadPlannerVoiceRequest(dayId, audio, durationSeconds)
        .then(({ tasks, usage }) => {
          mergeVoiceTasks(tasks);
          if (usage) {
            setVoiceUsage(usage);
            setVoiceUsageReady(true);
          }
          setVoiceStatus(
            tasks.length > 0
              ? `Добавил задач: ${tasks.length}`
              : "Не нашел задач в голосе",
          );
          window.setTimeout(() => setVoiceStatus(null), 2600);
        })
        .catch(() => {
          setVoiceStatus("Не смог разобрать голос");
          window.setTimeout(() => setVoiceStatus(null), 3200);
        });
    });
    recorder.start();
  }

  function toggleVoiceTask(dayId: string) {
    if (recordingDayId) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording(dayId).catch(() => {
      setRecordingDayId(null);
      voiceStartedAtRef.current = null;
      setVoiceStatus("Микрофон недоступен");
      window.setTimeout(() => setVoiceStatus(null), 2800);
    });
  }

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;

    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    plannerRef.current = planner;
  }, [planner]);

  useEffect(() => {
    let isCancelled = false;

    fetchPlannerVoiceUsageRequest()
      .then((usage) => {
        if (!isCancelled) {
          setVoiceUsage(usage);
          setVoiceUsageReady(true);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setVoiceUsageReady(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialPlanner() {
      const currentDate = getToday();
      const initialStartDate = addDays(currentDate, -INITIAL_PAST_DAYS);
      const initialDays = buildTimelineDays(
        initialStartDate,
        INITIAL_DAY_COUNT,
        currentDate,
      );

      setToday(currentDate);
      setTimelineStartDate(initialStartDate);
      setTimelineDayCount(INITIAL_DAY_COUNT);
      commitPlanner(ensurePlannerDays({}, initialDays));

      try {
        if (!window.localStorage.getItem(SERVER_MIGRATION_KEY)) {
          const migrationTasks = getStoredPlannerMigrationTasks();

          if (migrationTasks.length > 0) {
            await createPlannerTasksRequest(migrationTasks);
          }

          window.localStorage.setItem(SERVER_MIGRATION_KEY, "true");
        }

        const { from, to } = getTimelineRange(initialDays);
        const tasks = await fetchPlannerTasks(from, to);

        if (isCancelled) {
          return;
        }

        markDaysLoaded(initialDays);
        commitPlanner(mergeServerTasksForDays({}, initialDays, tasks));
      } catch {
        if (!isCancelled) {
          markDaysLoaded(initialDays);
          commitPlanner(ensurePlannerDays({}, initialDays));
        }
      } finally {
        if (!isCancelled) {
          setStorageReady(true);
        }
      }
    }

    void loadInitialPlanner();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;

    function scheduleTodayRefresh() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 50);

      timeoutId = window.setTimeout(() => {
        setToday(getToday());
        scheduleTodayRefresh();
      }, tomorrow.getTime() - now.getTime());
    }

    scheduleTodayRefresh();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const reorderTimeouts = reorderTimeoutsRef.current;
    const titleSaveTimeouts = titleSaveTimeoutsRef.current;

    return () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      voiceStartedAtRef.current = null;
      Object.values(reorderTimeouts).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      Object.values(titleSaveTimeouts).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    const missingDays = days.filter(
      (day) => !loadedDayIdsRef.current.has(day.id),
    );

    if (missingDays.length === 0) {
      return;
    }

    let isCancelled = false;

    async function loadMissingDays() {
      const { from, to } = getTimelineRange(missingDays);
      const tasks = await fetchPlannerTasks(from, to);

      if (isCancelled) {
        return;
      }

      markDaysLoaded(missingDays);
      commitPlanner(mergeServerTasksForDays(plannerRef.current, missingDays, tasks));
    }

    void loadMissingDays().catch(() => {
      if (!isCancelled) {
        markDaysLoaded(missingDays);
        commitPlanner(ensurePlannerDays(plannerRef.current, missingDays));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [days, storageReady]);

  useLayoutEffect(() => {
    if (didInitialTimelineScrollRef.current) {
      return;
    }

    const timeline = timelineRef.current;
    const todayColumn = timeline?.querySelector<HTMLElement>(
      `[data-day-id="${todayDayId}"]`,
    );

    if (!timeline || !todayColumn) {
      return;
    }

    function anchorToToday() {
      const currentTimeline = timelineRef.current;
      const currentTodayColumn = currentTimeline?.querySelector<HTMLElement>(
        `[data-day-id="${todayDayId}"]`,
      );

      if (!currentTimeline || !currentTodayColumn) {
        return;
      }

      currentTimeline.scrollLeft = Math.max(
        currentTodayColumn.offsetLeft -
          getTimelineTodayStartInset(currentTimeline),
        0,
      );
    }

    isAnchoringTimelineRef.current = true;
    anchorToToday();

    const frame = window.requestAnimationFrame(() => {
      anchorToToday();
    });
    const timeout = window.setTimeout(() => {
      anchorToToday();
      didInitialTimelineScrollRef.current = true;
      isAnchoringTimelineRef.current = false;
    }, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [days, todayDayId]);

  function handleTimelineScroll() {
    const timeline = timelineRef.current;

    if (
      !timeline ||
      !didInitialTimelineScrollRef.current ||
      isAnchoringTimelineRef.current
    ) {
      return;
    }

    const distanceToEnd =
      timeline.scrollWidth - timeline.scrollLeft - timeline.clientWidth;

    if (timeline.scrollLeft < 640 && !isPrependingTimelineRef.current) {
      const columns = timeline.querySelectorAll<HTMLElement>(
        "[data-day-column]",
      );
      const columnStep =
        columns[1] && columns[0]
          ? columns[1].offsetLeft - columns[0].offsetLeft
          : columns[0]?.getBoundingClientRect().width ?? 316;
      const previousScrollLeft = timeline.scrollLeft;

      isPrependingTimelineRef.current = true;
      setTimelineStartDate((current) => addDays(current, -TIMELINE_BATCH_DAYS));
      setTimelineDayCount((current) => current + TIMELINE_BATCH_DAYS);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          timeline.scrollLeft =
            previousScrollLeft + columnStep * TIMELINE_BATCH_DAYS;
          isPrependingTimelineRef.current = false;
        });
      });
    }

    if (distanceToEnd < 960 && !isAppendingTimelineRef.current) {
      isAppendingTimelineRef.current = true;
      setTimelineDayCount((current) => current + TIMELINE_BATCH_DAYS);

      window.requestAnimationFrame(() => {
        isAppendingTimelineRef.current = false;
      });
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);

    dragStartDayRef.current = findTaskContainer(plannerRef.current, taskId) ?? null;
    setActiveTaskId(taskId);
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id;

    if (!overId) {
      return;
    }

    setPlanner((current) => {
      const next = moveTaskBetweenDays(
        current,
        String(event.active.id),
        String(overId),
      );

      plannerRef.current = next;

      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) {
      dragStartDayRef.current = null;
      setActiveTaskId(null);
      return;
    }

    setPlanner((current) => {
      const activeDay = findTaskContainer(current, activeId);
      const overDay = getOverContainer(current, overId);

      if (!activeDay || !overDay || activeDay !== overDay) {
        plannerRef.current = current;
        return current;
      }

      const oldIndex = current[activeDay].findIndex(
        (task) => task.id === activeId,
      );
      const newIndex = current[activeDay].findIndex(
        (task) => task.id === overId,
      );

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        plannerRef.current = current;
        return current;
      }

      const next = {
        ...current,
        [activeDay]: arrayMove(current[activeDay], oldIndex, newIndex),
      };

      plannerRef.current = next;

      return next;
    });

    window.requestAnimationFrame(() => {
      const startDay = dragStartDayRef.current;
      const finalDay = findTaskContainer(plannerRef.current, activeId);
      const finalTask = finalDay ? findTask(plannerRef.current, activeId) : null;

      if (finalDay && finalTask && !isTemporaryTaskId(activeId)) {
        void updatePlannerTaskRequest(activeId, {
          date: finalDay,
          sortOrder: plannerRef.current[finalDay]?.findIndex(
            (task) => task.id === activeId,
          ),
        }).catch(() => {
          // A later refresh keeps the local board aligned if this write fails.
        });
      }

      if (startDay) {
        persistTaskOrder(startDay);
      }

      if (finalDay && finalDay !== startDay) {
        persistTaskOrder(finalDay);
      } else if (finalDay) {
        persistTaskOrder(finalDay);
      }

      dragStartDayRef.current = null;
    });
    setActiveTaskId(null);
  }

  function clearCompletionReorder(taskId: string) {
    const timeoutId = reorderTimeoutsRef.current[taskId];

    if (!timeoutId) {
      return;
    }

    window.clearTimeout(timeoutId);
    delete reorderTimeoutsRef.current[taskId];
  }

  function reorderTaskToCompletionPosition(dayId: string, taskId: string) {
    const current = plannerRef.current;
    const targetDay =
      current[dayId]?.some((task) => task.id === taskId) === true
        ? dayId
        : findTaskContainer(current, taskId);

    if (!targetDay) {
      return;
    }

    const nextTasks = moveTaskToCompletionPosition(
      current[targetDay] ?? [],
      taskId,
    );

    if (nextTasks === current[targetDay]) {
      return;
    }

    commitPlanner({
      ...current,
      [targetDay]: nextTasks,
    });
    persistTaskOrder(targetDay, nextTasks);
  }

  function scheduleCompletionReorder(dayId: string, taskId: string) {
    clearCompletionReorder(taskId);

    if (shouldReduceMotion) {
      reorderTaskToCompletionPosition(dayId, taskId);
      return;
    }

    reorderTimeoutsRef.current[taskId] = window.setTimeout(() => {
      delete reorderTimeoutsRef.current[taskId];
      reorderTaskToCompletionPosition(dayId, taskId);
    }, COMPLETION_REORDER_DELAY);
  }

  async function addTask(dayId: string) {
    const task = createOptimisticTask(dayId);
    const current = plannerRef.current;

    commitPlanner({
      ...current,
      [dayId]: insertTaskBeforeCompleted(current[dayId] ?? [], task),
    });
    setEditingTaskId(task.id);

    try {
      const createdTask = await createPlannerTaskRequest(dayId);
      const latestTask = findTask(plannerRef.current, task.id);

      if (!latestTask) {
        await deletePlannerTaskRequest(createdTask.id);
        return;
      }

      const reconciledTask = {
        ...createdTask,
        completed: latestTask.completed,
        title: latestTask.title,
      };
      const latestDay =
        findTaskContainer(plannerRef.current, task.id) ?? createdTask.date;

      commitPlanner({
        ...plannerRef.current,
        [latestDay]: (plannerRef.current[latestDay] ?? []).map((item) =>
          item.id === task.id ? reconciledTask : item,
        ),
      });
      setEditingTaskId((currentEditingTaskId) =>
        currentEditingTaskId === task.id ? createdTask.id : currentEditingTaskId,
      );

      if (
        reconciledTask.title !== createdTask.title ||
        reconciledTask.completed !== createdTask.completed ||
        latestDay !== createdTask.date
      ) {
        void updatePlannerTaskRequest(createdTask.id, {
          completed: reconciledTask.completed,
          date: latestDay,
          title: reconciledTask.title,
        }).catch(() => {});
      }

      persistTaskOrder(latestDay);
    } catch {
      deleteTask(dayId, task.id);
    }
  }

  function deleteTask(dayId: string, taskId: string) {
    clearCompletionReorder(taskId);
    clearTitleSave(taskId);
    const current = plannerRef.current;

    commitPlanner({
      ...current,
      [dayId]: (current[dayId] ?? []).filter((task) => task.id !== taskId),
    });
    void deletePlannerTaskRequest(taskId).catch(() => {});

    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }
  }

  function updateTaskTitle(dayId: string, taskId: string, title: string) {
    const current = plannerRef.current;

    commitPlanner({
      ...current,
      [dayId]: (current[dayId] ?? []).map((task) =>
        task.id === taskId ? { ...task, title } : task,
      ),
    });

    if (isTemporaryTaskId(taskId)) {
      return;
    }

    clearTitleSave(taskId);
    titleSaveTimeoutsRef.current[taskId] = window.setTimeout(() => {
      delete titleSaveTimeoutsRef.current[taskId];
      void updatePlannerTaskRequest(taskId, { title }).catch(() => {});
    }, TITLE_SAVE_DELAY);
  }

  function toggleTask(dayId: string, taskId: string) {
    const current = plannerRef.current;
    const nextTasks = toggleTaskCompletionState(current[dayId] ?? [], taskId);
    const nextTask = nextTasks.find((task) => task.id === taskId);

    commitPlanner({
      ...current,
      [dayId]: nextTasks,
    });

    if (nextTask && !isTemporaryTaskId(taskId)) {
      void updatePlannerTaskRequest(taskId, {
        completed: nextTask.completed,
      }).catch(() => {});
    }

    scheduleCompletionReorder(dayId, taskId);
  }

  return (
    <main className={styles.shell}>
      <DynamicBackground />

      <div className={styles.leftRail} data-planner-rail>
        <PlannerDayStatus isLoading={!storageReady} summary={dayStatus} />
        <PlannerVoicePanel
          isLoading={!voiceUsageReady}
          recordingDayTitle={recordingDayTitle}
          status={voiceStatus}
          usage={voiceUsage}
        />
      </div>

      <DndContext
        collisionDetection={closestCorners}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          dragStartDayRef.current = null;
          setActiveTaskId(null);
        }}
      >
        <div
          ref={timelineRef}
          className={styles.weekScroller}
          onScroll={handleTimelineScroll}
        >
          <div className={styles.weekBoard}>
            {days.map((day, index) => (
              <DayColumn
                key={day.id}
                day={day}
                index={index}
                editingTaskId={editingTaskId}
                isRecording={recordingDayId === day.id}
                tasks={planner[day.id] ?? []}
                onAddTask={() => addTask(day.id)}
                onDeleteTask={(taskId) => deleteTask(day.id, taskId)}
                onTitleChange={(taskId, title) =>
                  updateTaskTitle(day.id, taskId, title)
                }
                onToggleTask={(taskId) => toggleTask(day.id, taskId)}
                onVoiceTask={() => toggleVoiceTask(day.id)}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
