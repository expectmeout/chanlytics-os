/* global React, Icon */
// The Leads scope's plan panel: the card for a plan born from the strip and
// the answer row when a search stopped to ask (spec F5), the plan card whose
// words are pickers (Task 9), and the strip that says what a round is doing
// and how it ended (Task 10). A fresh Find is Ask's (spec F1, F2): nothing
// here composes one. Hookless, as every part of People is: all of its state
// lives in LeadsReal (clients-a.jsx), which closes the panel on Esc, and
// arrives here as props.
//
// Nothing here names the vendor that runs a search: the owner sees Claude
// finding businesses, and where each fact came from.

// The words a lead wears live once, in contracts; the bridge hands them over
// as window.__LEAD_VM (legacy-bridge/seed-globals.ts). Read at draw time, never
// at load time: the page's scripts load before the bridge installs anything.
/* --------------------------------------------------------- the first day */

// The words the first day says live once, in contracts, and arrive as
// window.__LEAD_WORDS (legacy-bridge/seed-globals.ts). Read at draw time: the
// page's scripts load before the bridge installs anything.
const ldWords = () => window.__LEAD_WORDS;

// One suggestion: what to search, who it is for, and how reachable that kind is.
const LeadSuggestion = ({ item, onPick, canFind }) => (
  <div className="fr-sug" data-testid={`ld-sug-${item.category_key}`}>
    <button
      type="button"
      className="q"
      onClick={() => onPick(item.words)}
      {...(canFind ? {} : window.gate("find", "find businesses for you"))}
    >
      {item.words}
    </button>
    <span className="w">{item.who_for}</span>
    {item.reach ? <span className="reach">{item.reach}</span> : null}
  </div>
);

// One way people arrive. The status is drawn only when this tab has read the
// fact behind it: a way never says a line is live that nobody looked at.
const LeadWayCard = ({ way, onGo }) => (
  <div className="fr-way" data-testid={`ld-way-${way.id}`}>
    <b>{way.title}</b>
    <span>{way.line}</span>
    {way.status ? (
      <span className="fr-status" data-testid={`ld-way-status-${way.id}`}>
        <Icon name="check" size={12} />
        {way.status}
      </span>
    ) : null}
    {way.doors.map((d) => (
      <button key={d.id} type="button" className="fr-door" onClick={() => onGo(d.to)}>{d.label}</button>
    ))}
  </div>
);

/**
 * The first day of Leads: no search kept yet. People first -- the three ways
 * they arrive, each claiming only what this tab has read -- then Find leads,
 * the door to Ask, and the suggestions Claude wrote from this workspace's own
 * business line, each a door to Ask with its words. Never a seeded example:
 * the items are the server's, and a refused read is a note beside a door
 * that still opens.
 *
 * Hookless, like everything else here: the line being rewritten is
 * LeadsReal's (`leadLine`), handed down.
 */
