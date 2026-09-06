/* global React, Icon */
// One assistant turn as the palette draws it: the words, a quiet toolbar
// (copy, read aloud), the cards it proposed, where it opens and what it
// read, and — on the latest turn only — what to ask next. What an answer
// shows is decided by the contract (window.__ask.shape), not here: this
// file only draws. Published as window.AskTurn and window.AskCard.

const useAtState = React.useState;

const atIconFor = (kind) => (kind === "call" ? "phone" : kind === "person" ? "users" : kind === "page" ? "arrow-right" : "chat");

// The quiet toolbar: shown on hover or focus on a desktop, always on touch.
const AskTools = ({ m, t, speech, flash }) => {
  const [copied, setCopied] = useAtState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      flash({ msg: <>{t.copy}: {t.unavailable}</> });
    }
  };
  const speaking = speech.speakingId === m.id;
  return (
    <div className="ask-tools" role="toolbar" aria-label="Answer">
      <button type="button" className="ask-tool" onClick={copy} title={copied ? t.copied : t.copy} aria-label={t.copy} data-testid="ask-copy">
        <Icon name={copied ? "check" : "content"} size={12} />
      </button>
      {speech.canSpeak && (
        <button type="button" className={`ask-tool ${speaking ? "on" : ""}`} onClick={() => { if (!speech.toggle(m.id, m.text, m.language)) flash({ msg: <>{t.noSpeech}</> }); }} title={speaking ? t.stop : t.read} aria-label={speaking ? t.stop : t.read} aria-pressed={speaking} data-testid="ask-read">
          <Icon name={speaking ? "pause" : "headphones"} size={12} />
        </button>
      )}
    </div>
  );
};

// Where the answer opens, and what it read. The Open button comes first and
// is never repeated as a chip; a chip names its kind.
const AskLinks = ({ shape, t, onNav }) => {
  if (!shape.open && !shape.citations.length) return null;
  return (
    <div className="ask-msg-links">
      {shape.open && (
        <button className="ask-action-chip" onClick={() => onNav(shape.open.to)} data-testid="ask-open">
          <Icon name="arrow-right" size={11} /> {shape.open.label}
        </button>
      )}
      {shape.citations.length ? <span className="ask-from">{t.from}</span> : null}
      {shape.citations.map((c, i) => (
        <button key={i} className="ask-link-chip" onClick={() => onNav(c.to)} title={c.kind}>
          <Icon name={atIconFor(c.kind)} size={10} /> {c.label}
        </button>
      ))}
    </div>
  );
};

// What to ask next: on the latest answer only, never an echo of a place the
// answer already opens.
const AskFollowups = ({ followups, t, onFollow }) => {
  if (!followups.length) return null;
  return (
    <div className="ask-follow" data-testid="ask-followups">
      <span className="ask-follow-label">{t.next}</span>
      {followups.map((f, i) => (
        <button key={i} className="ask-follow-chip" onClick={() => onFollow(f)}>{f}</button>
      ))}
    </div>
  );
};

