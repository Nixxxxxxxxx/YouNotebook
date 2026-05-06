import type { JSONContent } from "@tiptap/core";

export type DiaryContent = JSONContent;

export type DiaryEntry = {
  id: string;
  title: string;
  contentJson: DiaryContent;
  plainText: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

export type DiarySettings = {
  activeEntryId: string | null;
  schemaVersion: 1;
  editorMode: "rich";
  lastExportedAt: string | null;
};

export type DiaryExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  entries: DiaryEntry[];
  settings: DiarySettings;
};

export type ImportSummary = {
  imported: number;
  remappedIds: number;
  activeEntryId: string | null;
};

export type DiaryStorage = {
  listEntries(): Promise<DiaryEntry[]>;
  getEntry(id: string): Promise<DiaryEntry | null>;
  createEntry(
    entry?: Partial<
      Pick<DiaryEntry, "title" | "contentJson" | "plainText" | "lastOpenedAt">
    >,
  ): Promise<DiaryEntry>;
  updateEntry(
    id: string,
    patch: Partial<Omit<DiaryEntry, "id" | "createdAt">>,
  ): Promise<DiaryEntry>;
  deleteEntry(id: string): Promise<string | null>;
  getSettings(): Promise<DiarySettings>;
  markActiveEntry(id: string | null): Promise<DiarySettings>;
  exportData(): Promise<DiaryExportPayload>;
  importData(payload: DiaryExportPayload): Promise<ImportSummary>;
};
