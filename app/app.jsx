// app.jsx — wires the whole IDE: state, history, playback, AI flow, modals, tweaks.
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  INITIAL, deepClone, round, uid,
  serialize, diffLines, diffWindow,
} from './state.jsx';
import { callAgent } from './llm.js';
import {
  useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle,
} from './tweaks-panel.jsx';
import { Preview, Transport } from './preview.jsx';
import { Timeline, Inspector } from './timeline.jsx';
import { Chat } from './chat.jsx';
import { CodeSheet } from './codesheet.jsx';
import { TopBar, RenderModal, ThumbModal, VoiceModal } from './modals.jsx';

function normalize(s) {
  const n = deepClone(s);
  const ends = n.items.map((i) => i.end);
  n.meta.duration = round(Math.max(34, ...ends));
  return n;
}

function Rail({ state, selId, onSelect }) {
  const groups = [
    { h: "Clips", types: ["video"] },
    { h: "Effects", types: ["zoom", "text", "color", "transition"] },
    { h: "Audio", types: ["voice", "music"] },
  ];
  const chip = { video: "vid", zoom: "zoom", text: "text", color: "text", transition: "zoom", voice: "voice", music: "music" };
  return (
    <div className="rail">
      <div className="rail-head">Assets</div>
      {groups.map((g) => {
        const items = state.items.filter((i) => g.types.includes(i.type));
        if (!items.length) return null;
        return (
          <div className="rail-grp" key={g.h}>
            <div className="rail-h">{g.h}</div>
            {items.map((i) => (
              <div key={i.id} className={"rail-item" + (selId === i.id ? " on" : "")} onClick={() => onSelect(i.id)}>
                <span className={"chip " + chip[i.type]}/>{i.label}
              </div>
            ))}
          </div>
        );
      })}
      <div className="rail-grp">
        <div className="rail-h">Generated</div>
        <div className="rail-item"><span className="chip text"/>thumbnail.png</div>
      </div>
    </div>
  );
}