// A proposal the assistant made, as a card: the exact change, the door it
// goes through, Approve (or Edit in the composer), Not now, and the undo the
// verb has. The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread
// reads back with "Sent" rather than a fresh Approve.
const AskCard = ({ p, messageId, t, onNav }) => {
  const A = window.__ask;
  const [state, setState] = useAtState(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useAtState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useAtState(p.outcome ? p.outcome.undo || null : null);
  const [busy, setBusy] = useAtState(false);
  const [err, setErr] = useAtState("");
  const gateKey = (window.PROPOSAL_GATE || {})[p.kind] || "approve";
  const gated = window.canDo ? !window.canDo(gateKey) : false;
  const pl = p.payload || {};
  const record = (o) => { if (A && messageId && /^[0-9a-f-]{36}$/.test(messageId)) A.outcome(messageId, p.id, o); };
  const approve = async () => {
    if (busy || !A) return;
    setBusy(true); setErr("");
    const r = await A.commit(p);
    setBusy(false);
    if (r.ok) {
      setState("done"); setReceipt(r.receipt); setUndoData(r.undo || null);
      record({ state: "done", receipt: r.receipt, atMs: Date.now(), undo: r.undo || null });
    } else {
      setState("failed"); setErr(r.message);
      record({ state: "failed", receipt: r.message, atMs: Date.now(), undo: null });
    }
  };
  const dismiss = () => { setState("dismissed"); record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null }); };
  const undo = async () => {
    if (busy || !A) return;
    setBusy(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: 0, undo: undoData });
    setBusy(false);
    if (r.ok) { setState("undone"); setReceipt(r.receipt); setUndoData(null); record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null }); }
    else setErr(r.message);
  };
  const KIND = { reply: t.kReply, steer: t.kSteer, thread_verb: t.kInbox, person_mode: t.kPerson, policy: t.kAutonomy, settings: t.kSettings, whisper: t.kWhisper, invite: t.kTeam, broadcast: t.kBroadcast, playbook: t.kPlaybook };
  const ICON = { reply: "chat", steer: "chat", whisper: "phone", invite: "users", policy: "shield", settings: "settings", person_mode: "settings", thread_verb: "inbox", broadcast: "wave", playbook: "bolt" };
  const openRoute = p.kind === "settings" ? "admin/memory" : p.kind === "policy" ? "admin/autonomy" : p.kind === "person_mode" ? `clients/${pl.contact_id}` : p.kind === "broadcast" ? "broadcasts" : p.kind === "playbook" ? "outbound" : `inbox/th-${pl.conversation_id}`;
  return (
    <div className={`ask-card ${state}`} data-testid="ask-card" data-kind={p.kind}>
      <div className="ask-card-head"><Icon name={ICON[p.kind] || "inbox"} size={12} />{p.title}<span className="ask-card-kind">{KIND[p.kind] || p.kind}</span></div>
      <div className="ask-card-summary">{p.summary}</div>
      {p.kind === "reply" && pl.price_warning && state === "idle" && <div className="ask-card-note">{t.priceNote}</div>}
      {p.kind === "reply" && pl.window_open === false && state === "idle" && <div className="ask-card-note">{t.windowNote}</div>}
      {state === "idle" && (
        <div className="ask-card-actions">
          <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy || gated} title={gated ? window.gateTitle(gateKey) : undefined} data-testid="ask-card-approve">
            {busy ? t.working : p.kind === "reply" ? t.send : t.approve}
          </button>
          {p.kind === "reply" && pl.conversation_id && <button className="btn btn-ghost btn-sm" onClick={() => { onNav(`inbox/th-${pl.conversation_id}`); if (A) A.editReply(p); }}>{t.editComposer}</button>}
          {p.kind !== "reply" && p.kind !== "steer" && p.kind !== "whisper" && p.kind !== "invite" && (
            <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>{t.openIt}</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={dismiss} disabled={busy}>{t.notNow}</button>
          {gated && <span className="ask-card-note">{window.gateTitle(gateKey)}</span>}
        </div>
      )}
      {state !== "idle" && (
        <div className="ask-card-receipt">
          <Icon name={state === "done" ? "check" : state === "failed" ? "alert" : "x"} size={11} className={state === "done" ? "ok" : ""} />
          <span>{state === "failed" ? err || receipt : state === "dismissed" ? t.notNow : receipt}</span>
          {state === "done" && undoData && p.undo && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={undo} disabled={busy}>{p.undo}</button>}
          {state === "failed" && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={() => { setState("idle"); setErr(""); }}>{t.tryAgain}</button>}
        </div>
      )}
      {err && state === "done" && <div className="ask-card-note">{err}</div>}
    </div>
  );
};

// The turn: text (with a cursor while it streams), the unverified mark, the
// cards, the links, the toolbar, and — when it is the latest — what next.
const AskTurn = ({ m, latest, streaming, t, lang, onFollow, onNav, speech, flash }) => {
  const A = window.__ask;
  const shape = streaming || !A ? { open: null, citations: [], followups: [] } : A.shape(m, lang);
  const at = m.atMs ? new Date(m.atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  return (
    <div className={`ask-msg ai ${m.failed ? "failed" : ""} ${latest ? "latest" : ""}`} data-testid="ask-turn">
      <span className="ask-msg-avatar" title={at}><Icon name="sparkle" size={11} /></span>
      <div className="ask-msg-body">
        <p className="ask-msg-text" aria-live="polite">{m.text}{streaming ? <span className="ask-cursor" /> : null}</p>
        {!streaming && m.ungrounded && <div className="ask-unverified"><Icon name="alert" size={11} /> {t.unverified}</div>}
        {!streaming && m.proposals && m.proposals.length ? m.proposals.map((p) => <AskCard key={p.id} p={p} messageId={m.id} t={t} onNav={onNav} />) : null}
        {!streaming && <AskLinks shape={shape} t={t} onNav={onNav} />}
        {!streaming && m.text && !m.failed && <AskTools m={m} t={t} speech={speech} flash={flash} />}
        {!streaming && latest && <AskFollowups followups={shape.followups} t={t} onFollow={onFollow} />}
      </div>
    </div>
  );
};

window.AskTurn = AskTurn;
window.AskCard = AskCard;
