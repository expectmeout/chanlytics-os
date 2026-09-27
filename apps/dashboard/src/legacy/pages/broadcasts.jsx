
// broadcasts-run.jsx, which loads before this file.
const { BC_NONE, BroadcastDetail, BC_LIVE, BcRunVerbs } = window;
// broadcasts-ledger.jsx, which loads before this file.
const { bcOrigin, BcRunCard, BcBand, BcHistoryStats, BcWeek } = window;/* global React, Icon, Confirm, EmptyState, FailedRead */
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
// What each slot of a template may take on a broadcast, its default first (contracts templateSlots): a starter's
// first name is each person's own, its business name and booking link may be typed over, and a slot on a template
// written elsewhere may take anything, its guess first. Every slot took any source, so a first name could be set to
// the booking link and a broadcast greeted everyone "Hi your booking link". A broadcast has no visit, so a visit's
// time and service are nobody's here, nor a proposal's link (0006): null when a slot can take nothing. With no library,
// every slot is typed.
const BC_TEXT = ["text"];
const bcSlots = (t, bookingLink) => (window.__starters && window.__starters.slots
  ? window.__starters.slots(t, { visits: false, bookingLink, proposal: false })
  : (Array.isArray(t.variables) ? t.variables : BC_NONE).map(() => BC_TEXT));

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

// BroadcastsReal, below, calls its hooks in the order it always has, each holding one concern; plain functions work out
// what its screens say, on every draw as before, and return the elements they draw.

// What can be offered: every template this product can put on the wire, in the library's order, and of those the
// ones whose every slot a broadcast can fill.
const useBcOffered = (data) => {
  // Only what this product can actually put on the wire. `sendTemplate` sends the
  // body alone, so a template needing a value in a heading or a button is refused
  // by Meta for EVERY recipient -- and the composer used to offer it, pass its own
  // "every slot filled" check, and enrol them all.
  const offered = React.useMemo(() => (window.__starters && window.__starters.sendable
    ? window.__starters.sendable((data.templates || BC_NONE).slice().sort(bcOrder))
    : { sendable: (data.templates || BC_NONE).slice().sort(bcOrder), blocked: BC_NONE, why: null }), [data.templates]);
  // And of those, only one whose every slot a broadcast can fill (bcSlots). The visit's reminder is a visit
  // playbook's: offered here, its time and service were typed once for everyone.
  const link = !!data.bookingLink;
  const templates = React.useMemo(() => offered.sendable.filter((t) => bcSlots(t, link) !== null), [offered, link]);
  return { offered, link, templates };
};

// Who a send goes to, and whether the send screen is open: the send the tab kept, and the list a link names.
const useBcList = (initialSegment, audiences) => {
  // A send half-written when the page was left: the tab kept it (useUnsavedWork), and the screen opens again on it,
  // with its list, its message and its words -- unless a link names a list, which wins the list.
  const [kept] = React.useState(() => (window.tabDraft ? window.tabDraft("broadcast") : null));
  const [aud, setAud] = React.useState(() => {
    const first = audiences.find((a) => (a.kind === "saved" || a.kind === "list") && a.id === initialSegment) || audiences[0];
    if (!initialSegment && kept && audiences.some((a) => bcKey(a) === kept.aud)) return kept.aud;
    return first ? bcKey(first) : "everyone:";
  });
  // The composer is its own screen, opened by New broadcast -- and by a link that
  // names a list ("Broadcast to this list" on People), which is asking to write one.
  const [writing, setWriting] = React.useState(!!initialSegment || !!kept);
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
  return { kept, aud, setAud, writing, setWriting };
};

// The words of the send, kept or fresh: the values typed into its slots and what fills each, the template it writes
// here, its name, its time, and whether it is on its way.
const useBcWords = (kept) => {
  const [params, setParams] = React.useState((kept && kept.params) || {});
  const [sources, setSources] = React.useState((kept && kept.sources) || {});
  // A template half-written inside the send is kept under its own kind, and opens again with the send.
  const [composing, setComposing] = React.useState(() => !!(kept && window.tabDraft && window.tabDraft("template", "new")));
  const [name, setName] = React.useState((kept && kept.name) || "");
  const [whenAt, setWhenAt] = React.useState(kept && kept.whenAt != null ? kept.whenAt : null);
  const [busy, setBusy] = React.useState(false);
  // The words of the send -- a name, a value typed into a slot, a time picked -- are what is kept and what Cancel asks
  // about; the list and the message are choices, and a choice alone keeps nothing. Sent, or thrown away, they clear.
  const wrote = !!name.trim() || whenAt !== null || Object.values(params).some((w) => (w || []).some((v) => String(v || "").trim()));
  const clearWords = () => { setName(""); setWhenAt(null); setParams({}); setSources({}); };
  return { params, setParams, sources, setSources, composing, setComposing, name, setName, whenAt, setWhenAt, busy, setBusy, wrote, clearWords };
};

