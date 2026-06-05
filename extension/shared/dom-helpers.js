(function () {
  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(value, baseUrl = window.location.href) {
    if (!value) return null;

    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return null;
    }
  }

  function sourceDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return window.location.hostname.replace(/^www\./, "");
    }
  }

  function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  }

  function isElementVisible(element) {
    if (!element || !(element instanceof HTMLElement)) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width >= 72 &&
      rect.height >= 72 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0
    );
  }

  function closestCard(element) {
    return (
      element.closest(
        "article, li, [role='listitem'], [data-test-id], [data-testid], .shot-thumbnail, .pin, .block, div"
      ) || element
    );
  }

  function getImageUrl(element) {
    const image = element.querySelector("img");
    const src =
      image?.currentSrc ||
      image?.src ||
      image?.getAttribute("src") ||
      image?.getAttribute("data-src");

    return absoluteUrl(src);
  }

  function getImageAlt(element) {
    return normalizeText(element.querySelector("img")?.alt || "");
  }

  function getVisibleTitle(element, fallback = "") {
    const titleElement = element.querySelector(
      "h1, h2, h3, [data-test-id*='title'], [data-testid*='title'], [title], figcaption"
    );
    const title =
      titleElement?.getAttribute("title") ||
      titleElement?.textContent ||
      getImageAlt(element) ||
      fallback;

    return normalizeText(title);
  }

  function uniqueBySourceUrl(candidates) {
    const seen = new Set();

    return candidates.filter((candidate) => {
      if (seen.has(candidate.sourceUrl)) return false;
      seen.add(candidate.sourceUrl);
      return true;
    });
  }

  function makeCandidate({
    authorName,
    authorUrl,
    canonicalUrl,
    description,
    imageUrl,
    source,
    sourceItemId,
    sourceUrl,
    thumbnailUrl,
    title
  }) {
    const url = canonicalUrl || sourceUrl;
    const normalizedUrl = absoluteUrl(url);

    if (!normalizedUrl) return null;

    return {
      authorName: normalizeText(authorName),
      authorUrl: absoluteUrl(authorUrl),
      canonicalUrl: normalizedUrl,
      capturedAt: new Date().toISOString(),
      description: normalizeText(description),
      id: `${source}:${sourceItemId || hashString(normalizedUrl)}`,
      imageUrl: absoluteUrl(imageUrl),
      source,
      sourceDomain: sourceDomain(normalizedUrl),
      sourceItemId: sourceItemId || null,
      sourceUrl: absoluteUrl(sourceUrl) || normalizedUrl,
      thumbnailUrl: absoluteUrl(thumbnailUrl || imageUrl),
      title: normalizeText(title)
    };
  }

  globalThis.QuietlyAdapterHelpers = {
    absoluteUrl,
    closestCard,
    getImageAlt,
    getImageUrl,
    getVisibleTitle,
    hashString,
    isElementVisible,
    makeCandidate,
    normalizeText,
    sourceDomain,
    uniqueBySourceUrl
  };
})();
