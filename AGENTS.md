# Project Rules

## Goal
Build YouNotebook v1: a private, local-first personal diary with a calm glass interface, fast writing flow, reliable autosave, and a dynamic abstract background inspired by the Figma layout.

## Scope v1
- One personal diary, no accounts or profiles
- History list grouped by date: `Сегодня`, `Вчера`, then short dates like `05.04`
- Rich note editor with title editing, autosave, and basic formatting
- Keyboard shortcuts for core writing flows
- IndexedDB persistence through a storage adapter
- Manual JSON export and import from the command palette
- Responsive layout: desktop two-panel workspace, mobile editor-first flow

## Out of Scope v1
- Cloud sync
- User profiles and authentication
- Public APIs and backend database
- Encryption at rest
- AI features
- Collaboration

## UX Rules
- Writing comes first: no save button, no noisy controls, no blocking setup
- Preserve the Figma mood: black stage, blue orbital abstraction, local glass blur, rounded panels
- The active note must always be obvious in history
- Autosave state must be visible but quiet
- Empty states should invite writing, not explain the product at length
- Respect `prefers-reduced-motion`

## Engineering Rules
- TypeScript strict
- Next.js App Router
- Browser-only persistence is isolated behind `DiaryStorage`
- Store schema is versioned as `younotebook:v1`
- No backend clients at module scope
- Keep component boundaries small and readable
- Comments only when the logic is not self-explanatory

## Done Criteria
- Notes can be created, edited, selected, deleted, exported, imported, and restored after refresh
- Autosave works during fast typing and manual `Cmd/Ctrl+S`
- Hotkeys work on macOS and non-mac modifier keys
- App builds without TypeScript errors
- Core flows do not produce critical console errors

