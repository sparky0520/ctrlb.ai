# Handoff: AI Video IDE — "ctrlb.ai"

## Overview

An **IDE-style video editor where the user never manipulates the preview directly**. Instead, an AI agent (primary surface) and a raw `config.json` (Remotion-style declarative spec) drive everything; the video is **rendered from the config**. Editing flows are: (1) chat with the agent → it proposes **apply/reject diff edits** to the config, (2) directly edit clips via a timeline + inspector, and (3) hand-edit the config in a pull-up code sheet.

Core mental model (from the original sketch, see `reference/original-sketch.png`):
- **Left ≈ 60%** — read-only **Preview** (top) + **Timeline** (bottom).
- **Right ≈ 40%** — AI **chat** (primary) + a drawable **`config.json` bottom sheet**.
- The pipeline implied by the spec: **Remotion** (compose/render frames) → **FFmpeg** (encode/mux).

Target requirements covered: split, trim, zoom, change speed, volume adjust, solid-color screens, text overlays, transitions, basic editing, thumbnail generator, voiceover matching, render/export.

---

## About the Design Files

**The files in this bundle are design references created in HTML/React-via-Babel — a working prototype demonstrating the intended look and behavior, not production code to copy verbatim.**

The task is to **recreate this design in the target codebase's environment**, using its established patterns, component library, and state management. If there is no existing environment yet, **React + TypeScript + Vite** is the natural choice for this app (it is already React-shaped), with a real Remotion/FFmpeg backend for rendering.

The prototype's "AI agent" is **scripted** — it keyword-matches prompts to canned config patches so the UX is demonstrable offline. In production, replace the matcher with a real LLM call that returns a structured config patch (see **State Management → AI flow**).

The preview renders an **abstract dashboard placeholder**, not a real video frame. In production the preview is a real video surface (a `<Player>` from `@remotion/player`, or a `<video>` element driven by the config).

---

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, layout, motion, and interaction patterns are all intended as shown. Recreate the UI faithfully using the codebase's libraries. Exact tokens are listed below; the source of truth is the `<style>` block in `index.html`.

---

## Architecture of the Prototype (map to your components)

All logic lives in `app/*.jsx`, loaded as separate Babel scripts that attach components to `window`. Suggested production component tree in parentheses.

| File | Responsibility | Production component |
|---|---|---|
| `app/state.jsx` | Config model `INITIAL`, `serialize()`, JSON `highlightLine()`, LCS `diffLines()`/`diffWindow()`, `INTENTS` (the scripted agent) | `lib/model.ts`, `lib/diff.ts`, `lib/agent.ts` |
| `app/preview.jsx` | `Preview` (renders composition at playhead) + `Transport` (play/scrub) | `<Preview>`, `<Transport>` |
| `app/timeline.jsx` | `Timeline` (tracks from state, scrub, select) + `Inspector` (direct clip edit) | `<Timeline>`, `<ClipInspector>` |
| `app/chat.jsx` | `Chat` (agent panel) + `DiffCard` (apply/reject) | `<AgentPanel>`, `<DiffCard>` |
| `app/codesheet.jsx` | `CodeSheet` (drawable config.json drawer) | `<ConfigSheet>` |
| `app/modals.jsx` | `TopBar`, `RenderModal`, `ThumbModal`, `VoiceModal` | `<TopBar>`, modals |
| `app/app.jsx` | Root: owns all state, history/undo, playback loop, AI orchestration, tweaks | `<App>` / store |
| `app/tweaks-panel.jsx` | Prototype-only tweak panel (accent/density/rail/auto-apply). **Drop in production.** | — |

**The single source of truth is one `state` object.** Preview, Timeline, and the config code are all *derived* from it. Never let the preview hold its own edit state — this is the whole premise of the product.

---

## Data Model (the config)

`state` shape (`app/state.jsx` → `INITIAL`):

