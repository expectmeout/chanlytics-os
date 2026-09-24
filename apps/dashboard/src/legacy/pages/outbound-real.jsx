/* global React, Icon, PolicyChip, Confirm, EmptyState, FailedRead */
// Campaigns › Playbooks, real: a standing rule that sends one approved
// template to newly eligible people who said yes, under the workspace's
// autonomy mode. Same chrome as the seeded Outbound page (outbound.jsx);
// every number is a run's. Nothing here scores, estimates or invents.
//
// Its moments: People lists that keep themselves current -- win-back (quiet
// 30 days), welcome (new this week), save our number (phoned only), lapsed --
// the month's offer (everyone who said yes, on a cadence), a visit tomorrow or
// yesterday, and one of the workspace's own lists (00155). Each runs under
// one of the two Autonomy rows — auto sends, veto sends after a stop window,
// ask leaves the run waiting here and on Today, never does nothing. Every
// verb goes through window.__playbooks and the surface is re-fetched, so the
// cards are the server's.

const usePlaybooks = () => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("surface:playbooks", bump);
    return () => window.removeEventListener("surface:playbooks", bump);
  }, []);
  return window.__PLAYBOOKS;
};

// Stable empties, so a workspace without templates or triggers does not
// re-run the effects on every render.
const PB_NONE = [];
// A list a playbook may run on, in the picker's two groups (decision 0009): People's, then the workspace's own.
const PB_LIST_GROUPS = { people: "People's lists", own: "Your lists" };
const pbListSub = (l) => (l.builtin ? "One of People's lists" : l.smart ? "Keeps itself current" : "Kept by hand");
// What a playbook on a list sends, and the row of Autonomy it runs under (contracts LIST_PLAYBOOK_CLASSES). Both need
// the yes to offers.
const PB_LIST_CLASSES = [
  { id: "campaign", label: "An offer", sub: "Runs under Standing offers in Autonomy", icon: "gift" },
  { id: "reengage", label: "A win-back", sub: "Runs under Re-engage quiet customers in Autonomy", icon: "undo" },
];
// The hours a run may start at: the sending hours the clock publishes (contracts SENDING_HOURS_WORDS).
const pbHours = () => { const h = window.__clock && window.__clock.hours; return h ? Array.from({ length: h.max - h.min + 1 }, (_, i) => h.min + i) : []; };
// A number said as a word inside a sentence -- "the six moments", "two set up" -- the way a person says it.
const PB_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const pbSpell = (n, capital = false) => { const w = PB_WORDS[n] || String(n); return capital ? w[0].toUpperCase() + w.slice(1) : w; };
const pbHour = (h) => `${String(h).padStart(2, "0")}:00`;
const pbPeople = (n) => `${n} ${n === 1 ? "person" : "people"}`;
const pbStatus = (p) => (p.totals && p.totals.waiting ? "approval" : p.state);
// What the next run will actually do (contracts playbookReach): a running
// playbook whose list is empty is not "running" in any sense the owner means.
const pbReach = (p) => (window.__playbookReach ? window.__playbookReach(p) : "sends");
const pbReachWords = (r) => (window.__playbookReachWords ? window.__playbookReachWords[r] : null);
// The door only where a yes fixes it: somebody named and not one of them said it (contracts playbookReachDoor).
const pbReachDoor = (r, named) => (window.__playbookReachDoor ? window.__playbookReachDoor(r, named) : null);
// A list whose yes has no number to send to, in the send screen's words; null keeps the card's own count.
const pbNoNumberWords = (p, named) => (window.__playbookNoNumberWords ? window.__playbookNoNumberWords(p, named) : null);
// Words for people: a starter's title, or the name with its underscores made spaces.
const pbTitle = (name) => (window.__starters ? window.__starters.title(name) : String(name || "").replace(/_/g, " "));
const pbIsStarter = (name) => !!(window.__starters && window.__starters.byName(name));
// A language code as a person reads it; the code itself when the library is not read.
const pbLangWords = (code) => (window.__starters && window.__starters.langWords ? window.__starters.langWords(code) : String(code || ""));
// A run's day as words ("Aug 25"): a calendar day, not an instant, so no zone.
const pbDay = (day) => (day && window.__clock && window.__clock.dayWords ? window.__clock.dayWords(day) : String(day || ""));
const pbOrder = (a, b) => (window.__starters ? window.__starters.compare(a, b) : 0);
// The line under the words: the one Meta holds for this row, else the starter's
// own (contracts templateFooter). It resolved ONLY through the starter library
// before, so a template a workspace wrote here showed its footer while it was
// being drafted and never again -- on this page, on Playbooks, and on Messages.
const pbFooter = (t) => (t && window.__starters && window.__starters.footer ? window.__starters.footer(t) : null);
// What a slot shows in a preview: what a real person would see (contracts exampleParams), in the composer and on a card alike.
const PB_EXAMPLES = { visit_when: "tomorrow at 2:00 PM", visit_service: "a consultation", proposal_link: "their proposal's link" };
const pbExample = (kind, businessName) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (businessName || "the business") : kind === "booking_link" ? "your booking link" : (PB_EXAMPLES[kind] || ""));
// A card's message: its template among the approved, with the playbook's own
// values in the slots; null when it is not among them. The body and the values
// stay apart -- the preview marks what fills per person, and `words` is the same
// thing joined up, for the one line a closed card shows.
// A slot a playbook fills with what it cannot take (contracts slotChoices), in
// words: the composer let any slot take any source, and a win-back set up with
// its first name filled by the booking link greets everyone "Hi your booking
// link" until it is changed. Null when every slot takes what it should. A link
// the workspace has since removed is a different fault, and the route's.
const pbWrongSlot = (p, t) => {
  const S = window.__starters;
  if (!t || !S || !S.slots || !Array.isArray(p.params)) return null;
  const trig = (window.__PLAYBOOKS && window.__PLAYBOOKS.triggers || PB_NONE).find((x) => x.id === p.trigger) || null;
  const choices = S.slots(t, { visits: !!(trig && trig.kind === "visit"), bookingLink: true, proposal: !!(trig && trig.kind === "deal") });
  if (!choices) return null;
  const at = p.params.findIndex((s, i) => s && s.kind && choices[i] && !choices[i].includes(s.kind));
  if (at < 0) return null;
  const label = S.slotLabels(t)[at] || `Value ${at + 1}`;
  const s = p.params[at];
  return s.kind === "text"
    ? `“${label}” says “${s.value}” to everyone, where each person's own belongs.`
    : `“${label}” is filled with ${String((S.sources || {})[s.kind] || s.kind).toLowerCase()}.`;
};
const pbMessage = (p, templates, businessName) => {
  const t = templates.find((x) => x.id === p.template_id) || null;
  if (!t) return null;
  const values = (p.params || PB_NONE).map((s) => (s && s.kind === "text" ? s.value : s && s.kind ? pbExample(s.kind, businessName) : String(s ?? "")));
  // No fallback: message-preview.jsx is loaded before every page, in both lists,
  // and a quiet `String(body)` here would put raw {{1}} on a card rather than
  // the words -- which is what a test that had not loaded it drew.
  return { template: t, body: t.body_preview, values, words: window.mpFill(t.body_preview, values) };
};
// When a run a person asked for really goes (broadcasts-real.jsx bcWhenWords). An edge older than the dashboard gives no time back, and nothing claims one.
// What a reply is, in the one window's words (contracts REPLY_WINDOW_WORDS, on the surface).
const pbReplyTip = () => { const w = window.__PLAYBOOKS && window.__PLAYBOOKS.replyWindow; return w ? `Threads that heard from the customer ${w} of a run` : "Threads that heard from the customer after a run"; };
const pbSentWhen = (d) => (d && d.scheduled_for && window.bcWhenWords ? window.bcWhenWords(d) : window.__clock && window.__clock.hours ? `on its way — sends go out ${window.__clock.hours.between} by your clock` : "on its way");

