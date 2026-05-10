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
import { AppTabs } from "@/components/app-tabs";
import { DynamicBackground } from "@/components/diary/dynamic-background";
import {
  AddTaskIcon,
  ChevronIcon,
  DragHandleIcon,
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
  title: string;
};

type CalendarCell = {
  id: string;
  date: Date;
  label: number;
  inMonth: boolean;
  selected: boolean;
};

const STORAGE_KEY = "younotebook:planner:v2";
const INITIAL_SELECTED_DATE = new Date(2026, 8, 1);
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

function buildWeekDays(selectedDate: Date): PlannerDay[] {
  const monday = startOfWeek(selectedDate);

  return DAY_NAMES.map((name, index) => {
    const date = addDays(monday, index);

    return {
      id: toDateKey(date),
      date,
      title: `${name} ${date.getDate()}`,
    };
  });
}

function buildCalendarCells(viewDate: Date, selectedDate: Date) {
  const monthStart = startOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < 42; index++) {
    const date = addDays(gridStart, index);

    cells.push({
      id: toDateKey(date),
      date,
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
          <button
            key={cell.id}
            className={cell.selected ? styles.calendarDateActive : ""}
            data-muted={cell.inMonth ? "false" : "true"}
            type="button"
            aria-pressed={cell.selected}
            onClick={() => onSelectDate(cell.date)}
          >
            {cell.label}
          </button>
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
    setActivatorNodeRef,
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
    >
      <button
        ref={setActivatorNodeRef}
        className={styles.dragHandle}
        type="button"
        aria-label={`Перетащить задачу ${task.title || "без названия"}`}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon />
      </button>
      <button
        className={styles.checkbox}
        data-checked={task.completed ? "true" : "false"}
        type="button"
        aria-label={task.completed ? "Отметить невыполненной" : "Выполнить"}
        onClick={onToggle}
      >
        <TaskCheckIcon />
      </button>
      <span
        ref={titleRef}
        className={styles.taskTitle}
        contentEditable
        data-empty={task.title.trim() ? "false" : "true"}
        role="textbox"
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
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function DayColumn({
  day,
  editingTaskId,
  tasks,
  onAddTask,
  onDeleteTask,
  onTitleChange,
  onToggleTask,
}: {
  day: PlannerDay;
  editingTaskId: string | null;
  tasks: PlannerTask[];
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
  onTitleChange: (taskId: string, title: string) => void;
  onToggleTask: (taskId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: day.id });

  return (
    <section
      ref={setNodeRef}
      className={styles.dayColumn}
      data-over={isOver ? "true" : "false"}
    >
      <h2>{day.title}</h2>
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
            <span aria-hidden="true">
              <AddTaskIcon />
            </span>
            Добавить задачу
          </button>
        </div>
      </SortableContext>
    </section>
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
  const [selectedDate, setSelectedDate] = useState(INITIAL_SELECTED_DATE);
  const [viewDate, setViewDate] = useState(startOfMonth(INITIAL_SELECTED_DATE));
  const [planner, setPlanner] = useState<PlannerState>(() =>
    createInitialPlanner(INITIAL_SELECTED_DATE),
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const days = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const calendarCells = useMemo(
    () => buildCalendarCells(viewDate, selectedDate),
    [selectedDate, viewDate],
  );
  const activeTask = activeTaskId ? findTask(planner, activeTaskId) : null;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed = normalizeStoredPlanner(JSON.parse(stored));

          if (parsed) {
            setPlanner(
              ensurePlannerDays(
                parsed,
                buildWeekDays(INITIAL_SELECTED_DATE),
              ),
            );
          }
        }
      } catch {
        setPlanner(createInitialPlanner(INITIAL_SELECTED_DATE));
      } finally {
        setStorageReady(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
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
    const weekDays = buildWeekDays(date);

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
        onShiftMonth={(months) => setViewDate((current) => addMonths(current, months))}
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
          {days.map((day) => (
            <DayColumn
              key={day.id}
              day={day}
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

      <section className={styles.sundayNote}>
        <p>Воскресенье</p>
        <strong>Займись собой, сделай то, что хочешь</strong>
      </section>
    </main>
  );
}
