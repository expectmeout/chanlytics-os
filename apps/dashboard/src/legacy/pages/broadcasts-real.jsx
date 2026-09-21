/* global React, Icon, Confirm, EmptyState, FailedRead */
// Campaigns › Broadcasts, real: one approved template to the people who said
// yes. Same chrome as the seeded page (broadcasts.jsx); every number is a
// row's. Nothing here scores, estimates or invents: no credits, no revenue,
// no "booked from broadcasts" — the schema has no column for it.
//
// The audience chips carry the count of people who may receive an offer (a
// recorded yes and a number), computed by the same contracts predicate the
// route enrols with. The template is one WhatsApp approved; its values are
// typed here and the words a person will read are shown before anything is
// sent. Sends and cancels go through window.__broadcasts and the surface is
// re-fetched, so the Scheduled and History rows are the server's.

const useBroadcasts = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:broadcasts", bump);
    return () => window.removeEventListener("surface:broadcasts", bump);
  }, []);
  return window.__BROADCASTS;
};

const bcKey = (a) => `${a.kind}:${a.id || ""}`;
// Words for people: a starter's title, or the name with its underscores made spaces.
const bcTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));
const bcIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));
// The language a row goes out in, as a person reads it. A workspace holding the
// starter set in both languages has two rows per name, and the chips said the
// same words over each -- so the question asked before a send names the one it
// means. Empty when the library is not read: a guess is worse than nothing here.
const bcLangWords = (t) => (t && window.__starters && window.__starters.langWords ? ` (${window.__starters.langWords(t.language)})` : "");
// The library's order: starters first, then templates written here, then the rest.
const bcOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);
// What a broadcast opens on: the quick note when the workspace holds it, else the first.
const bcDefault = (list) => ((window.__starters ? window.__starters.defaultFor(list, null) : list[0]) || null);
// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
const bcFooter = (t) => (t && window.__starters && window.__starters.footer ? window.__starters.footer(t) : null);
// What fills a slot on a broadcast: the composers' words (contracts PARAM_SOURCE_LABELS) less a visit's time and
// service, which only a visit playbook's run carries for each person.
const bcSources = () => Object.fromEntries(Object.entries((window.__starters && window.__starters.sources) || { text: "Type it" }).filter(([k]) => !k.startsWith("visit_")));
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
const BroadcastDetail = ({ id, onClose, acts = null, again = null }) => {
  // The last answer, kept with the broadcast it answered for: a read of another id is not this one's.
  const [answer, setAnswer] = React.useState(null);
  const [asks, ask] = React.useReducer((n) => n + 1, 0);
  const [retrying, setRetrying] = React.useState(false);
  // Who "Everyone it touched" shows: everyone, or the ones who replied, were held back, or asked to stop.
  const [filter, setFilter] = React.useState("all");
  const mine = answer && answer.id === id ? answer : null;
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
  const vm = window.__broadcasts.report ? window.__broadcasts.report(d) : null;
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
            {shown.map((p) => (
              <div key={p.contact_id} className={`bc-person${p.attn ? " is-attn" : ""}${p.held ? " is-held" : ""}`} data-testid="bc-person">
                <span className="bc-person-mark" aria-hidden="true">{p.initials}</span>
                <button type="button" className="bc-person-name" onClick={() => window.CHANLY.nav(`clients/${p.contact_id}`)}>{p.name}</button>
                <span className="bc-person-pill" data-tone={p.pill.tone}>{p.pill.label}</span>
                <span className="bc-person-words">{p.words}</span>
                {p.door && <button type="button" className="bc-person-door" onClick={() => window.CHANLY.nav(p.door.to)}>{p.door.label}</button>}
                <span className="bc-person-at mono">{p.at || "—"}</span>
              </div>
            ))}
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

// When a send really goes, in one sentence for every receipt that has one. The
// server moves a send outside 9:00-20:59 by the business's clock to the next
// nine o'clock (moved_from set); an approve or a send says so, rather than
// "sending now" over a run that waits until morning.
const bcWhenWords = (d) => {
  const at = d && d.scheduled_for ? Date.parse(d.scheduled_for) : NaN;
  const when = Number.isNaN(at) ? null : window.__clock.when(at);
  if (d && d.moved_from && when) return `scheduled for ${when} — messages go out ${window.__clock.hours.between} by your clock`;
  if (when && at - Date.now() > 60_000) return `scheduled for ${when}`;
  return "sending now";
};
window.bcWhenWords = bcWhenWords;

// The schedule box, by the business's clock (window.__clock): 22:30 in the box is half past ten where the
// business is, whatever the device's zone. It holds the instant, so what is sent is what the note says, and
// it stops at now and at the ceiling the route keeps.
const BcWhenBox = ({ at, maxDays, onChange }) => {
  const C = window.__clock;
  const now = Date.now();
  return (
    <input
      className="bc-subject"
      type="datetime-local"
      value={at === null ? "" : C.inputValue(at)}
      min={C.inputValue(now)}
      max={C.inputValue(now + maxDays * 86_400_000)}
      onChange={(e) => onChange(C.fromInput(e.target.value))}
      aria-label={`When, by ${C.city()} time`}
      aria-describedby="bc-when-note"
      data-testid="bc-when"
    />
  );
};
window.BcWhenBox = BcWhenBox;

// What the box's time means before Schedule is pressed: when the send really goes, a time outside
// 9:00-20:59 moved to the next nine o'clock as the route will move it, and a time that has passed or is
// past the ceiling refused here rather than after the click.
const bcWhenNote = (at, maxDays) => {
  const C = window.__clock;
  const city = C.city();
  const now = Date.now();
  if (at === null) return { ok: false, tone: "", words: `By ${city} time · within ${maxDays} days` };
  if (at <= now) return { ok: false, tone: "warn", words: "That time has passed — pick a later one, or Send now" };
  const open = C.nextOpen(at);
  if (open.at > now + maxDays * 86_400_000) return { ok: false, tone: "warn", words: `Pick a time within ${maxDays} days` };
  return open.moved
    ? { ok: true, tone: "", words: `Goes out ${C.when(open.at)}, ${city} time — sends wait for ${C.hours.range}` }
    : { ok: true, tone: "", words: `Goes out ${C.when(at)}, ${city} time` };
};
window.bcWhenNote = bcWhenNote;

// Who the send really reaches, beside the chips that choose them.
//
// The count was already honest -- the chip carries it -- but a count is the one
// thing an owner cannot check. audiencePreview (contracts, broadcasts.ts) already
// names a handful of the pool and orders them on purpose: an ordinary person
// first, then the FIRST person with no name on file, because they are greeted
// "Hi there" and that is the case nobody has ever been shown; anyone held back
// comes last with the reason in the operator's own words. Those people were
// reachable only by stepping the preview's arrows, under the message, so the
// list nobody scrolled to was the list that answered "who exactly".
//
// The rows are the control and the bubble is the readout: pressing one walks the
// preview to that person, so the same press both scans and previews.
const BcAudience = ({ sample, people, who, onWho }) => {
  if (!sample || people.length === 0) return null;
  const pool = sample.sending + sample.held;
  const shownHeld = people.filter((p) => p.refusal).length;
  const rest = Math.max(0, sample.held - shownHeld);
  return (
    <div className="bc-who" data-testid="bc-who">
      <div className="bc-who-count">
        <span className="bc-who-n tabular">{sample.sending.toLocaleString()}</span>
        <span className="bc-who-of">of {pool.toLocaleString()} will get it</span>
      </div>
      <span className="bc-who-bar" aria-hidden="true">
        <span className="bc-who-bar-send" style={{ width: `${pool ? Math.round((sample.sending / pool) * 100) : 0}%` }} />
      </span>
      <div className="bc-who-list">
        {people.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`bc-who-row${i === who ? " on" : ""}${p.refusal ? " held" : ""}`}
            aria-pressed={i === who}
            onClick={() => onWho(i)}
            data-testid="bc-who-row"
          >
            <span className="bc-who-name">{p.label}</span>
            <span className="bc-who-why">
              {p.refusal || (p.firstName ? `Greeted “Hi ${p.firstName}”` : "No name on file — greeted “Hi there”")}
            </span>
          </button>
        ))}
      </div>
      {rest > 0 && <span className="bc-who-rest" data-testid="bc-who-rest">{rest} more held back, for the same reasons</span>}
    </div>
  );
};

