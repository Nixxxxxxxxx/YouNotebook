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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { AppTabs } from "@/components/app-tabs";
import { DynamicBackground } from "@/components/diary/dynamic-background";
import {
  AddTaskIcon,
  ChevronIcon,
  TaskCheckIcon,
  TrashIcon,
} from "@/components/icons/app-icons";
import styles from "./planner-app.module.css";

type PlannerTask = {
  id: string;
  title: string;
  completed: boolean;
};

type PlannerState = Record<string, PlannerTask[]>;

type PlannerDay = {
  id: string;
  date: Date;
  dateLabel: string;
  isToday: boolean;
  title: string;
  weekday: string;
};

type CalendarCell = {
  id: string;
  date: Date;
  isToday: boolean;
  label: number;
  inMonth: boolean;
  selected: boolean;
};

const STORAGE_KEY = "younotebook:planner:v2";
const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
];
const MONTH_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});
const DAY_NUMBER_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
});

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

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(first: Date, second: Date) {
  return toDateKey(first) === toDateKey(second);
}

function buildWeekDays(selectedDate: Date, today = getToday()): PlannerDay[] {
  const monday = startOfWeek(selectedDate);

  return DAY_NAMES.map((name, index) => {
    const date = addDays(monday, index);
    const dateLabel = DAY_NUMBER_FORMATTER.format(date);

    return {
      id: toDateKey(date),
      date,
      dateLabel,
      isToday: isSameDay(date, today),
      title: `${name} ${dateLabel}`,
      weekday: name,
    };
  });
}

function buildCalendarCells(
  viewDate: Date,
  selectedDate: Date,
  today = getToday(),
) {
  const monthStart = startOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index++) {
    const date = addDays(gridStart, index);

    cells.push({
      id: toDateKey(date),
      date,
      isToday: isSameDay(date, today),
      label: date.getDate(),
      inMonth: date.getMonth() === viewDate.getMonth(),
      selected: isSameDay(date, selectedDate),
    });
  }

  return cells;
}

