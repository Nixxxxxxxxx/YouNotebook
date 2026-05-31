import type { TelegramChat } from "./types";

type TelegramBotKind = "planner" | "thoughts";

function getBotToken(kind: TelegramBotKind = "thoughts") {
  const envName =
    kind === "planner" ? "PLANNER_TELEGRAM_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN";
  const token = process.env[envName];

  if (!token) {
    throw new Error(`${envName} is not configured`);
  }

  return token;
}

async function callTelegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
  bot: TelegramBotKind = "thoughts",
) {
  const response = await fetch(
    `https://api.telegram.org/bot${getBotToken(bot)}/${method}`,
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

export function isPlannerTelegramWebhookSecretValid(request: Request) {
  const expected = process.env.PLANNER_TELEGRAM_WEBHOOK_SECRET;

  if (!expected) {
    return false;
  }

  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options: Record<string, unknown> = {},
) {
  return callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

export async function sendPlannerTelegramMessage(
  chatId: number,
  text: string,
  options: Record<string, unknown> = {},
) {
  return callTelegramApi(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...options,
    },
    "planner",
  );
}

export async function sendPlannerTelegramChecklist(
  businessConnectionId: string,
  chatId: number,
  checklist: Record<string, unknown>,
  options: Record<string, unknown> = {},
) {
  return callTelegramApi<{
    ok: boolean;
    result?: {
      message_id: number;
    };
  }>(
    "sendChecklist",
    {
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      checklist,
      ...options,
    },
    "planner",
  );
}

export async function editPlannerTelegramMessageText(
  chatId: number,
  messageId: number,
  text: string,
  options: Record<string, unknown> = {},
) {
  return callTelegramApi(
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      ...options,
    },
    "planner",
  );
}

export async function answerPlannerTelegramCallbackQuery(
  callbackQueryId: string,
  options: Record<string, unknown> = {},
) {
  return callTelegramApi(
    "answerCallbackQuery",
    {
      callback_query_id: callbackQueryId,
      ...options,
    },
    "planner",
  );
}

export async function getTelegramFile(
  fileId: string,
  bot: TelegramBotKind = "thoughts",
) {
  const data = await callTelegramApi<TelegramFileResponse>(
    "getFile",
    {
      file_id: fileId,
    },
    bot,
  );

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

export async function fetchTelegramFile(
  fileId: string,
  bot: TelegramBotKind = "thoughts",
) {
  const file = await getTelegramFile(fileId, bot);
  const response = await fetch(
    `https://api.telegram.org/file/bot${getBotToken(bot)}/${file.file_path}`,
  );

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }

  return response;
}

export async function fetchPlannerTelegramFile(fileId: string) {
  return fetchTelegramFile(fileId, "planner");
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

export async function setPlannerTelegramWebhook(webhookUrl: string) {
  const secretToken = process.env.PLANNER_TELEGRAM_WEBHOOK_SECRET;

  if (!secretToken) {
    throw new Error("PLANNER_TELEGRAM_WEBHOOK_SECRET is not configured");
  }

  return callTelegramApi(
    "setWebhook",
    {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: [
        "business_connection",
        "business_message",
        "callback_query",
        "edited_business_message",
        "message",
      ],
    },
    "planner",
  );
}
