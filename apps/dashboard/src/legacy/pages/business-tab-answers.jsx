/* global React, Icon */
// Chanlytics — Settings › Business: How it answers.
//
// The fourth card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.5 and §4.6; the canvas's
// Record and Group-Answers boards): the voice, the languages, the rules it always keeps, how it hands you a customer,
// the things it should know, what it is told in your own words, and the three messages sent in your name when it cannot
// answer. Seven rows, each a fold (BtFold, business-tab-gestures.jsx). It replaces the old form's "How it answers" group
// (BusinessEditor, settings.jsx: Languages, Rules it always follows, Hand over to a person when, Other things it should
// know, Anything else it should know, When it can't answer), and what those learned came with them, comments and all;
// and it gives the voice the box it never had. `profile.tone` was read, diffed, saved and composed into every prompt,
// and no form drew a box for it (spec D5).
//
// The page composes and never derives. Every sentence here with a number in it is contracts' (handoffWords,
// handoffChatWords, handoffCallWords, notesWords, instructionsWords, fallbacksWords, TONE_PRESETS and
// RULES_WITHOUT_FIELDS_WORDS, through window.__businessTab); what each fold opens with, refuses and writes is
// business-tab-folds.jsx's; the gesture is BtFold, read from window as each row draws.
//
// Loaded after business-tab-offer.jsx and before business-tab-services.jsx (both load lists), and read by the page as
// window.BtAnswersCard, which the page draws above the services sheet: the sheet is its last hook-holding child
// (business-tab.jsx says why). It holds no hook of its own (its folds hold theirs), and what comes and goes inside a
// fold (a language, a note) is drawn hookless, as the kit's RecordBox and plain buttons: the tests' stub React keeps
// every hook on the page as a cell in one order (business-tab-gestures.jsx's header). Its top-level names are
// bta-prefixed, and no pattern in it holds an object rest, for the reasons business-tab-save.jsx gives.
//
// Two lists here are the old form's too, until Task 3.7 deletes it: the languages it offers and the three messages'
// labels. They moved here, and settings.jsx reads them through window as it loads (this file loads first in both
// lists), so there is one copy of each.

/* ------------------------------------ the lists the old form shares ------------------------------------ */

// Offered rather than typed. A comma-separated box asks someone to guess both
// the spelling and the separator, and "Espanol" and "Spanish" would then be two
// different languages to anything reading this later. Anything not listed can
// still be added by hand.
const BTA_LANGUAGES = ["English", "Spanish", "Portuguese", "French", "Haitian Creole", "Mandarin", "Cantonese", "Arabic", "Russian", "Polish", "Italian", "Hindi"];

// The three messages sent in the business's name when the receptionist cannot answer (S5), in the order an owner meets
// them, each with when it goes out -- the edge's own conditions (whatsapp/inbound.ts), in an owner's words.
const BTA_FALLBACK_ROWS = [
  { key: "error", label: "If it can't write a reply", when: "The AI service failed or couldn't finish an answer. The conversation then waits for you." },
  { key: "non_text", label: "If it gets something it can't read", when: "A voice note, a sticker, or a photo it can't look at. It then stays out of that conversation and asks for you." },
  { key: "greeting", label: "If replies can't be written at all", when: "Only while Chanlytics' AI connection is down. Each conversation then waits for you." },
];

/* ------------------------------------ the voice ------------------------------------ */

/**
 * The voice: one short box, and three sentences to start from. A press on one puts its sentence in the box, which the
 * owner makes their own from there; the sentences are contracts' (TONE_PRESETS), so the vm tests hold each to what the
 * profile keeps. The box is named by the fold's own label, the words on screen above it (RecordFold's
 * rec-fold-<id>-label), as consult-first's is.
 */
const BtaVoice = ({ draft, update, press, problems, readOnly }) => {
  const presets = (window.__businessTab || {}).TONE_PRESETS || [];
  return (
    <>
      <window.RecordField
        id="bt-tone"
        label={null}
        aria-labelledby="rec-fold-tone-label"
        rows={2}
        value={draft}
        onChange={(v) => update(() => v, ["tone"])}
        problem={problems.tone || null}
        placeholder="Friendly and to the point."
        readOnly={readOnly || undefined}
        testid="rec-tone-box"
      />
      {presets.length ? (
        <div className="bt-presets" role="group" aria-labelledby="bt-tone-presets-key" data-testid="rec-tone-presets">
          <span className="bt-presets-key" id="bt-tone-presets-key">Start from</span>
          {presets.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" {...press(() => update(() => p.tone, ["tone"]))}>{p.label}</button>
          ))}
        </div>
      ) : null}
    </>
  );
};