```js
state = {
  meta: { composition: "ProductDemo", fps: 30, size: [1920, 1080], duration: 34 },
  items: [
    // VIDEO (track "screen")
    { id:"v1", type:"video", track:"screen", label:"screen-recording.mp4",
      start:0, end:30, trim:[4.0, 38.5], speed:1.0, volume:0.8 },
    // ZOOM effect (track "zoom")
    { id:"z1", type:"zoom", track:"zoom", label:"zoom 1.6×",
      start:12.5, end:16.5, scale:1.6, focus:[0.62, 0.34] },
    // TEXT overlay (track "text")
    { id:"t1", type:"text", track:"text", label:"title-card",
      start:1, end:4, value:"Ship faster with Acme", preset:"title-card" },
    // VOICE / MUSIC (tracks "voice","music")
    { id:"a1", type:"voice", track:"voice", label:"voiceover.mp3",
      start:8, end:30, src:"voiceover.mp3", volume:1.0 },
    { id:"m1", type:"music", track:"music", label:"bed.mp3",
      start:0, end:34, src:"bed.mp3", volume:0.2 },
  ],
}
```

Item types: `video`, `zoom`, `text`, `color` (solid-color card, has `color` + optional `value` caption), `transition` (has `kind`), `voice`, `music`.
Tracks render in fixed order: `["screen","zoom","text","voice","music"]`.

**Serialization** (`serialize(state)`): produces the Remotion-style config the user sees in the code sheet and diffs against. It splits items into `clips[]` (video/color/zoom/text/transition, sorted by `start`) and `audio[]` (voice/music), with deterministic key order so diffs stay clean. `meta.duration` is normalized to `max(34, max item end)`.

`normalize(state)` recomputes `meta.duration` on every state change. All times are **seconds** (floats); the timeline converts via `pps = 28` px/second (`zoomPx` prop).

---

## Screens / Views

