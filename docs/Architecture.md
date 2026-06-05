# Architecture

## The Big Picture

ctrlb.ai is a video editor where **the config is the source of truth**. The user never drags the preview around — instead they talk to an AI agent or edit a timeline, and the preview re-renders from whatever the config says.

```text
┌─────────────────────────────────────────────────────────────┐
│                        ctrlb.ai                             │
│                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────────┐ │
│  │        LEFT (60%)        │  │       RIGHT (40%)        │ │
│  │                          │  │                          │ │
│  │   ┌──────────────────┐   │  │   ┌──────────────────┐  │ │
│  │   │    Preview       │   │  │   │   AI Agent Chat  │  │ │
│  │   │  (read-only)     │   │  │   │  (primary input) │  │ │
│  │   └──────────────────┘   │  │   └──────────────────┘  │ │
│  │                          │  │                          │ │
│  │   ┌──────────────────┐   │  │   ┌──────────────────┐  │ │
│  │   │    Timeline      │   │  │   │  config.json     │  │ │
│  │   │   + Inspector    │   │  │   │  (pull-up sheet) │  │ │
│  │   └──────────────────┘   │  │   └──────────────────┘  │ │
│  └──────────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## How Edits Flow

There are three ways to edit the video — all of them write to the same config:

```text
┌─────────────────────┐
│   1. AI Agent chat  │──┐
└─────────────────────┘  │    ┌──────────────┐     ┌──────────┐
                         ├───▶│  config.json │────▶│ Preview  │
┌─────────────────────┐  │    └──────────────┘     └──────────┘
│   2. Timeline /     │──┤          │
│      Inspector      │  │          ▼
└─────────────────────┘  │    ┌──────────────┐
                         │    │   Timeline   │
┌─────────────────────┐  │    └──────────────┘
│   3. Raw config     │──┘
│      code sheet     │
└─────────────────────┘
```

The preview and timeline never hold their own state — they are always a live reflection of what is in the config.

---

## The AI Agent Flow

When the user sends a message, the agent proposes a diff against the config. The user can accept or reject it before anything changes.

```text
User types a message
        │
        ▼
  Agent thinks...
        │
        ▼
  Agent proposes a config diff
  ┌─────────────────────────┐
  │  − old line             │
  │  + new line             │
  └─────────────────────────┘
        │
   ┌────┴────┐
   ▼         ▼
 Apply     Reject
   │
   ▼
Config updates → Preview + Timeline re-render
```

---

## The Render Pipeline

When the user hits Render, the config is handed off to a backend pipeline:

```text
config.json
    │
    ▼
Remotion — composes and renders every video frame
    │
    ▼
FFmpeg — encodes frames into H.264 + AAC
    │
    ▼
Mux — combines video + voiceover + music bed
    │
    ▼
ProductDemo.mp4  ✓
```

---

## Key Components

| Component | What it does |
|---|---|
| **Preview** | Renders the video composition at the current playhead position. Read-only. |
| **Transport** | Play/pause and scrubber. Controls the playhead. |
| **Timeline** | Shows all clips on their tracks. Click a clip to select it. |
| **Inspector** | Appears when a clip is selected. Edit trim, speed, volume, text, etc. |
| **Agent Chat** | The primary way to make edits. Proposes diffs for the user to approve. |
| **DiffCard** | Shows the before/after config change from an AI suggestion. |
| **Config Sheet** | A pull-up drawer showing the raw `config.json`. Always in sync. |
| **Render Modal** | Kicks off the render pipeline and shows progress. |

---

## What Lives Where

```text
app/
  state.jsx      ← the config model and diff utilities
  preview.jsx    ← Preview + Transport
  timeline.jsx   ← Timeline + Inspector
  chat.jsx       ← Agent chat + DiffCard
  codesheet.jsx  ← config.json pull-up sheet
  modals.jsx     ← TopBar + Render / Thumbnail / Voice modals
  app.jsx        ← root: owns all state, undo, playback loop

reference/
  original-sketch.png        ← the original hand-drawn brief
  Layout Explorations.html   ← four layout alternatives considered
```
