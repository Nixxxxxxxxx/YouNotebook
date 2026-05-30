import type { TelegramReplyMarkup } from "@/lib/telegram/types";

import type { PlannerTask, PlannerTaskInput } from "./types";

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
});
const HUMAN_DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function getDateKeyFromParts(parts: Intl.DateTimeFormatPart[]) {
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getDateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function normalizeTelegramLine(line: string) {
  return line
    .trim()
    .replace(/^(?:[-—–•*+]|\d+[.)]|☐|✅|✔|\[[ xX]\])\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTodayDirective(line: string) {
  return /^(?:на\s+)?сегодня:?$/iu.test(line) || /^today:?$/iu.test(line);
}

function isTomorrowDirective(line: string) {
  return /^(?:на\s+)?завтра:?$/iu.test(line) || /^tomorrow:?$/iu.test(line);
}

function isTodayInlineDirective(line: string) {
  return /^(?:на\s+)?сегодня:\s+/iu.test(line) || /^today:\s+/iu.test(line);
}

function isTomorrowInlineDirective(line: string) {
  return /^(?:на\s+)?завтра:\s+/iu.test(line) || /^tomorrow:\s+/iu.test(line);
}

function removeInlineDirective(line: string) {
  return line
    .replace(/^(?:на\s+)?сегодня:\s*/iu, "")
    .replace(/^(?:на\s+)?завтра:\s*/iu, "")
    .replace(/^today:\s*/iu, "")
    .replace(/^tomorrow:\s*/iu, "")
    .trim();
}

export function getMoscowDateKey(offsetDays = 0) {
  const todayKey = getDateKeyFromParts(
    MOSCOW_DATE_FORMATTER.formatToParts(new Date()),
  );

  return offsetDays === 0 ? todayKey : addDaysToDateKey(todayKey, offsetDays);
}

export function getPlannerDateLabel(dateKey: string) {
  const todayKey = getMoscowDateKey();

  if (dateKey === todayKey) {
    return "сегодня";
  }

  if (dateKey === addDaysToDateKey(todayKey, 1)) {
    return "завтра";
  }

  return HUMAN_DATE_FORMATTER.format(getDateFromKey(dateKey));
}

export function parsePlannerTaskMessage(text: string): PlannerTaskInput[] {
  const todayKey = getMoscowDateKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  let activeDate = todayKey;
  const tasks: PlannerTaskInput[] = [];

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line || line.startsWith("/")) {
      return;
    }

    if (isTodayDirective(line)) {
      activeDate = todayKey;
      return;
    }

    if (isTomorrowDirective(line)) {
      activeDate = tomorrowKey;
      return;
    }

    if (isTodayInlineDirective(line)) {
      activeDate = todayKey;
    }

    if (isTomorrowInlineDirective(line)) {
      activeDate = tomorrowKey;
    }

    const title = normalizeTelegramLine(removeInlineDirective(line));

    if (!title) {
      return;
    }

    tasks.push({
      date: activeDate,
      source: "telegram",
      title,
    });
  });

  return tasks;
}

export function renderPlannerTelegramList(dateKey: string, tasks: PlannerTask[]) {
  const meaningfulTasks = tasks.filter((task) => task.title.trim().length > 0);
  const completed = meaningfulTasks.filter((task) => task.completed).length;
  const title = `План на ${getPlannerDateLabel(dateKey)}`;

  if (meaningfulTasks.length === 0) {
    return `${title}\n\nПока задач нет. Просто пришли список строками, и я аккуратно сложу его сюда.`;
  }

  const lines = meaningfulTasks.map((task) => {
    const marker = task.completed ? "✓" : "☐";

    return `${marker} ${task.title}`;
  });

  return `${title}\n${completed}/${meaningfulTasks.length} закрыто\n\n${lines.join("\n")}`;
}

function truncateButtonTitle(title: string) {
  return title.length > 34 ? `${title.slice(0, 31)}...` : title;
}

export function getPlannerTelegramReplyMarkup(
  tasks: PlannerTask[],
): TelegramReplyMarkup | undefined {
  const meaningfulTasks = tasks.filter((task) => task.title.trim().length > 0);
  const buttons: NonNullable<TelegramReplyMarkup["inline_keyboard"]> =
    meaningfulTasks.slice(0, 20).map((task) => [
    {
      text: `${task.completed ? "↩" : "✓"} ${truncateButtonTitle(task.title)}`,
      callback_data: `pt:${task.id}`,
    },
  ]);
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (appBaseUrl) {
    buttons.push([
      {
        text: "Открыть планировщик",
        url: `${appBaseUrl.replace(/\/$/, "")}/planner`,
      },
    ]);
  }

  return buttons.length > 0 ? { inline_keyboard: buttons } : undefined;
}
