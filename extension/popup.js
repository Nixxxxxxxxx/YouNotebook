(function () {
  const api = globalThis.QuietlyExtensionApi;
  const config = globalThis.QuietlyExtensionConfig;
  const sourceLabels = {
    arena: "Are.na",
    dribbble: "Dribbble",
    pinterest: "Pinterest"
  };

  const elements = {
    authBox: document.querySelector("#authBox"),
    authState: document.querySelector("#authState"),
    collectionSelect: document.querySelector("#collectionSelect"),
    controls: document.querySelector("#controls"),
    refreshAuthButton: document.querySelector("#refreshAuthButton"),
    saveButton: document.querySelector("#saveButton"),
    savePageButton: document.querySelector("#savePageButton"),
    selectButton: document.querySelector("#selectButton"),
    selectionState: document.querySelector("#selectionState"),
    signInButton: document.querySelector("#signInButton"),
    siteBadge: document.querySelector("#siteBadge"),
    statusMessage: document.querySelector("#statusMessage"),
    unsupportedBox: document.querySelector("#unsupportedBox")
  };

  let activeTab = null;
  let supported = false;
  let currentSource = null;
  let authenticated = false;

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

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    return tab;
  }

  function sendTabMessage(message) {
    return chrome.tabs.sendMessage(activeTab.id, message);
  }

  async function refreshSelectionState() {
    if (!supported || !activeTab?.id) return;

    try {
      const state = await sendTabMessage({ type: "QUIETLY_GET_SELECTION_STATE" });
      const selectedCount = state?.selectedCount || 0;

      elements.selectionState.textContent = state?.active
        ? `Selection mode is active · ${selectedCount} selected`
        : "Selection mode is inactive";
      elements.saveButton.disabled = !authenticated || selectedCount === 0;
    } catch {
      elements.selectionState.textContent = "Reload the page to activate selection";
      elements.saveButton.disabled = true;
    }
  }

  async function loadAuth() {
    try {
      const auth = await api.getAuthState();

      authenticated = Boolean(auth?.authenticated);
      elements.authState.textContent = authenticated
        ? `Signed in as ${auth.user.email}`
        : "Sign in to save references";

      if (authenticated) {
        try {
          await api.createExtensionSession();
        } catch {
          // Cookie auth can still work; token creation is best-effort for MV3.
        }
      }
    } catch (error) {
      authenticated = false;
      elements.authState.textContent =
        error.status === 401
          ? "Sign in to save references"
          : "Could not check auth";
    }

    elements.selectButton.disabled = !supported || !authenticated;
    await refreshSelectionState();
  }

  async function loadCollections() {
    elements.collectionSelect.innerHTML = `<option value="">No collection</option>`;

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
      setStatus("Collections failed to load. Saving to Inbox still works.", "error");
    }
  }

  function updateSiteUi() {
    supported = Boolean(currentSource);
    elements.siteBadge.textContent = supported
      ? sourceLabels[currentSource]
      : "Unsupported site";
    elements.siteBadge.dataset.state = supported ? "ok" : "muted";
    elements.controls.classList.toggle("hidden", !supported);
    elements.unsupportedBox.classList.toggle("hidden", supported);
  }

  async function startSelection() {
    setStatus("");
    try {
      await sendTabMessage({ type: "QUIETLY_START_SELECTION" });
      await refreshSelectionState();
    } catch {
      setStatus("Reload the page and try again.", "error");
    }
  }

  function getResultMessage(result) {
    if (!result) return "Some references could not be saved";

    if (result.failed > 0) {
      return `${result.saved} saved, ${result.failed} failed`;
    }

    if (result.saved === 1) return "Saved to Inbox";

    if (result.duplicates > 0 && result.saved === 0) {
      return "Already saved to Inbox";
    }

    if (result.duplicates > 0) {
      return `${result.saved} saved, ${result.duplicates} already saved`;
    }

    return `${result.saved} references saved`;
  }

  async function saveSelected() {
    setStatus("Saving...");

    try {
      const response = await sendTabMessage({
        type: "QUIETLY_GET_SELECTED_CANDIDATES"
      });
      const candidates = response?.candidates || [];

      if (candidates.length === 0) {
        setStatus("Select references first", "error");
        return;
      }

      const collectionId = elements.collectionSelect.value;
      const result = await api.saveReferences(
        candidates.map((candidate) => ({
          ...candidate,
          clientId: candidate.id
        })),
        collectionId
      );

      setStatus(getResultMessage(result), result.failed > 0 ? "error" : "success");
      await sendTabMessage({ type: "QUIETLY_CLEAR_SELECTION" });
      await refreshSelectionState();
    } catch (error) {
      if (error.status === 401) {
        setStatus("Sign in to save references", "error");
      } else {
        setStatus("Some references could not be saved", "error");
      }
    }
  }

  async function savePage() {
    if (!activeTab?.url) return;

    setStatus("Saving...");
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
          ? "Sign in to save references"
          : "Some references could not be saved",
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
    await refreshSelectionState();
  }

  elements.selectButton.addEventListener("click", () => {
    void startSelection();
  });
  elements.saveButton.addEventListener("click", () => {
    void saveSelected();
  });
  elements.savePageButton.addEventListener("click", () => {
    void savePage();
  });
  elements.signInButton.addEventListener("click", () => {
    chrome.tabs.create({ url: `${config.appBaseUrl}/extension-connect` });
  });
  elements.refreshAuthButton.addEventListener("click", () => {
    void loadAuth().then(loadCollections);
  });
  elements.collectionSelect.addEventListener("change", () => {
    void api.setSelectedCollectionId(elements.collectionSelect.value);
  });

  void initialize();
})();
