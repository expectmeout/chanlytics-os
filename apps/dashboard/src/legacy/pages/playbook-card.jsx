/* global React, Icon, PolicyChip, Confirm */
// Chanlytics -- People › Playbooks: one playbook as a card, with its tile and its slot. Moved whole from outbound-real.jsx
// (Reach out Part 2.5), which reads it from window.
// playbook-bits.jsx, which loads before this file.
const { pbStatus, PB_NONE, pbIcon, pbReplyTip, PB_BLURBS, pbPeople, pbMessage, pbWrongSlot, pbReach, pbReachWords, pbReachDoor, pbNoNumberWords, pbSentWhen, pbFooter, pbTitle, pbLangWords, pbDay } = window;

/**
 * A playbook, as a row of People's table: what starts it, with the one language its
 * runs go out in; its state; who it will actually reach, with the people it holds
 * back named; when it runs next; and the shape of its last runs beside their count.
 * Pressed anywhere, it opens in place under itself into its detail -- the message as
 * a customer sees it, its runs, and every verb (PlaybookCard, bare) -- as a template
 * opens under its row. It was a card of five stacked blocks, 221-258px tall on a desk
 * and 174-290px on a phone, where a person's row is 84.
 */
const PlaybookTile = ({ p, canAct, onEdit, flash, open = false, onOpen, focus = false }) => {
  const status = pbStatus(p);
  const waiting = p.totals.waiting;
  const paused = p.state === "paused";
  // Who a run reaches: the people on the list who said yes and have not heard
  // from a playbook this week. Paused, nobody -- and the bar says so. Waiting on
  // the owner, the run it holds.
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((t) => t.id === p.trigger) || null;
  // Everyone its moment names -- the list, everyone in People, the day's visits
  // -- as the server counts them with the runner's own rules. The bar is the
  // whole of them: green reaches, amber waits, and the grey is who no run
  // reaches whatever the week (never said yes, asked to stop, no number). It
  // counted only who said yes, so the people who never did were in no number
  // on the page, and they are the one part an owner can change.
  const named = p.named || (trig && trig.named) || null;
  // Who its moment reaches could not be counted (the server's read failed): the
  // page says so once, over the cards, and the tile draws no count. It drew
  // "0 of 0 who said yes", a zero nobody counted.
  const counted = named !== null && p.candidates !== null && p.held !== null;
  // Past the cap the rest go next time; a reminder is owed to every visit, uncapped (eligibleForPlaybook).
  const capped = !paused && !waiting && !(trig && trig.kind === "visit") ? Math.max(0, p.candidates - p.cap_per_run) : 0;
  const will = paused ? 0 : waiting ? (waiting.recipient_count ?? p.candidates) : p.candidates - capped;
  // A paused playbook counts nobody of its own, so its moment's count says how
  // many it is not reaching.
  const reachable = Math.max(p.candidates + p.held, trig ? (trig.candidates || 0) + (trig.held || 0) : 0);
  const pool = Math.max(will, counted ? named.pool : 0);
  // Paused, everyone it could reach waits on the pause: the amber is all of them.
  const held = paused ? reachable : p.held;
  // A run sends `template_language` to everyone on it (run-playbook.ts), so a
  // language the message lacks holds nobody back and is not a reason here.
  // Why the rest are not reached, in the approval sheet's words (contracts
  // reachLines), the most first -- and "Get their yes" on the one an owner can
  // change. Three at most: a card is a glance, and the rest open with it.
  const lines = named && window.__reachLines
    ? window.__reachLines({ pool: named.pool, will, noNumber: named.noNumber, stopped: named.stopped, noYes: named.noYes, heardThis: 0, heardAny: paused ? 0 : p.held, overCap: capped, overLimit: 0 }, p).lines.map((l) => ({ t: l.words, tone: l.tone, door: l.door }))
    : null;
  const reasons = (lines
    ? [paused && { t: "paused — nothing goes out", tone: "warn" }, ...lines]
    : [
      paused && { t: "paused — nothing goes out", tone: "warn" },
      !paused && p.held > 0 && { t: `${p.held} heard from a playbook this week`, tone: "warn" },
      !paused && !waiting && p.candidates > p.cap_per_run && { t: `up to ${p.cap_per_run} a run — the rest go next time`, tone: "plain" },
    ]).filter(Boolean).slice(0, 3);
  const of = window.__poolWords ? window.__poolWords(p.trigger) : null;
  const hour = `${String(p.run_hour).padStart(2, "0")}:00`;
  const spark = (p.totals.history || PB_NONE).slice(0, 6).reverse().map((h) => h.sent || 0);
  return (
    <section id={`pb-${p.id}`} className={`pb-row${open ? " is-open" : ""}${focus ? " is-focus" : ""}`} data-testid="pb-card" data-state={status}>
      {/* A press anywhere on the line that is not one of its controls opens it (cmRowPress), as a person's row does. */}
      <div className="pb-row-line" role="presentation" onClick={window.cmRowPress}>
        <button type="button" className="pb-row-what" onClick={onOpen} aria-expanded={open} data-row-open data-testid="pb-open">
          <span className="mark pb-row-mark" aria-hidden="true"><Icon name={pbIcon(p.trigger)} size={13} /></span>
          <span className="pb-row-titles">
            <span className="pb-row-name">{p.name}</span>
            {/* What starts it. The message and the one language its runs go out in are the
                open row's caption ("Win-back · English"): a run sends one language to
                everyone, and a language tag on every row said nothing an owner acts on. */}
            <span className="pb-row-hint">{p.triggerHint}</span>
          </span>
        </button>
        <span className="pb-row-state">
          <StatePill kind="playbook" value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"} />
        </span>
        <span className="pb-row-reach">
          {counted && <window.CmReach will={will} pool={pool} of={of} held={held} reasons={reasons.length ? reasons : [{ t: "nobody held back", tone: "plain" }]} size="sm" testid="pb-tile-reach" />}
        </span>
        <span className="pb-row-next">
          {/* A run waiting on the owner: the line says what the press does, and the
              press opens the row where Approve and Skip are. */}
          {/* Paused, the pill beside it says so in its tone; the cell says what that means for the clock. Waiting,
              the words open the row where Approve and Skip are -- a press only while it is closed: open, they are
              the row's words, and a press that closed the row took Approve away with it. The column's head is a
              desk's and hidden from a screen reader, so "Next run" rides the words for both (a phone draws no head). */}
          {waiting
            ? (open
                ? <span className="pb-tile-next">Approve it and it goes at {hour}</span>
                : <button type="button" className="pb-tile-next" onClick={onOpen} data-testid="pb-tile-approve">Approve it and it goes at {hour}</button>)
            : <span className="pb-tile-next">{paused ? "Not running" : p.off ? "Not while deals are off" : <><span className="pb-next-k">Next run </span>{p.next}</>}</span>}
        </span>
        <span className="pb-row-runs">
          <window.CmSpark values={spark} label={spark.length ? `The last ${spark.length} runs sent ${spark.join(", ")}` : null} />
          {/* What its runs earned, behind the count: the row keeps to its line, and the
              numbers are a hover, a focus or a tap away -- with what "wrote back"
              counts (the reply window). */}
          <span className="pb-tile-runs" tabIndex={0} data-tip={`${p.totals.sent} sent, ${p.totals.delivered} delivered, ${p.totals.replied} wrote back. ${pbReplyTip()}.`} data-testid="pb-tile-runs"><span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"}</span>
        </span>
      </div>
      {open && (
        <div className="pb-row-open">
          <PlaybookCard p={p} canAct={canAct} onEdit={onEdit} flash={flash} bare />
        </div>
      )}
    </section>
  );
};

