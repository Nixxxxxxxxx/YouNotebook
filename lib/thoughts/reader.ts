import sanitizeHtml from "sanitize-html";

import type { ThoughtSourceType } from "./types";

const TITLE_MAX_LENGTH = 120;
const DEFAULT_USER_AGENT =
  "YouNotebookThoughtStore/1.0 (+https://younotebook.local)";

const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    "article",
    "section",
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "blockquote",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "a",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noreferrer",
      target: "_blank",
    }),
  },
};

export type ReaderSnapshot = {
  title: string;
  summary: string | null;
  contentHtml: string;
  contentText: string;
  rawInput: string;
  sourceUrl: string | null;
  sourceType: ThoughtSourceType;
  imageUrl: string | null;
  faviconUrl: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeTitle(value: string | null | undefined, fallback: string) {
  const title = value?.replace(/\s+/g, " ").trim() || fallback;

  return title.length > TITLE_MAX_LENGTH
    ? `${title.slice(0, TITLE_MAX_LENGTH - 3)}...`
    : title;
}

function textToHtml(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "<p></p>";
  }

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function textSummary(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();

  if (!compact) {
    return null;
  }

  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function absoluteUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function findFirstUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);

  if (!match) {
    return null;
  }

  try {
    return new URL(match[0]).toString();
  } catch {
    return null;
  }
}

export function createTextSnapshot(
  input: string,
  sourceType: ThoughtSourceType = "manual",
): ReaderSnapshot {
  const normalized = input.trim();
  const firstLine = normalized.split("\n").find((line) => line.trim());
  const title = normalizeTitle(firstLine, "Новая мысль");
  const contentHtml = sanitizeHtml(textToHtml(normalized), sanitizeOptions);

  return {
    title,
    summary: textSummary(normalized),
    contentHtml,
    contentText: normalized,
    rawInput: input,
    sourceUrl: findFirstUrl(input),
    sourceType,
    imageUrl: null,
    faviconUrl: null,
  };
}

export async function createReaderSnapshot(
  input: string,
  sourceType: ThoughtSourceType = "manual",
): Promise<ReaderSnapshot> {
  const sourceUrl = findFirstUrl(input);

  if (!sourceUrl) {
    return createTextSnapshot(input, sourceType);
  }

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "user-agent": process.env.READABILITY_USER_AGENT || DEFAULT_USER_AGENT,
      },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(12000),
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.includes("text/html")) {
      return {
        ...createTextSnapshot(input, sourceType),
        sourceUrl,
        sourceType: sourceType === "manual" ? "url" : sourceType,
      };
    }

    const [{ Readability }, { JSDOM }] = await Promise.all([
      import("@mozilla/readability"),
      import("jsdom"),
    ]);
    const html = await response.text();
    const dom = new JSDOM(html, { url: sourceUrl });
    const document = dom.window.document;
    const meta = (selector: string) =>
      document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ||
      null;
    const imageUrl = absoluteUrl(
      meta('meta[property="og:image"]') ||
        meta('meta[name="twitter:image"]') ||
        document.querySelector<HTMLImageElement>("article img, main img, img")
          ?.src,
      sourceUrl,
    );
    const faviconUrl = absoluteUrl(
      document.querySelector<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
      )?.href,
      sourceUrl,
    );
    const reader = new Readability(document).parse();

    if (!reader) {
      return {
        ...createTextSnapshot(input, sourceType),
        sourceUrl,
        sourceType: sourceType === "manual" ? "url" : sourceType,
        imageUrl,
        faviconUrl,
      };
    }

    const contentHtml = sanitizeHtml(reader.content ?? "", sanitizeOptions);
    const contentText = (reader.textContent ?? "").trim();
    const title = normalizeTitle(
      reader.title || meta('meta[property="og:title"]') || document.title,
      new URL(sourceUrl).hostname,
    );

    return {
      title,
      summary:
        textSummary(reader.excerpt || "") ||
        textSummary(contentText) ||
        textSummary(input),
      contentHtml,
      contentText,
      rawInput: input,
      sourceUrl,
      sourceType: sourceType === "manual" ? "url" : sourceType,
      imageUrl,
      faviconUrl,
    };
  } catch {
    return {
      ...createTextSnapshot(input, sourceType),
      sourceUrl,
      sourceType: sourceType === "manual" ? "url" : sourceType,
    };
  }
}
