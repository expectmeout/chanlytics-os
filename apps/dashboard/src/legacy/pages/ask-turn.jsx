/* global React, Icon */
// One answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, Show and
// Do, each beside one of the three's own squares, lightest to darkest; a figure's receipt; the rows it names as their
// own doors; the next step once; and the cards, which approve, edit, wait or undo through the verbs' own routes. What
// an answer shows is decided by the contract (window.__ask.answer: the answer and one door per place); this file only
// draws. Published as window.AskAnswerKit, and AskTurn, AskAnswer and AskCard on window.

const useAtState = React.useState;

/** An answer no client can shape (the mockup, a test): its words, as prose. */
const atProse = (m, lang) => ({
  v: 2,
  form: "prose",
  say: { headline: "", detail: (m && m.text) || "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language: lang || "en",
});

/** The rows the keys walk under an answer, in the order they are drawn: the items, then Open, then the next questions. */
const answerMoves = (a) => [
  ...a.show.items.map((it) => ({ type: "item", to: it.source.to })),
  ...(a.do.open ? [{ type: "open", to: a.do.open.to }] : []),
  ...a.do.next.map((q) => ({ type: "next", q })),
];

// A proposal the assistant made, as a card: the exact change, the door it
// goes through, Approve (or Edit in the composer), Not now, and the undo the
// verb has. The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread
// reads back with "Sent" rather than a fresh Approve. The Line draws a card
// again whenever its answer comes back under the line or opens in a fold, so
// what happened is also written into the conversation it holds (`onOutcome`):
// a card drawn again from a stale outcome offered Send a second time. Its
// Open is the contract's (cardOpenRoute), hidden where the answer already
// offers the place (`hideOpen`, oneDoor).
const AskCard = ({ p, messageId, t, onNav, hideOpen = false, onOutcome }) => {
  const A = window.__ask;
  const [state, setState] = useAtState(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useAtState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useAtState(p.outcome ? p.outcome.undo || null : null);
  // When the act happened: an undo is offered only while it is still true (contracts askUndoOpen).
  const [doneAt, setDoneAt] = useAtState(p.outcome ? p.outcome.atMs || 0 : 0);
  // Undoing a new playbook deletes it, so that undo asks first.
  const [armUndo, setArmUndo] = useAtState(false);
  const [busy, setBusy] = useAtState(false);
  const [err, setErr] = useAtState("");
  // A lead_search card IS the finder's plan card (Task 9): its words are the
  // same pickers, so a plan changed here and a plan changed on Leads cannot say
  // different things. The edited plan and the open picker are this turn's.
  const [edited, setEdited] = useAtState(null);
  const [pick, setPick] = useAtState(null);
  const gateKey = (window.PROPOSAL_GATE || {})[p.kind] || "approve";
  const gated = window.canDo ? !window.canDo(gateKey) : false;
  const pl = p.payload || {};
  const record = (o) => {
    if (onOutcome && messageId) onOutcome(messageId, p.id, o);
    if (A && messageId && /^[0-9a-f-]{36}$/.test(messageId)) A.outcome(messageId, p.id, o);
  };
  const approveWith = async (proposal) => {
    if (busy || !A) return;
    setBusy(true); setErr("");
    const r = await A.commit(proposal);
    setBusy(false);
    if (r.ok) {
      const at = Date.now();
      setState("done"); setReceipt(r.receipt); setUndoData(r.undo || null); setDoneAt(at);
      record({ state: "done", receipt: r.receipt, atMs: at, undo: r.undo || null });
    } else {
      setState("failed"); setErr(r.message);
      record({ state: "failed", receipt: r.message, atMs: Date.now(), undo: null });
    }
  };
  const approve = () => approveWith(p);
  const dismiss = () => { setState("dismissed"); record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null }); };
  const undo = async () => {
    if (busy || !A) return;
    setBusy(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData });
    setBusy(false);
    setArmUndo(false);
    if (r.ok) { setState("undone"); setReceipt(r.receipt); setUndoData(null); record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null }); }
    else setErr(r.message);
  };
  // Offered only while it is still true: a reply until its cancel window closes,
  // settings while nobody has saved since, anything else for ten minutes.
  const settingsVersion = window.__SETTINGS && typeof window.__SETTINGS.version === "number" ? window.__SETTINGS.version : null;
  const undoOpen = state === "done" && !!undoData && !!p.undo && !!(A && A.undoOpen && A.undoOpen(p.kind, undoData, doneAt, Date.now(), settingsVersion));
  const KIND = { reply: t.kReply, steer: t.kSteer, thread_verb: t.kInbox, person_mode: t.kPerson, policy: t.kAutonomy, settings: t.kSettings, whisper: t.kWhisper, invite: t.kTeam, broadcast: t.kBroadcast, playbook: t.kPlaybook, lead_search: t.kLeads, deal: t.kDeal };
  const ICON = { reply: "chat", steer: "chat", whisper: "phone", invite: "users", policy: "shield", settings: "settings", person_mode: "settings", thread_verb: "inbox", broadcast: "wave", playbook: "bolt", lead_search: "search", deal: "users" };
  const openRoute = A && A.cardOpenRoute ? A.cardOpenRoute(p) : null;
  return (
    <div className={`ask-card ${state}`} data-testid="ask-card" data-kind={p.kind}>
      <div className="ask-card-head"><Icon name={ICON[p.kind] || "inbox"} size={12} />{p.title}<span className="ask-card-kind">{KIND[p.kind] || p.kind}</span></div>
      {p.kind === "lead_search" && state === "idle" && pl.plan && window.LeadPlanCard
        ? window.LeadPlanCard({
          plan: edited || pl.plan,
          view: pl.view || null,
          facts: pl.facts || null,
          busy,
          refusal: err,
          baseVersion: pl.plan.version || 1,
          pick,
          onPick: setPick,
          onChange: setEdited,
          onApprove: () => approveWith({ ...p, payload: { ...pl, plan: edited || pl.plan } }),
          onBack: () => { if (A) A.editReply(p); },
        })
        : <div className="ask-card-summary">{p.summary}</div>}
      {p.kind === "reply" && pl.price_warning && state === "idle" && <div className="ask-card-note">{t.priceNote}</div>}
      {p.kind === "reply" && pl.window_open === false && state === "idle" && <div className="ask-card-note">{t.windowNote}</div>}
      {state === "idle" && (
        <div className="ask-card-actions">
          <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy || gated} title={gated ? window.gateTitle(gateKey) : undefined} data-testid="ask-card-approve">
            {busy ? t.working : p.kind === "reply" ? t.send : t.approve}
          </button>
          {p.kind === "reply" && pl.conversation_id && <button className="btn btn-ghost btn-sm" onClick={() => { onNav(`inbox/th-${pl.conversation_id}`); if (A) A.editReply(p); }}>{t.editComposer}</button>}
          {openRoute && !hideOpen && <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>{t.openIt}</button>}
          <button className="btn btn-ghost btn-sm" onClick={dismiss} disabled={busy}>{t.notNow}</button>
          {gated && <span className="ask-card-note">{window.gateTitle(gateKey)}</span>}
        </div>
      )}
      {state !== "idle" && (
        <div className="ask-card-receipt">
          <Icon name={state === "done" ? "check" : state === "failed" ? "alert" : "x"} size={11} className={state === "done" ? "ok" : ""} />
          <span>{state === "failed" ? err || receipt : state === "dismissed" ? t.notNow : receipt}</span>
          {undoOpen && !armUndo && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={p.kind === "playbook" ? () => setArmUndo(true) : undo} disabled={busy}>{p.undo}</button>}
          {undoOpen && armUndo && <window.Confirm question={`${p.undo}?`} detail="The playbook and its schedule go; runs already sent keep their numbers in Broadcasts." yes="Yes, delete it" danger busy={busy} onYes={undo} onNo={() => setArmUndo(false)} testid="ask-card-undo" />}
          {state === "failed" && <button className="btn btn-ghost btn-sm ask-card-undo" onClick={() => { setState("idle"); setErr(""); }}>{t.tryAgain}</button>}
        </div>
      )}
      {err && state === "done" && <div className="ask-card-note">{err}</div>}
    </div>
  );
};

