import {
  createHtmlSnapshot,
  escapeHtml,
  findFirstUrl,
  type ReaderSnapshot,
} from "@/lib/thoughts/reader";

import type { TelegramMessage, TelegramMessageEntity } from "./types";

type NormalizedEntity = TelegramMessageEntity & {
  end: number;
  id: number;
};

type TelegramLink = {
  label: string;
  url: string;
};

type TelegramReaderResult = {
  attachedLinks: TelegramLink[];
  hasRichFormatting: boolean;
  snapshot: ReaderSnapshot;
  shouldUseSnapshot: boolean;
  text: string;
};

const RICH_ENTITY_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "pre",
  "text_link",
  "spoiler",
  "blockquote",
  "expandable_blockquote",
]);

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function normalizeUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(`https://${url}`).toString();
    } catch {
      return null;
    }
  }
}

function getMessageTextAndEntities(message: TelegramMessage) {
  if (message.text !== undefined) {
    return {
      entities: message.entities ?? [],
      text: message.text,
    };
  }

  return {
    entities: message.caption_entities ?? [],
    text: message.caption ?? "",
  };
}

function normalizeEntities(
  text: string,
  entities: TelegramMessageEntity[],
): NormalizedEntity[] {
  return entities
    .map((entity, id) => ({
      ...entity,
      end: entity.offset + entity.length,
      id,
    }))
    .filter(
      (entity) =>
        entity.offset >= 0 &&
        entity.length > 0 &&
        entity.end <= text.length,
    )
    .sort((current, next) => {
      if (current.offset !== next.offset) {
        return current.offset - next.offset;
      }

      return next.end - current.end;
    });
}

function wrapEntity(entity: NormalizedEntity, html: string, rawText: string) {
  switch (entity.type) {
    case "bold":
      return `<strong>${html}</strong>`;
    case "italic":
      return `<em>${html}</em>`;
    case "underline":
      return `<u>${html}</u>`;
    case "strikethrough":
      return `<s>${html}</s>`;
    case "code":
      return `<code>${html}</code>`;
    case "pre":
      return `<pre><code>${html}</code></pre>`;
    case "text_link": {
      const url = normalizeUrl(entity.url);

      return url ? `<a href="${escapeAttribute(url)}">${html}</a>` : html;
    }
    case "url": {
      const url = normalizeUrl(rawText);

      return url ? `<a href="${escapeAttribute(url)}">${html}</a>` : html;
    }
    case "email": {
      const url = normalizeUrl(`mailto:${rawText}`);

      return url ? `<a href="${escapeAttribute(url)}">${html}</a>` : html;
    }
    case "blockquote":
    case "expandable_blockquote":
      return `<blockquote>${html}</blockquote>`;
    default:
      return html;
  }
}

function renderRange(
  text: string,
  entities: NormalizedEntity[],
  start: number,
  end: number,
  skipIds = new Set<number>(),
): string {
  let cursor = start;
  let html = "";
  const children = entities.filter(
    (entity) =>
      !skipIds.has(entity.id) &&
      entity.offset >= start &&
      entity.end <= end,
  );

  for (const entity of children) {
    if (entity.offset < cursor || entity.end > end) {
      continue;
    }

    const sameRangeEntities = children.filter(
      (child) => child.offset === entity.offset && child.end === entity.end,
    );
    const nextSkipIds = new Set([
      ...skipIds,
      ...sameRangeEntities.map((child) => child.id),
    ]);
    html += escapeHtml(text.slice(cursor, entity.offset));
    html += sameRangeEntities.reduce(
      (currentHtml, currentEntity) =>
        wrapEntity(
          currentEntity,
          currentHtml,
          text.slice(currentEntity.offset, currentEntity.end),
        ),
      renderRange(text, entities, entity.offset, entity.end, nextSkipIds),
    );
    cursor = entity.end;
  }

  html += escapeHtml(text.slice(cursor, end));

  return html;
}

function trimBlockRange(text: string, start: number, end: number) {
  let nextStart = start;
  let nextEnd = end;

  while (nextStart < nextEnd && /\s/.test(text[nextStart] ?? "")) {
    nextStart += 1;
  }

  while (nextEnd > nextStart && /\s/.test(text[nextEnd - 1] ?? "")) {
    nextEnd -= 1;
  }

  return { end: nextEnd, start: nextStart };
}