// The history in ONE LINE above the work, the way Today, Reports and People say
// their numbers (#556, #557, #558). It was a three-cell stat strip under a page
// title the top bar already showed and a two-line sub-headline: 384px of a phone
// before the composer, and every number in it is also in Reports > Campaigns,
// which is where a number that wants a chart belongs.
// Past fifty broadcasts the route says older ones exist (more), and the line
// says its numbers are the latest fifty rather than reading as everything.
// A run a playbook made, rather than one a person sent. The column is on every
// row (broadcasts.playbook_id) and nothing drew it, so a playbook's automatic
// Tuesday run sat in this list beside Saturday's hand-sent blast with no way to
// tell them apart -- while Playbooks summed the same runs again on its own tab.
const bcByPlaybook = (r) => !!r.playbook_id;
const BC_ORIGINS = [["playbook", "by a playbook"], ["hand", "by hand"]];
const bcOrigin = (r) => (bcByPlaybook(r) ? "playbook" : "hand");

const BcHistoryStats = ({ rows, more, replyWindow = null, origin = null, onOrigin = null }) => {
  const history = (rows || []).filter((r) => !r.open);
  const messages = history.reduce((a, r) => a + r.counts.sent, 0);
  const delivered = history.reduce((a, r) => a + r.counts.delivered, 0);
  const replied = history.reduce((a, r) => a + r.counts.replied, 0);
  const sent = history.filter((r) => r.state === "sent").length;
  const dot = <span className="cm-standing-dot" aria-hidden="true">·</span>;
  // The split, and each count its own filter -- the way the Playbooks line's are.
  const byOrigin = BC_ORIGINS.map(([id, words]) => [id, words, history.filter((r) => bcOrigin(r) === id).length]).filter(([, , n]) => n > 0);
  const split = onOrigin && byOrigin.length > 1;
  return (
    <div className="cm-standing" data-testid="bc-standing">
      <span className="cm-standing-lead" data-tip="One approved template to the people who said yes. Replies land in the Inbox, where the receptionist answers them.">
        {sent === 0 ? "Nothing sent yet" : `${sent} ${sent === 1 ? "broadcast" : "broadcasts"} sent`}
      </span>
      {split && byOrigin.map(([id, words, n], i) => (
        <span className="cm-standing-part" key={id}>
          {i === 0 ? <span className="cm-standing-dash" aria-hidden="true">&mdash;</span> : <span className="cm-standing-comma" aria-hidden="true">,</span>}
          <button
            type="button"
            className={`cm-standing-tap ${origin === id ? "on" : ""}`}
            aria-pressed={origin === id}
            onClick={() => onOrigin(origin === id ? null : id)}
            data-testid={`bc-origin-${id}`}
          >
            <span className="tabular">{n}</span> {words}
          </button>
        </span>
      ))}
      {messages > 0 && (
        <span className="cm-standing-part">
          {dot}
          <span className="tabular" data-tip="Delivered or read, over sent — WhatsApp's own receipts">{messages.toLocaleString()} {messages === 1 ? "message" : "messages"}, {Math.round((delivered / messages) * 100)}% delivered</span>
        </span>
      )}
      {messages > 0 && (
        <span className="cm-standing-part">
          {dot}
          <span className="tabular" data-tip={replyWindow ? `Threads that heard from the customer ${replyWindow} of a broadcast` : "Threads that heard from the customer after a broadcast"}>{replied} {replied === 1 ? "reply" : "replies"} in the Inbox</span>
        </span>
      )}
      {more && <span className="cm-standing-part">{dot}<span>the latest 50 broadcasts</span></span>}
    </div>
  );
};
window.BcHistoryStats = BcHistoryStats;

/* ------------------------- the ledger, as the canvas draws it ------------------------- */

// Every run's state in the order that matters to the owner: what waits on them,
// what is to come, what is going out, what went and what did not. The tones are
// the vocabulary's (tone.ts) for each state; the words are this page's.
const BC_BANDS = [
  { id: "pending_approval", words: "waiting on you", tone: "warn" },
  { id: "scheduled", words: "scheduled", tone: "info" },
  { id: "sending", words: "sending", tone: "accent" },
  { id: "sent", words: "sent", tone: "ok" },
  { id: "failed", words: "failed", tone: "danger" },
];

/**
 * The band bar: every run on one bar, in its state's colour, and a legend that is
 * also the list's filter -- press "3 scheduled" and the runs under it are the three.
 * The same element Leads draws over its list. `summary` is what went out, at the right.
 */
