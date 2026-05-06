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