function renderTelegramTextHtml(
  text: string,
  entities: TelegramMessageEntity[],
) {
  const normalizedEntities = normalizeEntities(text, entities);
  const blocks: string[] = [];
  const separator = /\n{2,}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(text)) !== null) {
    const range = trimBlockRange(text, cursor, match.index);

    if (range.start < range.end) {
      blocks.push(
        `<p>${renderRange(
          text,
          normalizedEntities,
          range.start,
          range.end,
        ).replace(/\n/g, "<br />")}</p>`,
      );
    }

    cursor = match.index + match[0].length;
  }

  const range = trimBlockRange(text, cursor, text.length);

  if (range.start < range.end) {
    blocks.push(
      `<p>${renderRange(text, normalizedEntities, range.start, range.end).replace(
        /\n/g,
        "<br />",
      )}</p>`,
    );
  }

  return blocks.join("") || "<p></p>";
}

function collectEntityLinks(
  text: string,
  entities: TelegramMessageEntity[],
): TelegramLink[] {
  return entities.flatMap((entity) => {
    if (entity.type === "text_link") {
      const url = normalizeUrl(entity.url);

      return url
        ? [{ label: text.slice(entity.offset, entity.offset + entity.length), url }]
        : [];
    }

    if (entity.type === "url") {
      const rawUrl = text.slice(entity.offset, entity.offset + entity.length);
      const url = normalizeUrl(rawUrl);

      return url ? [{ label: rawUrl, url }] : [];
    }

    return [];
  });
}

function collectAttachedLinks(message: TelegramMessage): TelegramLink[] {
  return (message.reply_markup?.inline_keyboard ?? [])
    .flat()
    .flatMap((button) => {
      const url = normalizeUrl(button.url ?? button.web_app?.url);

      return url ? [{ label: button.text.trim() || url, url }] : [];
    });
}

function dedupeLinks(links: TelegramLink[]) {
  const seen = new Set<string>();

  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }

    seen.add(link.url);
    return true;
  });
}

function renderAttachedLinks(links: TelegramLink[]) {
  if (links.length === 0) {
    return "";
  }

  return `<section><p><strong>Ссылки из поста</strong></p><ul>${links
    .map(
      (link) =>
        `<li><a href="${escapeAttribute(link.url)}">${escapeHtml(
          link.label,
        )}</a></li>`,
    )
    .join("")}</ul></section>`;
}

function linksToText(links: TelegramLink[]) {
  if (links.length === 0) {
    return "";
  }

  return `Ссылки из поста:\n${links
    .map((link) => `- ${link.label}: ${link.url}`)
    .join("\n")}`;
}

export function createTelegramReaderSnapshot(
  message: TelegramMessage,
  { hasImage = false }: { hasImage?: boolean } = {},
): TelegramReaderResult {
  const { entities, text } = getMessageTextAndEntities(message);
  const cleanText = text.trim();
  const normalizedEntities = normalizeEntities(text, entities);
  const hasRichFormatting = normalizedEntities.some((entity) =>
    RICH_ENTITY_TYPES.has(entity.type),
  );
  const attachedLinks = dedupeLinks(collectAttachedLinks(message));
  const entityLinks = dedupeLinks(collectEntityLinks(text, entities));
  const primaryUrl =
    entityLinks[0]?.url ?? attachedLinks[0]?.url ?? findFirstUrl(cleanText);
  const fallbackText = hasImage ? "Изображение из Telegram" : "";
  const bodyText = cleanText || fallbackText;
  const attachedLinksText = linksToText(attachedLinks);
  const contentText = [bodyText, attachedLinksText].filter(Boolean).join("\n\n");
  const contentHtml = [
    cleanText
      ? renderTelegramTextHtml(text, entities)
      : `<p>${escapeHtml(fallbackText)}</p>`,
    renderAttachedLinks(attachedLinks),
  ].join("");
  const title = bodyText.split("\n").find((line) => line.trim()) ?? bodyText;
  const shouldUseSnapshot = hasRichFormatting || attachedLinks.length > 0;

  return {
    attachedLinks,
    hasRichFormatting,
    shouldUseSnapshot,
    snapshot: createHtmlSnapshot({
      contentHtml,
      contentText,
      input: contentText,
      sourceType: "telegram",
      sourceUrl: primaryUrl,
      title,
    }),
    text: bodyText,
  };
}