// Now, for the minutes until a run goes: ticking only while a run is under an hour away.
const useBcNow = (data) => {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const at = Date.now();
    const soon = (data.rows || []).some((r) => r.state === "scheduled" && r.scheduled_for && Date.parse(r.scheduled_for) > at && Date.parse(r.scheduled_for) - at < 3_600_000);
    if (!soon) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [data.rows]);
  return now;
};

// A link lands on its run: its report brought into view when the page it replaced was scrolled past where it opens.
const useBcRunLanding = (openId) => {
  React.useEffect(() => {
    const el = openId && typeof document !== "undefined" && document.getElementById ? document.getElementById(`bc-run-${openId}`) : null;
    if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
    const at = el.getBoundingClientRect();
    if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
  }, [openId]);
};

// The yes: the section that gets it, open where the address or a press asks for it, and the send screen's door to it.
const useBcYes = (initialYes, data, setWriting) => {
  // broadcasts/get-yes: the section that answers "nobody has said yes to
  // offers", opened and brought into view -- it sits on the ledger under the runs,
  // folded to its one line, where a person sent here to find the QR would otherwise
  // have to scroll for it and open it.
  const [yesOpen, setYesOpen] = React.useState(!!initialYes);
  const showYes = () => {
    setYesOpen(true);
    const el = typeof document !== "undefined" && document.getElementById ? document.getElementById("bc-optin") : null;
    // Opened before it is brought into view: scrolled to while folded, the section is the page's last line, so the
    // scroll stops at the page's end and it then opens below the screen's foot, under a phone's tab bar (#663).
    const fold = el && el.querySelector ? el.querySelector("details") : null;
    if (fold) fold.open = true;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "start" });
  };
  React.useEffect(() => { if (initialYes) showYes(); }, [initialYes]);
  // The send screen's own door to it: the ledger drawn in the send's place, then
  // the section brought into view the same way. Counted, so that every press
  // lands, whether or not the address changes -- a send written from
  // broadcasts/get-yes keeps its address.
  const [yesAsked, setYesAsked] = React.useState(0);
  React.useEffect(() => { if (yesAsked) showYes(); }, [yesAsked]);
  const toYes = () => { setWriting(false); setYesAsked((n) => n + 1); window.CHANLY.nav(data.getYes); };
  // That door, in the sentence that says nobody has the yes: drawn when the
  // ledger draws the card, which takes a number to put in the QR. The sentence
  // pointed at "the phrase and QR below", and nothing is below the send.
  const yesDoor = data.optIn && data.optIn.link && data.getYes
    ? <>, or <button type="button" className="bc-nobody-door" onClick={toYes} data-testid="bc-nobody-door">get their yes with the phrase and the QR</button></>
    : null;
  return { yesOpen, setYesOpen, yesDoor };
};

// Who the send reaches with the message picked: the list, how many on it this message may reach, and the number it
// goes from.
const bcReachOf = ({ audiences, aud, templates, tplId, data }) => {
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
  return { active, tpl, purpose, sizeOf, activeCount, number, numberOk, overLimit };
};

