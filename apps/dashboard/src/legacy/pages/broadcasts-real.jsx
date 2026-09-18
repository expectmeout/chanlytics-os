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
const BC_OPEN_WORDS = [["sending", "sending"], ["scheduled", "scheduled"], ["pending_approval", "waiting for you"]];
const bcOpenWords = (open) => BC_OPEN_WORDS.map(([state, words]) => [open.filter((r) => r.state === state).length, words]).filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`).join(" · ") || "nothing to come";
// Stable empties, so a workspace without lists or templates does not re-run
// the effects on every render.
const BC_NONE = [];

// One broadcast's people: who got it (and whether WhatsApp says delivered
// or read), who was held back and why, who it could not reach. Fetched when
// a row is opened; every line is a recipient row.
const BC_STATUS_WORDS = { sent: "sent", delivered: "delivered", read: "read", failed: "not delivered", queued: "sending", canceled: "canceled" };
// A clock for a recipient's line, the business's (window.__clock): "10:32 AM", or "Sep 12 · 10:32 AM" before today.
const bcClock = (iso) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? null : window.__clock.stamp(ms);
};
// What happened to one person, with the times WhatsApp's receipts gave (00111): "sent 10:31 · delivered 10:32 · read 10:40 · replied 10:52".
const bcReceipt = (r) => {
  const parts = [];
  const sent = bcClock(r.sent_at);
  parts.push(sent ? `sent ${sent}` : BC_STATUS_WORDS[r.message_status] || r.message_status || "sent");
  const delivered = bcClock(r.delivered_at);
  const read = bcClock(r.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (r.message_status === "delivered" || r.message_status === "read") parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (r.message_status === "read") parts.push("read");
  if (r.message_status === "failed") parts.push("not delivered");
  if (r.replied) parts.push(bcClock(r.replied_at) ? `replied ${bcClock(r.replied_at)}` : "replied");
  return parts.join(" · ");
};
// A broadcast that can still change: waiting for a person, scheduled, or sending.
const BC_LIVE = new Set(["pending_approval", "scheduled", "sending"]);
const BroadcastDetail = ({ id, heldReasons, onClose, solo = false }) => {
  // The last answer, kept with the broadcast it answered for: a read of another id is not this one's.
  const [answer, setAnswer] = React.useState(null);
  const [asks, ask] = React.useReducer((n) => n + 1, 0);
  const [retrying, setRetrying] = React.useState(false);
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
  const close = <button className="cl-bucket-link" onClick={onClose} data-testid="bc-detail-close">Close</button>;
  if (!mine) return <div className="bc-detail" data-testid="bc-detail"><span className="cl-prof-aut-hint">Reading who got it…</span></div>;
  if (mine.gone) {
    return (
      <div className="bc-detail" data-testid="bc-detail">
        <EmptyState kind="line" title="This broadcast isn't in this workspace." body="The link may be old, or from another workspace." testid="bc-detail-gone" />
        {close}
      </div>
    );
  }
  if (!d) {
    return (
      <div className="bc-detail" data-testid="bc-detail">
        <FailedRead kind="line" what="who got this broadcast" onRetry={() => { setRetrying(true); ask(); }} busy={retrying} testid="bc-detail-failed" />
        {close}
      </div>
    );
  }
  const got = d.recipients.filter((r) => r.state === "sent");
  const heldBack = d.recipients.filter((r) => r.state === "skipped");
  const rest = d.recipients.filter((r) => r.state === "failed" || r.state === "queued");
  const Person = ({ r, words }) => (
    <div className="bc-person" data-testid="bc-person">
      <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(`clients/${r.contact_id}`)}>{r.name}</button>
      <span className="dim">{words}</span>
      {r.conversation_id && <button className="cl-bucket-link" onClick={() => window.CHANLY.nav(`inbox/th-${r.conversation_id}`)}>Open thread</button>}
    </div>
  );
  return (
    <div className="bc-detail" data-testid="bc-detail">
      <div className="ct-sec-head">
        <span className="ct-sec-title">{d.broadcast.name}</span>
        {/* Opened on its own, no row above it says its state or when it went. */}
        {solo && <StatePill kind="broadcast" value={d.broadcast.state} />}
        <span className="ct-sec-meta">{solo && bcClock(d.broadcast.started_at || d.broadcast.scheduled_for) ? `${bcClock(d.broadcast.started_at || d.broadcast.scheduled_for)} · ` : ""}{d.broadcast.audience.label} · {d.recipients.length} enrolled · {bcTitle(d.broadcast.template_name)}</span>
        {close}
      </div>
      {d.broadcast.state === "failed" && <div className="bc-excl-hint" data-testid="bc-detail-failure">It stopped: {window.__broadcasts.failureWords(d.broadcast.failure)}.</div>}
      {d.broadcast.params.length > 0 && <div className="cl-prof-aut-hint">Values: {d.broadcast.params.map((p) => (p && p.kind && p.kind !== "text" ? ((window.__starters && window.__starters.sources || {})[p.kind] || p.kind).toLowerCase() : (p && p.value) || String(p))).join(" · ")}</div>}
      <div className="bc-detail-groups">
        <div className="bc-detail-group">
          <div className="cl-prof-rail-label">Got it · {got.length}</div>
          {got.map((r) => <Person key={r.contact_id} r={r} words={bcReceipt(r)} />)}
          {got.length === 0 && <span className="cl-prof-aut-hint">Nobody yet.</span>}
        </div>
        <div className="bc-detail-group">
          <div className="cl-prof-rail-label">Held back · {heldBack.length}</div>
          {heldBack.map((r) => <Person key={r.contact_id} r={r} words={(heldReasons || {})[r.reason] || r.reason || "held"} />)}
          {heldBack.length === 0 && <span className="cl-prof-aut-hint">Nobody.</span>}
        </div>
        {rest.length > 0 && (
          <div className="bc-detail-group">
            <div className="cl-prof-rail-label">Not there yet · {rest.length}</div>
            {/* The row's OWN reason, as the held-back group above already does.
                Hardcoding send_failed here told everyone in this group that
                WhatsApp refused them -- including the people a run was killed
                mid-send for, who were never offered to WhatsApp at all. */}
            {rest.map((r) => <Person key={r.contact_id} r={r} words={r.state === "failed" ? ((heldReasons || {})[r.reason] || (heldReasons || {}).send_failed || "WhatsApp refused") : "queued"} />)}
          </div>
        )}
      </div>
    </div>
  );
};

// One open broadcast: its name, its numbers, its state, and the verbs. The
// stop is armed and named for what it does -- stopping a send, skipping a run
// nobody approved and cancelling one still to come are three acts, and none
// of them is one click (the audit's D13). Drawn on its own by confirm.test.mjs.
const BC_STOP_WORDS = {
  sending: { verb: "Stop", question: (row) => `Stop ${row.name}?`, detail: "Messages already out stay out; the rest do not go.", yes: "Yes, stop it" },
  pending_approval: { verb: "Skip", question: (row) => `Skip ${row.name}?`, detail: "Nothing sends, and the run closes.", yes: "Yes, skip it" },
  scheduled: { verb: "Cancel", question: (row) => `Cancel ${row.name}?`, detail: "Nothing will send.", yes: "Yes, cancel it" },
};
const bcStopWords = (state) => BC_STOP_WORDS[state] || BC_STOP_WORDS.scheduled;
const BroadcastOpenRow = ({ row, canSend, onOpen, armed, onArm, stopping, approving = false, approve, cancel }) => {
  const stop = bcStopWords(row.state);
  return (
    <div className="bc-sched" id={`bc-run-${row.id}`} data-testid="bc-open">
      <div className="bc-sched-main">
        <span className="bc-sched-name"><button className="cl-bucket-link" onClick={onOpen} data-testid="bc-open-who">{row.name}</button></span>
        <span className="bc-sched-meta">
          {row.when} · {row.audience.label} · {row.recipient_count}
          {row.state === "sending" ? ` · ${row.counts.sent + row.counts.skipped + row.counts.failed} of ${row.recipient_count} done` : ""}
        </span>
        {row.state === "sending" && (
          <span className="ob-progress bc-progress" role="progressbar" aria-label={`${row.name}, sent so far`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((row.progress || 0) * 100)}>
            <span className="ob-progress-fill" style={{ width: `${Math.round((row.progress || 0) * 100)}%` }} />
          </span>
        )}
      </div>
      <StatePill kind="broadcast" value={row.state} label={row.stateLabel} />
      {!armed && row.state === "pending_approval" && <button className="btn btn-primary btn-sm" disabled={approving} onClick={() => approve(row)} data-testid="bc-approve" {...(canSend || !window.gate ? {} : window.gate("approve", "approve a run"))}>{approving ? "Approving…" : "Approve"}</button>}
      {canSend && !armed && <button className="btn btn-sm danger" onClick={() => onArm(true)} data-testid="bc-stop">{stop.verb}</button>}
      {canSend && armed && (
        <Confirm question={stop.question(row)} detail={stop.detail} yes={stop.yes} danger busy={stopping} onYes={() => cancel(row)} onNo={() => onArm(false)} testid="bc-stop" />
      )}
    </div>
  );
};
window.BroadcastOpenRow = BroadcastOpenRow;

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

const BroadcastsReal = ({ initialSegment = null, initialRun = null }) => {
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
  // The shell keeps this page mounted across its own links, so it follows them: a later link to a list picks that
  // list, and a link to a run, which names no list, leaves the audience where it was. Only a new link moves it: the
  // surface re-reading its audiences does not undo a choice made on the page.
  const followed = React.useRef(initialSegment);
  React.useEffect(() => {
    if (followed.current === initialSegment) return;
    followed.current = initialSegment;
    const next = initialSegment && audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment);
    if (next) setAud(bcKey(next));
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
  // Whether Send now has been pressed once and is asking. A question about one
  // template and one audience cannot be answered for another, so changing either
  // puts the button back.
  const [armed, setArmed] = React.useState(false);
  // The broadcast open on the page is the one its link names (broadcasts/run:<id>); pressing a row follows that link.
  const openId = initialRun;
  const openRun = (id) => window.CHANLY.nav(id ? `broadcasts/run:${id}` : "broadcasts");
  // A link lands on its run: brought into view when it is out of it -- under the composer on a page just opened, or
  // first on a page already scrolled past it. A row pressed in view stays where it is.
  React.useEffect(() => {
    const el = openId && typeof document !== "undefined" && document.getElementById ? document.getElementById(`bc-run-${openId}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [openId]);
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

  return (
    <div className="bc-page" data-testid="broadcasts-real">
      {/* A run the list does not hold -- older than its newest fifty -- opens here, first, where its link lands. */}
      {openId && !rows.some((r) => r.id === openId) && (
        <section className="ct-section bc-run-solo" id={`bc-run-${openId}`} data-testid="bc-run-solo">
          <BroadcastDetail id={openId} heldReasons={data.heldReasons} onClose={() => openRun(null)} solo />
        </section>
      )}

      <BcHistoryStats rows={rows} more={data.more} replyWindow={data.replyWindow} origin={origin} onOrigin={setOrigin} />

      <section className="bc-composer" data-testid="bc-composer">
        <div className="ct-sec-head">
          <span className="ct-sec-title">New broadcast</span>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">To</span>
          <div className="bc-chips" style={{ flexWrap: "wrap" }}>
            {audiences.map((a) => (
              <button key={bcKey(a)} className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")} onClick={() => setAud(bcKey(a))} title={a.hint} data-testid="bc-audience">
                {a.label} <span className="bc-chip-count tabular">{sizeOf(a)}</span>
              </button>
            ))}
            {data.listsRead === false && <FailedRead kind="line" what="your saved lists" body="The built-in audiences are current; the lists you keep by hand are missing until they read." surface="broadcasts" testid="bc-lists-failed" />}
          </div>
        </div>
        <div className="bc-row">
          <span className="bc-row-label">Send</span>
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
        </div>
        {composing && window.TemplateComposer && (
          <window.TemplateComposer
            businessName={data.businessName}
            onCancel={() => setComposing(false)}
            onDone={(made) => { setComposing(false); flash({ msg: <><b>{made.name}</b> submitted — WhatsApp reviews it; it appears here once approved</> }); }}
          />
        )}
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
        <div className="bc-meta">
          <Icon name="shield" size={11} />
          <span>
            {active
              ? `${activeCount} ${activeCount === 1 ? "person" : "people"} on “${active.label}” said yes${purpose === "marketing" ? " to offers" : " to messages"}`
              : "Pick who this goes to"}
            {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire{data.chunk ? ` · sent ${data.chunk} at a time` : ""}
          </span>
        </div>
        {number && (
          <div className={`bc-number bc-number-${number.health.tone}`} data-testid="bc-number">
            <Icon name="chat" size={11} />
            <span>{number.present ? `WhatsApp ${number.display || ""} · ${number.health.label}` : "No WhatsApp number connected — connect one in Settings › Connections."}</span>
          </div>
        )}
        {number && number.present && !number.health.canSend && <div className="bc-excl-hint" data-testid="bc-number-refusal">{number.health.refusal}</div>}
        {/* Said once, here, where an offer is picked: why a customer who only ever
            texted is not in an offer's count. The wire refuses per customer
            (sms_carries_no_promotions); the page states the rule. */}
        {purpose === "marketing" && data.offersNote && <div className="bc-excl-hint" data-testid="bc-offers-note">{data.offersNote}</div>}
        {overLimit && active && number && (
          <div className="bc-excl-hint" data-testid="bc-over-limit">This number can start up to {number.health.limitPerDay.toLocaleString()} new conversations a day; “{active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.</div>
        )}
        <div className="bc-actions">
          <input className="bc-subject" type="text" placeholder="Name this broadcast (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={{ flex: 1 }} />
          <BcWhenBox at={whenAt} maxDays={maxDays} onChange={setWhenAt} />
          {/* Schedule stays one press: a scheduled run is cancelled from the row above,
              and nothing has left. Send now does not -- it is the only act on this
              surface that cannot be taken back, and it was the only one that was not
              armed, while Stop, Skip and both Deletes each ask first. */}
          {!armed && <button className="btn btn-sm" disabled={!ready || !whenNote.ok} onClick={() => submit(true)} {...window.gate("approve", "schedule a broadcast")}>Schedule</button>}
          {!armed && <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => setArmed(true)} data-testid="bc-send" {...window.gate("approve", "send a broadcast")}>Send now</button>}
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
        <div id="bc-when-note" className={`bc-excl-hint${whenNote.tone === "warn" ? " bc-when-note-warn" : ""}`} data-testid="bc-when-note">{whenNote.words}</div>
        {/* Stop, Skip and Cancel stay with the roles that may press them; the page says why once, in the gate's words. */}
        {!canSend && <div className="bc-excl-hint" data-testid="bc-role">{window.gateTitle("approve", "stop or cancel a broadcast")}</div>}
        {canSend && active && activeCount === 0 && (
          <div className="bc-excl-hint" data-testid="bc-nobody">
            {purpose === "marketing"
              ? <>Nobody on “{active.label}” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile, or get their yes with the phrase and QR below.</>
              : <>Nobody on “{active.label}” has said yes to messages yet. Record it on their profile, or get their yes with the phrase and QR below.</>}
          </div>
        )}
      </section>

      {data.optIn && data.optIn.link && (
        <section className="ct-section bc-optin" data-testid="bc-optin">
          <div className="ct-sec-head">
            <span className="ct-sec-title">Get their yes</span>
            <span className="ct-sec-meta">the only way onto a broadcast</span>
          </div>
          <div className="bc-optin-body">
            <img className="bc-optin-qr" src={data.optIn.qrPath} alt={`QR code that opens WhatsApp with “${data.optIn.phrase}” ready to send`} width={120} height={120} />
            <div className="bc-optin-text">
              <p>
                Put this where customers look — a QR at the desk, the link in your bio. It opens WhatsApp with <b>{data.optIn.phrase}</b> ready to send;
                sending it records their yes by their own message, and the receptionist thanks them. In Spanish, <b>{data.optIn.phraseEs}</b> works too. Reply STOP undoes it.
              </p>
              <div className="bc-chips">
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

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">Scheduled</span>
          <span className="ct-sec-meta" data-testid="bc-open-meta">{bcOpenWords(open)}</span>
        </div>
        {open.length === 0 && (
          <EmptyState kind="line" title="Nothing queued." body="Pick a template above and choose a time, or send now." />
        )}
        {open.map((row) => (
          <React.Fragment key={row.id}>
          <BroadcastOpenRow row={row} canSend={canSend} onOpen={() => openRun(openId === row.id ? null : row.id)} armed={armId === row.id} onArm={(on) => setArmId(on ? row.id : null)} stopping={stopping === row.id} approving={approving === row.id} approve={approve} cancel={cancel} />
          {openId === row.id && <BroadcastDetail id={row.id} heldReasons={data.heldReasons} onClose={() => openRun(null)} />}
          </React.Fragment>
        ))}
      </section>

      <section className="ct-section">
        <div className="ct-sec-head">
          <span className="ct-sec-title">History</span>
          <span className="ct-sec-meta" data-testid="bc-history-meta">{history.length} {history.length === 1 ? "broadcast" : "broadcasts"}{data.more ? " · older broadcasts aren't listed" : ""}</span>
        </div>
        <div className="bc-hist">
          <div className="bc-hist-row head">
            <span>Broadcast</span><span>Audience</span><span className="num">Sent</span><span className="num">Delivered</span><span className="num">Read</span><span className="num">Replies</span>
          </div>
          {history.length === 0 && <EmptyState kind="line" title="No broadcast sent yet." />}
          {history.length > 0 && shownHistory.length === 0 && <EmptyState kind="line" title={origin === "playbook" ? "No playbook has run yet." : "Nothing sent by hand yet."} />}
          {shownHistory.map((h) => (
            <React.Fragment key={h.id}>
            <div id={`bc-run-${h.id}`} className={"bc-hist-row clickable" + (openId === h.id ? " is-open" : "")} data-testid="bc-history" role="button" tabIndex={0} aria-expanded={openId === h.id}
              onClick={() => openRun(openId === h.id ? null : h.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRun(openId === h.id ? null : h.id); } }}>
              <span className="bc-hist-name">
                {h.name}
                <span className="bc-hist-date">
                  {h.when}{h.state !== "sent" ? ` · ${h.stateLabel.toLowerCase()}${h.failureLabel ? ` — ${h.failureLabel}` : ""}` : ""}
                  {/* Where it came from. The playbook's NAME is already the
                      audience cell beside this, so this says which kind it was
                      and the name is said once. */}
                  {" · "}{bcByPlaybook(h) ? "by a playbook" : "by hand"}
                </span>
              </span>
              <span className="bc-hist-seg">
                {bcByPlaybook(h)
                  ? <button className="cl-bucket-link" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(`outbound/${h.playbook_id}`); }} data-testid="bc-history-playbook">{h.audience.label}</button>
                  : h.audience.label}
              </span>
              <span className="num tabular">{h.counts.sent}{h.counts.skipped + h.counts.failed ? <span className="dim"> · {h.counts.skipped + h.counts.failed} held</span> : null}</span>
              <span className="num tabular">{h.deliveredPct === null ? "—" : `${h.deliveredPct}%`}</span>
              <span className="num tabular">{h.readPct === null ? "—" : `${h.readPct}%`}</span>
              <span className="num tabular">{h.counts.replied}</span>
            </div>
            {openId === h.id && <BroadcastDetail id={h.id} heldReasons={data.heldReasons} onClose={() => openRun(null)} />}
            </React.Fragment>
          ))}
        </div>
        <div className="ct-week-foot"><Icon name="chat" size={11} /> Replies never sit — the receptionist answers, books, or escalates to your Inbox.</div>
      </section>

      {toastNode}
    </div>
  );
};

window.BroadcastsPage = (props) => {
  const Seed = window.BroadcastsSeed;
  if (window.__BROADCASTS) return <BroadcastsReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
