/* global React, Icon */
// The Pipeline's peek (docs/decisions/0008-a-proposal-is-part-of-the-deal.md, "the Pipeline is a workspace"): one
// person's deal beside the rows -- on a desk the 408px pane the lead's peek uses (leads.css .pk), on a phone the whole
// screen -- so a row is worked without leaving the Pipeline. Hookless, as the lead's is: who is open and what was
// read of them are PipelineScope's, handed down, so the page's one keyboard listener closes it on Esc and it follows
// the row cursor.
//
// It says nothing of its own. The head is contracts' pipelinePeekOf over the row (who, the group and the service),
// there the moment it opens. The deal is the person page's own card (person-deal.jsx PersonDealOne and PersonDealQuiet
// over contracts dealCardsOf, through window.__deal.cards), drawn once the person lands -- the tab's copy at once,
// else read -- with every act the card offers: a send opens their thread with the words in the box, and every other
// act opens the one deal sheet. Under it, once the person is read, how to reach them (the number with Call and Copy,
// the address with Copy, what a reply may be now) and what happened with their deals, from contracts'
// pipelinePeekDetail in the person page's own words; the quiet facts People's row already says (when they were last
// heard, their words, what is coming up); and the two doors, their page and their thread. On a phone, where the peek
// is the whole screen, the deal's next act and Call are pinned under it (`pipe-peek-bar`), in a thumb's reach.

// How to reach them. A copy says so on the button it was pressed on, for a moment.
const PipelinePeekReach = ({ rows }) => {
  const [copied, setCopied] = React.useState(null);
  const W = window.__pipeline.words.peek.reach;
  if (!rows || !rows.length) return null;
  const copy = (r) => {
    const done = () => {
      setCopied(r.id);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 1600);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.copy).then(done, () => {});
    } catch (e) { /* no clipboard here */ }
  };
  return (
    <dl className="pipe-peek-reach" data-testid="pipeline-peek-reach">
      {rows.map((r) => (
        <div key={r.id} className="pipe-peek-reach-row" data-testid={`pipeline-peek-reach-${r.id}`}>
          <dt className="pipe-peek-reach-label">{r.label}</dt>
          <dd className="pipe-peek-reach-what">
            <span className={`pipe-peek-reach-words${r.id === "phone" ? " tabular" : ""}`}>{r.words}</span>
            {r.call ? <a className="cl-prof-deal-act" href={r.call} data-testid="pipeline-peek-call">{W.call}</a> : null}
            {r.copy ? <button type="button" className="cl-prof-deal-act" aria-label={r.id === "phone" ? W.copyPhone : W.copyEmail} onClick={() => copy(r)} data-testid={`pipeline-peek-copy-${r.id}`}>{copied === r.id ? W.copied : W.copy}</button> : null}
          </dd>
        </div>
      ))}
      {/* A copy is said once to a screen reader too: the button's own words change where it was pressed. */}
      <span className="rec-sr" role="status" aria-live="polite">{copied ? W.copied : ""}</span>
    </dl>
  );
};

// What happened with their deals, newest first: the person page's own lines from their timeline.
const PipelinePeekHistory = ({ items }) => {
  const W = window.__pipeline.words.peek;
  if (!items || !items.length) return null;
  return (
    <section className="pipe-peek-history" aria-label={W.history} data-testid="pipeline-peek-history">
      <h3 className="pipe-peek-head">{W.history}</h3>
      <ul className="pipe-peek-history-list">
        {items.map((h) => (
          <li key={h.id} className="pipe-peek-history-row"><span className="pipe-peek-history-words">{h.words}</span><span className="pipe-peek-when">{h.when}</span></li>
        ))}
      </ul>
    </section>
  );
};

// A phone's one act, pinned under the peek: the deal's next act (the card's own, contracts dealNextAct, through the
// deal kit) for a member who may record one, and Call where there is a number.
const PipelinePeekBar = ({ person, call, canRecord, onCompose }) => {
  const kit = window.__deal;
  let act = null;
  try { act = canRecord && kit && kit.next ? kit.next(person, Date.now()) : null; } catch (err) { act = null; }
  if (!act && !call) return null;
  const W = window.__pipeline.words.peek.reach;
  return (
    <div className="pipe-peek-bar" data-testid="pipeline-peek-bar">
      {act ? <button type="button" className="btn btn-primary pipe-peek-bar-act" onClick={() => window.pdRun && window.pdRun(person, act, person.deal ? person.deal.id : null, onCompose)} data-testid="pipeline-peek-bar-act">{act.label}</button> : null}
      {call ? <a className="btn pipe-peek-bar-call" href={call} data-testid="pipeline-peek-bar-call"><Icon name="phone" size={14} /> {W.call}</a> : null}
    </div>
  );
};

