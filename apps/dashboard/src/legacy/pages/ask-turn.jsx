/* global React, Icon */
// One answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, Show and
// Do, each beside one of the three's own squares on a rail (the stage's spec, S3), lightest to darkest; a figure as a
// tile with its receipt inside; the rows it names as their own doors; the next step once; and the cards, which
// approve, edit, wait or undo through the verbs' own routes. What an answer shows is decided by the contract
// (window.__ask.answer: the answer and one door per place); this file only draws. Published as window.AskAnswerKit,
// and AskTurn and AskCard on window.

const useAtState = React.useState;

// Each kind a source names (contracts ASK_CITATION_KINDS) as the mark before its row, the page's own glyph where its
// page has one: a thread or a conversation is a chat. A scope's run is the Broadcasts row a citation calls a broadcast.
// A list's card and a run's card (AT_CARD_ICONS) are marked as their rows are.
const AT_KIND_GLYPHS = {
  thread: "chat",
  conversation: "chat",
  call: "phone",
  person: "users",
  page: "arrow-right",
  lead: "star",
  search: "search",
  deal: "deal",
  list: "filter",
  broadcast: "wave",
  run: "wave",
  playbook: "bolt",
  template: "content",
  domain: "globe",
};
/** A kind's mark, for a row in an answer and for the scope the Line carries; a kind it does not know is a chat. */
const askKindGlyph = (kind) => AT_KIND_GLYPHS[kind] || "chat";

/** An answer no client can shape (the mockup, a test): its words, as prose. */
const atProse = (m, lang) => ({
  v: 2,
  form: "prose",
  say: { headline: "", detail: (m && m.text) || "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language: lang || "en",
});

/**
 * The rows the keys walk under an answer, in the order they are drawn: the items that are doors (one door drew a later
 * item to the same place without one), then Open, then the next questions.
 */
const answerMoves = (a) => [
  ...a.show.items.filter((it) => it.source.door !== false).map((it) => ({ type: "item", to: it.source.to })),
  ...(a.do.open ? [{ type: "open", to: a.do.open.to }] : []),
  ...a.do.next.map((q) => ({ type: "next", q })),
];

// A card is who or what it touches, the change as it will land, what follows, then one act (the spec
// 2026-09-27-ask-chat-on-a-phone, D16); these are its parts, and AskCard below holds its state and its verbs.

// Each card's kind as the mark in its tile: a list's card and a run's card are marked as their rows are.
const AT_CARD_ICONS = { reply: "chat", steer: "chat", whisper: "phone", invite: "users", policy: "shield", settings: "settings", person_mode: "settings", thread_verb: "inbox", broadcast: "wave", playbook: "bolt", lead_search: "search", deal: "users", note: "edit", person_details: "user", list: askKindGlyph("list"), run: askKindGlyph("run") };

// The card's head: the kind's mark in its tile, the title, and the kind's word under it.
const AskCardHead = ({ p, t }) => {
  const KIND = { reply: t.kReply, steer: t.kSteer, thread_verb: t.kInbox, person_mode: t.kPerson, policy: t.kAutonomy, settings: t.kSettings, whisper: t.kWhisper, invite: t.kTeam, broadcast: t.kBroadcast, playbook: t.kPlaybook, lead_search: t.kLeads, deal: t.kDeal, note: t.kNote, person_details: t.kDetails, list: t.kList, run: t.kRun };
  return (
    <div className="ask-card-head">
      <span className="ask-card-mark"><Icon name={AT_CARD_ICONS[p.kind] || "inbox"} size={15} /></span>
      <span className="ask-card-name">
        <span className="ask-card-title">{p.title}</span>
        <span className="ask-card-kind">{KIND[p.kind] || p.kind}</span>
      </span>
    </div>
  );
};

// The change as it will land, on the sunken ground: a reply as the sent bubble it will be, anything else its summary.
// Before the act a reply's warnings stand under it, and while it can go as it is (its window open), its undo's own
// words say what follows; with the window shut only a template can go, and the note says so instead.
const AskCardChange = ({ p, t, idle }) => {
  const pl = p.payload || {};
  const reply = p.kind === "reply";
  const shut = pl.window_open === false;
  return (
    <>
      <div className={`ask-card-change${reply ? " bubble" : ""}`}>
        <p className="ask-card-summary">{p.summary}</p>
      </div>
      {reply && idle && pl.price_warning ? <div className="ask-card-note">{t.priceNote}</div> : null}
      {reply && idle && shut ? <div className="ask-card-note">{t.windowNote}</div> : null}
      {reply && idle && !shut && p.undo ? <p className="ask-card-foot">{p.undo}</p> : null}
    </>
  );
};

// Before the act: Approve (Send on a reply), Edit in the composer on a reply, Open where the answer does not already
// offer the place (`hideOpen`, oneDoor; where it goes is the contract's cardOpenRoute), and Not now apart. The role gate
// the card's spec names (contracts PROPOSAL_GATE) is drawn by the shell's rule (window.gate): a role that may not approve
// the card still sees Approve, hears why at the control, and a press does nothing. The route re-checks.
const AskCardActs = ({ p, t, busy, hideOpen, onApprove, onDismiss, onNav }) => {
  const A = window.__ask;
  const pl = p.payload || {};
  const gateKey = (window.PROPOSAL_GATE || {})[p.kind] || "approve";
  const openRoute = A && A.cardOpenRoute ? A.cardOpenRoute(p) : null;
  return (
    <div className="ask-card-actions">
      <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy} data-testid="ask-card-approve" {...window.gate(gateKey, "approve this card")}>
        {busy ? t.working : p.kind === "reply" ? t.send : t.approve}
      </button>
      {p.kind === "reply" && pl.conversation_id ? <button className="btn btn-ghost btn-sm" onClick={() => { onNav(`inbox/th-${pl.conversation_id}`); if (A) A.editReply(p); }}>{t.editComposer}</button> : null}
      {openRoute && !hideOpen ? <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>{t.openIt}</button> : null}
      <button className="btn btn-ghost btn-sm ask-card-not-now" onClick={onDismiss} disabled={busy}>{t.notNow}</button>
    </div>
  );
};

