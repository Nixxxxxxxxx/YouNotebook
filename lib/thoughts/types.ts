export type ThoughtSourceType = "manual" | "url" | "telegram";

export type ThoughtStatus = "inbox" | "archived";

export type ThoughtBranch = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type Thought = {
  id: string;
  branchId: string | null;
  title: string;
  summary: string | null;
  contentHtml: string;
  contentText: string;
  rawInput: string | null;
  sourceUrl: string | null;
  sourceType: ThoughtSourceType;
  imageUrl: string | null;
  faviconUrl: string | null;
  isUseful: boolean;
  status: ThoughtStatus;
  telegramChatId: string | null;
  telegramMessageId: string | null;
  telegramUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateThoughtInput = {
  input: string;
  branchId?: string | null;
  faviconUrl?: string | null;
  imageUrl?: string | null;
  isUseful?: boolean;
  sourceType?: ThoughtSourceType;
  snapshot?: {
    title: string;
    summary: string | null;
    contentHtml: string;
    contentText: string;
    rawInput: string;
    sourceUrl: string | null;
    sourceType: ThoughtSourceType;
    imageUrl: string | null;
    faviconUrl: string | null;
  };
  telegramChatId?: string | number | null;
  telegramMessageId?: string | number | null;
  telegramUserId?: string | number | null;
};

export type UpdateThoughtInput = {
  branchId?: string | null;
  contentText?: string;
  title?: string;
  isUseful?: boolean;
  status?: ThoughtStatus;
};

export type ThoughtListFilter =
  | { view?: "inbox"; branchId?: never }
  | { view: "collections"; branchId?: never }
  | { view: "useful"; branchId?: never }
  | { view: "branch"; branchId: string };

export type ThoughtListResult = {
  branches: ThoughtBranch[];
  thoughts: Thought[];
  unassignedCount: number;
};
