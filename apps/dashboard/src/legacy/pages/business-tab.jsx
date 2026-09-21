/* global React, Icon */
// Chanlytics — Settings › Business, as a record.
//
// The tab was two surfaces that disagreed about what exists: a card showing nine facts, and a form editing about
// twenty-five behind one Save. Here every fact is a row, and a row is edited where it is stated
// (docs/superpowers/specs/2026-09-20-business-tab-design.md; the canvas's Record, Group-Who and Edit-Inline boards).
// This file draws the head, the standing line and *Who you are*. The other groups arrive with Tasks 3.3 to 3.5, and
// PaneWorkspace (settings.jsx) keeps drawing the old card until Task 3.7 swaps this page in.
//
// The page composes and never derives. Every sentence with a number or a judgement in it is contracts', through
// window.__businessTab (legacy-bridge/business-tab.ts); every fact is the settings read's (window.__SETTINGS,
// window.__FACTS), read as the page draws.
//
// Hooks are cells in one order, in React and in the tests' stub React alike: every component here that holds one is
// drawn on every render (an inline editor that is closed is `hidden`, as a closed RecordFold is), and what comes and
// goes (a row at rest, a Confirm, a note) holds none. And no object rest in a pattern anywhere in this file: the
// standalone mockup compiles every file into one global scope, where Babel's `_excluded` for a rest is shared, and the
// last file compiled decides what every earlier rest leaves out (record-field.jsx says how that bit).

const { useState: useBizState, useEffect: useBizEffect, useRef: useBizRef } = React;

/**
 * A number as people write it, "+1 (305) 555-0100", the way Setup and Connections show one (contracts
 * formatPhoneDisplay, published by the bridge). Business showed the line it answers and the transfer number in the
 * E.164 they are stored as (the wiring audit's L7). Only E.164 is rewritten: anything else is shown as it was written,
 * which for the number it gives out is what the receptionist says.
 *
 * Here, and on window, since this page and the old card in settings.jsx both show numbers: one rule for writing them.
 */
const phoneShown = (v) => (v && window.__phoneDisplay && /^\+[1-9][0-9]{6,14}$/.test(v) ? window.__phoneDisplay(v) : v);

/**
 * One brain field, saved from the row it is shown in.
 *
 * The two numbers below used to be sections nine and thirteen of a fourteen-
 * section form -- "Tell customers to call" near the top of one step, "How
 * callers reach a person" most of a page later in another, both of them read
 * from the Business card five rows apart. Editing one meant opening a form,
 * finding it among twelve fields that had nothing to do with it, and pressing
 * a Save that wrote the entire configuration.
 *
 * It still writes the entire configuration -- PUT /settings is a versioned
 * compare-and-swap, and sending a fragment would delete the rest -- but it
 * starts from what is stored and changes ONE key, which is the same discipline
 * the big form's `save` learned after a rebuild lost a workspace its prompt.
 *
 * Moved here from settings.jsx unchanged when the Business tab became a record (Task 3.2): every row of this page
 * saves through it, and the old card's two number rows take it from window until Task 3.7 retires them.
 */
function useFieldSave(flash) {
  const [busy, setBusy] = React.useState(false);
  const settings = window.__SETTINGS || null;
  const save = (change, said, done) => {
    if (busy || !window.__saveSettings || !settings || !settings.config) return;
    const cfg = settings.config;
    const brain = cfg.brain || {};
    setBusy(true);
    const next = { ...cfg, brain: change({ ...brain }, { ...(brain.profile || {}) }) };
    window.__saveSettings(next, settings.version, () => {
      setBusy(false);
      done();
      flash({ msg: said });
    }).then((r) => {
      if (r.ok) return;
      setBusy(false);
      flash({ tone: "danger", msg: <>{r.message}</> });
    });
  };
  return [busy, save];
}

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

// What the four rows that are only words say once the server has taken a change: the canvas's Edit-Inline words. The
// two number rows keep the sentences they have always said (PublishedNumberRow, HandoffRow).
const BT_SAVED = "Saved — the receptionist picks it up within a minute";

