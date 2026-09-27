/* global React, Icon, Confirm, EmptyState, FailedRead */
// Chanlytics -- Broadcasts: one run, its sheet, its people and the verbs on it. Moved whole from broadcasts-real.jsx
// (Reach out Part 2.5), which reads it from window.

// What is still to come, by state -- "1 sending · 2 scheduled · 1 waiting for you" -- where "N queued" counted runs waiting for a person.
// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
const BC_NONE = [];

// One run, opened, as the canvas's After board draws it: what went out and what
// came back, by the run's own people. Five figures, everyone it touched in the
// words of what happened to them, every reply quoted with what has happened
// since, and, for a run that stopped, why and what to do next. The words are the
// contracts' (toRunReportVM, through window.__broadcasts.report); this draws
// them. It is its own screen, as the send is, and it is read when it opens.
// When a run went, for the head's line, by the business's clock (window.__clock) as the ledger says it: "Today 9:00 AM",
// "Sep 12 · 10:00 AM".
const bcWhen = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return null;
  const w = window.__clock.when(ms);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

// A broadcast that can still change: waiting for a person, scheduled, or sending.
const BC_LIVE = new Set(["pending_approval", "scheduled", "sending"]);

// Who "Everyone it touched" can show; who is in each is the report's (RunPersonVM.in).
const BC_FILTERS = [["all", "All"], ["replied", "Replied"], ["held", "Held back"], ["stopped", "Stopped"]];

const BC_FILTER_NONE = { all: "Nobody is on this run.", replied: "Nobody has written back yet.", held: "Nobody was held back.", stopped: "Nobody asked to stop." };

// How many replies "What came back" quotes; the rest are threads in the Inbox, and it says how many.
const BC_REPLIES_SHOWN = 5;

// One person's line on a run: who, how it went, the words, their one door, and when.
const bcPersonRow = (p) => (
  <div key={p.contact_id} className={`bc-person${p.attn ? " is-attn" : ""}${p.held ? " is-held" : ""}`} data-testid="bc-person">
    <span className="bc-person-mark" aria-hidden="true">{p.initials}</span>
    <button type="button" className="bc-person-name" onClick={() => window.CHANLY.nav(`clients/${p.contact_id}`)}>{p.name}</button>
    <span className={`pill${p.pill.tone && p.pill.tone !== "plain" ? ` pill-${p.pill.tone}` : ""} bc-person-pill`} data-tone={p.pill.tone}>{p.pill.label}</span>
    <span className="bc-person-words">{p.words}</span>
    {p.door && <button type="button" className="bc-person-door" onClick={() => window.CHANLY.nav(p.door.to)}>{p.door.label}</button>}
    <span className="bc-person-at mono">{p.at || "—"}</span>
  </div>
);

// A run waiting on you, opened: the sheet the canvas draws for the phone -- "approving from the sofa" -- at any
// width, since a run that has not gone has no report to read. What it reaches, by the rules that made its list (a
// run records how many it enrolled and nothing about the rest, so no "of 312"); the words as its first person reads
// them; and the act alone at the foot, pinned, with the skip and the list beside it. The words are the contracts'
// (toApprovalVM, through window.__broadcasts.approval); the acts are the page's, and when one lands the next run
// waiting opens, so a queue of two is two presses.
// A part of a bar, as a width: never under a sliver for a part that exists, so one person out of three hundred still shows.
const bcShare = (n, of) => (of > 0 ? Math.max(1.5, Math.round((n / of) * 1000) / 10) : 0);

