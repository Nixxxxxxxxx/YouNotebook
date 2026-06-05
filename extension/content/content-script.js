(function () {
  const adapters = globalThis.QuietlyReferenceAdapters || [];
  const helpers = globalThis.QuietlyAdapterHelpers;
  const adapter = adapters.find((candidate) => candidate.isSupportedPage());

  let selectionMode = false;
  let scanTimer = null;
  let observer = null;
  let shadowHost = null;
  let shadowRoot = null;
  let lastCandidates = [];
  let panelMessage = "";
  let panelTone = "";
  const selectedCandidates = new Map();

  function ensureShadowRoot() {
    if (shadowRoot) return shadowRoot;

    shadowHost = document.createElement("div");
    shadowHost.id = "quietly-reference-selection-root";
    shadowHost.style.all = "initial";
    document.documentElement.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .layer {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          pointer-events: none;
        }

        .overlay {
          position: absolute;
          box-sizing: border-box;
          border: 1px solid rgba(125, 176, 255, 0.42);
          border-radius: 16px;
          background: rgba(125, 176, 255, 0.08);
          box-shadow: inset 0 0 0 999px rgba(8, 14, 24, 0.04);
          cursor: pointer;
          pointer-events: auto;
          transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }

        .overlay:hover,
        .overlay[data-selected="true"] {
          border-color: rgba(125, 176, 255, 0.92);
          background: rgba(125, 176, 255, 0.16);
          box-shadow:
            inset 0 0 0 999px rgba(125, 176, 255, 0.05),
            0 14px 40px rgba(0, 0, 0, 0.28);
        }

        .check {
          position: absolute;
          top: 10px;
          right: 10px;
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 999px;
          background: rgba(13, 13, 13, 0.78);
          color: white;
          font-size: 16px;
          font-weight: 800;
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(12px);
        }

        .overlay[data-selected="false"] .check::before {
          content: "";
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255, 255, 255, 0.82);
          border-radius: 4px;
        }

        .overlay[data-selected="true"] .check {
          background: linear-gradient(135deg, #9fceff 0%, #5d8bff 100%);
          color: #08101f;
        }

        .overlay[data-selected="true"] .check::before {
          content: "✓";
        }

        .panel {
          position: fixed;
          left: 50%;
          bottom: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          transform: translateX(-50%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          background: rgba(13, 13, 13, 0.86);
          padding: 10px 12px;
          color: white;
          pointer-events: auto;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(18px);
        }

        .panel strong {
          min-width: 86px;
          font-size: 13px;
        }

        .panel em {
          color: rgba(255, 255, 255, 0.72);
          font-size: 13px;
          font-style: normal;
          white-space: nowrap;
        }

        .panel em[data-tone="success"] {
          color: #9fceff;
        }

        .panel em[data-tone="error"] {
          color: #ffb29f;
        }

        .panel button {
          border: 0;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          padding: 9px 12px;
          font: inherit;
          font-size: 13px;
          cursor: pointer;
        }

        .panel button.primary {
          background: linear-gradient(135deg, #9fceff 0%, #5d8bff 100%);
          color: #07101f;
          font-weight: 750;
        }

        .panel button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
      </style>
      <div class="layer"></div>
    `;

    return shadowRoot;
  }

  function getLayer() {
    return ensureShadowRoot().querySelector(".layer");
  }

  function getSelectedCount() {
    return selectedCandidates.size;
  }

  function escapePanelText(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return replacements[character] || character;
    });
  }

  function scheduleScan() {
    if (!selectionMode || !adapter || scanTimer) return;

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      renderSelectionOverlays();
    }, 120);
  }

  function scanCandidates() {
    if (!adapter) return [];

    lastCandidates = adapter.scanVisibleCandidates().filter((candidate) => {
      const element = adapter.getCandidateElement(candidate.id);

      return element && helpers.isElementVisible(element);
    });

    return lastCandidates;
  }

  function updateSelectedCandidate(candidate) {
    if (selectedCandidates.has(candidate.id)) {
      selectedCandidates.set(candidate.id, candidate);
    }
  }

  function toggleCandidate(candidate) {
    if (selectedCandidates.has(candidate.id)) {
      selectedCandidates.delete(candidate.id);
    } else {
      selectedCandidates.set(candidate.id, candidate);
    }

    panelMessage = "";
    panelTone = "";
    renderSelectionOverlays();
  }

  function renderPanel(layer) {
    const panel = document.createElement("div");
    const count = getSelectedCount();

    panel.className = "panel";
    panel.innerHTML = `
      <strong>${count} selected</strong>
      ${panelMessage ? `<em data-tone="${panelTone}">${escapePanelText(panelMessage)}</em>` : ""}
      <button class="primary" type="button" ${count === 0 ? "disabled" : ""}>Save selected</button>
      <button type="button">Clear</button>
      <button type="button">Cancel</button>
    `;
    panel.querySelector(".primary")?.addEventListener("click", () => {
      void saveSelectedFromPanel();
    });
    panel.querySelectorAll("button")[1]?.addEventListener("click", () => {
      selectedCandidates.clear();
      panelMessage = "";
      panelTone = "";
      renderSelectionOverlays();
    });
    panel.querySelectorAll("button")[2]?.addEventListener("click", () => {
      stopSelectionMode();
    });
    layer.appendChild(panel);
  }

  function renderSelectionOverlays() {
    if (!selectionMode) return;

    const layer = getLayer();
    const candidates = scanCandidates();

    layer.replaceChildren();

    for (const candidate of candidates) {
      const element = adapter.getCandidateElement(candidate.id);

      if (!element) continue;

      updateSelectedCandidate(candidate);
      const rect = element.getBoundingClientRect();
      const overlay = document.createElement("button");

      overlay.className = "overlay";
      overlay.type = "button";
      overlay.dataset.selected = String(selectedCandidates.has(candidate.id));
      overlay.style.left = `${Math.max(0, rect.left)}px`;
      overlay.style.top = `${Math.max(0, rect.top)}px`;
      overlay.style.width = `${Math.max(0, rect.width)}px`;
      overlay.style.height = `${Math.max(0, rect.height)}px`;
      overlay.setAttribute("aria-label", `Select ${candidate.title || candidate.sourceUrl}`);
      overlay.innerHTML = `<span class="check" aria-hidden="true"></span>`;
      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCandidate(candidate);
      });
      layer.appendChild(overlay);
    }

    renderPanel(layer);
  }

  function startSelectionMode() {
    if (!adapter) {
      return {
        active: false,
        error: "Unsupported site",
        selectedCount: 0,
        supported: false
      };
    }

    selectionMode = true;
    ensureShadowRoot();
    renderSelectionOverlays();

    if (!observer) {
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    window.addEventListener("scroll", scheduleScan, true);
    window.addEventListener("resize", scheduleScan);

    return getSelectionState();
  }

  function stopSelectionMode() {
    selectionMode = false;
    selectedCandidates.clear();
    panelMessage = "";
    panelTone = "";
    shadowHost?.remove();
    shadowHost = null;
    shadowRoot = null;
    observer?.disconnect();
    observer = null;
    window.removeEventListener("scroll", scheduleScan, true);
    window.removeEventListener("resize", scheduleScan);
  }

  function getSelectionState() {
    return {
      active: selectionMode,
      candidateCount: lastCandidates.length,
      selectedCount: getSelectedCount(),
      source: adapter?.source || null,
      supported: Boolean(adapter)
    };
  }

  function getSelectedCandidates() {
    return Array.from(selectedCandidates.values());
  }

  function getSaveResultMessage(result) {
    if (!result) return "Some references could not be saved";

    if (result.failed > 0) {
      return `${result.saved} saved, ${result.failed} failed`;
    }

    if (result.duplicates > 0 && result.saved === 0) {
      return "Already saved to Inbox";
    }

    if (result.duplicates > 0) {
      return `${result.saved} saved, ${result.duplicates} already saved`;
    }

    return result.saved === 1 ? "Saved to Inbox" : `${result.saved} references saved`;
  }

  async function saveSelectedFromPanel() {
    const candidates = getSelectedCandidates();

    if (candidates.length === 0) return;

    panelMessage = "Saving...";
    panelTone = "";
    renderSelectionOverlays();

    const result = await chrome.runtime.sendMessage({
      candidates,
      type: "QUIETLY_SAVE_SELECTED_FROM_CONTENT"
    });

    if (result?.ok) {
      selectedCandidates.clear();
      panelMessage = getSaveResultMessage(result.result);
      panelTone = result.result?.failed > 0 ? "error" : "success";
      renderSelectionOverlays();
      window.setTimeout(() => {
        panelMessage = "";
        panelTone = "";
        renderSelectionOverlays();
      }, 1200);
    } else {
      panelMessage = result?.error || "Some references could not be saved";
      panelTone = "error";
      renderSelectionOverlays();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "QUIETLY_GET_SELECTION_STATE") {
      sendResponse(getSelectionState());
      return false;
    }

    if (message?.type === "QUIETLY_START_SELECTION") {
      sendResponse(startSelectionMode());
      return false;
    }

    if (message?.type === "QUIETLY_CANCEL_SELECTION") {
      stopSelectionMode();
      sendResponse(getSelectionState());
      return false;
    }

    if (message?.type === "QUIETLY_CLEAR_SELECTION") {
      selectedCandidates.clear();
      panelMessage = "";
      panelTone = "";
      renderSelectionOverlays();
      sendResponse(getSelectionState());
      return false;
    }

    if (message?.type === "QUIETLY_GET_SELECTED_CANDIDATES") {
      sendResponse({
        candidates: getSelectedCandidates(),
        state: getSelectionState()
      });
      return false;
    }

    return false;
  });
})();
