"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "motion/react";
import { cloneContent, deriveTitle, EMPTY_CONTENT, WELCOME_CONTENT } from "@/lib/diary/content";
import { formatHistoryDate } from "@/lib/diary/dates";
import { diaryStorage } from "@/lib/diary/storage";
import type { DiaryContent, DiaryEntry, DiaryExportPayload } from "@/lib/diary/types";
import { AppTabs } from "@/components/app-tabs";
import { AddTaskIcon, TrashIcon } from "@/components/icons/app-icons";
import { DynamicBackground } from "./dynamic-background";
import { RichEditor, type RichEditorHandle } from "./rich-editor";
import styles from "./diary-app.module.css";

type SaveStatus = "loading" | "saved" | "saving" | "error";

type PendingPatch = {
  id: string;
  patch: Partial<Omit<DiaryEntry, "id" | "createdAt">>;
};

type Command = {
  id: string;
  title: string;
  hint: string;
};

const HISTORY_LAYOUT_TRANSITION = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
} as const;

const HISTORY_PRESENCE_TRANSITION = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const;

function sortEntriesByUpdatedAt(entries: DiaryEntry[]) {
  return [...entries].sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime(),
  );
}

function groupEntries(entries: DiaryEntry[]) {
  const groups = new Map<string, DiaryEntry[]>();

  entries.forEach((entry) => {
    const label = formatHistoryDate(entry.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  });

  return Array.from(groups.entries());
}

function saveJsonFile(payload: DiaryExportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `younotebook-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DiaryApp() {
  const shouldReduceMotion = useReducedMotion();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<RichEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingPatch | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;

  async function reloadEntries(nextActiveId?: string | null) {
    const [loadedEntries, settings] = await Promise.all([
      diaryStorage.listEntries(),
      diaryStorage.getSettings(),
    ]);

    setEntries(sortEntriesByUpdatedAt(loadedEntries));
    setActiveId(
      nextActiveId ??
        settings.activeEntryId ??
        loadedEntries[0]?.id ??
        null,
    );
  }

  async function flushSave() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const pending = pendingRef.current;

    if (!pending) {
      return;
    }

    pendingRef.current = null;
    setSaveStatus("saving");

    try {
      const saved = await diaryStorage.updateEntry(pending.id, pending.patch);
      setEntries((current) =>
        sortEntriesByUpdatedAt(
          current.map((entry) => (entry.id === saved.id ? saved : entry)),
        ),
      );
      setSaveStatus("saved");
      setError(null);
    } catch (saveError) {
      pendingRef.current = pending;
      setSaveStatus("error");
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    }
  }

  function queueSave(
    id: string,
    patch: Partial<Omit<DiaryEntry, "id" | "createdAt">>,
  ) {
    const optimisticUpdatedAt = patch.updatedAt ?? new Date().toISOString();
    pendingRef.current = {
      id,
      patch: {
        ...(pendingRef.current?.id === id ? pendingRef.current.patch : {}),
        ...patch,
        updatedAt: optimisticUpdatedAt,
      },
    };

    setEntries((current) =>
      sortEntriesByUpdatedAt(
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...patch,
                updatedAt: optimisticUpdatedAt,
              }
            : entry,
        ),
      ),
    );
    setSaveStatus("saving");

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, 650);
  }

  async function createEntry() {
    await flushSave();
    const entry = await diaryStorage.createEntry({
      title: "Без названия",
      contentJson: cloneContent(EMPTY_CONTENT),
      plainText: "",
    });
    setEntries((current) => sortEntriesByUpdatedAt([entry, ...current]));
    setActiveId(entry.id);
    setHistoryOpen(false);
    setSaveStatus("saved");
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  async function selectEntry(entry: DiaryEntry) {
    await flushSave();
    const openedAt = new Date().toISOString();
    await diaryStorage.markActiveEntry(entry.id);
    await diaryStorage.updateEntry(entry.id, {
      lastOpenedAt: openedAt,
      updatedAt: entry.updatedAt,
    });
    setEntries((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, lastOpenedAt: openedAt } : item,
      ),
    );
    setActiveId(entry.id);
    setHistoryOpen(false);
  }

  async function deleteEntry(entry: DiaryEntry) {
    const confirmed = window.confirm(`Удалить заметку "${entry.title}"?`);

    if (!confirmed) {
      return;
    }

    await flushSave();
    const nextActiveId = await diaryStorage.deleteEntry(entry.id);
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setActiveId(nextActiveId);
  }

  async function deleteActiveEntry() {
    if (activeEntry) {
      await deleteEntry(activeEntry);
    }
  }

  async function exportDiary() {
    await flushSave();
    const payload = await diaryStorage.exportData();
    saveJsonFile(payload);
    setSaveStatus("saved");
  }

  function importDiary() {
    fileInputRef.current?.click();
  }

  async function readImportFile(file: File) {
    await flushSave();
    const payload = JSON.parse(await file.text()) as DiaryExportPayload;
    const summary = await diaryStorage.importData(payload);
    await reloadEntries(summary.activeEntryId);
    setSaveStatus("saved");
    setError(
      `Импортировано: ${summary.imported}. Новых id из-за конфликтов: ${summary.remappedIds}.`,
    );
  }

  function handleEditorChange(contentJson: DiaryContent, plainText: string) {
    if (!activeEntry) {
      return;
    }

    const derivedTitle = deriveTitle(plainText);

    queueSave(activeEntry.id, {
      contentJson,
      plainText,
      title: derivedTitle,
    });
  }

  const commands: Command[] = [
    {
      id: "new",
      title: "Новая заметка",
      hint: "Cmd/Ctrl + N",
    },
    {
      id: "save",
      title: "Сохранить сейчас",
      hint: "Cmd/Ctrl + S",
    },
    {
      id: "export",
      title: "Export JSON",
      hint: "резервная копия",
    },
    {
      id: "import",
      title: "Import JSON",
      hint: "восстановление",
    },
    {
      id: "delete",
      title: "Удалить текущую заметку",
      hint: "осторожно",
    },
  ];

  const visibleCommands = commands.filter((command) =>
    `${command.title} ${command.hint}`
      .toLowerCase()
      .includes(commandSearch.trim().toLowerCase()),
  );

  function runCommand(commandId: string) {
    if (commandId === "new") {
      void createEntry();
    }

    if (commandId === "save") {
      void flushSave();
    }

    if (commandId === "export") {
      void exportDiary();
    }

    if (commandId === "import") {
      importDiary();
    }

    if (commandId === "delete") {
      void deleteActiveEntry();
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const loadedEntries = await diaryStorage.listEntries();
        let nextEntries = loadedEntries;

        if (loadedEntries.length === 0) {
          const welcomeEntry = await diaryStorage.createEntry({
            title: "Мы работаем над собой",
            contentJson: cloneContent(WELCOME_CONTENT),
            plainText:
              "Мы работаем над собой\nЭто твой тихий личный дневник. Он живет локально, сохраняется сам и не требует профилей.\nНачни с первой честной строки. Всё остальное приложение аккуратно подержит.",
          });
          nextEntries = [welcomeEntry];
        }

        const settings = await diaryStorage.getSettings();

        if (!cancelled) {
          setEntries(nextEntries);
          setActiveId(settings.activeEntryId ?? nextEntries[0]?.id ?? null);
          setSaveStatus("saved");
        }
      } catch (bootError) {
        if (!cancelled) {
          setSaveStatus("error");
          setError(
            bootError instanceof Error
              ? bootError.message
              : "Не удалось открыть локальное хранилище",
          );
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        setCommandOpen(false);
        setCommandSearch("");
        return;
      }

      if (!modifier) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }

      if (key === "n") {
        event.preventDefault();
        void createEntry();
      }

      if (key === "s") {
        event.preventDefault();
        void flushSave();
      }

      if (key === "b") {
        event.preventDefault();
        editorRef.current?.toggleBold();
      }

      if (key === "i") {
        event.preventDefault();
        editorRef.current?.toggleItalic();
      }

      if (key === "u") {
        event.preventDefault();
        editorRef.current?.toggleUnderline();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return (
    <main className={styles.shell}>
      <DynamicBackground />
      <AppTabs active="diary" />

      <button
        className={styles.mobileHistoryButton}
        type="button"
        onClick={() => setHistoryOpen(true)}
      >
        История
      </button>

      <motion.aside
        className={`${styles.historyPanel} ${historyOpen ? styles.historyPanelOpen : ""}`}
        initial={shouldReduceMotion ? false : { opacity: 0, x: -8 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.historyHeader}>
          <h1>История</h1>
          <button
            className={styles.iconButton}
            type="button"
            onClick={() => void createEntry()}
          >
            <AddTaskIcon />
          </button>
        </div>

        <LayoutGroup id="diary-history">
          <motion.div
            className={styles.historyList}
            layout={shouldReduceMotion ? false : true}
            transition={{ layout: HISTORY_LAYOUT_TRANSITION }}
          >
            <AnimatePresence initial={false}>
              {groupEntries(entries).map(([label, group]) => (
                <motion.section
                  key={label}
                  className={styles.historyGroup}
                  layout={shouldReduceMotion ? false : true}
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, y: -4 }
                  }
                  animate={
                    shouldReduceMotion ? undefined : { opacity: 1, y: 0 }
                  }
                  exit={
                    shouldReduceMotion ? undefined : { opacity: 0, y: -4 }
                  }
                  transition={{
                    layout: HISTORY_LAYOUT_TRANSITION,
                    ...HISTORY_PRESENCE_TRANSITION,
                  }}
                >
                  <motion.h2 layout="position">{label}</motion.h2>
                  <AnimatePresence initial={false}>
                    {group.map((entry) => (
                      <motion.div
                        key={entry.id}
                        className={`${styles.historyRow} ${
                          entry.id === activeId ? styles.historyItemActive : ""
                        }`}
                        layout={shouldReduceMotion ? false : "position"}
                        initial={
                          shouldReduceMotion
                            ? false
                            : { opacity: 0, x: -8, scale: 0.985 }
                        }
                        animate={
                          shouldReduceMotion
                            ? undefined
                            : { opacity: 1, x: 0, scale: 1 }
                        }
                        exit={
                          shouldReduceMotion
                            ? undefined
                            : { opacity: 0, x: -8, scale: 0.98 }
                        }
                        transition={{
                          layout: HISTORY_LAYOUT_TRANSITION,
                          ...HISTORY_PRESENCE_TRANSITION,
                        }}
                      >
                        <button
                          className={styles.historyItem}
                          type="button"
                          onClick={() => void selectEntry(entry)}
                        >
                          <span>{entry.title}</span>
                        </button>
                        <button
                          className={styles.deleteNoteButton}
                          type="button"
                          aria-label={`Удалить заметку ${entry.title}`}
                          onClick={() => void deleteEntry(entry)}
                        >
                          <TrashIcon />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.section>
              ))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>

        <button
          className={styles.mobileClose}
          type="button"
          onClick={() => setHistoryOpen(false)}
        >
          Закрыть
        </button>
      </motion.aside>

      <motion.section
        className={styles.editorPanel}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={styles.editorMeta}>
          <span>Рабочая область</span>
          <span className={styles.saveStatus} data-status={saveStatus}>
            {saveStatus === "loading"
              ? "Открываю..."
              : saveStatus === "saving"
                ? "Сохраняю..."
                : saveStatus === "error"
                  ? "Ошибка"
                  : "Сохранено"}
          </span>
        </div>

        {activeEntry ? (
          <RichEditor
            ref={editorRef}
            key={activeEntry.id}
            entryId={activeEntry.id}
            content={activeEntry.contentJson}
            onChange={handleEditorChange}
          />
        ) : (
          <div className={styles.emptyState}>
            <h2>Здесь пока тихо</h2>
            <p>Создай первую заметку, и дневник начнет собирать историю.</p>
            <button type="button" onClick={() => void createEntry()}>
              Новая заметка
            </button>
          </div>
        )}

        {error ? <p className={styles.errorText}>{error}</p> : null}
      </motion.section>

      <AnimatePresence>
        {commandOpen ? (
          <motion.div
            className={styles.commandOverlay}
            role="presentation"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className={styles.commandPalette}
              role="dialog"
              aria-label="Команды"
              initial={
                shouldReduceMotion
                  ? false
                  : { opacity: 0, y: 12, scale: 0.97 }
              }
              animate={
                shouldReduceMotion
                  ? undefined
                  : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                shouldReduceMotion
                  ? undefined
                  : { opacity: 0, y: 8, scale: 0.98 }
              }
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <input
                autoFocus
                value={commandSearch}
                placeholder="Что сделать?"
                onChange={(event) => setCommandSearch(event.target.value)}
              />
              <div className={styles.commandList}>
                {visibleCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => {
                      runCommand(command.id);
                      setCommandOpen(false);
                      setCommandSearch("");
                    }}
                  >
                    <span>{command.title}</span>
                    <small>{command.hint}</small>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";

          if (file) {
            void readImportFile(file);
          }
        }}
      />
    </main>
  );
}
