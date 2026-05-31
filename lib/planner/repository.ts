import { ensureAuthSchema, getUserByTelegramUserId } from "@/lib/auth/repository";
import { getSql } from "@/lib/db/client";

import type {
  PlannerTask,
  PlannerTaskInput,
  PlannerTaskSource,
  PlannerVoiceProvider,
  PlannerVoiceSource,
} from "./types";

type PlannerTaskRow = {
  id: string;
  user_id: string;
  task_date: string;
  title: string;
  completed: boolean;
  sort_order: number;
  source: PlannerTaskSource;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

type PlannerTelegramLinkRow = {
  user_id: string;
  telegram_user_id: string | number;
  chat_id: string | number;
  business_connection_id: string | null;
  business_user_chat_id: string | number | null;
  business_enabled: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  last_seen_at: Date | string | null;
};

type PlannerChecklistTaskRow = {
  business_connection_id: string;
  chat_id: string | number;
  checklist_message_id: number;
  checklist_task_id: number;
  task_id: string;
};

type PlannerVoiceUsageStatsRow = {
  requests_today: number | string;
  total_seconds_today: number | string;
};

export type PlannerTelegramLink = {
  userId: string;
  telegramUserId: number;
  chatId: number;
  businessConnectionId: string | null;
  businessEnabled: boolean;
  businessUserChatId: number | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
};

type PlannerTelegramUpdateStatus =
  | "processing"
  | "processed"
  | "ignored"
  | "error";

let plannerSchemaPromise: Promise<void> | null = null;

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null) {
  return value ? toIso(value) : null;
}

function toPlannerTask(row: PlannerTaskRow): PlannerTask {
  return {
    id: row.id,
    title: row.title,
    date: row.task_date,
    completed: row.completed,
    sortOrder: row.sort_order,
    source: row.source,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: toNullableIso(row.completed_at),
  };
}

function toPlannerTelegramLink(row: PlannerTelegramLinkRow): PlannerTelegramLink {
  return {
    userId: row.user_id,
    telegramUserId: Number(row.telegram_user_id),
    chatId: Number(row.chat_id),
    businessConnectionId: row.business_connection_id,
    businessEnabled: row.business_enabled,
    businessUserChatId:
      row.business_user_chat_id === null ? null : Number(row.business_user_chat_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastSeenAt: toNullableIso(row.last_seen_at),
  };
}

function normalizeTaskTitle(title: string) {
  return title.replace(/\s+/g, " ").trim();
}

async function getNextSortOrder(userId: string, date: string) {
  const sql = getSql();
  const [row] = await sql<{ next_sort_order: number }[]>`
    select coalesce(max(sort_order), -1) + 1 as next_sort_order
    from planner_tasks
    where user_id = ${userId}
      and task_date = ${date}
  `;

  return row?.next_sort_order ?? 0;
}

export async function ensurePlannerSchema() {
  if (plannerSchemaPromise) {
    return plannerSchemaPromise;
  }

  plannerSchemaPromise = (async () => {
    await ensureAuthSchema();
    const sql = getSql();

    await sql`create extension if not exists pgcrypto`;
    await sql`
      create table if not exists planner_tasks (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references quietly_users(id) on delete cascade,
        task_date date not null,
        title text not null default '',
        completed boolean not null default false,
        sort_order integer not null default 0,
        source text not null default 'web'
          check (source in ('web', 'telegram')),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        completed_at timestamptz
      )
    `;
    await sql`
      create table if not exists planner_telegram_links (
        user_id uuid primary key references quietly_users(id) on delete cascade,
        telegram_user_id bigint not null unique,
        chat_id bigint not null,
        business_connection_id text,
        business_user_chat_id bigint,
        business_enabled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_seen_at timestamptz
      )
    `;
    await sql`
      alter table planner_telegram_links
      add column if not exists business_connection_id text
    `;
    await sql`
      alter table planner_telegram_links
      add column if not exists business_user_chat_id bigint
    `;
    await sql`
      alter table planner_telegram_links
      add column if not exists business_enabled boolean not null default false
    `;
    await sql`
      create table if not exists planner_telegram_checklist_tasks (
        business_connection_id text not null,
        chat_id bigint not null,
        checklist_message_id integer not null,
        checklist_task_id integer not null,
        task_id uuid not null references planner_tasks(id) on delete cascade,
        created_at timestamptz not null default now(),
        primary key (
          business_connection_id,
          chat_id,
          checklist_message_id,
          checklist_task_id
        )
      )
    `;
    await sql`
      create table if not exists planner_telegram_updates (
        update_id bigint primary key,
        payload_json jsonb not null,
        status text not null default 'processing',
        error text,
        created_at timestamptz not null default now(),
        processed_at timestamptz
      )
    `;
    await sql`
      create table if not exists planner_voice_usage (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references quietly_users(id) on delete cascade,
        source text not null check (source in ('web', 'telegram')),
        provider text not null check (provider in ('cloudflare', 'openai')),
        duration_seconds integer not null
          check (duration_seconds > 0 and duration_seconds <= 7200),
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists planner_tasks_user_date_sort_idx
      on planner_tasks(user_id, task_date, sort_order)
    `;
    await sql`
      create index if not exists planner_tasks_user_completed_idx
      on planner_tasks(user_id, completed)
    `;
    await sql`
      create index if not exists planner_telegram_links_chat_id_idx
      on planner_telegram_links(chat_id)
    `;
    await sql`
      create index if not exists planner_telegram_links_business_connection_idx
      on planner_telegram_links(business_connection_id)
    `;
    await sql`
      create index if not exists planner_voice_usage_user_created_idx
      on planner_voice_usage(user_id, created_at)
    `;
    await sql`
      create index if not exists planner_voice_usage_created_idx
      on planner_voice_usage(created_at)
    `;
  })();

  return plannerSchemaPromise;
}

export async function listPlannerTasks(
  userId: string,
  fromDate: string,
  toDate: string,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const rows = await sql<PlannerTaskRow[]>`
    select id,
      user_id,
      task_date::text as task_date,
      title,
      completed,
      sort_order,
      source,
      created_at,
      updated_at,
      completed_at
    from planner_tasks
    where user_id = ${userId}
      and task_date >= ${fromDate}
      and task_date <= ${toDate}
    order by task_date asc, sort_order asc, created_at asc
  `;

  return rows.map(toPlannerTask);
}

export async function listPlannerTasksByDate(userId: string, date: string) {
  return listPlannerTasks(userId, date, date);
}

export async function getPlannerTask(userId: string, id: string) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTaskRow[]>`
    select id,
      user_id,
      task_date::text as task_date,
      title,
      completed,
      sort_order,
      source,
      created_at,
      updated_at,
      completed_at
    from planner_tasks
    where user_id = ${userId}
      and id = ${id}
    limit 1
  `;

  return row ? toPlannerTask(row) : null;
}

