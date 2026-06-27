# AGENTS.md

## Cursor Cloud specific instructions

Excalidraw is a Yarn (classic, v1) workspaces monorepo. The primary deliverables are the
`@excalidraw/excalidraw` editor library (`packages/*`) and the excalidraw.com web app
(`excalidraw-app/`). Standard commands live in the root `package.json` `scripts` and in
`CLAUDE.md`; refer to those rather than duplicating them.

### Services / how to run

- The web app is the only service needed for end-to-end dev testing. Run `yarn start` from the
  repo root; Vite serves it on `http://localhost:3001/` (port set via `VITE_APP_PORT` in
  `.env.development`). The whiteboard is fully client-side — no local backend is required.
  Persistence/collab/library/AI backends default to hosted endpoints or browser storage.
- Optional, feature-specific services (not in this repo, not needed for core flows): the
  collaboration WebSocket server `excalidraw-room` (`localhost:3002`) for live multiplayer, and an
  AI backend (`localhost:3016`). Only run these when specifically testing collab/AI.

### Non-obvious caveats

- `yarn start` runs `yarn && vite`, so it reinstalls deps on launch and starts the Vite server
  plus a `vite-plugin-checker` TypeScript/ESLint overlay. The checker currently surfaces a
  pre-existing type error in `packages/excalidraw/tests/MermaidToExcalidraw.test.tsx` (LocalPoint
  `_brand`); this is only an overlay warning and does NOT prevent the app from serving (HTTP 200).
  Note `yarn test:typecheck` (plain `tsc`) passes — the checker uses a wider include than `tsc`.
- Running the examples (`yarn start:example`, `examples/with-nextjs`) requires the workspace
  packages to be built first (`yarn build:packages`). The main `excalidraw-app` does NOT need a
  prior package build because Vite resolves the packages via source path aliases.
- Test suite (`yarn test:app` / `vitest`): as of this branch, ~1405 tests pass but 10 tests in
  `packages/excalidraw/components/DefaultSidebar.test.tsx` and
  `packages/excalidraw/components/Sidebar/Sidebar.test.tsx` fail with
  `Cannot destructure property 'tunnelsJotai' of useTunnels() as it is null`. These reproduce in
  isolation on a clean tree (independent of environment setup) — treat them as a pre-existing
  failure, not something introduced by your changes.
- A `pre-commit` hook (husky + lint-staged) runs `eslint --fix` and `prettier --write` on staged
  files. Keep code lint/format-clean to avoid commit-time surprises.
