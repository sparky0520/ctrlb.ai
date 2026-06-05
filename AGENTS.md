# AGENTS.md — Project Goals, Rules & Definition of Done

## Project Goal

Build an IDE-style video editor where the user **never manipulates the preview directly**. An AI agent (primary surface) and a raw `config.json` (Remotion-style declarative spec) drive all edits; the video is **rendered from the config**.

The three editing flows are:
1. Chat with the AI agent → it proposes **apply/reject diff edits** to the config.
2. Direct clip editing via the timeline + inspector panel.
3. Hand-editing the config in a pull-up code sheet.

---

## Core Rules / Invariants

- **Single source of truth.** One `state` object owns all data. Preview, Timeline, and the config code sheet are all *derived* from it. Never let the preview hold its own edit state — this is the entire premise of the product.
- **Preview is read-only.** The user never drags, scrubs, or clicks inside the preview to make edits. The preview only renders what the config says.
- **All times are seconds (floats).** The timeline converts to pixels via `pps = 28 px/second`. Never store pixel positions in state.
- **Every state change must go through `setState(next, {history})`**, which always calls `normalize()` to recompute `meta.duration`.
- **`normalize(state)`** recomputes `meta.duration` on every state change. `meta.duration = max(34, max item end)`.
- **Diffs are computed from serialized config.** `diffLines(serialize(before), serialize(after))` — any patch source works automatically with the DiffCard UI.
- **Validate AI-returned configs against a schema before applying.**
- **Undo covers:** AI applies, splits, deletes. Live slider drags intentionally do not push to history to avoid spam.

---

## AI Agent Rules

- The agent edits `config.json` — it never mutates the preview directly.
- Agent flow: send → push user msg → thinking state (650–1050ms) → resolve intent:
  - No match → helpful fallback message listing capabilities.
  - `special:"thumbnail"` → reply + open ThumbModal.
  - Otherwise → compute `before/after = serialize(intent.patch(state))`, attach a DiffCard.
- If **auto-apply** is enabled, apply immediately; else wait for user's explicit Apply.
- On Apply: `patchFn(currentState)` → normalize → push previous state to history → set state → flash changed lines → expand sheet → mark card `applied`.
- **Replacing the scripted agent:** swap `INTENTS`/`matchIntent` for an LLM call returning either a full new config or a JSON-patch. The diff/apply pipeline stays identical.

---

## Definition of Done for a Task

A task is complete when all of the following are true:

- [ ] The `state` object is the single source of truth; no parallel edit state exists elsewhere.
- [ ] Preview, Timeline, and CodeSheet all re-derive correctly from the updated state.
- [ ] `normalize()` is called on every state mutation (via the `setState` wrapper).
- [ ] Undo works: the previous state was pushed to history before the mutation.
- [ ] The config serialization (`serialize(state)`) produces a clean, deterministic diff.
- [ ] The DiffCard shows correct before/after lines for the change.
- [ ] Any AI-returned config patch is validated against the schema before being applied.
- [ ] `prefers-reduced-motion` is respected for all animations.
- [ ] The prototype's tweaks panel (`app/tweaks-panel.jsx`) is **not** included in production builds.
- [ ] No direct DOM manipulation of the preview — all visual output is derived from state.
