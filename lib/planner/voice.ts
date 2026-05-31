const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_CLOUDFLARE_MODEL = "@cf/openai/whisper";
const TRANSCRIPTION_PROMPT =
  "Пользователь надиктовывает короткий список задач для личного планировщика Quietly. Сохраняй русский язык, названия, даты и смысл. Не добавляй пояснения.";

function getTranscriptionProvider() {
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
