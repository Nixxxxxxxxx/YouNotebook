(function () {
  const helpers = globalThis.QuietlyAdapterHelpers;

  function getPinId(url) {
    return url.match(/\/pin\/([^/?#]+)/i)?.[1] || null;
  }

  const pinterestAdapter = {
    source: "pinterest",
    isSupportedPage() {
      return /(^|\.)pinterest\./i.test(window.location.hostname);
    },
    scanVisibleCandidates() {
      const anchors = Array.from(document.querySelectorAll("a[href*='/pin/']"));
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
          return helpers.makeCandidate({
            canonicalUrl: sourceUrl,
            imageUrl,
            source: "pinterest",
            sourceItemId: getPinId(sourceUrl),
            sourceUrl,
            thumbnailUrl: imageUrl,
            title
          });
        })
        .filter(Boolean);

      return helpers.uniqueBySourceUrl(candidates);
    },
    getCandidateElement(candidateId) {
      const candidate = this.scanVisibleCandidates().find(
        (item) => item.id === candidateId
      );

      if (!candidate) return null;

      const anchor = Array.from(document.querySelectorAll("a[href*='/pin/']")).find(
        (element) => helpers.absoluteUrl(element.href) === candidate.sourceUrl
      );

      return anchor ? helpers.closestCard(anchor) : null;
    }
  };

  globalThis.QuietlyReferenceAdapters =
    globalThis.QuietlyReferenceAdapters || [];
  globalThis.QuietlyReferenceAdapters.push(pinterestAdapter);
})();
