import { getSql } from "@/lib/db/client";

import { createReaderSnapshot, createTextSnapshot } from "./reader";
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
  image_urls: unknown;
  favicon_url: string | null;
  is_useful: boolean;
  status: Thought["status"];
  telegram_chat_id: string | null;
  telegram_media_group_id: string | null;
  telegram_message_id: string | null;
  telegram_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type TelegramUpdateStatus = "processing" | "processed" | "ignored" | "error";

const TELEGRAM_IMAGE_FALLBACK = "Изображение из Telegram";

let schemaPromise: Promise<void> | null = null;

async function hasSchemaBaseline() {
  const sql = getSql();
  const [row] = await sql<{
    has_branch_index: boolean;
    has_branches: boolean;
    has_created_index: boolean;
    has_image_urls: boolean;
    has_migrations: boolean;
    has_media_group_index: boolean;
    has_source_index: boolean;
    has_status_index: boolean;
    has_telegram_media_group: boolean;
    has_telegram_updates: boolean;
    has_thoughts: boolean;
  }[]>`
    select
      to_regclass('public.thought_branches') is not null as has_branches,
      to_regclass('public.thoughts') is not null as has_thoughts,
      to_regclass('public.telegram_updates') is not null as has_telegram_updates,
      to_regclass('public.thought_schema_migrations') is not null as has_migrations,
      to_regclass('public.thoughts_branch_id_idx') is not null as has_branch_index,
      to_regclass('public.thoughts_status_idx') is not null as has_status_index,
      to_regclass('public.thoughts_created_at_idx') is not null as has_created_index,
      to_regclass('public.thoughts_source_url_idx') is not null as has_source_index,
      to_regclass('public.thoughts_telegram_media_group_idx') is not null as has_media_group_index,
      exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'thoughts'
          and column_name = 'image_urls'
      ) as has_image_urls,
      exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'thoughts'
          and column_name = 'telegram_media_group_id'
      ) as has_telegram_media_group
  `;

  if (
    !row?.has_branches ||
    !row.has_thoughts ||
    !row.has_telegram_updates ||
    !row.has_migrations ||
    !row.has_branch_index ||
    !row.has_status_index ||
    !row.has_created_index ||
    !row.has_source_index ||
    !row.has_media_group_index ||
    !row.has_image_urls ||
    !row.has_telegram_media_group
  ) {
    return false;
  }

  const [migration] = await sql<{
    has_gallery_migration: boolean;
    has_image_migration: boolean;
  }[]>`
    select
      exists(
        select 1
        from thought_schema_migrations
        where id = 'telegram-image-backfill-v1'
      ) as has_image_migration,
      exists(
        select 1
        from thought_schema_migrations
        where id = 'telegram-gallery-v1'
      ) as has_gallery_migration
  `;

  return Boolean(
    migration?.has_image_migration && migration.has_gallery_migration,
  );
}

function normalizeImageUrlList(
  value: unknown,
  fallback?: string | null,
): string[] {
  const rawUrls = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const urls = rawUrls.filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );

  if (fallback) {
    urls.unshift(fallback);
  }

  return Array.from(new Set(urls.map((url) => url.trim())));
}

function mergeImageUrls(...groups: Array<unknown>) {
  return Array.from(
    new Set(groups.flatMap((group) => normalizeImageUrlList(group))),
  );
}

