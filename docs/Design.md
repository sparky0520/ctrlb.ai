# Design

## App Shell Layout

- **Structure:** vertical flex — TopBar (fixed 42px) over a horizontal body. Body = left column (`flex 1 1 60%`) │ 1px divider │ right column (`flex 1 1 40%`, `min-width:392px; max-width:560px`).
- Background `--bg0` (`#0b0c0f`). Base font 13px, system UI stack; code uses JetBrains Mono.

---

## Screens

### Top Bar
- Height 42px, bg `--bg1`, bottom border `--bd`.
- **Left:** square logo mark (accent), breadcrumb `acme-demo / ProductDemo.video`. Amber dot (`●`) when there are unsaved edits (`dirty`).
- **Center:** mono meta `1920×1080 · 30fps · 00:34` (color `--t3`).
- **Right (gap 6px):** Undo icon button (disabled until history exists), `Voiceover` (ghost), `Thumbnail` (ghost), `Render` (primary, accent fill, play glyph).

### Preview — read-only render surface
- Centered **16:9** frame, max-fit, radius 9px, border `--bd`, large soft drop shadow. Letterboxed in `--bg0`.
- Renders the composition **at the current playhead** via `activeItems(state, t)` (items where `start ≤ t < end`):
  - **Base:** striped placeholder + abstract dashboard mock. *Replace with the real video surface (`<Player>` from `@remotion/player`).*
  - **zoom active:** camera transform `scale(s) translate(focus-derived %)` (transition 0.5s `cubic-bezier(.4,0,.2,1)`), plus a focus reticle rect (1.5px accent border, dark spotlight via huge spread shadow, `data-scale` chip).
  - **text active:** overlay by `preset` — `title-card` (centered, 58% down, weight 800, clamp 15–30px, letter-spacing −.02em), `lower-third` (bottom-left, accent left-border + gradient), `caption` (bottom-center pill).
  - **color active:** full-cover fill of `item.color` with optional CTA (`value` + circled arrow `→`).
  - **transition active:** brief black 50% veil.
  - Persistent corner chips: `screen-recording.mp4 · 1920×1080` (bottom-left), `playing|paused` (bottom-right).

### Transport
- Height 40px, bg `--bg1`. Play/pause button (26px, accent fill). Mono time `00:12 / 00:34`. Scrubber (5px track `--bg4`, accent fill, 12px white knob with shadow) — click or drag to seek. Two mono pills: speed (`1.0×`, from selected clip) and `vol 80`.

### Timeline
- Panel height 236px (comfortable) / 208px (compact). Header (30px): "TIMELINE" label + mono meta `5 clips · 00:34 · 30fps`.
- **Body:** horizontally scrollable. 74px sticky left gutter holds track names (Screen/Zoom/Text/Voice/Music), pinned on scroll, right border `--bd`. Ruler (22px) with ticks every 3s — click/drag ruler to scrub.
- **Playhead:** 1.5px accent vertical line spanning ruler+tracks, accent cap at top. `left = 74 + time × pps`.
- **Tracks:** each row 26px. Segments: `left = start × pps`, `width = max(14, (end−start) × pps)`. Per-type color (see token table). Video segments show filmstrip texture; voice/music show wave texture; color shows solid swatch. Click a segment → select (accent outline) + open Inspector.

### Clip Inspector — direct manipulation
- Floating card, 288px, anchored `left:14px; bottom:248px` (above timeline), bg `--bg2`, radius 11px, big shadow, `pop` entrance (0.16s). Header: type tag (color-coded) + clip label + close ✕.
- **Fields by type:**
  - `video`: Trim in, Trim out, Speed (0.25–3×), Volume (0–100). Footer: **Split at playhead**, Delete.
  - `text`: Text input, Preset segmented (`title-card / lower-third / caption`), Duration.
  - `zoom`: Scale (1.1–2.5×), Hold.
  - `color`: Caption input, Color swatches.
  - `voice` / `music`: Volume, Start.
- Every change calls `onChange(updatedItem)` → updates state immediately → preview + config re-derive live.

### Agent / Chat — primary surface
- Fills the right column above the config sheet (`inset: 0 0 38px 0`). Header (38px): spark glyph + "Agent" + sub `edits config.json · ⌘K` + model pill `claude · video`.
- **Empty state:** centered spark badge, "Describe the edit, I'll change the config", subtext explaining the read-only-preview premise (with inline `config.json` code chip).
- **Messages:** user bubbles right-aligned (accent fill); AI rows = 22px spark avatar + bubble (bg `--bg3`, border, top-left squared). AI bubble can be followed by a DiffCard and/or inline action button.
- **Thinking:** three-dot pulsing bubble while the agent responds (650–1050ms simulated latency).
- **Starters row:** horizontal scroll of suggestion chips (pill, hover → accent border). Defaults: *Trim the dead air / Zoom into the dashboard at 12s / Speed up the slow middle 1.5× / Add a solid-color outro card / Match the voiceover to the cuts / Generate a thumbnail.*
- **Input:** auto-grow textarea (Enter sends, Shift+Enter newline), accent send button (disabled when empty). Footer: `@screen-recording.mp4` context chip.

### DiffCard
- Appears under an AI message (indented 31px to align past the avatar). Header: `● config.json` (green edit dot) + location (e.g. `clips[0] · video`).
- **Body:** unified diff lines from `diffWindow(diffLines(before, after))` — added lines green bg `+`, removed red bg `−`, context neutral, all syntax-highlighted, mono 11px.
- **Pending:** Reject (ghost) / **Apply edit** (primary). **After apply:** green `✓ Applied to config.json`. Rejected cards fade to 0.55 opacity with muted `Reverted`.