/* ------------------------------------ the languages ------------------------------------ */

// What the languages' box says where Add would be, once the list holds as many as the profile keeps (LIMITS.languages).
const BTA_LANGUAGES_FULL = "That is the most languages it keeps. Remove one to add another.";
const btaSameWord = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * The languages as tokens, each with its remove, and one box to add another: the kit's combobox over the common ones,
 * which takes a name it does not list as it was typed (the old form's "Anything not listed can still be added by
 * hand"). ONE control, as the old form's was: a grid of every language shouting beside the two chosen, and a second
 * control under it to add a fifteenth, were two widgets for one job.
 *
 * The list is the draft's, with every rule a list has (BtFold's rows: the cap through Add and through an Undo, the
 * removal said only when it happened, the language back at its own place). Backspace on the empty box takes the last
 * one back, which is what every token field does and what a hand expects, and says so with its Undo; words typed and
 * left there are added as focus leaves the box, as the old form's were. Nothing past the profile's eight is offered:
 * the box is hidden then, and a sentence stands where it was. The box is drawn on every render, hidden or not: it holds
 * hooks.
 */
const BtaLanguages = ({ draft, rows, press, problems, readOnly }) => {
  const S = window.__businessTabSave;
  const chosen = Array.isArray(draft) ? draft : [];
  // `blank` is the language an add appends: rows() is a builder over the live draft, so it is built for each add.
  const list = (adding) => rows({ id: "languages", max: S.LIMITS.languages, blank: () => adding, keysOf: () => ["languages"], key: "languages", full: BTA_LANGUAGES_FULL });
  const langs = list(null);
  const remove = (i) => langs.removeAt(i, (gone) => <>Removed <b>{gone}</b></>);
  // A name already chosen, however it is written, is not added twice: "spanish" and "Spanish" are one language.
  const add = (name) => {
    const v = String(name == null ? "" : name).trim();
    if (!v || chosen.some((l) => btaSameWord(l, v))) return;
    list(v).add();
  };
  const offered = BTA_LANGUAGES.filter((l) => !chosen.some((c) => btaSameWord(c, l))).map((l) => ({ value: l, label: l }));
  return (
    <div className="bt-languages" data-testid="rec-languages">
      {chosen.length ? (
        <ul className="bt-tokens" aria-labelledby="rec-fold-languages-label" data-testid="rec-languages-tokens">
          {chosen.map((l, i) => (
            <li key={`${l}-${i}`} className="bt-token">
              {l}
              <button type="button" className="bt-token-x" aria-label={`Remove ${l}`} {...press(() => remove(i))} data-testid={`rec-language-remove-${l}`}>
                <Icon name="x" size={10} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="bt-languages-add" hidden={langs.canAdd ? undefined : true}>
        <window.RecordCombobox
          id="bt-languages-add"
          label="Add a language"
          value={null}
          options={offered}
          onChange={add}
          typed={(words) => (BTA_LANGUAGES.concat(chosen).some((l) => btaSameWord(l, words)) ? null : { value: words, label: `Add “${words}”` })}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && e.target && e.target.value === "" && chosen.length) { e.preventDefault(); remove(chosen.length - 1); }
          }}
          // Words typed and left in the box are added as focus leaves it, as the old form's box did: a listed one as the
          // list spells it, anything else as typed (add refuses one already chosen). Closed over them, the box lost the
          // language, and the fold saved without it.
          onLeave={(words) => add(BTA_LANGUAGES.find((l) => btaSameWord(l, words)) || words)}
          // The words the box is named by, on screen in it: a placeholder of other words left the name unseen.
          placeholder="Add a language"
          readOnly={readOnly}
          testid="rec-languages-add"
        />
      </div>
      {langs.canAdd ? null : <p className="bt-fold-note" data-testid="rec-languages-cap">{BTA_LANGUAGES_FULL}</p>}
      <window.FieldError id="bt-languages-problem" message={problems.languages || null} testid="rec-languages-problem" />
    </div>
  );
};

/* ------------------------------------ the rules it always keeps ------------------------------------ */

// The four rules, in the schema's order (contracts GUARDRAIL_KEYS), each with the old form's label and the short name
// the row says it by at rest (the canvas's Record board). The sentence under the label is NOT here: it is the rule's
// own strength (contracts ruleStrength(key).sentence, Task 4.2), because the form's hint said what the rule asks for
// and the strength says how far it actually goes -- and two sentences on one switch is the clutter the owner asked us
// to stop. The health rule's hint WAS its strength's sentence, word for word; contracts has it now.
const BTA_RULES = [
  ["never_quote_prices", "Never quote or confirm a price", "Never quotes a price"],
  ["never_confirm_booking", "Never confirm an appointment itself", "Never confirms a booking"],
  ["disclose_ai", "Say it is an assistant if asked", "Says it's an assistant"],
  ["no_health_advice", "Never give health advice", "No health advice"],
];

/**
 * The four switches, and the photos switch apart from them. Each rule is ONE element holding its label, its hint and
 * its switch (rec-rule-<key>), so Phase 4 draws its strength into it rather than rebuilding it. The draft is the fold's
 * whole guardrails draft, and a press writes one key of it, spread over the rest: saveFold refuses a draft with any of
 * the five missing (business-tab-folds.jsx btWhole), because a missing switch written as it stood was stored as off,
 * the opposite of the schema's "absent means on".
 *
 * Absent means ON for the first three and OFF for health advice, as draftOf opens them: a record that stores no rules
 * opens with three on, and a Save that changes nothing sends nothing. On a record whose details compose nothing, none
 * of the four changes a word the receptionist is told (the price detector still reads every reply), and the fold says
 * so once, in contracts' words, where the rules' block would be (`unread`); it draws no empty "It will be told".
 */
const BtaRules = ({ draft, update, readOnly, unread }) => {
  const tab = window.__businessTab || {};
  // The photos switch's strength, which is not a rule's: it is an ability, stored apart from the guardrails.
  const vision = tab.VISION_STRENGTH || null;
  return (
  <div className="bt-rules-list" data-testid="rec-rules-switches">
    {BTA_RULES.map(([key, label]) => {
      // How far this rule goes, in contracts' words: one badge and one sentence, never typed here. Without the bridge
      // to ask, the switch keeps its label and claims no guarantee.
      const r = typeof tab.ruleStrength === "function" ? tab.ruleStrength(key) : null;
      return (
      <div key={key} className="bt-rule" data-testid={`rec-rule-${key}`}>
        <span className="bt-rule-words">
          <span className="bt-rule-head">
            <span className="bt-rule-label" id={`bt-rule-${key}-label`}>{label}</span>
            {/* A muted word, never a filled pill: the strength is the one quiet signal this row carries. */}
            {r ? <span className="bt-rule-chip">{r.chip}</span> : null}
          </span>
          {/* Not drawn under 761px (settings.css), where four sentences are most of a phone's screen -- so the switch
              carries it as its description at every width, and a screen reader hears the guarantee either way. */}
          {r ? <span className="bt-rule-says" id={`bt-rule-${key}-says`}>{r.sentence}</span> : null}
          {/* Only the checked rule has two channels to tell apart: in chat the words are swapped before anyone reads
              them, on a call the figure has already been heard. Both are contracts', channel name and all. */}
          {r && r.checkedOn ? (
            <span className="bt-rule-checked">
              {r.checkedOn.map((c) => (
                <span key={c.channel} className="bt-rule-checked-line">
                  <span className="bt-rule-checked-who">{c.label}</span>{" "}
                  {c.words}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <window.RecordSwitch
          on={draft[key] === true}
          onChange={(v) => update((d) => ({ ...d, [key]: v }))}
          labelledBy={`bt-rule-${key}-label`}
          describedBy={r ? `bt-rule-${key}-says` : null}
          readOnly={readOnly}
          testid={`rec-rule-switch-${key}`}
        />
      </div>
      );
    })}
    {unread ? <p className="bt-fold-note" data-testid="rec-rules-unread">{unread}</p> : null}
    {/* Opt-in, unlike the rules above: this gives the receptionist an ability rather than a limit, so it starts off.
        Apart from them, under a dashed rule (rec-rule-sep is the name Phase 4's test knows it by). It changes no word of
        the prompt (a photo's words go in the customer's own turn), so it draws no "It will be told" of its own. */}
    <div className="bt-rule bt-rule-power" data-testid="rec-rule-vision">
      <span className="bt-rule-sep rec-rule-sep" aria-hidden="true" />
      <span className="bt-rule-words">
        <span className="bt-rule-head">
          <span className="bt-rule-label" id="bt-rule-vision-label">Look at photos customers send</span>
          {/* The fifth strength, from contracts like the four above it (VISION_STRENGTH): a badge typed here and
              typed again in the page's test agreed with each other and with nothing else. */}
          {vision ? <span className="bt-rule-chip">{vision.chip}</span> : null}
        </span>
        {/* Drawn at every width, unlike the four: it is the one switch whose sentence says what each POSITION does,
            which is a decision an owner makes here. Not the canvas's "The four above are limits and start on":
            health advice starts off too. */}
        {vision ? <span className="bt-rule-hint">{vision.sentence}</span> : null}
      </span>
      <window.RecordSwitch
        on={draft.vision === true}
        onChange={(v) => update((d) => ({ ...d, vision: v }))}
        labelledBy="bt-rule-vision-label"
        readOnly={readOnly}
        testid="rec-rule-switch-vision"
      />
    </div>
  </div>
  );
};

/* ------------------------------------ how it hands you a customer ------------------------------------ */

/**
 * Both halves of a hand-off, in one row naming both channels (spec §4.5): the owner's reasons, one to a line, and what
 * each channel does with them. The sentences are contracts', checked against the edge (handoffChatWords says what the
 * chat hand-off does, and how long it holds off, which is the Autonomy tab's; handoffCallWords says what a transfer
 * does, and that the reasons reach a call too).
 *
 * The transfer number is only shown here, never edited: Who you are's "Transfer number" is its one editor (the
 * plan's decision in Task 3.2's review), and a door opens that row, by its id, as the standing line's door opens a
 * row. With the Autonomy tab's read failed, how long it holds off cannot be said, and a failed read says so where the
 * sentence would be. On a workspace with no line to call (`calls` false) no receptionist of it takes a call, so what a
 * call does is not said, nor is the door offered: Who you are's transfer row says nothing it will say there either.
 * What a call would do with the number stays at rest, as that row keeps its value.
 */
const BtaHandoff = ({ draft, update, press, problems, readOnly, words, transfer, calls, policies }) => {
  const tab = window.__businessTab || {};
  // Whether the draft holds a reason, by the rule its save writes the lines by.
  const reasons = window.__businessTabSave.linesOf(draft).length > 0;
  // The Autonomy reply row's pause, as it is stored: usually nothing, which contracts reads as a day, as the pane does.
  const reply = policies && Array.isArray(policies.rows) ? policies.rows.find((r) => r && r.class === "reply") : null;
  const pauseHours = reply && reply.limits ? reply.limits.pause_hours : undefined;
  return (
    <>
      <window.RecordField
        id="bt-escalate-when"
        label="Your reasons"
        hint="One per line."
        rows={4}
        value={draft}
        onChange={(v) => update(() => v, ["escalate_when"])}
        problem={problems.escalate_when || null}
        placeholder={"They ask for the owner by name\nThey are unhappy about a previous visit"}
        readOnly={readOnly || undefined}
        testid="rec-handoff-reasons"
      />
      <div className="bt-handoff-part" data-testid="rec-handoff-chat-part">
        <span className="bt-channel">WhatsApp</span>
        {policies === null ? (
          <window.FailedRead kind="line" what="the Autonomy tab" surface="settings" testid="rec-handoff-unread" />
        ) : tab.handoffChatWords ? (
          <p className="bt-fold-note" data-testid="rec-handoff-chat-says">{tab.handoffChatWords({ hasEscalateWhen: reasons, pauseHours })}</p>
        ) : null}
      </div>
      <div className="bt-handoff-part" data-testid="rec-handoff-call-part">
        <span className="bt-channel">Phone</span>
        <span className="bt-handoff-number" data-testid="rec-handoff-number">{words ? words.phone : null}</span>
        {calls && tab.handoffCallWords ? (
          <p className="bt-fold-note" data-testid="rec-handoff-call-says">{tab.handoffCallWords({ hasHandoffNumber: !!transfer, hasEscalateWhen: reasons })}</p>
        ) : null}
        {calls ? (
          <button type="button" className="bt-link" {...press(() => { if (window.__recordFolds) window.__recordFolds.request("handoff_number"); })} data-testid="rec-handoff-door">
            {transfer ? "Change the transfer number" : "Add a transfer number"}
          </button>
        ) : null}
      </div>
    </>
  );
};

/* ------------------------------------ the things it should know ------------------------------------ */

// What the notes say where Add would be, once there are as many as the profile keeps (LIMITS.notes).
const BTA_NOTES_FULL = "That is the most notes it keeps. Remove one to add another.";

/**
 * The notes, each a title and what it says, with a remove. A note is words somebody typed, the same as a closure, and
 * each went with one press and no Undo (S18): now the removal says so and offers it back at its own place (BtFold's
 * rows), and the list stops at the profile's ten, where the old form stopped by hiding Add. Hookless (the kit's
 * RecordBox, a textarea for what a note says): its rows come and go. What stops a note (half of one, or more than the
 * profile keeps) is said once under its row, and both its boxes are wrong by it.
 */
const BtaNotes = ({ draft, rows, press, problems, readOnly }) => {
  const S = window.__businessTabSave;
  const notes = rows({
    id: "notes",
    name: (i) => `note-${i}`,
    max: S.LIMITS.notes,
    blank: () => ({ title: "", text: "" }),
    keysOf: (i) => [`note-${i}`],
    key: "notes",
    full: BTA_NOTES_FULL,
  });
  const list = Array.isArray(draft) ? draft : [];
  return (
    <div className="bt-notes" data-testid="rec-notes-rows">
      {/* The columns' names, on screen and not read out: each box carries its own, with its row's place in it. */}
      {list.length > 0 ? (
        <div className="bt-note-head" aria-hidden="true">
          <span>Title</span><span>What it says</span><span />
        </div>
      ) : null}
      {list.map((n, i) => {
        const bad = problems[`note-${i}`] || null;
        const problemId = `bt-note-${i}-problem`;
        const title = n && typeof n.title === "string" ? n.title : "";
        return (
          <div key={i} className="bt-note" data-testid={`rec-note-${i}`} {...notes.row(i)}>
            <window.RecordBox
              id={`bt-note-${i}-title`} label={`Note ${i + 1} title`} value={title} placeholder="Gift cards"
              onChange={(v) => notes.setAt(i, { title: v })} invalid={bad ? problemId : null} readOnly={readOnly}
            />
            <window.RecordBox
              id={`bt-note-${i}-text`} label={`Note ${i + 1}, what it says`} rows={2} value={n && typeof n.text === "string" ? n.text : ""}
              placeholder="Gift cards are sold at the front desk, any amount — ask for the owner."
              onChange={(v) => notes.setAt(i, { text: v })} invalid={bad ? problemId : null} readOnly={readOnly}
            />
            <button
              type="button" className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Remove ${title.trim() || `note ${i + 1}`}`}
              {...press(() => notes.removeAt(i, (gone) => <>Removed {gone && gone.title ? <b>{gone.title}</b> : "a note"}</>))}
              data-testid={`rec-note-remove-${i}`}
            ><Icon name="x" size={12} /></button>
            <window.FieldError id={problemId} message={bad} testid={`rec-note-problem-${i}`} />
          </div>
        );
      })}
      {notes.canAdd ? (
        <button type="button" className="btn btn-sm bt-fold-add" {...press(() => notes.add())} data-testid="rec-notes-add">
          <Icon name="plus" size={12} /> Add a note
        </button>
      ) : (
        <p className="bt-fold-note" data-testid="rec-notes-cap">{BTA_NOTES_FULL}</p>
      )}
      <window.FieldError id="bt-notes-problem" message={problems.notes || null} testid="rec-notes-problem" />
    </div>
  );
};

/* ------------------------------------ in your own words ------------------------------------ */

/**
 * The owner's own words, pre-filled with the workspace's existing instructions, so nothing a business already told its
 * receptionist quietly disappears the moment it fills in a form: contracts chooses them (S4, draftOf's
 * __instructionsDraft), the owner's own, or the prompt from before the form, carried and said so here -- never the
 * product's opening lines, which no owner wrote. Its save is the one that writes the stored prompt too (saveFold, S4).
 * The count of what is written sits under the box, with the limit in it, and nowhere else: at rest the row says the
 * words, not how many characters they are (contracts instructionsWords).
 */
const BtaOwnWords = ({ draft, update, problems, readOnly }) => {
  const tab = window.__businessTab || {};
  const d = draft || {};
  const text = typeof d.text === "string" ? d.text : "";
  const room = tab.instructionsWords ? tab.instructionsWords(text).limit : null;
  return (
    <>
      {/* Text nobody here wrote sat under "written in your own words" (S4): say where it came from, and which wins. */}
      {d.carried ? (
        <p className="bt-fold-note" data-testid="rec-own-carried">Carried over from the instructions your receptionist followed before this form. Trim what the fields above now cover — where the two disagree about the address, hours or services, the fields win.</p>
      ) : null}
      <window.RecordField
        id="bt-own-words"
        label={null}
        aria-labelledby="rec-fold-extra_instructions-label"
        rows={Math.min(14, Math.max(4, Math.ceil(text.length / 90)))}
        value={text}
        onChange={(v) => update((was) => ({ ...was, text: v }), ["extra_instructions"])}
        problem={problems.extra_instructions || null}
        placeholder="Parking is behind the building. We do not take walk-ins after 5pm."
        readOnly={readOnly || undefined}
        testid="rec-own-box"
      />
      {room && !problems.extra_instructions ? <span className="bt-own-count" data-testid="rec-own-count">{room}</span> : null}
    </>
  );
};

/* ------------------------------------ when it can't answer ------------------------------------ */

/**
 * The three messages sent in the business's name when the receptionist cannot answer (S5): shown, and the owner's to
 * change. Each is its label and when it goes out (the edge's own conditions), its box, and what a customer would read
 * with the business's details as they are now -- shown only when the message names a detail, since one that names
 * none reads as written (contracts fallbackMessages, the function each goes out through). A link or a number written
 * out stays as written when the details change, where the name of a detail follows them, so the box says so. Each can
 * go back to the product's wording in one press. They are never part of the prompt, so the fold says nothing it will
 * be told.
 */
const BtaFallbacks = ({ draft, update, press, problems, readOnly, brain }) => {
  const d = draft || {};
  const defaults = window.__fallbackDefaults || {};
  const F = ((window.__FACTS || {}).facts) || {};
  const voiceLine = (F.voice_line && F.voice_line.value) || null;
  const link = String(brain.booking_link || "").trim();
  // What a customer would read with the messages as typed and the details as the brain holds them.
  const readsOf = () => window.__fallbackMessages({
    business_name: String(brain.business_name || "").trim() || "your business",
    booking_link: link,
    phone_display: String(brain.phone_display || "").trim() || undefined,
    fallbacks: { ...d },
  }, { channels: voiceLine ? [{ kind: "voice", number_e164: voiceLine, status: "active" }] : [] });
  const reads = window.__fallbackMessages && BTA_FALLBACK_ROWS.some(({ key }) => /\{/.test(String(d[key] || ""))) ? readsOf() : {};
  return (
    <div className="bt-fallbacks" data-testid="rec-fallbacks">
      <p className="bt-fold-note">{"{business}"}, {"{booking link}"} and {"{phone}"} are filled in as each goes out.</p>
      {BTA_FALLBACK_ROWS.map(({ key, label, when }) => {
        const text = typeof d[key] === "string" ? d[key] : "";
        const shown = /\{/.test(text) ? reads[key] : null;
        // A link or a number written out stays as written when the details change; a name follows them. The rule is
        // contracts' (writtenOutDetail), written once and tested there.
        const written = window.__businessTab.writtenOutDetail(text, link);
        return (
          <div key={key} className="bt-fallback" data-testid={`rec-fallback-${key}`}>
            <span className="bt-fallback-label" id={`bt-fallback-${key}-label`}>{label}</span>
            <span className="bt-fallback-when">{when}</span>
            <window.RecordBox
              id={`bt-fallback-${key}`} label={label} rows={3} value={text}
              onChange={(v) => update((was) => ({ ...was, [key]: v }), [key])} problem={problems[key] || null} readOnly={readOnly}
            />
            {shown && !problems[key] ? <span className="bt-fallback-reads" data-testid={`rec-fallback-${key}-reads`}>A customer reads: {shown}</span> : null}
            {written ? (
              <span className="bt-fold-note" data-testid={`rec-fallback-${key}-written`}>
                {written === "link" ? <>Your booking link is written out here — {"{booking link}"} keeps it current.</> : <>A number is written out here — {"{phone}"} gives the one you publish.</>}
              </span>
            ) : null}
            {defaults[key] !== undefined && text !== defaults[key] ? (
              <button
                type="button" className="btn btn-ghost btn-sm bt-fallback-default"
                aria-describedby={`bt-fallback-${key}-label`}
                {...press(() => update((was) => ({ ...was, [key]: defaults[key] }), [key]))}
                data-testid={`rec-fallback-${key}-default`}
              >Use the default wording</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------ the card ------------------------------------ */

/**
 * How it answers (spec §4.5): seven rows in the canvas's order, each a fold. `brain` and `config` are the settings
 * read's, which the rows state; `base` is the config the next save goes on (the saver's base), which is what the rules
 * fold judges "composes nothing" by, as its save will be; what a fold opens with and saves onto is the saver's base,
 * which BtFold asks for itself.
 */
const BtAnswersCard = ({ brain, base = null, config = null, canEdit, flash, saver }) => {
  const tab = window.__businessTab || {};
  const S = window.__businessTabSave;
  const Fold = window.BtFold;
  const profile = brain.profile || {};
  const stored = config || { brain };
  const gate = (thing) => window.gate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };
  const F = ((window.__FACTS || {}).facts) || {};

  const tone = typeof profile.tone === "string" && profile.tone.trim() ? profile.tone.trim() : null;
  // A stored list that is not one (a hand-edited record) is none: joined as it stood, it threw as the card drew.
  const languages = (Array.isArray(profile.languages) ? profile.languages : []).filter((l) => typeof l === "string" && l.trim() !== "");
  // The rules as the fold opens them (contracts guardrailsInForce, through draftOf: absent means on for three, off for
  // health advice and photos), so the row and the fold never read a stored rule two ways. Without the bridge to ask,
  // the row names no rule it cannot back.
  const rules = typeof tab.guardrailsInForce === "function" ? S.draftOf("guardrails", stored) : null;
  // Whether the record's details compose anything, by the resolver's own test (hasProfile), on the brain the rules'
  // save goes on. Without the bridge to ask, nothing is claimed.
  const on = (base && base.brain) || brain;
  const composes = typeof tab.hasProfile === "function" ? tab.hasProfile(on.profile || null) : true;
  // Which of them the row may name, and in what words: contracts', off the three strengths (rulesKept). Not every
  // switch decides the same amount -- the price detector runs with its switch off, the two told-and-trusted rules are
  // lines in a prompt a record composing nothing never gets, and a booking is beyond the product either way. So the
  // row never lists a rule as kept that the receptionist was never told and cannot keep on its own.
  const ruleChips =
    rules && typeof tab.rulesKept === "function"
      ? tab.rulesKept({ rules, vision: rules.vision === true, composes }).map((label) => ({ label }))
      : [];
  // The transfer number as the settings read resolved it, read as the Who you are row reads it (its factOf): the fact
  // when the read carried one, and what is typed only when it carried none (an older server).
  const transferFact = F.handoff_number || { value: profile.handoff_number || null };
  const transfer = transferFact.value ? window.phoneShown(transferFact.value) : null;
  // Whether the workspace answers calls at all: the line it answers on, as Who you are reads it.
  const calls = !!(F.voice_line && F.voice_line.value);
  const handoff = tab.handoffWords ? tab.handoffWords(profile.escalate_when, transfer) : null;
  const notes = tab.notesWords ? tab.notesWords(profile.notes) : { count: 0, chips: [], more: null };
  // Needs the bridge's __instructionsDraft (S4): without it the row says nothing it cannot back.
  const own = typeof window.__instructionsDraft === "function" ? S.draftOf("extra_instructions", stored) : null;
  const ownWords = own && tab.instructionsWords ? tab.instructionsWords(own.text) : { opening: null };
  const messages = tab.fallbacksWords ? tab.fallbacksWords(brain.fallbacks) : null;

  return (
    <section className="rec-card" data-testid="rec-card-answers" aria-labelledby="bt-answers-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-answers-title">How it answers</h2>
        <span className="rec-card-sub">The voice, the limits, and what fits no field</span>
      </div>

      <Fold
        {...shared}
        id="tone"
        label="Its voice"
        hint="A sentence. How it should sound, not what it should say."
        lines
        gate={gate("its voice")}
        row={{
          value: tone,
          empty: "Not set",
          act: tone ? "Change" : "Give it one",
          name: tone ? "Change its voice" : "Give it one: a voice of its own",
        }}
        body={(f) => <BtaVoice {...f} />}
      />

      <Fold
        {...shared}
        id="languages"
        label="Languages"
        // The old form's words: on WhatsApp the composer says only "You speak: …", and "whichever the caller uses" is a
        // call's line (config.ts), so the canvas's "It replies in whichever the customer uses" said more than chat is told.
        hint="It answers in whichever of these a customer uses."
        lines
        gate={gate("the languages it speaks")}
        row={{
          value: languages.length ? languages.join(", ") : null,
          empty: "Not set",
          hint: languages.length ? "It answers in whichever of these a customer uses." : null,
          name: languages.length ? "Change the languages it speaks" : "Add one: a language it speaks",
        }}
        body={(f) => <BtaLanguages {...f} />}
      />

      <Fold
        {...shared}
        id="guardrails"
        label="Rules it always keeps"
        hint="These hold whatever else you write."
        gate={gate("the rules it always keeps")}
        row={{
          // Capped like every other row of chips (the kit's RecordChips, contracts CHIPS_SHOWN): five of them wrapped
          // three deep at a phone's width, which is a paragraph of nouns where the row states one fact.
          value: ruleChips.length ? (
            <window.RecordChips chips={ruleChips} max={tab.CHIPS_SHOWN} more={tab.chipsMoreWords} testid="rec-rules-chips" />
          ) : null,
          name: "Change the rules it always keeps",
        }}
        body={(f) => <BtaRules {...f} unread={composes ? null : tab.RULES_WITHOUT_FIELDS_WORDS || null} />}
      />

      <Fold
        {...shared}
        id="escalate_when"
        label="Hands you a customer"
        hint="When it hands a conversation to you, on WhatsApp and on a call."
        gate={gate("how it hands you a customer")}
        row={{
          value: handoff ? (
            <span className="bt-handoff" data-testid="rec-handoff-lines">
              <span className="bt-handoff-line" data-testid="rec-handoff-chat"><span className="bt-channel">WhatsApp</span> <span className="bt-handoff-words">{handoff.chat}</span></span>
              <span className="bt-handoff-line" data-testid="rec-handoff-phone"><span className="bt-channel">Phone</span> <span className="bt-handoff-words">{handoff.phone}</span></span>
            </span>
          ) : null,
          empty: "Not set",
          name: "Change how it hands you a customer",
        }}
        body={(f) => <BtaHandoff {...f} words={handoff} transfer={transfer} calls={calls} policies={window.__POLICIES} />}
      />

      <Fold
        {...shared}
        id="notes"
        label="Things it should know"
        hint="One topic each: parking, gift cards, a second location. Both receptionists say these."
        gate={gate("the things it should know")}
        row={{
          value: notes.count ? <window.RecordChips chips={notes.chips.map((label) => ({ label }))} more={notes.more} testid="rec-notes-chips" /> : null,
          empty: "None",
          name: notes.count ? "Change the things it should know" : "Add one: a thing it should know",
        }}
        body={(f) => <BtaNotes {...f} />}
      />

      <Fold
        {...shared}
        id="extra_instructions"
        label="In your own words"
        hint="Optional. Anything the rows on this page do not cover."
        gate={gate("what it is told in your own words")}
        row={{
          // Their opening, and nothing else. "339 characters" stood in front of it, which is a number an owner can do
          // nothing about while reading the page, and on a phone it pushed the words themselves onto a second line.
          value: ownWords.opening ? (
            <span className="bt-own" data-testid="rec-own-words">
              <span className="bt-own-opening">{ownWords.opening}</span>
            </span>
          ) : null,
          empty: "None",
          act: ownWords.opening ? "Change" : "Add some",
          name: ownWords.opening ? "Change what it is told in your own words" : "Add some: your own words",
        }}
        body={(f) => <BtaOwnWords {...f} />}
      />

      <Fold
        {...shared}
        id="fallbacks"
        label="When it can't answer"
        hint="Three messages, sent in your name."
        channel={null}
        gate={gate("the messages sent when it can't answer")}
        row={{
          // One line. Which message differs from the product's wording, and the press that puts it back, are both
          // inside the fold, on the message itself: a count of the difference on the row was a number to read twice.
          value: messages ? (
            <span className="bt-messages" data-testid="rec-fallbacks-words">{messages.line}</span>
          ) : null,
          empty: "Not set",
          name: "Change the messages sent when it can't answer",
        }}
        body={(f) => <BtaFallbacks {...f} brain={on} />}
      />
    </section>
  );
};

// The two lists were also published for the old form to read as it loaded (BT_OFFERED_LANGUAGES, BT_FALLBACK_ROWS).
// Task 3.7 deleted that form, and nothing else ever read them, so they are the card's own again.
Object.assign(window, { BtAnswersCard });