function hasMeaningfulTelegramContent(contentText: string) {
  const cleanContent = contentText.trim();

  return cleanContent !== "" && cleanContent !== TELEGRAM_IMAGE_FALLBACK;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

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
  const imageUrls = normalizeImageUrlList(row.image_urls, row.image_url);

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
    imageUrl: imageUrls[0] ?? row.image_url,
    imageUrls,
    faviconUrl: row.favicon_url,
    isUseful: row.is_useful,
    status: row.status,
    telegramChatId: row.telegram_chat_id,
    telegramMediaGroupId: row.telegram_media_group_id,
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

function getThoughtImageUrls(input: CreateThoughtInput, imageUrl: string | null) {
  return normalizeImageUrlList(input.imageUrls ?? [], imageUrl);
}

async function resolveThoughtInput(input: CreateThoughtInput) {
  const rawInput = (input.snapshot?.rawInput ?? input.input).trim();

  if (!rawInput) {
    throw new Error("Thought input is required");
  }

  const snapshot =
    input.snapshot ??
    (await createReaderSnapshot(rawInput, input.sourceType ?? "manual"));
  const imageUrl =
    input.imageUrl === undefined ? snapshot.imageUrl : input.imageUrl;
  const imageUrls = getThoughtImageUrls(input, imageUrl);
  const faviconUrl =
    input.faviconUrl === undefined ? snapshot.faviconUrl : input.faviconUrl;

  return {
    branchId: input.branchId ?? null,
    contentHtml: snapshot.contentHtml,
    contentText: snapshot.contentText,
    faviconUrl,
    imageUrl: imageUrls[0] ?? imageUrl ?? null,
    imageUrls,
    isUseful: input.isUseful ?? false,
    rawInput: snapshot.rawInput,
    sourceType: snapshot.sourceType,
    sourceUrl: snapshot.sourceUrl,
    summary: snapshot.summary,
    telegramChatId: normalizeBigInt(input.telegramChatId),
    telegramMediaGroupId: input.telegramMediaGroupId ?? null,
    telegramMessageId: normalizeBigInt(input.telegramMessageId),
    telegramUserId: normalizeBigInt(input.telegramUserId),
    title: snapshot.title,
  };
}

async function insertResolvedThought(
  resolved: Awaited<ReturnType<typeof resolveThoughtInput>>,
) {
  const sql = getSql();
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
      image_urls,
      favicon_url,
      is_useful,
      telegram_chat_id,
      telegram_media_group_id,
      telegram_message_id,
      telegram_user_id
    )
    values (
      ${resolved.branchId},
      ${resolved.title},
      ${resolved.summary},
      ${resolved.contentHtml},
      ${resolved.contentText},
      ${resolved.rawInput},
      ${resolved.sourceUrl},
      ${resolved.sourceType},
      ${resolved.imageUrl},
      ${sql.json(resolved.imageUrls)},
      ${resolved.faviconUrl},
      ${resolved.isUseful},
      ${resolved.telegramChatId},
      ${resolved.telegramMediaGroupId},
      ${resolved.telegramMessageId},
      ${resolved.telegramUserId}
    )
    returning *
  `;

  return toThought(row);
}

async function findTelegramMediaGroupThought(
  telegramChatId: string | null,
  telegramMediaGroupId: string | null,
) {
  if (!telegramChatId || !telegramMediaGroupId) {
    return null;
  }

  const sql = getSql();
  const [row] = await sql<ThoughtRow[]>`
    select *
    from thoughts
    where telegram_chat_id = ${telegramChatId}
      and telegram_media_group_id = ${telegramMediaGroupId}
    order by created_at asc
    limit 1
  `;

  return row ?? null;
}

async function appendTelegramMediaGroupThought(
  existingRow: ThoughtRow,
  resolved: Awaited<ReturnType<typeof resolveThoughtInput>>,
) {
  const sql = getSql();
  const existingImages = normalizeImageUrlList(
    existingRow.image_urls,
    existingRow.image_url,
  );
  const imageUrls = mergeImageUrls(existingImages, resolved.imageUrls);
  const shouldReplaceContent =
    !hasMeaningfulTelegramContent(existingRow.content_text) &&
    hasMeaningfulTelegramContent(resolved.contentText);
  const nextContentHtml = shouldReplaceContent
    ? resolved.contentHtml
    : existingRow.content_html;
  const nextContentText = shouldReplaceContent
    ? resolved.contentText
    : existingRow.content_text;
  const nextRawInput = shouldReplaceContent
    ? resolved.rawInput
    : existingRow.raw_input;
  const nextSourceUrl = shouldReplaceContent
    ? resolved.sourceUrl
    : existingRow.source_url ?? resolved.sourceUrl;
  const nextTitle = shouldReplaceContent ? resolved.title : existingRow.title;
  const nextSummary = shouldReplaceContent
    ? resolved.summary
    : existingRow.summary;
  const [row] = await sql<ThoughtRow[]>`
    update thoughts
    set title = ${nextTitle},
      summary = ${nextSummary},
      content_html = ${nextContentHtml},
      content_text = ${nextContentText},
      raw_input = ${nextRawInput},
      source_url = ${nextSourceUrl},
      image_url = ${imageUrls[0] ?? null},
      image_urls = ${sql.json(imageUrls)},
      favicon_url = ${existingRow.favicon_url ?? resolved.faviconUrl},
      updated_at = now()
    where id = ${existingRow.id}
    returning *
  `;

  return toThought(row);
}

export async function ensureThoughtsSchema() {
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = (async () => {
    if (await hasSchemaBaseline()) {
      return;
    }

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
        image_urls jsonb not null default '[]'::jsonb,
        favicon_url text,
        is_useful boolean not null default false,
        status text not null default 'inbox'
          check (status in ('inbox', 'archived')),
        telegram_chat_id bigint,
        telegram_media_group_id text,
        telegram_message_id bigint,
        telegram_user_id bigint,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      alter table thoughts
      add column if not exists image_urls jsonb not null default '[]'::jsonb
    `;
    await sql`
      alter table thoughts
      add column if not exists telegram_media_group_id text
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
    await sql`
      create table if not exists thought_schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `;
    const [telegramImageMigration] = await sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from thought_schema_migrations
        where id = 'telegram-image-backfill-v1'
      ) as exists
    `;

    if (!telegramImageMigration?.exists) {
      await sql`
        update telegram_updates
        set payload_json = (payload_json #>> '{}')::jsonb
        where jsonb_typeof(payload_json) = 'string'
          and (payload_json #>> '{}') like '{%'
      `;
      await sql`
        with update_messages as (
          select coalesce(
            payload_json -> 'message',
            payload_json -> 'edited_message',
            payload_json -> 'channel_post',
            payload_json -> 'edited_channel_post'
          ) as message
          from telegram_updates
          where jsonb_typeof(payload_json) = 'object'
        ),
        message_images as (
          select
            message ->> 'message_id' as message_id,
            coalesce(
              (
                select photo.item ->> 'file_id'
                from jsonb_array_elements(
                  coalesce(message -> 'photo', '[]'::jsonb)
                ) as photo(item)
                order by coalesce(
                  nullif(photo.item ->> 'file_size', '')::bigint,
                  nullif(photo.item ->> 'width', '')::int *
                    nullif(photo.item ->> 'height', '')::int,
                  0
                ) desc
                limit 1
              ),
              case
                when message #>> '{document,mime_type}' like 'image/%'
                then message #>> '{document,file_id}'
              end
            ) as file_id
          from update_messages
          where message is not null
        )
        update thoughts
        set image_url = '/api/telegram/file/' || message_images.file_id,
          updated_at = now()
        from message_images
        where thoughts.source_type = 'telegram'
          and thoughts.image_url is null
          and thoughts.telegram_message_id::text = message_images.message_id
          and message_images.file_id is not null
      `;
      await sql`
        insert into thought_schema_migrations (id)
        values ('telegram-image-backfill-v1')
        on conflict (id) do nothing
      `;
    }
    const [telegramGalleryMigration] = await sql<{ exists: boolean }[]>`
      select exists(
        select 1
        from thought_schema_migrations
        where id = 'telegram-gallery-v1'
      ) as exists
    `;

    if (!telegramGalleryMigration?.exists) {
      await sql`
        update telegram_updates
        set payload_json = (payload_json #>> '{}')::jsonb
        where jsonb_typeof(payload_json) = 'string'
          and (payload_json #>> '{}') like '{%'
      `;
      await sql`
        with update_messages as (
          select coalesce(
            payload_json -> 'message',
            payload_json -> 'edited_message',
            payload_json -> 'channel_post',
            payload_json -> 'edited_channel_post'
          ) as message
          from telegram_updates
          where jsonb_typeof(payload_json) = 'object'
        ),
        message_groups as (
          select
            message ->> 'message_id' as message_id,
            message #>> '{chat,id}' as chat_id,
            message ->> 'media_group_id' as media_group_id
          from update_messages
          where message is not null
            and message ->> 'media_group_id' is not null
        )
        update thoughts
        set telegram_media_group_id = message_groups.media_group_id,
          updated_at = now()
        from message_groups
        where thoughts.source_type = 'telegram'
          and thoughts.telegram_media_group_id is null
          and thoughts.telegram_message_id::text = message_groups.message_id
          and thoughts.telegram_chat_id::text = message_groups.chat_id
      `;
      await sql`
        update thoughts
        set image_urls = jsonb_build_array(image_url)
        where image_url is not null
          and jsonb_array_length(image_urls) = 0
      `;
      await sql`
        with grouped as (
          select
            telegram_chat_id,
            telegram_media_group_id,
            (
              array_agg(
                id
                order by
                  case
                    when content_text <> ${TELEGRAM_IMAGE_FALLBACK} then 0
                    else 1
                  end,
                  created_at asc
              )
            )[1] as keep_id,
            array_agg(id) as ids
          from thoughts
          where telegram_chat_id is not null
            and telegram_media_group_id is not null
          group by telegram_chat_id, telegram_media_group_id
          having count(*) > 1
        ),
        dedup_images as (
          select
            keep_id,
            coalesce(jsonb_agg(image_url order by created_at), '[]'::jsonb) as image_urls
          from (
            select distinct on (grouped.keep_id, thoughts.image_url)
              grouped.keep_id,
              thoughts.image_url,
              thoughts.created_at
            from grouped
            join thoughts on thoughts.id = any(grouped.ids)
            where thoughts.image_url is not null
            order by grouped.keep_id, thoughts.image_url, thoughts.created_at
          ) images
          group by keep_id
        ),
        best_content as (
          select distinct on (grouped.keep_id)
            grouped.keep_id,
            thoughts.title,
            thoughts.summary,
            thoughts.content_html,
            thoughts.content_text,
            thoughts.raw_input,
            thoughts.source_url,
            thoughts.favicon_url
          from grouped
          join thoughts on thoughts.id = any(grouped.ids)
          order by
            grouped.keep_id,
            case
              when thoughts.content_text <> ${TELEGRAM_IMAGE_FALLBACK} then 0
              else 1
            end,
            length(coalesce(thoughts.content_text, '')) desc,
            thoughts.created_at asc
        )
        update thoughts
        set title = best_content.title,
          summary = best_content.summary,
          content_html = best_content.content_html,
          content_text = best_content.content_text,
          raw_input = best_content.raw_input,
          source_url = best_content.source_url,
          image_url = coalesce(dedup_images.image_urls ->> 0, thoughts.image_url),
          image_urls = coalesce(dedup_images.image_urls, thoughts.image_urls),
          favicon_url = coalesce(thoughts.favicon_url, best_content.favicon_url),
          updated_at = now()
        from best_content
        left join dedup_images on dedup_images.keep_id = best_content.keep_id
        where thoughts.id = best_content.keep_id
      `;
      await sql`
        with grouped as (
          select
            (
              array_agg(
                id
                order by
                  case
                    when content_text <> ${TELEGRAM_IMAGE_FALLBACK} then 0
                    else 1
                  end,
                  created_at asc
              )
            )[1] as keep_id,
            array_agg(id) as ids
          from thoughts
          where telegram_chat_id is not null
            and telegram_media_group_id is not null
          group by telegram_chat_id, telegram_media_group_id
          having count(*) > 1
        )
        delete from thoughts
        using grouped
        where thoughts.id = any(grouped.ids)
          and thoughts.id <> grouped.keep_id
      `;
      await sql`
        insert into thought_schema_migrations (id)
        values ('telegram-gallery-v1')
        on conflict (id) do nothing
      `;
    }
    await sql`create index if not exists thoughts_branch_id_idx on thoughts(branch_id)`;
    await sql`create index if not exists thoughts_status_idx on thoughts(status)`;
    await sql`create index if not exists thoughts_created_at_idx on thoughts(created_at desc)`;
    await sql`create index if not exists thoughts_source_url_idx on thoughts(source_url)`;
    await sql`
      create unique index if not exists thoughts_telegram_media_group_idx
      on thoughts(telegram_chat_id, telegram_media_group_id)
    `;
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

export async function updateThoughtBranch(id: string, name: string) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const cleanName = normalizeName(name);

  if (!cleanName) {
    throw new Error("Branch name is required");
  }

  const [row] = await sql<BranchRow[]>`
    update thought_branches
    set name = ${cleanName},
      slug = ${createSlug(cleanName)},
      updated_at = now()
    where id = ${id}
    returning id, name, slug, created_at, updated_at
  `;

  return row ? toBranch(row) : null;
}