// The take-back clock: a hairline ring emptying over a send's own window, drawn where the window stands (a card drawn
// again mid-window starts part-empty) and running for what is left of it. Its end is the window's: `onDone` is the
// animation's own end, which comes at the same moment under reduced motion, where the ring holds still (ask.css).
const AT_RING = 40.84; // the ring's length, 2π × 6.5 (ask.css .ask-ring-arc)
const AskRing = ({ from, until, onDone }) => {
  const [at] = useAtState(() => Date.now());
  const gone = Math.min(1, Math.max(0, (at - from) / Math.max(1, until - from)));
  return (
    <svg className="ask-card-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" data-testid="ask-card-ring">
      <circle className="ask-ring-track" cx="8" cy="8" r="6.5" />
      <circle className="ask-ring-arc" cx="8" cy="8" r="6.5" transform="rotate(-90 8 8)" style={{ strokeDashoffset: AT_RING * gone, animationDuration: `${Math.round(Math.max(1, until - at))}ms` }} onAnimationEnd={onDone} />
    </svg>
  );
};

// After the act, one line on the sunken ground: what happened, and the undo the verb has while it is still true (`open`,
// contracts askUndoOpen). A send that can still be taken back leads with its clock and says Undo, its own words the
// button's title; the ring's end takes the Undo with it. Undoing a new playbook deletes it, so that undo asks first.
const AskCardReceipt = ({ p, t, state, receipt, err, open, undoData, doneAt, busy, onUndo, onRetry }) => {
  const [armed, setArmed] = useAtState(false);
  const [ended, setEnded] = useAtState(false);
  const until = open && undoData && typeof undoData.cancelable_until === "string" ? Date.parse(undoData.cancelable_until) : 0;
  const clock = until > 0 && !ended;
  const can = open && !ended;
  const undoArmed = async () => { await onUndo(); setArmed(false); };
  return (
    <div className="ask-card-receipt">
      {clock ? <AskRing from={doneAt} until={until} onDone={() => setEnded(true)} /> : <Icon name={state === "done" ? "check" : state === "failed" ? "alert" : "x"} size={11} className={state === "done" ? "ok" : ""} />}
      <span className="ask-card-said">{state === "failed" ? err || receipt : state === "dismissed" ? t.notNow : receipt}</span>
      {can && !armed ? <button className="btn btn-ghost btn-sm ask-card-undo" onClick={p.kind === "playbook" ? () => setArmed(true) : onUndo} disabled={busy} title={clock ? p.undo : undefined}>{clock ? t.undo : p.undo}</button> : null}
      {can && armed ? <window.Confirm question={`${p.undo}?`} detail="The playbook and its schedule go; runs already sent keep their numbers in Broadcasts." yes="Yes, delete it" danger busy={busy} onYes={undoArmed} onNo={() => setArmed(false)} testid="ask-card-undo" /> : null}
      {state === "failed" ? <button className="btn btn-ghost btn-sm ask-card-undo" onClick={onRetry}>{t.tryAgain}</button> : null}
    </div>
  );
};

