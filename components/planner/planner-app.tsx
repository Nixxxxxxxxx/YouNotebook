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
import { useEffect, useMemo, useState } from "react";
import { AppTabs } from "@/components/app-tabs";
import { DynamicBackground } from "@/components/diary/dynamic-background";
import styles from "./planner-app.module.css";

type DayId = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type PlannerTask = {
  id: string;
  title: string;
  completed: boolean;
};

type PlannerState = Record<DayId, PlannerTask[]>;

type Day = {
  id: DayId;
  title: string;
};

const STORAGE_KEY = "younotebook:planner:v1";

const DAYS: Day[] = [
  { id: "mon", title: "Понедельник 1" },
  { id: "tue", title: "Вторник 2" },
  { id: "wed", title: "Среда 3" },
  { id: "thu", title: "Четверг 4" },
  { id: "fri", title: "Пятница 5" },
  { id: "sat", title: "Суббота 6" },
];

const DEFAULT_PLANNER: PlannerState = {
  mon: [
    { id: "mon-1", title: "Мы работаем над собой", completed: false },
    { id: "mon-2", title: "Мы работаем над собой", completed: true },
  ],
  tue: [
    { id: "tue-1", title: "Мы работаем над собой", completed: false },
    { id: "tue-2", title: "Мы работаем над собой", completed: true },
  ],
  wed: [
    { id: "wed-1", title: "Мы работаем над собой", completed: false },
    { id: "wed-2", title: "Мы работаем над собой", completed: true },
  ],
  thu: [
    { id: "thu-1", title: "Мы работаем над собой", completed: false },
    { id: "thu-2", title: "Мы работаем над собой", completed: true },
  ],
  fri: [
    { id: "fri-1", title: "Мы работаем над собой", completed: false },
    { id: "fri-2", title: "Мы работаем над собой", completed: true },
  ],
  sat: [
    { id: "sat-1", title: "Мы работаем над собой", completed: false },
    { id: "sat-2", title: "Мы работаем над собой", completed: true },
  ],
};

function clonePlanner(state: PlannerState): PlannerState {
  return DAYS.reduce((next, day) => {
    next[day.id] = state[day.id].map((task) => ({ ...task }));
    return next;
  }, {} as PlannerState);
}