### Config Sheet — drawable bottom drawer
- Anchored to bottom of right column, `left/right:0; bottom:0`, z-index 15, top shadow. Collapsed = 38px bar.
- **Drag handle** (8px, grip turns accent on hover) resizes between 36px and `maxH` (`= right column height − 96`). Double-click handle or click bar toggles peek ↔ ~62%.
- Bar: `● config.json` + `JSON · read-write` + (when changed) amber `N line(s) changed` chip + chevron.
- Body: gutter + syntax-highlighted lines of `serialize(state)`. On an applied AI edit, changed lines **flash green** (inset green bar) and gutter numbers turn amber for ~2s; the sheet auto-expands to ~55%.

### Modals
- **Scrim:** `rgba(5,6,9,.62)` + 3px backdrop blur, centered card, `pop` entrance.
- **RenderModal** (440px): staged pipeline — `Parsing config.json` → `Remotion · rendering 1020 frames` (live `frame N/1020`) → `FFmpeg · encoding H.264 + AAC` → `Muxing voiceover + music bed`. Spinner + 16:9 preview + progress bar; current stage dot pulses accent, done stages go green. Done state: play-button poster, meta `ProductDemo.mp4 · 1920×1080 · 30fps · 00:34 · H.264 · 18.4 MB`, `Download .mp4`.
- **ThumbModal** (680px): 3 candidate thumbnails (16:9, captioned, frame timecode), selectable, `Use thumbnail`.
- **VoiceModal** (680px): two stacked lanes — video cut markers + voiceover clip (wave) on the same time scale — + note about detected cuts; `Re-match with AI` applies the voice intent.

---

## Motion

| Element | Duration / Easing |
|---|---|
| Diff / text / zoom fades | 0.25–0.4s |
| Zoom camera transform | 0.5s `cubic-bezier(.4,0,.2,1)` |
| Inspector / modal `pop` entrance | 0.16–0.18s |
| Code flash decay | ~1.4s |
| Thinking dots loop | 1.2s |

Respect `prefers-reduced-motion` in production.

---

## Design Tokens

Source of truth: `:root` in `index.html`.

### Color

| Token | Hex | Use |
|---|---|---|
| `--bg0` | `#0b0c0f` | App background / preview letterbox |
| `--bg1` | `#101216` | Panels (top bar, timeline, chat) |
| `--bg2` | `#15181d` | Inputs, inspector, modal surfaces |
| `--bg3` | `#1b1f26` | AI bubble, pills, hovers |
| `--bg4` | `#22272f` | Slider/scrub tracks |
| `--bd` | `#23272f` | Borders / dividers |
| `--bd2` | `#2d333c` | Stronger borders, ghost button outline |
| `--t1` | `#e7e9ec` | Primary text |
| `--t2` | `#9aa1aa` | Secondary text |
| `--t3` | `#646b74` | Muted text / mono meta |
| `--acc` | `#3d7eff` | Accent — active, AI, render, playhead (tweakable) |
| `--accdim` | `acc @16%` | Accent tints (`color-mix`) |
| `--green` | `#41c97a` | Applied edits, additions, voice track |
| `--amber` | `#e0a93d` | Dirty / changed, music track |
| `--purple` | `#9d7bff` | Text track |
| `--red` | `#e5614e` | Deletions, danger |
| `--cyan` | `#3fb6c9` | Reserved |

**Syntax highlight:** key `#79b8ff` · string `#a4d46f` · number `#f0a36b` · boolean/null `#c792ea` · punctuation `#7a828c`.

**Track segment colors:**
- screen/video: `#243246→#1b2638` (label `#a9c6f0`)
- zoom: accent-tinted (`#9cc0ff`)
- text: purple-tinted (`#c4adff`)
- voice: green-tinted (`#86e2ab`)
- music: amber-tinted (`#ecc885`)

### Typography

- **UI:** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Base 13px (comfortable) / 12px (compact).
- **Mono:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` (Google Fonts, weights 400/500/600). Code body 11.5px / line-height 1.72.
- Notable sizes: title-card overlay `clamp(15px, 3vw, 30px)` / weight 800; section labels 11px uppercase letter-spacing .06–.08em; chips/meta 9.5–11px mono.

### Radius

| Element | Radius |
|---|---|
| Buttons | 7px (tiny: 6px) |
| Panels / cards | 9–14px |
| Inspector | 11px |
| Pills | 5px |
| Timeline segments | 5px |
| Chips / dots | 2–4px |
| Knobs / avatars | circular |

### Shadows

| Element | Value |
|---|---|
| Preview frame | `0 24px 60px -22px rgba(0,0,0,.75)` |
| Inspector | `0 20px 50px -16px rgba(0,0,0,.7)` |
| Modal | `0 30px 80px -20px rgba(0,0,0,.8)` |
| Code sheet (upward) | `0 -16px 40px -20px rgba(0,0,0,.7)` |

### Spacing / Sizing Constants

| Element | Value |
|---|---|
| TopBar | 42px |
| Transport | 40px |
| Timeline (comfortable / compact) | 236px / 208px |
| Track gutter | 74px |
| Track row height | 26px |
| `pps` (pixels per second) | 28 |
| Right column width | 392–560px |
| Sheet collapsed | 38px |
| Sheet max height | `colH − 96` |

---

## Assets

- **Fonts:** JetBrains Mono via Google Fonts. UI font is the system stack (no download needed).
- **Icons:** all inline SVG built from simple shapes (play triangle, pause bars, spark, square logo mark, undo). No icon library required; swap for your preferred icon set.
- **Imagery:** none shipped. The preview dashboard and thumbnails are CSS/stripe placeholders — supply real video frames in production.
- **Original sketch:** `reference/original-sketch.png` (the source brief).
- No Anthropic brand assets are used; "claude · video" is a model-name pill — use your own model/brand labels.
