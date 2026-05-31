import { NextResponse } from "next/server";

import {
  beginPlannerTelegramUpdate,
  createPlannerTasks,
  finishPlannerTelegramUpdate,
  getPlannerTask,
  getPlannerTelegramLinkByBusinessConnectionId,
  getPlannerTelegramLinkByTelegramUserId,
  getPlannerTelegramLinkByUserId,
  listPlannerTaskIdsByChecklistIds,
  listPlannerTasksByDate,
  savePlannerChecklistTaskMappings,
  updatePlannerTask,
  upsertPlannerBusinessConnection,
  upsertPlannerTelegramLink,
} from "@/lib/planner/repository";
import {
  getMoscowDateKey,
  getPlannerTelegramChecklist,
  getPlannerTelegramChecklistTaskIds,
  getPlannerTelegramReplyMarkup,
  parsePlannerTaskMessage,
  renderPlannerTelegramList,
} from "@/lib/planner/telegram";
import { transcribePlannerAudio } from "@/lib/planner/voice";
import {
  answerPlannerTelegramCallbackQuery,
  editPlannerTelegramMessageText,
  fetchPlannerTelegramFile,
  isPlannerTelegramWebhookSecretValid,
  sendPlannerTelegramChecklist,
  sendPlannerTelegramMessage,
} from "@/lib/telegram/client";
import type {
  TelegramBusinessConnection,
  TelegramMessage,
  TelegramUpdate,
} from "@/lib/telegram/types";

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
  const link = await getPlannerTelegramLinkByUserId(userId);
  const checklist =
    link?.businessEnabled && link.businessConnectionId
      ? getPlannerTelegramChecklist(dateKey, tasks)
      : null;

  if (link?.businessConnectionId && checklist) {
    try {
      const result = await sendPlannerTelegramChecklist(
        link.businessConnectionId,
        link.businessUserChatId ?? link.chatId,
        checklist,
      );
      const messageId = result.result?.message_id;

      if (messageId) {
        await savePlannerChecklistTaskMappings({
          businessConnectionId: link.businessConnectionId,
          chatId: link.businessUserChatId ?? link.chatId,
          messageId,
          taskIds: getPlannerTelegramChecklistTaskIds(tasks),
        });
      }

      return;
    } catch {
      // Business checklists are best-effort; regular bot buttons remain the fallback.
    }
  }

  await sendPlannerTelegramMessage(
    chatId,
    renderPlannerTelegramList(dateKey, tasks),
    {
      reply_markup: getPlannerTelegramReplyMarkup(tasks),
    },
  );
}

async function handleBusinessConnection(connection: TelegramBusinessConnection) {
  const linkedUser = await getPlannerTelegramLinkByTelegramUserId(
    connection.user.id,
  );

  if (!linkedUser) {
    return false;
  }

  await upsertPlannerBusinessConnection({
    businessConnectionId: connection.id,
    businessEnabled: connection.is_enabled,
    businessUserChatId: connection.user_chat_id,
    telegramUserId: connection.user.id,
    userId: linkedUser.userId,
  });

  return true;
}

async function handleChecklistTasksDone(message: TelegramMessage) {
  const done = message.checklist_tasks_done;
  const checklistMessage = done?.checklist_message;
  const businessConnectionId =
    message.business_connection_id ?? checklistMessage?.business_connection_id;

  if (!done || !checklistMessage || !businessConnectionId) {
    return false;
  }

  const link = await getPlannerTelegramLinkByBusinessConnectionId(
    businessConnectionId,
  );

  if (!link) {
    return false;
  }

  const markDoneIds = await listPlannerTaskIdsByChecklistIds({
    businessConnectionId,
    chatId: message.chat.id,
    checklistMessageId: checklistMessage.message_id,
    checklistTaskIds: done.marked_as_done_task_ids ?? [],
  });
  const markNotDoneIds = await listPlannerTaskIdsByChecklistIds({
    businessConnectionId,
    chatId: message.chat.id,
    checklistMessageId: checklistMessage.message_id,
    checklistTaskIds: done.marked_as_not_done_task_ids ?? [],
  });

  await Promise.all([
    ...markDoneIds.map((taskId) =>
      updatePlannerTask(link.userId, taskId, { completed: true }),
    ),
    ...markNotDoneIds.map((taskId) =>
      updatePlannerTask(link.userId, taskId, { completed: false }),
    ),
  ]);

  return markDoneIds.length > 0 || markNotDoneIds.length > 0;
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

  if (await handleChecklistTasksDone(message)) {
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

  let text = message.text ?? message.caption ?? "";

  if (!text && message.voice?.file_id) {
    await sendPlannerTelegramMessage(message.chat.id, "Слушаю голос и разбираю в задачи...");
    const audioResponse = await fetchPlannerTelegramFile(message.voice.file_id);
    const audioBlob = await audioResponse.blob();

    text = await transcribePlannerAudio(audioBlob, {
      fileName: "telegram-voice.ogg",
    });
  }

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
    const handledBusinessConnection = update.business_connection
      ? await handleBusinessConnection(update.business_connection)
      : false;
    const handledCallback = await handleCallback(update);
    const message = update.message ?? update.business_message;

    if (!handledBusinessConnection && !handledCallback && message) {
      await handleMessage(message);
    }

    await finishPlannerTelegramUpdate(
      update.update_id,
      handledBusinessConnection || handledCallback || message
        ? "processed"
        : "ignored",
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
