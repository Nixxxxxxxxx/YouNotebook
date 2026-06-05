# YouNotebook

Quietly is a private workspace for diary notes, planning, and saved thoughts.

## Stack

- Next.js App Router
- React + TypeScript
- TipTap editor
- IndexedDB storage adapter
- CSS Modules
- Custom email/password auth

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

## Auth

The app uses custom email/password auth with Postgres-backed users and
httpOnly session cookies. No Telegram login, magic links, or social auth.

Optional environment variable:

- `AUTH_BOOTSTRAP_OWNER_EMAIL` - email that should claim existing server-side
  Thought Store data. If omitted, the first registered account claims legacy
  thoughts and current `TELEGRAM_ALLOWED_USER_IDS`.

## Thought Store

`/thoughts` adds a server-backed "Склад мыслей" for saved materials, branches,
reader-view snapshots, and Telegram captures.

Required environment variables:

- `DATABASE_URL` - Supabase transaction pooler connection string
- `DIRECT_DATABASE_URL` - Supabase direct connection string
- `TELEGRAM_BOT_TOKEN` - BotFather token
- `TELEGRAM_ALLOWED_USER_IDS` - comma-separated Telegram user ids to seed for the bootstrap owner
- `TELEGRAM_WEBHOOK_SECRET` - secret token checked by webhook route
- `APP_BASE_URL` - deployed app URL, required for `/api/telegram/set-webhook`
- `AUTH_BOOTSTRAP_OWNER_EMAIL` - optional bootstrap owner for existing thoughts

Telegram webhook setup after deploy:

```bash
curl -X POST "$APP_BASE_URL/api/telegram/set-webhook" \
  -H "Authorization: Bearer $TELEGRAM_WEBHOOK_SECRET"
```

## Browser Extension MVP

The Chrome extension lives in `extension/` and uses Manifest V3. It lets a
signed-in user select visible references on Are.na, Pinterest, and Dribbble,
then save them to the Thought Store Inbox with an optional collection relation.

Local test flow:

```bash
pnpm build
```

Then open Chrome:

1. Go to `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the `extension/` folder.
5. Open the extension popup and click `Sign in`.
6. If the app asks for login, sign in, then click `Sign in` in the popup again.
7. Wait for `/extension-connect` to show that the extension is connected.
8. Open a supported page and click the extension icon.
9. Choose `No collection` or an existing collection.
10. Click `Select references`, select visible cards, then `Save selected`.

Notes:

- The extension does not auto-scroll or collect hidden/background items.
- Selected items are saved to Inbox even when a collection is chosen.
- Duplicates are skipped by source item id or canonical/source URL.
- Unsupported pages can be saved as a simple page link from the popup.
