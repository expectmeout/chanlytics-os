/* global React, Icon */
// The finder: the composer an owner describes businesses in (Task 8), the plan
// card whose words are pickers (Task 9), and the strip that says what a round
// is doing and how it ended (Task 10). Hookless, as every part of People is:
// the stub React the tests draw on keys state by call order, so all of it
// lives in ClientsAReal and arrives here as props.
//
// Nothing here names the vendor that runs a search: the owner sees Claude
// finding businesses, and where each fact came from.

// The words a lead wears live once, in contracts; the bridge hands them over
// as window.__LEAD_VM (legacy-bridge/seed-globals.ts). Read at draw time, never
// at load time: the page's scripts load before the bridge installs anything.
/* ------------------------------------------------------ the one Ask turn */

/**
 * The words the finder sends. scopeFromRoute("clients", "leads:...") answers
 * null on main (only a uuid on clients is a scope), so the turn goes with no
 * scope and the clients surface, and the question names Leads itself.
 */
const leadFinderAsk = (words) => `On People › Leads, find businesses I could reach: ${String(words || "").trim()}`;

/**
 * One Ask turn, through window.__ask.send (legacy-bridge/ask/api.ts). The
 * SendEvent shapes are that file's: thread, trace, delta, final, error. The
 * finder listens for the trace line while it waits and for the `final`
 * message: a lead_search proposal is the plan card, and words with no card are
 * a refusal said under the input. The page hands its setters in, so this is a
 * plain function the tests can run.
 */
const leadFinderPlan = async (words, set) => {
  const A = window.__ask;
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
  await A.send({ text: leadFinderAsk(words), threadId: null, scope: null, surface: "clients" }, (ev) => {
    if (!ev || !ev.t) return;
    if (ev.t === "trace") set.trace(ev.text);
    else if (ev.t === "final") {
      const m = ev.message || {};
      said = m.text || "";
      card = (m.proposals || []).filter((p) => p && p.kind === "lead_search")[0] || null;
    } else if (ev.t === "error") said = ev.text || "";
  });
  if (card) {
    set.proposal(card);
    set.plan((card.payload || {}).plan || null);
    set.stage("plan");
    return card;
  }
  set.refusal(said || "Nothing came back — ask again in a moment.");
  set.stage("compose");
  return null;
};

/**
 * Find N leads. An Ask card goes through commitProposal (legacy-bridge
 * ask/commit.ts), which posts the plan to POST lead-searches marked as Ask's;
 * a plan the finder opened from a strip's next step goes through
 * __leadSearchMore on that search. Either way the route's own sentence on a
 * refusal (402, 409, 429) is said under the button, in its words.
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

// The card's body until Task 9: the plan as the one sentence contracts spells.
const LeadPlanCard = ({ plan }) => (plan ? (
  <div className="lf-plan" data-testid="lead-plan">
    <p className="lf-sentence" data-testid="plan-sentence">{(window.__LEAD_VM || {}).planSaid(plan)}</p>
  </div>
) : null);

/* -------------------------------------------------------- the composer -- */

/**
 * The finder itself: the input with a mic held to talk, the trace line while
 * Claude reads, the three suggestions, the refusal in words under the input,
 * and the plan card once a card comes back (sections 8.2, 8.3).
 *
 * stage: compose | thinking | plan | starting. Every hook it needs is
 * ClientsAReal's; `talk` is useAskTalk's answer (ask-hooks.jsx), declared
 * there and handed down, so nothing is recorded or uploaded here.
 */
const LeadFinder = ({
  open, stage, words, proposal, plan = null, facts = null, refusal, busy, trace, suggestions, talk, pick = null,
  onWords, onPlan, onChangePlan = () => {}, onApprove, onBack, onClose, onPick = () => {},
}) => {
  if (!open) return null;
  const card = proposal && proposal.payload ? proposal.payload : {};
  const shown = plan || card.plan || null;
  const composing = stage === "compose";
  const planning = stage === "plan" || stage === "starting";
  return (
    <div className="lf-panel pl-finder" role="dialog" aria-label="Find leads" data-testid="lead-finder">
      <div className="lf-compose">
        <span className={`lf-spark ${stage === "thinking" ? "live" : ""}`}><Icon name="sparkle" size={16} /></span>
        <input
          className="lf-input"
          type="text"
          value={words || ""}
          maxLength={400}
          placeholder="Describe the businesses you want"
          aria-label="Describe the businesses you want"
          data-testid="finder-input"
          disabled={!composing}
          onChange={(e) => onWords(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && composing && !busy && (words || "").trim()) { e.preventDefault(); onPlan(words); } }}
        />
        {talk && talk.canTalk ? (
          <button
            type="button"
            className={`lf-mic ${talk.listening ? "on" : ""}`}
            data-testid="finder-talk"
            aria-pressed={!!talk.listening}
            aria-label="Hold to talk"
            title="Hold to talk"
            disabled={!composing}
            onPointerDown={talk.start}
            onPointerUp={talk.stop}
            onPointerLeave={talk.stop}
            onPointerCancel={talk.stop}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Icon name="mic" size={14} />
          </button>
        ) : null}
        {composing ? (
          <button type="button" className="btn btn-primary btn-sm" data-testid="finder-plan" disabled={!!busy || !(words || "").trim()} onClick={() => onPlan(words)}>Plan it</button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" data-testid="finder-close" onClick={onClose}><Icon name="x" size={12} /></button>
      </div>
      {composing && refusal ? <p className="lf-said" role="status" data-testid="finder-refusal">{refusal}</p> : null}
      {composing && suggestions && suggestions.items && suggestions.items.length ? (
        <div className="lf-examples" data-testid="finder-suggestions">
          <div className="lf-ex-h">Suggested for {suggestions.forWho}, from what your business does</div>
          {suggestions.items.slice(0, 3).map((s) => (
            <button key={s.words} type="button" className="lf-ex" data-testid="finder-suggestion" onClick={() => onWords(s.words)}>
              <Icon name="search" size={13} />
              <span>{s.words}</span>
              {s.reach ? <span className="k">{s.reach}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {stage === "thinking" ? (
        <div className="lf-think" role="status" data-testid="finder-thinking">
          <span className="ask-trace-dot" aria-hidden="true" />
          <span>{trace || "Reading what you asked"}</span>
        </div>
      ) : null}
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
        />
      ) : null}
      <div className="lf-foot">
        <span className="lock"><Icon name="lock" size={12} />You can email and call leads. Texts and offers wait for their yes.</span>
        <span className="sp" />
        <span className="keys"><span className="kbd">{"↵"}</span>{composing ? "plan it" : "approve"}</span>
        <span className="keys"><span className="kbd">esc</span>close</span>
      </div>
    </div>
  );
};

Object.assign(window, { LeadFinder, LeadPlanCard, leadFinderPlan, leadFinderApprove, leadFinderAsk });
