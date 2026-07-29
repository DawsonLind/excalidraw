---
name: deslop
description: Scans new or uncommitted changes and reduces verbosity, redundant comments, and filler so the diff stays tight. Use when the user asks to deslop, tighten, trim, or clean up wordy code or text in recent changes.
---

# Deslop

Review only the current changes and make them more concise without altering behavior.

## 1. Scope to the new changes

Look at what actually changed, not the whole repository:

```bash
git diff            # unstaged
git diff --staged   # staged
git diff main...HEAD # branch changes vs base
```

If nothing is uncommitted, ask which range to review before continuing.

## 2. Remove the slop

Within the changed lines only, cut:

- Comments that restate the code (`// increment counter`, `// return result`).
- Redundant or defensive checks that duplicate existing guarantees.
- Dead code, unused variables, and needless intermediate variables.
- Verbose naming that adds no meaning over a shorter clear name.
- Repeated JSX/markup or logic that collapses into a small helper or map.
- Filler prose in docs and messages: "basically", "in order to", "as you can see", hedging, and restated headings.

Keep comments that explain non-obvious intent, trade-offs, or constraints.

## 3. Preserve behavior and intent

- Do not change public APIs, types, or runtime behavior.
- Do not delete tests or error handling that guards real cases.
- Match the surrounding style and formatting already in the file.

## 4. Validate

Run the smallest relevant checks for the touched files:

```bash
yarn test:typecheck
yarn test:app path/to/affected.test.tsx --watch=false
yarn fix
```

## 5. Report

List each edit as `before -> after` in one line, and note anything intentionally left alone and why.
