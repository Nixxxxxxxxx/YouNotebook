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
    .replace(/[.,;:!?]+$/u, "")
    .trim();
}

const TASK_SEPARATOR_REGEXP =
  /\s*(?:[;]+|[.!?]\s+|,\s+|\s+(?:а\s+потом|потом|затем|после\s+этого|далее)\s+|\s+и\s+)\s*/giu;
const NATURAL_DATE_MARKER_REGEXP =
  /(^|[\s,.;!?])((?:на\s+)?сегодня|(?:на\s+)?завтра)(?=[:\s,.;!?]|$)/giu;
const IMPERATIVE_ACTION_WORDS = new Set([
  "добавь",
  "забери",
  "зайди",
  "закажи",
  "закрой",
  "запиши",
  "заполни",
  "запусти",
  "купи",
  "найди",
  "напиши",
  "настрой",
  "обнови",
  "оплати",
  "открой",
  "отправь",
  "перенеси",
  "позвони",
  "помой",
  "поставь",
  "почини",
  "прочитай",
  "проведи",
  "проверь",
  "разбери",
  "сделай",
  "скинь",
  "собери",
  "создай",
  "сходи",
  "схожу",
  "убери",
]);

function getFirstWord(value: string) {
  return value.toLowerCase().match(/[a-zа-яё]+/iu)?.[0] ?? "";
}

function looksLikeActionPhrase(value: string) {
  const firstWord = getFirstWord(value).replace(/ё/g, "е");

  if (!firstWord) {
    return false;
  }

  return (
    IMPERATIVE_ACTION_WORDS.has(firstWord) ||
    /(?:ть|ти|чь|ться|тись)$/iu.test(firstWord) ||
    (firstWord.length > 3 && /(?:ю|у)$/iu.test(firstWord))
  );
}

function removePlannerLeadIn(title: string) {
  return title
    .replace(
      /^(?:мне\s+)?(?:нужно|надо|хочу|давай|можешь|можно)(?:\s+|$)/iu,
      "",
    )
    .replace(
      /^(?:добавь|добавить|запиши|записать|запланируй|запланировать|поставь|поставить|создай|создать)\s+(?:задач[иу]?\s+|дел[ао]\s+|план\s+)?/iu,
      "",
    )
    .trim();
}

function normalizeTaskSegment(segment: string) {
  const title = removePlannerLeadIn(normalizeTelegramLine(segment))
    .replace(/^(?:я|мы)\s+(?:буду|будем)\s+/iu, "")
    .replace(/^(?:я|мы)\s+/iu, "")
    .replace(/^(?:буду|будем)\s+/iu, "")
    .replace(/\s+и$/iu, "")
    .trim();
  const withoutFillerDo = title.replace(/^сделать\s+(.+)$/iu, (_, rest) =>
    looksLikeActionPhrase(rest) ? rest : title,
  );

  return withoutFillerDo.trim();
}

function splitCompoundTaskTitle(title: string) {
  const normalizedTitle = removePlannerLeadIn(title);
  const segments = normalizedTitle
    .split(TASK_SEPARATOR_REGEXP)
    .map(normalizeTaskSegment)
    .filter(Boolean);

  if (
    segments.length > 1 &&
    segments.every((segment) => looksLikeActionPhrase(segment))
  ) {
    return segments;
  }

  return [normalizeTaskSegment(normalizedTitle)].filter(Boolean);
}

function isTodayDirective(line: string) {
  return /^(?:на\s+)?сегодня:?$/iu.test(line) || /^today:?$/iu.test(line);
}

function isTomorrowDirective(line: string) {
  return /^(?:на\s+)?завтра:?$/iu.test(line) || /^tomorrow:?$/iu.test(line);
}

function removeInlineDirective(line: string) {
  return line
    .replace(/^(?:на\s+)?сегодня:\s*/iu, "")
    .replace(/^(?:на\s+)?завтра:\s*/iu, "")
    .replace(/^today:\s*/iu, "")
    .replace(/^tomorrow:\s*/iu, "")
    .trim();
}

function removeNaturalDateLeadIn(line: string) {
  return line
    .replace(/^(?:на\s+)?сегодня(?:\s+|$)/iu, "")
    .replace(/^(?:на\s+)?завтра(?:\s+|$)/iu, "")
    .trim();
}

function getDateKeyFromNaturalMarker(
  marker: string,
  todayKey: string,
  tomorrowKey: string,
) {
  return /завтра/iu.test(marker) ? tomorrowKey : todayKey;
}

function stripTaskBoundary(value: string) {
  return value.replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/gu, "").trim();
}

function isOnlyPlannerLeadIn(value: string) {
  const normalized = normalizeTaskSegment(
    removeNaturalDateLeadIn(removeInlineDirective(value)),
  );

  return !normalized || /^(?:и|а)$/iu.test(normalized);
}

