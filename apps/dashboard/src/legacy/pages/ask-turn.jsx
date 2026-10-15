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
  ad: "arrow-right",
  template: "content",
  mailbox: "mail",
  visit: "calendar",
  review: "star",
};
/** A kind's mark, for a row in an answer and for the scope the Line carries; a kind it does not know is a chat. */
const askKindGlyph = (kind) => AT_KIND_GLYPHS[kind] || "chat";

/** An answer no client can shape (the mockup, a test): its words, as prose. */
const atProse = (m, lang) => ({
  v: 2,
  form: "prose",
  say: { headline: "", detail: (m && m.text) || "" },
  show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
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
const AT_CARD_ICONS = { reply: "chat", steer: "chat", whisper: "phone", call_hand_over: "phone", invite: "users", policy: "shield", settings: "settings", person_mode: "settings", person_mode_many: "settings", thread_verb: "inbox", broadcast: "wave", playbook: "bolt", playbook_channels: "bolt", playbook_change: "bolt", sequence_make: "bolt", sequence_step: "bolt", sequence_step_remove: "bolt", sequence_words: "bolt", sequence_start: "bolt", sequence_leave: "bolt", sequence_send_decide: "wave", sequence_send_said: "wave", booking_request: "calendar", sequence_draft: "bolt", sequence_discard: "bolt", lead_search: "search", people_search: "search", lead_search_more: "search", lead_stage: "search", lead_mark: "search", lead_later: "search", leads_bulk: "search", leads_check: "search", lead_addressee: "search", lead_list: "search", reach_out_said: "search", reach_out_add: "wave", reach_out_make: "wave", deal: "users", note: "edit", note_many: "edit", follow_up: "edit", person_details: "user", person_add: "user", person_merge: "users", person_message: "chat", answer: "shield", answer_many: "shield", review_reply: "chat", list: askKindGlyph("list"), list_member: askKindGlyph("list"), list_change: askKindGlyph("list"), list_delete: askKindGlyph("list"), run: askKindGlyph("run"), message: askKindGlyph("template") };

// The card's head: the kind's mark in its tile, the title, and the kind's word under it.
const AskCardHead = ({ p, t }) => {
  const KIND = { reply: t.kReply, steer: t.kSteer, thread_verb: t.kInbox, person_mode: t.kPerson, person_mode_many: t.kPerson, policy: t.kAutonomy, settings: t.kSettings, whisper: t.kWhisper, call_hand_over: t.kCall, invite: t.kTeam, broadcast: t.kBroadcast, playbook: t.kPlaybook, playbook_channels: t.kPlaybook, playbook_change: t.kPlaybook, sequence_make: t.kSequence, sequence_step: t.kSequence, sequence_step_remove: t.kSequence, sequence_words: t.kSequence, sequence_start: t.kSequence, sequence_leave: t.kSequence, sequence_send_decide: t.kColdEmail, sequence_send_said: t.kColdEmail, booking_request: t.kBooking, sequence_draft: t.kSequence, sequence_discard: t.kSequence, lead_search: t.kLeads, people_search: t.kLeads, lead_search_more: t.kLeads, lead_stage: t.kLeads, lead_mark: t.kLeads, lead_later: t.kLeads, leads_bulk: t.kLeads, leads_check: t.kLeads, lead_addressee: t.kLeads, lead_list: t.kLeads, reach_out_said: t.kLeads, reach_out_add: t.kColdEmail, reach_out_make: t.kColdEmail, deal: t.kDeal, note: t.kNote, note_many: t.kNote, follow_up: t.kFollowUp, person_details: t.kDetails, person_add: t.kPeople, person_merge: t.kPeople, person_message: t.kMessage, answer: t.kAnswer, answer_many: t.kAnswer, review_reply: t.kReview, list: t.kList, list_member: t.kList, list_change: t.kList, list_delete: t.kList, run: t.kRun, message: t.kMessage };
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
// A message the card writes is drawn whole, each version under its channel's word as the person reached on it reads
// it, and when each goes and who it reaches under them (its summary, which quotes them, is the model's).
const AskCardChange = ({ p, t, idle }) => {
  const pl = p.payload || {};
  const reply = p.kind === "reply";
  const shut = pl.window_open === false;
  const written = p.kind === "message" && Array.isArray(pl.said) ? pl.said : null;
  return (
    <>
      <div className={`ask-card-change${reply ? " bubble" : ""}`}>
        {written ? <div className="ask-card-said" data-testid="ask-card-versions">{written.map((v) => <p key={v.channel} className="ask-card-summary"><span className="ask-card-kind">{v.label}</span>{"\n"}{v.words}</p>)}</div> : <p className="ask-card-summary">{p.summary}</p>}
      </div>
      {written && pl.follows ? <p className="ask-card-foot">{pl.follows}</p> : null}
      {reply && idle && pl.price_warning ? <div className="ask-card-note">{t.priceNote}</div> : null}
      {reply && idle && shut ? <div className="ask-card-note">{t.windowNote}</div> : null}
      {reply && idle && !shut && p.undo ? <p className="ask-card-foot">{p.undo}</p> : null}
    </>
  );
};

// Before the act: Approve (Send on a reply), Edit in the composer on a reply, Open where the answer does not already
// offer the place (`hideOpen`, oneDoor; where it goes is the contract's cardOpenRoute), and Not now apart. The role gate
// the card's spec names (contracts PROPOSAL_GATE) is drawn by the shell's rule (window.gate): a role that may not approve
// the card still sees Approve, hears why at the control, and a press does nothing. The route re-checks. A plan's send
// that waits for a step not made yet says so in the kit's state pill in Approve's place (`waits`, contracts planGroupOf).
const AskCardActs = ({ p, t, busy, waits, hideOpen, onApprove, onDismiss, onNav }) => {
  const A = window.__ask;
  const pl = p.payload || {};
  const gateKey = (window.PROPOSAL_GATE || {})[p.kind] || "approve";
  const openRoute = A && A.cardOpenRoute ? A.cardOpenRoute(p) : null;
  return (
    <div className="ask-card-actions">
      {waits ? <span className="pill" data-testid="ask-card-waits">{waits}</span> : null}
      {waits ? null : <button className="btn btn-primary btn-sm" onClick={onApprove} disabled={busy} data-testid="ask-card-approve" {...window.gate(gateKey, "approve this card")}>
        {busy ? t.working : p.kind === "reply" ? t.send : t.approve}
      </button>}
      {p.kind === "reply" && pl.conversation_id ? <button className="btn btn-ghost btn-sm" onClick={() => { onNav(`inbox/th-${pl.conversation_id}`); if (A) A.editReply(p); }}>{t.editComposer}</button> : null}
      {openRoute && !hideOpen ? <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>{/^campaigns\/new:/.test(openRoute) ? t.openComposer : t.openIt}</button> : null}
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
      {can && armed ? <window.Confirm question={`${p.undo}?`} detail={t.undoCampaignDetail} yes={t.undoCampaignYes} danger busy={busy} onYes={undoArmed} onNo={() => setArmed(false)} testid="ask-card-undo" /> : null}
      {state === "failed" ? <button className="btn btn-ghost btn-sm ask-card-undo" onClick={onRetry}>{t.tryAgain}</button> : null}
    </div>
  );
};

// What became of a card, as an Approve records it: done with its receipt, its undo and what it made (a plan's later
// steps name it, contracts planMadeOf), or failed with the refusal's words. A card's own press and a plan's press
// (AskPlan) record it the one way, so a reload reads back what either made.
const atDone = (r, at) => ({ state: "done", receipt: r.receipt, atMs: at, undo: r.undo || null, made: r.made || null });
const atFailed = (message, at) => ({ state: "failed", receipt: message, atMs: at, undo: null });
// Kept where the Line draws the card again (`onOutcome`) and on the turn (the outcome route); the route's answer is
// handed back, so a press of several cards records them one after another and never two over one turn at once.
const atRecord = (A, messageId, onOutcome, pid, o) => {
  if (onOutcome && messageId) onOutcome(messageId, pid, o);
  return A && messageId && /^[0-9a-f-]{36}$/.test(messageId) ? A.outcome(messageId, pid, o) : Promise.resolve(false);
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
// field, spec F4); the reply editor is for replies. A plan's step is drawn by its group (AskPlan), which hands it `step`:
// what it waits for and the line said before its press (contracts planGroupOf), the turn's cards as they stand (its
// press is judged by what they became, AskApi.commit), whether the group's press holds it, what that press recorded for
// it (`ran`), and where it tells the group what became of it and that it is busy. A card of no plan is a step of nothing.
const AT_NO_STEP = { waits: null, note: null, cards: undefined, held: false, ran: null, saw: () => {}, onBusy: () => {} };
const AskCard = ({ p, messageId, t, onNav, hideOpen = false, onOutcome, onEdit, step = AT_NO_STEP }) => {
  const A = window.__ask;
  const [state, setState] = useAtState(p.outcome ? p.outcome.state : "idle");
  const [receipt, setReceipt] = useAtState(p.outcome ? p.outcome.receipt : "");
  const [undoData, setUndoData] = useAtState(p.outcome ? p.outcome.undo || null : null);
  // When the act happened: an undo is offered only while it is still true (contracts askUndoOpen).
  const [doneAt, setDoneAt] = useAtState(p.outcome ? p.outcome.atMs || 0 : 0);
  const [busy, setBusy] = useAtState(false);
  const [err, setErr] = useAtState("");
  // A step the group's press decided is drawn from the outcome that press recorded, once, as a reload would draw it.
  const [took, setTook] = useAtState(null);
  const ran = step.ran;
  if (ran && ran !== took) { setTook(ran); setState(ran.state); setReceipt(ran.receipt); setUndoData(ran.undo || null); setDoneAt(ran.atMs || 0); setErr(ran.state === "failed" ? ran.receipt : ""); }
  const held = busy || step.held;
  const working = (b) => { setBusy(b); step.onBusy(b); };
  // A lead_search card IS the finder's plan card (Task 9): its words are the
  // same pickers, so a plan changed here and a plan changed on Leads cannot say
  // different things. The edited plan and the open picker are this turn's.
  const [edited, setEdited] = useAtState(null);
  const [pick, setPick] = useAtState(null);
  const pl = p.payload || {};
  const record = (o) => {
    step.saw(p.id, o);
    atRecord(A, messageId, onOutcome, p.id, o);
  };
  const approveWith = async (proposal) => {
    if (held || !A) return;
    working(true); setErr("");
    const r = await A.commit(proposal, step.cards);
    working(false);
    if (r.ok) {
      const at = Date.now();
      setState("done"); setReceipt(r.receipt); setUndoData(r.undo || null); setDoneAt(at);
      record(atDone(r, at));
      // A search approved is opened (spec F4), and a search answered likewise (G4): the receipt's "Leads shows it" is
      // kept true by going where the contract says the card opens.
      if (p.kind === "lead_search" && onNav && A && A.cardOpenRoute) {
        const to = A.cardOpenRoute({ ...p, outcome: { state: "done", receipt: r.receipt, atMs: at, undo: r.undo } });
        if (to) onNav(to);
      }
    } else {
      setState("failed"); setErr(r.message);
      record(atFailed(r.message, Date.now()));
    }
  };
  const dismiss = () => { setState("dismissed"); record({ state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null }); };
  const undo = async () => {
    if (held || !A) return;
    working(true);
    const r = await A.undo(p, { state: "done", receipt, atMs: doneAt, undo: undoData });
    working(false);
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
      {idle && step.note ? <p className="ask-card-foot" data-testid="ask-step-note">{step.note}</p> : null}
      {idle ? (
        <AskCardActs p={p} t={t} busy={held} waits={step.waits} hideOpen={hideOpen} onApprove={() => approveWith(p)} onDismiss={dismiss} onNav={onNav} />
      ) : (
        <AskCardReceipt p={p} t={t} state={state} receipt={receipt} err={err} open={atUndoOpen(A, p, state, undoData, doneAt)} undoData={undoData} doneAt={doneAt} busy={held} onUndo={undo} onRetry={() => { setState("idle"); setErr(""); }} />
      )}
      {err && state === "done" ? <div className="ask-card-note">{err}</div> : null}
    </div>
  );
};

// A plan's step's own words in the Line's language (ask-text.jsx; contracts planGroupOf hands their numbers): its head,
// what it waits for in its Approve's place, and the line before its press: why it never goes (the refusal's own words,
// as every refusal is said) or WhatsApp's review of the message a step writes.
const atStepWords = (t, s) => ({
  head: t.stepOf(s.step, s.of),
  waits: !s.wait ? null : "undone" in s.wait ? t.stepUndone(s.wait.undone) : t.waitingFor(s.wait.waits),
  note: s.note || (s.review === null ? null : t.afterReview(s.review)),
});

// A plan of Ask's (the marketing manager's spec §5.4, §5.8): its cards one group in step order, each under its head
// ("Step 1 of 6"), with one press above them for the steps that send nothing (commit.ts commitPlan, through
// window.__ask.commitPlan) and each send its own press once the steps it waits for are made. What the group is and what
// each card waits for are contracts' (planGroupOf), read again on every draw from the cards as they stand: their
// outcomes as the turn holds them, over what this group saw become of them since (`seen`); its words are the Line's own,
// in its language (`t`, atStepWords). The press is held while any
// of its cards is busy, records each step's outcome as that card's own press would (atDone, atFailed), one after another,
// holding every card of the plan until the last is kept, and hands each card it decided that outcome to draw (`ran`); a
// stop is the step it stopped at, failed in commitPlan's
// own words (PROPOSAL_WORDS.planStopped, never wrapped again), and the rest stay pressable one by one.
const AskPlan = ({ cards, messageId, t, onNav, onOutcome, onEdit, cardOpen }) => {
  const A = window.__ask;
  const [seen, setSeen] = useAtState({});
  const [ran, setRan] = useAtState({});
  const [busy, setBusy] = useAtState(false);
  const [working, setWorking] = useAtState({});
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  const g = A.planGroupOf(now);
  const held = busy || Object.values(working).some(Boolean);
  const saw = (pid, o) => setSeen((prev) => ({ ...prev, [pid]: o }));
  // Every card of the plan is held from the press until the last outcome is recorded: the store writes a turn whole, so
  // a send or an Undo pressed while the group's outcomes are on their way would record over one of them.
  const press = async () => {
    if (held || !A.commitPlan) return;
    setBusy(true);
    try {
      const run = await A.commitPlan(now);
      const at = Date.now();
      const got = {};
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p) got[p.id] = result.ok ? atDone(result, at) : atFailed(result.message, at);
      }
      setSeen((prev) => ({ ...prev, ...got }));
      setRan((prev) => ({ ...prev, ...got }));
      for (const pid of Object.keys(got)) await atRecord(A, messageId, onOutcome, pid, got[pid]);
    } finally {
      setBusy(false);
    }
  };
  // The press is gated as the steps it approves are: the first whose gate the member's role is refused, else Approve's.
  const gates = window.PROPOSAL_GATE || {};
  const gateKey = g.steps.map((s) => (s.card.plan.silent ? gates[s.card.kind] || "approve" : null)).find((k) => k && !window.canDo(k)) || "approve";
  return (
    <div className="ask-steps" data-testid="ask-plan">
      {g.left > 0 ? (
        <div className="ask-steps-press">
          <button type="button" className="btn btn-primary btn-sm" onClick={press} disabled={held} data-testid="ask-plan-approve" {...window.gate(gateKey, "approve these steps")}>{busy ? t.working : t.approveSilent(g.left)}</button>
        </div>
      ) : null}
      {g.steps.map((s) => { const w = atStepWords(t, s); return (
        <div key={s.card.id} className="ask-step" data-testid="ask-step">
          <div className="ask-step-n"><span className="rec-hint">{w.head}</span></div>
          <AskCard
            p={s.card}
            messageId={messageId}
            t={t}
            onNav={onNav}
            onOutcome={onOutcome}
            onEdit={onEdit}
            hideOpen={!!cardOpen && cardOpen[s.card.id] === false}
            step={{ waits: w.waits, note: w.note, cards: now, held: busy, ran: ran[s.card.id] || null, saw, onBusy: (b) => setWorking((prev) => ({ ...prev, [s.card.id]: b })) }}
          />
        </div>
      ); })}
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

// What they asked to see as a list, and steps to follow (contracts AskList): a real list, numbered for steps, the page's
// own bullet, or one entry to a line with no mark; the entries never carry a mark of their own (normalizeAnswer).
const AskListPart = ({ l }) => {
  const Tag = l.style === "numbers" ? "ol" : "ul";
  return (
    <Tag className={`ask-list ${l.style}`} data-testid="ask-list" data-style={l.style}>
      {l.entries.map((e, k) => <li key={k}>{e}</li>)}
    </Tag>
  );
};

// Show: the list they asked for, the whole in its parts, the figures, the rows it names, each row a move the keys walk
// (`itemMove`, its place in answerMoves' order, or -1 for a row drawn without a door). An answer stored before the list
// part has none. A numbered list of rows is its items, numbered in their marks (the list's style with no entries).
const AskShow = ({ a, itemMove, moveProps, t, onNav }) => {
  const [receipt, setReceipt] = useAtState(-1);
  const list = a.show.list || { style: "bullets", entries: [] };
  const numbered = list.style === "numbers" && !list.entries.length;
  // A row's kind as the mark before it (askKindGlyph), or its place in a numbered list; a row that is a door ends in a chevron.
  const itemBody = (it, k) => (
    <>
      <span className="ask-item-mark" data-testid="ask-item-mark">{numbered ? k + 1 : <Icon name={askKindGlyph(it.source.kind)} size={12} />}</span>
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
  return (
    <div className="ask-part show" data-testid="ask-show">
      <span className="ask-mark m2" aria-hidden="true" data-testid="ask-mark" />
      <div className="ask-show">
        {list.entries.length ? <AskListPart l={list} /> : null}
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
                  {itemBody(it, k)}
                </button>
              ) : (
                <div key={k} className="ask-item plain" data-testid="ask-item">
                  {itemBody(it, k)}
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// The answer: Say (the headline, or a prose answer's words), Show (the list they asked for, the whole in its parts, the
// figures, the rows it names, numbered when they asked for a numbered list of them), Do (the cards, then one row: Try
// again, Open as the kit's button, the next questions as chips). `walk`: this
// is the answer the keys walk, whose moves carry the ids the line points at (answerMoves' order) and `sel` is the one
// they stand on; a folded answer has none. `next`: whether the next questions are drawn in the answer: a phone's thread
// draws the newest answer's over its field (AskNextRow) and an earlier answer's nowhere (the spec
// 2026-09-27-ask-chat-on-a-phone, D6).
const AskAnswer = ({ answer, cardOpen, cards, messageId, retry, walk = false, sel = -1, next = true, t, onNav, onFollow, onOutcome, onEdit }) => {
  const A = window.__ask;
  const a = answer;
  const nexts = next ? a.do.next : [];
  const listed = !!(a.show.list && a.show.list.entries.length);
  const hasShow = a.show.figures.length > 0 || a.show.items.length > 0 || !!a.show.breakdown || listed;
  const hasDo = !!a.do.open || nexts.length > 0 || (cards && cards.length > 0) || !!retry;
  // Each move's place in answerMoves' order: the items that are doors, then Open, then the next questions.
  let doors = 0;
  const itemMove = a.show.items.map((it) => (it.source.door !== false ? doors++ : -1));
  const openAt = doors;
  const nextAt = openAt + (a.do.open ? 1 : 0);
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
      {hasShow ? <AskShow a={a} itemMove={itemMove} moveProps={moveProps} t={t} onNav={onNav} /> : null}
      {hasDo ? (
        <div className="ask-part do" data-testid="ask-do">
          <span className="ask-mark m3" aria-hidden="true" data-testid="ask-mark" />
          <div className="ask-do">
            {/* A plan's cards are one group, where its first card stood (contracts cardsInPlans); every other card on its own. */}
            {(A && A.cardsInPlans ? A.cardsInPlans(cards || []) : (cards || []).map((card) => ({ card }))).map((it) => it.plan ? (
              <AskPlan key={`plan:${it.plan[0].plan.id}`} cards={it.plan} messageId={messageId} t={t} onNav={onNav} onOutcome={onOutcome} onEdit={onEdit} cardOpen={cardOpen} />
            ) : (
              <AskCard key={it.card.id} p={it.card} messageId={messageId} t={t} onNav={onNav} onOutcome={onOutcome} onEdit={onEdit} hideOpen={!!cardOpen && cardOpen[it.card.id] === false} />
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

// Show as it closes while the answer is written (`say.show`, contracts answer-stream.ts answerSoFar), drawn by the
// answer's own part: no row a door and no figure a receipt until the final lands; nothing before a figure or a row has.
const AskShowSoFar = ({ say, t, onNav }) =>
  say && say.show ? (
    <AskShow
      a={{
        show: {
          figures: say.show.figures.map((f) => ({ ...f, source: null })),
          items: say.show.items.map((it) => ({ ...it, source: { ...it.source, door: false } })),
          breakdown: null,
          list: null,
        },
      }}
      itemMove={say.show.items.map(() => -1)}
      moveProps={() => ({})}
      t={t}
      onNav={onNav}
    />
  ) : null;

// A turn: the question over it, then the answer. While it streams, Say as written so far (`say`: the headline, then
// the detail, as the answer draws them) or a v1 turn's words, with a cursor after the last, and Show's figures and rows
// as each closes (`say.show`, grounded on the server: contracts answer-stream.ts), drawn by AskShow but not yet doors;
// Do waits for the final message (spec 7.4), and the Line says the answer once it is whole, not every piece (spec
// 6.10). A failed turn says why and, on the latest only, offers Try again (N20). A quick answer (no model) is drawn the same way, from `quick`.
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
        <AskShowSoFar say={say} t={t} onNav={onNav} />
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
// answer's say, its headline then its detail, then its list a line an entry with its marks (contracts answerText): what
// Copy takes. `spoken` are the same written for the ear, the list an entry a sentence (contracts answerSpoken): what
// Read aloud speaks in Ask's one voice (the one-way speech, legacy-bridge/ask/speech.ts through AskHooks.useAskSpeech;
// docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026); the figures and rows are
// drawn, never read. Nobody speaks back: a follow-up is typed, or said with the mic held. Between the press and the first word
// the button says it is getting the voice, and a press then stops the wait; where the clip could not be made the
// button says why, in the server's words.
const AskActs = ({ words, spoken, speech, flash, t }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      flash({ msg: <>{t.copied}</> });
    } catch {
      flash({ tone: "danger", msg: <>{t.copyFailed}</> });
    }
  };
  const reading = speech.speakingId === "line";
  const loading = speech.loading === "line";
  const read = () => {
    speech.toggle(spoken || words, "answer").then((why) => {
      if (why !== null) flash({ tone: "danger", msg: <>{why || t.readFailed}</> });
    });
  };
  const word = reading ? t.stop : loading ? t.reading : t.read;
  return (
    <span className="ask-acts" data-testid="ask-acts">
      <button type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="content" size={14} />
      </button>
      {speech.canSpeak ? (
        <button
          type="button"
          className={`ask-line-btn quiet${reading || loading ? " on" : ""}`}
          onClick={read}
          aria-label={word}
          aria-pressed={reading}
          aria-busy={loading || undefined}
          title={word}
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

window.AskAnswerKit = { AskTurn, AskAnswer, AskCard, AskPlan, answerMoves, askKindGlyph, AskQuestion, AskThread, AskNextRow, AskListen, AskLatest, AskFolds, AskReads, AskActs };
Object.assign(window, { AskTurn, AskCard });
