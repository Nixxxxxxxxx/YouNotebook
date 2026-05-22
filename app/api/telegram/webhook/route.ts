import { NextResponse } from "next/server";

import {
  beginTelegramUpdate,
  createThought,
  finishTelegramUpdate,
} from "@/lib/thoughts/repository";
import {
  getTelegramAllowedUserIds,
  isTelegramWebhookSecretValid,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import type { TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMessage(update: TelegramUpdate): TelegramMessage | null {
  return (
    update.message ??
    update.edited_message ??
    update.channel_post ??
    update.edited_channel_post ??
    null
  );
}

function getMessageText(message: TelegramMessage) {
  return message.text?.trim() || message.caption?.trim() || "";
}

function getTelegramImageUrl(message: TelegramMessage) {
  const photo = [...(message.photo ?? [])].sort((current, next) => {
    const currentWeight = current.file_size ?? current.width * current.height;
    const nextWeight = next.file_size ?? next.width * next.height;

    return nextWeight - currentWeight;
  })[0];
  const imageFileId =
    photo?.file_id ??
    (message.document?.mime_type?.startsWith("image/")
      ? message.document.file_id
      : null);

  return imageFileId
    ? `/api/telegram/file/${encodeURIComponent(imageFileId)}`
    : null;
}

export async function POST(request: Request) {
  if (!isTelegramWebhookSecretValid(request)) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const isNewUpdate = await beginTelegramUpdate(update.update_id, update);

  if (!isNewUpdate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const message = getMessage(update);

  if (!message) {
    await finishTelegramUpdate(update.update_id, "ignored");
    return NextResponse.json({ ok: true, ignored: true });
  }

  const userId = message.from?.id;
  const allowedUserIds = getTelegramAllowedUserIds();

  if (!userId || !allowedUserIds.has(userId)) {
    await finishTelegramUpdate(update.update_id, "ignored");
    await sendTelegramMessage(
      message.chat.id,
      "Я пока принимаю мысли только от владельца склада.",
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  const imageUrl = getTelegramImageUrl(message);
  const text = getMessageText(message) || (imageUrl ? "Изображение из Telegram" : "");

  if (!text) {
    await finishTelegramUpdate(update.update_id, "ignored");
    await sendTelegramMessage(
      message.chat.id,
      "Поймал сообщение, но в нем нет текста или ссылки, которую можно сложить.",
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const thought = await createThought({
      input: text,
      sourceType: "telegram",
      imageUrl,
      telegramChatId: message.chat.id,
      telegramMessageId: message.message_id,
      telegramUserId: userId,
    });

    await finishTelegramUpdate(update.update_id, "processed");
    await sendTelegramMessage(
      message.chat.id,
      `Поймал. Скинул во Входящие: ${thought.title}`,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    await finishTelegramUpdate(
      update.update_id,
      "error",
      error instanceof Error ? error.message : "Unknown error",
    );
    await sendTelegramMessage(
      message.chat.id,
      "Не смог сохранить мысль. Я рядом, но база сейчас капризничает.",
    );

    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