const BcBand = ({ rows, band, onBand, summary = null }) => {
  const parts = BC_BANDS.map((b) => ({ ...b, n: rows.filter((r) => r.state === b.id).length })).filter((b) => b.n > 0);
  if (!parts.length) return null;
  return (
    <div className="bc-band" data-testid="bc-band">
      <div className="bc-band-bar" aria-hidden="true">
        {parts.map((b) => <span key={b.id} data-tone={b.tone} style={{ flexGrow: b.n }} />)}
      </div>
      <div className="bc-band-legend">
        {parts.map((b) => (
          <button key={b.id} type="button" className={`bc-band-part${band === b.id ? " on" : ""}`} data-tone={b.tone} aria-pressed={band === b.id} onClick={() => onBand(band === b.id ? null : b.id)} data-testid={`bc-band-${b.id}`}>
            <span className="bc-band-n tabular">{b.n}</span> {b.words}
          </button>
        ))}
        <span className="bc-band-spacer" />
        {summary}
      </div>
    </div>
  );
};

// Where an instant falls on the week's grid, by the business's clock: its day, and
// how far across the sending hours (9:00 to 21:00) it is.
const bcAt = (ms) => {
  const c = window.__clock;
  const v = c && c.inputValue ? c.inputValue(ms) : new Date(ms).toISOString().slice(0, 16);
  const [day, hm] = v.split("T");
  const [h, m] = (hm || "0:0").split(":").map(Number);
  const min = c && c.hours ? c.hours.min : 9;
  return { day, x: Math.max(0, Math.min(100, ((h + m / 60 - min) / 12) * 100)) };
};
const bcWeekday = (day, i) => (i === 0 ? "Today" : new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }));
const BC_WEEK_TONE = { pending_approval: "warn", scheduled: "info", sending: "accent", sent: "ok", failed: "danger" };

/**
 * The week ahead: a row per day, a bar per run at the hour it goes, inside the
 * sending hours -- nothing sends outside 9:00-20:59, and a run that would waits
 * for the next morning, so the grid IS the hours a send can happen in. Runs already
 * on the ledger are drawn where they sit; a running playbook's runs to come are
 * drawn at its hour when the Playbooks surface has been read. The line on today is
 * now.
 */
const BcWeek = ({ rows, now }) => {
  const c = window.__clock;
  const today = c && c.dayKey ? c.dayKey(now) : new Date(now).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => (c && c.dayKey ? c.dayKey(now + i * 86_400_000) : new Date(now + i * 86_400_000).toISOString().slice(0, 10)));
  const blocks = Object.fromEntries(days.map((d) => [d, []]));
  // Runs on the ledger: to come, going out, and today's that went.
  for (const r of rows) {
    const at = r.scheduled_for ? Date.parse(r.scheduled_for) : NaN;
    if (!Number.isFinite(at)) continue;
    const { day, x } = bcAt(at);
    if (!blocks[day] || (r.state === "sent" && day !== today) || r.state === "canceled") continue;
    // A mark at the hour it goes. How long a send takes is not on the ledger, and a
    // bar as long as a guess would say more than the page knows.
    blocks[day].push({ id: r.id, name: r.name, x, w: 2.5, tone: BC_WEEK_TONE[r.state] || "info", playbook: r.playbook_id || null });
  }
  // A running playbook's runs to come, at its hour, every day it runs -- where the
  // ledger does not already hold that day's run.
  const pbs = window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.rows) ? window.__PLAYBOOKS.rows : [];
  for (const p of pbs) {
    if (p.state !== "running" || p.trigger === "everyone_monthly") continue;
    days.forEach((d, i) => {
      if (i === 0 && p.last_run_for === today) return;
      if (blocks[d].some((b) => b.playbook === p.id)) return;
      const x = Math.max(0, Math.min(100, ((p.run_hour - ((c && c.hours && c.hours.min) || 9)) / 12) * 100));
      blocks[d].push({ id: `${p.id}:${d}`, name: p.name, x, w: 2.5, tone: "plain", playbook: p.id, projected: true });
    });
  }
  const nowX = bcAt(now).x;
  const hours = c && c.hours ? [c.hours.min, c.hours.min + 3, c.hours.min + 6, c.hours.min + 9, c.hours.min + 12] : [9, 12, 15, 18, 21];
  return (
    <div className="bc-week" data-testid="bc-week">
      <div className="bc-week-head">
        <span className="bc-week-k">The week ahead</span>
        <span className="bc-week-note">nothing sends outside {c && c.hours ? c.hours.range : "9:00–20:59"} — a run that would waits for the next morning</span>
      </div>
      <div className="bc-week-axis" aria-hidden="true">
        <span className="bc-week-day" />
        <span className="bc-week-hours">{hours.map((h) => <span key={h}>{h}:00</span>)}</span>
        <span className="bc-week-say" />
      </div>
      {days.map((d, i) => {
        const bs = blocks[d];
        const live = bs.filter((b) => !b.projected);
        const say = i === 0 && bs.some((b) => b.tone === "accent") ? "sending now"
          : bs.length === 0 ? "—"
          : bs.length === 1 ? bs[0].name
          : `${bs.length} runs`;
        return (
          <div key={d} className={`bc-week-row${i === 0 ? " is-today" : ""}`} data-testid="bc-week-day">
            <span className="bc-week-day">{bcWeekday(d, i)}</span>
            <span className="bc-week-track">
              {bs.map((b) => <span key={b.id} className={`bc-week-run${b.projected ? " is-projected" : ""}`} data-tone={b.tone} style={{ left: `${b.x}%`, width: `${b.w}%` }} title={b.name} />)}
              {i === 0 && nowX > 0 && nowX < 100 && <span className="bc-week-now" style={{ left: `${nowX}%` }} aria-hidden="true" />}
            </span>
            <span className="bc-week-say" title={live.length !== bs.length ? "Including a playbook's run to come, at its hour" : undefined}>{say}</span>
          </div>
        );
      })}
    </div>
  );
};