function createInitialPlanner(selectedDate: Date): PlannerState {
  return buildWeekDays(selectedDate).reduce((state, day) => {
    state[day.id] = [
      { id: `${day.id}-1`, title: "Мы работаем над собой", completed: false },
      { id: `${day.id}-2`, title: "Мы работаем над собой", completed: true },
    ];
    return state;
  }, {} as PlannerState);
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

function createTask(dayId: string): PlannerTask {
  return {
    id: `${dayId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    completed: false,
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
  if (state[overId]) {
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
      .filter((task): task is PlannerTask => {
        return (
          Boolean(task) &&
          typeof task === "object" &&
          typeof (task as PlannerTask).id === "string" &&
          typeof (task as PlannerTask).title === "string" &&
          typeof (task as PlannerTask).completed === "boolean"
        );
      })
      .map((task) => ({ ...task }));
  });

  return next;
}

function PlannerCalendar({
  cells,
  viewDate,
  onSelectDate,
  onShiftMonth,
}: {
  cells: CalendarCell[];
  viewDate: Date;
  onSelectDate: (date: Date) => void;
  onShiftMonth: (months: number) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const monthLabel = MONTH_FORMATTER.format(viewDate).replace(/^./, (letter) =>
    letter.toUpperCase(),
  );

  return (
    <aside className={styles.calendar} aria-label="Календарь">
      <div className={styles.calendarHeader}>
        <button
          type="button"
          aria-label="Предыдущий месяц"
          onClick={() => onShiftMonth(-1)}
        >
          <ChevronIcon />
        </button>
        <span>{monthLabel}</span>
        <button
          type="button"
          aria-label="Следующий месяц"
          onClick={() => onShiftMonth(1)}
        >
          <ChevronIcon className={styles.calendarNextIcon} />
        </button>
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((cell) => (
          <motion.button
            key={cell.id}
            className={cell.selected ? styles.calendarDateActive : ""}
            data-muted={cell.inMonth ? "false" : "true"}
            data-today={cell.isToday ? "true" : "false"}
            layout={!shouldReduceMotion}
            type="button"
            aria-pressed={cell.selected}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.88 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, scale: 1 }}
            transition={{
              duration: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            onClick={() => onSelectDate(cell.date)}
          >
            {cell.label}
          </motion.button>
        ))}
      </div>
    </aside>
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

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

  return (
    <div
      ref={setNodeRef}
      className={styles.taskRow}
      data-dragging={isDragging ? "true" : "false"}
      data-task-row
      style={style}
      {...attributes}
      {...listeners}
    >
      <button
        className={styles.checkbox}
        data-checked={task.completed ? "true" : "false"}
        type="button"
        aria-label={task.completed ? "Отметить невыполненной" : "Выполнить"}
        onClick={onToggle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <TaskCheckIcon />
      </button>
      <span
        ref={titleRef}
        className={styles.taskTitle}
        contentEditable="plaintext-only"
        data-empty={task.title.trim() ? "false" : "true"}
        dir="auto"
        aria-multiline="true"
        role="textbox"
        spellCheck
        suppressContentEditableWarning
        tabIndex={0}
        onBlur={commitTitle}
        onInput={(event) => {
          const title = event.currentTarget.innerText;

          event.currentTarget.dataset.empty = title.trim() ? "false" : "true";
          onTitleChange(title);
        }}
        onKeyDown={handleTitleKeyDown}
      />
      <button
        className={styles.deleteTask}
        type="button"
        aria-label={`Удалить задачу ${task.title || "без названия"}`}
        onClick={onDelete}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function DayColumn({
  day,
  index,
  editingTaskId,
  tasks,
  onAddTask,
  onDeleteTask,
  onTitleChange,
  onToggleTask,
}: {
  day: PlannerDay;
  index: number;
  editingTaskId: string | null;
  tasks: PlannerTask[];
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onTitleChange: (taskId: string, title: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { isOver, setNodeRef } = useDroppable({ id: day.id });

  return (
    <motion.section
      ref={setNodeRef}
      className={styles.dayColumn}
      data-over={isOver ? "true" : "false"}
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
        <span>{day.weekday}</span>
        <time dateTime={day.id}>{day.dateLabel}</time>
      </h2>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={styles.taskList} data-task-list>
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
        </div>
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
  const [selectedDate, setSelectedDate] = useState(() => getToday());
  const [viewDate, setViewDate] = useState(() => startOfMonth(getToday()));
  const [planner, setPlanner] = useState<PlannerState>(() =>
    createInitialPlanner(getToday()),
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const days = useMemo(
    () => buildWeekDays(selectedDate, today),
    [selectedDate, today],
  );
  const calendarCells = useMemo(
    () => buildCalendarCells(viewDate, selectedDate, today),
    [selectedDate, today, viewDate],
  );
  const sundayDate = useMemo(
    () => addDays(startOfWeek(selectedDate), 6),
    [selectedDate],
  );
  const isSundayToday = isSameDay(sundayDate, today);
  const activeTask = activeTaskId ? findTask(planner, activeTaskId) : null;
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentDate = getToday();

      setToday(currentDate);
      setSelectedDate(currentDate);
      setViewDate(startOfMonth(currentDate));

      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed = normalizeStoredPlanner(JSON.parse(stored));

          if (parsed) {
            setPlanner(
              ensurePlannerDays(
                parsed,
                buildWeekDays(currentDate, currentDate),
              ),
            );
          }
        }
      } catch {
        setPlanner(createInitialPlanner(currentDate));
      } finally {
        setStorageReady(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
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
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planner));
  }, [planner, storageReady]);

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id;

    if (!overId) {
      return;
    }

    setPlanner((current) =>
      moveTaskBetweenDays(current, String(event.active.id), String(overId)),
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    if (!overId) {
      setActiveTaskId(null);
      return;
    }

    setPlanner((current) => {
      const activeDay = findTaskContainer(current, activeId);
      const overDay = getOverContainer(current, overId);

      if (!activeDay || !overDay || activeDay !== overDay) {
        return current;
      }

      const oldIndex = current[activeDay].findIndex(
        (task) => task.id === activeId,
      );
      const newIndex = current[activeDay].findIndex(
        (task) => task.id === overId,
      );

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return current;
      }

      return {
        ...current,
        [activeDay]: arrayMove(current[activeDay], oldIndex, newIndex),
      };
    });
    setActiveTaskId(null);
  }

  function addTask(dayId: string) {
    const task = createTask(dayId);

    setPlanner((current) => ({
      ...current,
      [dayId]: [...(current[dayId] ?? []), task],
    }));
    setEditingTaskId(task.id);
  }

  function deleteTask(dayId: string, taskId: string) {
    setPlanner((current) => ({
      ...current,
      [dayId]: (current[dayId] ?? []).filter((task) => task.id !== taskId),
    }));

    if (editingTaskId === taskId) {
      setEditingTaskId(null);
    }
  }

  function updateTaskTitle(dayId: string, taskId: string, title: string) {
    setPlanner((current) => ({
      ...current,
      [dayId]: (current[dayId] ?? []).map((task) =>
        task.id === taskId ? { ...task, title } : task,
      ),
    }));
  }

  function toggleTask(dayId: string, taskId: string) {
    setPlanner((current) => ({
      ...current,
      [dayId]: (current[dayId] ?? []).map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  function selectDate(date: Date) {
    const weekDays = buildWeekDays(date, today);

    setSelectedDate(date);
    setViewDate(startOfMonth(date));
    setPlanner((current) => ensurePlannerDays(current, weekDays));
  }

  return (
    <main className={styles.shell}>
      <DynamicBackground />
      <AppTabs active="planner" />

      <PlannerCalendar
        cells={calendarCells}
        viewDate={viewDate}
        onSelectDate={selectDate}
        onShiftMonth={(months) =>
          setViewDate((current) => addMonths(current, months))
        }
      />

      <DndContext
        collisionDetection={closestCorners}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTaskId(null)}
      >
        <div className={styles.weekBoard}>
          {days.map((day, index) => (
            <DayColumn
              key={day.id}
              day={day}
              index={index}
              editingTaskId={editingTaskId}
              tasks={planner[day.id] ?? []}
              onAddTask={() => addTask(day.id)}
              onDeleteTask={(taskId) => deleteTask(day.id, taskId)}
              onTitleChange={(taskId, title) =>
                updateTaskTitle(day.id, taskId, title)
              }
              onToggleTask={(taskId) => toggleTask(day.id, taskId)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      <section
        className={styles.sundayNote}
        data-today={isSundayToday ? "true" : "false"}
      >
        <p aria-label={`Воскресенье ${DAY_NUMBER_FORMATTER.format(sundayDate)}`}>
          <span>Воскресенье</span>
          <time dateTime={toDateKey(sundayDate)}>
            {DAY_NUMBER_FORMATTER.format(sundayDate)}
          </time>
        </p>
        <strong>Займись собой, сделай то, что хочешь</strong>
      </section>
    </main>
  );
}