/** Whether a card's undo is still true (contracts askUndoOpen): a reply until its cancel window closes, settings while nobody has saved since, anything else for ten minutes. */
const atUndoOpen = (A, p, state, undoData, doneAt) => {
  const version = window.__SETTINGS && typeof window.__SETTINGS.version === "number" ? window.__SETTINGS.version : null;
  return state === "done" && !!undoData && !!p.undo && !!(A && A.undoOpen && A.undoOpen(p.kind, undoData, doneAt, Date.now(), version));
};

// A proposal the assistant made, as a card: its head, the change, Approve (or Edit in the composer), Open and Not now,
// and after the act its line with the undo the verb has. The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread reads back with "Sent" rather than a fresh
// Approve. The Line draws a card again whenever its answer comes back under the line or opens in a fold, so what
// happened is also written into the conversation it holds (`onOutcome`): a card drawn again from a stale outcome
// offered Send a second time. A lead search's "Change what I asked" is the Line's (`onEdit`: the question back in the
// field, spec F4); the reply editor is for replies.
const AskCard = ({ p, messageId, t, onNav, hideOpen = false, onOutcome, onEdit }) => {
  const A = window.__ask;
  const [state, setState] = useAtState(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useAtState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useAtState(p.outcome ? p.outcome.undo || null : null);
  // When the act happened: an undo is offered only while it is still true (contracts askUndoOpen).
  const [doneAt, setDoneAt] = useAtState(p.outcome ? p.outcome.atMs || 0 : 0);
  const [busy, setBusy] = useAtState(false);
  const [err, setErr] = useAtState("");
  // A lead_search card IS the finder's plan card (Task 9): its words are the
  // same pickers, so a plan changed here and a plan changed on Leads cannot say
  // different things. The edited plan and the open picker are this turn's.
  const [edited, setEdited] = useAtState(null);
  const [pick, setPick] = useAtState(null);
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
      // A search approved is opened (spec F4), and a search answered likewise (G4): the receipt's "Leads shows it" is
      // kept true by going where the contract says the card opens.
      if (p.kind === "lead_search" && onNav && A && A.cardOpenRoute) {
        const to = A.cardOpenRoute({ ...p, outcome: { state: "done", receipt: r.receipt, atMs: at, undo: r.undo } });
        if (to) onNav(to);
      }
    } else {
      setState("failed"); setErr(r.message);
      record({ state: "failed", receipt: r.message, atMs: Date.now(), undo: null });
    }
  };
  const dismiss = () => { setState("dismissed"); record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null }); };
  const undo = async () => {
    if (busy || !A) return;
    setBusy(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData });
    setBusy(false);
    if (r.ok) { setState("undone"); setReceipt(r.receipt); setUndoData(null); record({ state: "undone", receipt: r.receipt, atMs: Date.now(), undo: null }); }
    else setErr(r.message);
  };
  const idle = state === "idle";
  const plan = p.kind === "lead_search" && idle && pl.plan && window.LeadPlanCard;
  return (
    <div className={`ask-card ${state}`} data-testid="ask-card" data-kind={p.kind}>
      <AskCardHead p={p} t={t} />
      {plan
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
          onBack: () => { if (onEdit) onEdit(p); },
        })
        : <AskCardChange p={p} t={t} idle={idle} />}
      {idle ? (
        <AskCardActs p={p} t={t} busy={busy} hideOpen={hideOpen} onApprove={() => approveWith(p)} onDismiss={dismiss} onNav={onNav} />
      ) : (
        <AskCardReceipt p={p} t={t} state={state} receipt={receipt} err={err} open={atUndoOpen(A, p, state, undoData, doneAt)} undoData={undoData} doneAt={doneAt} busy={busy} onUndo={undo} onRetry={() => { setState("idle"); setErr(""); }} />
      )}
      {err && state === "done" ? <div className="ask-card-note">{err}</div> : null}
    </div>
  );
};