// Each moment has its glyph: the arrow that comes back, a wave hello, the
// phone that only ever rang, the gift, the calendar, the clock of the day
// after, a list's filter, and a proposal's deal. A playbook on a trigger this
// list does not know gets a bolt.
const PB_ICONS = { quiet_30: "undo", new_week: "wave", phoned_only: "phone", everyone_monthly: "gift", visit_tomorrow: "calendar", visited: "clock", lapsed: "undo", saved_list: "filter", proposal_waiting: "deal" };
const pbIcon = (trigger) => PB_ICONS[trigger] || "bolt";
// What a moment is for, said once on its empty card: who it reaches and why it
// is worth a message. The count of who it would reach today follows it.
const PB_BLURBS = {
  quiet_30: "Everyone you have not heard from in a month — the easiest customer to win back is one who already came.",
  new_week: "Everyone who wrote or phoned for the first time this week — the welcome that saves your number in their phone.",
  phoned_only: "Everyone who only ever phoned — one message, and they can text you instead of calling.",
  everyone_monthly: "Everyone who said yes to offers, once a month — this month's offer, on a clock.",
  visit_tomorrow: "Everyone with a visit tomorrow — the reminder that keeps the chair from sitting empty.",
  visited: "Everyone who came in yesterday and has nothing on the calendar — the shortest path from a visit to the next booking.",
  lapsed: "Everyone whose last visit was 45 days ago or more, with nothing ahead on the calendar — the regulars drifting away.",
  saved_list: "Everyone on a list — one of People's, or one of yours, kept by hand or kept current by a rule you described.",
  proposal_waiting: "Everyone whose proposal has waited with nothing back — one nudge each, with the link to it, before it goes cold.",
};
const pbShort = (id) => (window.__starters && window.__starters.langTag ? window.__starters.langTag(id) : String(id || "").slice(0, 2).toUpperCase());
const pbLabel = (id) => (window.__starters && window.__starters.langLabel ? window.__starters.langLabel(id) : pbLangWords(id));

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
      <div className="pb-row-line" onClick={window.cmRowPress}>
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

// The composer's numbers, a few sensible ones each, chosen in place; a playbook
// made before them keeps its own among them (pbWith). The route takes any whole
// number in its range: 1-500 a run, a gap of 7-365 days, a cadence of 1-90.
const PB_CAPS = [5, 10, 25, 50, 100, 250, 500];
const PB_GAPS = [7, 14, 30, 60, 90, 180, 365];
const PB_CADENCES = [7, 14, 30, 60, 90];
const PB_TEXT = ["text"];
const pbWith = (list, n) => (list.includes(n) ? list : [...list, n].sort((a, b) => a - b));
// A new playbook opens on the first moment nothing is doing yet, else the first.
const pbFirstFree = (triggers, rows) => {
  const used = new Set((rows || PB_NONE).map((p) => p.trigger));
  const t = triggers.find((x) => !used.has(x.id)) || triggers[0];
  return t ? t.id : "quiet_30";
};
// A number inside a sentence, chosen where it is said: a select drawn as the
// words it says, with its chevron. As wide as its longest choice, so picking
// one moves nothing around it.
const PbTok = ({ value, options, onChange, label, testid = null }) => (
  <span className="pb-tok">
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} data-testid={testid || undefined}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
    <Icon name="chevron-down" size={9} />
  </span>
);
// What every run keeps to, behind the shield.
const pbGuardWords = (kind) => (kind === "visit"
  ? "Only people with a recorded yes and a number. One message per visit. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
  : kind === "deal"
    ? "Only people with a recorded yes and a number, whose proposal has its link and nothing back. One message per proposal, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire."
    : "Only people with a recorded yes and a number. Never twice within its gap, and one playbook message per person a week, across every playbook. Anyone who asked to stop, or is mid-thread with a person, is held back at the wire.");

/**
 * The composer: a new playbook, or one being changed, in a sheet beside the
 * page (RecordSheet). The moments stay where they were behind it: it was a
 * panel over the grid that pushed the cards down and took the unset moments
 * away while it was open, so opening it moved the whole page.
 *
 * It reads the way a playbook is: who it is for (the moment, and who that
 * reaches today), what it says (the message as a customer reads it, and what
 * fills each of its slots), and when it runs (one sentence, its numbers chosen
 * in place). Everything else is a press away -- every moment and every message
 * behind their own control, the rules every run keeps behind the shield.
 *
 * A slot takes only what keeps its message true (contracts slotChoices): a
 * first name is each person's own and a visit's time each visit's, so neither
 * is a choice; the business name and the booking link may be typed over; a
 * slot on a message written elsewhere may be anything, its guess first. Each
 * slot had a free choice of all six, so a first name could be set to the
 * booking link and a run greeted everyone "Hi your booking link". A message
 * one of whose slots nothing can fill here -- a visit's reminder, on a list --
 * is not offered at all.
 *
 * Checked here the way the route checks it -- a message chosen, every slot
 * filled -- so an enabled Start is a Start that succeeds unless the server
 * knows something newer (a template no longer approved, a booking link gone).
 */