// What each slot of the message may take, and what it takes now.
const bcSlotChoicesOf = ({ tpl, link, sources, tplId, data }) => {
  const vars = tpl && Array.isArray(tpl.variables) ? tpl.variables : [];
  const SRC = (window.__starters && window.__starters.sources) || { text: "Type it" };
  const HINTS = (window.__starters && window.__starters.sourceHints) || {};
  // What each slot may take, its default first: a starter's slots come filled in,
  // and a template written elsewhere gets a guess from its labels. A booking link
  // the workspace has not set can only be typed, so nothing is offered that
  // cannot be sent.
  const choices = tpl ? bcSlots(tpl, link) || BC_NONE : BC_NONE;
  // A slot's source: the one chosen when the slot may take it, else its first. A
  // source kept from before that the slot may not take -- a run sent again, a
  // link since removed -- is not kept.
  const srcOf = (i) => { const c = choices[i] || BC_TEXT; const s = (sources[tplId] || BC_NONE)[i]; return c.includes(s) ? s : c[0]; };
  const exampleOf = (kind) => (kind === "first_name" ? "Dani" : kind === "business_name" ? (data.businessName || "the business") : kind === "booking_link" ? "your booking link" : "");
  // Each slot's words: a starter's own, else the labels the row carries.
  const labels = tpl && window.__starters ? window.__starters.slotLabels(tpl) : vars.map((v, i) => v.label || `Value ${v.position || i + 1}`);
  return { vars, SRC, HINTS, choices, srcOf, exampleOf, labels };
};

// The words each slot holds, what the preview shows for them, what goes out, and whether it can go.
const bcSlotWordsOf = ({ vars, params, tplId, setParams, setSources, srcOf, data, exampleOf, labels, tpl, active, activeCount, busy, numberOk, overLimit }) => {
  const typed = vars.map((v, i) => ((params[tplId] || [])[i] || ""));
  const setTyped = (i, words) => setParams((p) => { const next = [...(p[tplId] || [])]; next[i] = words; return { ...p, [tplId]: next }; });
  const chooseSource = (i, kind) => {
    const was = srcOf(i);
    setSources((s) => { const next = [...(s[tplId] || [])]; next[i] = kind; return { ...s, [tplId]: next }; });
    // Typing over the business name starts from it, as on a playbook.
    if (kind === "text" && was === "business_name" && !typed[i].trim() && data.businessName) setTyped(i, data.businessName);
  };
  const filled = vars.map((v, i) => (srcOf(i) === "text" ? typed[i] : exampleOf(srcOf(i))));
  // The preview shows an unfilled slot by its name, never as {{n}}.
  const previewValues = vars.map((v, i) => (srcOf(i) === "text" ? (typed[i].trim() || `[${labels[i]}]`) : exampleOf(srcOf(i))));
  const specs = vars.map((v, i) => (srcOf(i) === "text" ? typed[i].trim() : { kind: srcOf(i) }));
  const ready = !!tpl && !!active && activeCount > 0 && filled.every((v) => String(v).trim()) && !busy && numberOk && !overLimit;
  const shown = previewValues.map((v) => String(v).trim());
  return { typed, setTyped, chooseSource, filled, previewValues, specs, ready, shown };
};

// The people behind the count, and what the line under the list says about them.
const bcPeopleOf = ({ active, purpose, activeCount }) => {
  // Who the preview is drawing it for. The bridge keeps a handful of the rows the
  // count is a length of; a surface cached before they were published has none,
  // and then the composer shows the example values as it always did.
  const sample = (active && active.preview && active.preview[purpose]) || null;
  const people = sample ? sample.people : BC_NONE;
  // Nobody on it can be sent this, and somebody on it said yes: the ones who did have no number to send to. Said in
  // People's words (#663), with no door -- asking for their yes would ask for an answer they gave.
  const noNumber = active && activeCount === 0 && sample && sample.saidYes > 0 && window.__broadcasts && window.__broadcasts.noNumberWords
    ? window.__broadcasts.noNumberWords(`“${active.label}”`, purpose)
    : null;
  // How many on it said yes, for the line under the audience (contracts saidYesWords): who it reaches, and who said
  // yes when nobody can be sent it -- "0 people … said yes" stood right over the no-number line, and was false.
  const yesWords = active && window.__broadcasts && window.__broadcasts.saidYesWords
    ? window.__broadcasts.saidYesWords(`“${active.label}”`, purpose, activeCount, (sample && sample.saidYes) || 0)
    : null;
  return { sample, people, noNumber, yesWords };
};

// The one person the preview is drawn for, what they read, and when it lands.
const bcPreviewOf = ({ people, who, shown, vars, srcOf, whenAt, data }) => {
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
  return { person, forPerson, noName, personNote, goesAt, maxDays, whenNote };
};