const BcSheet = ({ d, people, avm, sheet, onClose, seeAll, onSeeAll }) => {
  const b = d.broadcast;
  const pb = sheet.playbook;
  const stop = bcStopWords("pending_approval");
  const hint = pb && pb.triggerHint ? pb.triggerHint.charAt(0).toLowerCase() + pb.triggerHint.slice(1) : b.audience.label;
  const body = sheet.template ? sheet.template.body_preview : null;
  const parts = body && window.mpParts ? window.mpParts(body, avm.values) : [];
  const pos = sheet.position;
  return (
    <div className="bc-sheet" data-testid="bc-sheet">
      <div className="bc-sheet-top">
        <button type="button" className="bc-sheet-back" onClick={onClose} aria-label="Back to Broadcasts" data-testid="bc-detail-close"><Icon name="chevron" size={18} /></button>
        <div className="bc-sheet-where">
          <div className="bc-sheet-k">Waiting on you</div>
          <div className="bc-sheet-pos" data-testid="bc-sheet-pos">{pos && pos[1] > 1 ? `${pos[0]} of ${pos[1]} · Campaigns` : "Campaigns"}</div>
        </div>
      </div>
      <div className="bc-sheet-body">
        <div>
          <div className="bc-sheet-titles">
            <h1 className="bc-sheet-title">{b.name}</h1>
            {pb && <PolicyChip cls={pb.policy_class} />}
          </div>
          <div className="bc-sheet-sub">Playbook · {hint} · {avm.goes}</div>
        </div>
        {/* Who it reaches out of everyone its moment named, as the run counted
            them when it was drawn: green reaches, amber waits only for time,
            grey was left out -- and a line for each reason, the most first. A
            run made before runs kept that count says the rules that made its
            list instead, which are true of everyone on it. */}
        <div className="bc-sheet-reach" data-testid="bc-sheet-reach">
          <div className="bc-sheet-n">
            <span className="bc-sheet-v tabular">{avm.will}</span>
            <span className="bc-sheet-will">{avm.of ? <>will get it, of <span className="tabular" data-testid="bc-sheet-pool">{avm.of.pool}</span></> : "will get it"}</span>
          </div>
          {avm.of ? (
            <>
              <div className="bc-sheet-bar is-parts" aria-hidden="true">
                {avm.will > 0 && <span className="bc-sheet-bar-will" style={{ width: `${bcShare(avm.will, avm.of.pool)}%` }} />}
                {avm.of.held > 0 && <span className="bc-sheet-bar-held" style={{ width: `${bcShare(avm.of.held, avm.of.pool)}%` }} />}
                {avm.of.pool - avm.will - avm.of.held > 0 && <span className="bc-sheet-bar-rest" />}
              </div>
              {avm.of.lines.length > 0 && (
                <ul className="bc-sheet-why" data-testid="bc-sheet-why">
                  {avm.of.lines.map((l) => (
                    <li key={l.words}>
                      <span className="cm-reach-dot" data-tone={l.tone} aria-hidden="true" />
                      <span>{l.words}</span>
                      {l.door && <button type="button" className="bc-sheet-door" onClick={() => window.CHANLY.nav(l.door.to)} data-testid="bc-sheet-door">{l.door.words}</button>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="bc-sheet-bar" aria-hidden="true"><span /></div>
              {avm.rules.length > 0 && <div className="bc-sheet-rules">{avm.rules.map((r) => <div key={r}>{r}</div>)}</div>}
            </>
          )}
        </div>
        {parts.length > 0 && (
          <div className="bc-sheet-words" data-testid="bc-sheet-words">
            <p className="bc-sheet-quote">“{parts.map((x, i) => (x.kind === "slot" ? <span key={i} className="bc-sheet-slot">{x.text}</span> : <React.Fragment key={i}>{x.text}</React.Fragment>))}”</p>
            <div className="bc-sheet-reader">
              {avm.reader && <span>as {avm.reader} reads it</span>}
              {avm.hiThere > 0 && <span className="bc-sheet-hi" data-testid="bc-sheet-hi">{avm.hiThere} {avm.hiThere === 1 ? "gets" : "get"} “Hi there” — no name on file</span>}
            </div>
          </div>
        )}
      </div>
      {seeAll && (
        <section className="bc-touched bc-sheet-people" data-testid="bc-sheet-people">
          <div className="bc-touched-head"><span className="bc-card-title">Who gets it</span></div>
          {people.map(bcPersonRow)}
        </section>
      )}
      {/* The act, pinned to the foot while the list above it scrolls. */}
      <div className="bc-sheet-acts" data-testid="bc-sheet-acts">
        {avm.expired && <p className="bc-sheet-expired" data-testid="bc-sheet-expired">{avm.expired}</p>}
        {sheet.canSend && avm.approve && !sheet.armed && (
          <button type="button" className="bc-sheet-approve" disabled={sheet.approving} onClick={sheet.approve} data-testid="bc-sheet-approve">
            <Icon name="check" size={16} /> {sheet.approving ? "Approving…" : avm.approve}
          </button>
        )}
        {sheet.armed && sheet.canSend
          ? <Confirm question={stop.question(b)} detail={stop.detail} yes={stop.yes} danger busy={sheet.stopping} onYes={sheet.skip} onNo={() => sheet.onArm(false)} testid="bc-sheet-skip" />
          : (
            <div className="bc-sheet-pair">
              {sheet.canSend && <button type="button" className="bc-sheet-second" onClick={() => sheet.onArm(true)} data-testid="bc-sheet-skip">Skip this run</button>}
              <button type="button" className="bc-sheet-second" aria-expanded={seeAll} onClick={onSeeAll} data-testid="bc-sheet-see">{seeAll ? "Hide the list" : `See the ${avm.will}`}</button>
            </div>
          )}
        <span className="bc-sheet-note">{sheet.canSend ? avm.skip : window.gateTitle("approve", "approve or skip a run")}</span>
      </div>
    </div>
  );
};

// A live reach-out run the check is still reading, read again every fifteen seconds until nothing is being checked or
// the run is closed (R21): the bridge's one timer (window.__reachOuts.watchRun), each answer kept as the run's.
const useBcRunWatch = (id, d, setAnswer) => {
  const checking = !!(d && d.reach_out && BC_LIVE.has(d.broadcast.state) && d.reach_out.checking > 0);
  React.useEffect(() => {
    if (!checking || !window.__reachOuts || !window.__reachOuts.watchRun) return undefined;
    return window.__reachOuts.watchRun(id, (data) => setAnswer({ id, ok: true, data, gone: false }));
  }, [id, checking, setAnswer]);
};

// A live reach-out run is its own block (Reach out Part 4 PR 7, reach-out-approval.jsx), waiting on you or not (R20).
const bcReachOutBlock = (d, p) => (d.reach_out && BC_LIVE.has(d.broadcast.state) && window.ReachOutRun
  ? <div className="bc-report is-sheet" data-testid="bc-detail"><window.ReachOutRun d={d} {...p} /></div>
  : null);

const BroadcastDetail = ({ id, onClose, acts = null, again = null, sheet = null }) => {
  // The last answer, kept with the broadcast it answered for: a read of another id is not this one's.
  const [answer, setAnswer] = React.useState(null);
  const [asks, ask] = React.useReducer((n) => n + 1, 0);
  const [retrying, setRetrying] = React.useState(false);
  // Who "Everyone it touched" shows: everyone, or the ones who replied, were held back, or asked to stop.
  const [filter, setFilter] = React.useState("all");
  // Whether a waiting run's sheet shows who gets it.
  const [seeAll, setSeeAll] = React.useState(false);
  // A run this tab has opened paints at once from the courier's read cache (the loading standard's C), and is read
  // again behind: every open was ~250ms of "Reading who got it…" first, the second open too.
  const held = !answer || answer.id !== id ? (window.__broadcasts && window.__broadcasts.peekDetail ? window.__broadcasts.peekDetail(id) : null) : null;
  const mine = answer && answer.id === id ? answer : held && held.ok ? { id, ok: true, data: held.data, gone: false } : null;
  const d = mine && mine.ok ? mine.data : null;
  // While it can still change it is read again whenever the surface is -- which re-reads on every message, so
  // the people fill in as a send goes out -- and not once it has finished.
  const live = !!(d && BC_LIVE.has(d.broadcast.state));
  React.useEffect(() => {
    if (!live) return undefined;
    window.addEventListener("surface:broadcasts", ask);
    return () => window.removeEventListener("surface:broadcasts", ask);
  }, [live]);
  React.useEffect(() => {
    let on = true;
    if (!window.__broadcasts) return undefined;
    window.__broadcasts.detail(id).then((r) => {
      if (!on) return;
      setRetrying(false);
      // A re-read that fails keeps what the last one read. A link to a broadcast this workspace does not have (a 404,
      // or an id that is not one) is gone, and a Retry could only fail again.
      setAnswer((prev) => (!r.ok && prev && prev.id === id && prev.ok ? prev : { id, ok: r.ok, data: r.ok ? r.data : null, gone: !r.ok && (r.status === 404 || r.status === 400) }));
    });
    return () => { on = false; };
  }, [id, asks]);
  useBcRunWatch(id, d, setAnswer);
  const close = <button className="btn btn-ghost" onClick={onClose} data-testid="bc-detail-close">Close</button>;
  if (!mine) return <div className="bc-report" data-testid="bc-detail"><div className="bc-report-wait"><span className="cl-prof-aut-hint">Reading who got it…</span>{close}</div></div>;
  if (mine.gone) {
    return (
      <div className="bc-report" data-testid="bc-detail">
        <EmptyState kind="line" title="This broadcast isn't in this workspace." body="The link may be old, or from another workspace." testid="bc-detail-gone" />
        <div>{close}</div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="bc-report" data-testid="bc-detail">
        <FailedRead kind="line" what="who got this broadcast" onRetry={() => { setRetrying(true); ask(); }} busy={retrying} testid="bc-detail-failed" />
        <div>{close}</div>
      </div>
    );
  }
  const b = d.broadcast;
  const ro = bcReachOutBlock(d, { sheet, acts, onClose, onDecided: ask }); if (ro) return ro;
  const vm = window.__broadcasts.report ? window.__broadcasts.report(d) : null;
  const avm = sheet && b.state === "pending_approval" && window.__broadcasts.approval ? window.__broadcasts.approval(d, sheet.playbook, sheet.businessName) : null;
  if (avm) {
    return (
      <div className="bc-report is-sheet" data-testid="bc-detail">
        <BcSheet d={d} people={vm ? vm.people : []} avm={avm} sheet={sheet} onClose={onClose} seeAll={seeAll} onSeeAll={() => setSeeAll((v) => !v)} />
      </div>
    );
  }
  const when = bcWhen(b.started_at || b.scheduled_for);
  const lang = b.template_language ? String(b.template_language).slice(0, 2).toUpperCase() : null;
  const shown = vm ? vm.people.filter((p) => p.in.includes(filter)) : [];
  return (
    <div className="bc-report" data-testid="bc-detail">
      <window.CmHead
        title={b.name}
        badge={<StatePill kind="broadcast" value={b.state} />}
        sub={(
          <>
            {when && <><span>{when}</span><window.CmDot /></>}
            {b.playbook_id
              ? <button type="button" className="bc-run-link" onClick={() => window.CHANLY.nav(`outbound/${b.playbook_id}`)}>{b.audience.label} playbook</button>
              : <span>{b.audience.label}</span>}
            <window.CmDot />
            <span className="tabular">{d.recipients.length} enrolled</span>
            <window.CmDot />
            <span className="mono bc-report-tpl">{b.template_name}{lang ? ` · ${lang}` : ""}</span>
          </>
        )}
        right={<>{acts}{again && again(b)}{close}</>}
      />
      {b.params.length > 0 && <div className="bc-report-values"><span className="cl-prof-aut-hint">Values: {b.params.map((p) => (p && p.kind && p.kind !== "text" ? ((window.__starters && window.__starters.sources || {})[p.kind] || p.kind).toLowerCase() : (p && p.value) || String(p))).join(" · ")}</span></div>}
      {vm && (
        <div className="bc-figs" data-testid="bc-figures">
          {vm.figures.map((f) => {
            const top = Math.max(...f.bars, 1);
            return (
              <div key={f.id} className="bc-fig" data-tone={f.tone} data-testid={`bc-fig-${f.id}`}>
                <span className="bc-fig-k">{f.label}</span>
                <span className="bc-fig-n"><span className="bc-fig-v tabular">{f.n}</span>{f.pct !== null && <span className="bc-fig-pct">{f.pct}%</span>}</span>
                <span className="bc-fig-bars" aria-hidden="true" title={`When they came, across ${vm.span}`}>{f.bars.map((v, i) => <span key={i} style={{ height: `${v > 0 ? Math.max(3, Math.round((v / top) * 16)) : 1}px` }} />)}</span>
                <span className="bc-fig-sub">{f.sub}</span>
              </div>
            );
          })}
        </div>
      )}
      {vm && (
        <div className="bc-report-body">
          <section className="bc-touched" data-testid="bc-touched">
            <div className="bc-touched-head">
              <span className="bc-card-title">Everyone it touched</span>
              <span className="bc-touched-filters" role="group" aria-label="Who to show">
                {BC_FILTERS.map(([k, label]) => (
                  <button key={k} type="button" className={`bc-touched-filter${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)} data-testid={`bc-touched-${k}`}>
                    {label} <span className="tabular">{vm.groups[k]}</span>
                  </button>
                ))}
              </span>
            </div>
            {shown.map(bcPersonRow)}
            {shown.length === 0 && <div className="bc-touched-none">{BC_FILTER_NONE[filter]}</div>}
          </section>
          <div className="bc-report-aside">
            {/* Why it stopped and what to do next, in the run's own words: a failed run never says "something went wrong". */}
            {vm.stop && (
              <section className="bc-card" data-testid="bc-stopped">
                <span className="bc-card-title">Why it stopped</span>
                <div className="bc-stop-box" data-tone={vm.stop.tone}>
                  <span className="bc-stop-dot" aria-hidden="true" />
                  <span className="bc-stop-text">
                    <span className="bc-stop-line" data-testid="bc-detail-failure">It stopped: <strong>{vm.stop.words}</strong>.</span>
                    {vm.stop.fix && <span className="bc-stop-fix">{vm.stop.fix}</span>}
                  </span>
                </div>
              </section>
            )}
            <section className="bc-card" data-testid="bc-back">
              <span className="bc-card-title">What came back</span>
              <p className="bc-card-lede">A broadcast does not hold a conversation. Every reply is a thread in the Inbox, and the receptionist answers it under its usual autonomy.</p>
              {vm.replies.length > 0
                ? (
                  <div className="bc-back-list">
                    {vm.replies.slice(0, BC_REPLIES_SHOWN).map((x) => (
                      <button key={x.contact_id} type="button" className="bc-back-row" disabled={!x.to} onClick={() => window.CHANLY.nav(x.to)} title={`${x.name} — open the thread`} data-testid="bc-reply">
                        <span className="bc-person-mark" aria-hidden="true">{x.initials}</span>
                        <span className="bc-back-text">
                          <span className="bc-back-quote">{x.quote || "A reply with no words in it"}</span>
                          <span className="bc-back-outcome" data-tone={x.outcome.tone}>{x.outcome.words}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )
                : <p className="bc-back-none">Nobody has written back yet. A reply lands in the Inbox the moment it comes.</p>}
              <button type="button" className="bc-back-all" onClick={() => window.CHANLY.nav("inbox")} data-testid="bc-back-inbox">
                {vm.replies.length > BC_REPLIES_SHOWN ? `${vm.replies.length - BC_REPLIES_SHOWN} more in the Inbox` : "Open the Inbox"} <Icon name="arrow-right" size={11} />
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

// A run's verbs: Approve for one waiting on a person, and the stop, armed and
// named for what it does -- stopping a send, skipping a run nobody approved and
// cancelling one still to come are three acts, and none of them is one click
// (the audit's D13). The same on a run's card and at the head of an opened run,
// where a run opened from Today is approved.
const BcRunVerbs = ({ row, canSend, armed, onArm, stopping, approving = false, approve, cancel }) => {
  const stop = bcStopWords(row.state);
  if (armed && canSend) return <Confirm question={stop.question(row)} detail={stop.detail} yes={stop.yes} danger busy={stopping} onYes={() => cancel(row)} onNo={() => onArm(false)} testid="bc-stop" />;
  return (
    <>
      {row.state === "pending_approval" && <button className="btn btn-sm btn-primary" disabled={approving} onClick={() => approve(row)} data-testid="bc-approve" {...(canSend || !window.gate ? {} : window.gate("approve", "approve a run"))}>{approving ? "Approving…" : "Approve the run"}</button>}
      {/* Named for what it does: Stop, Skip or Cancel -- never "Hold", which
          would promise a pause the act does not make. */}
      {canSend && BC_LIVE.has(row.state) && <button className="btn btn-sm danger" onClick={() => onArm(true)} data-testid="bc-stop">{stop.verb}</button>}
    </>
  );
};

// One run on the ledger: its name, its numbers, its state, and the verbs; Open
// opens its report, its own screen. Drawn on its own by confirm.test.mjs.
const BC_STOP_WORDS = {
  sending: { verb: "Stop", question: (row) => `Stop ${row.name}?`, detail: "Messages already out stay out; the rest do not go.", yes: "Yes, stop it" },
  pending_approval: { verb: "Skip", question: (row) => `Skip ${row.name}?`, detail: "Nothing sends, and the run closes.", yes: "Yes, skip it" },
  scheduled: { verb: "Cancel", question: (row) => `Cancel ${row.name}?`, detail: "Nothing will send.", yes: "Yes, cancel it" },
};

const bcStopWords = (state) => BC_STOP_WORDS[state] || BC_STOP_WORDS.scheduled;

// BcRunVerbs alone, as the run's report draws them for every run still open, is drawn on its own by confirm.test.mjs.
Object.assign(window, { BC_NONE, BC_LIVE, BcRunVerbs, BroadcastDetail });
