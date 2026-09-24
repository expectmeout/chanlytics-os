/* global React, Icon */
// Chanlytics — Settings › Business: Who you are.
//
// The first card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.2; the canvas's Group-Who
// and Edit-Inline boards): the seven facts a customer asks for by name, each with where it came from, edited in the row
// that states it. Every row is the page's BtRow (business-tab-gestures.jsx), read from window as the card draws; what
// is this card's is each row's value, source, check, patch and box, and the disagreements factConflicts finds drawn on
// the row each is about.
//
// Loaded after business-tab-gestures.jsx and before business-tab.jsx (both load lists), and read there as
// window.BtWhoCard. Its top-level names are bt-prefixed and it holds no hook of its own (the rows hold theirs), and no
// pattern in it holds an object rest, for the reasons business-tab-save.jsx gives.

/**
 * The box for a row whose value is one line of text. Its hint says what the value is for, or what empty means, and
 * is drawn under the box only while the box is empty: that is when it is the one thing to read (the phone's rule for
 * a row's hint, record.css), and a filled row's editor keeps the row's one line, so nothing under it moves as the
 * value becomes its field. A problem is drawn whenever there is one; RecordField gives it the hint's place.
 */
const btTextBox = (words) => ({ draft, set, problem, field }) => (
  <window.RecordField
    {...field}
    value={draft}
    onChange={set}
    problem={problem}
    hint={draft ? null : words.hint || null}
    placeholder={words.placeholder}
    inputMode={words.inputMode}
    autoComplete={words.autoComplete}
  />
);

/**
 * The number the receptionist gives out, as its box: the line it answers, or a different number, and what that choice
 * costs, in one note. The draft is { own, typed } (business-tab-save.jsx STORED_AS says what each stores). `line` is the
 * line the workspace answers on ("" with none, where the box is the only way to give one), `handoff` the transfer
 * number, and `testid` the prefix of the choice's and the note's test ids. Drawn by the Who you are row and by the
 * create card (business-tab-create.jsx), so the choice and its words are written once. Hookless but for the box.
 */
// `kept` is the number the business keeps and forwards to that line (contracts kept_line): published, it reaches the
// receptionist whenever nobody picks up, so it is not the number that "will not reach" it.
const btPublishedBox = ({ line, handoff, kept, testid }) => ({ draft, set, problem, field, gate: pressable, readOnly }) => {
  const lineShown = window.phoneShown(line);
  return (
    <>
      {line ? (
        <window.RecordToggleGroup
          label="The number to tell customers to call"
          value={draft.own ? "line" : "other"}
          options={[{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }]}
          onChange={(v) => set(v === "line" ? { own: true, typed: draft.typed } : { own: false, typed: draft.typed || lineShown })}
          readOnly={readOnly}
          gate={pressable}
          testid={`${testid}-choice`}
        />
      ) : null}
      <div className="bt-inline-box" hidden={draft.own && line ? true : undefined}>
        <window.RecordField
          {...field}
          value={draft.typed}
          onChange={(t) => set({ own: draft.own, typed: t })}
          problem={problem}
          placeholder={lineShown || "+1 212 555 0143"}
          inputMode="tel"
          autoComplete="tel"
        />
      </div>
      <span className="bt-inline-note" data-testid={`${testid}-note`}>
        {draft.own && line
          ? <><b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing your number changes nothing to keep in step.</>
          : window.__samePhone && window.__samePhone(draft.typed, line)
            ? <>That is your line. Choose <b>Your line</b> and it stays right when the number changes.</>
            : kept && window.__samePhone && window.__samePhone(draft.typed, kept)
              ? <>Your own number. The calls nobody picks up there go to your receptionist on <b className="tabular">{lineShown}</b>.</>
              : handoff && window.__samePhone && window.__samePhone(draft.typed, handoff)
              ? <>This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and never the receptionist answering on <b className="tabular">{lineShown}</b>.</>
              : line
                ? <>Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.</>
                : <>The receptionist has no line of its own yet, so this is the number it gives out.</>}
      </span>
    </>
  );
};

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
// The transfer number's disagreement is a loop (contracts factConflicts): the other answer is the number that forwards
// back to the receptionist, so it is said and never offered in one press -- taking it would make the loop.
const BT_TAKE_NOTHING = { draft: (v) => v, from: [] };
// The name Google lists may be taken in one press. The workspace's own name may not: it is whatever the workspace was
// called when it was made -- a Stripe test's "Billing probe" once went to the carriers as a business's name
// (business-page.ts) -- and a press that renamed the business to it would put that name in front of customers.
const BT_TAKE_GOOGLES = { draft: (v) => v, from: ["verified"] };

/**
 * Who you are (spec §4.2): the seven facts a customer asks for by name, each with where it came from, and the
 * disagreements factConflicts finds drawn on the row each is about, where the banner above the card used to hold them.
 *
 * The Workspace row is gone. It printed the business's name a second time whenever the workspace's name differed: two
 * names for one business, on the one card that exists to say which name customers hear.
 */