export async function createPlannerTask(
  userId: string,
  input: PlannerTaskInput,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const title = normalizeTaskTitle(input.title);
  const sortOrder =
    input.sortOrder ?? (await getNextSortOrder(userId, input.date));
  const completed = input.completed ?? false;
  const source = input.source ?? "web";
  const [row] = await sql<PlannerTaskRow[]>`
    insert into planner_tasks (
      user_id,
      task_date,
      title,
      completed,
      sort_order,
      source,
      completed_at
    )
    values (
      ${userId},
      ${input.date},
      ${title},
      ${completed},
      ${sortOrder},
      ${source},
      ${completed ? sql`now()` : null}
    )
    returning id,
      user_id,
      task_date::text as task_date,
      title,
      completed,
      sort_order,
      source,
      created_at,
      updated_at,
      completed_at
  `;

  return toPlannerTask(row);
}

export async function createPlannerTasks(
  userId: string,
  inputs: PlannerTaskInput[],
) {
  await ensurePlannerSchema();

  const created: PlannerTask[] = [];

  for (const input of inputs) {
    created.push(await createPlannerTask(userId, input));
  }

  return created;
}

export async function updatePlannerTask(
  userId: string,
  id: string,
  patch: {
    completed?: boolean;
    date?: string;
    sortOrder?: number;
    title?: string;
  },
) {
  await ensurePlannerSchema();
  const existing = await getPlannerTask(userId, id);

  if (!existing) {
    return null;
  }

  const nextCompleted = patch.completed ?? existing.completed;
  const nextTitle =
    patch.title === undefined ? existing.title : normalizeTaskTitle(patch.title);
  const sql = getSql();
  const [row] = await sql<PlannerTaskRow[]>`
    update planner_tasks
    set task_date = ${patch.date ?? existing.date},
      title = ${nextTitle},
      completed = ${nextCompleted},
      sort_order = ${patch.sortOrder ?? existing.sortOrder},
      completed_at = ${
        nextCompleted
          ? existing.completedAt
            ? existing.completedAt
            : sql`now()`
          : null
      },
      updated_at = now()
    where user_id = ${userId}
      and id = ${id}
    returning id,
      user_id,
      task_date::text as task_date,
      title,
      completed,
      sort_order,
      source,
      created_at,
      updated_at,
      completed_at
  `;

  return row ? toPlannerTask(row) : null;
}