const TWEAK_DEFAULTS = {
  accent: "#3d7eff",
  density: "comfortable",
  showRail: false,
  autoApply: false,
};

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [state, setStateRaw] = useState(() => normalize(INITIAL));
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const histRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  const setState = (next, { history = false } = {}) => {
    if (history) { histRef.current.push(deepClone(stateRef.current)); setCanUndo(true); }
    setStateRaw(normalize(typeof next === "function" ? next(stateRef.current) : next));
  };
  const undo = () => {
    const prev = histRef.current.pop();
    if (prev) { setStateRaw(normalize(prev)); setCanUndo(histRef.current.length > 0); }
  };

  const dur = state.meta.duration;
  const [time, setTime] = useState(() => parseFloat(localStorage.getItem("ide.time") || "2") || 2);
  const [playing, setPlaying] = useState(false);
  const [selId, setSelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState(new Set());
  const [naturalSize, setNaturalSize] = useState(null);

  const rightRef = useRef(null);
  const [maxH, setMaxH] = useState(420);
  const [sheetH, setSheetH] = useState(38);
  useEffect(() => {
    const upd = () => { if (rightRef.current) setMaxH(Math.max(180, rightRef.current.clientHeight - 96)); };
    upd(); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd);
  }, []);

  const code = useMemo(() => serialize(state), [state]);

  // ---- playback loop
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setTime((tm) => {
        const nt = tm + dt;
        if (nt >= dur) { setPlaying(false); return dur; }
        return nt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);
  useEffect(() => { localStorage.setItem("ide.time", String(time)); }, [time]);

  // ---- keyboard: space toggles play
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- flash changed code lines
  const flashChanges = (oldState, newState) => {
    const ops = diffLines(serialize(oldState), serialize(newState));
    const set = new Set(); let idx = 0;
    for (const o of ops) { if (o.t !== "del") { if (o.t === "add") set.add(idx); idx++; } }
    setFlash(set);
    setSheetH((h) => Math.max(h, Math.round(maxH * 0.55)));
    setTimeout(() => setFlash(new Set()), 2000);
  };

  // ---- AI flow
  const pushMsg = (m) => setMessages((ms) => [...ms, { id: uid("m"), ...m }]);
  const applyMsg = (msg) => {
    const before = stateRef.current;
    const after = normalize(msg.patchFn(before));
    setState(after, { history: true });
    flashChanges(before, after);
    setMessages((ms) => ms.map((m) => m.id === msg.id ? { ...m, status: "applied" } : m));
  };
  const rejectMsg = (msg) => setMessages((ms) => ms.map((m) => m.id === msg.id ? { ...m, status: "rejected" } : m));

  const onSend = async (text) => {
    pushMsg({ role: "user", text });
    setThinking(true);
    try {
      const result = await callAgent(text, stateRef.current);
      setThinking(false);

      if (!result.items) {
        pushMsg({ role: "ai", text: result.reply });
        return;
      }

      const before = stateRef.current;
      const after = normalize({ ...before, items: result.items });
      const ops = diffWindow(diffLines(serialize(before), serialize(after)));
      const patchFn = () => ({ ...stateRef.current, items: result.items });
      const msg = { role: "ai", text: result.reply, loc: result.loc, diff: ops, patchFn, status: "pending" };

      if (t.autoApply) {
        const id = uid("m");
        setMessages((ms) => [...ms, { id, ...msg, status: "applied" }]);
        setState(normalize(after), { history: true });
        flashChanges(before, normalize(after));
      } else {
        pushMsg(msg);
      }
    } catch (err) {
      setThinking(false);
      pushMsg({ role: "ai", text: `Something went wrong: ${err.message}` });
    }
  };

  // ---- direct edit handlers
  const selItem = state.items.find((i) => i.id === selId) || null;
  const updateItem = (it) => setState((s) => ({ ...s, items: s.items.map((x) => x.id === it.id ? it : x) }));
  const splitItem = (it, at) => {
    if (at <= it.start + 0.2 || at >= it.end - 0.2) return;
    setState((s) => {
      const idx = s.items.findIndex((x) => x.id === it.id);
      const left = { ...it, end: at };
      left.trim = [it.trim[0], it.trim[0] + (at - it.start) * it.speed];
      const right = { ...it, id: uid("v"), start: at, trim: [left.trim[1], it.trim[1]], label: it.label };
      const items = [...s.items]; items.splice(idx, 1, left, right);
      return { ...s, items };
    }, { history: true });
  };
  const deleteItem = (it) => { setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) }), { history: true }); setSelId(null); };

  const dirty = canUndo || messages.some((m) => m.status === "applied");

  return (
    <div className={"app dens-" + t.density} style={{ "--acc": t.accent }}>
      <TopBar meta={state.meta} dur={dur} dirty={dirty}
        canUndo={canUndo} onUndo={undo}
        onRender={() => setModal("render")} onThumb={() => setModal("thumb")} onVoice={() => setModal("voice")}/>

      <div className="body">
        {t.showRail && <Rail state={state} selId={selId} onSelect={setSelId}/>}

        <div className="col left">
          <div className="left-stage" onClick={() => setSelId(null)}>
            <Preview state={state} time={time} playing={playing} onVideoSize={setNaturalSize}/>
            <Transport state={state} time={time} playing={playing}
              onToggle={() => setPlaying((p) => !p)} onSeek={(x) => { setTime(x); setPlaying(false); }}
              onAspect={(size) => setState((s) => ({ ...s, meta: { ...s.meta, size } }), { history: true })}
              naturalSize={naturalSize}/>
          </div>
          <div className="left-tl">
            <Timeline state={state} time={time} dur={dur} selId={selId} zoomPx={28}
              onSeek={(x) => { setTime(x); setPlaying(false); }} onSelect={setSelId}/>
            {selItem && <Inspector item={selItem} dur={dur} playhead={time}
              onChange={updateItem} onSplit={splitItem} onDelete={deleteItem} onClose={() => setSelId(null)}/>}
          </div>
        </div>

        <div className="vdiv"/>

        <div className="col right" ref={rightRef}>
          <Chat messages={messages} thinking={thinking}
            onSend={onSend} onApply={applyMsg} onReject={rejectMsg}/>
          <CodeSheet code={code} height={sheetH} setHeight={setSheetH} maxH={maxH} flash={flash}/>
        </div>
      </div>

      {modal === "render" && <RenderModal state={state} onClose={() => setModal(null)}/>}
      {modal === "thumb" && <ThumbModal onClose={() => setModal(null)} onPick={() => setModal(null)}/>}
      {modal === "voice" && <VoiceModal state={state} onClose={() => setModal(null)}
        onMatch={() => { setModal(null); onSend("Match the voiceover to the cuts"); }}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme"/>
        <TweakColor label="Accent" value={t.accent}
          options={["#3d7eff", "#7a5ae0", "#1f8a5b", "#e0568a", "#e0772a"]}
          onChange={(v) => setTweak("accent", v)}/>
        <TweakRadio label="Density" value={t.density} options={["comfortable", "compact"]}
          onChange={(v) => setTweak("density", v)}/>
        <TweakSection label="Layout"/>
        <TweakToggle label="Asset rail" value={t.showRail} onChange={(v) => setTweak("showRail", v)}/>
        <TweakToggle label="Agent auto-applies edits" value={t.autoApply} onChange={(v) => setTweak("autoApply", v)}/>
      </TweaksPanel>
    </div>
  );
}
