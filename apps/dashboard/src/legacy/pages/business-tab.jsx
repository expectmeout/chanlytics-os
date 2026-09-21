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
// window.__FACTS), read as the page draws. What a save writes is pages/business-tab-save.jsx's, through
// window.__businessTabSave: each row's check and patch, and the tab's one saver. That file loads before this one.
//
// The tests' stub React (tooling/scripts/tests/_legacy-react.mjs) keeps every hook on the page as a cell in one order,
// so a component holding hooks that is drawn on one render and not the next moves every cell after it. So every
// component here that holds one is drawn on every render (an inline editor that is closed is `hidden`, as a closed
// RecordFold is), and what comes and goes (a row at rest, a Confirm, a note) holds none. That is the stub's rule, not
// React's, which keeps each component's hooks with the component: nothing here needs shaping further for React's sake.
// And no object rest in a pattern anywhere in this file: the standalone mockup compiles every file into one global
// scope, where Babel's `_excluded` for a rest is shared, and the last file compiled decides what every earlier rest
// leaves out (record-field.jsx says how that bit).

const { useState: useBizState, useEffect: useBizEffect, useRef: useBizRef } = React;

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

// What the four rows that are only words say once the server has taken a change: the canvas's Edit-Inline words. The
// two number rows keep the sentences they have always said (PublishedNumberRow, HandoffRow).
const BT_SAVED = "Saved — the receptionist picks it up within a minute";

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

/**
 * One of this page's rows: at rest a RecordRow, and while it is edited the kit's inline editor (RecordInline,
 * record-fold.jsx), which holds the gesture itself -- its focus, its keys, what saving writes and its foot. What is the
 * page's is here: the draft, what stops a save, the save through the tab's one saver, what the receptionist will be
 * told, and the row's disagreement with its press.
 *
 * At rest the row is its value, where the value came from, and one act. The act opens the editor in the row's place.
 * What stops a save is said under the box before any round trip, never as a toast. Cancel with changes asks first, as
 * the form this replaces did (S22). When the server accepts, the editor closes and the toast says so; the surface's
 * refresh finishes behind it.
 *
 * It holds the fold registry (record-fold.jsx) as a fold does, so one editor or fold is open on the page at a time:
 * opening another row closes a clean editor and asks about one holding changes, and the Settings rail and the
 * browser's unload prompt ask before its changes are thrown away. Its dirty test is bound to its id as it mounts, so
 * it is asked however the row was opened: by its own act, or by its id from the standing line's door.
 *
 * What a row writes is handed to it in four answers, the last three built from business-tab-save.jsx's check, stored
 * value and patch for the row: `initial` (the draft it opens with, from what is stored), `storedAs` (what a draft would
 * store, which is what "holds changes" is judged by; not `valueOf`, which every props object already has from
 * Object.prototype, so a default for it never applies), `check` (the sentence that stops a save, or null), and
 * `commit` (the one-key change a save makes, with its toast's words). `body` draws the box; it is handed the draft, its
 * setter, what stops it and the field's own ids. A disagreement on the row names the other answer and the draft that
 * takes it (`disputed.use`), which saves through the same `commit`.
 *
 * `section` is the row's name to consequenceOf (FOLD_BLOCK) where it is not the row's id, or the names of each block
 * its save can change: a rename changes the line the prompt opens with and, where the stored prompt is the product's
 * own, that too. `channel` is the one the row's words are read on; the transfer number is a call's, and changes nothing
 * on WhatsApp. Null is no channel that reads them on this workspace, and the row says nothing it will say.
 *
 * `named` is what the row holds, said as a thing, where its label is a phrase: a screen reader hears the act as its
 * words and the label together, and "Change Tells customers to call" says nothing, where "Change the number customers
 * are told to call" does. A row whose label is a noun needs none ("Change Website", "Add one Address").
 */