const BtWho = ({ brain, base = null, canEdit, flash, saver }) => {
  const F = ((window.__FACTS || {}).facts) || {};
  const conflicts = ((window.__FACTS || {}).conflicts) || [];
  const conflictOn = (key) => conflicts.find((k) => k.fact === key) || null;
  const profile = brain.profile || {};
  // The brain the rows' saves go on (the saver's base), which is what they will say is worked out on.
  const goesOn = (base && base.brain) || brain;
  // A fact as the settings read resolved it. A read that carried no facts (an older server) falls back to what is
  // typed in the brain, with no source claimed for it: a fact with no source is not a fact, but a stored value is
  // still what the receptionist says.
  const factOf = (key, typed) => F[key] || (typed ? { value: typed, source: null } : { value: null, source: null });
  const chip = (f) => (f.value ? f.source : null);
  const shared = { brain, base, canEdit, flash, saver };
  // The page's row, read as the card draws (business-tab-gestures.jsx loads before this file).
  const Row = window.BtRow;
  const gate = (thing) => window.gate("settings", `change the ${thing}`);
  // Each row's check and patch, and what its draft stores (business-tab-save.jsx).
  const S = window.__businessTabSave;
  const phoneShown = window.phoneShown;

  const name = factOf("business_name", brain.business_name);
  const address = factOf("address", profile.address);
  const website = factOf("website", profile.website);
  const link = factOf("booking_link", brain.booking_link);
  // Whether this workspace is asked for a link at all, by how its customers buy (0008, the first run's decision 2): the
  // row's check, its empty state and its hint all follow the one answer.
  const sellsNow = window.btSellsByNow ? window.btSellsByNow() : null;
  const tab = window.__businessTab;
  const linkWords = tab.bookingLinkRowWords(tab.bookingLinkOptional(sellsNow));
  const line = F.voice_line || null;
  const voiceLine = (line && line.value) || "";
  const lineShown = phoneShown(voiceLine);
  // The number the business keeps and forwards to the receptionist, which a transfer must never ring.
  const keptLine = (F.kept_line && F.kept_line.value) || null;
  const pub = factOf("phone_display", brain.phone_display);
  const transfer = factOf("handoff_number", profile.handoff_number);
  const handoff = transfer.value || null;

  // A row of words: its draft, trimmed, through the row's patch, and the words every such row says once it is saved.
  const words = (id) => (d) => ({ change: S.PATCH_OF[id](S.trimmed(d)), said: window.BT_SAVED });
  // The two numbers store what their own rules make of a draft, the one it gives out beside the line it answers.
  const published = (d) => S.STORED_AS.phone_display(d, voiceLine);
  const transferOf = S.STORED_AS.handoff_number;

  return (
    <section className="rec-card" data-testid="rec-card-who" aria-labelledby="bt-who-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-who-title">Who you are</h2>
        <span className="rec-card-sub">The facts a customer asks for by name</span>
      </div>

      <Row
        {...shared}
        id="name"
        // The line the prompt opens with, and the product's own lines where a rename writes them again (the name's patch),
        // decided on the brain the rename goes on, as the patch decides it.
        section={S.isBaseline(goesOn) ? ["business_name", "system_prompt"] : "business_name"}
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

      <Row
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

      <Row
        {...shared}
        id="website"
        label="Website"
        value={website.value ? <span className="bt-one-line">{website.value}</span> : null}
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

      <Row
        {...shared}
        id="booking_link"
        label="Booking link"
        value={brain.booking_link ? <span className="bt-one-line">{brain.booking_link}</span> : null}
        empty={linkWords.empty}
        // What an empty one means, while it is empty (BtRow): a row that has its link states it and stops.
        hint={linkWords.hint}
        source={chip(link)}
        disputed={btDispute(link, conflictOn("booking_link"), BT_TAKE_THEIRS)}
        gate={gate("booking link")}
        initial={brain.booking_link || ""}
        check={(d) => S.CHECK_OF.booking_link(d, sellsNow)}
        commit={words("booking_link")}
        body={btTextBox({ placeholder: "https://your-booking-page.com", inputMode: "url", autoComplete: "url", hint: linkWords.hint })}
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
          label: "Connections",
          icon: "arrow-right",
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
      <Row
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
        body={btPublishedBox({ line: voiceLine, handoff, kept: keptLine, testid: "rec-inline-phone_display" })}
      />

      {/* Where a caller who insists on a person is transferred. Empty is a choice. Shown, and changed from, the way the
          row writes it: the check and the stored form both read "+1 (786) 555-0182". Its words are a call's, so what
          it will say is read on the phone: on WhatsApp the number changes nothing. And only where there is a line to
          call: a workspace that answers on WhatsApp alone is shown no sentence that no receptionist of its receives. */}
      <Row
        {...shared}
        id="handoff_number"
        label="Transfer number"
        named="transfer number"
        channel={voiceLine ? "voice" : null}
        value={transfer.value ? phoneShown(transfer.value) : null}
        empty="Takes a message instead"
        source={chip(transfer)}
        disputed={btDispute(transfer, conflictOn("handoff_number"), BT_TAKE_NOTHING)}
        gate={gate("transfer number")}
        initial={phoneShown(profile.handoff_number) || ""}
        storedAs={transferOf}
        check={(d) => S.CHECK_OF.handoff_number(d, voiceLine, keptLine)}
        commit={(d) => {
          const v = transferOf(d);
          return {
            change: S.PATCH_OF.handoff_number(v),
            said: v ? <>Callers who insist on a person reach <b className="tabular">{phoneShown(v)}</b>.</> : <>The receptionist takes a message instead of transferring.</>,
          };
        }}
        body={btTextBox({
          placeholder: "+1 212 555 0143",
          inputMode: "tel",
          autoComplete: "tel",
          hint: "A line a person answers, with the country code. Empty and the phone receptionist takes a message instead of transferring — which is better than a number nobody picks up.",
        })}
      />

      {/* Nothing is asked twice (spec §3): the carrier record is Connections', and this card only says where it is. */}
      <p className="bt-card-foot" data-testid="rec-who-foot">
        Your legal name and registered address are asked once on <button type="button" className="bt-link" onClick={() => window.CHANLY.nav("admin/integrations")} data-testid="rec-who-carriers">Connections</button>, for the carriers. Nothing here repeats them.
      </p>
    </section>
  );
};

Object.assign(window, { BtWhoCard: BtWho, btPublishedBox });