// A figure: the value, what it counts, how it moved; a press on the value shows where it comes from (its receipt),
// with a door to that place only where oneDoor left it one.
const AskFigure = ({ f, open, onToggle, t, onNav }) => (
  <div className="ask-figure">
    {f.source ? (
      <button type="button" className="ask-figure-value" aria-expanded={open} onClick={onToggle} data-testid="ask-figure">
        {f.value}
      </button>
    ) : (
      <span className="ask-figure-value plain">{f.value}</span>
    )}
    <span className="ask-figure-label">{f.label}</span>
    {f.note ? <span className="ask-figure-note">{f.note}</span> : null}
    {open && f.source ? (
      <div className="ask-receipt" role="note" data-testid="ask-receipt">
        <span className="ask-receipt-from">{t.from} {f.source.label}</span>
        {f.source.door ? (
          <button type="button" className="ask-receipt-door" onClick={() => onNav(f.source.to)}>{t.open}</button>
        ) : null}
      </div>
    ) : null}
  </div>
);

// One whole in its parts, on the chart kit's bar (chart-core.jsx SegmentBar), coloured as Reports colours who answered:
// the parts in the kit's blues in order, the one marked for attention in the warn status with its icon.
const AT_PART_COLORS = ["var(--chart-1)", "var(--chart-1-soft)", "var(--chart-ramp-2)", "var(--chart-ramp-1)"];
const AskBreakdown = ({ b, t, onNav }) => {
  const SegmentBar = window.SegmentBar;
  const config = {};
  let n = 0;
  const rows = b.parts.map((p, k) => {
    const key = `p${k}`;
    config[key] = p.warn
      ? { label: p.label, color: "var(--warn)", icon: "alert" }
      : { label: p.label, color: AT_PART_COLORS[n++] || "var(--chart-1)" };
    return { key, value: p.value };
  });
  const title = `${b.total} ${b.label}`;
  return (
    <div className="ask-breakdown" data-testid="ask-breakdown">
      {SegmentBar ? <SegmentBar title={title} rows={rows} config={config} small /> : <span className="ask-breakdown-title">{title}</span>}
      {b.source ? (
        <span className="ask-breakdown-from">
          {t.from} {b.source.label}
          {b.source.door ? (
            <button type="button" className="ask-receipt-door" onClick={() => onNav(b.source.to)}>{t.open}</button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
};

// The answer: Say (the headline, or a prose answer's words), Show (the whole in its parts, the figures, the rows it
// names), Do (the cards, Try again, Open, the next questions). `walk`: this is the answer the keys walk, whose moves
// carry the ids the line points at (answerMoves' order) and `sel` is the one they stand on; a folded answer has none.
const AskAnswer = ({ answer, cardOpen, cards, messageId, retry, walk = false, sel = -1, t, onNav, onFollow, onOutcome, compact = false }) => {
  const [receipt, setReceipt] = useAtState(-1);
  const a = answer;
  const hasShow = a.show.figures.length > 0 || a.show.items.length > 0 || !!a.show.breakdown;
  const hasDo = !!a.do.open || a.do.next.length > 0 || (cards && cards.length > 0) || !!retry;
  // Each move's place in answerMoves' order: the items, then Open, then the next questions.
  const openAt = a.show.items.length;
  const nextAt = openAt + (a.do.open ? 1 : 0);
  const moveProps = (me, cls) =>
    walk ? { id: `ask-move-${me}`, className: `${cls}${sel === me ? " sel" : ""}` } : { className: cls };
  return (
    <div className={`ask-answer${compact ? " compact" : ""}`} data-testid="ask-answer">
      <div className="ask-part say" data-testid="ask-say">
        <span className="ask-mark m1" aria-hidden="true" />
        <div className="ask-say">
          {a.say.headline ? <p className="ask-headline">{a.say.headline}</p> : null}
          {a.say.detail ? <p className={a.say.headline ? "ask-detail" : "ask-prose"}>{a.say.detail}</p> : null}
        </div>
      </div>
      {hasShow ? (
        <div className="ask-part show" data-testid="ask-show">
          <span className="ask-mark m2" aria-hidden="true" />
          <div className="ask-show">
            {a.show.breakdown ? <AskBreakdown b={a.show.breakdown} t={t} onNav={onNav} /> : null}
            {a.show.figures.length ? (
              <div className="ask-figures">
                {a.show.figures.map((f, k) => (
                  <AskFigure key={k} f={f} open={receipt === k} onToggle={() => setReceipt(receipt === k ? -1 : k)} t={t} onNav={onNav} />
                ))}
              </div>
            ) : null}
            {a.show.items.length ? (
              <div className="ask-items">
                {a.show.items.map((it, me) => (
                  <button key={me} type="button" {...moveProps(me, "ask-item")} onClick={() => onNav(it.source.to)} data-testid="ask-item">
                    <span className="ask-item-top">
                      <span className="ask-item-title">{it.title}</span>
                      {it.meta ? <span className="ask-item-meta">{it.meta}</span> : null}
                    </span>
                    {it.line ? <span className="ask-item-line">{it.line}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {hasDo ? (
        <div className="ask-part do" data-testid="ask-do">
          <span className="ask-mark m3" aria-hidden="true" />
          <div className="ask-do">
            {(cards || []).map((p) => (
              <AskCard key={p.id} p={p} messageId={messageId} t={t} onNav={onNav} onOutcome={onOutcome} hideOpen={!!cardOpen && cardOpen[p.id] === false} />
            ))}
            {retry ? (
              <button type="button" className="ask-move" onClick={retry} data-testid="ask-retry">{t.tryAgain}</button>
            ) : null}
            {a.do.open ? (
              <button type="button" {...moveProps(openAt, "ask-move open")} onClick={() => onNav(a.do.open.to)} data-testid="ask-open">
                {a.do.open.label}
              </button>
            ) : null}
            {a.do.next.map((q, k) => (
              <button key={q} type="button" {...moveProps(nextAt + k, "ask-move next")} onClick={() => onFollow(q)} data-testid="ask-next">
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// A turn: the question over it, then the answer. While it streams, Say as written so far (`say`: the headline, then
// the detail, as the answer draws them) or a v1 turn's words, with a cursor after the last; Show and Do wait for the
// final message (spec 7.4), and the Line says the answer once it is whole, not every piece (spec 6.10). A failed turn
// says why and, on the latest only, offers Try again (N20). A quick answer (no model) is drawn the same way, from `quick`.
const AskTurn = ({ m, q, quick, say, latest = false, streaming = false, walk = false, sel = -1, t, lang, onFollow, onNav, onRetry, onOutcome, compact = false }) => {
  const A = window.__ask;
  if (streaming) {
    const cursor = <span className="ask-cursor" />;
    return (
      <div className="ask-turn streaming" data-testid="ask-turn">
        {q ? <p className="ask-turn-q">{q}</p> : null}
        <div className="ask-part say" data-testid="ask-say">
          <span className="ask-mark m1" aria-hidden="true" />
          {say ? (
            <div className="ask-say">
              {say.headline ? <p className="ask-headline">{say.headline}{say.detail ? null : cursor}</p> : null}
              {say.detail ? <p className={say.headline ? "ask-detail" : "ask-prose"}>{say.detail}{cursor}</p> : null}
            </div>
          ) : (
            <p className="ask-prose">{m.text}{cursor}</p>
          )}
        </div>
      </div>
    );
  }
  const drawn = quick
    ? { answer: quick, cardOpen: {} }
    : A && A.answer
      ? A.answer(m)
      : { answer: atProse(m, lang), cardOpen: {} };
  const failed = !!(m && m.failed);
  return (
    <div className={`ask-turn${failed ? " failed" : ""}${latest ? " latest" : ""}`} data-testid="ask-turn">
      {q ? <p className="ask-turn-q">{q}</p> : null}
      <AskAnswer
        answer={drawn.answer}
        cardOpen={drawn.cardOpen}
        cards={m && !failed ? m.proposals || [] : []}
        messageId={m ? m.id : null}
        retry={failed && latest && onRetry ? onRetry : null}
        walk={walk}
        sel={sel}
        t={t}
        onNav={onNav}
        onFollow={onFollow}
        onOutcome={onOutcome}
        compact={compact}
      />
      {m && m.ungrounded ? <div className="ask-unverified"><Icon name="alert" size={11} /> {t.unverified}</div> : null}
    </div>
  );
};

window.AskAnswerKit = { AskTurn, AskAnswer, AskCard, answerMoves };
Object.assign(window, { AskTurn, AskAnswer, AskCard });
