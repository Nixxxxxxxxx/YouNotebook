(function () {
  const api = globalThis.QuietlyExtensionApi;
  const config = globalThis.QuietlyExtensionConfig;
  const sourceLabels = {
    arena: "Are.na",
    dribbble: "Dribbble",
    pinterest: "Pinterest"
  };

  const elements = {
    authState: document.querySelector("#authState"),
    collectionSelect: document.querySelector("#collectionSelect"),
    controls: document.querySelector("#controls"),
    refreshAuthButton: document.querySelector("#refreshAuthButton"),
    savePageButton: document.querySelector("#savePageButton"),
    signInButton: document.querySelector("#signInButton"),
    siteBadge: document.querySelector("#siteBadge"),
    statusMessage: document.querySelector("#statusMessage"),
    unsupportedBox: document.querySelector("#unsupportedBox")
  };

  let activeTab = null;
  let authenticated = false;
  let currentSource = null;

  function setStatus(message, tone = "") {
    elements.statusMessage.textContent = message || "";
    elements.statusMessage.dataset.tone = tone;
  }

  function detectSource(url) {
    try {
      const { hostname } = new URL(url);

      if (/(^|\.)are\.na$/i.test(hostname)) return "arena";
      if (/(^|\.)pinterest\./i.test(hostname)) return "pinterest";
      if (hostname === "dribbble.com") return "dribbble";
    } catch {
      return null;
    }

    return null;
  }

  function getResultMessage(result) {
    if (!result) return "Не удалось сохранить";

    if (result.failed > 0) {
      return `${result.saved} сохранено, ${result.failed} с ошибкой`;
    }

    if (result.saved === 1) return "Сохранено во входящие";

    if (result.duplicates > 0 && result.saved === 0) {
      return "Уже во входящих";
    }

    if (result.duplicates > 0) {
      return `${result.saved} сохранено, ${result.duplicates} уже были`;
    }

    return `${result.saved} сохранено`;
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    return tab;
  }

  function updateSiteUi() {
    const supported = Boolean(currentSource);

    elements.siteBadge.textContent = supported
      ? sourceLabels[currentSource]
      : "Не поддерживается";
    elements.siteBadge.dataset.state = supported ? "ok" : "muted";
    elements.controls.classList.toggle("hidden", !supported);
    elements.unsupportedBox.classList.toggle("hidden", supported);
  }

  async function loadAuth() {
    try {
      const auth = await api.getAuthState();

      authenticated = Boolean(auth?.authenticated);
      elements.authState.textContent = authenticated
        ? `Вход выполнен: ${auth.user.email}`
        : "Войди, чтобы сохранять";

      if (authenticated) {
        try {
          await api.createExtensionSession();
        } catch {
          // Token creation is best-effort; an existing token can still work.
        }
      }
    } catch (error) {
      authenticated = false;
      elements.authState.textContent =
        error.status === 401
          ? "Войди, чтобы сохранять"
          : "Не удалось проверить вход";
    }
  }

  async function loadCollections() {
    elements.collectionSelect.innerHTML = `<option value="">Без коллекции</option>`;

    if (!authenticated) return;

    try {
      const [data, selectedCollectionId] = await Promise.all([
        api.getCollections(),
        api.getSelectedCollectionId()
      ]);

      for (const collection of data.collections || []) {
        const option = document.createElement("option");
        option.value = collection.id;
        option.textContent = collection.name;
        elements.collectionSelect.appendChild(option);
      }

      elements.collectionSelect.value = selectedCollectionId || "";
    } catch {
      setStatus("Коллекции не загрузились. Во входящие всё равно можно сохранить.", "error");
    }
  }

  async function savePage() {
    if (!activeTab?.url) return;

    setStatus("Сохраняю...");
    try {
      const url = activeTab.url;
      const pageUrl = new URL(url);
      const result = await api.saveReferences(
        [
          {
            capturedAt: new Date().toISOString(),
            canonicalUrl: url,
            clientId: `page:${url}`,
            source: "web",
            sourceDomain: pageUrl.hostname.replace(/^www\./, ""),
            sourceUrl: url,
            title: activeTab.title || url
          }
        ],
        elements.collectionSelect.value
      );

      setStatus(getResultMessage(result), result.failed > 0 ? "error" : "success");
    } catch (error) {
      setStatus(
        error.status === 401
          ? "Войди, чтобы сохранять"
          : "Не удалось сохранить",
        "error"
      );
    }
  }

  async function initialize() {
    activeTab = await getActiveTab();
    currentSource = detectSource(activeTab?.url || "");
    updateSiteUi();
    await loadAuth();
    await loadCollections();
  }

  elements.signInButton.addEventListener("click", () => {
    chrome.tabs.create({ url: `${config.appBaseUrl}/extension-connect` });
  });
  elements.refreshAuthButton.addEventListener("click", () => {
    void loadAuth().then(loadCollections);
  });
  elements.collectionSelect.addEventListener("change", () => {
    void api.setSelectedCollectionId(elements.collectionSelect.value);
  });
  elements.savePageButton.addEventListener("click", () => {
    void savePage();
  });

  void initialize();
})();