export async function deletePlannerTask(userId: string, id: string) {
  await ensurePlannerSchema();
  const sql = getSql();

  await sql`
    delete from planner_tasks
    where user_id = ${userId}
      and id = ${id}
  `;
}

export async function reorderPlannerTasks(
  userId: string,
  date: string,
  ids: string[],
) {
  await ensurePlannerSchema();
  const sql = getSql();

  for (const [index, id] of ids.entries()) {
    await sql`
      update planner_tasks
      set sort_order = ${index}, updated_at = now()
      where user_id = ${userId}
        and task_date = ${date}
        and id = ${id}
    `;
  }
}

export async function recordPlannerVoiceUsage(
  userId: string,
  {
    durationSeconds,
    provider,
    source,
  }: {
    durationSeconds: number;
    provider: PlannerVoiceProvider;
    source: PlannerVoiceSource;
  },
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const safeDurationSeconds = Math.max(
    1,
    Math.min(7200, Math.ceil(durationSeconds)),
  );

  await sql`
    insert into planner_voice_usage (
      user_id,
      source,
      provider,
      duration_seconds
    )
    values (
      ${userId},
      ${source},
      ${provider},
      ${safeDurationSeconds}
    )
  `;
}

export async function getPlannerVoiceUsageStats(userId: string) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [userRow] = await sql<PlannerVoiceUsageStatsRow[]>`
    select coalesce(sum(duration_seconds), 0)::int as total_seconds_today,
      count(*)::int as requests_today
    from planner_voice_usage
    where user_id = ${userId}
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  `;
  const [totalRow] = await sql<PlannerVoiceUsageStatsRow[]>`
    select coalesce(sum(duration_seconds), 0)::int as total_seconds_today,
      count(*)::int as requests_today
    from planner_voice_usage
    where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
  `;

  return {
    requestsToday: Number(userRow?.requests_today ?? 0),
    totalSecondsToday: Number(totalRow?.total_seconds_today ?? 0),
    userSecondsToday: Number(userRow?.total_seconds_today ?? 0),
  };
}

export async function beginPlannerTelegramUpdate(
  updateId: number,
  payload: unknown,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const rows = await sql<{ update_id: string }[]>`
    insert into planner_telegram_updates (update_id, payload_json)
    values (${String(updateId)}, ${sql.json(payload as Parameters<typeof sql.json>[0])})
    on conflict (update_id) do nothing
    returning update_id
  `;

  return rows.length > 0;
}

export async function finishPlannerTelegramUpdate(
  updateId: number,
  status: PlannerTelegramUpdateStatus,
  error: string | null = null,
) {
  await ensurePlannerSchema();
  const sql = getSql();

  await sql`
    update planner_telegram_updates
    set status = ${status}, error = ${error}, processed_at = now()
    where update_id = ${String(updateId)}
  `;
}

export async function upsertPlannerTelegramLink(
  userId: string,
  telegramUserId: number,
  chatId: number,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTelegramLinkRow[]>`
    insert into planner_telegram_links (
      user_id,
      telegram_user_id,
      chat_id,
      last_seen_at
    )
    values (${userId}, ${String(telegramUserId)}, ${String(chatId)}, now())
    on conflict (user_id) do update
      set telegram_user_id = excluded.telegram_user_id,
        chat_id = excluded.chat_id,
        updated_at = now(),
        last_seen_at = now()
    returning user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
  `;

  return toPlannerTelegramLink(row);
}

export async function getPlannerTelegramLinkByTelegramUserId(
  telegramUserId: number,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTelegramLinkRow[]>`
    select user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
    from planner_telegram_links
    where telegram_user_id = ${String(telegramUserId)}
    limit 1
  `;

  if (row) {
    return toPlannerTelegramLink(row);
  }

  const linkedUser = await getUserByTelegramUserId(telegramUserId);

  return linkedUser
    ? {
        userId: linkedUser.id,
        telegramUserId,
        chatId: telegramUserId,
        businessConnectionId: null,
        businessEnabled: false,
        businessUserChatId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSeenAt: null,
      }
    : null;
}

