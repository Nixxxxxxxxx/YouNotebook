(function () {
  const adapters = globalThis.QuietlyReferenceAdapters || [];
  const helpers = globalThis.QuietlyAdapterHelpers;
  const adapter = adapters.find((candidate) => candidate.isSupportedPage());

  if (!adapter) {
    return;
  }

  let selectionMode = false;
  let scanTimer = null;
  let observer = null;
  let dockHost = null;
  let dockRoot = null;
  let panelMessage = "";
  let panelTone = "";
  let lastCandidates = [];
  const selectedCandidates = new Map();
  const controlHostsById = new Map();
  const originalPositionByElement = new WeakMap();
  const positionedElements = new Set();

  function escapeText(value) {
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

  function ensureDockRoot() {
    if (dockRoot) return dockRoot;

    dockHost = document.createElement("div");
    dockHost.id = "quietly-reference-dock-root";
    dockHost.style.all = "initial";
    document.documentElement.appendChild(dockHost);
    dockRoot = dockHost.attachShadow({ mode: "open" });
    dockRoot.innerHTML = `
      <style>
        :host {
          color-scheme: dark;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .dock {
          position: fixed;
          left: 50%;
          bottom: 24px;
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 10px;
          transform: translateX(-50%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          background: rgba(13, 13, 13, 0.92);
          padding: 10px 12px;
          color: white;
          pointer-events: auto;
          box-shadow: 0 18px 52px rgba(0, 0, 0, 0.36);
        }

        .dock strong {
          color: rgba(255, 255, 255, 0.86);
          font-size: 13px;
          font-weight: 740;
          white-space: nowrap;
        }

        .dock em {
          color: rgba(255, 255, 255, 0.64);
          font-size: 13px;
          font-style: normal;
          white-space: nowrap;
        }

        .dock em[data-tone="success"] {
          color: #9fceff;
        }

        .dock em[data-tone="error"] {
          color: #ffb29f;
        }

        button {
          min-height: 42px;
          border: 0;
          border-radius: 17px;
          padding: 0 14px;
          font: inherit;
          font-size: 14px;
          cursor: pointer;
          transition:
            transform 160ms ease,
            opacity 160ms ease,
            border-color 160ms ease;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .primary {
          background: linear-gradient(135deg, #9fceff 0%, #5d8bff 100%);
          color: #07101f;
          font-weight: 760;
        }

        .ghost {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: white;
        }

        @media (max-width: 560px) {
          .dock {
            right: 14px;
            bottom: 14px;
            left: 14px;
            justify-content: center;
            transform: none;
          }
        }
      </style>
      <div class="dock"></div>
    `;

    return dockRoot;
  }

  function getDock() {
    return ensureDockRoot().querySelector(".dock");
  }

  function getSelectedCount() {
    return selectedCandidates.size;
  }

  function renderDock() {
    const dock = getDock();
    const count = getSelectedCount();
    const messageHtml = panelMessage
      ? `<em data-tone="${panelTone}">${escapeText(panelMessage)}</em>`
      : "";

    if (!selectionMode) {
      dock.innerHTML = `
        <button class="primary" type="button">Сохранить референсы</button>
        ${messageHtml}
      `;
      dock.querySelector(".primary")?.addEventListener("click", () => {
        startSelectionMode();
      });
      return;
    }

    dock.innerHTML = `
      <strong>${count} выбрано</strong>
      ${messageHtml}
      <button class="primary" type="button" ${count === 0 ? "disabled" : ""}>Сохранить во входящие</button>
      <button class="ghost" type="button">Очистить</button>
      <button class="ghost" type="button">Отмена</button>
    `;
    dock.querySelector(".primary")?.addEventListener("click", () => {
      void saveSelectedCandidates();
    });
    dock.querySelectorAll("button")[1]?.addEventListener("click", () => {
      selectedCandidates.clear();
      panelMessage = "";
      panelTone = "";
      syncCandidateControls();
    });
    dock.querySelectorAll("button")[2]?.addEventListener("click", () => {
      stopSelectionMode();
    });
  }

  function scanCandidates() {
    lastCandidates = adapter.scanVisibleCandidates().filter((candidate) => {
      const element = adapter.getCandidateElement(candidate.id);

      return element && helpers.isElementVisible(element);
    });

    return lastCandidates;
  }

  function scheduleScan() {
    if (!selectionMode || scanTimer) return;

    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      syncCandidateControls();
    }, 320);
  }

  function rememberPosition(element) {
    if (positionedElements.has(element)) return;

    originalPositionByElement.set(element, element.style.position || "");
    positionedElements.add(element);

    if (window.getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
  }

  function restorePositions() {
    positionedElements.forEach((element) => {
      element.style.position = originalPositionByElement.get(element) || "";
    });
    positionedElements.clear();
  }

  function removeControlHost(candidateId) {
    const host = controlHostsById.get(candidateId);

    if (!host) return;

    host.remove();
    controlHostsById.delete(candidateId);
  }

  function updateControlState(candidate, host) {
    const button = host.shadowRoot?.querySelector("button");
    const selected = selectedCandidates.has(candidate.id);

    if (!button) return;

    button.dataset.selected = String(selected);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      selected
        ? `Убрать ${candidate.title || candidate.sourceUrl}`
        : `Выбрать ${candidate.title || candidate.sourceUrl}`,
    );
  }

  function createControlHost(candidate, element) {
    rememberPosition(element);

    const host = document.createElement("div");
    host.dataset.quietlyReferenceId = candidate.id;
    host.style.all = "initial";
    host.style.position = "absolute";
    host.style.top = "10px";
    host.style.right = "10px";
    host.style.zIndex = "2147483646";
    host.style.width = "32px";
    host.style.height = "32px";
    host.style.pointerEvents = "auto";
    element.appendChild(host);

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        button {
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          border: 1.5px solid rgba(255, 255, 255, 0.86);
          border-radius: 10px;
          background: rgba(13, 13, 13, 0.74);
          color: white;
          cursor: pointer;
          font: inherit;
          font-size: 18px;
          font-weight: 850;
          line-height: 1;
          padding: 0;
          transition:
            transform 120ms ease,
            border-color 120ms ease,
            background 120ms ease;
        }

        button:hover {
          transform: scale(1.04);
          border-color: #9fceff;
        }

        button[data-selected="true"] {
          border-color: transparent;
          background: linear-gradient(135deg, #9fceff 0%, #5d8bff 100%);
          color: #07101f;
        }

        button[data-selected="true"]::before {
          content: "✓";
        }

        button:focus-visible {
          outline: 2px solid #9fceff;
          outline-offset: 3px;
        }
      </style>
      <button type="button"></button>
    `;
    root.querySelector("button")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleCandidate(candidate);
    });

    controlHostsById.set(candidate.id, host);
    updateControlState(candidate, host);
    return host;
  }

  function attachControl(candidate) {
    const element = adapter.getCandidateElement(candidate.id);

    if (!element) return;

    let host = controlHostsById.get(candidate.id);

    if (host && host.parentElement !== element) {
      removeControlHost(candidate.id);
      host = null;
    }

    if (!host) {
      host = createControlHost(candidate, element);
    }

    updateControlState(candidate, host);
  }

  function syncCandidateControls() {
    if (!selectionMode) return;

    const candidates = scanCandidates();
    const visibleIds = new Set(candidates.map((candidate) => candidate.id));

    candidates.forEach((candidate) => {
      if (selectedCandidates.has(candidate.id)) {
        selectedCandidates.set(candidate.id, candidate);
      }

      attachControl(candidate);
    });
    Array.from(controlHostsById.keys()).forEach((candidateId) => {
      if (!visibleIds.has(candidateId)) {
        removeControlHost(candidateId);
      }
    });
    renderDock();
  }

  function toggleCandidate(candidate) {
    if (selectedCandidates.has(candidate.id)) {
      selectedCandidates.delete(candidate.id);
    } else {
      selectedCandidates.set(candidate.id, candidate);
    }

    panelMessage = "";
    panelTone = "";
    attachControl(candidate);
    renderDock();
  }

  function startSelectionMode() {
    selectionMode = true;
    panelMessage = "";
    panelTone = "";
    syncCandidateControls();

    if (!observer) {
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("scroll", scheduleScan, { passive: true });
    window.addEventListener("resize", scheduleScan);
    renderDock();

    return getSelectionState();
  }

  function stopSelectionMode() {
    selectionMode = false;
    selectedCandidates.clear();
    panelMessage = "";
    panelTone = "";
    window.clearTimeout(scanTimer);
    scanTimer = null;
    observer?.disconnect();
    observer = null;
    window.removeEventListener("scroll", scheduleScan);
    window.removeEventListener("resize", scheduleScan);
    Array.from(controlHostsById.keys()).forEach(removeControlHost);
    restorePositions();
    renderDock();
  }

  function getSelectionState() {
    return {
      active: selectionMode,
      candidateCount: lastCandidates.length,
      selectedCount: getSelectedCount(),
      source: adapter.source,
      supported: true,
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

    return result.saved === 1
      ? "Сохранено во входящие"
      : `${result.saved} сохранено`;
  }

  async function saveCandidates(candidates, { clearSelected = false } = {}) {
    if (candidates.length === 0) return;

    panelMessage = "Сохраняю...";
    panelTone = "";
    renderDock();

    const result = await chrome.runtime.sendMessage({
      candidates,
      type: "QUIETLY_SAVE_SELECTED_FROM_CONTENT",
    });

    if (result?.ok) {
      if (clearSelected) {
        selectedCandidates.clear();
        syncCandidateControls();
      }

      panelMessage = getSaveResultMessage(result.result);
      panelTone = result.result?.failed > 0 ? "error" : "success";
      renderDock();
      window.setTimeout(() => {
        panelMessage = "";
        panelTone = "";
        renderDock();
      }, 1400);
    } else {
      panelMessage = result?.error || "Не удалось сохранить";
      panelTone = "error";
      renderDock();
    }
  }

  async function saveSelectedCandidates() {
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
      syncCandidateControls();
      sendResponse(getSelectionState());
      return false;
    }

    if (message?.type === "QUIETLY_GET_SELECTED_CANDIDATES") {
      sendResponse({
        candidates: getSelectedCandidates(),
        state: getSelectionState(),
      });
      return false;
    }

    return false;
  });

  renderDock();
})();
