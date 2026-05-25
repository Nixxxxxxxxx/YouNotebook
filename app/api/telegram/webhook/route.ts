import { NextResponse } from "next/server";

import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  beginTelegramUpdate,
  createOrAppendTelegramThought,
  finishTelegramUpdate,
} from "@/lib/thoughts/repository";
import {
  getTelegramChat,
  getTelegramAllowedUserIds,
  isTelegramWebhookSecretValid,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { createTelegramReaderSnapshot } from "@/lib/telegram/message-reader";
import type {
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
} from "@/lib/telegram/types";

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

function getTelegramSourceChat(message: TelegramMessage) {
  const forwardedChat =
    message.forward_origin?.type === "channel"
      ? message.forward_origin.chat
      : null;

  return (
    forwardedChat ??
    message.forward_from_chat ??
    message.sender_chat ??
    (message.chat.type === "channel" ? message.chat : null)
  );
}

function getTelegramChatId(chat: TelegramChat) {
  return chat.username ? `@${chat.username}` : chat.id;
}

async function getTelegramAvatarUrl(message: TelegramMessage) {
  const sourceChat = getTelegramSourceChat(message);

  if (!sourceChat) {
    return null;
  }

  try {
    const chat = await getTelegramChat(getTelegramChatId(sourceChat));
    const avatarFileId = chat.photo?.small_file_id ?? chat.photo?.big_file_id;

    return avatarFileId
      ? `/api/telegram/file/${encodeURIComponent(avatarFileId)}`
      : null;
  } catch {
    return null;
  }
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
  const faviconUrl = await getTelegramAvatarUrl(message);
  const telegramReader = createTelegramReaderSnapshot(message, {
    hasImage: Boolean(imageUrl),
  });

  if (!telegramReader.snapshot.contentText) {
    await finishTelegramUpdate(update.update_id, "ignored");
    await sendTelegramMessage(
      message.chat.id,
      "Поймал сообщение, но в нем нет текста или ссылки, которую можно сложить.",
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const thought = await createOrAppendTelegramThought({
      input: telegramReader.snapshot.rawInput,
      sourceType: "telegram",
      faviconUrl,
      imageUrl,
      imageUrls: imageUrl ? [imageUrl] : [],
      snapshot: telegramReader.shouldUseSnapshot
        ? {
            ...telegramReader.snapshot,
            faviconUrl,
            imageUrl,
          }
        : undefined,
      telegramChatId: message.chat.id,
      telegramMediaGroupId: message.media_group_id ?? null,
      telegramMessageId: message.message_id,
      telegramUserId: userId,
    });

    revalidateThoughtsCache();

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