const PipelinePeekFacts = ({ facts }) => (facts.length ? (
  <ul className="pipe-peek-facts" data-testid="pipeline-peek-facts">
    {facts.map((f) => <li key={f.id} className={`pipe-peek-fact pipe-peek-fact-${f.id}`} data-testid={`pipeline-peek-${f.id}`}>{f.words}</li>)}
  </ul>
) : null);

// The deal as the person page says it, once the person has landed: their card per open deal, or the quiet line. A
// person still on their way is said after the standard's beat (route-reading); one that could not be read, by the
// house's FailedRead with its Retry.
const PipelinePeekDeal = ({ person, failed, canRecord, onRetry, onCompose, flash = null }) => {
  const W = window.__pipeline.words.peek;
  const kit = window.__deal;
  if (failed !== null && !person) return <window.FailedRead kind="card" what={W.what} why={failed || null} onRetry={onRetry} testid="pipeline-peek-failed" />;
  if (!person) return <div className="route-reading pipe-peek-reading" role="status" data-testid="pipeline-peek-reading">{W.reading}</div>;
  if (!kit || !kit.cards || !window.PersonDealOne || !window.PersonDealQuiet) return null;
  // Worked out as it draws, tried: the peek is drawn inside the page's boundary, but a person it cannot say is said
  // as a read that failed, never a throw that takes the rows with it (the deal sheet's own rule, dsWorked).
  let vm = null;
  try { vm = kit.cards(person, Date.now(), window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC"); } catch (err) { if (window.console) window.console.error("The peek could not say this deal.", err); }
  if (!vm) return <window.FailedRead kind="card" what={W.what} testid="pipeline-peek-failed" />;
  return vm.quiet
    ? <window.PersonDealQuiet p={person} q={vm.quiet} canRecord={canRecord} onCompose={onCompose} />
    : <div className="cl-prof-deal-list">{vm.cards.map((c) => <window.PersonDealOne key={c.id || c.title} p={person} c={c} W={kit.cardWords} canRecord={canRecord} onCompose={onCompose} flash={flash} />)}</div>;
};

const PipelinePeek = ({ vm, person = null, failed = null, canRecord = false, phone = false, onClose, onRetry, onOpenPage, onOpenThread, onCompose, flash = null }) => {
  if (!vm) return null;
  const W = window.__pipeline.words.peek;
  // On a phone, where the peek is the whole screen, a pull down from the top of what it shows is its Close (data-bits
  // touchSwipe, the lead peek's rule).
  const swipe = phone && window.touchSwipe ? window.touchSwipe({ onDown: onClose }) : {};
  // What the peek says once the person is read; worked out tried, as the card is: a person it cannot say is not a throw.
  let detail = null;
  if (person && window.__pipeline.detail) {
    try { detail = window.__pipeline.detail(person); } catch (err) { detail = null; }
  }
  const call = detail ? (detail.reach.find((r) => r.call) || {}).call || null : null;
  return (
    <aside className="pk pl-peek pipe-peek" role="dialog" aria-label={vm.name} data-testid="pipeline-peek" {...swipe}>
      <div className="pk-head">
        <span className={`ix-thread-avatar pipe-peek-face${vm.numeric ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">{vm.numeric ? <Icon name="phone" size={13} /> : vm.initials}</span>
        <div className="pk-titles">
          <h2 className={`pk-name${vm.numeric ? " tabular" : ""}`} data-testid="pipeline-peek-name">{vm.name}</h2>
          <div className="pk-sub" data-testid="pipeline-peek-sub">{vm.sub}</div>
        </div>
        <button type="button" className="pk-x" id="pipeline-peek-close" aria-label={W.close} data-testid="pipeline-peek-close" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div className="pk-body pipe-peek-body">
        <PipelinePeekDeal person={person} failed={failed} canRecord={canRecord} onRetry={onRetry} onCompose={onCompose} flash={flash} />
        {detail ? <PipelinePeekReach rows={detail.reach} /> : null}
        <PipelinePeekFacts facts={vm.facts} />
        {detail ? <PipelinePeekHistory items={detail.history} /> : null}
        {/* The doors are quiet words, as the card's other moves are: the card's one next act keeps the outline button. */}
        <div className="pipe-peek-doors">
          <button type="button" className="cl-prof-deal-act pipe-peek-door" onClick={onOpenPage} data-testid="pipeline-peek-page">{W.page}<Icon name="arrow-right" size={11} /></button>
          {vm.thread ? <button type="button" className="cl-prof-deal-act pipe-peek-door" onClick={onOpenThread} data-testid="pipeline-peek-thread">{W.thread}<Icon name="arrow-right" size={11} /></button> : null}
        </div>
      </div>
      {phone && person ? <PipelinePeekBar person={person} call={call} canRecord={canRecord} onCompose={onCompose} /> : null}
    </aside>
  );
};

Object.assign(window, { PipelinePeek });
