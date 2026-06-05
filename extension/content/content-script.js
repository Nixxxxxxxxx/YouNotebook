(function () {
  const adapters = globalThis.QuietlyReferenceAdapters || [];
  const helpers = globalThis.QuietlyAdapterHelpers;
  const adapter = adapters.find((candidate) => candidate.isSupportedPage());

  let selectionMode = false;
  let scanTimer = null;
  let observer = null;
  let positionFrame = null;
  let rescanTimer = null;
  let shadowHost = null;
  let shadowRoot = null;
  let lastCandidates = [];
  let panelMessage = "";
  let panelTone = "";
  const overlayElementsById = new Map();
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
          border: 1px solid rgba(125, 176, 255, 0.34);
          border-radius: 16px;
          background: rgba(125, 176, 255, 0.055);
          cursor: pointer;
          pointer-events: auto;
          transition: background 120ms ease, border-color 120ms ease;
        }

        .overlay:focus-visible {
          outline: 2px solid rgba(159, 206, 255, 0.96);
          outline-offset: 3px;
        }

        .overlay:hover,
        .overlay[data-selected="true"] {
          border-color: rgba(125, 176, 255, 0.92);
          background: rgba(125, 176, 255, 0.12);
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
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
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

        .quickSave {
          position: absolute;
          right: 10px;
          bottom: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          background: rgba(13, 13, 13, 0.82);
          color: white;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          opacity: 0;
          padding: 9px 12px;
          pointer-events: auto;
          transform: translateY(4px) scale(0.98);
          transition:
            opacity 120ms ease,
            transform 120ms ease,
            border-color 120ms ease,
            background 120ms ease;
        }

        .overlay:hover .quickSave,
        .overlay:focus-visible .quickSave {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        .quickSave:hover {
          border-color: rgba(159, 206, 255, 0.72);
          background: linear-gradient(135deg, #9fceff 0%, #5d8bff 100%);
          color: #07101f;
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
    }, 220);
  }

  function scheduleScrollUpdate() {
    if (!selectionMode || !adapter) return;

    if (!positionFrame) {
      positionFrame = window.requestAnimationFrame(() => {
        positionFrame = null;
        updateOverlayPositions();
      });
    }

    window.clearTimeout(rescanTimer);
    rescanTimer = window.setTimeout(() => {
      rescanTimer = null;
      renderSelectionOverlays();
    }, 320);
  }

  function scanCandidates() {
    if (!adapter) return [];

    lastCandidates = adapter.scanVisibleCandidates().filter((candidate) => {
      const element = adapter.getCandidateElement(candidate.id);

      return element && helpers.isElementVisible(element);
    });

    return lastCandidates;
  }

  function isRectInViewport(rect) {
    return (
      rect.width >= 72 &&
      rect.height >= 72 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function positionOverlay(overlay, element, checkStyle = true) {
    const rect = element.getBoundingClientRect();

    overlay.hidden = checkStyle
      ? !helpers.isElementVisible(element)
      : !isRectInViewport(rect);
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  }

  function updateOverlayPositions() {
    for (const candidate of lastCandidates) {
      const overlay = overlayElementsById.get(candidate.id);
      const element = adapter.getCandidateElement(candidate.id);

      if (!overlay || !element) continue;

      positionOverlay(overlay, element, false);
    }
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
      <strong>${count} выбрано</strong>
      ${panelMessage ? `<em data-tone="${panelTone}">${escapePanelText(panelMessage)}</em>` : ""}
      <button class="primary" type="button" ${count === 0 ? "disabled" : ""}>Сохранить</button>
      <button type="button">Очистить</button>
      <button type="button">Отмена</button>
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
    overlayElementsById.clear();

    for (const candidate of candidates) {
      const element = adapter.getCandidateElement(candidate.id);

      if (!element) continue;

      updateSelectedCandidate(candidate);
      const overlay = document.createElement("div");

      overlay.className = "overlay";
      overlay.dataset.candidateId = candidate.id;
      overlay.dataset.selected = String(selectedCandidates.has(candidate.id));
      positionOverlay(overlay, element);
      overlay.tabIndex = 0;
      overlay.setAttribute("role", "button");
      overlay.setAttribute("aria-label", `Выбрать ${candidate.title || candidate.sourceUrl}`);
      overlay.innerHTML = `
        <span class="check" aria-hidden="true"></span>
        <button class="quickSave" type="button">Сохранить</button>
      `;
      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleCandidate(candidate);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        event.stopPropagation();
        toggleCandidate(candidate);
      });
      overlay.querySelector(".quickSave")?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void saveCandidates([candidate]);
      });
      overlayElementsById.set(candidate.id, overlay);
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

    window.addEventListener("scroll", scheduleScrollUpdate, {
      capture: true,
      passive: true
    });
    window.addEventListener("resize", scheduleScan);

    return getSelectionState();
  }

  function stopSelectionMode() {
    selectionMode = false;
    selectedCandidates.clear();
    overlayElementsById.clear();
    panelMessage = "";
    panelTone = "";
    window.cancelAnimationFrame(positionFrame);
    window.clearTimeout(rescanTimer);
    positionFrame = null;
    rescanTimer = null;
    shadowHost?.remove();
    shadowHost = null;
    shadowRoot = null;
    observer?.disconnect();
    observer = null;
    window.removeEventListener("scroll", scheduleScrollUpdate, true);
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
    if (!result) return "Не удалось сохранить";

    if (result.failed > 0) {
      return `${result.saved} сохранено, ${result.failed} с ошибкой`;
    }

    if (result.duplicates > 0 && result.saved === 0) {
      return "Уже во входящих";
    }

    if (result.duplicates > 0) {
      return `${result.saved} сохранено, ${result.duplicates} уже были`;
    }

    return result.saved === 1 ? "Сохранено во входящие" : `${result.saved} сохранено`;
  }

  async function saveCandidates(candidates, { clearSelected = false } = {}) {
    if (candidates.length === 0) return;

    panelMessage = "Сохраняю...";
    panelTone = "";
    renderSelectionOverlays();

    const result = await chrome.runtime.sendMessage({
      candidates,
      type: "QUIETLY_SAVE_SELECTED_FROM_CONTENT"
    });

    if (result?.ok) {
      if (clearSelected) {
        selectedCandidates.clear();
      }

      panelMessage = getSaveResultMessage(result.result);
      panelTone = result.result?.failed > 0 ? "error" : "success";
      renderSelectionOverlays();
      window.setTimeout(() => {
        panelMessage = "";
        panelTone = "";
        renderSelectionOverlays();
      }, 1200);
    } else {
      panelMessage = result?.error || "Не удалось сохранить";
      panelTone = "error";
      renderSelectionOverlays();
    }
  }

  async function saveSelectedFromPanel() {
    await saveCandidates(getSelectedCandidates(), { clearSelected: true });
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