// Two drafts are the same when saving either would write the same thing.
const btSame = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const btTrimmed = (d) => String(d == null ? "" : d).trim();
const btNoCheck = () => null;

/**
 * What a draft changes in its block of the prompt, line by line: the lines it adds or rewrites, and the lines it takes
 * away. Both blocks are the composer's own text (consequenceOf); nothing here writes a word of them.
 */
const btChangedLines = (before, after) => {
  const lines = (b) => (b && typeof b.text === "string" ? b.text.split("\n").filter((l) => l.trim() !== "") : []);
  const was = lines(before);
  const now = lines(after);
  return { added: now.filter((l) => !was.includes(l)), removed: was.filter((l) => !now.includes(l)) };
};

// Opened, focus goes to the first thing in the editor to type into or press (data-bits tabStops), with the caret at
// the end of what is there (spec §9): the act that opened it has gone. Focus is also what brings a row opened from
// the standing line into view.
const btFocusIn = (el) => {
  if (!el || !window.tabStops) return;
  const first = window.tabStops(el)[0];
  if (!first || !first.focus) return;
  first.focus();
  if (typeof first.value === "string" && first.setSelectionRange) {
    try { first.setSelectionRange(first.value.length, first.value.length); } catch { /* a box that holds no caret */ }
  }
};
// Closed, or gone: focus that went with the editor (it is on nothing, or still inside it) comes back to the act of
// the row it opened from, as a fold's does (record-fold.jsx). Focus a person has put somewhere else stays there.
const btFocusBack = (id, el) => {
  const now = document.activeElement;
  const lost = !now || now === document.body || (el && el.contains && el.contains(now)) || (document.contains && !document.contains(now));
  if (!lost || !document.querySelector) return;
  const back = document.querySelector(`[data-rec-act="${id}"]`);
  if (back && back.focus) back.focus();
};

/**
 * One value, edited in the row that states it (spec §5, canvas Edit-Inline).
 *
 * At rest the row is a RecordRow: its value, where the value came from, and one act. The act opens the editor in the
 * row's place, and the row becomes the field: its label where the label was, the box, what the receptionist will be
 * told once it is saved ("It will say"), and Save and Cancel. Esc cancels and Ctrl or Cmd with Enter saves, as in a
 * fold. What stops a save is said under the box before any round trip, never as a toast. Cancel with changes asks
 * first, as the form this replaces did (S22). When the server accepts, the editor closes and the toast says so; the
 * surface's refresh finishes behind it (useFieldSave).
 *
 * It holds the fold registry (record-fold.jsx) as a fold does, so one editor or fold is open on the page at a time:
 * opening another row closes a clean editor and asks about one holding changes, and the Settings rail and the
 * browser's unload prompt ask before its changes are thrown away. Its dirty test is bound to its id as it mounts, so
 * it is asked however the row was opened: by its own act, or by its id from the standing line's door.
 *
 * What a row writes is the row's own, in four answers: `initial` (the draft it opens with, from what is stored),
 * `storedAs` (what a draft would store, which is what "holds changes" is judged by; not `valueOf`, which every props
 * object already has from Object.prototype, so a default for it never applies), `check` (the sentence that stops
 * a save, or null), and `commit` (the one-key change a save makes, with its toast's words). `body` draws the box; it
 * is handed the draft, its setter, what stops it and the field's own ids. A disagreement on the row names the other
 * answer and the draft that takes it (`disputed.use`), which saves through the same `commit`.
 *
 * `section` is the row's name to consequenceOf (FOLD_BLOCK), where it is not the row's id: the name is `business_name`.
 * `channel` is the one the row's words are read on; the transfer number is a call's, and changes nothing on WhatsApp.
 */
