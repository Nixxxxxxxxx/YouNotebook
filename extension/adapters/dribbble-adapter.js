(function () {
  const helpers = globalThis.QuietlyAdapterHelpers;

  function getShotId(url) {
    return url.match(/\/shots\/([^/?#]+)/i)?.[1] || null;
  }

  const dribbbleAdapter = {
    source: "dribbble",
    isSupportedPage() {
      return window.location.hostname === "dribbble.com";
    },
    scanVisibleCandidates() {
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
          return helpers.makeCandidate({
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
        })
        .filter(Boolean);

      return helpers.uniqueBySourceUrl(candidates);
    },
    getCandidateElement(candidateId) {
      const candidate = this.scanVisibleCandidates().find(
        (item) => item.id === candidateId
      );

      if (!candidate) return null;

      const anchor = Array.from(
        document.querySelectorAll("a[href*='/shots/']")
      ).find((element) => helpers.absoluteUrl(element.href) === candidate.sourceUrl);

      return anchor ? helpers.closestCard(anchor) : null;
    }
  };

  globalThis.QuietlyReferenceAdapters =
    globalThis.QuietlyReferenceAdapters || [];
  globalThis.QuietlyReferenceAdapters.push(dribbbleAdapter);
})();
