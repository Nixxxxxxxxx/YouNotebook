import type { TelegramChat } from "./types";

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  return token;
}

async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(
    `https://api.telegram.org/bot${getBotToken()}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = (await response.json()) as T & {
    ok?: boolean;
    description?: string;
  };

  if (!response.ok || data.ok === false) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }

  return data;
}

type TelegramFileResponse = {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id?: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
};

type TelegramChatResponse = {
  ok: boolean;
  result?: TelegramChat;
  description?: string;
};

export function getTelegramAllowedUserIds() {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id)),
  );
}

export function isTelegramWebhookSecretValid(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    return false;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

export async function sendTelegramMessage(chatId: number, text: string) {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export async function getTelegramFile(fileId: string) {
  const data = await callTelegramApi<TelegramFileResponse>("getFile", {
    file_id: fileId,
  });

  if (!data.result?.file_path) {
    throw new Error("Telegram file path is missing");
  }

  return data.result;
}

export async function getTelegramChat(chatId: string | number) {
  const data = await callTelegramApi<TelegramChatResponse>("getChat", {
    chat_id: chatId,
  });

  if (!data.result) {
    throw new Error("Telegram chat is missing");
  }

  return data.result;
}

export async function fetchTelegramFile(fileId: string) {
  const file = await getTelegramFile(fileId);
  const response = await fetch(
    `https://api.telegram.org/file/bot${getBotToken()}/${file.file_path}`,
  );

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  return response;
}

export async function setTelegramWebhook(webhookUrl: string) {
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!secretToken) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is not configured");
  }

  return callTelegramApi("setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message", "edited_message", "channel_post"],
  });
}
