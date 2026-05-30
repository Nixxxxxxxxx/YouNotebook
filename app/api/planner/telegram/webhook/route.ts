import { NextResponse } from "next/server";

import {
  beginPlannerTelegramUpdate,
  createPlannerTasks,
  finishPlannerTelegramUpdate,
  getPlannerTask,
  getPlannerTelegramLinkByTelegramUserId,
  listPlannerTasksByDate,
  updatePlannerTask,
  upsertPlannerTelegramLink,
} from "@/lib/planner/repository";
import {
  getMoscowDateKey,
  getPlannerTelegramReplyMarkup,
  parsePlannerTaskMessage,
  renderPlannerTelegramList,
} from "@/lib/planner/telegram";
import {
  answerPlannerTelegramCallbackQuery,
  editPlannerTelegramMessageText,
  isPlannerTelegramWebhookSecretValid,
  sendPlannerTelegramMessage,
} from "@/lib/telegram/client";
import type { TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCommand(message: TelegramMessage) {
  const text = message.text?.trim() ?? "";
  const [command] = text.split(/\s+/);

  return command?.split("@")[0].toLowerCase() ?? "";
}

async function getPlannerUserId(telegramUserId: number, chatId: number) {
  const link = await getPlannerTelegramLinkByTelegramUserId(telegramUserId);

  if (!link) {
    return null;
  }

  await upsertPlannerTelegramLink(link.userId, telegramUserId, chatId);

  return link.userId;
}

async function sendTaskList(userId: string, chatId: number, dateKey: string) {
  const tasks = await listPlannerTasksByDate(userId, dateKey);

  await sendPlannerTelegramMessage(
    chatId,
    renderPlannerTelegramList(dateKey, tasks),
    {
      reply_markup: getPlannerTelegramReplyMarkup(tasks),
    },
  );
}

async function handleCallback(update: TelegramUpdate) {
  const callback = update.callback_query;

  if (!callback) {
    return false;
  }

  const data = callback.data ?? "";

  if (!data.startsWith("pt:")) {
    await answerPlannerTelegramCallbackQuery(callback.id);
    return true;
  }

  const chatId = callback.message?.chat.id ?? callback.from.id;
  const userId = await getPlannerUserId(callback.from.id, chatId);

  if (!userId) {
    await answerPlannerTelegramCallbackQuery(callback.id, {
      text: "Сначала подключи Telegram в профиле Quietly.",
      show_alert: true,
    });
    return true;
  }

  const taskId = data.slice(3);
  const task = await getPlannerTask(userId, taskId);

  if (!task) {
    await answerPlannerTelegramCallbackQuery(callback.id, {
      text: "Задача уже не найдена.",
    });
    return true;
  }

  const updatedTask = await updatePlannerTask(userId, taskId, {
    completed: !task.completed,
  });

  if (!updatedTask) {
    await answerPlannerTelegramCallbackQuery(callback.id, {
      text: "Не получилось обновить задачу.",
    });
    return true;
  }

  const tasks = await listPlannerTasksByDate(userId, updatedTask.date);
  const text = renderPlannerTelegramList(updatedTask.date, tasks);
  const replyMarkup = getPlannerTelegramReplyMarkup(tasks);

  await answerPlannerTelegramCallbackQuery(callback.id, {
    text: updatedTask.completed ? "Закрыл задачу" : "Вернул в работу",
  });

  if (callback.message) {
    try {
      await editPlannerTelegramMessageText(
        callback.message.chat.id,
        callback.message.message_id,
        text,
        { reply_markup: replyMarkup },
      );
    } catch {
      await sendPlannerTelegramMessage(callback.message.chat.id, text, {
        reply_markup: replyMarkup,
      });
    }
  }

  return true;
}

async function handleMessage(message: TelegramMessage) {
  const telegramUserId = message.from?.id;

  if (!telegramUserId) {
    return;
  }

  const userId = await getPlannerUserId(telegramUserId, message.chat.id);

  if (!userId) {
    await sendPlannerTelegramMessage(
      message.chat.id,
      "Я готов вести задачи, но сначала подключи этот Telegram ID в профиле Quietly, а потом вернись сюда и нажми /start.",
    );
    return;
  }

  const command = getCommand(message);

  if (command === "/start") {
    await sendPlannerTelegramMessage(
      message.chat.id,
      "Подключил планировщик. Присылай задачи обычным списком, каждую с новой строки. Без тире, без ритуалов.",
    );
    await sendTaskList(userId, message.chat.id, getMoscowDateKey());
    return;
  }

  if (command === "/today" || command === "/plan") {
    await sendTaskList(userId, message.chat.id, getMoscowDateKey());
    return;
  }

  if (command === "/tomorrow") {
    await sendTaskList(userId, message.chat.id, getMoscowDateKey(1));
    return;
  }

  const text = message.text ?? message.caption ?? "";
  const inputs = parsePlannerTaskMessage(text);

  if (inputs.length === 0) {
    await sendPlannerTelegramMessage(
      message.chat.id,
      "Пришли задачи строками, например:\n\nПозвонить\nСобрать презентацию\nПочитать 20 минут",
    );
    return;
  }

  const createdTasks = await createPlannerTasks(userId, inputs);
  const touchedDates = Array.from(new Set(createdTasks.map((task) => task.date)));

  await sendPlannerTelegramMessage(
    message.chat.id,
    `Сложил задач: ${createdTasks.length}.`,
  );

  for (const dateKey of touchedDates) {
    await sendTaskList(userId, message.chat.id, dateKey);
  }
}

export async function POST(request: Request) {
  if (!isPlannerTelegramWebhookSecretValid(request)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const isNewUpdate = await beginPlannerTelegramUpdate(update.update_id, update);

  if (!isNewUpdate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const handledCallback = await handleCallback(update);

    if (!handledCallback && update.message) {
      await handleMessage(update.message);
    }

    await finishPlannerTelegramUpdate(
      update.update_id,
      handledCallback || update.message ? "processed" : "ignored",
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await finishPlannerTelegramUpdate(
      update.update_id,
      "error",
      error instanceof Error ? error.message : "Unknown error",
    );

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