// A figure as a tile: the value, what it counts, how it moved; where it comes from is inside the tile, shown on hover
// (ask.css) or opened by a press on the value, with a door only where oneDoor left it one (spec S4).
const AskFigure = ({ f, open, onToggle, t, onNav }) => (
  <div className={`ask-tile${open ? " open" : ""}`} data-testid="ask-tile">
    {f.source ? (
      <button type="button" className="ask-tile-value" aria-expanded={open} onClick={onToggle} data-testid="ask-figure">{f.value}</button>
    ) : (
      <span className="ask-tile-value plain">{f.value}</span>
    )}
    <span className="ask-tile-label">{f.label}</span>
    {f.note ? <span className="ask-tile-note">{f.note}</span> : null}
    {f.source ? (
      <span className="ask-tile-from" data-open={open ? "true" : "false"} data-testid="ask-tile-from">
        {t.from} {f.source.label}
        {f.source.door ? (
          <button type="button" className="ask-tile-door" onClick={() => onNav(f.source.to)} aria-label={t.open} title={t.open} data-testid="ask-tile-door"><Icon name="arrow-right" size={11} /></button>
        ) : null}
      </span>
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
// names), Do (the cards, then one row: Try again, Open as the kit's button, the next questions as chips). `walk`: this
// is the answer the keys walk, whose moves carry the ids the line points at (answerMoves' order) and `sel` is the one
// they stand on; a folded answer has none. `next`: whether the next questions are drawn in the answer: a phone's thread
// draws the newest answer's over its field (AskNextRow) and an earlier answer's nowhere (the spec
// 2026-09-27-ask-chat-on-a-phone, D6).
const AskAnswer = ({ answer, cardOpen, cards, messageId, retry, walk = false, sel = -1, next = true, t, onNav, onFollow, onOutcome, onEdit }) => {
  const [receipt, setReceipt] = useAtState(-1);
  const a = answer;
  const nexts = next ? a.do.next : [];
  const hasShow = a.show.figures.length > 0 || a.show.items.length > 0 || !!a.show.breakdown;
  const hasDo = !!a.do.open || nexts.length > 0 || (cards && cards.length > 0) || !!retry;
  // Each move's place in answerMoves' order: the items that are doors, then Open, then the next questions.
  let doors = 0;
  const itemMove = a.show.items.map((it) => (it.source.door !== false ? doors++ : -1));
  const openAt = doors;
  const nextAt = openAt + (a.do.open ? 1 : 0);
  // A row's kind as the mark before it (askKindGlyph); a row that is a door ends in a chevron.
  const itemBody = (it) => (
    <>
      <span className="ask-item-mark" data-testid="ask-item-mark"><Icon name={askKindGlyph(it.source.kind)} size={12} /></span>
      <span className="ask-item-body">
        <span className="ask-item-top">
          <span className="ask-item-title">{it.title}</span>
          {it.meta ? <span className="ask-item-meta">{it.meta}</span> : null}
        </span>
        {it.line ? <span className="ask-item-line">{it.line}</span> : null}
      </span>
      {it.source.door !== false ? <Icon name="chevron" size={12} className="ask-item-chev" /> : null}
    </>
  );
  const moveProps = (me, cls) =>
    walk ? { id: `ask-move-${me}`, className: `${cls}${sel === me ? " sel" : ""}` } : { className: cls };
  return (
    <div className="ask-answer" data-testid="ask-answer">
      <div className="ask-part say" data-testid="ask-say">
        <span className="ask-mark m1" aria-hidden="true" data-testid="ask-mark" />
        <div className="ask-say">
          {a.say.headline ? <p className="ask-headline">{a.say.headline}</p> : null}
          {a.say.detail ? <p className={a.say.headline ? "ask-detail" : "ask-prose"}>{a.say.detail}</p> : null}
        </div>
      </div>
      {hasShow ? (
        <div className="ask-part show" data-testid="ask-show">
          <span className="ask-mark m2" aria-hidden="true" data-testid="ask-mark" />
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
                {a.show.items.map((it, k) =>
                  itemMove[k] >= 0 ? (
                    <button key={k} type="button" {...moveProps(itemMove[k], "ask-item")} onClick={() => onNav(it.source.to)} data-testid="ask-item">
                      {itemBody(it)}
                    </button>
                  ) : (
                    <div key={k} className="ask-item plain" data-testid="ask-item">
                      {itemBody(it)}
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {hasDo ? (
        <div className="ask-part do" data-testid="ask-do">
          <span className="ask-mark m3" aria-hidden="true" data-testid="ask-mark" />
          <div className="ask-do">
            {(cards || []).map((p) => (
              <AskCard key={p.id} p={p} messageId={messageId} t={t} onNav={onNav} onOutcome={onOutcome} onEdit={onEdit} hideOpen={!!cardOpen && cardOpen[p.id] === false} />
            ))}
            {retry || a.do.open || nexts.length ? (
              <div className="ask-do-row">
                {retry ? <button type="button" className="btn ask-retry" onClick={retry} data-testid="ask-retry">{t.tryAgain}</button> : null}
                {a.do.open ? (
                  <button type="button" {...moveProps(openAt, "btn ask-open")} onClick={() => onNav(a.do.open.to)} data-testid="ask-open">
                    <Icon name="arrow-right" size={14} />{a.do.open.label}
                  </button>
                ) : null}
                {/* A long question ends in an ellipsis inside its chip. */}
                {nexts.map((q, k) => (
                  <button key={q} type="button" {...moveProps(nextAt + k, "ask-chip next")} onClick={() => onFollow(q)} data-testid="ask-next"><span>{q}</span></button>
                ))}
              </div>
            ) : null}
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
const AskTurn = ({ m, q, quick, say, latest = false, streaming = false, walk = false, sel = -1, next = true, t, lang, onFollow, onNav, onRetry, onOutcome, onEdit }) => {
  const A = window.__ask;
  if (streaming) {
    const cursor = <span className="ask-cursor" />;
    return (
      <div className="ask-turn streaming" data-testid="ask-turn">
        {q ? <p className="ask-turn-q">{q}</p> : null}
        <div className="ask-part say" data-testid="ask-say">
          <span className="ask-mark m1" aria-hidden="true" data-testid="ask-mark" />
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
        next={next}
        t={t}
        onNav={onNav}
        onFollow={onFollow}
        onOutcome={onOutcome}
        onEdit={onEdit}
      />
      {m && m.ungrounded ? <div className="ask-unverified"><Icon name="alert" size={11} /> {t.unverified}</div> : null}
    </div>
  );
};

// ---- A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md) ----------------------------

// A question in a phone's thread (D2): the person's own words at the right, in the Inbox's sent bubble. The newest
// carries the id the thread stands at its top (D5, AskHooks.useAskPin).
const AskQuestion = ({ text, now = false }) => (
  <p className="ask-q" id={now ? "ask-now-q" : undefined} data-testid="ask-q">{text}</p>
);

// A phone's earlier turns, each in full (D1): its question, then its answer with its cards as they were left and its
// Open, and no next questions (D6: they are the newest answer's). What a card became is kept on the conversation
// (`onOutcome`), so a card drawn again here never offers Send twice.
const AskThread = ({ turns, t, lang, onNav, onFollow, onOutcome, onEdit }) => (
  <div className="ask-thread" data-testid="ask-thread">
    {turns.map((tn, k) => (
      <div key={tn.q.id || k} className="ask-thread-turn">
        <AskQuestion text={tn.q.text} />
        <AskTurn m={tn.a} next={false} t={t} lang={lang} onNav={onNav} onFollow={onFollow} onOutcome={onOutcome} onEdit={() => onEdit(tn.q.text)} />
      </div>
    ))}
  </div>
);

// The newest answer's next questions over a phone's field (D6): one row that scrolls sideways, so a long question is
// never cut to an ellipsis. Each keeps the id the keys walk (answerMoves' order), as it had inside the answer.
const AskNextRow = ({ answer, sel = -1, onFollow }) => {
  const first = answerMoves(answer).findIndex((mv) => mv.type === "next");
  if (first < 0) return null;
  return (
    <div className="ask-next-row" data-testid="ask-next-row">
      {answer.do.next.map((q, k) => (
        <button key={q} type="button" id={`ask-move-${first + k}`} className={`ask-chip next${sel === first + k ? " sel" : ""}`} onClick={() => onFollow(q)} data-testid="ask-next"><span>{q}</span></button>
      ))}
    </div>
  );
};

// The three come forward to listen (D4): over a phone's field while it is in use in a conversation, or while a held
// mic listens, with the words heard. The thread's own face is hidden meanwhile (ask.css `.ask-line-body.dim`): one
// character on the screen.
const AskListen = ({ AskFace, heard }) => (
  <div className="ask-listen" data-testid="ask-listen">
    <span className="ask-listen-stage">{AskFace ? <AskFace className="ask-hero-canvas" testId="ask-listen-face" /> : null}</span>
    {heard ? <p className="ask-heard" aria-live="polite">{heard}</p> : null}
  </div>
);

// Latest (D7): scrolled up past the newest question, a pill over the field with the three's still mark (a second live
// canvas would be a second character) stands the newest question at the top again.
const AskLatest = ({ t, overNext, onPress }) => (
  <button type="button" className="ask-latest" data-over-next={overNext ? "1" : "0"} onClick={onPress} data-testid="ask-latest">
    <Icon name="three" size={13} />
    {t.latest}
  </button>
);

// What Ask has read, under the three while it reads (D12): the turn's last reads (the Line keeps three, live.traces),
// a read again said once where it was last, the earlier dim after a small square, the newest live after the reading
// dot; "Thinking…" before the first.
const AskReads = ({ traces, t }) => {
  const reads = traces.filter((r, k) => traces.lastIndexOf(r) === k);
  const shown = reads.length ? reads : [t.thinking];
  return (
    <div className="ask-reading" aria-live="polite" data-testid="ask-reading">
      {shown.map((r, k) => {
        const now = k === shown.length - 1;
        return (
          <p key={r} className={`ask-read ${now ? "now" : "done"}`}>
            <span className={now ? "ask-reading-dot" : "ask-read-tile"} aria-hidden="true" />
            {r}
          </p>
        );
      })}
    </div>
  );
};

// An answer's two acts (D14): Copy its words and Read them aloud. A desktop draws them at the field's end beside Clear;
// a phone under the newest answer, never under an earlier one and never while one is written. `words` are the
// answer's plain words (contracts answerText); `speech` is the Line's (AskHooks.useAskSpeech).
const AskActs = ({ words, lang, speech, flash, t }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      flash({ msg: <>{t.copied}</> });
    } catch {
      flash({ tone: "danger", msg: <>{t.copyFailed}</> });
    }
  };
  const reading = speech.speakingId === "line";
  return (
    <span className="ask-acts" data-testid="ask-acts">
      <button type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="content" size={14} />
      </button>
      {speech.canSpeak ? (
        <button
          type="button"
          className={`ask-line-btn quiet${reading ? " on" : ""}`}
          onClick={() => { if (!speech.toggle("line", words, lang)) flash({ msg: <>{t.noSpeech}</> }); }}
          aria-label={reading ? t.stop : t.read}
          aria-pressed={reading}
          title={reading ? t.stop : t.read}
          data-testid="ask-read"
        >
          <Icon name={reading ? "pause" : "headphones"} size={14} />
        </button>
      ) : null}
    </span>
  );
};

// A desktop's conversation, folded above the band (the Line's spec, 6.4): a row per earlier answer, one opened at a
// time, the rest behind "+N earlier" past three. A phone draws AskThread instead (D1). Moved here unchanged from
// ask-real.jsx's arFolds.
const AskFolds = ({ folded, shown, unfolded, setUnfolded, setFoldAll, t, A, lang, onNav, onFollow, onOutcome, onEdit }) => (
  <div className="ask-folds" data-testid="ask-folds">
    {folded.length > shown.length ? (
      <button type="button" className="ask-fold-more" onClick={() => setFoldAll(true)}>{t.earlierFolded(folded.length - shown.length)}</button>
    ) : null}
    {shown.map((tn) => {
      const k = folded.indexOf(tn);
      const isOpen = unfolded === k;
      return (
        <div key={tn.q.id || k} className={`ask-fold${isOpen ? " open" : ""}`}>
          <button type="button" className="ask-fold-row" aria-expanded={isOpen} onClick={() => setUnfolded(isOpen ? -1 : k)} data-testid="ask-fold">
            <span className="ask-mark m1" aria-hidden="true" />
            <span className="ask-fold-q">{tn.q.text}</span>
            <span className="ask-fold-a">{A.answerText(A.answer(tn.a).answer)}</span>
            <Icon name="chevron" size={12} className="ask-fold-chev" />
          </button>
          {isOpen ? <AskTurn m={tn.a} t={t} lang={lang} onNav={onNav} onFollow={onFollow} onOutcome={onOutcome} onEdit={() => onEdit(tn.q.text)} /> : null}
        </div>
      );
    })}
  </div>
);

window.AskAnswerKit = { AskTurn, AskAnswer, AskCard, answerMoves, askKindGlyph, AskQuestion, AskThread, AskNextRow, AskListen, AskLatest, AskFolds, AskReads, AskActs };
Object.assign(window, { AskTurn, AskCard });
