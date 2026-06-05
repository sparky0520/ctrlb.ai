// timeline.jsx — tracks derived from state, scrub playhead, select + inspect clips.
const { useRef: tlUseRef } = React;

const SEG_CLASS = { video: "vid", zoom: "zoom", text: "text", color: "text", transition: "zoom", voice: "voice", music: "music" };

function Timeline({ state, time, dur, selId, onSeek, onSelect, zoomPx }) {
  const laneRef = tlUseRef(null);
  const pps = zoomPx; // px per second
  const W = dur * pps;

  const seekTo = (clientX) => {
    const r = laneRef.current.getBoundingClientRect();
    onSeek(clamp((clientX - r.left - 74 + laneRef.current.scrollLeft) / pps, 0, dur));
  };
  const onRulerDown = (e) => {
    seekTo(e.clientX);
    const mv = (ev) => seekTo(ev.clientX);
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };

  const ticks = [];
  for (let s = 0; s <= dur; s += 3) ticks.push(s);

  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="tl-title">Timeline</span>
        <span className="tl-meta">{state.items.length} clips · {fmtTime(dur)} · 30fps</span>
      </div>
      <div className="tl-scroll" ref={laneRef}>
        <div className="tl-inner" style={{ width: 74 + W + 40 }}>
          <div className="tl-ruler" style={{ width: W }} onMouseDown={onRulerDown}>
            {ticks.map((s) => (
              <div className="tick" key={s} style={{ left: s * pps }}><span>{fmtTime(s)}</span></div>
            ))}
          </div>
          <div className="tl-tracks">
            <div className="tl-playhead" style={{ left: 74 + time * pps }}><div className="ph-head"/></div>
            {TRACK_ORDER.map((tr) => {
              const segs = state.items.filter((i) => i.track === tr);
              return (
                <div className="tl-row" key={tr}>
                  <div className="tl-name">{TRACK_LABEL[tr]}</div>
                  <div className="tl-lane" style={{ width: W }}>
                    {segs.map((s) => (
                      <div key={s.id}
                        className={"seg " + SEG_CLASS[s.type] + (selId === s.id ? " sel" : "")}
                        style={{ left: s.start * pps, width: Math.max(14, (s.end - s.start) * pps) }}
                        onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}>
                        {s.type === "video" && <div className="seg-thumbs"/>}
                        {(s.type === "voice" || s.type === "music") && <div className="seg-wave"/>}
                        {s.type === "color" && <div className="seg-solid" style={{ background: s.color }}/>}
                        <span className="seg-label">{s.label}{s.type === "video" && s.speed !== 1 ? `  ${s.speed}×` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- inspector: direct editing for the selected clip -----------------------
function Inspector({ item, dur, onChange, onSplit, onDelete, onClose, playhead }) {
  if (!item) return null;
  const set = (patch) => onChange({ ...item, ...patch });
  const Field = ({ label, children }) => (
    <label className="insp-field"><span>{label}</span><div className="insp-ctl">{children}</div></label>
  );
  const Slider = ({ value, min, max, step, onInput, fmt }) => (
    <div className="insp-slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onInput(parseFloat(e.target.value))}/>
      <span className="insp-val">{fmt(value)}</span>
    </div>
  );

  return (
    <div className="inspector">
      <div className="insp-head">
        <span className={"insp-tag " + SEG_CLASS[item.type]}>{item.type}</span>
        <span className="insp-name">{item.label}</span>
        <div className="insp-spacer"/>
        <button className="insp-x" onClick={onClose}>✕</button>
      </div>
      <div className="insp-body">
        {item.type === "video" && (<>
          <Field label="Trim in">
            <Slider value={item.trim[0]} min={0} max={item.trim[1]-1} step={0.5}
              onInput={(v) => set({ trim: [v, item.trim[1]] })} fmt={(v) => v.toFixed(1) + "s"}/>
          </Field>
          <Field label="Trim out">
            <Slider value={item.trim[1]} min={item.trim[0]+1} max={42} step={0.5}
              onInput={(v) => set({ trim: [item.trim[0], v] })} fmt={(v) => v.toFixed(1) + "s"}/>
          </Field>
          <Field label="Speed">
            <Slider value={item.speed} min={0.25} max={3} step={0.25}
              onInput={(v) => set({ speed: v })} fmt={(v) => v.toFixed(2) + "×"}/>
          </Field>
          <Field label="Volume">
            <Slider value={item.volume} min={0} max={1} step={0.05}
              onInput={(v) => set({ volume: v })} fmt={(v) => Math.round(v*100)}/>
          </Field>
        </>)}
        {item.type === "text" && (<>
          <Field label="Text">
            <input className="insp-text" value={item.value} onChange={(e) => set({ value: e.target.value })}/>
          </Field>
          <Field label="Preset">
            <div className="insp-seg">
              {["title-card","lower-third","caption"].map((p) => (
                <button key={p} className={item.preset===p?"on":""} onClick={() => set({ preset: p })}>{p}</button>
              ))}
            </div>
          </Field>
          <Field label="Duration">
            <Slider value={item.end-item.start} min={1} max={6} step={0.5}
              onInput={(v) => set({ end: item.start + v })} fmt={(v) => v.toFixed(1) + "s"}/>
          </Field>
        </>)}
        {item.type === "zoom" && (<>
          <Field label="Scale">
            <Slider value={item.scale} min={1.1} max={2.5} step={0.1}
              onInput={(v) => set({ scale: v })} fmt={(v) => v.toFixed(1) + "×"}/>
          </Field>
          <Field label="Hold">
            <Slider value={item.end-item.start} min={1} max={8} step={0.5}
              onInput={(v) => set({ end: item.start + v })} fmt={(v) => v.toFixed(1) + "s"}/>
          </Field>
        </>)}
        {item.type === "color" && (<>
          <Field label="Caption">
            <input className="insp-text" value={item.value||""} onChange={(e) => set({ value: e.target.value })}/>
          </Field>
          <Field label="Color">
            <div className="insp-swatches">
              {["#3d2fb8","#0e1320","#1f8a5b","#b8332f","#e0a93d"].map((c) => (
                <button key={c} style={{ background: c }} className={item.color===c?"on":""} onClick={() => set({ color: c })}/>
              ))}
            </div>
          </Field>
        </>)}
        {(item.type === "voice" || item.type === "music") && (<>
          <Field label="Volume">
            <Slider value={item.volume} min={0} max={1} step={0.02}
              onInput={(v) => set({ volume: v })} fmt={(v) => Math.round(v*100)}/>
          </Field>
          <Field label="Start">
            <Slider value={item.start} min={0} max={dur-1} step={0.5}
              onInput={(v) => set({ start: v, end: v + (item.end-item.start) })} fmt={(v) => v.toFixed(1) + "s"}/>
          </Field>
        </>)}
      </div>
      <div className="insp-foot">
        {item.type === "video" && <button className="btn tiny ghost" onClick={() => onSplit(item, playhead)}>Split at playhead</button>}
        <button className="btn tiny ghost danger" onClick={() => onDelete(item)}>Delete</button>
      </div>
    </div>
  );
}

Object.assign(window, { Timeline, Inspector });