export async function deleteThoughtBranch(id: string) {
  await ensureThoughtsSchema();
  const sql = getSql();

  await sql`
    delete from thought_branches
    where id = ${id}
  `;
}

export async function getUnassignedThoughtCount() {
  await ensureThoughtsSchema();
  const sql = getSql();
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from thoughts
    where branch_id is null and is_useful = false and status = 'inbox'
  `;

  return Number(row?.count ?? 0);
}

export async function listThoughts(
  filter: ThoughtListFilter = { view: "inbox" },
): Promise<ThoughtListResult> {
  await ensureThoughtsSchema();
  const sql = getSql();
  const branchesPromise = sql<BranchRow[]>`
    select id, name, slug, created_at, updated_at
    from thought_branches
    order by created_at asc
  `;
  const unassignedCountPromise = sql<{ count: string }[]>`
    select count(*)::text as count
    from thoughts
    where branch_id is null and is_useful = false and status = 'inbox'
  `;
  let rowsPromise: Promise<ThoughtRow[]>;

  if (filter.view === "branch") {
    rowsPromise = sql<ThoughtRow[]>`
      select *
      from thoughts
      where branch_id = ${filter.branchId} and status = 'inbox'
      order by created_at desc
    `;
  } else if (filter.view === "collections") {
    rowsPromise = sql<ThoughtRow[]>`
      select thoughts.*
      from thoughts
      join thought_branches on thought_branches.id = thoughts.branch_id
      where thoughts.branch_id is not null and thoughts.status = 'inbox'
      order by thought_branches.created_at asc, thoughts.created_at desc
    `;
  } else if (filter.view === "useful") {
    rowsPromise = sql<ThoughtRow[]>`
      select *
      from thoughts
      where is_useful = true and status = 'inbox'
      order by created_at desc
    `;
  } else {
    rowsPromise = sql<ThoughtRow[]>`
      select *
      from thoughts
      where branch_id is null and is_useful = false and status = 'inbox'
      order by created_at desc
    `;
  }

  const [branchRows, unassignedRows, rows] = await Promise.all([
    branchesPromise,
    unassignedCountPromise,
    rowsPromise,
  ]);

  return {
    branches: branchRows.map(toBranch),
    thoughts: rows.map(toThought),
    unassignedCount: Number(unassignedRows[0]?.count ?? 0),
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
  const resolved = await resolveThoughtInput(input);

  return insertResolvedThought(resolved);
}

export async function createOrAppendTelegramThought(input: CreateThoughtInput) {
  await ensureThoughtsSchema();
  const resolved = await resolveThoughtInput(input);

  if (!resolved.telegramChatId || !resolved.telegramMediaGroupId) {
    return insertResolvedThought(resolved);
  }

  const existingRow = await findTelegramMediaGroupThought(
    resolved.telegramChatId,
    resolved.telegramMediaGroupId,
  );

  if (existingRow) {
    return appendTelegramMediaGroupThought(existingRow, resolved);
  }

  try {
    return await insertResolvedThought(resolved);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const nextExistingRow = await findTelegramMediaGroupThought(
      resolved.telegramChatId,
      resolved.telegramMediaGroupId,
    );

    if (!nextExistingRow) {
      throw error;
    }

    return appendTelegramMediaGroupThought(nextExistingRow, resolved);
  }
}

export async function updateThought(id: string, patch: UpdateThoughtInput) {
  await ensureThoughtsSchema();
  const sql = getSql();
  const existing = await getThought(id);

  if (!existing) {
    return null;
  }

  const contentPatch =
    patch.contentText !== undefined
      ? createTextSnapshot(patch.contentText, existing.sourceType)
      : null;
  const nextTitle =
    patch.title?.trim() ||
    contentPatch?.title ||
    existing.title;

  const [row] = await sql<ThoughtRow[]>`
    update thoughts
    set
      branch_id = ${patch.branchId === undefined ? existing.branchId : patch.branchId},
      title = ${nextTitle},
      summary = ${contentPatch?.summary ?? existing.summary},
      content_html = ${contentPatch?.contentHtml ?? existing.contentHtml},
      content_text = ${contentPatch?.contentText ?? existing.contentText},
      raw_input = ${contentPatch?.rawInput ?? existing.rawInput},
      is_useful = ${patch.isUseful ?? existing.isUseful},
      status = ${patch.status ?? existing.status},
      updated_at = now()
    where id = ${id}
    returning *
  `;

  return toThought(row);
}

export async function moveThoughtsToBranch(
  ids: string[],
  branchId: string | null,
) {
  await ensureThoughtsSchema();

  if (ids.length === 0) {
    return [];
  }

  const sql = getSql();
  const rows = await sql<ThoughtRow[]>`
    update thoughts
    set branch_id = ${branchId},
      updated_at = now()
    where id in ${sql(ids)}
    returning *
  `;

  return rows.map(toThought);
}

export async function markThoughtsAsUseful(ids: string[]) {
  await ensureThoughtsSchema();

  if (ids.length === 0) {
    return [];
  }

  const sql = getSql();
  const rows = await sql<ThoughtRow[]>`
    update thoughts
    set is_useful = true,
      updated_at = now()
    where id in ${sql(ids)}
    returning *
  `;

  return rows.map(toThought);
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
    values (${String(updateId)}, ${sql.json(payload as Parameters<typeof sql.json>[0])})
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
