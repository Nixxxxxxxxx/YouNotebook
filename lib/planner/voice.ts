const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const TRANSCRIPTION_PROMPT =
  "Пользователь надиктовывает короткий список задач для личного планировщика Quietly. Сохраняй русский язык, названия, даты и смысл. Не добавляй пояснения.";

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
