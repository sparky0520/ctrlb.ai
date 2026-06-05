// app.jsx — wires the whole IDE: state, history, playback, AI flow, modals, tweaks.
const { useState: aUseState, useEffect: aUseEffect, useRef: aUseRef, useMemo: aUseMemo } = React;

function normalize(s) {
  const n = deepClone(s);
  const ends = n.items.map((i) => i.end);
  n.meta.duration = round(Math.max(34, ...ends));
  return n;
}

// asset rail (from layout C, toggled by a tweak)
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

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#3d7eff",
  "density": "comfortable",
  "showRail": false,
  "autoApply": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [state, setStateRaw] = aUseState(() => normalize(INITIAL));
  const stateRef = aUseRef(state);
  aUseEffect(() => { stateRef.current = state; }, [state]);
  const histRef = aUseRef([]);
  const [canUndo, setCanUndo] = aUseState(false);

  const setState = (next, { history = false } = {}) => {
    if (history) { histRef.current.push(deepClone(stateRef.current)); setCanUndo(true); }
    setStateRaw(normalize(typeof next === "function" ? next(stateRef.current) : next));
  };
  const undo = () => {
    const prev = histRef.current.pop();
    if (prev) { setStateRaw(normalize(prev)); setCanUndo(histRef.current.length > 0); }
  };

  const dur = state.meta.duration;
  const [time, setTime] = aUseState(() => parseFloat(localStorage.getItem("ide.time") || "2") || 2);
  const [playing, setPlaying] = aUseState(false);
  const [selId, setSelId] = aUseState(null);
  const [messages, setMessages] = aUseState([]);
  const [thinking, setThinking] = aUseState(false);
  const [modal, setModal] = aUseState(null);
  const [flash, setFlash] = aUseState(new Set());

  // code sheet height
  const rightRef = aUseRef(null);
  const [maxH, setMaxH] = aUseState(420);
  const [sheetH, setSheetH] = aUseState(38);
  aUseEffect(() => {
    const upd = () => { if (rightRef.current) setMaxH(Math.max(180, rightRef.current.clientHeight - 96)); };
    upd(); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd);
  }, []);

  const code = aUseMemo(() => serialize(state), [state]);

  // ---- playback loop
  aUseEffect(() => {
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
  aUseEffect(() => { localStorage.setItem("ide.time", String(time)); }, [time]);

  // ---- keyboard: space toggles play
  aUseEffect(() => {
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

  const onSend = (text) => {
    pushMsg({ role: "user", text });
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const intent = matchIntent(text);
      if (!intent) {
        pushMsg({ role: "ai", text: "I can split, trim, zoom, change speed, adjust volume, add text or solid-color cards, transitions, match the voiceover, or generate a thumbnail. Try one of the suggestions below." });
        return;
      }
      if (intent.special === "thumbnail") {
        pushMsg({ role: "ai", text: intent.reply(), action: <button className="btn tiny primary" onClick={() => setModal("thumb")}>Open thumbnail panel</button> });
        setTimeout(() => setModal("thumb"), 250);
        return;
      }
      const before = stateRef.current;
      const after = intent.patch(before);
      const ops = diffWindow(diffLines(serialize(before), serialize(after)));
      const msg = { role: "ai", text: intent.reply(), loc: intent.loc, diff: ops, patchFn: intent.patch, status: "pending" };
      if (t.autoApply) {
        const id = uid("m");
        setMessages((ms) => [...ms, { id, ...msg, status: "applied" }]);
        setState(normalize(after), { history: true });
        flashChanges(before, normalize(after));
      } else {
        pushMsg(msg);
      }
    }, 650 + Math.random() * 400);
  };

  // ---- direct edit handlers
  const selItem = state.items.find((i) => i.id === selId) || null;
  const updateItem = (it) => setState((s) => ({ ...s, items: s.items.map((x) => x.id === it.id ? it : x) }));
  const splitItem = (it, at) => {
    if (at <= it.start + 0.2 || at >= it.end - 0.2) return;
    setState((s) => {
      const idx = s.items.findIndex((x) => x.id === it.id);
      const left = { ...it, end: at };
      const mid = (it.trim[0] + (at - it.start)) ;
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
            <Preview state={state} time={time} playing={playing}/>
            <Transport state={state} time={time} playing={playing}
              onToggle={() => setPlaying((p) => !p)} onSeek={(x) => { setTime(x); setPlaying(false); }}/>
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
      {modal === "thumb" && <ThumbModal onClose={() => setModal(null)} onPick={() => { setModal(null); }}/>}
      {modal === "voice" && <VoiceModal state={state} onClose={() => setModal(null)}
        onMatch={() => { const it = INTENTS.find((x) => x.id === "voice"); const before = stateRef.current; const after = normalize(it.patch(before)); setState(after, { history: true }); flashChanges(before, after); setModal(null); pushMsg({ role: "ai", text: it.reply(), loc: it.loc }); }}/>}

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

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
