(function () {
  const config = globalThis.QuietlyExtensionConfig;

  function getStorage(keys) {
    return chrome.storage.local.get(keys);
  }

  async function setStorage(values) {
    await chrome.storage.local.set(values);
  }

  async function getAuthToken() {
    const data = await getStorage([config.storageKeys.authToken]);

    return data[config.storageKeys.authToken] || null;
  }

  async function apiFetch(path, options = {}) {
    const token = await getAuthToken();
    const headers = new Headers(options.headers || {});

    if (options.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${config.appBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers
    });

    if (response.status === 401) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw Object.assign(new Error(data.error || "Request failed"), {
        data,
        status: response.status
      });
    }

    return data;
  }

  async function getAuthState() {
    return apiFetch("/api/extension/auth/me");
  }

  async function createExtensionSession() {
    const data = await apiFetch("/api/extension/auth/session", {
      method: "POST"
    });

    if (data?.token) {
      await setStorage({ [config.storageKeys.authToken]: data.token });
    }

    return data;
  }

  async function getCollections() {
    return apiFetch("/api/collections");
  }

  async function getSelectedCollectionId() {
    const data = await getStorage([config.storageKeys.collectionId]);

    return data[config.storageKeys.collectionId] || "";
  }

  async function setSelectedCollectionId(collectionId) {
    await setStorage({ [config.storageKeys.collectionId]: collectionId || "" });
  }

  async function saveReferences(items, collectionId) {
    return apiFetch("/api/inbox/references/bulk", {
      body: JSON.stringify({
        collectionId: collectionId || null,
        items
      }),
      method: "POST"
    });
  }

  globalThis.QuietlyExtensionApi = {
    createExtensionSession,
    getAuthState,
    getCollections,
    getSelectedCollectionId,
    saveReferences,
    setSelectedCollectionId
  };
})();
