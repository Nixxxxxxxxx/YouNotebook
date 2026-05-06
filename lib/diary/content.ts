import type { DiaryContent } from "./types";

export const EMPTY_CONTENT: DiaryContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
    },
  ],
};

export const WELCOME_CONTENT: DiaryContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Мы работаем над собой" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Это твой тихий личный дневник. Он живет локально, сохраняется сам и не требует профилей.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Начни с первой честной строки. Всё остальное приложение аккуратно подержит.",
        },
      ],
    },
  ],
};

export function cloneContent(content: DiaryContent): DiaryContent {
  return JSON.parse(JSON.stringify(content)) as DiaryContent;
}

export function deriveTitle(plainText: string) {
  const firstLine = plainText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Новая заметка";
  }

  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

export function normalizePlainText(plainText: string) {
  return plainText.replace(/\s+\n/g, "\n").trim();
}