const RecordInline = ({
  id, section = null, label, brain, value = null, empty = null, hint = null, source = null, disputed = null, wrong = null,
  initial, storedAs = btTrimmed, check = btNoCheck, commit, body, channel = "whatsapp",
  canEdit = true, gate = null, flash = () => {},
}) => {
  const [draft, setDraft] = useBizState(null);
  const [problem, setProblem] = useBizState(null);
  const [arm, setArm] = useBizState(false);
  // What the registry reads when it asks whether this row holds changes. A keystroke lands here as it is typed, so a
  // press on another row straight after typing is asked about even before the page has drawn again.
  const live = useBizRef({ draft: null, initial: null, storedAs: btTrimmed, open: false });
  const holds = () => {
    const l = live.current;
    return l.open && l.draft != null && !btSame(l.storedAs(l.draft), l.storedAs(l.initial));
  };
  const fold = window.useRecordFold(id, { dirty: holds });
  // A role that may not change the business never has an editor, whatever asked for one.
  const open = fold.open && canEdit;
  live.current.initial = initial;
  live.current.storedAs = storedAs;
  live.current.open = open;
  const now = open && draft != null ? draft : initial;
  const dirty = open && !btSame(storedAs(now), storedAs(initial));
  const [busy, save] = useFieldSave(flash);
  const boxRef = useBizRef(null);
  // The block as the stored brain writes it, resolved once per stored brain rather than on every keystroke.
  const before = useBizRef({ brain: null, block: null });

  // A row whose page goes away lets go of the registry, as a fold does (record-fold.jsx: the rail's "Yes, leave"
  // replaces the pane). Left open, its dirty test would go on answering after it had gone, and the rail would ask on
  // every tab and the browser before every reload.
  useBizEffect(() => (window.__recordFolds ? window.__recordFolds.drawn(id) : undefined), [id]);
  useBizEffect(() => {
    if (!open) return undefined;
    const el = boxRef.current;
    btFocusIn(el);
    return () => btFocusBack(id, el);
  }, [open, id]);
  // Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
  // opening starts from what is stored.
  const reset = () => { live.current.draft = null; setDraft(null); setProblem(null); setArm(false); };
  useBizEffect(() => { if (!open) reset(); }, [open]);

  const set = (d) => { live.current.draft = d; setDraft(d); if (problem) setProblem(null); if (arm) setArm(false); };
  const close = () => { reset(); fold.close(); };
  const refused = !!(gate && gate["aria-disabled"]);
  const cancel = () => {
    if (busy) return;
    if (dirty) { setArm(true); return; }
    close();
  };
  const submit = () => {
    if (busy || !open || refused) return;
    const bad = check(now);
    if (bad) { setProblem(bad); return; }
    // Nothing to write is nothing to send: the editor closes and says nothing, since nothing was saved.
    if (!dirty) { close(); return; }
    const c = commit(now);
    save(c.change, c.said, close);
  };
  // Only its own keys: a key from something drawn inside it through a portal bubbles through React from outside its
  // DOM, as record-fold.jsx found.
  const onKey = (e) => {
    if (e.defaultPrevented || !e.currentTarget.contains(e.target)) return;
    if (e.key === "Escape") { e.preventDefault(); cancel(); return; }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  };

  // What saving would tell the receptionist: the lines of its block that the draft changes, resolved as the edge
  // resolves them. Only for a draft the save would send, and only while the editor is open, because each call parses
  // the whole brain and resolves a full prompt. Nothing is drawn when nothing changes, and nothing when the block is
  // null (the save's schema refuses the draft, or a record whose profile composes nothing is answered with its stored
  // prompt): never an empty "It will say".
  let says = null;
  const tab = window.__businessTab;
  if (dirty && !check(now) && tab && tab.consequenceOf) {
    const block = section || id;
    const after = tab.consequenceOf(block, commit(now).change({ ...brain }, { ...(brain.profile || {}) }), channel);
    if (after) {
      if (before.current.brain !== brain) before.current = { brain, block: tab.consequenceOf(block, brain, channel) };
      const changed = btChangedLines(before.current.block, after);
      if (changed.added.length) says = { words: "It will say", lines: changed.added };
      else if (changed.removed.length) says = { words: "It will no longer say", lines: changed.removed };
    }
  }

  // A disagreement, as the kit draws one: the other answer, in the resolver's own sentence when there is one, and one
  // press that takes it, saved through this row's own commit and gated like every press on the row. A role that may not
  // change the business reads the disagreement and is offered no press, as it is offered no act; nor is anyone, where
  // the other answer is information rather than a fill (btDispute's `use` is null).
  const other = disputed ? {
    value: disputed.value,
    source: disputed.source,
    severity: disputed.severity,
    sentence: disputed.sentence,
    useLabel: disputed.useLabel,
    onUse: canEdit && disputed.use != null ? () => {
      if (busy) return;
      const bad = check(disputed.use);
      if (bad) { flash({ tone: "warn", msg: <>{bad}</> }); return; }
      const c = commit(disputed.use);
      save(c.change, c.said, () => {});
    } : undefined,
    gate,
  } : null;

  const keyId = `bt-${id}-key`;
  const saysId = `bt-${id}-says`;
  // The field is named by the row's own label, where the label stays (the canvas's editing row), rather than by a
  // second copy of it over the box; a consequence line describes the box too.
  const field = { id: `bt-${id}`, label: null, "aria-labelledby": keyId, "aria-describedby": says ? saysId : undefined };
  // Drawn on every render, open or not: the box holds hooks of its own (RecordField's id).
  const inner = body({ draft: now, set, problem, field, gate });
  return (
    <>
      {open ? null : (
        <window.RecordRow
          id={id}
          label={label}
          value={value}
          empty={empty}
          hint={hint}
          source={source}
          disputed={other}
          wrong={wrong}
          act={canEdit ? { label: value ? "Change" : "Add one", onClick: () => fold.request(), gate } : null}
        />
      )}
      <div
        ref={boxRef}
        className="bt-inline"
        role="group"
        aria-labelledby={keyId}
        hidden={open ? undefined : true}
        data-testid={`rec-inline-${id}`}
        onKeyDown={onKey}
      >
        <span className="bt-inline-key" id={keyId}>{label}</span>
        <div className="bt-inline-body">
          {inner}
          {says ? (
            <div className="bt-inline-says" id={saysId} data-testid={`rec-inline-says-${id}`}>
              <span className="bt-inline-says-eyebrow">{says.words}</span>
              <pre>{says.lines.join("\n")}</pre>
            </div>
          ) : null}
          {fold.asking ? (
            <window.Confirm question="Discard your changes?" detail="Nothing you changed here has been saved." yes="Yes, discard" no="Keep editing" danger onYes={() => { reset(); fold.discard(); }} onNo={fold.stay} testid={`rec-inline-${id}-ask`} />
          ) : arm ? (
            <window.Confirm question="Discard your changes?" detail="Nothing you changed here has been saved." yes="Yes, discard" no="Keep editing" danger onYes={close} onNo={() => setArm(false)} testid={`rec-inline-${id}-cancel`} />
          ) : null}
          <div className="bt-inline-foot">
            {/* Busy, not disabled: a disabled button lets go of focus, to the page, and a save that failed left it there
                (record-fold.jsx). It stays a button focus can rest on, and a press while it saves does nothing. */}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={(e) => { if (busy) { e.preventDefault(); return; } submit(); }}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              data-testid={`rec-inline-save-${id}`}
              {...(gate || {})}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={cancel} aria-disabled={busy || undefined} data-testid={`rec-inline-cancel-${id}`}>Cancel</button>
            <span className="bt-inline-keys">Esc cancels · ⌘↵ saves</span>
          </div>
        </div>
      </div>
    </>
  );
};

