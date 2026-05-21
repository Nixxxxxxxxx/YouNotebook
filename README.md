# YouNotebook

Local-first личный дневник по Figma-макету: история заметок, rich editor, автосохранение, хоткеи и статичный фон 1:1 с макетом.

## Stack

- Next.js App Router
- React + TypeScript
- TipTap editor
- IndexedDB storage adapter
- CSS Modules

## Run

```bash
pnpm install
pnpm dev
```

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`

## Storage

Данные v1 хранятся локально в IndexedDB: `younotebook:v1`. Для безопасности есть ручной export/import JSON в command palette.

## Thought Store

`/thoughts` adds a server-backed "Склад мыслей" for saved materials, branches,
reader-view snapshots, and Telegram captures.

Required environment variables:

- `DATABASE_URL` - Supabase transaction pooler connection string
- `DIRECT_DATABASE_URL` - Supabase direct connection string
- `TELEGRAM_BOT_TOKEN` - BotFather token
- `TELEGRAM_ALLOWED_USER_IDS` - comma-separated Telegram user ids
- `TELEGRAM_WEBHOOK_SECRET` - secret token checked by webhook route
- `APP_BASE_URL` - deployed app URL, required for `/api/telegram/set-webhook`

Telegram webhook setup after deploy:

```bash
curl -X POST "$APP_BASE_URL/api/telegram/set-webhook" \
  -H "Authorization: Bearer $TELEGRAM_WEBHOOK_SECRET"
```