/**
 * A moment nobody is using: its name, what starts it and who it would reach today,
 * and one press to set it up. What it is for (the blurb) is the tile's hover.
 *
 * PLAYBOOK_TRIGGERS is a CLOSED set, and the page drew only the ones somebody had
 * made, so the moments nobody had set up were simply absent -- the surest way to
 * get more out of Campaigns was the one thing it never mentioned. They stayed, but
 * as full cards with a paragraph each: five of the eight cards on the salon's page,
 * 179-258px apiece, around the three that work. They are a compact group under the
 * playbooks now. The count is the surface's own for that trigger: who it would
 * reach TODAY.
 */
const PlaybookSlot = ({ t, onStart }) => (
  <section className="pb-slot" data-testid="pb-slot" data-trigger={t.id} data-tip={PB_BLURBS[t.id] || undefined}>
    <span className="mark pb-slot-mark" aria-hidden="true"><Icon name={pbIcon(t.id)} size={13} /></span>
    <span className="pb-slot-titles">
      {/* Who it would reach today rides the name, where an ellipsis never takes it; what starts it is the line under. */}
      <span className="pb-slot-name">
        <span className="pb-slot-label">{t.label}</span>
        {/* A moment the server could not count says no number at all (the page says why, once). */}
        {t.candidates === null ? null : <span className="pb-slot-who" data-testid="pb-slot-who">{t.candidates > 0 ? `${pbPeople(t.candidates)} today` : "Nobody today"}</span>}
      </span>
      <span className="pb-slot-hint">{t.hint}</span>
    </span>
    {/* What the moment is for is the tile's hover, and Set up's description, so a keyboard and a screen reader have it. */}
    <button
      className="btn btn-sm pb-slot-start"
      onClick={() => onStart(t.id)}
      aria-description={PB_BLURBS[t.id] || undefined}
      data-testid="pb-slot-start"
      {...window.gate("approve", "start a playbook")}
    >
      <Icon name="plus" size={11} /> Set up
    </button>
  </section>
);

