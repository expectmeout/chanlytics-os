/* global React, Icon, EmptyState, FailedRead */
// Today's queue: everything that asks for a person, in one row grammar (attention-bits.jsx AttnRow), the longest
// wait first: WhatsApp handoffs, callers who need a call back, reply windows closing, calls worth an ear (contracts
// today.ts queue), and the playbook runs that wait for a word or sit under a Stop (the broadcasts surface). A call in
// progress rides above the list while it lasts. The first row carries the page's one primary verb; the rest wear
// theirs quietly. Every sentence with a number is contracts' (todayRunWords, todayRunsSub, todayRunApproved).
//
// It was Agent Command: a seeded bar with Now/Soon buckets, an insight line, decision rows with Approve/Decline, and
// a count badge over a list that already says its count. The seed left with the mockup's stand-in: the mockup draws
// this page from its sample (legacy-bridge/today-sample.ts).
const useSurfaceTick = (name) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(name, bump);
    return () => window.removeEventListener(name, bump);
  }, [name]);
};

// The bridge's surface, or the mockup's sample of it (dashboard-a-brief.jsx todaySurface); the global itself where that file is not loaded.
const tqSurface = (key) => (window.todaySurface ? window.todaySurface(key) : window[key]);

const AgentCommand = () => {
  useSurfaceTick("surface:today");
  return window.TODAY_DATA ? <TodayQueue vm={window.TODAY_DATA} /> : null;
};

const tqClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const LiveRail = ({ nav }) => {
  useSurfaceTick("surface:live");
  const [nowMs, setNowMs] = React.useState(Date.now());
  const L = tqSurface("__LIVE");
  // The heartbeat rule, re-applied between refreshes, the way the Live page does.
  const live = L ? L.now.filter((c) => nowMs - (c.heartbeatAtMs || c.startedAtMs || 0) < L.heartbeatMs) : [];
  const count = live.length;
  React.useEffect(() => {
    if (!count) return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [count]);
  if (!count) return null;
  return live.map((c) => {
    const last = [...c.transcript].reverse().find((t) => t.speaker !== "whisper");
    const elapsed = Math.max(0, Math.floor((nowMs - (c.startedAtMs || nowMs)) / 1000));
    return (
      <div key={c.callId} className="tq-live" data-testid="brief-live-call">
        <span className="live-dot" />
        <span className="tq-live-text">
          <b>{c.who}</b> is on the line · {tqClock(elapsed)}
          {last ? <span className="tq-live-last"> · {last.speaker === "client" ? c.whoShort : "Receptionist"}: &ldquo;{last.text.slice(0, 90)}&rdquo;</span> : null}
        </span>
        {/* The call's own door (live/<callId>): Live's list opens on the oldest call, which may not be this one. */}
        <button className="cl-attn-cta primary" onClick={() => nav(`live/${c.callId}`)}>Open Live</button>
      </div>
    );
  });
};

// A playbook's run that waits for a person, or one under the veto window (scheduled, not yet sending) as rows of the
// same grammar, with Approve or Stop where the button goes. What already went out is a line of the day's card. The
// page keeps deciding WHICH rows wait or are scheduled; the words are contracts' (todayRunWords).
// Runs the queue draws before it counts the rest: a run waiting for a word needs a decision, so those come first; a
// run about to send is news. On a busy day four runs under six people put "Nothing sends until you say so" three
// hundred pixels below the fold, said four times.
/**
 * What the card draws, people and runs together. Today is a summary: past four rows it stops being one.
 *
 * Three of the four are people and the fourth is kept for a run, because a run waiting for a word is a
 * decision no other row can stand in for -- three people waiting used to take every seat, and Approve left
 * the page on the day it mattered. When no run wants the seat a fourth person has it; a reserved row is only
 * worth reserving while something needs it.
 *
 * The CAP IS HERE, not in contracts: TodayVM.queue.rows stays the whole queue the view model built, so the
 * four kinds still merge into one list by longest wait, and While you were away still knows every row the
 * queue holds when it decides what not to say twice. This only decides how many of them fit on the card.
 */
const CARD_MAX = 4;
const PEOPLE_MAX = 3;

/** The runs that want a seat: one waiting for a word, and one inside the veto window, about to send. */
const runsPending = () => {
  const all = ((s) => (s && s.rows) || [])(tqSurface("__BROADCASTS"));
  return {
    waiting: all.filter((r) => r.state === "pending_approval"),
    soon: all.filter((r) => r.state === "scheduled" && r.playbook_id && Date.parse(r.scheduled_for) > Date.now()),
  };
};

const runRows = (nav, flash, verbKind, room) => {
  const api = tqSurface("__broadcasts");
  const refreshed = () => { const f = tqSurface("__refreshPlaybooks"); if (f) f(); };
  const { waiting, soon } = runsPending();
  const words = (r) => window.__today.runs(r);
  const can = window.canDo && window.canDo("approve");
  // Each is said the moment the server takes it, from what it answered, not once the runs are read again behind it.
  const stop = async (r) => {
    if (!can || !api) return;
    let said = false;
    const say = () => { said = true; flash({ msg: <><b>{r.audience.label}</b> stopped: nothing sends</> }); };
    const res = await api.cancel(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(window.refusalToast(res, "Not stopped"));
    else if (!said) say();
  };
  const approve = async (r) => {
    if (!can || !api) return;
    let said = false;
    const say = (data) => {
      said = true;
      const n = data.recipient_count || r.recipient_count;
      // When it really goes (broadcasts-real.jsx bcWhenWords): the server moves a send outside 9:00-20:59 to nine.
      const when = window.bcWhenWords ? window.bcWhenWords(data) : "sending now";
      const t = window.__today.runApproved(r.audience.label, n, when);
      flash({ msg: <><b>{t.lead}</b> {t.rest}</> });
    };
    const res = await api.approve(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(window.refusalToast(res, "Not approved"));
    else if (!said) say(res.data);
  };
  // Each row opens its own run (broadcasts/run:<id>): who is on it, and what it has done so far.
  const count = waiting.length + soon.length;
  const drawn = [
    ...waiting.slice(0, room).map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta="Playbook · ready"
        sentence={words(r).waiting.sentence}
        status={words(r).waiting.status}
        tone="escalated"
        cta={{ label: "Approve", kind: verbKind(), onClick: () => approve(r), gate: window.gate("approve", "approve a run") }}
        also={{ label: "See who's on it", onClick: () => nav(`broadcasts/run:${r.id}`) }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-row"
      />
    )),
    ...soon.slice(0, Math.max(0, room - Math.min(waiting.length, room))).map((r) => (
      <window.AttnRow
        key={`run-${r.id}`}
        initials="▶"
        glyph="bolt"
        name={r.audience.label}
        meta={words(r).soon.meta}
        sentence={words(r).soon.sentence}
        status={words(r).soon.status}
        tone="warn"
        cta={{ label: "Open", kind: verbKind(), onClick: () => nav(`broadcasts/run:${r.id}`) }}
        also={{ label: "Stop", onClick: () => stop(r), gate: window.gate("approve", "stop a run") }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-soon"
      />
    )),
  ];
  return { drawn, count, cut: count - drawn.length };
};

const TodayQueue = ({ vm }) => {
  useSurfaceTick("surface:broadcasts");
  const [toastNode, ppFlash] = window.usePPToast();
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const verb = async (r, which) => {
    const inboxVerb = tqSurface("__inboxVerb");
    if (!(window.canDo && window.canDo("approve")) || !inboxVerb) return;
    // Said the moment the server takes it, not after the Inbox, the threads and Today are read again behind it
    // (the row itself leaves with that re-read: the server owns the thread).
    let said = false;
    const done = () => {
      said = true;
      ppFlash({ msg: which === "snooze" ? <><b>{r.who}</b> snoozed: hidden until they wake or reply</> : <><b>{r.who}</b>: done, the receptionist has the thread back</> });
    };
    const res = await inboxVerb(
      { conversationId: r.also.conversationId, escalationId: r.also.escalationId, who: r.who },
      which, {}, { onAccepted: done },
    );
    if (!res.ok) ppFlash(window.refusalToast(res, which === "snooze" ? "Not snoozed" : "Not resolved"));
    else if (!said) done();
  };
  const rows = vm.queue.rows;
  // One primary verb on the page: the first row's. Every other verb is drawn, quietly.
  let primaryLeft = true;
  const verbKind = () => { const k = primaryLeft ? "primary" : "ghost"; primaryLeft = false; return k; };
  // The run's seat, held only while a run wants it (CARD_MAX).
  const wants = runsPending();
  const peopleRoom = wants.waiting.length + wants.soon.length > 0 ? PEOPLE_MAX : CARD_MAX;
  const drawn = rows.slice(0, peopleRoom).map((r) => (
    <window.AttnRow
      key={r.id}
      initials={r.initials}
      glyph={r.channel === "Phone" && /^[+\d(]/.test(r.who) ? "phone" : null}
      name={r.who}
      meta={`${r.channel}, ${r.when}`}
      sentence={r.sentence}
      quoted={r.quoted}
      status={r.status}
      tone={r.tone}
      cta={{ label: r.cta.label, kind: verbKind(), onClick: () => nav(r.cta.to) }}
      also={r.also ? { label: r.also.label, onClick: () => verb(r, r.also.verb), gate: window.gate("approve", r.also.verb === "snooze" ? "snooze a conversation" : "resolve a conversation"), testid: `queue-${r.also.verb}` } : null}
      onOpen={() => nav(r.cta.to)}
      testid={`queue-${r.kind}`}
    />
  ));
  // A person who has been waiting comes before a run waiting for a word, so runs take only what is left.
  const { drawn: runs, count: runsCount, cut: runsCut } = runRows(nav, ppFlash, verbKind, Math.max(0, CARD_MAX - drawn.length));
  // What the card could not hold is counted, never dropped: the rows past the cap and the ones the view
  // model already counted for the Inbox are the same kind of thing to a reader.
  const rowsCut = rows.length - drawn.length + vm.queue.more;
  const total = rows.length + runsCount + vm.queue.more;
  return (
    <section className="tq today-queue" data-testid="today-queue">
      {/* No count over the rows: the sentence says what they hold, and the rows are right under it. */}
      <div className="tq-head">
        <span className="tq-title">Your queue</span>
        <span className="tq-sub">
          {[...vm.queue.parts, window.__today.runsSub(runsCount)].filter(Boolean).join(" · ") || vm.queue.empty.sub}
        </span>
        <button type="button" className="tq-open" onClick={() => nav("inbox")}>Open Inbox</button>
      </div>
      <LiveRail nav={nav} />
      <div className="tq-list">
        {drawn}
        {runs}
        {/* The broadcasts read failed: the rows above stand, and the runs that may be waiting are said to be unread. */}
        {!tqSurface("__BROADCASTS") && window.__surfaceFailed && window.__surfaceFailed("broadcasts") && (
          <FailedRead kind="line" className="tq-failed" what="the playbook runs" body="The rows above are current." surface="broadcasts" testid="today-runs-failed" />
        )}
        {/* What an empty queue means is a sentence about the wires, so contracts says it: a dark line, no line, a line
            the receptionist does not answer (email), or the receptionist holding the floor. */}
        {total === 0 && (
          <EmptyState
            kind="line"
            glyph={vm.queue.empty.glyph}
            tone={vm.queue.empty.tone || undefined}
            title={vm.queue.empty.title}
            testid={vm.queue.empty.testid}
          />
        )}
      </div>
      {(rowsCut > 0 || runsCut > 0) && (
        <div className="tq-foot">
          <span>{[rowsCut > 0 ? `${rowsCut} more in the Inbox` : "", runsCut > 0 ? `${runsCut} more run${runsCut === 1 ? "" : "s"} in Campaigns` : ""].filter(Boolean).join(" · ")}</span>
          <button className="cl-attn-cta ghost" onClick={() => nav(rowsCut > 0 ? "inbox" : "broadcasts")}>See all</button>
        </div>
      )}
      {toastNode}
    </section>
  );
};

window.AgentCommand = AgentCommand;
