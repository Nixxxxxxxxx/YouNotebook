importScripts("shared/config.js", "shared/api-client.js");

const api = globalThis.QuietlyExtensionApi;
const config = globalThis.QuietlyExtensionConfig;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      contexts: ["image"],
      id: "quietly-save-image",
      title: "Save image to Inbox"
    });
    chrome.contextMenus.create({
      contexts: ["link"],
      id: "quietly-save-link",
      title: "Save link to Inbox"
    });
    chrome.contextMenus.create({
      contexts: ["page"],
      id: "quietly-save-page",
      title: "Save page to Inbox"
    });
  });
});

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function makeContextReference(info, tab) {
  const pageUrl = tab?.url || info.pageUrl || "";
  const url =
    info.menuItemId === "quietly-save-image"
      ? info.srcUrl || pageUrl
      : info.linkUrl || pageUrl;
  const sourceDomain = getDomain(url);

  return {
    capturedAt: new Date().toISOString(),
    canonicalUrl: url,
    clientId: `${info.menuItemId}:${url}`,
    imageUrl: info.menuItemId === "quietly-save-image" ? url : null,
    source: "web",
    sourceDomain,
    sourceUrl: url,
    thumbnailUrl: info.menuItemId === "quietly-save-image" ? url : null,
    title: tab?.title || url
  };
}

async function saveItems(items) {
  const collectionId = await api.getSelectedCollectionId();

  return api.saveReferences(items, collectionId);
}

async function openLogin() {
  await chrome.tabs.create({ url: `${config.appBaseUrl}/extension-connect` });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    try {
      await saveItems([makeContextReference(info, tab)]);
    } catch (error) {
      if (error.status === 401) {
        await openLogin();
      }
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "QUIETLY_STORE_AUTH_TOKEN") {
    void (async () => {
      if (!message.token) {
        sendResponse({ error: "Missing token", ok: false });
        return;
      }

      await chrome.storage.local.set({
        [config.storageKeys.authToken]: message.token
      });
      sendResponse({ ok: true });
    })();

    return true;
  }

  if (message?.type !== "QUIETLY_SAVE_SELECTED_FROM_CONTENT") {
    return false;
  }

  void (async () => {
    try {
      const candidates = Array.isArray(message.candidates)
        ? message.candidates
        : [];
      const result = await saveItems(
        candidates.map((candidate) => ({
          ...candidate,
          clientId: candidate.id
        }))
      );

      sendResponse({ ok: true, result });
    } catch (error) {
      if (error.status === 401) {
        await openLogin();
      }

      sendResponse({
        error: error.message || "Failed to save references",
        ok: false
      });
    }
  })();

  return true;
});
