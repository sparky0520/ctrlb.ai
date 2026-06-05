// chat.jsx — AI-primary panel. Messages + inline diff cards (apply / reject) + input.
const { useState: chUseState, useEffect: chUseEffect, useRef: chUseRef } = React;

function Spark({ s = 12 }) {
  return <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.6 L7.1 4.9 L11.4 6 L7.1 7.1 L6 11.4 L4.9 7.1 L0.6 6 L4.9 4.9 Z" fill="currentColor"/></svg>;
}

function DiffCard({ msg, onApply, onReject }) {
  const ops = msg.diff || [];
  return (
    <div className={"diffcard " + msg.status}>
      <div className="dc-head">
        <span className="dc-file"><span className="dot edit"/>config.json</span>
        <span className="dc-loc">{msg.loc}</span>
      </div>
      <div className="dc-body">
        {ops.map((o, i) => (
          <div key={i} className={"dl " + o.t}>
            <span className="g">{o.t === "add" ? "+" : o.t === "del" ? "−" : " "}</span>
            <span className="dl-code">{highlightLine(o.text)}</span>
          </div>
        ))}
      </div>
      {msg.status === "pending" ? (
        <div className="dc-actions">
          <button className="btn tiny ghost" onClick={() => onReject(msg)}>Reject</button>
          <button className="btn tiny primary" onClick={() => onApply(msg)}>Apply edit</button>
        </div>
      ) : (
        <div className={"dc-status " + msg.status}>
          {msg.status === "applied" ? "✓ Applied to config.json" : "Reverted"}
        </div>
      )}
    </div>
  );
}

const STARTERS = [
  "Trim the dead air at the start",
  "Zoom into the dashboard at 12s",
  "Speed up the slow middle 1.5×",
  "Add a solid-color outro card",
  "Match the voiceover to the cuts",
  "Generate a thumbnail",
];

function Chat({ messages, onSend, onApply, onReject, thinking }) {
  const [text, setText] = chUseState("");
  const scrollRef = chUseRef(null);
  chUseEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const submit = () => { const t = text.trim(); if (!t) return; onSend(t); setText(""); };

  return (
    <div className="chat">
      <div className="panel-head">
        <span className="ph-title"><Spark/> Agent</span>
        <span className="ph-sub">edits config.json · ⌘K</span>
        <div className="ph-spacer"/>
        <span className="model">claude · video</span>
      </div>

      <div className="ch-scroll" ref={scrollRef}>
        <div className="ch-intro">
          <div className="intro-mark"><Spark s={15}/></div>
          <div className="intro-h">Describe the edit, I’ll change the config</div>
          <div className="intro-p">You never touch the preview directly — I propose edits to <code>config.json</code> and the video re-renders from it.</div>
        </div>

        {messages.map((m) => (
          m.role === "user"
            ? <div className="msg user" key={m.id}><div className="bub">{m.text}</div></div>
            : <div className="msg ai" key={m.id}>
                <div className="ai-row">
                  <span className="ai-ava"><Spark s={11}/></span>
                  <div className="bub">{m.text}</div>
                </div>
                {m.diff && <DiffCard msg={m} onApply={onApply} onReject={onReject}/>}
                {m.action && <div className="ai-action">{m.action}</div>}
              </div>
        ))}

        {thinking && (
          <div className="msg ai"><div className="ai-row"><span className="ai-ava"><Spark s={11}/></span>
            <div className="bub thinking"><span/><span/><span/></div></div></div>
        )}
      </div>

      <div className="ch-starters">
        {STARTERS.map((s) => <button key={s} onClick={() => onSend(s)}>{s}</button>)}
      </div>

      <div className="ch-input">
        <div className="ci-box">
          <textarea rows="1" value={text} placeholder="Ask the agent to edit your video…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}/>
          <button className="ci-send" onClick={submit} disabled={!text.trim()}><Spark s={12}/></button>
        </div>
        <div className="ci-foot"><span className="ctx">@screen-recording.mp4</span> in context · Enter to send</div>
      </div>
    </div>
  );
}

Object.assign(window, { Chat, DiffCard, Spark });
