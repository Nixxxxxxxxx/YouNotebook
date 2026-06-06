(function () {
  const helpers = globalThis.QuietlyAdapterHelpers;
  const elementById = new Map();

  function getShotId(url) {
    return url.match(/\/shots\/([^/?#]+)/i)?.[1] || null;
  }

  const dribbbleAdapter = {
    source: "dribbble",
    isSupportedPage() {
      return /(^|\.)dribbble\.com$/i.test(window.location.hostname);
    },
    scanVisibleCandidates() {
      elementById.clear();

      const anchors = Array.from(document.querySelectorAll("a[href*='/shots/']"));
      const candidates = anchors
        .map((anchor) => {
          const sourceUrl = helpers.absoluteUrl(anchor.href);

          if (!sourceUrl || !helpers.isElementVisible(anchor)) return null;

          const card = helpers.closestCard(anchor);

          if (!helpers.isElementVisible(card)) return null;

          const imageUrl = helpers.getImageUrl(card);
          const title =
            helpers.getVisibleTitle(card, anchor.textContent) || "Dribbble shot";
          const authorLink = card.querySelector("a[href^='/']");
          const authorName = helpers.normalizeText(authorLink?.textContent || "");

          // Official Dribbble API enrichment is not configured in this product.
          // MVP fallback saves only visible shot metadata and the canonical shot URL.
          const candidate = helpers.makeCandidate({
            authorName,
            authorUrl: authorLink ? helpers.absoluteUrl(authorLink.href) : null,
            canonicalUrl: sourceUrl,
            imageUrl,
            source: "dribbble",
            sourceItemId: getShotId(sourceUrl),
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

      return helpers.uniqueBySourceUrl(candidates);
    },
    getCandidateElement(candidateId) {
      return elementById.get(candidateId) || null;
    }
  };

  globalThis.QuietlyReferenceAdapters =
    globalThis.QuietlyReferenceAdapters || [];
  globalThis.QuietlyReferenceAdapters.push(dribbbleAdapter);
})();