// One playbook: what starts it, what it sends, its clock, its mode, what its
// runs earned, and the verbs. A run that waits for a person is approved or
// skipped right here — the same doors as on Today and Broadcasts.
const PlaybookCard = ({ p, canAct, onEdit, flash, focus = false, bare = false }) => {
  const [busy, setBusy] = React.useState(false);
  const [sure, setSure] = React.useState(false);
  // Skip asks first, as it does on Broadcasts, with a question of its own apart from the delete's.
  const [skipSure, setSkipSure] = React.useState(false);
  const V = window.__playbooks;
  const waiting = p.totals.waiting;
  const status = pbStatus(p);
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((t) => t.id === p.trigger) || null;
  // The trigger's list, on People (a smart list's own view); `segments/<id>` would land there too, one hop later.
  // A follow-up's is the Pipeline's own view of the proposals waiting (contracts pipelineRoute).
  const listRoute = p.trigger === "saved_list" && p.list_key ? `clients/seg:${p.list_key}` : p.trigger === "saved_list" && p.list_id ? `clients/list:${p.list_id}` : trig && trig.list ? `clients/seg:${trig.list}` : trig && trig.kind === "deal" && window.__pipeline ? window.__pipeline.route({ view: "waiting" }) : "clients/seg:opted_in";
  // What its runs send. Templates that could not be read are said once, over the cards; one not among the approved, here.
  const surface = window.__PLAYBOOKS || {};
  const message = Array.isArray(surface.templates) ? pbMessage(p, surface.templates, surface.businessName) : null;
  const templateGone = Array.isArray(surface.templates) && !message;
  const wrongSlot = message ? pbWrongSlot(p, message.template) : null;
  const reach = pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting });
  const reachWords = pbReachWords(reach);
  // Everyone its moment names, as the tile reads it: whether anybody on it said the yes decides the door and the count.
  const named = p.named || (trig && trig.named) || null;
  const reachDoor = pbReachDoor(reach, named);
  const noNumber = pbNoNumberWords(p, named);
  // Not counted (the server's read failed): the sentence keeps what is known -- the moment, the clock, the next
  // run -- and no count; the page says once, over the cards, that the counts could not be read.
  const counted = named !== null && p.candidates !== null && p.held !== null;
  // Said the moment the server takes it, from what it answered (`onAccepted`), not once the playbooks and the
  // broadcasts are read again behind it; the card repaints from that re-read, and its buttons wait for it -- a Run
  // now pressed twice before the first run's rows had landed would be two runs.
  const act = async (fn, said) => {
    if (!V || busy) return;
    setBusy(true);
    let done = false;
    const say = (d) => { done = true; flash({ tone: "ok", msg: said(d) }); };
    const r = await fn({ onAccepted: say });
    setBusy(false);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else if (!done) say(r.data);
  };
  const toggle = () => act(
    (o) => (p.state === "paused" ? V.resume(p.id, o) : V.pause(p.id, o)),
    () => (p.state === "paused" ? <><b>{p.name}</b> resumed — next run {p.next === "paused" ? "at its hour" : p.next}</> : <><b>{p.name}</b> paused — nothing runs until you resume it</>),
  );
  const runNow = () => act(
    (o) => V.runNow(p.id, o),
    (d) => (d.outcome === "sent" ? <><b>{p.name}</b> — {pbPeople(d.eligible)}, {pbSentWhen(d)}</>
      : d.outcome === "held" ? <><b>{p.name}</b> — {pbPeople(d.eligible)} waiting for your approval</>
      : <><b>{p.name}</b> — nobody new to send to right now</>),
  );
  // The server may move the run to nine o'clock: the receipt says when it really goes (broadcasts-real.jsx bcWhenWords).
  const approve = () => act((o) => V.approveRun(waiting.id, o), (d) => <><b>{p.name}</b> approved — {pbPeople(d.recipient_count || waiting.recipient_count)}, {window.bcWhenWords ? window.bcWhenWords(d) : "sending now"}</>);
  const skip = () => {
    setSkipSure(false);
    return act((o) => V.skipRun(waiting.id, o), () => <><b>{p.name}</b> — this run skipped, nothing sent</>);
  };
  const remove = () => {
    setSure(false);
    act((o) => V.remove(p.id, o), () => <><b>{p.name}</b> deleted — its runs stay in Broadcasts with their numbers</>);
  };

  // Inside a tile (PlaybookTile), the tile draws the name and the state; the
  // card is its detail -- what it sends, its runs and its verbs -- under them.
  const inner = (
    <>

      {/* The message first, beside what the rule does with it.
          The card led with the trigger, the schedule, the audience, the template's
          NAME and the next run -- five chips and a meta line -- and the thing that
          actually reaches a customer was two clamped lines at 12px in --ink-muted,
          under a "Show the whole message" toggle. A playbook IS a message, a list
          and a clock; the message goes first and the rest is one sentence. */}
      <div className="ob-body">
        {message && (
          <div className="ob-words" data-testid="pb-words">
            <window.MessagePreview from={surface.businessName} body={message.body} values={message.values} header={message.template.header} footer={pbFooter(message.template)} buttons={message.template.buttons} compact />
            {/* Which message this is, captioning the message itself, and in which
                language -- that was a data-tip on a chip, and no finger reaches one.
                It opens Templates, where the same one is renamed or replaced. */}
            <button type="button" className="ob-words-name" onClick={() => window.CHANLY.nav("messages")} data-testid="pb-template-name">
              {pbTitle(p.template_name)} <span className="dim">&middot; {pbLangWords(p.template_language)}</span>
            </button>
          </div>
        )}
        <div className="ob-facts">
          <p className="ob-sentence">
            {/* The trigger's hint is a CONDITION, not an audience -- "Nothing heard
                in 30 days", "Only ever phoned, never texted" -- so "Goes to" in
                front of it was broken English on five of the six triggers. It
                leads, and the count follows it. */}
            {p.triggerHint}
            {counted && (
              <>
                {" "}&mdash;{" "}
                <button className="ob-link" data-tip={trig && trig.kind === "visit" ? "Everyone with a recorded yes — the day's visits are picked from them · click to open them in People" : trig && trig.kind === "deal" ? "The proposals waiting with nothing back — before their links, their follow-ups and the week's breath · click to open them in the Pipeline" : "The list this playbook watches — before the gap and the week's breath · click to open it in People"} onClick={() => window.CHANLY.nav(listRoute)} data-testid="pb-audience">
                  {noNumber || `${pbPeople(p.candidates)} ${trig && trig.kind === "deal" && window.__poolWords ? window.__poolWords(p.trigger) : "on the list"} said yes`}
                </button>
                {/* Why a list with people on it can still offer nobody: one message per
                    person per week, across playbooks. A bare "0 people" read as broken. */}
                {p.held > 0 ? <>, and {pbPeople(p.held)} more heard from you this week and wait</> : null}
              </>
            )}. {p.schedule}.{" "}
            {/* "Next run paused" was the words when it is. A follow-up where deals are off says why it runs nothing. */}
            {p.off
              ? <>{p.off}</>
              : p.listArchived
              ? <>Paused &mdash; its list, <b>{p.triggerLabel}</b>, is archived.{canAct && window.__lists ? <>{" "}<button type="button" className="ob-link" onClick={() => act(() => window.__lists.restore(p.list_id), () => <><b>{p.triggerLabel}</b> is back; resume the playbook when you want it running</>)} data-testid="pb-list-restore">Bring the list back</button>, or edit the playbook to run on another.</> : null}</>
              : p.state === "paused"
              ? <>Paused &mdash; nothing runs until you resume it.</>
              // The hour was in bold on its own, which promised a send. It keeps
              // the hour and says what the hour will do.
              : reachWords
                ? <>Next run {p.next} &mdash; <b>{reachWords}</b>.{reachDoor && <>{" "}<button type="button" className="ob-link" onClick={() => window.CHANLY.nav(reachDoor.to)} data-testid="pb-reach-door">{reachDoor.label}</button>.</>}</>
                : <>Next run <b>{p.next}</b>.</>}
            {p.last_run_for ? <> Last ran {pbDay(p.last_run_for)}.</> : <> It has not run yet.</>}
          </p>
          {templateGone && (
            <p className="bc-excl-hint warn" data-testid="pb-template-gone">Its message is no longer approved by WhatsApp, so its runs are skipped until it is approved again or the playbook sends another.</p>
          )}
          {wrongSlot && (
            <p className="bc-excl-hint warn" data-testid="pb-slot-wrong">
              Its message reads wrong: {wrongSlot}{canAct ? <> <button type="button" className="ob-link" onClick={() => onEdit(p)} data-testid="pb-slot-wrong-edit">Edit it</button>, and each slot takes what it should.</> : null}
            </p>
          )}
          {/* What its runs earned, as ONE sentence rather than five numbers with
              dots between them. Numbers read as a sentence here the way they do on
              Today, Reports and People; each run below still says its own. */}
          {/* One run says itself once: the row below carries the same numbers
              with its date and its door, and the two disagreed about which
              numbers to show. The sum is worth a sentence once there is a sum. */}
          {p.totals.runs > 1 && (
            <p className="ob-sentence ob-sentence-dim" data-testid="pb-results">
              <span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"} so far:{" "}
              <span className="tabular">{p.totals.sent}</span> sent,{" "}
              <span className="tabular" data-tip="WhatsApp's own receipts">{p.totals.delivered}</span> delivered,{" "}
              <span className="tabular" data-tip={pbReplyTip()}>{p.totals.replied}</span> wrote back{p.totals.held > 0 ? <>, <span className="tabular">{p.totals.held}</span> held back</> : null}.
            </p>
          )}
        </div>
      </div>

      {/* The runs themselves, newest first, from the same rows the totals are
          summed over -- every run, not the recent fifty broadcasts of any kind. */}
      {p.totals.history && p.totals.history.length > 0 && (
        <div className="ob-history" data-testid="pb-history">
          {/* Each run opens as itself on Broadcasts (broadcasts/run:<id>), read by its id however old it is. */}
          {p.totals.history.map((h) => (
            <button key={h.id} type="button" className="cl-prof-aut-hint ob-history-row" onClick={() => window.CHANLY.nav(`broadcasts/run:${h.id}`)} data-testid="pb-run-open">
              <span className="tabular">{pbDay(h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : ""))}</span>
              {" · "}{h.state === "sent" ? <>{h.sent} sent{h.delivered > 0 ? `, ${h.delivered} delivered` : ""}{h.held > 0 ? `, ${h.held} held` : ""}{h.replied > 0 ? `, ${h.replied} replied` : ""}</>
                : h.state === "pending_approval" ? `waiting for you · ${h.recipient_count} people`
                : h.state === "sending" ? `sending · ${h.sent} so far`
                : h.state === "scheduled" ? `scheduled · ${h.recipient_count} people`
                : h.state}
              <Icon name="arrow-right" size={10} />
            </button>
          ))}
          {p.totals.runs > p.totals.history.length && <span className="ob-history-more" data-testid="pb-history-more">The newest {p.totals.history.length} of {p.totals.runs} runs</span>}
        </div>
      )}

      <div className="ob-actions">
        {/* The run's Approve is where it always is for every role, and says who may; Skip stays with those who may. */}
        {waiting && !skipSure && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={approve} data-testid="pb-approve" {...(canAct || !window.gate ? {} : window.gate("approve", "approve a run"))}>
            <Icon name="check" size={12} /> Approve · {pbPeople(waiting.recipient_count)}
          </button>
        )}
        {waiting && canAct && !skipSure && <button className="btn btn-sm" disabled={busy} onClick={() => setSkipSure(true)} data-testid="pb-skip">Skip this run</button>}
        {waiting && canAct && skipSure && (
          <Confirm question={`Skip this run of ${p.name}?`} detail="Nothing sends, and the run closes." yes="Yes, skip it" danger busy={busy} onYes={skip} onNo={() => setSkipSure(false)} testid="pb-skip" />
        )}
        {canAct && (
          <button className="btn btn-sm" disabled={busy} onClick={toggle} data-testid="pb-pause">
            <Icon name={p.state === "paused" ? "play" : "pause"} size={12} /> {p.state === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        {canAct && p.state === "running" && !waiting && (
          <button className="btn btn-sm" disabled={busy} onClick={runNow} data-tip={window.__clock && window.__clock.hours ? `Runs it now, at your request — sends unless its class is set to Never; outside ${window.__clock.hours.range} it goes at ${window.__clock.hours.first}` : "Runs it now, at your request — sends unless its class is set to Never"} data-testid="pb-run-now">
            <Icon name="bolt" size={12} /> Run now
          </button>
        )}
        {canAct && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(p)} data-testid="pb-edit">Edit</button>}
        {canAct && !sure && (
          <button className="btn btn-ghost btn-sm danger" disabled={busy} onClick={() => setSure(true)} data-testid="pb-delete">Delete</button>
        )}
        {canAct && sure && (
          <Confirm question={`Delete ${p.name}?`} detail="Its runs stay in Broadcasts with their numbers." yes="Yes, delete" danger busy={busy} onYes={remove} onNo={() => setSure(false)} testid="pb-delete" />
        )}
      </div>
    </>
  );
  if (bare) {
    return (
      <div className="ob-card-detail">
        <div className="ob-head ob-head-bare">
          {reachWords && <span className="ob-reach" data-testid="pb-reach">{reachWords}</span>}
          <PolicyChip cls={p.policy_class} />
        </div>
        {inner}
      </div>
    );
  }
  return (
    <section id={`pb-${p.id}`} className={`fl-card ob-card ${status === "approval" ? "is-approval" : ""}${focus ? " is-focus" : ""}`} data-testid="pb-card" data-state={status}>
      <div className="ob-head">
        <div className="ob-titles">
          <span className="ob-name">{p.name}</span>
        </div>
        <StatePill kind="playbook" value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"} />
        {/* Beside the state, because it IS part of the state: three cards of
            "Running" that reach nobody scan as three working playbooks. */}
        {reachWords && <span className="ob-reach" data-testid="pb-reach">{reachWords}</span>}
        <PolicyChip cls={p.policy_class} />
      </div>
      {inner}
    </section>
  );
};

// PlaybookCard is drawn on its own by confirm.test.mjs (the delete that was two clicks on one button).
Object.assign(window, { PlaybookTile, PlaybookSlot, PlaybookCard });