/** The box for a row whose value is one line of text. */
const btTextBox = (words) => ({ draft, set, problem, field }) => (
  <window.RecordField
    {...field}
    value={draft}
    onChange={set}
    problem={problem}
    hint={words.hint || null}
    placeholder={words.placeholder}
    inputMode={words.inputMode}
    autoComplete={words.autoComplete}
  />
);

/**
 * A disagreement on a row, from what the settings read resolved: the other answer (facts.ts `disputed`) and the
 * resolver's sentence and severity for it (factConflicts). `take` turns the other answer into the draft that takes it,
 * and `take.from`, where it is given, names the sources whose answer may be taken; from any other, the disagreement is
 * information, drawn with no press (`use` is null). Nothing offers "keep mine": nothing stores that choice, and a press
 * that stores nothing would say the disagreement was settled while the database still holds it.
 */
const btDispute = (f, conflict, take) => {
  const theirs = (f && f.disputed) || (conflict ? { value: conflict.known, source: conflict.knownSource } : null);
  if (!theirs) return null;
  const offered = !take.from || take.from.includes(theirs.source);
  return {
    value: theirs.value,
    source: theirs.source,
    severity: conflict ? conflict.severity : undefined,
    sentence: conflict ? conflict.sentence : null,
    useLabel: take.label || null,
    use: offered ? take.draft(theirs.value) : null,
  };
};
const BT_TAKE_THEIRS = { draft: (v) => v };
// The name Google lists may be taken in one press. The workspace's own name may not: it is whatever the workspace was
// called when it was made -- a Stripe test's "Billing probe" once went to the carriers as a business's name
// (business-page.ts) -- and a press that renamed the business to it would put that name in front of customers.
const BT_TAKE_GOOGLES = { draft: (v) => v, from: ["verified"] };

