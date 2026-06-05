# Tickets

Production work items derived from the prototype. Each ticket describes what the prototype does today and what needs to be built for production.

---

## P0 — Core Infrastructure

### TICKET-001: Replace scripted agent with real LLM
**Prototype:** `INTENTS`/`matchIntent` in `app/state.jsx` keyword-matches user prompts to canned config patches.
**Production:** Replace `matchIntent` with an LLM call (e.g. Claude API) that returns either a full new config or a JSON-patch object. Validate the returned config against the schema before applying. The diff/apply/DiffCard pipeline stays identical — any patch source works automatically.

### TICKET-002: Replace preview placeholder with real video surface
**Prototype:** Preview renders an abstract CSS/stripe dashboard mock.
**Production:** Replace with a real video surface — a `<Player>` from `@remotion/player`, or a `<video>` element driven by the config. `activeItems(state, t)` already provides the right slice of items at the playhead.

### TICKET-003: Wire RenderModal to a real render job
**Prototype:** RenderModal simulates a pipeline with a `requestAnimationFrame` loop over ~4.2s.
**Production:** POST the serialized config to a render service (Remotion Lambda or a Remotion + FFmpeg worker). Stream progress back to the UI and update the stage/frame/progress bar in real time. Done state should provide a real download link.

---

## P1 — Features

### TICKET-004: Wire ThumbModal to real frame extraction
**Prototype:** ThumbModal shows three hardcoded placeholder 16:9 candidate thumbnails.
**Production:** Extract real frames at candidate timecodes from the rendered video (or from the Remotion composition). Optionally generate caption overlays with AI.

### TICKET-005: Wire VoiceModal to real cut detection
**Prototype:** VoiceModal shows a hardcoded cut-marker lane and a static waveform.
**Production:** Detect cut points from the video item's edit list. Display the real waveform from the voice/music audio file. `Re-match with AI` should reposition the voiceover item to land on the first cut and stretch/compress to cover the outro.

### TICKET-006: Real config schema validation
**Prototype:** No validation; the scripted patches are always valid.
**Production:** Define a JSON Schema (or Zod schema) for the `state` config object. Validate any AI-returned config patch before applying to state. Surface a readable error in the chat if validation fails.

### TICKET-007: Persist state to disk / project file
**Prototype:** `time` persists to `localStorage["ide.time"]`; full state does not persist.
**Production:** Persist the full `state` object to a project file (e.g. `project.ctrlb.json`) on every save/apply. Support open/save/export flows via the TopBar.

---

## P2 — Polish & Production Hardening

### TICKET-008: Respect `prefers-reduced-motion`
All animations (zoom camera, inspector pop, diff fades, code flash, thinking dots) should be skipped or minimized when `prefers-reduced-motion: reduce` is set.

### TICKET-009: Remove the prototype tweaks panel
`app/tweaks-panel.jsx` is a prototype-only UI for tuning accent color, density, rail visibility, and auto-apply. **Do not include it in production builds.**

### TICKET-010: Lift state to Zustand / Redux / Context
**Prototype:** All state is owned by `<App>` as local React state.
**Production:** Lift to a proper store (Zustand is the natural fit for this shape). Keep the `setState(next, {history})` wrapper pattern — it ensures `normalize()` always runs.

### TICKET-011: Replace inline SVG icons
**Prototype:** All icons are inline SVGs built from simple shapes (play, pause, spark, undo, logo mark).
**Production:** Swap for the project's established icon set or library. Retain the same visual weight and meaning.

### TICKET-012: Replace Google Fonts load with local font
**Prototype:** JetBrains Mono loaded from `fonts.googleapis.com`.
**Production:** Bundle JetBrains Mono locally to avoid the external network dependency.

### TICKET-013: Model/brand label in agent panel
**Prototype:** Agent header shows `claude · video` as the model pill.
**Production:** Replace with the actual model and brand labels appropriate for the product.