// The minutes until a run goes, while it is under an hour away: the one thing on a
// card that changes as you look at it, in the accent, because it is happening.
const bcSoon = (row, now) => {
  if (row.state !== "scheduled" || !row.scheduled_for) return null;
  const ms = Date.parse(row.scheduled_for) - now;
  if (!(ms > 0 && ms < 3_600_000)) return null;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * One run on the ledger, as the canvas draws it: what it is and its state; what
 * sent it, to whom, with what; who it reaches, out of how many, with who it held
 * back; and the acts it has. It opens in place into its detail -- everyone it
 * touched, and why a run stopped. A run waiting on the owner has the urgency edge
 * (legacy/CLAUDE.md: urgency is the accent left edge) and its Approve first.
 */
// `renderDetail` draws the detail when the card is open -- a function, not an element, so a closed card
// never mounts a detail that would read the run's recipients for nothing.
const BcRunCard = ({ row, canSend, onOpen, armed, onArm, stopping, approving = false, approve, cancel, now }) => {
  const byPb = bcByPlaybook(row);
  const pb = byPb && window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.rows) ? window.__PLAYBOOKS.rows.find((p) => p.id === row.playbook_id) : null;
  const waiting = row.state === "pending_approval";
  const sending = row.state === "sending";
  const soon = bcSoon(row, now);
  const lang = row.template_language ? String(row.template_language).slice(0, 2).toUpperCase() : null;
  const done = row.counts.sent + row.counts.skipped + row.counts.failed;
  const held = row.counts.skipped + row.counts.failed;
  // Open is the run's state, not a flag the row may not carry: to come, waiting, or going out.
  const live = BC_LIVE.has(row.state);
  const finished = !live;
  // Who it reaches: to come, the people it holds; going out, how far it has got;
  // gone, how many it sent out of those it was for, with the rest named.
  const will = finished || sending ? row.counts.sent : row.recipient_count;
  const pool = Math.max(row.recipient_count, will + held);
  const reasons = sending ? [{ t: `${done} of ${row.recipient_count} done`, tone: "plain" }]
    : finished ? [
      row.counts.skipped > 0 && { t: `${row.counts.skipped} held back`, tone: "warn" },
      row.counts.failed > 0 && { t: `${row.counts.failed} never went through`, tone: "warn" },
      row.state === "failed" && row.failureLabel && { t: row.failureLabel, tone: "warn" },
      !held && row.state !== "failed" && { t: `${row.counts.delivered || 0} delivered · ${row.counts.replied || 0} ${row.counts.replied === 1 ? "reply" : "replies"}`, tone: "plain" },
    ].filter(Boolean)
    : [];
  const inner = (
    <>
      <div className="bc-run-line">
        <span className="bc-run-mark" data-tone={waiting ? "warn" : sending || soon ? "accent" : "plain"} aria-hidden="true"><Icon name={byPb ? "repeat" : "send"} size={16} /></span>
        <div className="bc-run-what">
          <div className="bc-run-titles">
            <button type="button" className="bc-run-name" onClick={onOpen} data-testid="bc-open-who">{row.name}</button>
            <StatePill kind="broadcast" value={row.state} label={row.stateLabel} />
            {pb && <PolicyChip cls={pb.policy_class} />}
          </div>
          <div className="bc-run-sub">
            {byPb
              ? <>Playbook · <button type="button" className="bc-run-link" onClick={() => window.CHANLY.nav(`outbound/${row.playbook_id}`)} data-testid="bc-history-playbook">{row.audience.label}</button></>
              : <>Broadcast · {row.audience.label}</>}
            {" · "}<span className="mono">{row.template_name}</span>{lang ? ` · ${lang}` : ""} · {row.when}
          </div>
        </div>
        <div className="bc-run-reach">
          <window.CmReach will={will} pool={pool} held={finished ? held : 0} reasons={reasons} size="sm" progress={sending ? row.progress || 0 : null} label={`${row.name}, sent so far`} />
        </div>
        <div className="bc-run-acts">
          {soon && <span className="bc-run-soon tabular" data-testid="bc-soon" title="Until it goes">{soon}</span>}
          <BcRunVerbs row={row} canSend={canSend} armed={armed} onArm={onArm} stopping={stopping} approving={approving} approve={approve} cancel={cancel} />
          {!(armed && canSend) && <button className="btn btn-sm" onClick={onOpen}>Open</button>}
        </div>
      </div>
    </>
  );
  const cls = `bc-run${waiting ? " is-urgent" : ""}`;
  // Gone or not, by its state: a run to come or going out is "open", one gone is history.
  return finished
    ? <div className={cls} id={`bc-run-${row.id}`} data-testid="bc-history" data-state={row.state}>{inner}</div>
    : <div className={cls} id={`bc-run-${row.id}`} data-testid="bc-open" data-state={row.state}>{inner}</div>;
};
window.BcRunCard = BcRunCard;