const LeadsFirstDay = ({
  ways = [], suggestions = null, canFind = false, lineOpen = false, lineDraft = "", lineError = null, lineBusy = false,
  onPick = () => {}, onGo = () => {}, onOpenLine = () => {}, onLineDraft = () => {}, onSaveLine = () => {},
  onCancelLine = () => {}, composer = null,
}) => {
  const items = (suggestions && suggestions.items) || [];
  // The server says why it could not write them (suggestions.note); a read that
  // never landed says so itself, rather than leaving the space blank.
  const note = suggestions ? suggestions.note || null : ldWords().suggestUnavailable;
  return (
    <div className="fr" data-testid="leads-first-day">
      <h1 className="fr-h">{ldWords().firstDay.title}</h1>
      <p className="fr-p">Everyone who calls, messages or books you shows up on this page by themselves, with what they asked and what they booked.</p>
      <div className="fr-ways">
        {ways.map((w) => <LeadWayCard key={w.id} way={w} onGo={onGo} />)}
      </div>
      <div className="fr-sub">{ldWords().firstDay.sub}</div>
      {composer}
      <div>
        <div className="fr-sugs-h">
          {suggestions ? <span data-testid="ld-line">{`For ${suggestions.business_line}`}</span> : <span data-testid="ld-line" />}
          {canFind && suggestions ? (
            <button type="button" className="fr-line-edit" onClick={onOpenLine} data-testid="ld-line-edit">Not right? Change it</button>
          ) : null}
        </div>
        {lineOpen ? (
          <form
            className="fr-line-form"
            data-testid="ld-line-form"
            onSubmit={(e) => { e.preventDefault(); onSaveLine(); }}
          >
            <input
              className="inp"
              type="text"
              value={lineDraft}
              aria-label="What this business does"
              data-testid="ld-line-input"
              onChange={(e) => onLineDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={lineBusy} data-testid="ld-line-save">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelLine}>Cancel</button>
            <window.FieldError id="ld-line-error" message={lineError} testid="ld-line-error" />
          </form>
        ) : null}
        {note ? <p className="fr-sugs-note" data-testid="ld-sugs-note">{note}</p> : null}
        <div className="fr-sugs">
          {items.map((it) => <LeadSuggestion key={it.category_key} item={it} onPick={onPick} canFind={canFind} />)}
        </div>
      </div>
      <div className="fr-foot" data-testid="ld-first-day-foot">
        <Icon name="lock" size={12} />
        <span>{ldWords().firstDay.foot}</span>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- the amend turn */

/**
 * The one turn that amends a search waiting on its question: which search (by id, so the model can name it in
 * `amends`), what it asked, what the owner first asked for, and their answer. The card that comes back carries
 * `amends` and commits through Ask's door as any card (leadFinderApprove); the answer route sets the version and
 * the count, so it is never a new search.
 */
const leadFinderAmendAsk = (a, words) =>
  `On People › Leads, my search for ${a.name} (search id ${a.searchId}) stopped to ask: “${a.question}” ` +
  `I had asked for: “${a.asked}”${a.leavingOut && a.leavingOut.length ? `, leaving out ${a.leavingOut.join(", ")}` : ""}. ` +
  `My answer: ${String(words || "").trim()}. Propose the same search with my answer applied (propose_lead_search with amends set to that id), and keep everything I did not change.`;

/**
 * The answer to a search's question, as one Ask turn on the Leads surface
 * through window.__ask.send (legacy-bridge/ask/api.ts). The SendEvent shapes
 * are that file's: thread, trace, delta, final, error. The panel listens for
 * the trace line while it waits and for the `final` message: a lead_search
 * proposal carrying `amends` is the plan card, taken as it comes (the server
 * already set its version and count, spec G1); one without `amends` would
 * start a new search, so it is refused under the input, as words with no
 * card are. It only ever amends the search the page opened it under (`more`,
 * answer mode): a fresh Find is Ask's own turn (spec F2) and never comes
 * through here. The page hands its setters in, so this is a plain function
 * the tests can run.
 */
const leadAnswerPlan = async (words, set) => {
  const A = window.__ask;
  const answering = set.more && set.more.answer ? set.more : null;
  if (!answering) {
    set.refusal("Nothing to answer here.");
    set.stage("compose");
    return null;
  }
  set.stage("thinking");
  set.refusal(null);
  set.proposal(null);
  set.plan(null);
  set.trace("Reading what you asked");
  if (!A || typeof A.send !== "function") {
    set.stage("compose");
    set.refusal("Claude isn't available here yet — try again in a moment.");
    return null;
  }
  let card = null;
  let said = "";
  await A.send({ text: leadFinderAmendAsk(answering, words), threadId: null, scope: null, surface: "leads" }, (ev) => {
    if (!ev || !ev.t) return;
    if (ev.t === "trace") set.trace(ev.text);
    else if (ev.t === "final") {
      const m = ev.message || {};
      said = m.text || "";
      card = (m.proposals || []).filter((p) => p && p.kind === "lead_search")[0] || null;
    } else if (ev.t === "error") said = ev.text || "";
  });
  if (card && !(card.payload || {}).amends) {
    // The model proposed a search of its own instead of amending this one: committing it would start a second
    // search while the first waited a day and died.
    set.refusal("That would start a new search. Say your answer to the question instead.");
    set.stage("compose");
    return null;
  }
  if (card) {
    set.proposal(card);
    set.plan(card.payload.plan || null);
    set.stage("plan");
    return card;
  }
  set.refusal(said || "Nothing came back — ask again in a moment.");
  set.stage("compose");
  return null;
};

/**
 * Find N leads. An Ask card goes through commitProposal (legacy-bridge
 * ask/commit.ts), which posts the plan to POST lead-searches marked as Ask's,
 * or, when the card carries `amends`, answers the search it amends: an answer
 * that came back from Ask commits as its card. An Include opened on the page
 * (a strip's step on a round still waiting, no card) posts the plan through
 * __leadSearchAnswer and the route versions it; any other plan the panel
 * opened from a strip's next step goes through __leadSearchMore. Either way
 * the route's own sentence on a refusal (402, 409, 429) is said under the
 * button, in its words, and nothing on the page says it started.
 */
const leadFinderApprove = async (proposal, plan, set) => {
  set.stage("starting");
  set.refusal(null);
  let r;
  if (proposal) {
    const A = window.__ask;
    r = A && typeof A.commit === "function"
      ? await A.commit({ ...proposal, payload: { ...(proposal.payload || {}), plan } })
      : { ok: false, message: "Claude isn't available here yet — try again in a moment." };
  } else if (set.more && set.more.answer && window.__leadSearchAnswer) {
    // The plan is sent as the owner saw it; the route sets the version and the count the round reserved (G1). If
    // the round stopped waiting meanwhile the route says so, and that is what is shown (section 7.2).
    r = await window.__leadSearchAnswer(set.more.searchId, "include", plan);
  } else if (set.more && window.__leadSearchMore) {
    r = await window.__leadSearchMore(set.more.searchId, set.more.purpose || "topup", plan);
  } else {
    r = { ok: false, message: "Nothing to start — describe what you want again." };
  }
  if (r && r.ok) {
    set.stage("compose");
    set.open(false);
    set.words("");
    set.proposal(null);
    set.plan(null);
    return r;
  }
  set.refusal((r && (r.message || (r.error && r.error.message))) || "It didn't start. Try again in a moment.");
  set.stage("plan");
  return r;
};

/* --------------------------------------------------------- the pickers -- */

// A picker is a button that opens a listbox of its own. It is not in
// PL_OVERLAY (the plan panel is the page's own overlay), so the page's keys
// stay awake behind it; Esc closes the picker here, before the page's listener.
const LeadPick = ({ id, label, cls, title, open, options, onOpen, onPick }) => (
  <span className="lf-pick">
    <button
      type="button"
      className={`tok ${cls || ""} ${open ? "open" : ""}`}
      data-testid={`plan-${id}`}
      title={title || label}
      aria-haspopup="listbox"
      aria-expanded={!!open}
      onClick={() => onOpen(open ? null : id)}
      onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); onOpen(null); } }}
    >
      {label}
    </button>
    {open ? (
      <span className="lf-pop" role="listbox" aria-label={title || label} data-testid={`plan-${id}-options`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`lf-pop-row ${o.on ? "on" : ""}`}
            role="option"
            aria-selected={!!o.on}
            data-testid={`plan-${id}-${o.id}`}
            onClick={() => { onOpen(null); onPick(o); }}
          >
            <span className="tab">{o.label}</span>
            {o.note ? <span className="r">{o.note}</span> : null}
          </button>
        ))}
        {options.length === 0 ? <span className="lf-pop-note">Change what I asked to change this.</span> : null}
      </span>
    ) : null}
  </span>
);

