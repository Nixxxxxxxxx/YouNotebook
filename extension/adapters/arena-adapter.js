(function () {
  const helpers = globalThis.QuietlyAdapterHelpers;
  const elementById = new Map();

  function getBlockId(url) {
    return (
      url.match(/\/blocks?\/([^/?#]+)/i)?.[1] ||
      url.match(/\/channels\/[^/?#]+\/([^/?#]+)/i)?.[1] ||
      null
    );
  }

  const arenaAdapter = {
    source: "arena",
    isSupportedPage() {
      return /(^|\.)are\.na$/i.test(window.location.hostname);
    },
    scanVisibleCandidates() {
      elementById.clear();

      const anchors = Array.from(
        document.querySelectorAll("a[href*='/block'], a[href*='/channels/']")
      );
      const candidates = anchors
        .map((anchor) => {
          const sourceUrl = helpers.absoluteUrl(anchor.href);

          if (!sourceUrl || !helpers.isElementVisible(anchor)) return null;

          const card = helpers.closestCard(anchor);

          if (!helpers.isElementVisible(card)) return null;

          const title =
            helpers.getVisibleTitle(card, anchor.textContent) ||
            helpers.getVisibleTitle(document.body, "Are.na reference");
          const imageUrl = helpers.getImageUrl(card);

          // Are.na cards vary between block cards and channel block links.
          // We only use visible anchor/card metadata, no background API scraping.
          const candidate = helpers.makeCandidate({
            canonicalUrl: sourceUrl,
            imageUrl,
            source: "arena",
            sourceItemId: getBlockId(sourceUrl),
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
  globalThis.QuietlyReferenceAdapters.push(arenaAdapter);
})();
