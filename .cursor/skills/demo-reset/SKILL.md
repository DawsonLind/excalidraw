---
name: demo-reset
description: >-
  Resets the DawsonLind/excalidraw demo fork to a clean baseline: Linear Exalidraw
  issues to Todo, close open PRs, delete demo feature branches, discard WIP, and
  remove demo feature commits from master. Use when the user asks to reset the
  demo, clean the project for a fresh demo, or run /demo-reset.
disable-model-invocation: true
---

# Demo Reset (Excalidraw fork)

Return this repo to the clean demo baseline established after the Aug 2026 reset.

## Clean baseline (target state)

| Area | Target |
|------|--------|
| Linear project | [Exalidraw](https://linear.app/dawsons-personal-workspace/project/exalidraw-468e0246f348) (team **Demo**) |
| Issues | All project issues in **Todo**; assignees and delegates cleared (include DEMO-4) |
| GitHub PRs | No open PRs on `DawsonLind/excalidraw` |
| Feature branches | No `cursor/DEMO-*`, `cursor/demo-*`, `cursor/hexagon-shape`, `cursor/cursor-demo-toolkit`, `cursor/setup-dev-environment-*`, or `dawsonlind/demo-*` (local or `origin`) |
| Keep | `master`, `demo` / `origin/demo` (upstream sync branch) |
| `master` code | No speech-bubble shape; no Cursor demo toolkit (skills/agents/rules/hooks from PR #15) |
| Working tree | Clean; this skill at `.cursor/skills/demo-reset/` may remain |

Known demo issues: **DEMO-4** through **DEMO-16** (shapes, stroke effects, sticky note, confetti, etc.).

## Before changing anything

1. Inventory Linear issues (`list_issues` project `Exalidraw`).
2. Inventory open PRs: `gh pr list --state open`.
3. Inventory demo branches: local + `origin` matching the patterns above.
4. Confirm with the user (defaults from the established reset):
   - Linear → **Todo**, clear assignees/delegates
   - Close PRs + **delete remote branches**
   - Discard local WIP; undo demo features on `master`; delete local/remote feature branches
   - Include DEMO-4

Do not proceed with closes/deletes/reverts until the user confirms.

## Reset procedure

### 1. Linear

For every issue in project **Exalidraw**:

- `state`: `Todo`
- `assignee`: `null`
- `delegate`: `null`

Retry any 502s. Re-list and fix any that drifted (auto-assign / In Progress).

### 2. Close PRs and delete remote PR branches

```bash
gh pr list --state open --json number -q '.[].number'
# for each:
gh pr close <n> --delete-branch --comment "Resetting Excalidraw demo project — closing and deleting branch."
```

### 3. Discard local WIP

```bash
git restore .
git clean -fd --exclude .cursor/skills/demo-reset
```

Prefer `git restore` / selective clean over `git reset --hard` (may be blocked by hooks).

### 4. Undo demo features on `master`

Checkout `master`, sync with `origin/master`, then remove demo feature commits **without rewriting shared history** when possible:

1. Prefer `git revert` of the feature/merge commits (newest first).
2. For merge commits (e.g. demo toolkit PR #15): `git revert -m 1 <merge-sha>`.
3. Push to `origin/master` after user approval.

Historically reverted:

- Speech bubble: `feat: Add speech bubble shape with tail`
- Demo toolkit merge: `Merge pull request #15` / `cursor/cursor-demo-toolkit` (`.cursor/` agents, hooks, rules, deslop + change-validation skills)

Verify gone:

- No `SpeechBubble` / `speechBubble` under `packages/`
- No demo-toolkit skills/agents/rules under `.cursor/` except this `demo-reset` skill

### 5. Delete leftover feature branches

**Local** (never delete `master` or `demo`):

```bash
git branch | rg -i 'cursor/(DEMO|demo|hexagon|setup|cursor-demo)|dawsonlind/demo'
git branch -D <branch> ...
```

**Remote**:

```bash
git push origin --delete <branch> ...
```

### 6. Hooks / `.cursor` cleanup (critical)

If a revert deletes `.cursor/hooks/*` while Cursor still has `failClosed` hooks configured, **every shell command matching those hooks will fail** (exit 127).

After reset:

- Do **not** leave broken `failClosed` hooks pointing at missing files.
- Default for this baseline: **no** project hooks, agents, or demo toolkit skills — only `.cursor/skills/demo-reset/` if present.
- If the environment is already fail-closed, restore files with the Write tool (not Shell), or ask the user to clear **Settings → Hooks**, then remove `.cursor/hooks*` again.

Never leave orphaned `guard-destructive-git.js` / `confirm-release.js` references.

### 7. Verify

- [ ] Linear Exalidraw: all **Todo**, no assignees/delegates
- [ ] `gh pr list --state open` empty
- [ ] No demo feature branches local/`origin`
- [ ] `master` up to date with `origin/master`, clean tree
- [ ] Speech bubble / demo toolkit absent
- [ ] Shell hooks not fail-closed on missing scripts
- [ ] `.cursor/skills/demo-reset/SKILL.md` still present if this skill was installed

## Safety

- Confirm before closing PRs, deleting branches, or pushing to `master`.
- Do not force-push `master` unless the user explicitly requests it.
- Do not delete `demo` / `origin/demo`.
- Do not touch other Linear projects (Sable, Grafana, Ringfall).
- Prefer revert commits over history rewrite on shared `master`.