/* ------------------------------------------------------- the plan card -- */

/**
 * The plan as one sentence whose words are pickers, what it leaves out, how
 * many are likely to have an email, the facts in leads, and the two buttons
 * (sections 8.3, 0.1, 0.2). A picked word re-plans here, on the page, through
 * planVersionOf and planWords: no model call, ever.
 */
const LeadPlanCard = ({ plan, view, facts, busy, refusal, baseVersion = 1, pick = null, onPick = () => {}, onChange, onApprove, onBack, answering = null }) => {
  const C = window.__LEAD_VM || {};
  if (!plan) return null;
  const f = facts || { dupes: 0, leadsLeft: 0, bound: null, prior: null, priorOf: null, cannotSee: null, renewsOn: "", nearby: [] };
  const change = (over) => onChange(C.planVersionOf(plan, over));
  const likely = C.leadPlanLikely(plan, f);
  // An answer spends from the round's own reservation: its count is the one reserved, and the month's clamp is not
  // this round's to apply (nothing new is reserved).
  const ask = answering ? { count: plan.count, label: "Update the search", covers: null } : C.leadPlanAsk(plan, f);
  const cannot = f.cannotSee && plan.criteria.some((c) => c.key === f.cannotSee.key && c.standard === "seen") ? f.cannotSee : null;
  const options = (id) => {
    if (id === "count") {
      const choices = C.LEAD_COUNT_CHOICES || [50, 100, 200, 500];
      const counts = choices.includes(plan.count) ? [...choices] : [...choices, plan.count].sort((a, b) => a - b);
      // A count one area cannot hold says so, rather than quoting a time it will not take: five real searches all
      // ended "few new matches" short of 50, because three terms return the same places.
      return counts.map((n) => ({ id: String(n), label: String(n), note: C.planCeiling && n > C.planCeiling(plan) ? "more than this area likely holds" : `about ${C.planMinutes({ ...plan, count: n })} min`, on: n === plan.count, apply: () => change({ count: n }) }));
    }
    if (id === "area") {
      return [plan.area, ...(f.nearby || [])].map((a) => ({ id: a.label, label: C.planWhere(a), on: a.label === plan.area.label, apply: () => change({ area: a }) }));
    }
    if (id === "contact") {
      return [
        { id: "email", label: "then find their email and check it", on: plan.contact === "email", apply: () => change({ contact: "email" }) },
        { id: "phone", label: "a phone is enough", note: "goes further this month", on: plan.contact === "phone", apply: () => change({ contact: "phone" }) },
      ];
    }
    if (id === "who") return [];
    const c = plan.criteria.filter((x) => x.key === id)[0];
    if (!c) return [];
    // How sure a criterion has to be is the planner's call (it knows what a listing can show); the owner's choice
    // on one is whether it stays. Rewording it is "Change what I asked".
    return [
      { id: "drop", label: "Take it out of the plan", apply: () => change({ criteria: plan.criteria.filter((x) => x.key !== c.key) }) },
    ];
  };
  const words = C.planWords(plan).map((w, i) => {
    if (!w.pick || (answering && w.pick === "count")) return <span key={`w${i}`}>{w.text}</span>;
    const id = w.pick === "criterion" ? w.key : w.pick === "where" ? "area" : w.pick;
    return (
      <LeadPick
        key={`w${i}`}
        id={id}
        cls={w.pick === "count" ? "num" : ""}
        label={w.text}
        title={{ count: "Change how many", who: "Change who you want", area: "Change where to look", contact: "Change what to find" }[id] || "Keep or take out"}
        open={pick === id}
        options={options(id)}
        onOpen={onPick}
        onPick={(o) => o.apply()}
      />
    );
  });
  return (
    <div className="lf-plan" data-testid="lead-plan">
      <p className="lf-sentence" data-testid="plan-sentence">{words}</p>
      {plan.version > baseVersion ? <span className="lf-changed" data-testid="plan-changed">changed</span> : null}
      {cannot ? (
        <div className="lf-cannot" role="status" data-testid="plan-cannot-see">
          <Icon name="dashring" size={13} />
          <span>A listing doesn't show that, so "{cannot.text}" can't be confirmed. Nothing has been spent.</span>
          <button type="button" className="btn btn-sm" data-testid="plan-take-likely" onClick={() => change({ criteria: plan.criteria.map((x) => (x.key === cannot.key ? { ...x, standard: "likely", text: cannot.likely } : x)) })}>{cannot.likely}</button>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="plan-drop-unseen" onClick={() => change({ criteria: plan.criteria.filter((x) => x.key !== cannot.key) })}>Take it out</button>
        </div>
      ) : null}
      {plan.exclusions.length ? (
        <div className="lf-leaving" data-testid="plan-leaving">
          <span>Leaving out</span>
          {plan.exclusions.map((e) => (
            <span key={e.key} className="tok-x" data-testid={`plan-leaving-${e.key}`}>
              {e.text}
              <button type="button" aria-label={`Keep ${e.text}`} title="Don't leave these out" onClick={() => change({ exclusions: plan.exclusions.filter((x) => x.key !== e.key) })}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="lf-likely" data-testid="plan-likely">
        {likely.emailPct === null ? null : (
          <span className="bar" aria-hidden="true">
            <span className="b-email" style={{ width: `${likely.emailPct}%` }} />
            <span className="b-phone" style={{ width: `${likely.phonePct}%` }} />
          </span>
        )}
        <span>{likely.line}</span>
      </div>
      <div className="lf-facts" data-testid="plan-facts">
        {C.leadPlanFacts(plan, f).map((t, i) => (
          <span key={t} className="lf-fact">
            <Icon name={["clock", "users", "shield"][i] || "shield"} size={13} />
            {t}
          </span>
        ))}
      </div>
      {ask.covers ? <p className="lf-said" data-testid="plan-covers">{ask.covers}</p> : null}
      {refusal ? <p className="field-error" role="alert" data-testid="plan-refusal">{refusal}</p> : null}
      <div className="lf-actions">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          data-testid="plan-approve"
          disabled={!!busy || !!cannot || ask.count < 1}
          onClick={() => onApprove(ask.count === plan.count ? plan : C.planVersionOf(plan, { count: ask.count }))}
        >
          {busy ? "Starting…" : ask.label}
        </button>
        <button type="button" className="btn btn-ghost" data-testid="plan-back" onClick={onBack}>Change what I asked</button>
        {view && view.title && !answering ? <span className="lf-said" data-testid="plan-title">{view.title}</span> : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------ the plan panel -- */

/**
 * The plan panel: the card for a plan born from the strip (more, nearby, look
 * further, carry on, try again), and, when a search stopped to ask, the answer
 * row that runs the amend turn (spec F5): the question, one input, "Send my
 * answer", and the trace line while Claude reads. A fresh Find is Ask's (F1,
 * F2); nothing here composes one, so the row is drawn only under a question.
 *
 * stage: compose (answering only) | thinking | plan | starting. `answering` is
 * what the page hands it under a waiting search's question (clients-a.jsx
 * answerOf), or null; it is the row's discriminator, so every caller says it.
 */
const LeadPlanPanel = ({
  open, stage, words, proposal, plan = null, facts = null, refusal, busy, trace, pick = null, answering,
  onWords, onAnswer, onChangePlan = () => {}, onApprove, onBack, onClose, onPick = () => {},
}) => {
  if (!open) return null;
  const card = proposal && proposal.payload ? proposal.payload : {};
  const shown = plan || card.plan || null;
  const composing = stage === "compose" && !!answering;
  const thinking = stage === "thinking";
  const planning = stage === "plan" || stage === "starting";
  const typed = !!(words || "").trim();
  return (
    <div className="lf-panel pl-plan" role="dialog" aria-label={answering ? "Change the search" : "The plan"} data-testid="lead-plan-panel">
      {composing ? <p className="lf-answering" data-testid="plan-answering">{answering.question}</p> : null}
      {composing || thinking ? (
        <div className={`lf-compose${thinking ? " thinking" : ""}`}>
          <input
            className="lf-input"
            type="text"
            value={words || ""}
            maxLength={400}
            placeholder="Tell Claude what you meant"
            aria-label="Tell Claude what you meant"
            data-testid="plan-answer-input"
            disabled={!composing}
            onChange={(e) => onWords(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && composing && !busy && typed) { e.preventDefault(); onAnswer(words); } }}
          />
          {thinking ? <span className="lf-think" role="status" data-testid="plan-thinking">{trace || "Reading what you asked"}</span> : null}
          {composing ? (
            <button type="button" className="btn btn-primary btn-sm lf-go" data-testid="plan-answer-send" disabled={!!busy || !typed} onClick={() => onAnswer(words)}>
              Send my answer
            </button>
          ) : null}
          <button type="button" className="lf-close" aria-label="Close" title="Close (esc)" data-testid="plan-close" onClick={onClose}><Icon name="x" size={12} /></button>
          {thinking ? <span className="lf-sweep" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {composing && refusal ? <p className="lf-said" role="status" data-testid="plan-refusal">{refusal}</p> : null}
      {planning && shown ? (
        <LeadPlanCard
          plan={shown}
          view={card.view || null}
          facts={facts || card.facts || null}
          baseVersion={(card.plan && card.plan.version) || 1}
          busy={stage === "starting" || !!busy}
          refusal={refusal}
          pick={pick}
          onPick={onPick}
          onChange={onChangePlan}
          onApprove={onApprove}
          onBack={onBack}
          answering={answering}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------- the strip -- */

/**
 * How long a finished round's Undo stays true to offer (section 8.6), and the
 * six next steps that make a new round: a strip offers one of them, never two.
 *
 * NOTE (release B, Task 10): the plan writes `leadStrip` in
 * packages/contracts/src/leads.ts (step 4) and puts it in `window.__LEAD_VM`
 * (step 7a). Neither is on this branch, and neither file is this run's to
 * touch, so the view model is built here, beside the component that draws it,
 * and published on window for the page. The NINE ENDING SENTENCES stay
 * contracts' own -- `leadEndingLine`, read off the bag at draw time -- so no
 * word is spelled twice; with no `leadEndingLine` in the bag an ended round
 * draws no strip at all, rather than a sentence of this file's own making.
 */
const LEAD_ROUND_MAKERS = ["more", "nearby", "look_further", "carry_on", "try_again", "answer_now"];
/** The first 25 size the rest of a round (S6): contracts' LEAD_PROBE_PLACES. */
const LEAD_PROBE_SEEN = 25;

const ldLowerFirst = (s) => (s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// What the plan leaves out, by key: "chain gyms" for Include, and for the
// sentence that says nothing matched.
const ldLeftOut = (plan, key) => {
  const e = (plan.exclusions || []).filter((x) => x.key === key)[0] || (plan.criteria || []).filter((x) => x.key === key)[0];
  return e ? ldLowerFirst(e.text) : null;
};

// What leadEndingLine needs, read off the search's latest round and its plan.
/** A step that points somewhere else: the plan opens on the nearest area the round wrote (00145). */
const ldLookStep = (id) => id === "nearby" || id === "look_further";
const ldEndingFacts = (C, s, nearby) => {
  const r = s.round;
  const only = s.plan.exclusions.length === 1 ? ldLowerFirst(s.plan.exclusions[0].text) : null;
  return {
    name: C.planWho(s.plan),
    area: C.planArea(s.plan.area),
    counted: r.counted,
    target: r.target,
    emails: r.emails_checked,
    phones: r.with_phone,
    excluded: r.excluded,
    checking: r.state === "checking",
    foundBefore: r.counted,
    // Where to look next: what the caller knows, else what the round itself wrote when it ran dry (00145).
    nearby: nearby.length ? nearby : (r.nearby || []).map((a) => a.label),
    // What the source returned at all: every place this round judged, however it was classed.
    seen: r.qualified + r.review + r.excluded,
    leftOutBy: only,
  };
};

const ldStripOf = (s, now, nearby) => {
  const C = window.__LEAD_VM || {};
  if (!s || !s.plan || !C.planWho || !C.planWhere || !C.planArea || !C.planMinutes) return null;
  const r = s.round;
  const plan = s.plan;
  const who = C.planWho(plan);
  const where = C.planWhere(plan.area);
  if (!r) return { state: "ended", alert: false, title: `Nothing has run for ${who} yet`, parts: [], progress: null, actions: [] };
  const counted = r.counted;
  const progress = r.target > 0 ? Math.min(1, counted / r.target) : null;
  // Removing the untouched leads (POST lead-searches/[id]/undo) is the search
  // menu's, named for what it removes and gives back (contracts leadUndoable):
  // an "Undo" here, beside "the 24 found are yours", read as deleting what was
  // just paid for.

  if (r.state === "waiting_on_owner" && r.question) {
    // Include lifts one of the plan's own exclusions. A key the plan does not hold as one -- gone, empty, or a
    // requirement -- has nothing to lift, and a button that cannot work is not drawn: "Include what I left out" once
    // stood here, lifted nothing, and the door refused the unchanged plan. The no that changes the search is
    // Change what I asked, which the page opens under the question.
    const key = r.question.criterion_key;
    const lifted = key && (plan.exclusions || []).some((x) => x.key === key) ? ldLeftOut(plan, key) : null;
    return {
      state: "question",
      alert: true,
      title: r.question.sentence,
      parts: C.LEAD_QUESTION_WAIT_LINE ? [C.LEAD_QUESTION_WAIT_LINE] : [],
      progress,
      actions: [
        { id: "keep", label: "Yes, keep going", primary: true },
        ...(lifted ? [{ id: "include", label: `Include ${lifted}`, arg: key }] : []),
        { id: "change", label: "Change what I asked" },
        { id: "stop_here", label: "Stop here" },
      ],
    };
  }

  if (r.state === "checking") {
    // After Stop the emails of what was already found are still checked, and the
    // strip says so in the ending's own words, with `checking` true (S12, 17).
    if (r.ending_pending === "stopped") {
      if (!C.leadEndingLine) return null;
      const line = C.leadEndingLine("stopped", ldEndingFacts(C, s, nearby));
      return { state: "checking", alert: false, title: line.title, parts: line.parts, progress, actions: [] };
    }
    return { state: "checking", alert: false, title: `Checking the emails of the ${counted} found`, parts: [], progress, actions: [] };
  }

  if (r.state !== "ended") {
    const minutesLeft = Math.max(1, Math.round(C.planMinutes(plan) * (1 - (progress || 0))));
    const parts = [`${counted} of ${r.target}`, `${r.emails_checked} emails checked`, `about ${minutesLeft} min left`];
    // The first 25 size the rest of the round (S6), so until they are in the estimate is an assumption and says so (P3).
    if (counted < LEAD_PROBE_SEEN) parts.push("estimates update after the first 25");
    return { state: "running", alert: false, title: `Finding ${who} ${where}`, parts, progress, actions: [{ id: "stop", label: "Stop" }] };
  }

  // Every ending is said once, by contracts' leadEndingLine. The strip composes:
  // the sentence's own next step, then Sort by fit where the table is worth
  // re-ordering, then the piles the ending's numbers open.
  if (!C.leadEndingLine) return null;
  const line = C.leadEndingLine(r.ending || "paused", ldEndingFacts(C, s, nearby));
  const step = line.step
    ? [{ id: line.step.id, label: line.step.label, primary: line.step.id !== "excluded" && line.step.id !== "sort_fit", arg: line.step.id === "excluded" ? "excluded" : ldLookStep(line.step.id) && r.nearby && r.nearby.length ? { ...plan, area: r.nearby[0] } : plan, where: ldLookStep(line.step.id) && r.nearby && r.nearby.length && C.leadNearWhere ? `Look ${C.leadNearWhere(r.nearby.map((a) => a.label))}` : null }]
    : [];
  const sorts = counted > 0 && (r.ending === "target_reached" || r.ending === "searched_everything") && (!line.step || line.step.id !== "sort_fit")
    ? [{ id: "sort_fit", label: "Sort by fit" }]
    : [];
  // The ending's numbers are the way into each pile: quiet links, never beside
  // a primary step that already opens one of them.
  const piles = [
    ...(r.review > 0 ? [{ id: "review", label: `${r.review} need a look`, arg: "review", pile: true }] : []),
    ...(r.excluded > 0 ? [{ id: "excluded", label: `${r.excluded} left out`, arg: "excluded", pile: true }] : []),
  ].filter((a) => !line.step || line.step.id !== a.id);
  return { state: "ended", alert: false, title: line.title, parts: line.parts, progress: 1, actions: [...step, ...sorts, ...piles] };
};

/**
 * One search's strip: what is true of its latest round, in the owner's words
 * (sections 8.4, 8.5, 8.8; P3, S12). Every open state and all nine endings,
 * each saying what happened, what was kept and what was counted, and offering
 * one next step. Nothing here says a number nothing measured, and nothing says
 * a price: the owner's unit is leads (section 0.2).
 *
 * `offered` is what a refresh found and the surface is holding back, because
 * the owner is not reading in the order found (E8): the strip says the count,
 * and nothing re-sorts under them until it is pressed.
 */
const leadStrip = (s, now, extra) => {
  const vm = ldStripOf(s, now, (extra && extra.nearby) || []);
  if (!vm) return null;
  const n = (extra && extra.offered) || 0;
  return n > 0 ? { ...vm, actions: [{ id: "take_offered", label: `${n} new` }, ...vm.actions] } : vm;
};

/**
 * The strip above the table: running, checking, the question after 25 in the
 * accent with role="alert", or one of the nine endings (sections 8.4, 8.5,
 * 8.8). Every word it says is leadStrip's, so nothing is spelled here; every
 * button hands its id and its argument back through the one onAction the page
 * gives it, and presses nothing itself.
 */
const LeadStrip = ({ vm, onAction, children = null }) => {
  if (!vm) return null;
  const tone = vm.state === "question" ? "ask" : vm.state === "ended" ? "done" : "";
  const quiet = ["undo", "excluded", "review", "stop", "stop_here", "sort_fit", "take_offered", "not_now"];
  // With the band inside, its tabs ARE the ways into each pile: the strip's own "14 need a look" link beside a tab
  // saying "14 need a look" was the same door twice. A step that opens a pile stays -- it is the one next thing.
  const actions = children ? vm.actions.filter((a) => !a.pile) : vm.actions;
  const parts = vm.parts.map((t) => ` · ${t}`).join("");
  return (
    <div className={`lf-strip ${tone}${children ? " has-band" : ""}`} role={vm.alert ? "alert" : "status"} data-testid="lead-strip">
      {vm.state === "running" ? <span className="live-dot" aria-hidden="true" /> : null}
      {vm.state === "question" ? <span className="qmark" aria-hidden="true">?</span> : null}
      {vm.state === "ended" ? <span className="ok-mark"><Icon name="check" size={15} /></span> : null}
      {vm.state === "question" ? (
        <span className="lf-ask-text">
          <span className="lf-q" data-testid="strip-title">{vm.title}</span>
          <span className="lf-q-sub" data-testid="strip-parts">{vm.parts.join(" · ")}</span>
        </span>
      ) : (
        // The title holds; what follows it gives way first, and says itself whole on hover.
        <span className="lf-strip-said" title={`${vm.title}${parts}`}>
          <span className="lf-strip-title" data-testid="strip-title">{vm.title}</span>
          {vm.parts.length ? <span className="lf-strip-parts" data-testid="strip-parts">{parts}</span> : null}
        </span>
      )}
      {children ? <span className="lf-strip-band">{children}</span> : <span className="sp" />}
      {/* .lf-acts is what the stylesheet already stacks at a phone's width, so the actions are one group here
          rather than loose buttons in the strip's flex row. */}
      {actions.length ? (
        <span className="lf-acts">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={a.id === "excluded" || a.id === "review" ? "lnk" : `btn btn-sm ${a.primary ? "btn-primary" : quiet.indexOf(a.id) >= 0 ? "btn-ghost" : ""}`}
              data-testid={`strip-${a.id}`}
              title={a.where || undefined}
              onClick={() => onAction(a.id, a.arg)}
            >
              {a.label}
            </button>
          ))}
        </span>
      ) : null}
      {vm.progress === null ? null : <span className="lf-strip-bar" style={{ width: `${Math.round(vm.progress * 100)}%` }} aria-hidden="true" />}
    </div>
  );
};

Object.assign(window, { LeadPlanPanel, LeadPlanCard, LeadStrip, LeadPick, LeadsFirstDay, LeadSuggestion, LeadWayCard, leadStrip, leadAnswerPlan, leadFinderApprove, leadFinderAmendAsk, LEAD_ROUND_MAKERS });
