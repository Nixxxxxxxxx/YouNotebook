(function () {
  const helpers = globalThis.QuietlyAdapterHelpers;
  const elementById = new Map();

  function getPinId(url) {
    return url.match(/\/pin\/([^/?#]+)/i)?.[1] || null;
  }

  function getMetaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content") || "";
  }

  function getCurrentPinImage() {
    const images = Array.from(document.querySelectorAll("main img, [role='main'] img, img"));

    return images
      .filter((image) => helpers.isElementVisible(image))
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();

        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function getCurrentPinElement(image) {
    return (
      image?.closest("[data-test-id], [data-testid], article, main") ||
      image?.parentElement ||
      document.querySelector("main") ||
      document.body
    );
  }

  function getCurrentPinCandidate() {
    const sourceUrl = helpers.absoluteUrl(window.location.href);
    const sourceItemId = sourceUrl ? getPinId(sourceUrl) : null;

    if (!sourceUrl || !sourceItemId) return null;

    const image = getCurrentPinImage();
    const card = getCurrentPinElement(image);
    const imageUrl =
      helpers.absoluteUrl(image?.currentSrc || image?.src || "") ||
      helpers.absoluteUrl(getMetaContent("meta[property='og:image']"));
    const title =
      helpers.getVisibleTitle(card, "") ||
      helpers.normalizeText(image?.alt || "") ||
      helpers.normalizeText(getMetaContent("meta[property='og:title']")) ||
      document.title ||
      "Pinterest pin";

    // Pin detail pages do not link to themselves, so we build one candidate
    // from the visible page/image metadata only.
    const candidate = helpers.makeCandidate({
      canonicalUrl: sourceUrl,
      imageUrl,
      source: "pinterest",
      sourceItemId,
      sourceUrl,
      thumbnailUrl: imageUrl,
      title
    });

    if (candidate && card) {
      elementById.set(candidate.id, card);
    }

    return candidate;
  }

  const pinterestAdapter = {
    source: "pinterest",
    isSupportedPage() {
      return /(^|\.)pinterest\./i.test(window.location.hostname);
    },
    scanVisibleCandidates() {
      elementById.clear();

      const anchors = Array.from(document.querySelectorAll("a[href*='/pin/']"));
      const currentPinCandidate = getCurrentPinCandidate();
      const candidates = anchors
        .map((anchor) => {
          const sourceUrl = helpers.absoluteUrl(anchor.href);

          if (!sourceUrl || !helpers.isElementVisible(anchor)) return null;

          const card = helpers.closestCard(anchor);

          if (!helpers.isElementVisible(card)) return null;

          const imageUrl = helpers.getImageUrl(card);
          const title =
            helpers.getVisibleTitle(card, anchor.getAttribute("aria-label")) ||
            helpers.getImageAlt(card) ||
            "Pinterest pin";

          // Pinterest fallback intentionally uses only visible pin card data.
          // We do not read hidden application state or auto-scroll boards.
          const candidate = helpers.makeCandidate({
            canonicalUrl: sourceUrl,
            imageUrl,
            source: "pinterest",
            sourceItemId: getPinId(sourceUrl),
            sourceUrl,
            thumbnailUrl: imageUrl,
            title
          });

          if (candidate) {
            elementById.set(candidate.id, card);
          }

          return candidate;
        })
        .filter(Boolean);

      if (currentPinCandidate) {
        candidates.unshift(currentPinCandidate);
      }

      return helpers.uniqueBySourceUrl(candidates);
    },
    getCandidateElement(candidateId) {
      return elementById.get(candidateId) || null;
    }
  };

  globalThis.QuietlyReferenceAdapters =
    globalThis.QuietlyReferenceAdapters || [];
  globalThis.QuietlyReferenceAdapters.push(pinterestAdapter);
})();