### 1. App shell
- **Layout:** vertical flex — TopBar (fixed 42px) over a horizontal `body`. Body = left column (`flex 1 1 60%`) │ 1px divider │ right column (`flex 1 1 40%`, `min-width:392px; max-width:560px`).
- Background `--bg0` (#0b0c0f). Base font 13px, system UI stack; code uses JetBrains Mono.

### 2. Top Bar (`TopBar`)
- **Height 42px**, bg `--bg1`, bottom border `--bd`.
- **Left:** square logo mark (accent), breadcrumb `acme-demo / ProductDemo.video`. An amber dot (`●`) appears when there are unsaved edits (`dirty`).
- **Center:** mono meta `1920×1080 · 30fps · 00:34` (color `--t3`).
- **Right (gap 6px):** Undo icon button (disabled until history exists), `Voiceover` (ghost), `Thumbnail` (ghost), `Render` (primary, accent fill, play glyph).

### 3. Preview (`Preview`) — read-only render surface
- Centered **16:9** frame, max-fit, radius 9px, border `--bd`, large soft drop shadow. Letterboxed in `--bg0`.
- Renders the composition **at the current playhead** via `activeItems(state, t)` (items where `start ≤ t < end`):
  - **Base:** striped placeholder + an abstract dashboard mock (sidebar + header rows + 5 chart bars; the 4th bar tinted with `--acc`). *Replace with the real video surface.*
  - **zoom active:** a camera transform on the inner layer `scale(s) translate(focus-derived %)` (transition 0.5s `cubic-bezier(.4,0,.2,1)`), **plus** a focus reticle rect (1.5px accent border, dark spotlight via huge spread shadow, `data-scale` chip e.g. `1.6×`).
  - **text active:** overlay positioned by `preset` — `title-card` (centered, 58% down, weight 800, clamp 15–30px, letter-spacing −.02em), `lower-third` (bottom-left, accent left-border + gradient), `caption` (bottom-center pill).
  - **color active:** full-cover fill of `item.color` with optional CTA (`value` + circled arrow `→`).
  - **transition active:** brief black 50% veil.
  - Persistent corner chips: `screen-recording.mp4 · 1920×1080` (bottom-left), `playing|paused` (bottom-right).

### 4. Transport (`Transport`)
- **Height 40px**, bg `--bg1`. Play/pause button (26px, accent fill). Mono time `00:12 / 00:34`. Scrubber (5px track `--bg4`, accent fill, 12px white knob with shadow) — **click or drag to seek**. Two mono pills: speed (`1.0×`, from selected video clip) and `vol 80`.

### 5. Timeline (`Timeline`)
- **Panel height 236px** (comfortable) / 208px (compact). Header (30px): "TIMELINE" label + mono meta `5 clips · 00:34 · 30fps`.
- **Body:** horizontally scrollable. A **74px sticky left gutter** holds track names (`Screen/Zoom/Text/Voice/Music`, pinned on scroll, right border `--bd`). Ruler (22px) with ticks every 3s — **click/drag ruler to scrub**.
- **Playhead:** 1.5px accent vertical line spanning ruler+tracks, with a small accent cap at top. `left = 74 + time × pps`.
- **Tracks:** each row 26px. Segments positioned `left = start × pps`, `width = max(14, (end−start) × pps)`. Per-type color (see token table). Video segs show a faint filmstrip texture; voice/music show a wave texture; color shows a solid swatch. **Click a segment → select** (accent outline) and open the Inspector.

### 6. Clip Inspector (`Inspector`) — direct manipulation
- Floating card, **288px**, anchored `left:14px; bottom:248px` (above the timeline), bg `--bg2`, radius 11px, big shadow, `pop` entrance (0.16s). Header: type tag (color-coded) + clip label + close ✕.
- **Fields by type** (sliders show a mono value readout):
  - `video`: Trim in, Trim out, Speed (0.25–3×), Volume (0–100). Footer: **Split at playhead**, Delete.
  - `text`: Text input, Preset segmented (`title-card/lower-third/caption`), Duration.
  - `zoom`: Scale (1.1–2.5×), Hold.
  - `color`: Caption input, Color swatches.
  - `voice`/`music`: Volume, Start.
- Every change calls `onChange(updatedItem)` → updates state immediately → preview + config re-derive live.

### 7. Agent / Chat (`Chat`) — primary surface
- Fills the right column above the config sheet (`inset: 0 0 38px 0`). Header (38px): spark glyph + "Agent" + sub `edits config.json · ⌘K` + model pill `claude · video`.
- **Empty state:** centered spark badge, "Describe the edit, I'll change the config", subtext explaining the read-only-preview premise (with inline `config.json` code chip).
- **Messages:** user bubbles right-aligned (accent fill); AI rows = 22px spark avatar + bubble (bg `--bg3`, border, top-left squared). AI bubble can be followed by a **DiffCard** and/or an inline **action button**.
- **Thinking:** three-dot pulsing bubble while the agent "responds" (650–1050ms simulated latency).
- **Starters row:** horizontal scroll of suggestion chips (pill, hover → accent border). Defaults: *Trim the dead air / Zoom into the dashboard at 12s / Speed up the slow middle 1.5× / Add a solid-color outro card / Match the voiceover to the cuts / Generate a thumbnail.*
- **Input:** auto-grow textarea (Enter sends, Shift+Enter newline), accent send button (disabled when empty). Footer: `@screen-recording.mp4` context chip.

### 8. DiffCard (`DiffCard`)
- Appears under an AI message (indented 31px to align past the avatar). Header: `● config.json` (green edit dot) + location (e.g. `clips[0] · video`).
- **Body:** unified diff lines from `diffWindow(diffLines(before, after))` — added lines green bg `+`, removed red bg `−`, context neutral, all syntax-highlighted, mono 11px.
- **Pending:** Reject (ghost) / **Apply edit** (primary). **After:** status row — green `✓ Applied to config.json` or muted `Reverted` (rejected cards fade to 0.55).

### 9. Config Sheet (`CodeSheet`) — drawable bottom drawer
- Anchored to bottom of right column, `left/right:0; bottom:0`, z-index 15, top shadow. Collapsed = 38px bar.
- **Drag handle** (8px, grip turns accent on hover) resizes between **36px and `maxH`** (`= right column height − 96`). **Double-click handle** or **click bar** toggles peek ↔ ~62%.
- Bar: `● config.json` + `JSON · read-write` + (when changed) an amber `N line(s) changed` chip + chevron.
- Body: gutter + syntax-highlighted lines of `serialize(state)`. On an applied AI edit, changed lines **flash green** (inset green bar) and the matching gutter numbers turn amber for ~2s; the sheet auto-expands to ~55% to reveal the change.

### 10. Modals
- **Scrim:** `rgba(5,6,9,.62)` + 3px backdrop blur, centered card, `pop` entrance.
- **RenderModal** (440px): staged fake pipeline driven by rAF over total ≈4.2s — `Parsing config.json` → `Remotion · rendering 1020 frames` (live `frame N/1020`) → `FFmpeg · encoding H.264 + AAC` → `Muxing voiceover + music bed`. Spinner + 16:9 preview + progress bar; current stage dot pulses accent, done stages go green. **Done state:** play-button poster, meta `ProductDemo.mp4 · 1920×1080 · 30fps · 00:34 · H.264 · 18.4 MB`, `Download .mp4`. *Wire to a real render job + progress stream.*
- **ThumbModal** (680px wide): 3 candidate thumbnails (16:9, captioned, frame timecode), selectable, `Use thumbnail`. *Wire to real frame extraction + caption generation.*
- **VoiceModal** (680px wide): two stacked lanes — video **cut markers** and the **voiceover clip** (wave) on the same time scale — + a note about detected cuts; `Re-match with AI` applies the `voice` intent (nudges narration to land on the first click and stretches to cover the outro).

---

## Interactions & Behavior

- **Playback:** `requestAnimationFrame` loop advances `time` in real seconds while `playing`; stops at `duration`. **Spacebar** toggles play/pause (ignored while typing in input/textarea). `time` persists to `localStorage["ide.time"]`.
- **Seeking:** click/drag the transport scrubber or the timeline ruler. Seeking pauses playback.
- **Selection:** click a timeline segment to select + open inspector; clicking the empty preview stage clears selection.
- **AI flow:** send → push user msg → `thinking` (≈650–1050ms) → `matchIntent(text)`:
  - no match → helpful fallback message listing capabilities;
  - `special:"thumbnail"` → reply + open ThumbModal;
  - otherwise → compute `before/after = serialize(intent.patch(state))`, attach a DiffCard. If **auto-apply** tweak is on, apply immediately; else wait for the user's Apply.
- **Apply edit:** `patchFn(currentState)` → normalize → push previous state to **history** (enables Undo) → set state → compute & flash changed lines → expand sheet → mark card `applied`.
- **Undo:** pops history stack (covers AI applies, splits, deletes; live slider drags intentionally don't spam history).
- **Split:** splits the selected video clip at the playhead into two clips with recomputed `trim` ranges.
- **Motion:** diff/text/zoom fades ~0.25–0.4s; zoom camera 0.5s ease; inspector/modal `pop` 0.16–0.18s; code flash decays over ~1.4s; thinking dots 1.2s loop. Respect `prefers-reduced-motion` in production.

## State Management

State owned by `<App>` (lift to Zustand/Redux/context in production):
- `state` (the config) + `stateRef` + `history[]` + `canUndo` — with a `setState(next, {history})` wrapper that always `normalize()`s.
- `time`, `playing`, `selId` (selected item id), `messages[]`, `thinking`, `modal` (`null|'render'|'thumb'|'voice'`), `flash` (Set of changed line indices), `sheetH`/`maxH`.
- **Replacing the scripted agent:** swap `INTENTS`/`matchIntent` for an LLM call that returns either a full new config or a JSON-patch. Keep the rest identical — diffing is computed from `serialize(before)` vs `serialize(after)`, so any patch source "just works" with the DiffCard UI. Validate the returned config against a schema before applying.
- **Real render:** `RenderModal` should POST the config to a render service (Remotion Lambda / a Remotion+FFmpeg worker) and stream progress, instead of the rAF simulation.

---

## Design Tokens

Source of truth: `:root` in `index.html`.

### Color
| Token | Hex | Use |
|---|---|---|
| `--bg0` | `#0b0c0f` | app background / preview letterbox |
| `--bg1` | `#101216` | panels (top bar, timeline, chat) |
| `--bg2` | `#15181d` | inputs, inspector, modal surfaces |
| `--bg3` | `#1b1f26` | AI bubble, pills, hovers |
| `--bg4` | `#22272f` | slider/scrub tracks |
| `--bd` | `#23272f` | borders / dividers |
| `--bd2` | `#2d333c` | stronger borders, ghost button outline |
| `--t1` | `#e7e9ec` | primary text |
| `--t2` | `#9aa1aa` | secondary text |
| `--t3` | `#646b74` | muted text / mono meta |
| `--acc` | `#3d7eff` | **accent** — active, AI, render, playhead (tweakable) |
| `--accdim` | `acc @16%` | accent tints (`color-mix`) |
| `--green` | `#41c97a` | applied edits, additions, voice track |
| `--amber` | `#e0a93d` | dirty / changed, music track |
| `--purple` | `#9d7bff` | text track |
| `--red` | `#e5614e` | deletions, danger |
| `--cyan` | `#3fb6c9` | (reserved) |

**Syntax highlight:** key `#79b8ff`, string `#a4d46f`, number `#f0a36b`, boolean/null `#c792ea`, punctuation `#7a828c`.

**Track segment colors:** screen/video `#243246→#1b2638` (label `#a9c6f0`); zoom accent-tinted (`#9cc0ff`); text purple-tinted (`#c4adff`); voice green-tinted (`#86e2ab`); music amber-tinted (`#ecc885`).

### Typography
- **UI:** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Base 13px (comfortable) / 12px (compact).
- **Mono:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` (Google Fonts, weights 400/500/600). Code body 11.5px / line-height 1.72.
- Notable sizes: title-card overlay clamp(15–30px)/800; section labels 11px uppercase letter-spacing .06–.08em; chips/meta 9.5–11px mono.

### Radius
Buttons 7px (tiny 6px) · panels/cards 9–14px · inspector 11px · pills 5px · segments 5px · chips/dots 2–4px · knobs/avatars circular.

### Shadow
- Preview frame: `0 24px 60px -22px rgba(0,0,0,.75)`
- Inspector: `0 20px 50px -16px rgba(0,0,0,.7)`
- Modal: `0 30px 80px -20px rgba(0,0,0,.8)`
- Code sheet (upward): `0 -16px 40px -20px rgba(0,0,0,.7)`

### Spacing / sizing constants
TopBar 42 · Transport 40 · Timeline 236/208 · track gutter 74px · row 26px · `pps` 28 · right column 392–560px · sheet collapsed 38px, `maxH = colH − 96`.

---

## Assets
- **Fonts:** JetBrains Mono via Google Fonts (`fonts.googleapis.com`). UI font is the system stack (no download).
- **Icons:** all inline SVG built from simple shapes (play triangle, pause bars, spark, square logo mark, undo). No icon library required; swap for your icon set.
- **Imagery:** none shipped. The preview dashboard and thumbnails are CSS/stripe **placeholders** — supply real video frames in production.
- **Original sketch:** `reference/original-sketch.png` (the source brief).
- No Anthropic brand assets are used; "claude · video" is just a model-name pill — use your own model/brand labels.

---

## Files in this bundle
- `index.html` — the prototype shell (all CSS in `<style>`; the source of truth for tokens). Loads the `app/*.jsx` files.
- `app/state.jsx` · `app/preview.jsx` · `app/timeline.jsx` · `app/chat.jsx` · `app/codesheet.jsx` · `app/modals.jsx` · `app/app.jsx` — the component logic (see Architecture table).
- `app/tweaks-panel.jsx` — prototype tweak panel; **not part of the product**, drop it.
- `reference/Layout Explorations.html` (+ `ide-parts.jsx`, `design-canvas.jsx`) — the four explored layouts (A Classic / B Cursor-split ★ shipped / C Studio rail / D AI-first diff). Useful for understanding alternatives; the chosen direction is **B with D's diff-review folded in and the config as a pull-up sheet**.
- `reference/original-sketch.png` — the original hand-drawn brief.

To run the prototype locally: `npm install && npm run dev` — this starts a Vite dev server at `http://localhost:5173` and serves `index.html`. The app must be served over HTTP (not opened via `file://`) because the `app/*.jsx` files are loaded dynamically by Babel standalone.