function createTask(dayId: DayId): PlannerTask {
  return {
    id: `${dayId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "Новая задача",
    completed: false,
  };
}

function findTaskContainer(state: PlannerState, taskId: string) {
  return DAYS.find((day) => state[day.id].some((task) => task.id === taskId))
    ?.id;
}

function findTask(state: PlannerState, taskId: string) {
  const dayId = findTaskContainer(state, taskId);

  if (!dayId) {
    return null;
  }

  return state[dayId].find((task) => task.id === taskId) ?? null;
}

function getOverContainer(state: PlannerState, overId: string): DayId | null {
  if (DAYS.some((day) => day.id === overId)) {
    return overId as DayId;
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

  const activeTask = state[activeDay].find((task) => task.id === activeId);

  if (!activeTask) {
    return state;
  }

  const next = clonePlanner(state);
  next[activeDay] = next[activeDay].filter((task) => task.id !== activeId);

  const overIndex = next[overDay].findIndex((task) => task.id === overId);
  const insertAt = overIndex >= 0 ? overIndex : next[overDay].length;
  next[overDay] = [
    ...next[overDay].slice(0, insertAt),
    activeTask,
    ...next[overDay].slice(insertAt),
  ];

  return next;
}

function PlannerCalendar() {
  const rows = [
    [1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19, 20, 21],
    [22, 23, 24, 25, 26, 27, 28],
    [29, 30, 31, 1, 2, 3, 4],
  ];

  return (
    <aside className={styles.calendar} aria-label="Календарь">
      <div className={styles.calendarHeader}>
        <button type="button" aria-label="Предыдущий месяц">
          ‹
        </button>
        <span>Сентябрь 2026</span>
        <button type="button" aria-label="Следующий месяц">
          ›
        </button>
      </div>
      <div className={styles.calendarGrid}>
        {rows.flatMap((row, rowIndex) =>
          row.map((date, dateIndex) => {
            const selected = rowIndex === 4 && dateIndex === 2;

            return (
              <button
                key={`${rowIndex}-${dateIndex}`}
                className={selected ? styles.calendarDateActive : ""}
                type="button"
              >
                {date}
              </button>
            );
          }),
        )}
      </div>
    </aside>
  );
}

function PlannerTaskRow({
  task,
  onDelete,
  onToggle,
}: {
  task: PlannerTask;
  onDelete: () => void;
  onToggle: () => void;
}) {
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

  return (
    <div
      ref={setNodeRef}
      className={styles.taskRow}
      data-dragging={isDragging ? "true" : "false"}
      style={style}
    >
      <button
        className={styles.checkbox}
        data-checked={task.completed ? "true" : "false"}
        type="button"
        aria-label={task.completed ? "Отметить невыполненной" : "Выполнить"}
        onClick={onToggle}
      />
      <span className={styles.taskTitle}>{task.title}</span>
      <button
        ref={setActivatorNodeRef}
        className={styles.dragHandle}
        type="button"
        aria-label={`Перетащить задачу ${task.title}`}
        {...attributes}
        {...listeners}
      >
        <span />
        <span />
        <span />
      </button>
      <button
        className={styles.deleteTask}
        type="button"
        aria-label={`Удалить задачу ${task.title}`}
        onClick={onDelete}
      >
        ×
      </button>
    </div>
  );
}

function DayColumn({
  day,
  tasks,
  onAddTask,
  onDeleteTask,
  onToggleTask,
}: {
  day: Day;
  tasks: PlannerTask[];
  onAddTask: () => void;
  onDeleteTask: (taskId: string) => void;
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
        <div className={styles.taskList}>
          {tasks.map((task) => (
            <PlannerTaskRow
              key={task.id}
              task={task}
              onDelete={() => onDeleteTask(task.id)}
              onToggle={() => onToggleTask(task.id)}
            />
          ))}
          <button className={styles.addTask} type="button" onClick={onAddTask}>
            <span aria-hidden="true">+</span>
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
      />
      <span className={styles.taskTitle}>{task.title}</span>
    </div>
  );
}

export function PlannerApp() {
  const [planner, setPlanner] = useState<PlannerState>(() =>
    clonePlanner(DEFAULT_PLANNER),
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
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

  const dayItemIds = useMemo(
    () =>
      DAYS.reduce(
        (items, day) => ({
          ...items,
          [day.id]: planner[day.id].map((task) => task.id),
        }),
        {} as Record<DayId, string[]>,
      ),
    [planner],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);

        if (stored) {
          setPlanner(JSON.parse(stored) as PlannerState);
        }
      } catch {
        setPlanner(clonePlanner(DEFAULT_PLANNER));
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

  function addTask(dayId: DayId) {
    setPlanner((current) => ({
      ...current,
      [dayId]: [...current[dayId], createTask(dayId)],
    }));
  }

  function deleteTask(dayId: DayId, taskId: string) {
    setPlanner((current) => ({
      ...current,
      [dayId]: current[dayId].filter((task) => task.id !== taskId),
    }));
  }

  function toggleTask(dayId: DayId, taskId: string) {
    setPlanner((current) => ({
      ...current,
      [dayId]: current[dayId].map((task) =>
        task.id === taskId ? { ...task, completed: !task.completed } : task,
      ),
    }));
  }

  return (
    <main className={styles.shell}>
      <DynamicBackground />
      <AppTabs active="planner" />

      <PlannerCalendar />

      <DndContext
        collisionDetection={closestCorners}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTaskId(null)}
      >
        <div className={styles.weekBoard}>
          {DAYS.map((day) => (
            <DayColumn
              key={day.id}
              day={day}
              tasks={planner[day.id].filter((task) =>
                dayItemIds[day.id].includes(task.id),
              )}
              onAddTask={() => addTask(day.id)}
              onDeleteTask={(taskId) => deleteTask(day.id, taskId)}
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
