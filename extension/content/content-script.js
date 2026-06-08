(function () {
  if (globalThis.__quietlyReferenceSaver?.renderDock) {
    globalThis.__quietlyReferenceSaver.renderDock();
    return;
  }

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

  function getInterFontFaceCss() {
    const interRegularUrl = chrome.runtime.getURL("assets/fonts/Inter-Regular.ttf");
    const interMediumUrl = chrome.runtime.getURL("assets/fonts/Inter-Medium.ttf");
    const interSemiBoldUrl = chrome.runtime.getURL("assets/fonts/Inter-SemiBold.ttf");
    const interBoldUrl = chrome.runtime.getURL("assets/fonts/Inter-Bold.ttf");

    return `
      @font-face {
        font-family: "Inter";
        src: url("${interRegularUrl}") format("truetype");
        font-display: swap;
        font-style: normal;
        font-weight: 400;
      }

      @font-face {
        font-family: "Inter";
        src: url("${interMediumUrl}") format("truetype");
        font-display: swap;
        font-style: normal;
        font-weight: 500;
      }

      @font-face {
        font-family: "Inter";
        src: url("${interSemiBoldUrl}") format("truetype");
        font-display: swap;
        font-style: normal;
        font-weight: 600;
      }

      @font-face {
        font-family: "Inter";
        src: url("${interBoldUrl}") format("truetype");
        font-display: swap;
        font-style: normal;
        font-weight: 700;
      }
    `;
  }

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
    dockHost.style.fontFamily = '"Inter", "Helvetica Neue", Arial, sans-serif';
    document.documentElement.appendChild(dockHost);
    dockRoot = dockHost.attachShadow({ mode: "open" });

    dockRoot.innerHTML = `
      <style>
        ${getInterFontFaceCss()}

        :host {
          color-scheme: light;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
        }

        :host,
        :host *,
        :host *::before,
        :host *::after {
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif !important;
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
          overflow: visible;
          border: 0;
          background: transparent;
          padding: 0;
          color: #050505;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          pointer-events: auto;
        }

        .dock strong {
          color: rgba(0, 0, 0, 0.76);
          font-size: 13px;
          font-weight: 600;
          padding: 0 6px 0 8px;
          white-space: nowrap;
        }

        .dock em {
          color: rgba(0, 0, 0, 0.56);
          font-size: 13px;
          font-style: normal;
          padding: 0 8px;
          white-space: nowrap;
        }

        .dock em[data-tone="success"] {
          color: #0b8f3d;
        }

        .dock em[data-tone="error"] {
          color: #d80000;
        }

        button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          isolation: isolate;
          overflow: hidden;
          min-height: 54px;
          border: 1px solid transparent;
          border-radius: 24px;
          padding: 0 20px;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          transition:
            border-radius 220ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 160ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        button::after {
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          background:
            radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.62), transparent 34%),
            radial-gradient(circle at 86% 110%, rgba(255, 31, 31, 0.1), transparent 38%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04));
          content: "";
          opacity: 0.96;
          pointer-events: none;
          backdrop-filter: url(#quietly-liquid-refraction) blur(10px) saturate(1.5) brightness(1.06);
          -webkit-backdrop-filter: url(#quietly-liquid-refraction) blur(10px) saturate(1.5) brightness(1.06);
        }

        .button-label {
          position: relative;
          z-index: 1;
        }

        button:hover:not(:disabled) {
          border-radius: 100px;
          transform: translateY(-1px) scale(1.01);
        }

        button:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .primary {
          gap: 12px;
          border-color: rgba(255, 255, 255, 0.72);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.16)),
            rgba(255, 255, 255, 0.12);
          color: #050505;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.82),
            inset 0 -1px 0 rgba(255, 255, 255, 0.3),
            0 10px 24px rgba(0, 0, 0, 0.1);
        }

        .primary:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.9);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.2)),
            rgba(255, 255, 255, 0.16);
        }

        .refound-glyph {
          position: relative;
          z-index: 2;
          display: block;
          width: 44px;
          height: 44px;
          flex: 0 0 auto;
        }

        .refound-glyph svg {
          display: block;
          width: 100%;
          height: 100%;
          overflow: visible;
          fill: none;
        }

        .chaos-ring,
        .order-ring {
          vector-effect: non-scaling-stroke;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .chaos-ring {
          stroke: #ff1f1f;
          stroke-width: 2.15;
          opacity: 0.95;
          transform-box: fill-box;
          transform-origin: center;
          animation:
            refoundChaosRing 4.8s cubic-bezier(0.22, 1, 0.36, 1) infinite,
            refoundGlyphSpin 4.8s linear infinite;
        }

        .order-ring {
          stroke: #ff1f1f;
          stroke-width: 2.15;
          stroke-dasharray: 116;
          stroke-dashoffset: 0;
          opacity: 0.18;
          transform-origin: 22px 22px;
          animation: refoundOrderRing 4.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }

        .chaos-ring:nth-child(1) {
          animation-delay: 0ms, 0ms;
        }

        .chaos-ring:nth-child(2) {
          animation-delay: 70ms, 0ms;
        }

        .chaos-ring:nth-child(3) {
          animation-delay: 140ms, 0ms;
        }

        .chaos-ring:nth-child(4) {
          animation-delay: 210ms, 0ms;
        }

        .chaos-ring:nth-child(5) {
          animation-delay: 280ms, 0ms;
        }

        .chaos-ring:nth-child(6) {
          animation-delay: 350ms, 0ms;
        }

        .ghost {
          width: 54px;
          min-width: 54px;
          padding: 0;
          border-color: rgba(255, 255, 255, 0.62);
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.46), rgba(255, 255, 255, 0.14)),
            rgba(255, 255, 255, 0.1);
          color: rgba(5, 5, 5, 0.8);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.74),
            inset 0 -1px 0 rgba(255, 255, 255, 0.22),
            0 10px 24px rgba(0, 0, 0, 0.08);
        }

        .ghost:hover:not(:disabled) {
          border-color: rgba(255, 255, 255, 0.76);
          color: #050505;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.54), rgba(255, 255, 255, 0.18)),
            rgba(255, 255, 255, 0.14);
        }

        .ghost svg {
          display: block;
          width: 20px;
          height: 20px;
          position: relative;
          z-index: 1;
        }

        @keyframes refoundChaosRing {
          0% {
            opacity: 0.95;
            stroke-dasharray: 52 8 42 12 66 10;
            stroke-dashoffset: 0;
          }

          34% {
            opacity: 0.95;
            stroke-dasharray: 38 9 54 8 60 13;
          }

          62% {
            opacity: 0.26;
            stroke-dasharray: 114 18;
            stroke-dashoffset: -22;
          }

          78% {
            opacity: 0.14;
            stroke-dasharray: 132;
            stroke-dashoffset: -48;
          }

          100% {
            opacity: 0.95;
            stroke-dasharray: 52 8 42 12 66 10;
            stroke-dashoffset: 0;
          }
        }

        @keyframes refoundGlyphSpin {
          to {
            rotate: 360deg;
          }
        }

        @keyframes refoundOrderRing {
          0% {
            opacity: 0.18;
            stroke-dashoffset: 0;
          }

          50% {
            opacity: 0.2;
            stroke-dashoffset: 0;
          }

          70% {
            opacity: 1;
            stroke-dashoffset: 0;
          }

          84% {
            opacity: 1;
            stroke-dashoffset: 0;
          }

          100% {
            opacity: 0.18;
            stroke-dashoffset: 0;
          }
        }

        @media (max-width: 560px) {
          .dock {
            right: 12px;
            bottom: 12px;
            left: 12px;
            justify-content: center;
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          button,
          .chaos-ring,
          .order-ring {
            animation: none;
            transition: none;
          }

          .order-ring {
            opacity: 1;
            stroke-dashoffset: 0;
          }

          .chaos-ring {
            opacity: 0.18;
          }
        }
      </style>
      <svg class="liquid-glass-filter" aria-hidden="true" focusable="false" width="0" height="0">
        <filter id="quietly-liquid-refraction" x="-20%" y="-40%" width="140%" height="180%" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.024" numOctaves="2" seed="11" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="0.55" result="softNoise" />
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="28" xChannelSelector="R" yChannelSelector="G" result="refracted" />
          <feColorMatrix in="refracted" type="matrix" values="1.05 0 0 0 0  0 1.05 0 0 0  0 0 1.05 0 0  0 0 0 1 0" />
        </filter>
      </svg>
      <div class="dock"></div>
    `;

    return dockRoot;
  }

  function getTrashIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M6 6L6 15C6 16.8638 6 17.7956 6.30448 18.5307C6.71046 19.5108 7.48915 20.2895 8.46927 20.6955C9.20435 21 10.1362 21 12 21H12.5C13.8956 21 14.5933 21 15.1611 20.8278C16.4395 20.44 17.44 19.4395 17.8278 18.1611C18 17.5933 18 16.8956 18 15.5M6 6H4M6 6L18 6M18 6H20M18 6V11.5M9 3L15 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function getCloseIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    `;
  }

  function getRefoundGlyph() {
    return `
      <span class="refound-glyph" aria-hidden="true">
        <svg viewBox="0 0 44 44" role="presentation">
          <path class="chaos-ring" d="M7.5 24.2C5.8 16.4 10.5 8.4 18.4 6.6C28.2 4.3 37.2 10.6 38.2 20C39.4 31.3 28.6 39.8 17.6 36.7C8.8 34.3 4.3 25.6 7.6 17.2" />
          <path class="chaos-ring" d="M6.4 22C6.3 12.8 13.6 5.4 23.2 6.2C34.7 7.1 40.9 18.4 35.9 29C31.5 38.2 18.6 40.4 10.9 33.1C4.4 27 5.9 15.4 14.2 10.2" />
          <path class="chaos-ring" d="M8.8 27.5C4.1 19.5 8 9.2 17.5 6.4C29.7 2.8 40.2 12.6 37.2 25.1C34.7 35.7 22.2 40.9 12.6 35.1C6.2 31.2 4.7 22.2 9.8 15.6" />
          <path class="chaos-ring" d="M10.1 14.5C16.4 4.8 31.2 5.4 37 15.5C43.3 26.5 34.8 39.8 21.8 38C10.4 36.4 4.8 25.2 9.2 15.8C13.8 5.9 28.7 4.9 36 13" />
          <path class="chaos-ring" d="M5.9 19.8C7 10 16 4.2 25.9 6.3C36.4 8.6 41.4 20.2 35.8 29.5C29.9 39.4 14.5 39.1 8.8 29C3.7 20 9.3 8.3 20 6.1" />
          <path class="chaos-ring" d="M8.3 28.4C2.7 17.5 10.1 5.9 22.9 5.8C36.5 5.8 43 20.6 34 31C26.2 40.1 11.2 37.5 6.8 26.6C3.7 18.9 9.5 9.9 18.7 7.5" />
          <circle class="order-ring" cx="22" cy="22" r="18.2" />
        </svg>
      </span>
    `;
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
    const renderKey = [
      selectionMode ? "selection" : "idle",
      count,
      panelMessage,
      panelTone,
    ].join("|");

    if (dock.dataset.renderKey === renderKey) {
      return;
    }

    dock.dataset.renderKey = renderKey;

    if (!selectionMode) {
      dock.innerHTML = `
        <button class="primary" type="button">${getRefoundGlyph()}<span class="button-label">Забрать рефы</span></button>
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
      <button class="primary" type="button" ${count === 0 ? "disabled" : ""}>${getRefoundGlyph()}<span class="button-label">Сохранить</span></button>
      <button class="ghost clear-button" type="button" aria-label="Очистить выбранные">${getTrashIcon()}</button>
      <button class="ghost cancel-button" type="button" aria-label="Отмена">${getCloseIcon()}</button>
    `;
    dock.querySelector(".primary")?.addEventListener("click", () => {
      void saveSelectedCandidates();
    });
    dock.querySelector(".clear-button")?.addEventListener("click", () => {
      selectedCandidates.clear();
      panelMessage = "";
      panelTone = "";
      syncCandidateControls();
    });
    dock.querySelector(".cancel-button")?.addEventListener("click", () => {
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
        ${getInterFontFaceCss()}

        button {
          display: grid;
          width: 30px;
          height: 30px;
          place-items: center;
          border: 1.5px solid rgba(0, 0, 0, 0.62);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.76);
          color: #fff;
          cursor: pointer;
          font-family: "Inter", "Helvetica Neue", Arial, sans-serif !important;
          font-size: 18px;
          font-weight: 850;
          line-height: 1;
          padding: 0;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
          transition:
            border-color 140ms cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 140ms cubic-bezier(0.22, 1, 0.36, 1),
            transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        button:hover {
          border-color: #000;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.16);
          transform: scale(1.03);
        }

        button[data-selected="true"] {
          border-color: #000;
          background: #000;
          color: #fff;
        }

        button[data-selected="true"]::before {
          content: "✓";
        }

        button:focus-visible {
          outline: 2px solid #ff1f1f;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          button {
            transition: none;
          }
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
    if (message?.type === "QUIETLY_SHOW_DOCK") {
      renderDock();
      sendResponse(getSelectionState());
      return false;
    }

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

  globalThis.__quietlyReferenceSaver = {
    renderDock,
    startSelectionMode,
  };

  renderDock();
})();