function splitNaturalDateClauses(
  line: string,
  activeDate: string,
  todayKey: string,
  tomorrowKey: string,
) {
  const matches = Array.from(line.matchAll(NATURAL_DATE_MARKER_REGEXP));

  if (matches.length === 0) {
    return [{ date: activeDate, text: line }];
  }

  const clauses: Array<{ date: string; text: string }> = [];
  const firstMatch = matches[0];
  const leadingText = stripTaskBoundary(line.slice(0, firstMatch.index));

  if (leadingText && !isOnlyPlannerLeadIn(leadingText)) {
    clauses.push({ date: activeDate, text: leadingText });
  }

  matches.forEach((match, index) => {
    const marker = match[2] ?? "";
    const nextMatch = matches[index + 1];
    const date = getDateKeyFromNaturalMarker(marker, todayKey, tomorrowKey);
    const text = stripTaskBoundary(
      line.slice((match.index ?? 0) + match[0].length, nextMatch?.index),
    );

    if (text) {
      clauses.push({ date, text });
    }
  });

  return clauses;
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

export function parsePlannerTaskMessage(
  text: string,
  options: { defaultDate?: string; source?: PlannerTaskInput["source"] } = {},
): PlannerTaskInput[] {
  const todayKey = options.defaultDate ?? getMoscowDateKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const source = options.source ?? "telegram";
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

    splitNaturalDateClauses(line, activeDate, todayKey, tomorrowKey).forEach(
      (clause) => {
      const title = normalizeTelegramLine(
        removeNaturalDateLeadIn(removeInlineDirective(clause.text)),
      );

      if (!title) {
        activeDate = clause.date;
        return;
      }

      splitCompoundTaskTitle(title).forEach((taskTitle) => {
        tasks.push({
          date: clause.date,
          source,
          title: taskTitle,
        });
      });
      activeDate = clause.date;
    },
    );
  });

  return tasks;
}

export function renderPlannerTelegramList(dateKey: string, tasks: PlannerTask[]) {
  const meaningfulTasks = tasks.filter((task) => task.title.trim().length > 0);
  const completed = meaningfulTasks.filter((task) => task.completed).length;
  const title = `План на ${getPlannerDateLabel(dateKey)}`;

  if (meaningfulTasks.length === 0) {
    return `<b>🗓 ${escapeTelegramHtml(title)}</b>\n\nПока задач нет. Просто пришли список строками, и я аккуратно сложу его сюда.`;
  }

  const lines = meaningfulTasks.map((task, index) => {
    const number = index + 1;
    const title = escapeTelegramHtml(task.title);

    if (task.completed) {
      return `✅ <s>${number}. ${title}</s>`;
    }

    return `☐ <b>${number}.</b> ${title}`;
  });

  return [
    `<b>🗓 ${escapeTelegramHtml(title)}</b>`,
    `✅ ${completed}/${meaningfulTasks.length} закрыто`,
    "",
    lines.join("\n"),
    "",
    "👇 Нажимай номер снизу, чтобы закрыть задачу. Закрытую можно вернуть тем же номером.",
  ].join("\n");
}

export function getPlannerTelegramListOptions(
  replyMarkup?: TelegramReplyMarkup,
) {
  return {
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
}

function escapeTelegramHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getPlannerTelegramReplyMarkup(
  tasks: PlannerTask[],
): TelegramReplyMarkup | undefined {
  const meaningfulTasks = tasks.filter((task) => task.title.trim().length > 0);
  const buttons: NonNullable<TelegramReplyMarkup["inline_keyboard"]> =
    [];

  meaningfulTasks.slice(0, 20).forEach((task, index) => {
    const rowIndex = Math.floor(index / 5);

    if (!buttons[rowIndex]) {
      buttons[rowIndex] = [];
    }

    buttons[rowIndex].push({
      text: `${task.completed ? "↩" : "✓"} ${index + 1}`,
      callback_data: `pt:${task.id}`,
    });
  });

  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (appBaseUrl) {
    buttons.push([
      {
        text: "Открыть в Quietly",
        url: `${appBaseUrl.replace(/\/$/, "")}/planner`,
      },
    ]);
  }

  return buttons.length > 0 ? { inline_keyboard: buttons } : undefined;
}

export function getPlannerTelegramChecklist(dateKey: string, tasks: PlannerTask[]) {
  const meaningfulTasks = tasks
    .filter((task) => task.title.trim().length > 0)
    .slice(0, 30);

  if (meaningfulTasks.length === 0) {
    return null;
  }

  return {
    title: `План на ${getPlannerDateLabel(dateKey)}`,
    tasks: meaningfulTasks.map((task, index) => ({
      id: index + 1,
      text: task.title.slice(0, 100),
    })),
  };
}

export function getPlannerTelegramChecklistTaskIds(tasks: PlannerTask[]) {
  return tasks
    .filter((task) => task.title.trim().length > 0)
    .slice(0, 30)
    .map((task) => task.id);
}
