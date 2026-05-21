import { getSql } from "@/lib/db/client";

import { createReaderSnapshot } from "./reader";
import type {
  CreateThoughtInput,
  Thought,
  ThoughtBranch,
  ThoughtListFilter,
  ThoughtListResult,
  UpdateThoughtInput,
} from "./types";

type BranchRow = {
  id: string;
  name: string;
  slug: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type ThoughtRow = {
  id: string;
  branch_id: string | null;
  title: string;
  summary: string | null;
  content_html: string;
  content_text: string;
  raw_input: string | null;
  source_url: string | null;
  source_type: Thought["sourceType"];
  image_url: string | null;
  favicon_url: string | null;
  is_useful: boolean;
  status: Thought["status"];
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
  telegram_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type TelegramUpdateStatus = "processing" | "processed" | "ignored" | "error";

let schemaPromise: Promise<void> | null = null;

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toBranch(row: BranchRow): ThoughtBranch {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toThought(row: ThoughtRow): Thought {
  return {
    id: row.id,
    branchId: row.branch_id,
    title: row.title,
    summary: row.summary,
    contentHtml: row.content_html,
    contentText: row.content_text,
    rawInput: row.raw_input,
    sourceUrl: row.source_url,
    sourceType: row.source_type,
    imageUrl: row.image_url,
    faviconUrl: row.favicon_url,
    isUseful: row.is_useful,
    status: row.status,
    telegramChatId: row.telegram_chat_id,
    telegramMessageId: row.telegram_message_id,
    telegramUserId: row.telegram_user_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createSlug(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `branch-${Date.now()}`;
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeBigInt(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value);
}

export async function ensureThoughtsSchema() {
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    const sql = getSql();

    await sql`create extension if not exists pgcrypto`;
    await sql`
      create table if not exists thought_branches (
        id uuid primary key default gen_random_uuid(),
        name text not null unique,
        slug text not null unique,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists thoughts (
        id uuid primary key default gen_random_uuid(),
        branch_id uuid references thought_branches(id) on delete set null,
        title text not null,
        summary text,
        content_html text not null,
        content_text text not null,
        raw_input text,
        source_url text,
        source_type text not null default 'manual'
          check (source_type in ('manual', 'url', 'telegram')),
        image_url text,
        favicon_url text,
        is_useful boolean not null default false,
        status text not null default 'inbox'
          check (status in ('inbox', 'archived')),
        telegram_chat_id bigint,
        telegram_message_id bigint,
        telegram_user_id bigint,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists telegram_updates (
        update_id bigint primary key,
        payload_json jsonb not null,
        status text not null default 'processing',
        error text,
        processed_at timestamptz
      )
    `;
    await sql`create index if not exists thoughts_branch_id_idx on thoughts(branch_id)`;
    await sql`create index if not exists thoughts_status_idx on thoughts(status)`;
    await sql`create index if not exists thoughts_created_at_idx on thoughts(created_at desc)`;
    await sql`create index if not exists thoughts_source_url_idx on thoughts(source_url)`;
  })();

  return schemaPromise;
}

export async function listThoughtBranches() {
  await ensureThoughtsSchema();
  const sql = getSql();
  const rows = await sql<BranchRow[]>`
    select id, name, slug, created_at, updated_at
    from thought_branches
    order by created_at asc
  `;

  return rows.map(toBranch);
}

export async function createThoughtBranch(name: string) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const cleanName = normalizeName(name);

  if (!cleanName) {
    throw new Error("Branch name is required");
  }

  const [row] = await sql<BranchRow[]>`
    insert into thought_branches (name, slug)
    values (${cleanName}, ${createSlug(cleanName)})
    on conflict (name) do update
      set updated_at = now()
    returning id, name, slug, created_at, updated_at
  `;

  return toBranch(row);
}

export async function getUnassignedThoughtCount() {
  await ensureThoughtsSchema();
  const sql = getSql();
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from thoughts
    where branch_id is null and status = 'inbox'
  `;

  return Number(row?.count ?? 0);
}

export async function listThoughts(
  filter: ThoughtListFilter = { view: "inbox" },
): Promise<ThoughtListResult> {
  await ensureThoughtsSchema();
  const sql = getSql();
  const branches = await listThoughtBranches();
  const unassignedCount = await getUnassignedThoughtCount();
  let rows: ThoughtRow[];

  if (filter.view === "branch") {
    rows = await sql<ThoughtRow[]>`
      select *
      from thoughts
      where branch_id = ${filter.branchId} and status = 'inbox'
      order by created_at desc
    `;
  } else if (filter.view === "useful") {
    rows = await sql<ThoughtRow[]>`
      select *
      from thoughts
      where is_useful = true and status = 'inbox'
      order by created_at desc
    `;
  } else {
    rows = await sql<ThoughtRow[]>`
      select *
      from thoughts
      where branch_id is null and status = 'inbox'
      order by created_at desc
    `;
  }

  return {
    branches,
    thoughts: rows.map(toThought),
    unassignedCount,
  };
}

export async function getThought(id: string) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const [row] = await sql<ThoughtRow[]>`
    select *
    from thoughts
    where id = ${id}
    limit 1
  `;

  return row ? toThought(row) : null;
}

export async function createThought(input: CreateThoughtInput) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const rawInput = input.input.trim();

  if (!rawInput) {
    throw new Error("Thought input is required");
  }

  const snapshot = await createReaderSnapshot(
    rawInput,
    input.sourceType ?? "manual",
  );
  const [row] = await sql<ThoughtRow[]>`
    insert into thoughts (
      branch_id,
      title,
      summary,
      content_html,
      content_text,
      raw_input,
      source_url,
      source_type,
      image_url,
      favicon_url,
      is_useful,
      telegram_chat_id,
      telegram_message_id,
      telegram_user_id
    )
    values (
      ${input.branchId ?? null},
      ${snapshot.title},
      ${snapshot.summary},
      ${snapshot.contentHtml},
      ${snapshot.contentText},
      ${snapshot.rawInput},
      ${snapshot.sourceUrl},
      ${snapshot.sourceType},
      ${snapshot.imageUrl},
      ${snapshot.faviconUrl},
      ${input.isUseful ?? false},
      ${normalizeBigInt(input.telegramChatId)},
      ${normalizeBigInt(input.telegramMessageId)},
      ${normalizeBigInt(input.telegramUserId)}
    )
    returning *
  `;

  return toThought(row);
}

export async function updateThought(id: string, patch: UpdateThoughtInput) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const existing = await getThought(id);

  if (!existing) {
    return null;
  }

  const [row] = await sql<ThoughtRow[]>`
    update thoughts
    set
      branch_id = ${patch.branchId === undefined ? existing.branchId : patch.branchId},
      title = ${patch.title?.trim() || existing.title},
      is_useful = ${patch.isUseful ?? existing.isUseful},
      status = ${patch.status ?? existing.status},
      updated_at = now()
    where id = ${id}
    returning *
  `;

  return toThought(row);
}

export async function deleteThought(id: string) {
  await ensureThoughtsSchema();
  const sql = getSql();
  await sql`delete from thoughts where id = ${id}`;
}

export async function beginTelegramUpdate(updateId: number, payload: unknown) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const rows = await sql<{ update_id: string }[]>`
    insert into telegram_updates (update_id, payload_json)
    values (${String(updateId)}, ${JSON.stringify(payload)}::jsonb)
    on conflict (update_id) do nothing
    returning update_id
  `;

  return rows.length > 0;
}

export async function finishTelegramUpdate(
  updateId: number,
  status: TelegramUpdateStatus,
  error: string | null = null,
) {
  await ensureThoughtsSchema();
  const sql = getSql();

  await sql`
    update telegram_updates
    set status = ${status}, error = ${error}, processed_at = now()
    where update_id = ${String(updateId)}
  `;
}
