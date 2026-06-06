# Vision

## What We're Building

An **IDE-style video editor where the user never manipulates the preview directly**. Instead, an AI agent (the primary surface) and a raw `config.json` (a Remotion-style declarative spec) drive everything; the video is **rendered from the config**.

Core mental model (from `reference/original-sketch.png`):
- **Left ≈ 60%** — read-only **Preview** (top) + **Timeline** (bottom).
- **Right ≈ 40%** — AI **chat** (primary) + a drawable **`config.json` bottom sheet**.
- Rendering pipeline: **Remotion** (compose/render frames) → **FFmpeg** (encode/mux).

---

## Target Capabilities

The product must support:
- Split, trim, zoom, change speed, volume adjust
- Solid-color screens, text overlays, transitions
- Thumbnail generator
- Voiceover matching
- Render / export

---

## About the Design Files

The files in this bundle are **design references created in HTML/React-via-Babel** — a working prototype demonstrating the intended look and behavior, not production code to copy verbatim.

The task is to **recreate this design in the target codebase's environment**, using its established patterns, component library, and state management. If there is no existing environment yet, **React + TypeScript + Vite** is the natural choice (the app is already React-shaped), with a real Remotion/FFmpeg backend for rendering.

The prototype's "AI agent" is **scripted** — it keyword-matches prompts to canned config patches so the UX is demonstrable offline. In production, replace the matcher with a real LLM call that returns a structured config patch (see AGENTS.md → AI Agent Rules).

The preview renders an **abstract dashboard placeholder**, not a real video frame. In production the preview is a real video surface (a `<Player>` from `@remotion/player`, or a `<video>` element driven by the config).

---

## Fidelity

**High-fidelity.** Final colors, typography, spacing, layout, motion, and interaction patterns are all intended as shown. Recreate the UI faithfully using the codebase's libraries. Exact tokens are in [Design.md](Design.md); the canonical source is the `<style>` block in `index.html`.

---

## Layout Explorations (Reference)

Four layouts were explored (see `reference/Layout Explorations.html`):
- **A** Classic
- **B** Cursor-split ★ — **shipped**
- **C** Studio rail
- **D** AI-first diff

The chosen direction is **B with D's diff-review folded in and the config as a pull-up sheet**.
