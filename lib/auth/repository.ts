import { getSql } from "@/lib/db/client";

import { hashPassword, verifyPassword } from "./password";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./session";
import { AuthError, type AuthSession, type AuthUser } from "./types";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_active_at: Date | string | null;
};

type SessionUserRow = UserRow & {
  expires_at: Date | string;
};

export type TelegramLink = {
  telegramUserId: string;
  createdAt: string;
};

type TelegramLinkRow = {
  telegram_user_id: string | number;
  created_at: Date | string;
  user_id?: string;
};

let authSchemaPromise: Promise<void> | null = null;

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null) {
  return value ? toIso(value) : null;
}

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastActiveAt: toNullableIso(row.last_active_at),
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function getBootstrapOwnerEmail() {
  return process.env.AUTH_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase() ?? "";
}

function getAllowedTelegramUserIds() {
  return (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function hasTable(tableName: string) {
  const sql = getSql();
  const [row] = await sql<{ exists: boolean }[]>`
    select to_regclass(${`public.${tableName}`}) is not null as exists
  `;

  return Boolean(row?.exists);
}

async function claimLegacyThoughtStore(userId: string) {
  const sql = getSql();

  if (await hasTable("thought_branches")) {
    await sql`
      alter table thought_branches
      add column if not exists user_id uuid references quietly_users(id) on delete cascade
    `;
    await sql`
      update thought_branches
      set user_id = ${userId}
      where user_id is null
    `;
  }

  if (await hasTable("thoughts")) {
    await sql`
      alter table thoughts
      add column if not exists user_id uuid references quietly_users(id) on delete cascade
    `;
    await sql`
      update thoughts
      set user_id = ${userId}
      where user_id is null
    `;
  }
}

async function claimBootstrapOwnership(user: AuthUser, userCount: number) {
  const bootstrapOwnerEmail = getBootstrapOwnerEmail();
  const shouldClaim =
    bootstrapOwnerEmail.length > 0
      ? user.email === bootstrapOwnerEmail
      : userCount === 1;

  if (!shouldClaim) {
    return;
  }

  await claimLegacyThoughtStore(user.id);

  const telegramUserIds = getAllowedTelegramUserIds();

  if (telegramUserIds.length === 0) {
    return;
  }

  const sql = getSql();

  for (const telegramUserId of telegramUserIds) {
    await sql`
      insert into user_telegram_links (user_id, telegram_user_id)
      values (${user.id}, ${telegramUserId})
      on conflict (telegram_user_id) do update
        set user_id = excluded.user_id
    `;
  }
}

export async function ensureAuthSchema() {
  if (authSchemaPromise) {
    return authSchemaPromise;
  }

  authSchemaPromise = (async () => {
    const sql = getSql();

    await sql`create extension if not exists pgcrypto`;
    await sql`
      create table if not exists quietly_users (
        id uuid primary key default gen_random_uuid(),
        email text not null unique,
        password_hash text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_active_at timestamptz
      )
    `;
    await sql`
      create table if not exists quietly_sessions (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references quietly_users(id) on delete cascade,
        token_hash text not null unique,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        last_seen_at timestamptz
      )
    `;
    await sql`
      create table if not exists user_telegram_links (
        user_id uuid not null references quietly_users(id) on delete cascade,
        telegram_user_id bigint not null unique,
        created_at timestamptz not null default now(),
        primary key (user_id, telegram_user_id)
      )
    `;
    await sql`
      create index if not exists quietly_sessions_user_id_idx
      on quietly_sessions(user_id)
    `;
    await sql`
      create index if not exists quietly_sessions_expires_at_idx
      on quietly_sessions(expires_at)
    `;
  })();

  return authSchemaPromise;
}

export async function createUserWithPassword(email: string, password: string) {
  await ensureAuthSchema();
  const sql = getSql();
  const passwordHash = await hashPassword(password);

  try {
    const [row] = await sql<UserRow[]>`
      insert into quietly_users (email, password_hash, last_active_at)
      values (${email}, ${passwordHash}, now())
      returning id, email, password_hash, created_at, updated_at, last_active_at
    `;
    const user = toUser(row);
    const [countRow] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from quietly_users
    `;

    await claimBootstrapOwnership(user, Number(countRow?.count ?? 0));

    return user;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AuthError(
        "email_taken",
        "Аккаунт с таким email уже есть",
        409,
      );
    }

    throw error;
  }
}

export async function findUserByEmail(email: string) {
  await ensureAuthSchema();
  const sql = getSql();
  const [row] = await sql<UserRow[]>`
    select id, email, password_hash, created_at, updated_at, last_active_at
    from quietly_users
    where email = ${email}
    limit 1
  `;

  return row ?? null;
}

export async function verifyUserCredentials(email: string, password: string) {
  const row = await findUserByEmail(email);

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new AuthError("login_failed", "Email или пароль не подошли", 401);
  }

  return toUser(row);
}

export async function updateUserPassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
) {
  await ensureAuthSchema();
  const sql = getSql();
  const [row] = await sql<UserRow[]>`
    select id, email, password_hash, created_at, updated_at, last_active_at
    from quietly_users
    where id = ${userId}
    limit 1
  `;

  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new AuthError(
      "password_current_wrong",
      "Текущий пароль не подошел",
      401,
    );
  }

  const passwordHash = await hashPassword(nextPassword);
  const [updatedRow] = await sql<UserRow[]>`
    update quietly_users
    set password_hash = ${passwordHash},
      updated_at = now(),
      last_active_at = now()
    where id = ${userId}
    returning id, email, password_hash, created_at, updated_at, last_active_at
  `;

  return toUser(updatedRow);
}

export async function createSessionForUser(userId: string): Promise<AuthSession> {
  await ensureAuthSchema();
  const sql = getSql();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = createSessionExpiry();
  const [row] = await sql<UserRow[]>`
    update quietly_users
    set last_active_at = now()
    where id = ${userId}
    returning id, email, password_hash, created_at, updated_at, last_active_at
  `;

  await sql`
    delete from quietly_sessions
    where expires_at <= now()
  `;
  await sql`
    insert into quietly_sessions (user_id, token_hash, expires_at, last_seen_at)
    values (${userId}, ${tokenHash}, ${expiresAt}, now())
  `;

  return {
    expiresAt,
    token,
    user: toUser(row),
  };
}

export async function getUserBySessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  await ensureAuthSchema();
  const sql = getSql();
  const tokenHash = hashSessionToken(token);
  const [row] = await sql<SessionUserRow[]>`
    select quietly_users.id,
      quietly_users.email,
      quietly_users.password_hash,
      quietly_users.created_at,
      quietly_users.updated_at,
      quietly_users.last_active_at,
      quietly_sessions.expires_at
    from quietly_sessions
    join quietly_users on quietly_users.id = quietly_sessions.user_id
    where quietly_sessions.token_hash = ${tokenHash}
      and quietly_sessions.expires_at > now()
    limit 1
  `;

  if (!row) {
    return null;
  }

  await sql`
    update quietly_sessions
    set last_seen_at = now()
    where token_hash = ${tokenHash}
  `;
  await sql`
    update quietly_users
    set last_active_at = now()
    where id = ${row.id}
  `;

  return toUser(row);
}

export async function deleteSessionByToken(token: string | undefined | null) {
  if (!token) {
    return;
  }

  await ensureAuthSchema();
  const sql = getSql();

  await sql`
    delete from quietly_sessions
    where token_hash = ${hashSessionToken(token)}
  `;
}

export async function getUserByTelegramUserId(telegramUserId: number) {
  await ensureAuthSchema();
  const sql = getSql();
  const [row] = await sql<UserRow[]>`
    select quietly_users.id,
      quietly_users.email,
      quietly_users.password_hash,
      quietly_users.created_at,
      quietly_users.updated_at,
      quietly_users.last_active_at
    from user_telegram_links
    join quietly_users on quietly_users.id = user_telegram_links.user_id
    where user_telegram_links.telegram_user_id = ${String(telegramUserId)}
    limit 1
  `;

  return row ? toUser(row) : null;
}

export async function listTelegramLinks(userId: string): Promise<TelegramLink[]> {
  await ensureAuthSchema();
  const sql = getSql();
  const rows = await sql<TelegramLinkRow[]>`
    select telegram_user_id::text as telegram_user_id,
      created_at
    from user_telegram_links
    where user_id = ${userId}
    order by created_at asc
  `;

  return rows.map((row) => ({
    telegramUserId: String(row.telegram_user_id),
    createdAt: toIso(row.created_at),
  }));
}

export async function addTelegramLink(userId: string, telegramUserId: string) {
  await ensureAuthSchema();
  const sql = getSql();

  try {
    const [row] = await sql<TelegramLinkRow[]>`
      insert into user_telegram_links (user_id, telegram_user_id)
      values (${userId}, ${telegramUserId})
      on conflict (user_id, telegram_user_id) do update
        set user_id = excluded.user_id
      returning telegram_user_id::text as telegram_user_id,
        created_at
    `;

    return {
      telegramUserId: String(row.telegram_user_id),
      createdAt: toIso(row.created_at),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AuthError(
        "telegram_link_taken",
        "Этот Telegram уже подключен к другому пространству",
        409,
      );
    }

    throw error;
  }
}

export async function removeTelegramLink(userId: string, telegramUserId: string) {
  await ensureAuthSchema();
  const sql = getSql();

  await sql`
    delete from user_telegram_links
    where user_id = ${userId}
      and telegram_user_id = ${telegramUserId}
  `;
}