// The pattern every web address on this tab is checked by: the old form's, which the save's own URL rule backs up.
const BT_WEB = /^https?:\/\/.+\..+/;

/* ------------------------------------ the page ------------------------------------ */

/** The page's name, what it is, and who last changed it (the row's own author and stamp, 00085). */
const BtHead = () => {
  const changed = window.__lastChanged ? window.__lastChanged() : "";
  return (
    <header className="bt-head" data-testid="bt-head">
      <h1 className="bt-title">Business</h1>
      <p className="bt-sub">What both receptionists answer from.{changed ? ` ${changed}.` : ""}</p>
    </header>
  );
};

/**
 * Three clauses, not a meter (spec §4.1): what it can say, what it will not, and the one gap most worth closing, which
 * is the door to the row that closes it. Every word is contracts' (standingLine): the gap's own sentence is its door.
 * A role that may not change the business reads the gap and gets no door, since the row behind it would not open.
 */
const BtStanding = ({ brain, door }) => {
  const tab = window.__businessTab;
  if (!tab || !tab.standingLine) return null;
  const vm = tab.standingLine(brain);
  const gap = vm.missing;
  return (
    <section className="bt-standing" data-testid="rec-standing" data-state={gap ? "warn" : "ok"}>
      <span className="bt-standing-dot" aria-hidden="true" />
      <div className="bt-standing-words">
        <p className="bt-standing-can">{vm.can}</p>
        {vm.wont || gap ? (
          <p className="bt-standing-more">
            {vm.wont}
            {vm.wont && gap ? " " : null}
            {gap && door ? (
              <button type="button" className="bt-standing-door" onClick={() => door(gap.row)} data-testid="rec-standing-door">{gap.sentence}</button>
            ) : gap ? (
              <span className="bt-standing-gap">{gap.sentence}</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
};

/**
 * A door opens a row by its id, as the row's own act would open it: the registry holds each row's dirty test by id,
 * bound as the row's hook mounted (record-fold.jsx), so a row opened from here asks before its changes are thrown away
 * like any other, and one open elsewhere holding changes is asked about first. A row this page does not draw yet (the
 * hours, the services and the voice arrive with Tasks 3.3 to 3.5) opens, guarded the same way, once its fold is here.
 */
const btOpenRow = (id) => {
  if (window.__recordFolds) window.__recordFolds.request(id);
};

/**
 * Who you are (spec §4.2): the seven facts a customer asks for by name, each with where it came from, and the
 * disagreements factConflicts finds drawn on the row each is about, where the banner above the card used to hold them.
 *
 * The Workspace row is gone. It printed the business's name a second time whenever the workspace's name differed: two
 * names for one business, on the one card that exists to say which name customers hear.
 */
const BtWho = ({ brain, canEdit, flash }) => {
  const F = ((window.__FACTS || {}).facts) || {};
  const conflicts = ((window.__FACTS || {}).conflicts) || [];
  const conflictOn = (key) => conflicts.find((k) => k.fact === key) || null;
  const profile = brain.profile || {};
  // A fact as the settings read resolved it. A read that carried no facts (an older server) falls back to what is
  // typed in the brain, with no source claimed for it: a fact with no source is not a fact, but a stored value is
  // still what the receptionist says.
  const factOf = (key, typed) => F[key] || (typed ? { value: typed, source: null } : { value: null, source: null });
  const chip = (f) => (f.value ? f.source : null);
  const shared = { brain, canEdit, flash };
  const gate = (thing) => window.gate("settings", `change the ${thing}`);

  const name = factOf("business_name", brain.business_name);
  const address = factOf("address", profile.address);
  const website = factOf("website", profile.website);
  const link = factOf("booking_link", brain.booking_link);
  const line = F.voice_line || null;
  const voiceLine = (line && line.value) || "";
  const lineShown = phoneShown(voiceLine);
  const pub = F.phone_display || (brain.phone_display ? { value: brain.phone_display, source: null } : { value: null, source: null });
  const transfer = factOf("handoff_number", profile.handoff_number);
  const handoff = transfer.value || null;

  // A key of the profile, written from a draft: an emptied box deletes its key rather than storing "", or the
  // composed prompt would state an address of nothing (the rule the old form's `put` held).
  const profileKey = (key) => (d) => {
    const v = btTrimmed(d);
    return { change: (b, p) => { if (v) p[key] = v; else delete p[key]; b.profile = p; return b; }, said: BT_SAVED };
  };

  // The number it gives out, as PublishedNumberRow held it: absent is "the line it answers", so choosing the line
  // stores nothing. `own` means the line only where there is one to follow.
  const published = (d) => (d.own && voiceLine ? "" : btTrimmed(d.typed));
  // The transfer number is stored as E.164, or not at all (contracts handoffE164).
  const transferOf = (d) => (window.__handoffE164 ? window.__handoffE164(d) : (btTrimmed(d) || null));

  return (
    <section className="rec-card" data-testid="rec-card-who" aria-labelledby="bt-who-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-who-title">Who you are</h2>
        <span className="rec-card-sub">The facts a customer asks for by name</span>
      </div>

      <RecordInline
        {...shared}
        id="name"
        section="business_name"
        label="Name"
        value={name.value}
        empty="Not set"
        source={chip(name)}
        disputed={btDispute(name, conflictOn("business_name"), BT_TAKE_GOOGLES)}
        gate={gate("name")}
        initial={brain.business_name || ""}
        // Checked here so the owner is told before a round trip: the API refuses an empty name too, but names no field.
        check={(d) => (btTrimmed(d) ? null : "The receptionist needs a business name before it can answer anyone.")}
        commit={(d) => ({ change: (b) => { b.business_name = btTrimmed(d); return b; }, said: BT_SAVED })}
        body={btTextBox({ placeholder: "The name customers know you by", autoComplete: "organization" })}
      />

      <RecordInline
        {...shared}
        id="address"
        label="Address"
        value={address.value}
        empty="Not set"
        source={chip(address)}
        disputed={btDispute(address, conflictOn("address"), BT_TAKE_THEIRS)}
        gate={gate("address")}
        initial={profile.address || ""}
        commit={profileKey("address")}
        body={btTextBox({ placeholder: "123 Example St, Brooklyn, NY 11208", autoComplete: "street-address", hint: "Given when someone asks how to find you." })}
      />

      <RecordInline
        {...shared}
        id="website"
        label="Website"
        value={website.value}
        empty="Not set"
        // What empty means, and only what is true of it: the receptionist is told no website, so it has none to give.
        // The canvas said empty sent customers and the carriers to the page we publish, /b/<slug>. Neither reads this
        // field: the prompt names a website only when one is typed here, and the carriers are filed the business
        // record's own website (Connections), or that page when the record has none.
        hint={website.value ? null : "Optional. Left empty, the receptionist has no website to give anyone who asks."}
        source={chip(website)}
        disputed={btDispute(website, conflictOn("website"), BT_TAKE_THEIRS)}
        gate={gate("website")}
        initial={profile.website || ""}
        check={(d) => (btTrimmed(d) && !BT_WEB.test(btTrimmed(d)) ? "The website needs to be a full web address, starting with https://" : null)}
        commit={profileKey("website")}
        body={btTextBox({ placeholder: "https://example.com", inputMode: "url", autoComplete: "url", hint: "Optional. Given when someone asks." })}
      />

      <RecordInline
        {...shared}
        id="booking_link"
        label="Booking link"
        value={brain.booking_link || null}
        empty="Not set"
        // Said once, plainly, rather than discovered by a customer.
        hint="Sent instead of confirming an appointment itself."
        source={chip(link)}
        disputed={btDispute(link, conflictOn("booking_link"), BT_TAKE_THEIRS)}
        gate={gate("booking link")}
        initial={brain.booking_link || ""}
        check={(d) => {
          const v = btTrimmed(d);
          if (!v) return "The receptionist needs a booking link before it can answer anyone.";
          return BT_WEB.test(v) ? null : "That booking link needs to be a full web address, starting with https://";
        }}
        commit={(d) => ({ change: (b) => { b.booking_link = btTrimmed(d); return b; }, said: BT_SAVED })}
        body={btTextBox({ placeholder: "https://your-booking-page.com", inputMode: "url", autoComplete: "url", hint: "Sent instead of confirming an appointment itself." })}
      />

      {/* THREE numbers, named for what each one does. They were one row called "Phone line" showing a typed string,
          which is how a salon came to publish the number it transfers to as the number to call. The line it answers
          is provisioned and belongs to Connections, so it is shown here and never offered as a box; the other two are
          the receptionist's behaviour, edited in the row that states them. */}
      <window.RecordRow
        testid="rec-row-voice_line"
        label="Answers on"
        value={voiceLine ? lineShown : null}
        empty="No phone line yet"
        source={voiceLine ? line.source : null}
        act={{ label: <>Connections <Icon name="arrow-right" size={10} /></>, onClick: () => window.CHANLY.nav("admin/integrations"), testid: "rec-row-door-voice_line" }}
      />

      {/* What the receptionist tells customers to call.

          Absent means "the line it answers", which is the answer for nearly every workspace and the one that stays
          right when the number changes. Publishing anything else is a deliberate act, and the note says what it costs
          -- because the live salon published its transfer number here and every customer who rang it reached a
          person's mobile instead of the receptionist standing by. */}
      <RecordInline
        {...shared}
        id="phone_display"
        label="Tells customers to call"
        value={pub.value}
        empty="No number to give out"
        source={chip(pub)}
        disputed={btDispute(pub, conflictOn("phone_display"), { label: "Publish the line instead", draft: () => ({ own: true, typed: "" }) })}
        gate={gate("number customers are told to call")}
        initial={{ own: !brain.phone_display, typed: brain.phone_display || "" }}
        storedAs={published}
        check={(d) => {
          const v = published(d);
          const bad = v && window.__whyNotAPhone ? window.__whyNotAPhone(v) : null;
          if (bad) return bad;
          return !v && !voiceLine ? "There is no line yet, so the receptionist needs a number to give out." : null;
        }}
        commit={(d) => {
          const v = published(d);
          return {
            change: (b) => { if (v) b.phone_display = v; else delete b.phone_display; return b; },
            said: v ? <>Customers are told to call <b className="tabular">{v}</b> now.</> : <>Customers are told to call your line.</>,
          };
        }}
        body={({ draft, set, problem, field, gate: pressable }) => (
          <>
            {voiceLine ? (
              <window.RecordToggleGroup
                label="The number to tell customers to call"
                value={draft.own ? "line" : "other"}
                options={[{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }]}
                onChange={(v) => set(v === "line" ? { own: true, typed: draft.typed } : { own: false, typed: draft.typed || lineShown })}
                gate={pressable}
                testid="rec-inline-phone_display-choice"
              />
            ) : null}
            <div className="bt-inline-box" hidden={draft.own && voiceLine ? true : undefined}>
              <window.RecordField
                {...field}
                value={draft.typed}
                onChange={(t) => set({ own: draft.own, typed: t })}
                problem={problem}
                placeholder={lineShown || "+1 646 932 5775"}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <span className="bt-inline-note" data-testid="rec-inline-phone_display-note">
              {draft.own && voiceLine
                ? <><b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing your number changes nothing to keep in step.</>
                : window.__samePhone && window.__samePhone(draft.typed, voiceLine)
                  ? <>That is your line. Choose <b>Your line</b> and it stays right when the number changes.</>
                  : handoff && window.__samePhone && window.__samePhone(draft.typed, handoff)
                    ? <>This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and never the receptionist answering on <b className="tabular">{lineShown}</b>.</>
                    : voiceLine
                      ? <>Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.</>
                      : <>The receptionist has no line of its own yet, so this is the number it gives out.</>}
            </span>
          </>
        )}
      />

      {/* Where a caller who insists on a person is transferred. Empty is a choice. Shown, and changed from, the way the
          row writes it: the check and the stored form both read "+1 (786) 555-0182". Its words are a call's, so what
          it will say is read on the phone: on WhatsApp the number changes nothing. */}
      <RecordInline
        {...shared}
        id="handoff_number"
        label="Transfers a caller to"
        channel="voice"
        value={transfer.value ? phoneShown(transfer.value) : null}
        empty="Takes a message instead"
        source={chip(transfer)}
        disputed={btDispute(transfer, conflictOn("handoff_number"), BT_TAKE_THEIRS)}
        gate={gate("transfer number")}
        initial={phoneShown(profile.handoff_number) || ""}
        storedAs={transferOf}
        check={(d) => (window.__whyNotAHandoff ? window.__whyNotAHandoff(d, voiceLine) : null)}
        commit={(d) => {
          const v = transferOf(d);
          return {
            change: (b, p) => {
              if (v) p.handoff_number = v; else delete p.handoff_number;
              b.profile = p;
              return b;
            },
            said: v ? <>Callers who insist on a person reach <b className="tabular">{phoneShown(v)}</b>.</> : <>The receptionist takes a message instead of transferring.</>,
          };
        }}
        body={btTextBox({
          placeholder: "+1 646 932 5775",
          inputMode: "tel",
          autoComplete: "tel",
          hint: "A line a person answers, with the country code. Empty and the phone receptionist takes a message instead of transferring — which is better than a number nobody picks up.",
        })}
      />

      {/* Nothing is asked twice (spec §3): the carrier record is Connections', and this card only says where it is. */}
      <p className="bt-card-foot" data-testid="rec-who-foot">
        Your legal name and registered address are asked once on <button type="button" className="bt-link" onClick={() => window.CHANLY.nav("admin/integrations")}>Connections</button>, for the carriers. Nothing here repeats them.
      </p>
    </section>
  );
};

/**
 * Settings › Business, drawn from the settings read. A workspace with no brain -- none set up, or a config the parser
 * refused -- is PaneWorkspace's to draw, so the page draws nothing it cannot back.
 */
const BusinessTab = ({ flash = () => {} }) => {
  const settings = window.__SETTINGS || null;
  const brain = (settings && settings.config && settings.config.brain) || null;
  if (!brain) return null;
  const canEdit = !window.canDo || window.canDo("settings");
  return (
    <>
      <BtHead />
      {/* A role that may not change the business reads all of it. Each row's act is absent rather than a dead button,
          so the page says why once, here. */}
      {canEdit ? null : (
        <p className="bt-viewer" data-testid="bt-viewer">
          <Icon name="shield" size={11} /> {window.gateTitle ? window.gateTitle("settings", "change the business") : ""} You can read everything.
        </p>
      )}
      <BtStanding brain={brain} door={canEdit ? btOpenRow : null} />
      <BtWho brain={brain} canEdit={canEdit} flash={flash} />
    </>
  );
};

Object.assign(window, { BusinessTab, useFieldSave, phoneShown });