// Stop and approve, on a run: each said the moment the server takes it.
const bcRunActs = ({ canSend, stopping, setStopping, setArmId, flash, approvingRef, setApproving }) => {
  const cancel = async (row) => {
    if (!window.__broadcasts || stopping || !canSend) return false;
    setStopping(row.id);
    // Said the moment the server takes it, from what it answered; the ledger repaints from the re-read behind it.
    let said = false;
    const say = (data) => {
      said = true;
      setStopping(null);
      setArmId(null);
      flash({ tone: "ok", msg: <><b>{row.name}</b> {data.was === "sending" ? "stops after this batch" : data.was === "pending_approval" ? "skipped — nothing will send" : "canceled — nothing will send"}</> });
    };
    const r = await window.__broadcasts.cancel(row.id, { onAccepted: say });
    if (!r.ok) {
      setStopping(null);
      setArmId(null);
      flash({ tone: "danger", msg: <>{r.message}</> });
    } else if (!said) say(r.data);
    return r.ok;
  };
  const approve = async (row, words = null) => {
    if (!window.__broadcasts || !canSend || approvingRef.current) return false;
    approvingRef.current = row.id;
    setApproving(row.id);
    // Said the moment the server takes it, from what it answered: how many, and when it really goes.
    let said = false;
    const say = (data) => {
      said = true;
      approvingRef.current = null;
      setApproving(null);
      flash({ tone: "ok", msg: typeof words === "string" ? <>{words}</> : <><b>{row.name}</b> approved — {data.recipient_count} {data.recipient_count === 1 ? "person" : "people"}, {bcWhenWords(data)}</> });
    };
    const r = await window.__broadcasts.approve(row.id, { onAccepted: say });
    if (!r.ok) {
      approvingRef.current = null;
      setApproving(null);
      flash({ tone: "danger", msg: <>{r.message}</> });
    } else if (!said) say(r.data);
    return r.ok;
  };
  return { cancel, approve };
};

// The send, and the starter set added from the send screen.
const bcSendActs = ({ ready, canSend, setBusy, tpl, specs, active, whenAt, name, setArmed, flash, work, clearWords, setWriting, data, cancel, addingStarters, setAddingStarters }) => {
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
    work.done();
    clearWords();
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
  return { submit, addStarters };
};

// The ledger's runs: what is open, what went, the list under the band, and the run the address opens.
const bcLedgerOf = ({ data, origin, band, canSend, now, openRun, armId, setArmId, stopping, approving, approve, cancel, openId }) => {
  const rows = data.rows || [];
  const open = rows.filter((r) => r.open);
  const history = rows.filter((r) => !r.open);
  const shownHistory = origin ? history.filter((r) => bcOrigin(r) === origin) : history;
  // The list under the band: a band's runs when one is pressed; else everything
  // open -- what waits on you first, then what is going out, then what is to come
  // -- and the latest five gone, with the way to the rest.
  const RANK = { pending_approval: 0, sending: 1, scheduled: 2 };
  const openRows = open.slice().sort((a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3) || String(a.scheduled_for || "").localeCompare(String(b.scheduled_for || "")));
  const recent = shownHistory.slice(0, 5);
  const runs = band ? rows.filter((r) => r.state === band && (r.open || !origin || bcOrigin(r) === origin)) : [...openRows, ...recent];
  const sentN = rows.filter((r) => r.state === "sent").length;
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
  return { rows, open, history, shownHistory, openRows, recent, runs, sentN, runCard, openRow };
};

// A run waiting on you, open: its sheet. Where it sits among the runs waiting (the ledger's order), its playbook
// and its template for the words, and the acts -- which, when they land, open the next run waiting, or the ledger.
const bcSheetOf = ({ openRows, data, openRun, canSend, armId, setArmId, stopping, approving, approve, cancel }) => {
  const sheetFor = (row) => {
    if (!row || row.state !== "pending_approval") return null;
    const queue = openRows.filter((r) => r.state === "pending_approval");
    const at = queue.findIndex((r) => r.id === row.id);
    const rest = queue.filter((r) => r.id !== row.id);
    const next = rest[Math.min(Math.max(at, 0), rest.length - 1)] || null;
    const pb = window.__PLAYBOOKS && Array.isArray(window.__PLAYBOOKS.rows) ? window.__PLAYBOOKS.rows.find((p) => p.id === row.playbook_id) || null : null;
    const pool = [...(data.templates || BC_NONE), ...(window.__TEMPLATES_ALL || BC_NONE)];
    const template = pool.find((t) => t.id === row.template_id) || pool.find((t) => t.name === row.template_name && t.language === row.template_language) || null;
    const onward = () => openRun(next ? next.id : null);
    return {
      position: at >= 0 ? [at + 1, queue.length] : null,
      canSend,
      playbook: pb,
      template,
      businessName: data.businessName || "",
      armed: armId === row.id,
      onArm: (on) => setArmId(on ? row.id : null),
      stopping: stopping === row.id,
      approving: approving === row.id,
      approve: async (words) => { if (await approve(row, typeof words === "string" ? words : null)) onward(); },
      skip: async () => { if (await cancel(row)) onward(); },
    };
  };
  return { sheetFor };
};