const BroadcastsReal = ({ initialSegment = null, initialRun = null, initialYes = false }) => {
  const data = useBroadcasts();
  const [toastNode, flash] = window.usePPToast();
  // Who may send, approve or stop: the role store's answer, View-as included.
  const canSend = !!(window.canDo && window.canDo("approve"));
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  // Only what this product can actually put on the wire. `sendTemplate` sends the
  // body alone, so a template needing a value in a heading or a button is refused
  // by Meta for EVERY recipient -- and the composer used to offer it, pass its own
  // "every slot filled" check, and enrol them all.
  const offered = React.useMemo(() => (window.__starters && window.__starters.sendable
    ? window.__starters.sendable((data.templates || BC_NONE).slice().sort(bcOrder))
    : { sendable: (data.templates || BC_NONE).slice().sort(bcOrder), blocked: BC_NONE, why: null }), [data.templates]);
  const templates = offered.sendable;
  const [aud, setAud] = React.useState(() => {
    const first = audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment) || audiences[0];
    return first ? bcKey(first) : "everyone:";
  });
  // The composer is its own screen, opened by New broadcast -- and by a link that
  // names a list ("Broadcast to this list" on People), which is asking to write one.
  const [writing, setWriting] = React.useState(!!initialSegment);
  // The shell keeps this page mounted across its own links, so it follows them: a later link to a list picks that
  // list, and a link to a run, which names no list, leaves the audience where it was. Only a new link moves it: the
  // surface re-reading its audiences does not undo a choice made on the page.
  const followed = React.useRef(initialSegment);
  React.useEffect(() => {
    if (followed.current === initialSegment) return;
    followed.current = initialSegment;
    const next = initialSegment && audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment);
    if (next) setAud(bcKey(next));
    if (initialSegment) setWriting(true);
  }, [initialSegment, audiences]);
  const [tplId, setTplId] = React.useState(() => { const d = bcDefault(templates); return d ? d.id : ""; });
  const [params, setParams] = React.useState({});
  const [sources, setSources] = React.useState({});
  const [composing, setComposing] = React.useState(false);
  const [name, setName] = React.useState("");
  const [whenAt, setWhenAt] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  // Which of the audience's people the preview is showing.
  const [who, setWho] = React.useState(0);
  // Which half of the history is in view: a playbook's runs, the ones sent by
  // hand, or both. Null is both.
  const [origin, setOrigin] = React.useState(null);
  // The band the list is filtered to (a state), or none: everything open and the latest gone.
  const [band, setBand] = React.useState(null);
  // Now, for the minutes until a run goes: ticking only while a run is under an hour away.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const at = Date.now();
    const soon = (data.rows || []).some((r) => r.state === "scheduled" && r.scheduled_for && Date.parse(r.scheduled_for) > at && Date.parse(r.scheduled_for) - at < 3_600_000);
    if (!soon) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [data.rows]);
  // Whether Send now has been pressed once and is asking. A question about one
  // template and one audience cannot be answered for another, so changing either
  // puts the button back.
  const [armed, setArmed] = React.useState(false);
  // The broadcast open on the page is the one its link names (broadcasts/run:<id>); Open on a run follows that link,
  // and its report is its own screen, as the send is.
  const openId = initialRun;
  const openRun = (id) => window.CHANLY.nav(id ? `broadcasts/run:${id}` : "broadcasts");
  // A link lands on its run: its report brought into view when the page it replaced was scrolled past where it opens.
  React.useEffect(() => {
    const el = openId && typeof document !== "undefined" && document.getElementById ? document.getElementById(`bc-run-${openId}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [openId]);
  // broadcasts/get-yes: the section that answers "nobody has said yes to
  // offers", brought into view -- it sits under the composer, where a person
  // sent here to find the QR would otherwise have to scroll for it.
  React.useEffect(() => {
    if (!initialYes || typeof document === "undefined") return;
    const el = document.getElementById("bc-optin");
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
  }, [initialYes]);
  // The row whose stop is armed, and the one whose stop is on its way.
  const [armId, setArmId] = React.useState(null);
  const [stopping, setStopping] = React.useState(null);
  const [addingStarters, setAddingStarters] = React.useState(false);
  // Starters in review at WhatsApp: the honest line while nothing is approved yet.
  const starterPending = (window.__TEMPLATES_ALL || BC_NONE).filter((t) => bcIsStarter(t.name) && t.meta_status === "pending").length;
  React.useEffect(() => {
    const d = bcDefault(templates);
    if (!templates.some((t) => t.id === tplId) && d) setTplId(d.id);
  }, [templates, tplId]);
  // The armed question names a template and an audience: change either and it is
  // no longer the question that was asked.
  React.useEffect(() => { setArmed(false); setWho(0); }, [tplId, aud]);

  const active = audiences.find((a) => bcKey(a) === aud) || audiences[0] || null;
  // The template comes BEFORE the counts now, because the counts depend on it.
  //
  // An audience has two sizes, not one: a `utility` template reaches everybody who
  // said yes to hearing from the business, a marketing one reaches only those who
  // separately said yes to offers. The chip used to show a single number computed
  // before any template was picked, which meant the composer promised an audience
  // the enrolment route would then refuse. `purpose` is stamped on each template by
  // the bridge from Meta's own category, so the page never decides it.
  const tpl = templates.find((t) => t.id === tplId) || null;
  const purpose = (tpl && tpl.purpose) || "marketing";
  const sizeOf = (a) => (a && a.counts ? (a.counts[purpose] || 0) : 0);
  const activeCount = sizeOf(active);
  const number = data.number || null;
  const numberOk = !!(number && number.present && number.health.canSend);
  const overLimit = !!(active && number && number.health.limitPerDay !== null && activeCount > number.health.limitPerDay);
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  const SRC = bcSources();
  // A starter's slots come filled in; a template written elsewhere gets a
  // guess from its labels. A booking link the workspace has not set falls
  // back to typed text, so nothing is offered that cannot be sent.
  const defaults = tpl && window.__starters ? window.__starters.slotKinds(tpl).map((k) => ((k === "booking_link" && !data.bookingLink) || k.startsWith("visit_") ? "text" : k)) : BC_NONE;
  const srcOf = (i) => ((sources[tplId] || defaults)[i] || "text");
  const exampleOf = (kind) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (data.businessName || "the business") : kind === "booking_link" ? "your booking link" : "");
  // Each slot's words: a starter's own, else the labels the row carries.
  const labels = tpl && window.__starters ? window.__starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const typed = vars.map((v, i) => ((params[tplId] || [])[i] || ""));
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))));
  // The preview shows an unfilled slot by its name, never as {{n}}.
  const previewValues = vars.map((v, i) => (srcOf(i) === "text" ? (typed[i].trim() || `[${labels[i]}]`) : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? typed[i].trim() : { kind: srcOf(i) }));
  const ready = !!tpl && !!active && activeCount > 0 && filled.every((v) => String(v).trim()) && !busy && numberOk && !overLimit;
  const shown = previewValues.map((v) => String(v).trim());
  // Who the preview is drawing it for. The bridge keeps a handful of the rows the
  // count is a length of; a surface cached before they were published has none,
  // and then the composer shows the example values as it always did.
  const sample = (active && active.preview && active.preview[purpose]) || null;
  const people = sample ? sample.people : BC_NONE;
  const person = people.length ? people[Math.min(who, people.length - 1)] : null;
  // What this person really reads. A first-name slot takes THEIR name, and the
  // words the wire uses when nobody has one -- "Hi there" (contracts
  // resolveParams) -- had never been shown to anybody before a send.
  const forPerson = !person ? shown : vars.map((v, i) => (srcOf(i) === "first_name" ? (person.firstName || "there") : shown[i]));
  const noName = !!person && !person.refusal && !person.firstName;
  const personNote = !person ? null
    : person.refusal ? person.refusal
    : noName ? "No first name on file, only a number — the message opens “Hi there”."
    : null;
  // When the message really lands, for the stamp on it: the box's time, or now,
  // moved to the next nine o'clock exactly as the route moves it (bcWhenNote).
  const goesAt = window.__clock ? window.__clock.nextOpen(whenAt === null ? Date.now() : whenAt).at : null;
  // A surface cached before the ceiling was published carries none; the route's is thirty days.
  const maxDays = data.scheduleMaxDays || 30;
  const whenNote = bcWhenNote(whenAt, maxDays);

  const rows = data.rows || [];
  const open = rows.filter((r) => r.open);
  const history = rows.filter((r) => !r.open);
  const shownHistory = origin ? history.filter((r) => bcOrigin(r) === origin) : history;

  const submit = async (scheduled) => {
    if (!window.__broadcasts || !ready || !canSend) return;
    setBusy(true);
    const r = await window.__broadcasts.send({
      template_id: tpl.id,
      params: specs,
      audience: { kind: active.kind, id: active.id },
      scheduled_for: scheduled && whenAt !== null ? new Date(whenAt).toISOString() : null,
      name: name.trim() || null,
    });
    setBusy(false);
    setArmed(false);
    if (!r.ok) { flash({ tone: "danger", msg: <>{r.message}</> }); return; }
    setName("");
    setWhenAt(null);
    // Sent, the screen closes onto the ledger, where the run now is -- and "See who" opens it.
    setWriting(false);
    const n = r.data.recipient_count;
    // Outside nine to twenty by the business's clock the send moved to the next
    // nine o'clock: the receipt says when it really goes (bcWhenWords).
    const words = bcWhenWords(r.data);
    // The one door out, offered where the send is announced rather than 400px
    // down the page. It is not an Undo and is not called one: a message already
    // out stays out, which is what the row's own Stop says, so the toast carries
    // the same verb and the same promise. A scheduled run has sent nothing yet.
    const waits = words !== "sending now";
    flash({
      msg: <><b>{r.data.name || "Broadcast"}</b> · {n} {n === 1 ? "person" : "people"} — {words === "sending now" && data.chunk ? `sending now, ${data.chunk} at a time` : words}</>,
      action: canSend ? { label: waits ? "Cancel it" : "Stop it", onClick: () => cancel({ id: r.data.id, name: r.data.name || "Broadcast", state: waits ? "scheduled" : "sending" }) } : null,
      links: [{ label: "See who", to: `broadcasts/run:${r.data.id}` }],
    });
  };
  const addStarters = async () => {
    if (!window.__templates || !window.__templates.addStarters || addingStarters) return;
    setAddingStarters(true);
    const r = await window.__templates.addStarters({ languages: ["en_US"] });
    setAddingStarters(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <>{window.starterWords ? window.starterWords(r.data) : "Added"}</> : <>{r.message}</> });
  };
  const cancel = async (row) => {
    if (!window.__broadcasts || stopping || !canSend) return;
    setStopping(row.id);
    const r = await window.__broadcasts.cancel(row.id);
    setStopping(null);
    setArmId(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{row.name}</b> {r.data.was === "sending" ? "stops after this batch" : r.data.was === "pending_approval" ? "skipped — nothing will send" : "canceled — nothing will send"}</> : <>{r.message}</> });
  };
  // One approve at a time: a second press while the first is out would be refused by the server, so the button says
  // it is approving instead, and the guard holds before the button has drawn that.
  const approvingRef = React.useRef(null);
  const [approving, setApproving] = React.useState(null);
  const approve = async (row) => {
    if (!window.__broadcasts || !canSend || approvingRef.current) return;
    approvingRef.current = row.id;
    setApproving(row.id);
    const r = await window.__broadcasts.approve(row.id);
    approvingRef.current = null;
    setApproving(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: r.ok ? <><b>{row.name}</b> approved — {r.data.recipient_count} {r.data.recipient_count === 1 ? "person" : "people"}, {bcWhenWords(r.data)}</> : <>{r.message}</> });
  };

  // The list under the band: a band's runs when one is pressed; else everything
  // open -- what waits on you first, then what is going out, then what is to come
  // -- and the latest five gone, with the way to the rest.
  const RANK = { pending_approval: 0, sending: 1, scheduled: 2 };
  const openRows = open.slice().sort((a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) || String(a.scheduled_for || "").localeCompare(String(b.scheduled_for || "")));
  const recent = shownHistory.slice(0, 5);
  const runs = band ? rows.filter((r) => r.state === band && (r.open || !origin || bcOrigin(r) === origin)) : [...openRows, ...recent];
  const sentN = rows.filter((r) => r.state === "sent").length;
  const waitingN = rows.filter((r) => r.state === "pending_approval").length;
  const runCard = (row) => (
    <BcRunCard
      key={row.id}
      row={row}
      canSend={canSend}
      now={now}
      onOpen={() => openRun(row.id)}
      armed={armId === row.id}
      onArm={(on) => setArmId(on ? row.id : null)}
      stopping={stopping === row.id}
      approving={approving === row.id}
      approve={approve}
      cancel={cancel}
    />
  );
  // The run open on its own screen, when the list holds it: its verbs go at the head of its report. A run older than
  // the newest fifty is read by its id alone, and has finished.
  const openRow = openId ? rows.find((r) => r.id === openId) || null : null;
  // Send it again: the send screen, filled with what this run sent -- its template, its list and its values -- when
  // all three can still go. A template WhatsApp no longer approves, a list since deleted, or a playbook's run (whose
  // playbook sends it again) offers no button rather than a composer quietly filled with something else.
  const againFor = (b) => {
    if (!canSend || b.playbook_id) return null;
    const t = templates.find((x) => x.id === b.template_id);
    const a = audiences.find((x) => bcKey(x) === bcKey(b.audience || {}));
    if (!t || !a) return null;
    const offered = Object.keys(SRC).filter((k) => k !== "booking_link" || data.bookingLink);
    const kinds = (b.params || []).map((p) => (p && offered.includes(p.kind) ? p.kind : "text"));
    const typedBack = (b.params || []).map((p, i) => (kinds[i] === "text" && p && p.kind === "text" ? p.value : ""));
    return (
      <button
        className="btn"
        data-testid="bc-again"
        onClick={() => {
          setAud(bcKey(a));
          setTplId(t.id);
          setSources((x) => ({ ...x, [t.id]: kinds }));
          setParams((x) => ({ ...x, [t.id]: typedBack }));
          setName("");
          setWhenAt(null);
          setWriting(true);
          openRun(null);
        }}
        {...window.gate("approve", "send a broadcast")}
      >
        Send it again
      </button>
    );
  };

  return (
    <div className={`bc-page${openId ? " is-report" : ""}`} data-testid="broadcasts-real">
      <div className="bc-body">
      {/* A run, opened: its report on a screen of its own, whether the list holds it or it is older than the list. */}
      {openId ? (
        <section className="bc-run-solo" id={`bc-run-${openId}`} data-testid="bc-run-solo">
          <BroadcastDetail
            id={openId}
            onClose={() => openRun(null)}
            acts={openRow && BC_LIVE.has(openRow.state)
              ? <BcRunVerbs row={openRow} canSend={canSend} armed={armId === openRow.id} onArm={(on) => setArmId(on ? openRow.id : null)} stopping={stopping === openRow.id} approving={approving === openRow.id} approve={approve} cancel={cancel} />
              : null}
            again={againFor}
          />
        </section>
      ) : null}

      {/* Three questions, side by side -- who, what, when -- and the one act that
          cannot be taken back alone at the foot. As a single column, the audience,
          the words and the send button never appeared on the same screen: an owner
          scrolled past the preview to reach Send, which is the wrong direction of
          travel for the only irreversible control on the surface. */}
      {openId ? null : writing ? (
      <section className="bc-composer bc-send" data-testid="bc-composer">
        {/* The one screen in Campaigns that cannot be undone, opened on its own:
            who, what and when at once, with the people named rather than counted,
            and the send alone at the foot. */}
        <window.CmHead
          title="New broadcast"
          sub="Who, what and when on one screen — and the people it reaches, by name. Replies land in the Inbox, where the receptionist answers them."
          right={<button className="btn btn-ghost" onClick={() => { setWriting(false); setArmed(false); }} data-testid="bc-compose-close">Cancel</button>}
        />
        {composing && window.TemplateComposer && (
          <window.TemplateComposer
            businessName={data.businessName}
            onCancel={() => setComposing(false)}
            onDone={(made) => { setComposing(false); flash({ msg: <><b>{made.name}</b> submitted — WhatsApp reviews it; it appears here once approved</> }); }}
          />
        )}
        <div className="bc-cols">

          <div className="bc-col" data-testid="bc-col-who">
            <span className="bc-col-label">Who <span className="bc-col-sub">a list that keeps itself current</span></span>
            <div className="bc-chips" style={{ flexWrap: "wrap" }}>
              {audiences.map((a) => (
                <button key={bcKey(a)} className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")} onClick={() => setAud(bcKey(a))} title={a.hint} data-testid="bc-audience">
                  {a.label} <span className="bc-chip-count tabular">{sizeOf(a)}</span>
                </button>
              ))}
              {data.listsRead === false && <FailedRead kind="line" what="your saved lists" body="The built-in audiences are current; the lists you keep by hand are missing until they read." surface="broadcasts" testid="bc-lists-failed" />}
            </div>
            <BcAudience sample={sample} people={people} who={who} onWho={setWho} />
            <div className="bc-meta">
              <Icon name="shield" size={11} />
              <span>
                {active
                  ? `${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}” said yes${purpose === "marketing" ? " to offers" : " to messages"}`
                  : "Pick who this goes to"}
                {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire{data.chunk ? ` · sent ${data.chunk} at a time` : ""}
              </span>
            </div>
            {/* Said once, here, where an offer is picked: why a customer who only ever
                texted is not in an offer's count. The wire refuses per customer
                (sms_carries_no_promotions); the page states the rule. */}
            {purpose === "marketing" && data.offersNote && <div className="bc-excl-hint" data-testid="bc-offers-note">{data.offersNote}</div>}
            {overLimit && active && number && (
              <div className="bc-excl-hint" data-testid="bc-over-limit">This number can start up to {number.health.limitPerDay.toLocaleString()} new conversations a day; “{active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.</div>
            )}
            {canSend && active && activeCount === 0 && (
              <div className="bc-excl-hint" data-testid="bc-nobody">
                {purpose === "marketing"
                  ? <>Nobody on “{active.label}” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile, or get their yes with the phrase and QR below.</>
                  : <>Nobody on “{active.label}” has said yes to messages yet. Record it on their profile, or get their yes with the phrase and QR below.</>}
              </div>
            )}
          </div>

          <div className="bc-col bc-col-what" data-testid="bc-col-what">
            <span className="bc-col-label">What <span className="bc-col-sub">as a customer receives it, one person at a time</span></span>
            <div className="bc-chips" style={{ flexWrap: "wrap" }}>
              {!templatesRead && <FailedRead kind="line" what="your templates" surface="broadcasts" testid="bc-templates-failed" />}
              {templatesRead && templates.length === 0 && (
                <span className="bc-excl-hint" data-testid="bc-no-template">
                  {starterPending > 0
                    ? `Your starter templates are in review at WhatsApp (${starterPending}) — they appear here once approved, usually within minutes.`
                    : <>No approved template yet — add the starter set, write one here, or sync yours from WhatsApp Manager in <button className="cl-bucket-link" onClick={() => window.CHANLY.nav("messages")} data-testid="bc-no-template-open">Templates</button>.</>}
                </span>
              )}
              {templatesRead && templates.length === 0 && starterPending === 0 && window.__templates && window.__templates.addStarters && (
                <button className="bc-chip" disabled={addingStarters} onClick={addStarters} data-testid="bc-add-starters" {...window.gate("approve", "add the starter set")}><Icon name="sparkle" size={10} /> {addingStarters ? "Adding…" : "Add the starter set"}</button>
              )}
              <window.TemplateChips templates={templates} value={tplId} onPick={setTplId} testid="bc-template" />
              {window.TemplateComposer && (
                <button className="bc-chip" onClick={() => setComposing((c) => !c)} data-testid="bc-new-template" {...window.gate("approve", "write a template")}><Icon name="plus" size={10} /> New template</button>
              )}
            </div>
            {offered.why && <div className="bc-excl-hint warn" data-testid="bc-blocked">{offered.why}</div>}
            {tpl && vars.length > 0 && (
              <div className="bc-vars" data-testid="bc-vars">
                {vars.map((v, i) => (
                  <label key={v.position || i} className="bc-var">
                    <span className="bc-var-label">{labels[i]}</span>
                    <span className="bc-var-row">
                      <select
                        className="tpl-select"
                        value={srcOf(i)}
                        data-testid="bc-var-source"
                        onChange={(e) => setSources((s) => { const next = [...(s[tplId] || [])]; next[i] = e.target.value; return { ...s, [tplId]: next }; })}
                      >
                        {Object.keys(SRC).filter((k) => k !== "booking_link" || data.bookingLink).map((k) => <option key={k} value={k}>{SRC[k]}</option>)}
                      </select>
                      <input
                        value={srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))}
                        disabled={srcOf(i) !== "text"}
                        placeholder={v.example || ""}
                        onChange={(e) => setParams((p) => { const next = [...(p[tplId] || [])]; next[i] = e.target.value; return { ...p, [tplId]: next }; })}
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
            {tpl && (
              <div className="bc-preview-wrap" data-testid="bc-preview">
                <window.MessagePreview from={data.businessName} body={tpl.body_preview} values={forPerson} header={tpl.header} footer={bcFooter(tpl)} buttons={tpl.buttons} at={goesAt} held={person ? person.refusal : null}>
                  <window.PreviewStepper
                    people={people.map((x, i) => ({ label: x.label, position: x.refusal ? "held back" : `${i + 1} of ${sample.sending}` }))}
                    index={Math.min(who, Math.max(people.length - 1, 0))}
                    onStep={setWho}
                    note={personNote}
                    tone={person && (person.refusal || noName) ? "warn" : null}
                  />
                </window.MessagePreview>
              </div>
            )}
          </div>

          <div className="bc-col" data-testid="bc-col-when">
            <span className="bc-col-label">When <span className="bc-col-sub">by your clock, inside the sending hours</span></span>
            <BcWhenBox at={whenAt} maxDays={maxDays} onChange={setWhenAt} />
            <div id="bc-when-note" className={`bc-excl-hint${whenNote.tone === "warn" ? " bc-when-note-warn" : ""}`} data-testid="bc-when-note">{whenNote.words}</div>
            {number && (
              <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
                <Icon name="chat" size={11} />
                <span>{number.present ? `WhatsApp ${number.display || ""} · ${number.health.label}` : "No WhatsApp number connected — connect one in Settings › Connections."}</span>
              </div>
            )}
            {number && number.present && !number.health.canSend && <div className="bc-excl-hint" data-testid="bc-number-refusal">{number.health.refusal}</div>}
          </div>
        </div>

        <div className="bc-foot">
          <input className="bc-subject" type="text" placeholder="Name this broadcast (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          {/* Stop, Skip and Cancel stay with the roles that may press them; the page says why once, in the gate's words. */}
          {!canSend && <div className="bc-excl-hint" data-testid="bc-role">{window.gateTitle("approve", "stop or cancel a broadcast")}</div>}
          <span className="bc-actions-spacer" />
          <div className="bc-actions">
            {/* Schedule stays one press: a scheduled run is cancelled from the row above,
                and nothing has left. Send now does not -- it is the only act on this
                surface that cannot be taken back, and it was the only one that was not
                armed, while Stop, Skip and both Deletes each ask first. */}
            {!armed && <button className="btn bc-send-later" disabled={!ready || !whenNote.ok} onClick={() => submit(true)} {...window.gate("approve", "schedule a broadcast")}>Schedule it</button>}
            {!armed && <button className="btn btn-primary bc-send-now" disabled={!ready} onClick={() => setArmed(true)} data-testid="bc-send" {...window.gate("approve", "send a broadcast")}><Icon name="send" size={13} /> {active && activeCount > 0 ? `Send to ${activeCount} now` : "Send now"}</button>}
            {armed && tpl && active && (
              <Confirm
                question={`Send “${bcTitle(tpl.name)}”${bcLangWords(tpl)} to ${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}”?`}
                detail={`It goes out now${data.chunk ? `, ${data.chunk} at a time` : ""}. A message already delivered cannot be taken back.`}
                yes="Yes, send it"
                busy={busy}
                onYes={() => submit(false)}
                onNo={() => setArmed(false)}
                testid="bc-send"
              />
            )}
          </div>
        </div>
      </section>

      ) : (
        <>
          {/* A headline and one line under it, the runs waiting on you said at the
              right, and the page's act beside them. */}
          <window.CmHead
            title="Broadcasts"
            testid="bc-head"
            sub="Every run, once or standing — a playbook’s runs land here too, so there is one ledger."
            right={(
              <>
                {waitingN > 0 && <window.CmFlag tone="warn" testid="bc-waiting">{waitingN} waiting on you</window.CmFlag>}
                <button className="btn btn-primary" onClick={() => setWriting(true)} data-testid="bc-new" {...window.gate("approve", "send a broadcast")}><Icon name="plus" size={12} /> New broadcast</button>
              </>
            )}
          />
          <BcBand rows={rows} band={band} onBand={setBand} summary={<BcHistoryStats rows={rows} more={data.more} replyWindow={data.replyWindow} origin={origin} onOrigin={setOrigin} />} />
          {rows.length > 0 && <BcWeek rows={rows} now={now} />}
          <div className="bc-runs" data-testid="bc-runs">
            {runs.map(runCard)}
            {!band && sentN > recent.filter((r) => r.state === "sent").length && (
              <button type="button" className="bc-runs-more" onClick={() => setBand("sent")} data-testid="bc-runs-more">All {sentN} sent <Icon name="arrow-right" size={11} /></button>
            )}
            {band && runs.length === 0 && <EmptyState kind="line" title={origin === "playbook" ? "No playbook has run yet." : origin === "hand" ? "Nothing sent by hand yet." : "Nothing here."} />}
          </div>
          {rows.length === 0 && (
            <EmptyState
              kind="card"
              glyph="send"
              title="Nothing sent or queued yet"
              body="Every run lands here — the ones you send, and the ones your playbooks send."
              action={{ label: "New broadcast", onClick: () => setWriting(true), gate: window.gate ? window.gate("approve", "send a broadcast") : null }}
              testid="bc-empty"
            />
          )}
      {data.optIn && data.optIn.link && (
        <section id="bc-optin" className="ct-section bc-optin" data-testid="bc-optin">
          <div className="bc-yes-head">
            <span className="bc-yes-k">Get their yes</span>
            <span className="bc-yes-note">the only way onto a broadcast</span>
          </div>
          <div className="bc-optin-body">
            <img className="bc-optin-qr" src={data.optIn.qrPath} alt={`QR code that opens WhatsApp with “${data.optIn.phrase}” ready to send`} width={120} height={120} />
            <div className="bc-optin-text">
              <p>
                Put this where customers look — a sign at the desk, the link in your bio. It opens WhatsApp with <b>{data.optIn.phrase}</b> ready to send;
                sending it records their yes by their own message, and the receptionist thanks them. In Spanish, <b>{data.optIn.phraseEs}</b> works too. Reply STOP undoes it.
              </p>
              <div className="bc-chips">
                {/* The code with the words a customer needs before scanning it, on one printable sheet: a bare
                    code on a desk says nothing about whose messages, what they are, or how to stop them. */}
                {data.optIn.pageUrl && <a className="btn btn-sm btn-primary" href={`${data.optIn.pageUrl}/sign`} target="_blank" rel="noreferrer" data-testid="bc-optin-sign">Print a desk sign</a>}
                <button className="btn btn-sm" data-testid="bc-optin-copy" onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(data.optIn.link).then(() => flash({ msg: <>Link copied</> })); }}>Copy link</button>
                <a className="btn btn-sm" href={data.optIn.qrPath} download="say-yes-to-offers.svg">Download QR</a>
                <a className="cl-bucket-link" href={data.optIn.link} target="_blank" rel="noreferrer">Open the link</a>
              </div>
              {data.optIn.pageUrl && (
                <p className="bc-optin-page" data-testid="bc-optin-page">
                  Or share your sign-up page: <a className="cl-bucket-link" href={data.optIn.pageUrl} target="_blank" rel="noreferrer">{data.optIn.pageUrl.replace("https://", "")}</a>. It shows the same QR and the wording the phone carriers ask for before they let a business text. For a customer who would rather sign on paper, print <a className="cl-bucket-link" href={`${data.optIn.pageUrl}/form`} target="_blank" rel="noreferrer" data-testid="bc-optin-form">the sign-up form</a> — two separate boxes, each signed on its own — and record each signed box on their profile as “Sign-up form”.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

          <div className="ct-week-foot"><Icon name="chat" size={11} /> Replies never sit — the receptionist answers, books, or escalates to your Inbox.</div>
        </>
      )}
      </div>

      {toastNode}
    </div>
  );
};

window.BroadcastsPage = (props) => {
  const Seed = window.BroadcastsSeed;
  if (window.__BROADCASTS) return <BroadcastsReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