const PlaybookComposer = ({ data, editing, initialTrigger = null, onDone, onCancel }) => {
  const S = window.__starters || null;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  // As on Broadcasts: a template this product cannot put on the wire is not
  // offered, rather than offered and refused by Meta for every recipient.
  const offered = React.useMemo(() => (window.__starters && window.__starters.sendable
    ? window.__starters.sendable((data.templates || PB_NONE).slice().sort(pbOrder))
    : { sendable: (data.templates || PB_NONE).slice().sort(pbOrder), blocked: PB_NONE, why: null }), [data.templates]);
  const triggers = data.triggers || PB_NONE;
  // What it opens as: the playbook being changed, or a new one on the moment pressed. Words typed here before and
  // not saved come back over that (the tab's draft, useUnsavedWork), except the moment a slot was pressed for.
  const opened = React.useMemo(() => ({
    trigger: editing ? editing.trigger : initialTrigger || pbFirstFree(triggers, data.rows),
    tplId: editing ? editing.template_id : "",
    picked: !!editing,
    name: editing ? editing.name : null,
    hour: editing ? editing.run_hour : 10,
    cap: editing ? editing.cap_per_run : 25,
    gap: editing ? editing.gap_days : 90,
    cadence: editing ? editing.cadence_days : 30,
    // The list a playbook on a list runs on, by its token (decision 0009): its own, or the first of the workspace's
    // lists, else the first of People's.
    listId: editing
      ? (editing.list_key ? `seg:${editing.list_key}` : editing.list_id ? `list:${editing.list_id}` : null)
      : ((data.lists || PB_NONE).find((l) => !l.builtin) || (data.lists || PB_NONE)[0] || {}).id || null,
    // What a playbook on a list sends, under which row of Autonomy: an offer, or a win-back.
    cls: editing && editing.trigger === "saved_list" && editing.policy_class === "reengage" ? "reengage" : "campaign",
    fills: editing && Array.isArray(editing.params) ? { [editing.template_id]: editing.params.map((p) => (p && p.kind ? p.kind : "text")) } : {},
    typed: editing && Array.isArray(editing.params) ? { [editing.template_id]: editing.params.map((p) => (p && p.kind === "text" ? p.value : "")) } : {},
  }), [editing, initialTrigger]); // eslint-disable-line react-hooks/exhaustive-deps -- what it opened as, read once
  const draftKey = editing ? editing.id : "new";
  const [kept] = React.useState(() => (window.tabDraft ? window.tabDraft("playbook", draftKey) : null));
  const start = kept ? { ...kept, trigger: initialTrigger || kept.trigger } : opened;
  const [trigger, setTrigger] = React.useState(start.trigger);
  // The message the owner chose. Until they choose one it is the moment's own,
  // and it follows the moment -- nothing is picked for them that the moment
  // was not written for: it opened on whichever template sorted first.
  const [tplId, setTplId] = React.useState(start.tplId);
  const [picked, setPicked] = React.useState(start.picked);
  // Null follows the name the route gives a playbook given none; words are the owner's.
  const [name, setName] = React.useState(start.name);
  const [hour, setHour] = React.useState(start.hour);
  const [cap, setCap] = React.useState(start.cap);
  const [gap, setGap] = React.useState(start.gap);
  const [cadence, setCadence] = React.useState(start.cadence);
  // Per message: what fills each slot, and the words typed into it.
  const [fills, setFills] = React.useState(start.fills);
  const [typed, setTyped] = React.useState(start.typed);
  const [listId, setListId] = React.useState(start.listId === undefined ? null : start.listId);
  const [cls, setCls] = React.useState(start.cls || "campaign");
  // What the sheet holds, against what it opened as: changed, it is kept in the tab, and Cancel asks first.
  const held = { trigger, tplId, picked, name, hour, cap, gap, cadence, listId, cls, fills, typed };
  const work = window.useUnsavedWork("playbook", draftKey, { value: held, dirty: JSON.stringify(held) !== JSON.stringify(opened), onLeave: onCancel });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const canEdit = !!(window.canDo && window.canDo("approve"));

  const trig = triggers.find((t) => t.id === trigger) || null;
  const visits = !!(trig && trig.kind === "visit");
  // A playbook on one of the workspace's lists: which one, with the list's own count (the route's "list:<id>" pool).
  const onList = !!(trig && trig.kind === "saved");
  const lists = data.lists || PB_NONE;
  const list = onList ? lists.find((l) => l.id === listId) || null : null;
  const link = !!data.bookingLink;
  // What each slot of a message may take on a moment -- a visit's time and service on a visit, a proposal's link on
  // the follow-up (0006) -- or null when one of them can take nothing there.
  const slotsOf = (t, m = trig) => (S && S.slots ? S.slots(t, { visits: !!(m && m.kind === "visit"), bookingLink: link, proposal: !!(m && m.kind === "deal") }) : (Array.isArray(t.variables) ? t.variables : PB_NONE).map(() => PB_TEXT));
  const usable = offered.sendable.filter((t) => slotsOf(t) !== null);
  // One entry per message, whatever languages it has: the language is its own control.
  const groups = S && S.group ? S.group(usable) : usable.map((t) => ({ name: t.name, title: pbTitle(t.name), rows: [t], labels: {} }));
  const rowIn = (g, lang) => (g ? g.rows.find((r) => r.language === lang) || g.rows.find((r) => r.language === "en_US") || g.rows[0] : null);
  // The moment's own message: approved and picked for you, in review at
  // WhatsApp, or not added yet -- one press adds it.
  const starter = S ? window.__starters.forTrigger(trigger) : null;
  const starterGroup = starter ? groups.find((g) => g.name === starter.name) || null : null;
  const starterAny = starter ? (window.__TEMPLATES_ALL || PB_NONE).find((t) => t.name === starter.name) || null : null;
  const tpl = picked ? usable.find((t) => t.id === tplId) || null : rowIn(starterGroup, null);
  // A playbook being changed whose message is no longer one it can send: said, never swapped for another behind its back.
  const lost = !!(editing && picked && tplId === editing.template_id && !tpl);
  const group = tpl ? groups.find((g) => g.name === tpl.name) || null : null;
  const addStarter = async () => {
    if (!window.__templates || !window.__templates.addStarters || !starter || adding) return;
    setAdding(true);
    setError(null);
    const r = await window.__templates.addStarters({ keys: [starter.key], languages: ["en_US"] });
    setAdding(false);
    if (!r.ok) setError(r.message || "It could not be added.");
  };

  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : PB_NONE;
  const choices = tpl ? slotsOf(tpl) || PB_NONE : PB_NONE;
  const labels = tpl && S ? S.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  const SRC = (S && S.sources) || { text: "Type it" };
  const HINTS = (S && S.sourceHints) || {};
  // A slot's source: the one chosen when this slot may take it, else its first (a stored one a slot may not take is not kept).
  const srcOf = (i) => { const c = choices[i] || PB_TEXT; const s = ((tpl && fills[tpl.id]) || PB_NONE)[i]; return c.includes(s) ? s : c[0]; };
  const textOf = (i) => (((tpl && typed[tpl.id]) || PB_NONE)[i] || "");
  const setText = (i, v) => setTyped((p) => { const next = [...(p[tpl.id] || [])]; next[i] = v; return { ...p, [tpl.id]: next }; });
  const chooseFill = (i, kind) => {
    const was = srcOf(i);
    setFills((f) => { const next = vars.map((_, j) => ((f[tpl.id] || PB_NONE)[j] || srcOf(j))); next[i] = kind; return { ...f, [tpl.id]: next }; });
    // Typing over the business name starts from it.
    if (kind === "text" && was === "business_name" && !textOf(i).trim() && data.businessName) setText(i, data.businessName);
  };
  const shown = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() || `[${labels[i]}]` : pbExample(srcOf(i), data.businessName)));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? textOf(i).trim() : { kind: srcOf(i) }));
  const missing = vars.findIndex((v, i) => srcOf(i) === "text" && !textOf(i).trim());
  const ready = !!trig && !!tpl && missing < 0 && !busy && (!onList || !!list);

  // The name the route gives it when it is given none, said before it is saved.
  const auto = trig && tpl && window.__playbookName ? window.__playbookName(trig, tpl) : trig ? trig.label : "New playbook";
  const title = name === null ? auto : name;

  // Who it reaches today: the moment's own count, or this playbook's while it
  // keeps its moment, with the cap as it is set here -- the cards' bar and the
  // approval sheet's reasons (contracts reachLines), before anything is saved.
  const monthly = trigger === "everyone_monthly";
  const base = onList
    ? { candidates: list ? list.candidates || 0 : 0, held: list ? list.held || 0 : 0 }
    : editing && editing.trigger === trigger ? { candidates: editing.candidates || 0, held: editing.held || 0 } : { candidates: trig ? trig.candidates || 0 : 0, held: trig ? trig.held || 0 : 0 };
  const named = onList ? (list && list.named) || null : (editing && editing.trigger === trigger && editing.named) || (trig && trig.named) || null;
  // Who the moment reaches could not be counted (the server's read failed): no count is drawn, as on the cards.
  const counted = named !== null && (onList ? !!list && list.candidates !== null : editing && editing.trigger === trigger ? editing.candidates !== null : !!trig && trig.candidates !== null);
  const capN = Math.max(1, Number(cap) || 1);
  const overCap = visits ? 0 : Math.max(0, base.candidates - capN);
  const will = base.candidates - overCap;
  const pool = Math.max(will + base.held, named ? named.pool : base.candidates + base.held);
  const reasons = named && window.__reachLines
    ? window.__reachLines({ pool: named.pool, will, noNumber: named.noNumber, stopped: named.stopped, noYes: named.noYes, heardThis: 0, heardAny: base.held, overCap, overLimit: 0 }, { trigger, cap_per_run: capN, gap_days: Number(gap), cadence_days: Number(cadence) }).lines.slice(0, 3).map((l) => ({ t: l.words, tone: l.tone, door: l.door }))
    : [base.held > 0 && { t: `${base.held} heard from a playbook this week`, tone: "warn" }, overCap > 0 && { t: `${overCap} wait for the next run — ${capN} a run`, tone: "plain" }].filter(Boolean);
  const of = window.__poolWords ? window.__poolWords(trigger) : null;

  // A moment moved to keeps the message the owner chose when it can send it; one it cannot gives way to that moment's own.
  const chooseMoment = (id) => {
    if (id === trigger) return;
    const t = triggers.find((x) => x.id === id) || null;
    if (picked && tpl && slotsOf(tpl, t) === null) setPicked(false);
    setTrigger(id);
  };
  const chooseMessage = (id) => {
    const r = rowIn(groups.find((g) => g.name === id) || null, tpl ? tpl.language : null);
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };
  const chooseLanguage = (lang) => {
    const r = group ? group.rows.find((x) => x.language === lang) : null;
    if (!r) return;
    setPicked(true);
    setTplId(r.id);
  };

  const save = async () => {
    if (!window.__playbooks || !ready) return;
    setBusy(true);
    setError(null);
    // A list by its token: one of People's is its id (list_key), one of the workspace's own its list (list_id).
    const onWhich = onList && listId ? (listId.startsWith("seg:") ? { list_key: listId.slice(4) } : { list_id: listId.slice(5) }) : {};
    const body = { name: name === null || !name.trim() ? null : name.trim(), trigger, ...onWhich, ...(onList ? { policy_class: cls } : {}), template_id: tpl.id, params: specs, run_hour: Number(hour), cap_per_run: capN, gap_days: Number(gap), cadence_days: Number(cadence) };
    const r = editing ? await window.__playbooks.update(editing.id, body) : await window.__playbooks.create(body);
    setBusy(false);
    if (!r.ok) { setError(r.message || "It could not be saved."); return; }
    work.done();
    onDone(r.data, !!editing);
  };

  const momentChoices = triggers.map((t) => ({ id: t.id, label: t.label, sub: t.hint, icon: pbIcon(t.id), hint: t.candidates === null ? null : t.candidates > 0 ? `${t.candidates} today` : "nobody today" }));
  const messageChoices = groups.slice().sort((a, b) => (starter ? (b.name === starter.name) - (a.name === starter.name) : 0)).map((g) => {
    const r = rowIn(g, tpl ? tpl.language : null);
    return {
      id: g.name,
      label: g.title,
      // Its first words as a customer reads them, so a message is chosen by what it says.
      sub: S && S.rowPreview ? S.rowPreview(r, { business_name: data.businessName, booking_link: link ? "your booking link" : null }) : String(r.body_preview || ""),
      group: starter && g.name === starter.name ? "own" : "all",
      hint: g.rows.length > 1 ? `${g.rows.length} languages` : null,
    };
  });
  const langChoices = group ? group.rows.map((r) => ({ id: r.language, label: pbLabel(r.language), name: pbLangWords(r.language), status: r.meta_status || "approved" })) : PB_NONE;
  const city = window.__clock && window.__clock.city ? window.__clock.city() : data.timezone;
  // The Autonomy row its runs keep to, said by the one chip (PolicyChip) -- and not said at all where there is no row to name.
  const policyRow = trig && window.POLICY && window.POLICY.row ? window.POLICY.row(trig.cls) : null;
  const repeat = monthly ? cadence : gap;
  const say = error ? { tone: "danger", t: error }
    : !trig ? { tone: "plain", t: "Pick the moment it runs on." }
    : !tpl ? { tone: "plain", t: "Pick the message it sends." }
    : missing >= 0 ? { tone: "plain", t: `Fill in “${labels[missing]}” to ${editing ? "save it" : "start it"}.` }
    : null;

  return (
    <window.RecordSheet
      id="playbook"
      testid="pb-composer"
      className="pb-sheet"
      title={(
        <span className="pb-title-wrap">
          <input className="pb-title" value={title} placeholder={auto} onChange={(e) => setName(e.target.value)} maxLength={80} spellCheck={false} aria-label="The playbook's name" data-testid="pb-name" />
          <Icon name="pencil" size={13} />
        </span>
      )}
      sub={editing ? "A change counts from its next run." : "One approved message, to the people a moment names who said yes — each on its own clock. Replies land in the Inbox."}
      onClose={work.leave}
      closeLabel="Cancel"
      foot={(
        <div className="pb-foot">
          {/* Cancel, and Escape, with something changed: the one question first (UnsavedAsk), where the buttons were. */}
          {work.asking ? <window.UnsavedAsk onYes={work.discard} onNo={work.stay} what="saved" testid="pb-leave" /> : (
            <>
              <span className="pb-foot-say" data-tone={say ? say.tone : undefined} role={error ? "alert" : undefined} data-testid={error ? "pb-error" : "pb-foot-say"}>{say ? say.t : null}</span>
              <button type="button" className="btn" onClick={work.leave} data-testid="pb-cancel">Cancel</button>
              <button type="button" className="btn btn-primary" disabled={!ready} onClick={save} data-testid="pb-save">{busy ? "Saving…" : editing ? "Save changes" : "Start it"}</button>
            </>
          )}
        </div>
      )}
    >
      <div className="pb-compose">
        <section className="pb-sec" data-testid="pb-who">
          <span className="pb-sec-k">Who it's for</span>
          <window.CmPicker
            value={trigger}
            choices={momentChoices}
            onPick={chooseMoment}
            label="The moment it runs on"
            search={false}
            fit="trigger"
            triggerClass="pb-pick"
            face={trig ? (
              <>
                <span className="pb-pick-mark" aria-hidden="true"><Icon name={pbIcon(trig.id)} size={15} /></span>
                <span className="pb-pick-text"><span className="pb-pick-title">{trig.label}</span><span className="pb-pick-sub">{trig.hint}</span></span>
              </>
            ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a moment</span></span>}
            testid="pb-moment"
          />
          {/* Which list it runs on (decision 0009): one of People's, or one of the workspace's own, kept by hand or by a
              rule. A list about whoever is looking is never offered: a run has no one looking. */}
          {onList && (lists.length ? (
            <window.CmPicker
              value={listId}
              choices={lists.map((l) => ({ id: l.id, label: l.name, group: l.builtin ? "people" : "own", sub: pbListSub(l), icon: l.builtin || l.smart ? "sparkle" : "filter", hint: l.candidates === null || l.candidates === undefined ? null : l.candidates > 0 ? `${l.candidates} today` : "nobody today" }))}
              groups={PB_LIST_GROUPS}
              onPick={setListId}
              label="The list it runs on"
              search={lists.length > 8}
              fit="trigger"
              triggerClass="pb-pick"
              face={list ? (
                <>
                  <span className="pb-pick-mark" aria-hidden="true"><Icon name={list.builtin || list.smart ? "sparkle" : "filter"} size={15} /></span>
                  <span className="pb-pick-text"><span className="pb-pick-title">{list.name}</span><span className="pb-pick-sub">{pbListSub(list)}</span></span>
                </>
              ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a list</span></span>}
              testid="pb-list"
            />
          ) : <p className="pb-warn" data-testid="pb-no-lists">Keep a list on People first — by hand, or describe who and it keeps itself current.</p>)}
          {/* What a playbook on a list sends, and so which row of Autonomy governs it: an offer, or a win-back. */}
          {onList && (
            <window.CmPicker
              value={cls}
              choices={PB_LIST_CLASSES}
              onPick={setCls}
              label="What it sends"
              fit="trigger"
              triggerClass="pb-pick"
              face={
                <span className="pb-pick-text"><span className="pb-pick-title">{(PB_LIST_CLASSES.find((c) => c.id === cls) || PB_LIST_CLASSES[0]).label}</span><span className="pb-pick-sub">{(PB_LIST_CLASSES.find((c) => c.id === cls) || PB_LIST_CLASSES[0]).sub}</span></span>
              }
              testid="pb-list-class"
            />
          )}
          {trig && counted && <window.CmReach will={will} pool={pool} of={of} held={base.held} reasons={reasons} size="sm" testid="pb-reach" />}
          {visits && data.calendar !== "ok" && <p className="pb-warn" data-testid="pb-calendar">A visit moment reads the calendar: connect it in Settings › Business before a run can send.</p>}
        </section>

        <section className="pb-sec" data-testid="pb-message">
          <span className="pb-sec-k">What it says</span>
          {usable.length > 0 && (
            <div className="pb-msg-head">
              <window.CmPicker
                value={group ? group.name : null}
                choices={messageChoices}
                groups={{ own: "Written for this moment", all: starterGroup ? "Your other messages" : "Your messages" }}
                onPick={chooseMessage}
                label="The message it sends"
                search={messageChoices.length > 7}
                searchWords={{ placeholder: "Search messages", empty: (q) => <>No message called “{q}”</> }}
                note={offered.why}
                fit="trigger"
                triggerClass="pb-pick pb-pick-msg"
                face={tpl ? (
                  <span className="pb-pick-text">
                    <span className="pb-pick-title">{group ? group.title : pbTitle(tpl.name)}</span>
                    <span className="pb-pick-sub">{starter && tpl.name === starter.name ? "Written for this moment" : "Your message"}</span>
                  </span>
                ) : <span className="pb-pick-text"><span className="pb-pick-title is-empty">Pick a message</span><span className="pb-pick-sub">{groups.length === 1 ? "One approved message fits this moment" : `${pbSpell(Math.min(groups.length, 12), true)} approved messages fit this moment`}</span></span>}
                testid="pb-template"
              />
              {tpl && (
                <window.LanguagePicker
                  value={tpl.language}
                  choices={langChoices}
                  onPick={chooseLanguage}
                  status={tpl.meta_status || "approved"}
                  tag={pbShort(tpl.language)}
                  label="The language it goes out in"
                  search={false}
                  note={langChoices.length < 2 ? "A run sends one language to everyone on it. Another is written in Campaigns › Templates." : "A run sends one language to everyone on it."}
                  testid="pb-lang"
                />
              )}
            </div>
          )}
          {!tpl && (
            <div className="pb-empty" data-testid="pb-message-empty">
              {!templatesRead && <FailedRead kind="line" what="your templates" surface="playbooks" testid="pb-templates-failed" />}
              {lost && <p className="pb-empty-line is-warn" data-testid="pb-template-lost">Its message, {pbTitle(editing.template_name)}, is not one it can send any more — WhatsApp no longer approves it. Pick another to save a change.</p>}
              {templatesRead && starter && !starterGroup && (
                <p className="pb-empty-line" data-testid="pb-starter">
                  <Icon name="sparkle" size={12} />
                  <span>
                    {starterAny
                      ? <><b>{starter.title}</b>, written for this moment, {starterAny.meta_status === "pending" ? "is in review at WhatsApp — it appears here once approved, usually within minutes." : `is ${starterAny.meta_status} at WhatsApp — see Campaigns › Templates.`}</>
                      : <>
                          <b>{starter.title}</b> is written for this moment.{" "}
                          {canEdit && window.__templates && window.__templates.addStarters
                            ? <button type="button" className="cl-bucket-link" disabled={adding} onClick={addStarter} data-testid="pb-add-starter">{adding ? "Adding…" : "Add it — WhatsApp reviews it, usually within minutes"}</button>
                            : null}
                        </>}
                  </span>
                </p>
              )}
              {templatesRead && usable.length === 0 && (
                <p className="pb-empty-line" data-testid="pb-no-template">No approved message {starter ? "for this moment " : ""}yet — write one, or sync yours from WhatsApp Manager, in <button type="button" className="cl-bucket-link" onClick={() => window.CHANLY.nav("messages")} data-testid="pb-no-template-open">Templates</button>.</p>
              )}
            </div>
          )}
          {/* No stamp: a playbook knows the hour it runs at, not the instant its
              next run lands, and the sentence below says the hour in words. */}
          {tpl && <div className="pb-preview" data-testid="pb-preview"><window.MessagePreview from={data.businessName} body={tpl.body_preview} values={shown} header={tpl.header} footer={pbFooter(tpl)} buttons={tpl.buttons} /></div>}
          {tpl && vars.length > 0 && (
            <div className="pb-fills" data-testid="pb-vars">
              {vars.map((v, i) => {
                const src = srcOf(i);
                const c = choices[i] || PB_TEXT;
                const hint = src !== "text" ? HINTS[src] : null;
                return (
                  <div key={v.position || i} className={`pb-fill${src === "text" ? " is-typed" : ""}`} data-kind={src} data-testid="pb-fill">
                    <span className="pb-fill-key" id={`pb-fill-${i}`}>{labels[i]}</span>
                    {src === "text"
                      ? <input className="pb-fill-input" value={textOf(i)} placeholder={c[0] === "business_name" ? data.businessName || "" : v.example ? String(v.example) : ""} maxLength={1024} onChange={(e) => setText(i, e.target.value)} aria-labelledby={`pb-fill-${i}`} data-testid="pb-fill-input" />
                      : (
                        <span className="pb-fill-val" data-tip={hint || undefined}>
                          <span className="pb-fill-words">{src === "business_name" && data.businessName ? data.businessName : SRC[src] || src}</span>
                          {hint && <span className="pb-fill-hint">{hint}</span>}
                        </span>
                      )}
                    {c.length > 1 && (
                      <span className="pb-fill-src" data-tip="What fills it">
                        <Icon name={src === "text" ? "pencil" : "chevrons"} size={12} />
                        <select value={src} onChange={(e) => chooseFill(i, e.target.value)} aria-label={`What fills ${labels[i]}`} data-testid="pb-fill-source">
                          {c.map((k) => <option key={k} value={k}>{SRC[k] || k}</option>)}
                        </select>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="pb-sec" data-testid="pb-clock">
          <span className="pb-sec-k">When it runs</span>
          <p className="pb-when">
            Every day at <PbTok value={hour} options={pbHours().map((h) => ({ v: h, t: pbHour(h) }))} onChange={setHour} label="The hour it runs at" testid="pb-hour" />{city ? ` ${city} time` : ""}
            {visits
              ? <>, to {trigger === "visit_tomorrow" ? "everyone with a visit the next day" : "everyone who came in the day before"} — one message per visit.</>
              : <>
                  , up to <PbTok value={cap} options={pbWith(PB_CAPS, Number(cap)).map((n) => ({ v: n, t: String(n) }))} onChange={setCap} label="The most one run sends" testid="pb-cap" /> {Number(cap) === 1 ? "person" : "people"} a run.{" "}
                  {/* A follow-up is owed once per proposal (0006): there is no gap to choose. */}
                  {trig && trig.kind === "deal"
                    ? <>One message per proposal.</>
                    : <>No one hears it more than once every <PbTok value={repeat} options={pbWith(monthly ? PB_CADENCES : PB_GAPS, Number(repeat)).map((n) => ({ v: n, t: `${n} days` }))} onChange={monthly ? setCadence : setGap} label={monthly ? "How often the same person hears it" : "The days before the same person hears it again"} testid="pb-gap" />.</>}
                </>}
          </p>
          <div className="pb-rules-line">
            {policyRow && <span className="pb-runs-under" data-testid="pb-runs-under"><span>Runs under</span><PolicyChip cls={trig.cls} /></span>}
            <span className="pb-guard" tabIndex={0} data-tip={pbGuardWords(trig && trig.kind)} aria-description={pbGuardWords(trig && trig.kind)} data-testid="pb-guard"><Icon name="shield" size={12} /> Guardrails</span>
          </div>
        </section>

        {data.number && data.number.present && !data.number.health.canSend && <p className="pb-warn" data-testid="pb-number">{data.number.health.refusal}</p>}
        {data.number && !data.number.present && <p className="pb-warn" data-testid="pb-number">No WhatsApp number connected — connect one in Settings › Connections before a run can send.</p>}
      </div>
    </window.RecordSheet>
  );
};

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

const PlaybooksReal = ({ initialPlaybook = null }) => {
  const data = usePlaybooks();
  const [toastNode, flash] = window.usePPToast();
  // Who may start, change or run a playbook: the role store's answer, View-as included.
  const canAct = !!(window.canDo && window.canDo("approve"));
  // A playbook half-written when the page was left opens again as the page does: the tab kept its words
  // (useUnsavedWork), a new one under "new" and a change under the playbook's id.
  const draftOf = (key) => !!(window.tabDraft && window.tabDraft("playbook", key));
  const [composing, setComposing] = React.useState(() => draftOf("new"));
  const [editing, setEditing] = React.useState(() => (data.rows || PB_NONE).find((p) => draftOf(p.id)) || null);
  // The moment an empty slot was pressed for, so the composer opens on it rather
  // than on whichever trigger happens to be first.
  const [slot, setSlot] = React.useState(null);
  // The one playbook open in place across the grid: the link's, when a link named
  // one (Templates' "Win-back playbook", Today's run), else none.
  const [openId, setOpenId] = React.useState(initialPlaybook);
  const followed = React.useRef(initialPlaybook);
  React.useEffect(() => {
    if (followed.current === initialPlaybook) return;
    followed.current = initialPlaybook;
    setOpenId(initialPlaybook);
  }, [initialPlaybook]);
  React.useEffect(() => {
    const open = () => { setEditing(null); setSlot(null); setComposing(true); };
    window.addEventListener("playbooks:new", open);
    return () => window.removeEventListener("playbooks:new", open);
  }, []);
  // A link to one playbook lands on its card: marked, and brought into view when it is out of it.
  React.useEffect(() => {
    const el = initialPlaybook && typeof document !== "undefined" && document.getElementById ? document.getElementById(`pb-${initialPlaybook}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [initialPlaybook]);

  const rows = data.rows || PB_NONE;
  // Every moment, in its own order: the playbooks doing one, as rows, and under
  // them the moments nothing is doing yet, as a compact group -- so a first day
  // still names every moment it could act on, and a busy one shows which is idle
  // without an idle moment taking a working playbook's room.
  const triggers = data.triggers || PB_NONE;
  const known = new Set(triggers.map((t) => t.id));
  const usedTriggers = new Set(rows.map((p) => p.trigger));
  const unused = triggers.filter((t) => !usedTriggers.has(t.id));
  const cards = [];
  for (const t of triggers) rows.filter((p) => p.trigger === t.id).forEach((p) => cards.push(p));
  rows.filter((p) => !known.has(p.trigger)).forEach((p) => cards.push(p));
  const runningN = rows.filter((p) => p.state === "running" && !p.totals.waiting).length;
  const waitingN = rows.filter((p) => p.totals.waiting).length;
  const pausedN = rows.filter((p) => p.state === "paused").length;
  const nobody = rows.filter((p) => pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting: p.totals.waiting }) === "nobody");
  const reachesNobody = nobody.length;
  const closeComposer = () => { setComposing(false); setEditing(null); setSlot(null); };
  const startAt = (id) => { setEditing(null); setSlot(id); setComposing(true); };
  const startNew = () => { setEditing(null); setSlot(null); setComposing(true); };
  // How the moments stand, as the head's one line: the numbers the rows below add up to.
  const tally = [
    { n: runningN, k: "running", tone: "plain" },
    waitingN > 0 && { n: waitingN, k: "waiting on you", tone: "warn" },
    pausedN > 0 && { n: pausedN, k: "paused", tone: "plain" },
    unused.length > 0 && { n: unused.length, k: "not set up", tone: "dim" },
  ].filter(Boolean);
  // What the three rules that shape every run are, said once under the cards: the
  // sending hours, the weekly breath across playbooks, and the gap before the same
  // playbook reaches the same person again -- the one number a playbook sets itself.
  const hours = window.__clock && window.__clock.hours;
  const gaps = [...new Set(rows.map((p) => p.gap_days))];

  return (
    <div className="reports pb-page" data-testid="playbooks-real">
      <div className="rp-body cm-page pb-body">
        {/* One line, the way every Campaigns tab opens: the tab says "Playbooks", so
            the name is a screen reader's alone (CmHead quiet). The line is how the
            moments stand -- running, waiting on you, paused, not set up -- in the
            numbers the rows below add up to; it was a headline, a two-line sentence
            and a tally of big figures saying them twice. A running playbook with
            nobody to send to is the one thing the rows alone would not say at a
            glance, and on a workspace whose list has emptied it is true of every one
            of them: it rides the line, in the tone of something to look at. The act
            is at the right, where Broadcasts and Templates keep theirs; it was the
            top bar's. */}
        <window.CmHead
          title="Playbooks"
          quiet
          testid="pb-standing"
          sub={(
            <span className="pb-standing" data-tip="Standing rules your receptionist runs — one approved template to newly eligible people who said yes, on your clock, under Settings › Autonomy. Replies land in the Inbox.">
              {rows.length === 0
                ? <span>{triggers.length > 0 ? `${pbSpell(triggers.length, true)} moments, none set up yet` : "No playbook yet"}</span>
                : tally.map((t, i) => (
                    <React.Fragment key={t.k}>
                      {i > 0 && <window.CmDot />}
                      <span className="pb-tally-cell" data-tone={t.tone}>
                        <span className="pb-tally-n tabular">{t.n}</span>
                        <span className="pb-tally-k">{t.k}</span>
                      </span>
                    </React.Fragment>
                  ))}
              {reachesNobody > 0 && (
                <>
                  {/* In its tone and a step apart, with no dot before it: where the line wraps, a dot was left at
                      the end of the numbers pointing at nothing. One is named -- "Welcome has nobody to send to"
                      says which row to open, where "One running with nobody to send to" left the owner to find it. */}
                  <span className="pb-standing-warn" data-testid="pb-reaches-nobody">{reachesNobody === 1 ? `${nobody[0].name} has nobody to send to` : reachesNobody === runningN + waitingN ? "None of them has anyone to send to" : `${pbSpell(reachesNobody, true)} have nobody to send to`}</span>
                </>
              )}
            </span>
          )}
          right={<button className="btn btn-primary" onClick={startNew} data-testid="pb-new" {...window.gate("approve", "start a playbook")}><Icon name="plus" size={12} /> <span>New<span className="cm-act-noun"> playbook</span></span></button>}
        />
        {initialPlaybook && !rows.some((p) => p.id === initialPlaybook) && (
          <EmptyState kind="line" title="That playbook isn't here any more." body="Its runs stay in Broadcasts, with their numbers." testid="pb-gone" />
        )}
        {rows.length > 0 && data.templates === null && (
          <FailedRead kind="line" what="your templates" body="The cards show what they send once they read. Everything else here is current." surface="playbooks" testid="pb-cards-templates-failed" />
        )}
        {/* The server could not count who a moment reaches: said once, here, and no card draws a zero it never
            counted -- it drew "0 of 0", "nobody to send to" and the QR over a People read that failed. */}
        {(cards.length > 0 || unused.length > 0) && data.countsRead === false && (
          <FailedRead kind="line" what="who each moment reaches" body="The cards show who they reach once it reads. Everything else here is current." surface="playbooks" testid="pb-counts-failed" />
        )}
        {/* The playbooks, as People's table: the columns named once above the rows. */}
        {cards.length > 0 && (
          <div className="pb-list">
            <div className="pb-list-head" aria-hidden="true">
              <span>Playbook</span>
              <span>State</span>
              <span>Reaches</span>
              <span>Next run</span>
              <span className="pb-list-head-runs">Runs</span>
            </div>
            {cards.map((p) => (
              <PlaybookTile key={p.id} p={p} canAct={canAct} flash={flash} open={openId === p.id} onOpen={() => setOpenId((o) => (o === p.id ? null : p.id))} focus={p.id === initialPlaybook} onEdit={(e) => { setComposing(false); setEditing(e); }} />
            ))}
          </div>
        )}
        {/* The moments nothing is doing yet, in their own order. They stay where they
            are while the composer is open: it opens beside the page, and the page
            does not move under it. */}
        {unused.length > 0 && (
          <section className="pb-more" aria-label="Not set up">
            <div className="pb-more-head" aria-hidden="true">
              <span className="pb-more-k">Not set up</span>
              <span className="tally">{unused.length}</span>
            </div>
            <div className="pb-more-list">
              {unused.map((t) => <PlaybookSlot key={`slot:${t.id}`} t={t} onStart={startAt} />)}
            </div>
          </section>
        )}
        {rows.length === 0 && unused.length === 0 && !composing && (
          <EmptyState
            kind="card"
            glyph="bolt"
            title="No playbook yet"
            body="Win-back for anyone quiet 30 days, welcome for anyone new this week, save our number for anyone who only ever phoned, or the month's offer for everyone who said yes."
            action={{ label: "New playbook", onClick: () => window.dispatchEvent(new CustomEvent("playbooks:new")), gate: window.gate ? window.gate("approve", "start a playbook") : null }}
            testid="pb-empty"
          />
        )}
        {/* The three rules that quietly shape every run, under the rows they shape: one
            quiet line, each rule's longer words its hover. They were a 78px card of
            three headed columns. */}
        {(cards.length > 0 || unused.length > 0) && (
          <p className="pb-rules" data-testid="pb-always">
            <span className="pb-rules-k">Always on</span>
            {/* Each rule's longer words are its hover, and a focus's: reachable from a keyboard and read to a screen
                reader (aria-description), as the composer's Guardrails are. */}
            {[
              { icon: "clock", words: `Sends ${hours ? hours.range : "9:00–20:59"}`, more: "A run that would land outside them waits for the morning" },
              { icon: "wave", words: "One a week, per person", more: "Across every playbook, not per playbook" },
              {
                icon: "refresh",
                words: gaps.length === 1 ? `${gaps[0]} days between repeats` : "Days between repeats",
                more: gaps.length === 1 ? "The same playbook will not reach the same person sooner" : "Each playbook keeps its own gap before reaching the same person again",
              },
            ].map((r) => (
              <span key={r.icon} className="pb-rule" tabIndex={0} data-tip={r.more} aria-description={r.more}>
                <Icon name={r.icon} size={12} />
                {r.words}
              </span>
            ))}
          </p>
        )}
        {!canAct && rows.length > 0 && <div className="bc-excl-hint" data-testid="pb-role">{window.gateTitle("approve", "pause, run, change or delete a playbook")}</div>}
      </div>

      {/* The composer, in a sheet beside the page: last, so the page's own
          parts keep their place whether it is open or not. */}
      {(composing || editing) && (
        <PlaybookComposer
          key={editing ? editing.id : slot || "new"}
          data={data}
          editing={editing}
          initialTrigger={slot}
          onCancel={closeComposer}
          onDone={(d, changed) => {
            closeComposer();
            flash({ msg: changed ? <><b>{d.name}</b> changed</> : <><b>{d.name}</b> is running — its next run is on the card, by your clock</> });
          }}
        />
      )}

      {toastNode}
    </div>
  );
};

window.PlaybookCard = PlaybookCard; // drawn on its own by confirm.test.mjs (the delete that was two clicks on one button)
window.PlaybookComposer = PlaybookComposer; // and by campaigns-drafts.test.mjs (a slot pressed over a draft: the stub cannot remount on a key)
window.OutboundPage = (props) => {
  const Seed = window.OutboundSeed;
  if (window.__PLAYBOOKS) return <PlaybooksReal {...props} />;
  return Seed ? <Seed {...props} /> : null;
};
