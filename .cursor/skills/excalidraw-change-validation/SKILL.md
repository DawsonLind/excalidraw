---
name: excalidraw-change-validation
description: Validates Excalidraw implementation changes with workspace-aware tests, typechecking, formatting, and snapshot review. Use when implementing, verifying, or preparing changes in the Excalidraw monorepo.
---

# Excalidraw Change Validation

## 1. Identify the affected area

- Editor or reusable behavior: `packages/excalidraw/`
- Shared primitives: the owning package under `packages/`
- Website-only behavior: `excalidraw-app/`
- Integration behavior: the owning project under `examples/`

Inspect nearby tests and package scripts before choosing commands.

## 2. Run the smallest useful test

Prefer a targeted Vitest file while iterating:

```bash
yarn test:app path/to/affected.test.tsx --watch=false
```

Broaden to `yarn test:app --watch=false` when shared behavior or test setup changes.

## 3. Run repository checks

```bash
yarn test:typecheck
yarn fix
```

Run `yarn test:code` and `yarn test:other` when verifying without modifying files. Before committing, run the repository-required `yarn test:update`.

## 4. Treat snapshots as reviewed output

Use `yarn test:update` only when snapshot changes are expected. Inspect every updated snapshot and revert unrelated churn.

## 5. Report evidence

State which checks ran, whether they passed, and any checks skipped. Do not claim success from static inspection alone.
