import type {
  PlannerVoiceProvider,
  PlannerVoiceUsageSummary,
} from "@/lib/planner/types";

const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_CLOUDFLARE_MODEL = "@cf/openai/whisper";
const DEFAULT_CLOUDFLARE_FREE_NEURONS_PER_DAY = 10_000;
const DEFAULT_CLOUDFLARE_WHISPER_NEURONS_PER_MINUTE = 41.14;
const TRANSCRIPTION_PROMPT =
  "Пользователь надиктовывает короткий список задач для личного планировщика Quietly. Сохраняй русский язык, названия, даты и смысл. Не добавляй пояснения.";

type PlannerVoiceUsageStats = {
  requestsToday: number;
  totalSecondsToday: number;
  userSecondsToday: number;
};

function getNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getTranscriptionProvider(): PlannerVoiceProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase();

  if (provider === "openai" || provider === "cloudflare") {
    return provider;
  }

  return process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
    ? "cloudflare"
    : "openai";
}

function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return apiKey;
}

function getTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
}

export function getPlannerVoiceProviderInfo() {
  const provider = getTranscriptionProvider();

  if (provider === "cloudflare") {
    const freeNeuronsPerDay = getNumberEnv(
      "CLOUDFLARE_FREE_NEURONS_PER_DAY",
      DEFAULT_CLOUDFLARE_FREE_NEURONS_PER_DAY,
    );
    const neuronsPerMinute = getNumberEnv(
      "CLOUDFLARE_WHISPER_NEURONS_PER_MINUTE",
      DEFAULT_CLOUDFLARE_WHISPER_NEURONS_PER_MINUTE,
    );

    return {
      dailyLimitSeconds: Math.floor((freeNeuronsPerDay / neuronsPerMinute) * 60),
      isConfigured: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
      ),
      model: process.env.CLOUDFLARE_TRANSCRIPTION_MODEL || DEFAULT_CLOUDFLARE_MODEL,
      provider,
      providerLabel: "Cloudflare Whisper",
    };
  }

  return {
    dailyLimitSeconds: getNumberEnv("OPENAI_TRANSCRIPTION_FREE_SECONDS_DAY", 0),
    isConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: getTranscriptionModel(),
    provider,
    providerLabel: "OpenAI",
  };
}

export function getPlannerVoiceNextResetAt() {
  const resetAt = new Date();

  resetAt.setUTCHours(24, 0, 0, 0);

  return resetAt.toISOString();
}

export function getPlannerVoiceUsageSummary(
  stats: PlannerVoiceUsageStats,
): PlannerVoiceUsageSummary {
  const providerInfo = getPlannerVoiceProviderInfo();
  const progress =
    providerInfo.dailyLimitSeconds > 0
      ? Math.min(1, stats.totalSecondsToday / providerInfo.dailyLimitSeconds)
      : 0;

  return {
    dailyLimitSeconds: providerInfo.dailyLimitSeconds,
    model: providerInfo.model,
    nextResetAt: getPlannerVoiceNextResetAt(),
    progress,
    provider: providerInfo.provider,
    providerLabel: providerInfo.providerLabel,
    requestsToday: stats.requestsToday,
    totalSecondsToday: stats.totalSecondsToday,
    userSecondsToday: stats.userSecondsToday,
  };
}

function getCloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("Cloudflare transcription is not configured");
  }

  return {
    accountId,
    apiToken,
    model: process.env.CLOUDFLARE_TRANSCRIPTION_MODEL || DEFAULT_CLOUDFLARE_MODEL,
  };
}

function getAudioFileName(contentType: string) {
  if (contentType.includes("ogg")) {
    return "voice.ogg";
  }

  if (contentType.includes("webm")) {
    return "voice.webm";
  }

  if (contentType.includes("mp4")) {
    return "voice.mp4";
  }

  if (contentType.includes("mpeg")) {
    return "voice.mp3";
  }

  return "voice.m4a";
}

export async function transcribePlannerAudio(
  audio: Blob,
  options: { fileName?: string } = {},
) {
  if (getTranscriptionProvider() === "cloudflare") {
    return transcribeWithCloudflare(audio);
  }

  return transcribeWithOpenAi(audio, options);
}

async function transcribeWithCloudflare(audio: Blob) {
  const { accountId, apiToken, model } = getCloudflareConfig();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      body: await audio.arrayBuffer(),
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": audio.type || "application/octet-stream",
      },
      method: "POST",
    },
  );
  const data = (await response.json()) as {
    errors?: Array<{ message?: string }>;
    result?: {
      text?: string;
    };
    success?: boolean;
  };

  if (!response.ok || data.success === false) {
    throw new Error(
      data.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
        "Cloudflare transcription failed",
    );
  }

  return (data.result?.text ?? "").trim();
}

async function transcribeWithOpenAi(
  audio: Blob,
  options: { fileName?: string } = {},
) {
  const formData = new FormData();
  const fileName =
    options.fileName || getAudioFileName(audio.type || "audio/mpeg");

  formData.set("file", audio, fileName);
  formData.set("model", getTranscriptionModel());
  formData.set("response_format", "text");
  formData.set("prompt", TRANSCRIPTION_PROMPT);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    body: formData,
    headers: {
      authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    method: "POST",
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(errorText || "Audio transcription failed");
  }

  return (await response.text()).trim();
}
