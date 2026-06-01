import { NextResponse } from "next/server";

import {
  consumeTelegramLinkToken,
  getUserByTelegramUserId,
} from "@/lib/auth/repository";
import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  beginTelegramUpdate,
  createOrAppendTelegramThought,
  finishTelegramUpdate,
} from "@/lib/thoughts/repository";
import {
  getTelegramChat,
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

function getCommand(message: TelegramMessage) {
  const text = message.text?.trim() ?? "";
  const [command, ...args] = text.split(/\s+/);

  return {
    args,
    command: command?.split("@")[0].toLowerCase() ?? "",
  };
}

function getTelegramFileUrl(fileId: string, mediaType?: "animation") {
  const url = `/api/telegram/file/${encodeURIComponent(fileId)}`;

  return mediaType ? `${url}?media=${mediaType}` : url;
}

function getTelegramMedia(message: TelegramMessage) {
  const photo = [...(message.photo ?? [])].sort((current, next) => {
    const currentWeight = current.file_size ?? current.width * current.height;
    const nextWeight = next.file_size ?? next.width * next.height;

    return nextWeight - currentWeight;
  })[0];

  if (photo) {
    return {
      fallbackText: "Изображение из Telegram",
      url: getTelegramFileUrl(photo.file_id),
    };
  }

  if (message.animation?.file_id) {
    return {
      fallbackText: "GIF из Telegram",
      url: getTelegramFileUrl(message.animation.file_id, "animation"),
    };
  }

  if (message.document?.mime_type?.startsWith("image/")) {
    return {
      fallbackText:
        message.document.mime_type === "image/gif"
          ? "GIF из Telegram"
          : "Изображение из Telegram",
      url: getTelegramFileUrl(message.document.file_id),
    };
  }

  return null;
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
  const { args, command } = getCommand(message);

  if (userId && command === "/start") {
    const token = args[0]?.trim();

    if (token) {
      try {
        await consumeTelegramLinkToken(token, String(userId));
        await finishTelegramUpdate(update.update_id, "processed");
        await sendTelegramMessage(
          message.chat.id,
          "Готово. Telegram подключен к «Складу мыслей». Теперь просто пересылай сюда посты, ссылки, тексты или картинки — я сохраню их во Входящие.",
        );

        return NextResponse.json({ ok: true, linked: true });
      } catch (error) {
        await finishTelegramUpdate(
          update.update_id,
          "error",
          error instanceof Error ? error.message : "Telegram link failed",
        );
        await sendTelegramMessage(
          message.chat.id,
          error instanceof Error
            ? error.message
            : "Не получилось подключить Telegram. Открой профиль Quietly и нажми «Подключить Telegram» еще раз.",
        );

        return NextResponse.json({ ok: false }, { status: 400 });
      }
    }
  }

  const linkedUser = userId ? await getUserByTelegramUserId(userId) : null;

  if (!userId || !linkedUser) {
    await finishTelegramUpdate(update.update_id, "ignored");
    await sendTelegramMessage(
      message.chat.id,
      "Я пока принимаю мысли только после подключения. Открой профиль Quietly и нажми «Подключить Telegram» — после /start всё привяжется само.",
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (command === "/start") {
    await finishTelegramUpdate(update.update_id, "processed");
    await sendTelegramMessage(
      message.chat.id,
      "Telegram уже подключен к «Складу мыслей». Пересылай сюда материалы — я сложу их во Входящие.",
    );
    return NextResponse.json({ ok: true });
  }

  const telegramMedia = getTelegramMedia(message);
  const imageUrl = telegramMedia?.url ?? null;
  const faviconUrl = await getTelegramAvatarUrl(message);
  const telegramReader = createTelegramReaderSnapshot(message, {
    fallbackText: telegramMedia?.fallbackText,
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
    const thought = await createOrAppendTelegramThought(linkedUser.id, {
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

    revalidateThoughtsCache(linkedUser.id);

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