// Send it again: the send screen, filled with what this run sent -- its template, its list and its values -- when
// all three can still go. A template WhatsApp no longer approves or a broadcast cannot fill, a list since deleted, or
// a playbook's run (whose playbook sends it again) offers no button rather than a composer quietly filled with
// something else.
const bcAgainOf = ({ canSend, templates, audiences, link, setAud, setTplId, setSources, setParams, setName, setWhenAt, setWriting, openRun }) => {
  const againFor = (b) => {
    if (!canSend || b.playbook_id) return null;
    const t = templates.find((x) => x.id === b.template_id);
    const a = audiences.find((x) => bcKey(x) === bcKey(b.audience || {}));
    if (!t || !a) return null;
    // What filled each slot, where the slot may still take it; else its first choice. A run whose first name was
    // filled by the booking link is sent again with each person's own.
    const may = bcSlots(t, link) || BC_NONE;
    const kinds = (b.params || []).map((p, i) => { const c = may[i] || BC_TEXT; return p && c.includes(p.kind) ? p.kind : c[0]; });
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
  return { againFor };
};

// The run's own screen: its report, with its verbs at the head when it is still live.
const bcRunSolo = ({ openId, openRun, openRow, canSend, armId, setArmId, stopping, approving, approve, cancel, againFor, sheetFor }) => (
        <section className="bc-run-solo" id={`bc-run-${openId}`} data-testid="bc-run-solo">
          <BroadcastDetail
            id={openId}
            onClose={() => openRun(null)}
            acts={openRow && BC_LIVE.has(openRow.state)
              ? <BcRunVerbs row={openRow} canSend={canSend} armed={armId === openRow.id} onArm={(on) => setArmId(on ? openRow.id : null)} stopping={stopping === openRow.id} approving={approving === openRow.id} approve={approve} cancel={cancel} />
              : null}
            again={againFor}
            sheet={sheetFor(openRow)}
          />
        </section>
);

// Who: the lists as chips with the count this message reaches on each, the people behind the count, and why anyone
// on it is held back.
const bcColWho = ({ audiences, active, sizeOf, setAud, data, sample, people, who, setWho, yesWords, purpose, overLimit, number, activeCount, canSend, noNumber, yesDoor }) => (
          <div className="bc-col" data-testid="bc-col-who">
            <span className="bc-col-label">Who</span>
            <div className="bc-chips" style={{ flexWrap: "wrap" }}>
              {audiences.map((a) => (
                <button key={bcKey(a)} className={"bc-chip" + (active && bcKey(active) === bcKey(a) ? " active" : "")} onClick={() => setAud(bcKey(a))} title={a.hint} data-testid="bc-audience">
                  {a.label} <span className="bc-chip-count tabular">{sizeOf(a)}</span>
                </button>
              ))}
              {data.listsRead === false && <FailedRead kind="line" what="your saved lists" body="People's lists are current; the lists you made are missing until they read." surface="broadcasts" testid="bc-lists-failed" />}
            </div>
            <BcAudience sample={sample} people={people} who={who} onWho={setWho} />
            <div className="bc-meta">
              <Icon name="shield" size={11} />
              <span>
                {active ? yesWords : "Pick who this goes to"}
                {" · "}people who asked to stop, have no number, or are mid-thread with a person are held back at the wire{data.chunk ? ` · sent ${data.chunk} at a time` : ""}
              </span>
            </div>
            {/* Said once, here, where an offer is picked: why a customer who only ever
                texted is not in an offer's count. The wire refuses per customer
                (sms_carries_no_promotions); the page states the rule. */}
            {purpose === "marketing" && data.offersNote && <div className="bc-excl-hint" data-testid="bc-offers-note">{data.offersNote}</div>}
            {/* Who of these already heard from a run this week: a send by hand is not held back by the week a playbook
                waits, so the owner is told here, before it goes (contracts heardWords). */}
            {active && sample && sample.heard > 0 && window.__broadcasts && window.__broadcasts.heardWords && (
              <div className="bc-excl-hint" data-testid="bc-heard">{window.__broadcasts.heardWords(sample.heard)}</div>
            )}
            {overLimit && active && number && (
              <div className="bc-excl-hint" data-testid="bc-over-limit">This number can start up to {number.health.limitPerDay.toLocaleString()} new conversations a day; “{active.label}” is {activeCount.toLocaleString()}. Send to a smaller list or split it.</div>
            )}
            {canSend && active && activeCount === 0 && (
              <div className="bc-excl-hint" data-testid="bc-nobody">
                {noNumber
                  ? noNumber
                  : purpose === "marketing"
                  ? <>Nobody on “{active.label}” has said yes to offers yet — that is a separate answer from saying yes to messages. Record it under “Offers and news” on their profile{yesDoor}.</>
                  : <>Nobody on “{active.label}” has said yes to messages yet. Record it on their profile{yesDoor}.</>}
              </div>
            )}
          </div>
);

// What: the messages as chips (or why there are none), each slot and what fills it, and the message as this person
// reads it.
const bcColWhat = (v) => {
  const { templatesRead, templates, starterPending, addingStarters, addStarters, tplId, setTplId, setComposing, offered, tpl, data, forPerson, goesAt, person, people, sample, who, setWho, personNote, noName } = v;
  return (
          <div className="bc-col bc-col-what" data-testid="bc-col-what">
            <span className="bc-col-label">What</span>
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
            {/* Each slot on one line, as on a playbook: what it is, what fills it, and
                a choice only where it has one. */}
            {bcSlotFills(v)}
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
  );
};

// Each slot on its line: its label, what fills it (typed, or said in words), and the choice where it has one.
const bcSlotFills = ({ tpl, vars, srcOf, choices, HINTS, labels, typed, data, setTyped, SRC, chooseSource }) => (
            tpl && vars.length > 0 && (
              <div className="pb-fills" data-testid="bc-vars">
                {vars.map((v, i) => {
                  const src = srcOf(i);
                  const c = choices[i] || BC_TEXT;
                  const hint = src !== "text" ? HINTS[src] : null;
                  return (
                    <div key={v.position || i} className={`pb-fill${src === "text" ? " is-typed" : ""}`} data-kind={src} data-testid="bc-var">
                      <span className="pb-fill-key" id={`bc-var-${i}`}>{labels[i]}</span>
                      {src === "text"
                        ? <input className="pb-fill-input" value={typed[i]} placeholder={c[0] === "business_name" ? data.businessName || "" : v.example ? String(v.example) : ""} maxLength={1024} onChange={(e) => setTyped(i, e.target.value)} aria-labelledby={`bc-var-${i}`} data-testid="bc-var-input" />
                        : (
                          <span className="pb-fill-val" data-tip={hint || undefined}>
                            <span className="pb-fill-words">{src === "business_name" && data.businessName ? data.businessName : SRC[src] || src}</span>
                            {hint && <span className="pb-fill-hint">{hint}</span>}
                          </span>
                        )}
                      {c.length > 1 && (
                        <span className="pb-fill-src" data-tip="What fills it">
                          <Icon name={src === "text" ? "pencil" : "chevrons"} size={12} />
                          <select value={src} onChange={(e) => chooseSource(i, e.target.value)} aria-label={`What fills ${labels[i]}`} data-testid="bc-var-source">
                            {c.map((k) => <option key={k} value={k}>{SRC[k] || k}</option>)}
                          </select>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )
);

// When: the time box by the business's clock, what that time means, and the number it goes from.
const bcColWhen = ({ whenAt, maxDays, setWhenAt, whenNote, number }) => (
          <div className="bc-col" data-testid="bc-col-when">
            <span className="bc-col-label">When</span>
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
);

// The send screen: who, what and when side by side, and the send alone at the foot.
const bcComposer = (v) => {
  const { work, composing, data, setComposing, flash, name, setName, canSend, armed, ready, whenNote, submit, setArmed, active, activeCount, tpl, busy } = v;
  return (
      <section className="bc-composer bc-send" data-testid="bc-composer">
        {/* The one screen in Campaigns that cannot be undone, opened on its own:
            who, what and when at once, with the people named rather than counted,
            and the send alone at the foot. */}
        {/* The three columns say who, what and when; the sentence that said so over them went (23 Sep). */}
        <window.CmHead
          title="New broadcast"
          right={work.asking
            ? <window.UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" />
            : <button className="btn btn-ghost" onClick={work.leave} data-testid="bc-compose-close">Cancel</button>}
        />
        {composing && window.TemplateComposer && (
          <window.TemplateComposer
            businessName={data.businessName}
            onCancel={() => setComposing(false)}
            onDone={(made) => { setComposing(false); flash({ msg: <><b>{made.name}</b> submitted — WhatsApp reviews it; it appears here once approved</> }); }}
          />
        )}
        <div className="bc-cols">

          {bcColWho(v)}

          {bcColWhat(v)}

          {bcColWhen(v)}
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
  );
};

// The ledger: one line of the runs by state and what went, the week ahead, the runs, and the section that gets a yes.
const bcLedger = (v) => {
  const { rows, band, setBand, data, origin, setOrigin, setWriting, now, runs, runCard, sentN, recent } = v;
  return (
        <>
          {/* One line, the way every Campaigns tab opens: the tab says "Broadcasts", so
              the name is a screen reader's alone (CmHead quiet). The line is the runs
              by state, each its own filter -- "1 waiting on you" is the first of them
              -- then what went out, then the page's act. It was a headline, a sentence
              about the ledger, a flag saying "1 waiting on you" and, under them, a
              card saying it again beside a bar of the same numbers. */}
          <window.CmHead
            title="Broadcasts"
            quiet
            testid="bc-head"
            sub={(
              <>
                <BcBand rows={rows} band={band} onBand={setBand} />
                <BcHistoryStats rows={rows} more={data.more} replyWindow={data.replyWindow} origin={origin} onOrigin={setOrigin} counted />
              </>
            )}
            right={<button className="btn btn-primary" onClick={() => setWriting(true)} data-testid="bc-new" {...window.gate("approve", "send a broadcast")}><Icon name="plus" size={12} /> <span>New<span className="cm-act-noun"> broadcast</span></span></button>}
          />
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
      {bcOptIn(v)}
        </>
  );
};

// Get their yes: the QR and the phrase, folded to its one line under the runs.
const bcOptIn = ({ data, yesOpen, setYesOpen, flash }) => (
      data.optIn && data.optIn.link && (
        <section id="bc-optin" className="ct-section bc-optin" data-testid="bc-optin">
          {/* Folded to its one line under the runs, open where the address asks for it (broadcasts/get-yes, which
              every "nobody has said yes to offers" door lands on) or a press opens it. Open on every visit, it
              was 194px of a desk and 543px of a phone under the runs. */}
          <details className="bc-yes" open={yesOpen} onToggle={(e) => setYesOpen(!!(e && e.currentTarget && e.currentTarget.open))}>
            <summary className="bc-yes-head" data-testid="bc-optin-toggle">
              <span className="bc-yes-k">Get their yes</span>
              <span className="bc-yes-note">only people who said yes get a broadcast</span>
              <Icon name="chevron-down" size={12} />
            </summary>
          <div className="bc-optin-body">
            <img className="bc-optin-qr" src={data.optIn.qrPath} alt={`QR code that opens WhatsApp with “${data.optIn.phrase}” ready to send`} width={120} height={120} />
            <div className="bc-optin-text">
              {/* What it does, in two short sentences where two paragraphs stood: the code, the words it sends, and how a
                  yes is undone. */}
              <p>
                A scan or a tap opens WhatsApp with <b>{data.optIn.phrase}</b> ready to send, and sending it records their yes. <b>{data.optIn.phraseEs}</b> works in Spanish; STOP undoes it.
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
                  Your sign-up page, <a className="cl-bucket-link" href={data.optIn.pageUrl} target="_blank" rel="noreferrer">{data.optIn.pageUrl.replace("https://", "")}</a>, has the same code with the wording the phone carriers ask for. On paper, print <a className="cl-bucket-link" href={`${data.optIn.pageUrl}/form`} target="_blank" rel="noreferrer" data-testid="bc-optin-form">the sign-up form</a> and record each signed box on their profile as “Sign-up form”.
                </p>
              )}
            </div>
          </div>
          </details>
        </section>
      )
);

const BroadcastsReal = ({ initialSegment = null, initialRun = null, initialYes = false }) => {
  const data = useBroadcasts();
  const [toastNode, flash] = window.usePPToast();
  // Who may send, approve or stop: the role store's answer, View-as included.
  const canSend = !!(window.canDo && window.canDo("approve"));
  const audiences = data.audiences || BC_NONE;
  // Null: the templates read failed -- its own state, never "no template yet".
  const templatesRead = data.templates !== null;
  const { offered, link, templates } = useBcOffered(data);
  const { kept, aud, setAud, writing, setWriting } = useBcList(initialSegment, audiences);
  const [tplId, setTplId] = React.useState(() => { if (kept && kept.tplId && templates.some((t) => t.id === kept.tplId)) return kept.tplId; const d = bcDefault(templates); return d ? d.id : ""; });
  const { params, setParams, sources, setSources, composing, setComposing, name, setName, whenAt, setWhenAt, busy, setBusy, wrote, clearWords } = useBcWords(kept);
  const work = window.useUnsavedWork("broadcast", null, {
    value: { aud, tplId, params, sources, name, whenAt },
    dirty: wrote,
    onLeave: () => { clearWords(); setWriting(false); setArmed(false); },
  });
  // Which of the audience's people the preview is showing.
  const [who, setWho] = React.useState(0);
  // Which half of the history is in view: a playbook's runs, the ones sent by
  // hand, or both. Null is both.
  const [origin, setOrigin] = React.useState(null);
  // The band the list is filtered to (a state), or none: everything open and the latest gone.
  const [band, setBand] = React.useState(null);
  const now = useBcNow(data);
  // Whether Send now has been pressed once and is asking. A question about one
  // template and one audience cannot be answered for another, so changing either
  // puts the button back.
  const [armed, setArmed] = React.useState(false);
  // The broadcast open on the page is the one its link names (broadcasts/run:<id>); Open on a run follows that link,
  // and its report is its own screen, as the send is.
  const openId = initialRun;
  const openRun = (id) => window.CHANLY.nav(id ? `broadcasts/run:${id}` : "broadcasts");
  useBcRunLanding(openId);
  const { yesOpen, setYesOpen, yesDoor } = useBcYes(initialYes, data, setWriting);
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

  // What the screens say, worked out on every draw as it always was; then the acts, the runs and a run's sheet.
  const v = { data, flash, canSend, audiences, templatesRead, offered, link, templates, aud, setAud, setWriting, tplId, setTplId, params, setParams, sources, setSources, composing, setComposing, name, setName, whenAt, setWhenAt, busy, setBusy, clearWords, work, who, setWho, origin, setOrigin, band, setBand, now, armed, setArmed, openId, openRun, yesOpen, setYesOpen, yesDoor, armId, setArmId, stopping, setStopping, addingStarters, setAddingStarters, starterPending };
  Object.assign(v, bcReachOf(v));
  Object.assign(v, bcSlotChoicesOf(v));
  Object.assign(v, bcSlotWordsOf(v));
  Object.assign(v, bcPeopleOf(v));
  Object.assign(v, bcPreviewOf(v));
  // One approve at a time: a second press while the first is out would be refused by the server, so the button says
  // it is approving instead, and the guard holds before the button has drawn that.
  const approvingRef = React.useRef(null);
  const [approving, setApproving] = React.useState(null);
  Object.assign(v, { approvingRef, approving, setApproving });
  Object.assign(v, bcRunActs(v));
  Object.assign(v, bcSendActs(v));
  Object.assign(v, bcLedgerOf(v));
  Object.assign(v, bcSheetOf(v));
  Object.assign(v, bcAgainOf(v));

  return (
    <div className={`bc-page${openId ? " is-report" : ""}`} data-testid="broadcasts-real">
      <div className="bc-body">
      {/* A run, opened: its report on a screen of its own, whether the list holds it or it is older than the list. */}
      {openId ? bcRunSolo(v) : null}

      {/* Three questions, side by side -- who, what, when -- and the one act that
          cannot be taken back alone at the foot. As a single column, the audience,
          the words and the send button never appeared on the same screen: an owner
          scrolled past the preview to reach Send, which is the wrong direction of
          travel for the only irreversible control on the surface. */}
      {openId ? null : writing ? bcComposer(v) : bcLedger(v)}
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