export async function getPlannerTelegramLinkByUserId(userId: string) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTelegramLinkRow[]>`
    select user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
    from planner_telegram_links
    where user_id = ${userId}
    limit 1
  `;

  return row ? toPlannerTelegramLink(row) : null;
}

export async function getPlannerTelegramLinkByBusinessConnectionId(
  businessConnectionId: string,
) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTelegramLinkRow[]>`
    select user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
    from planner_telegram_links
    where business_connection_id = ${businessConnectionId}
    limit 1
  `;

  return row ? toPlannerTelegramLink(row) : null;
}

export async function touchPlannerTelegramLink(
  telegramUserId: number,
  chatId: number,
) {
  await ensurePlannerSchema();
  const sql = getSql();

  await sql`
    update planner_telegram_links
    set chat_id = ${String(chatId)},
      updated_at = now(),
      last_seen_at = now()
    where telegram_user_id = ${String(telegramUserId)}
  `;
}

export async function listPlannerTelegramDigestTargets() {
  await ensurePlannerSchema();
  const sql = getSql();
  const rows = await sql<PlannerTelegramLinkRow[]>`
    select user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
    from planner_telegram_links
    order by created_at asc
  `;

  return rows.map(toPlannerTelegramLink);
}

export async function upsertPlannerBusinessConnection({
  businessConnectionId,
  businessEnabled,
  businessUserChatId,
  telegramUserId,
  userId,
}: {
  businessConnectionId: string;
  businessEnabled: boolean;
  businessUserChatId: number;
  telegramUserId: number;
  userId: string;
}) {
  await ensurePlannerSchema();
  const sql = getSql();
  const [row] = await sql<PlannerTelegramLinkRow[]>`
    insert into planner_telegram_links (
      user_id,
      telegram_user_id,
      chat_id,
      business_connection_id,
      business_user_chat_id,
      business_enabled,
      last_seen_at
    )
    values (
      ${userId},
      ${String(telegramUserId)},
      ${String(businessUserChatId)},
      ${businessConnectionId},
      ${String(businessUserChatId)},
      ${businessEnabled},
      now()
    )
    on conflict (user_id) do update
      set telegram_user_id = excluded.telegram_user_id,
        business_connection_id = excluded.business_connection_id,
        business_user_chat_id = excluded.business_user_chat_id,
        business_enabled = excluded.business_enabled,
        updated_at = now(),
        last_seen_at = now()
    returning user_id,
      telegram_user_id::text as telegram_user_id,
      chat_id::text as chat_id,
      business_connection_id,
      business_user_chat_id::text as business_user_chat_id,
      business_enabled,
      created_at,
      updated_at,
      last_seen_at
  `;

  return toPlannerTelegramLink(row);
}

export async function savePlannerChecklistTaskMappings({
  businessConnectionId,
  chatId,
  messageId,
  taskIds,
}: {
  businessConnectionId: string;
  chatId: number;
  messageId: number;
  taskIds: string[];
}) {
  await ensurePlannerSchema();
  const sql = getSql();

  for (const [index, taskId] of taskIds.entries()) {
    await sql`
      insert into planner_telegram_checklist_tasks (
        business_connection_id,
        chat_id,
        checklist_message_id,
        checklist_task_id,
        task_id
      )
      values (
        ${businessConnectionId},
        ${String(chatId)},
        ${messageId},
        ${index + 1},
        ${taskId}
      )
      on conflict (
        business_connection_id,
        chat_id,
        checklist_message_id,
        checklist_task_id
      ) do update
        set task_id = excluded.task_id
    `;
  }
}

export async function listPlannerTaskIdsByChecklistIds({
  businessConnectionId,
  chatId,
  checklistMessageId,
  checklistTaskIds,
}: {
  businessConnectionId: string;
  chatId: number;
  checklistMessageId: number;
  checklistTaskIds: number[];
}) {
  await ensurePlannerSchema();

  if (checklistTaskIds.length === 0) {
    return [];
  }

  const sql = getSql();
  const rows = await sql<PlannerChecklistTaskRow[]>`
    select business_connection_id,
      chat_id::text as chat_id,
      checklist_message_id,
      checklist_task_id,
      task_id
    from planner_telegram_checklist_tasks
    where business_connection_id = ${businessConnectionId}
      and chat_id = ${String(chatId)}
      and checklist_message_id = ${checklistMessageId}
      and checklist_task_id in ${sql(checklistTaskIds)}
  `;

  return rows.map((row) => row.task_id);
}
