import { cloneContent, EMPTY_CONTENT } from "./content";
import type {
  DiaryEntry,
  DiarySettings,
  DiaryStorage,
  ImportSummary,
} from "./types";

const DB_NAME = "younotebook:v1";
const DB_VERSION = 1;
const ENTRY_STORE = "entries";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "settings";

type SettingsRecord = {
  key: typeof SETTINGS_KEY;
  value: DiarySettings;
};

const defaultSettings: DiarySettings = {
  activeEntryId: null,
  schemaVersion: 1,
  editorMode: "rich",
  lastExportedAt: null,
};

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function sortEntries(entries: DiaryEntry[]) {
  return entries.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function normalizeSettings(settings: Partial<DiarySettings> | null): DiarySettings {
  return {
    ...defaultSettings,
    ...settings,
    schemaVersion: 1,
    editorMode: "rich",
  };
}

async function readSettings(db: IDBDatabase) {
  const transaction = db.transaction(SETTINGS_STORE, "readonly");
  const store = transaction.objectStore(SETTINGS_STORE);
  const record = await requestToPromise<SettingsRecord | undefined>(
    store.get(SETTINGS_KEY),
  );

  return normalizeSettings(record?.value ?? null);
}

async function writeSettings(db: IDBDatabase, settings: DiarySettings) {
  const transaction = db.transaction(SETTINGS_STORE, "readwrite");
  transaction.objectStore(SETTINGS_STORE).put({
    key: SETTINGS_KEY,
    value: normalizeSettings(settings),
  } satisfies SettingsRecord);
  await transactionDone(transaction);

  return normalizeSettings(settings);
}

function normalizeImportedEntry(entry: DiaryEntry, id: string): DiaryEntry {
  const createdAt = entry.createdAt || nowIso();
  const updatedAt = entry.updatedAt || createdAt;

  return {
    id,
    title: entry.title?.trim() || "Импортированная заметка",
    contentJson: entry.contentJson || cloneContent(EMPTY_CONTENT),
    plainText: entry.plainText || "",
    createdAt,
    updatedAt,
    lastOpenedAt: entry.lastOpenedAt || updatedAt,
  };
}

export const diaryStorage: DiaryStorage = {
  async listEntries() {
    const db = await openDatabase();
    const transaction = db.transaction(ENTRY_STORE, "readonly");
    const entries = await requestToPromise<DiaryEntry[]>(
      transaction.objectStore(ENTRY_STORE).getAll(),
    );

    return sortEntries(entries);
  },

  async getEntry(id) {
    const db = await openDatabase();
    const transaction = db.transaction(ENTRY_STORE, "readonly");
    const entry = await requestToPromise<DiaryEntry | undefined>(
      transaction.objectStore(ENTRY_STORE).get(id),
    );

    return entry ?? null;
  },

  async createEntry(entry = {}) {
    const db = await openDatabase();
    const timestamp = nowIso();
    const nextEntry: DiaryEntry = {
      id: createId(),
      title: entry.title?.trim() || "Новая заметка",
      contentJson: entry.contentJson
        ? cloneContent(entry.contentJson)
        : cloneContent(EMPTY_CONTENT),
      plainText: entry.plainText || "",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: entry.lastOpenedAt || timestamp,
    };

    const settings = await readSettings(db);
    const transaction = db.transaction([ENTRY_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(ENTRY_STORE).put(nextEntry);
    transaction.objectStore(SETTINGS_STORE).put({
      key: SETTINGS_KEY,
      value: { ...settings, activeEntryId: nextEntry.id },
    } satisfies SettingsRecord);
    await transactionDone(transaction);

    return nextEntry;
  },

  async updateEntry(id, patch) {
    const db = await openDatabase();
    const transaction = db.transaction(ENTRY_STORE, "readwrite");
    const store = transaction.objectStore(ENTRY_STORE);
    const existing = await requestToPromise<DiaryEntry | undefined>(
      store.get(id),
    );

    if (!existing) {
      throw new Error("Entry not found");
    }

    const nextEntry: DiaryEntry = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      title: patch.title?.trim() || existing.title,
      updatedAt: patch.updatedAt ?? nowIso(),
    };

    store.put(nextEntry);
    await transactionDone(transaction);

    return nextEntry;
  },

  async deleteEntry(id) {
    const db = await openDatabase();
    const settings = await readSettings(db);
    const entries = (await this.listEntries()).filter((entry) => entry.id !== id);
    const nextActiveId =
      settings.activeEntryId === id ? entries[0]?.id ?? null : settings.activeEntryId;

    const transaction = db.transaction([ENTRY_STORE, SETTINGS_STORE], "readwrite");
    transaction.objectStore(ENTRY_STORE).delete(id);
    transaction.objectStore(SETTINGS_STORE).put({
      key: SETTINGS_KEY,
      value: { ...settings, activeEntryId: nextActiveId },
    } satisfies SettingsRecord);
    await transactionDone(transaction);

    return nextActiveId;
  },

  async getSettings() {
    const db = await openDatabase();
    return readSettings(db);
  },

  async markActiveEntry(id) {
    const db = await openDatabase();
    const settings = await readSettings(db);
    return writeSettings(db, { ...settings, activeEntryId: id });
  },

  async exportData() {
    const db = await openDatabase();
    const exportedAt = nowIso();
    const entries = await this.listEntries();
    const settings = await writeSettings(db, {
      ...(await readSettings(db)),
      lastExportedAt: exportedAt,
    });

    return {
      schemaVersion: 1,
      exportedAt,
      entries,
      settings,
    };
  },

  async importData(payload) {
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.entries)) {
      throw new Error("Unsupported diary export");
    }

    const db = await openDatabase();
    const currentEntries = await this.listEntries();
    const usedIds = new Set(currentEntries.map((entry) => entry.id));
    const idMap = new Map<string, string>();
    let remappedIds = 0;

    const incoming = payload.entries.map((entry) => {
      let id = entry.id;

      if (!id || usedIds.has(id)) {
        id = createId();
        remappedIds += 1;
      }

      usedIds.add(id);
      idMap.set(entry.id, id);
      return normalizeImportedEntry(entry, id);
    });

    const activeEntryId =
      idMap.get(payload.settings?.activeEntryId ?? "") ??
      incoming[0]?.id ??
      (await readSettings(db)).activeEntryId;

    const transaction = db.transaction([ENTRY_STORE, SETTINGS_STORE], "readwrite");
    const entryStore = transaction.objectStore(ENTRY_STORE);
    incoming.forEach((entry) => entryStore.put(entry));
    transaction.objectStore(SETTINGS_STORE).put({
      key: SETTINGS_KEY,
      value: {
        ...normalizeSettings(payload.settings),
        activeEntryId,
        lastExportedAt: null,
      },
    } satisfies SettingsRecord);
    await transactionDone(transaction);

    return {
      imported: incoming.length,
      remappedIds,
      activeEntryId,
    } satisfies ImportSummary;
  },
};
