# Family Tree

A free, local-first family tree app for ordinary families. No account needed. Everything is saved in your browser (IndexedDB) on this device.

## Features

- **Tree canvas:** pan, zoom (wheel, pinch, buttons), fit to screen, minimap, and Family, Ancestors, Descendants and Fan chart views.
- **Family-graph layout:**
  - Partners sit side by side.
  - Subtrees are packed using their outlines (contours).
  - In-law parents go beside the existing couple, never above another family's children.
  - Overlapping sibling lines go on separate tracks.
  - Where two families' lines cross, a small gap is drawn so it doesn't look like a connection.
  - Ancestors and descendants can be folded away, with a "+N" badge.
- **Fast adding:**
  - Hover (or tap) a card for the + Parent / Sibling / Spouse / Child buttons.
  - A small form opens with the surname pre-filled. Press Enter to save.
  - "Add as unknown" makes a placeholder; "Link an existing person" connects someone already in the tree.
  - Quick entry accepts a whole family typed as text.
  - Keyboard shortcuts: P, S, C, B, arrow keys, Enter, `/`.
- **Profiles** with tabs: About, Family, Timeline (confidence levels and disputed records), Photos & audio, and Links & social (only safe http(s) links are allowed).
- **Fuzzy dates:** accepts forms like `1902`, `12 Mar 1902`, `c. 1850`, `before 1900`, `1850–1855` and `BET … AND …`, and shows a "Reads as: …" hint while you type.
- **Research tools:**
  - Relationship finder, with the connecting path highlighted on the tree.
  - Search.
  - Data checks, plus duplicate detection with a side-by-side merge.
  - Statistics, a time slider, and "On this day".
  - A list of places, with an optional map. Place names are only looked up when you ask.
  - A printable report (save it as PDF), with an option to hide living people.
  - Stories: guided tours from person to person.
- **Multiple trees.** Imports always go into a new tree.
- **Import and export:**
  - GEDCOM 5.5.1 import and export.
  - Full JSON backup and restore.
  - Migration from Dynasty Chronicle backups.
  - Optional redaction of living people.
- **History:** undo/redo, plus a readable list of changes.
- **Privacy:** a Public view that hides living people's details.
- **Display:** light and dark mode, accessible dialogs and menus, and a phone-friendly layout.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright; run `npx playwright install chromium` once)
npm run build      # static build in dist/
```

The data layer is behind `TreeRepository` (`src/storage/repository.ts`), so a cloud backend such as Supabase can be added next to the IndexedDB one.

## Deploy

`.github/workflows/deploy.yml` tests the app and deploys `dist/` to GitHub Pages on every push to `main`/`master`. Under **Settings → Pages**, set the source to **GitHub Actions**. The build uses a relative `base`, so it works under any repository path.

## Project layout

| Folder | What's inside |
| --- | --- |
| `src/model` | Data model, dates, relationships, checks, statistics, quick entry |
| `src/io` | GEDCOM, JSON backup and the legacy migration |
| `src/layout` | Tree layout algorithm |
| `src/canvas` | Tree canvas, tiles and fan chart |
| `src/features` | Dialogs and panels (profile, search, report and so on) |
| `src/store` | Zustand store with undo/redo snapshots |
| `src/storage` | IndexedDB repository |