const BtRow = ({
  id, section = null, label, named = null, brain, value = null, empty = null, hint = null, source = null,
  disputed = null, wrong = null, initial, storedAs: stores = null, check = btNoCheck, commit, body,
  channel = "whatsapp", canEdit = true, gate = null, flash = () => {}, saver = null,
}) => {
  // What saving writes is business-tab-save.jsx's, read as the row draws (that file loads before this one).
  const S = window.__businessTabSave;
  // A row of words stores its draft trimmed.
  const storedAs = stores || S.trimmed;
  const [draft, setDraft] = useBizState(null);
  const [problem, setProblem] = useBizState(null);
  const [arm, setArm] = useBizState(false);
  // What the registry reads when it asks whether this row holds changes. A keystroke lands here as it is typed, so a
  // press on another row straight after typing is asked about even before the page has drawn again.
  const live = useBizRef({ draft: null, initial: null, storedAs, open: false });
  const holds = () => {
    const l = live.current;
    return l.open && l.draft != null && !S.same(l.storedAs(l.draft), l.storedAs(l.initial));
  };
  const fold = window.useRecordFold(id, { dirty: holds });
  // A role that may not change the business never has an editor, whatever asked for one.
  const open = fold.open && canEdit;
  live.current.initial = initial;
  live.current.storedAs = storedAs;
  live.current.open = open;
  const now = open && draft != null ? draft : initial;
  const dirty = open && !S.same(storedAs(now), storedAs(initial));
  // The tab's one saver (business-tab-save.jsx): this row's save waits its turn behind any other, and goes on the
  // config current then.
  const busy = saver ? saver.pending(id) : false;
  const save = (c, done) => { if (saver) saver.save({ row: id, change: c.change, said: c.said, done, flash }); };
  // Each block as the stored brain writes it, resolved once per stored brain rather than on every keystroke.
  const before = useBizRef({ brain: null, blocks: {} });
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
    save(commit(now), close);
  };

  // What saving would tell the receptionist: the lines of its blocks that the draft changes, resolved as the edge
  // resolves them. Only for a draft the save would send, and only while the editor is open, because each call parses
  // the whole brain and resolves a full prompt. Nothing is drawn when nothing changes, and nothing when a block is null
  // (the save's schema refuses the draft, or a record whose profile composes nothing is answered with its stored
  // prompt): never an empty "It will say". The lines it adds are what it will say and the lines it takes away what it
  // will no longer say, both at once: a line rewritten is one of each, and a save that drops one thing and adds another
  // says both, where showing only what it adds hid what goes.
  //
  // And when the save crosses the resolver's own line between composing a prompt and answering with the stored one
  // (hasProfile, decided in the bridge), the sentence that says so goes first: emptying the last field it composes
  // from drops the hand-off and every rule line, far beyond the field's own line. Not a refusal; the save still goes.
  let says = null;
  const tab = window.__businessTab;
  if (dirty && !check(now) && tab) {
    // Applied as the saver applies it (patched), on a copy: a patch that edits a nested object in place leaves the
    // stored brain it is compared with as it was.
    const next = S.patched({ brain }, { change: commit(now).change }).brain;
    const crossing = tab.profileCrossing ? tab.profileCrossing(next) : null;
    const added = [];
    const removed = [];
    if (channel && tab.consequenceOf) {
      if (before.current.brain !== brain) before.current = { brain, blocks: {} };
      const stored = before.current.blocks;
      for (const block of [].concat(section || id)) {
        const after = tab.consequenceOf(block, next, channel);
        if (!after) continue;
        if (!(block in stored)) stored[block] = tab.consequenceOf(block, brain, channel);
        const changed = btChangedLines(stored[block], after);
        added.push(...changed.added);
        removed.push(...changed.removed);
      }
    }
    const note = crossing ? crossing.sentence : null;
    if (added.length || removed.length || note) {
      says = { note, says: added.length ? added.join("\n") : null, gone: removed.length ? removed.join("\n") : null };
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
      save(commit(disputed.use), () => {});
    } : undefined,
    gate,
  } : null;

  // The field is named by the row's own label, where the label stays (the canvas's editing row), rather than by a
  // second copy of it over the box; what it will say describes the box too. Both ids are the kit's (RecordInline).
  const field = { id: `bt-${id}`, label: null, "aria-labelledby": `rec-inline-${id}-key`, "aria-describedby": says ? `rec-inline-${id}-says` : undefined };
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
          act={canEdit ? {
            label: value ? "Change" : "Add one",
            name: named ? (value ? `Change the ${named}` : `Add one ${named}`) : undefined,
            onClick: () => fold.request(),
            gate,
          } : null}
        />
      )}
      <window.RecordInline
        id={id}
        label={label}
        open={open}
        disputed={other}
        says={says ? says.says : null}
        saysLabel="It will say"
        gone={says ? says.gone : null}
        goneLabel="It will no longer say"
        note={says ? says.note : null}
        confirm={fold.asking ? (
          <window.Confirm question="Discard your changes?" detail="Nothing you changed here has been saved." yes="Yes, discard" no="Keep editing" danger onYes={() => { reset(); fold.discard(); }} onNo={fold.stay} testid={`rec-inline-${id}-ask`} />
        ) : arm ? (
          <window.Confirm question="Discard your changes?" detail="Nothing you changed here has been saved." yes="Yes, discard" no="Keep editing" danger onYes={close} onNo={() => setArm(false)} testid={`rec-inline-${id}-cancel`} />
        ) : null}
        onSave={submit}
        onCancel={cancel}
        saving={busy}
        gate={gate}
      >
        {inner}
      </window.RecordInline>
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
 *
 * The door is named by its sentence and then by what it does, which is the act of the row it opens: "It cannot say
 * where you are. Add one Address", in the row's own words and label (RecordRow's ids), so a screen reader hears where
 * it goes and not only a statement. A row not on the page yet adds nothing to the name, and the sentence stands alone.
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
              <button
                type="button"
                className="bt-standing-door"
                onClick={() => door(gap.row)}
                aria-labelledby={`bt-standing-door-words rec-row-${gap.row}-act rec-row-${gap.row}-key`}
                data-testid="rec-standing-door"
              >
                <span id="bt-standing-door-words">{gap.sentence}</span>
              </button>
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
const BtWho = ({ brain, canEdit, flash, saver }) => {
  const F = ((window.__FACTS || {}).facts) || {};
  const conflicts = ((window.__FACTS || {}).conflicts) || [];
  const conflictOn = (key) => conflicts.find((k) => k.fact === key) || null;
  const profile = brain.profile || {};
  // A fact as the settings read resolved it. A read that carried no facts (an older server) falls back to what is
  // typed in the brain, with no source claimed for it: a fact with no source is not a fact, but a stored value is
  // still what the receptionist says.
  const factOf = (key, typed) => F[key] || (typed ? { value: typed, source: null } : { value: null, source: null });
  const chip = (f) => (f.value ? f.source : null);
  const shared = { brain, canEdit, flash, saver };
  const gate = (thing) => window.gate("settings", `change the ${thing}`);
  // Each row's check and patch, and what its draft stores (business-tab-save.jsx).
  const S = window.__businessTabSave;
  const phoneShown = window.phoneShown;

  const name = factOf("business_name", brain.business_name);
  const address = factOf("address", profile.address);
  const website = factOf("website", profile.website);
  const link = factOf("booking_link", brain.booking_link);
  const line = F.voice_line || null;
  const voiceLine = (line && line.value) || "";
  const lineShown = phoneShown(voiceLine);
  const pub = factOf("phone_display", brain.phone_display);
  const transfer = factOf("handoff_number", profile.handoff_number);
  const handoff = transfer.value || null;

  // A row of words: its draft, trimmed, through the row's patch, and the words every such row says once it is saved.
  const words = (id) => (d) => ({ change: S.PATCH_OF[id](S.trimmed(d)), said: BT_SAVED });
  // The two numbers store what their own rules make of a draft, the one it gives out beside the line it answers.
  const published = (d) => S.STORED_AS.phone_display(d, voiceLine);
  const transferOf = S.STORED_AS.handoff_number;

  return (
    <section className="rec-card" data-testid="rec-card-who" aria-labelledby="bt-who-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-who-title">Who you are</h2>
        <span className="rec-card-sub">The facts a customer asks for by name</span>
      </div>

      <BtRow
        {...shared}
        id="name"
        // The line the prompt opens with, and the product's own lines where a rename writes them again (the name's patch).
        section={S.isBaseline(brain) ? ["business_name", "system_prompt"] : "business_name"}
        label="Name"
        value={name.value}
        empty="Not set"
        source={chip(name)}
        disputed={btDispute(name, conflictOn("business_name"), BT_TAKE_GOOGLES)}
        gate={gate("name")}
        initial={brain.business_name || ""}
        check={S.CHECK_OF.name}
        commit={words("name")}
        body={btTextBox({ placeholder: "The name customers know you by", autoComplete: "organization" })}
      />

      <BtRow
        {...shared}
        id="address"
        label="Address"
        value={address.value}
        empty="Not set"
        source={chip(address)}
        disputed={btDispute(address, conflictOn("address"), BT_TAKE_THEIRS)}
        gate={gate("address")}
        initial={profile.address || ""}
        commit={words("address")}
        body={btTextBox({ placeholder: "123 Example St, Brooklyn, NY 11208", autoComplete: "street-address", hint: "Given when someone asks how to find you." })}
      />

      <BtRow
        {...shared}
        id="website"
        label="Website"
        value={website.value}
        empty="Not set"
        // What empty means, and only what is exact: the prompt names a website only when one is typed here. Not that it
        // has none to give, since the owner's own words may name one. Nor what the canvas said, that empty sent
        // customers and the carriers to the page we publish, /b/<slug>: no receptionist is told that page, and the
        // carriers are filed the business record's own website (Connections), or that page when the record has none.
        hint={website.value ? null : "Optional. Left empty, the receptionist is given no website."}
        source={chip(website)}
        disputed={btDispute(website, conflictOn("website"), BT_TAKE_THEIRS)}
        gate={gate("website")}
        initial={profile.website || ""}
        check={S.CHECK_OF.website}
        commit={words("website")}
        body={btTextBox({ placeholder: "https://example.com", inputMode: "url", autoComplete: "url", hint: "Optional. Given when someone asks." })}
      />

      <BtRow
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
        check={S.CHECK_OF.booking_link}
        commit={words("booking_link")}
        body={btTextBox({ placeholder: "https://your-booking-page.com", inputMode: "url", autoComplete: "url", hint: "Sent instead of confirming an appointment itself." })}
      />

      {/* THREE numbers, named for what each one does. They were one row called "Phone line" showing a typed string,
          which is how a salon came to publish the number it transfers to as the number to call. The line it answers
          is provisioned and belongs to Connections, so it is shown here and never offered as a box; the other two are
          the receptionist's behaviour, edited in the row that states them. */}
      {/* The door is the row's act, with its own test id: it opens Connections, never a box, so it is not the row's
          Change. Named for where it goes and why, beginning with its own word, since its word and the row's label
          together ("Connections Answers on") say nothing. */}
      <window.RecordRow
        id="voice_line"
        label="Answers on"
        value={voiceLine ? lineShown : null}
        empty="No phone line yet"
        source={voiceLine ? line.source : null}
        act={{
          label: <>Connections <Icon name="arrow-right" size={10} /></>,
          name: "Connections, where the line it answers on is set up",
          onClick: () => window.CHANLY.nav("admin/integrations"),
          testid: "rec-row-door-voice_line",
        }}
      />

      {/* What the receptionist tells customers to call.

          Absent means "the line it answers", which is the answer for nearly every workspace and the one that stays
          right when the number changes. Publishing anything else is a deliberate act, and the note says what it costs
          -- because the live salon published its transfer number here and every customer who rang it reached a
          person's mobile instead of the receptionist standing by. */}
      <BtRow
        {...shared}
        id="phone_display"
        label="Tells customers to call"
        named="number customers are told to call"
        value={pub.value}
        empty="No number to give out"
        source={chip(pub)}
        disputed={btDispute(pub, conflictOn("phone_display"), { label: "Publish the line instead", draft: () => ({ own: true, typed: "" }) })}
        gate={gate("number customers are told to call")}
        initial={{ own: !brain.phone_display, typed: brain.phone_display || "" }}
        storedAs={published}
        check={(d) => S.CHECK_OF.phone_display(d, voiceLine)}
        commit={(d) => {
          const v = published(d);
          return {
            change: S.PATCH_OF.phone_display(v),
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
          it will say is read on the phone: on WhatsApp the number changes nothing. And only where there is a line to
          call: a workspace that answers on WhatsApp alone is shown no sentence that no receptionist of its receives. */}
      <BtRow
        {...shared}
        id="handoff_number"
        label="Transfers a caller to"
        named="transfer number"
        channel={voiceLine ? "voice" : null}
        value={transfer.value ? phoneShown(transfer.value) : null}
        empty="Takes a message instead"
        source={chip(transfer)}
        disputed={btDispute(transfer, conflictOn("handoff_number"), BT_TAKE_THEIRS)}
        gate={gate("transfer number")}
        initial={phoneShown(profile.handoff_number) || ""}
        storedAs={transferOf}
        check={(d) => S.CHECK_OF.handoff_number(d, voiceLine)}
        commit={(d) => {
          const v = transferOf(d);
          return {
            change: S.PATCH_OF.handoff_number(v),
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
  // The tab's one saver (business-tab-save.jsx), which outlives the page: a page drawn again on coming back to this tab
  // finds the save still out and the answer to the last one. A save moving through it draws the page again, busy or
  // done, for as long as the page is on screen.
  const [, setTick] = useBizState(0);
  const saver = window.__businessTabSave.saver;
  useBizEffect(() => saver.subscribe(() => setTick((n) => n + 1)), [saver]);
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
      <BtWho brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
    </>
  );
};

Object.assign(window, { BusinessTab });
