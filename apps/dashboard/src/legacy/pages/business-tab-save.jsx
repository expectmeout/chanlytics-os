/* global React */
// Chanlytics — Settings › Business: what a save writes, and the one saver every save goes through.
//
// The page (pages/business-tab.jsx) draws; this file decides what its saves write. Here: each row's check (the
// sentence that stops a save before any round trip, or null), what a row's draft stores, and its patch (the one-key
// change a save makes: a pure function of the stored brain and profile that returns the brain); each fold's helpers
// (what it opens with, what stops its save, and the config its save writes, its own paths and nothing else); the tab's
// one saver, which every row and fold saves through; how a number is written for people (phoneShown); and the old
// card's one-key save (useFieldSave), until Task 3.7 retires that card.
//
// Everything is published on window and read there as each consumer draws: in the app every legacy file is its own
// module, where a top-level const of one is nothing to another. This file loads before business-tab.jsx, which loads
// before settings.jsx (both load lists). Its top-level names are bt-prefixed, and no pattern in it holds an object rest:
// the standalone mockup compiles every file into one global scope, where a name declared twice throws and Babel's
// `_excluded` for a rest is shared (record-field.jsx says how that bit).

const { useState: useBtSaveState } = React;

/**
 * A number as people write it, "+1 (305) 555-0100", the way Setup and Connections show one (contracts
 * formatPhoneDisplay, published by the bridge). Business showed the line it answers and the transfer number in the
 * E.164 they are stored as (the wiring audit's L7). Only E.164 is rewritten: anything else is shown as it was written,
 * which for the number it gives out is what the receptionist says.
 *
 * On window as `phoneShown`, since the Business tab and the old card in settings.jsx both show numbers: one rule for
 * writing them.
 */
const btPhoneShown = (v) => (v && window.__phoneDisplay && /^\+[1-9][0-9]{6,14}$/.test(v) ? window.__phoneDisplay(v) : v);

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
 * Moved from settings.jsx when the Business tab became a record (Task 3.2). On window as `useFieldSave`: the old
 * card's two number rows take it from there until Task 3.7 retires them. The Business tab's rows save through the
 * tab's one saver (btSaver) instead. Since the move it also lets go when the save fails before the server has taken
 * it (the promise rejects, or the call throws), as btSaver does: it said nothing then, and stayed busy for good, its
 * row's Save and Cancel pressing nothing.
 */
function useBtFieldSave(flash) {
  const [busy, setBusy] = useBtSaveState(false);
  const settings = window.__SETTINGS || null;
  const save = (change, said, done) => {
    if (busy || !window.__saveSettings || !settings || !settings.config) return;
    const cfg = settings.config;
    const brain = cfg.brain || {};
    setBusy(true);
    const next = { ...cfg, brain: change({ ...brain }, { ...(brain.profile || {}) }) };
    // Once the server has taken the save, nothing after it (the re-read that follows) is said as a refusal.
    let accepted = false;
    const refused = (words) => {
      setBusy(false);
      if (!accepted) flash({ tone: "danger", msg: <>{words || "That didn't go through."}</> });
    };
    let sent;
    try {
      sent = window.__saveSettings(next, settings.version, () => {
        accepted = true;
        setBusy(false);
        done();
        flash({ msg: said });
      });
    } catch (e) {
      sent = Promise.reject(e);
    }
    Promise.resolve(sent).then((r) => {
      if (r && r.ok) return;
      refused(r && r.message);
    }, (e) => refused(e && e.message));
  };
  return [busy, save];
}

// Two drafts are the same when saving either would write the same thing.
const btSame = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const btTrimmed = (d) => String(d == null ? "" : d).trim();

/**
 * A job's patch, applied to a config: the config it would send, with the config it was applied to left exactly as it
 * was. The one place a patch is run, by the saver as it sends and by a row working out what it will say, so the two
 * never apply one patch two ways.
 *
 * A job carries its patch one of two ways. A row's is `change`, its one-key change: a function of the brain and its
 * profile that returns the brain. A fold's is `patch`, a function of the whole config that returns the next one, since
 * a fold may write beside the brain (the calendar, the photos switch); saveFold builds it (below).
 *
 * On a copy all the way down (structuredClone). A patch was handed shallow copies, so one that changed a nested object
 * in place (p.booking_rules.lead_hours = 5) changed the config it was about to be compared with as well: the saver
 * found nothing to send, the row closed as if saved, and the settings read showed a value no server held.
 */
const btPatched = (config, job) => {
  const copy = structuredClone(config);
  if (typeof job.patch === "function") return job.patch(copy);
  const brain = copy.brain || {};
  return { ...copy, brain: job.change(brain, { ...(brain.profile || {}) }) };
};

/**
 * One saver for the browser tab, so saves made close together go one at a time, and each builds on the one before.
 *
 * PUT /settings is a versioned compare-and-swap of the whole config (useFieldSave says why), and the settings re-read
 * that brings the new version lands about half a second after the server accepts. Each row saving on its own sent the
 * config and version as the page last drew them, so "Use Google's" on the address and then on the name sent version 7
 * twice, and the server refused the second as a colleague's save that never happened. So every row asks this saver:
 * a patch waits while another is out, and goes on the config the server answered the last one with (the bridge hands
 * it to onAccepted), or on the settings read when that is newer. A patch is a pure function of what is stored, so it
 * applies to whatever is current when it goes, and one that would change nothing is not sent. The next waits while one
 * is out: plViewSaver's shape (clients-a.jsx).
 *
 * One for the tab rather than one for each page drawn (btTabSaver, below, is the one): the page goes when the Settings
 * rail shows another tab, and a page drawn on coming back held a new saver on the settings read it was drawn with. Back
 * before the re-read landed, its next save went out on the version the server had moved past, and was refused as a
 * colleague's; and a save still waiting its turn was one the new page's row could not see. A page subscribes as it
 * mounts, and is drawn again whenever a save moves (queued, sent, taken, refused).
 *
 * A job is { row, change or patch, said, done, flash } (btPatched says which patch is which): `row` is the row's or the
 * fold's id, `said` is the toast once the server takes it, `done` runs then too (the row closes), and a refusal, or a
 * promise that fails before the server took it, is said in the danger tone. `reset()` is for tests: it forgets the
 * queue, the save out and the last answer, as a new browser tab would start.
 */
const btSaver = () => {
  let last = null;
  let out = null;
  const queue = [];
  const subs = new Set();
  // Each page listening hears every move, whatever another does: one that throws is reported and the rest still hear.
  const onChange = () => {
    for (const fn of [...subs]) {
      try { fn(); } catch (err) { if (window.console) window.console.error(err); }
    }
  };
  // What the server holds, as far as this tab knows: its answer to the last save it took, or the settings read when
  // that is newer.
  const held = () => {
    const read = window.__SETTINGS || null;
    const r = read && read.config ? { config: read.config, version: read.version } : null;
    return last && (!r || last.version > r.version) ? last : r;
  };
  // What base() last worked out, and from what: kept while nothing it was worked out from moves.
  let memo = null;
  /**
   * The config the next save goes on: what the server holds, with the save out and each one waiting its turn applied
   * to it in order, as if taken. A refused one drops out of it as it is refused, and a save the server has taken is in
   * what it holds (its answer) before the settings read brings it back.
   *
   * What a row or a fold will say, and whether its save crosses the resolver's line, are worked out on this, since it
   * is what their save will be applied to. Worked out on the settings read, as they first were, they described a brain
   * that was not the one saved whenever another save was out or taken and not yet read back: with the website's save
   * out, emptying the address said nothing, and its save, landing on a record with no website, stopped the prompt
   * composing. The same object comes back while nothing moves, so what a row will say is worked out once for it
   * rather than on every keystroke. Null with nothing read to save onto. Never change what it returns: apply a patch
   * with patched(), which works on a copy.
   */
  const base = () => {
    const from = held();
    if (!from) return null;
    const ahead = out ? [out].concat(queue) : queue.slice();
    const key = [from.config].concat(ahead);
    if (memo && memo.key.length === key.length && memo.key.every((k, i) => k === key[i])) return memo.config;
    const config = ahead.reduce((cfg, job) => btPatched(cfg, job), from.config);
    memo = { key, config };
    return config;
  };
  const next = () => {
    if (out || !queue.length) return;
    const job = queue.shift();
    const from = held();
    // No door to save through, or nothing read to save onto: nothing goes, and nothing waits on a save that never lands.
    if (!from || typeof window.__saveSettings !== "function") { onChange(); next(); return; }
    const cfg = from.config;
    // Compared with the config as it was: the patch ran on a copy (btPatched).
    const patched = btPatched(cfg, job);
    if (btSame(patched, cfg)) { if (job.done) job.done(); onChange(); next(); return; }
    out = job;
    onChange();
    let accepted = false;
    const free = () => { if (out !== job) return; out = null; onChange(); next(); };
    const refused = (words) => { if (!accepted) job.flash({ tone: "danger", msg: <>{words || "That didn't go through."}</> }); };
    let sent;
    try {
      sent = window.__saveSettings(patched, from.version, (saved) => {
        accepted = true;
        // Only while this save is the one out: after a reset, an answer from before it is no answer to anything now.
        if (out === job && saved && saved.config && typeof saved.version === "number") last = { config: saved.config, version: saved.version };
        if (job.done) job.done();
        job.flash({ msg: job.said });
        // With the server's answer in hand the next patch goes on it now; without one, it waits for the re-read,
        // which is when the promise settles.
        if (saved && saved.config) free();
      });
    } catch (e) {
      sent = Promise.reject(e);
    }
    Promise.resolve(sent).then((r) => {
      if (!(r && r.ok)) refused(r && r.message);
      free();
    }, (e) => {
      refused(e && e.message);
      free();
    });
  };
  return {
    save(job) { queue.push(job); onChange(); next(); },
    // A row's save is in hand while it waits its turn or is out: its Save says so, and takes no second press.
    pending(row) { return !!((out && out.row === row) || queue.some((j) => j.row === row)); },
    base,
    // A page hears every move while it is on screen; call what this returns as it goes.
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    reset() { last = null; out = null; queue.length = 0; memo = null; onChange(); },
  };
};

// The tab's one saver: made once, as this file loads, and kept on window (window.__businessTabSave.saver) for as long
// as the tab is open, so every page drawn in it finds the queue and the last answer.
const btTabSaver = btSaver();

/* ------------------------------------ what each row stores ------------------------------------ */

// The pattern every web address on this tab is checked by: the old form's, which the save's own URL rule backs up.
const BT_WEB = /^https?:\/\/.+\..+/;

// The number it gives out, as PublishedNumberRow held it: absent is "the line it answers", so choosing the line stores
// nothing. `own` means the line only where there is one to follow.
const btPublishedOf = (d, line) => (d.own && line ? "" : btTrimmed(d.typed));

// The transfer number is stored as E.164, or not at all (contracts handoffE164).
const btTransferOf = (d) => (window.__handoffE164 ? window.__handoffE164(d) : (btTrimmed(d) || null));

/**
 * What a row's draft stores: the value its patch writes, and what "holds changes" is judged by. Each takes the draft
 * and the line the workspace answers on ("" when there is none); a row of words stores its draft trimmed.
 */
const BT_STORED_AS = {
  name: btTrimmed,
  address: btTrimmed,
  website: btTrimmed,
  booking_link: btTrimmed,
  phone_display: btPublishedOf,
  handoff_number: btTransferOf,
};

/* What stops each row's save before any round trip: its sentence, said under the box, or null. Each takes the draft and
   the line the workspace answers on ("" when there is none). The address takes anything, empty included. */

// The API refuses an empty name too, but names no field: checked here, the owner is told where.
const btCheckName = (d) => (btTrimmed(d) ? null : "The receptionist needs a business name before it can answer anyone.");
const btCheckWebsite = (d) => {
  const v = btTrimmed(d);
  return v && !BT_WEB.test(v) ? "The website needs to be a full web address, starting with https://" : null;
};
const btCheckBookingLink = (d) => {
  const v = btTrimmed(d);
  if (!v) return "The receptionist needs a booking link before it can answer anyone.";
  return BT_WEB.test(v) ? null : "That booking link needs to be a full web address, starting with https://";
};
const btCheckPublished = (d, line) => {
  const v = btPublishedOf(d, line);
  const bad = v && window.__whyNotAPhone ? window.__whyNotAPhone(v) : null;
  if (bad) return bad;
  return !v && !line ? "There is no line yet, so the receptionist needs a number to give out." : null;
};
const btCheckTransfer = (d, line) => (window.__whyNotAHandoff ? window.__whyNotAHandoff(d, line) : null);
const BT_CHECK_OF = {
  name: btCheckName,
  website: btCheckWebsite,
  booking_link: btCheckBookingLink,
  phone_display: btCheckPublished,
  handoff_number: btCheckTransfer,
};

/* ------------------------------------ what each row's save writes ------------------------------------ */

/**
 * Whether a brain's stored prompt is exactly the product's opening lines under the business's stored name: what the
 * product writes for it (contracts newReceptionistDefaults, which the bridge publishes), and nothing else.
 *
 * Not isBaselinePrompt, which reads only the opening and the closing and takes anything between them as a name. That
 * is right for saying whose words a prompt is, but a rename overwrites what this matches, and words an owner put
 * between the two would go with it (config.ts, isBaselineInOwnersField, says where the loose test is unsafe). Missed,
 * a rename leaves the prompt as it is, which loses nothing. Space around the prompt is not a word of it.
 */
const btIsBaseline = (brain) => {
  const text = brain && typeof brain.system_prompt === "string" ? brain.system_prompt.trim() : "";
  if (!text || !window.__receptionistDefaults) return false;
  return text === window.__receptionistDefaults(brain.business_name || "").system_prompt;
};

/**
 * A new name for the business, as one patch: `business_name`, and the product's opening lines written again under the
 * new name where the stored prompt is them. Every workspace the product sets up stores them as its prompt, and the
 * resolver carries that prompt in the owner's place until they write their own (config.ts ownWordsOf), so a rename
 * that left it behind had the receptionist told it was the assistant for both businesses, one line after the other.
 * The old form wrote them on every save; a rename here writes them when it renames. A stored prompt that is not them,
 * word for word under the name stored beside it, is the owner's own words, carried, and a rename leaves it as they
 * wrote it.
 */
const btPatchName = (name) => (b) => {
  if (name !== b.business_name && btIsBaseline(b)) b.system_prompt = window.__receptionistDefaults(name).system_prompt;
  b.business_name = name;
  return b;
};

// A key of the profile, written from what the draft stores: an emptied box deletes its key rather than storing "", or
// the composed prompt would state an address of nothing (the rule the old form's `put` held).
const btPatchProfile = (key) => (value) => (b, p) => {
  if (value) p[key] = value; else delete p[key];
  b.profile = p;
  return b;
};

const btPatchBookingLink = (link) => (b) => { b.booking_link = link; return b; };

// Absent is the schema's "the line it answers", so publishing the line removes the key rather than storing "".
const btPatchPublished = (value) => (b) => {
  if (value) b.phone_display = value; else delete b.phone_display;
  return b;
};

/** Each row's patch, from the value its draft stores (BT_STORED_AS): a function of (brain, profile) that returns the brain. */
const BT_PATCH_OF = {
  name: btPatchName,
  address: btPatchProfile("address"),
  website: btPatchProfile("website"),
  booking_link: btPatchBookingLink,
  phone_display: btPatchPublished,
  // Emptied, the phone receptionist takes a message instead of transferring.
  handoff_number: btPatchProfile("handoff_number"),
};

/* ------------------------------------ what each fold opens with, refuses and writes ------------------------------------ */

/*
 * A fold's three helpers, pure: they read nothing but what they are handed and the bridge's published functions
 * (__instructionsDraft, __fallbackDefaults, __receptionistDefaults, __instructionsMax, __unknownDetails), and change
 * nothing they are handed. Ported from the form they replace, BusinessEditor in settings.jsx, section by section: how it
 * opened each part of its state, what its `save` checked, and how it wrote each part back. A fold is named by its id,
 * the same name consequenceOf knows it by (the bridge's FOLD_BLOCK); any other name is a TypeError naming it.
 *
 * How a fold of Tasks 3.3 to 3.5 uses them. `base` is the tab's saver's base(), the config the fold's save will go on:
 *
 *   draftOf(fold, base)          as it opens: the draft its fields edit, from what is stored, in the shape the old form
 *                                held it (lines of a box joined by "\n", a number as its box holds it). The fold's own
 *                                copy, to change as it likes: nothing it does to it reaches the settings read.
 *   problemsOf(fold, draft)      on Save: { fieldKey: sentence }, every problem at once, each said under its field (S22).
 *                                Nothing is sent while there is any. saveFold is only for a draft with none: it writes a
 *                                booking rule outside its range as no rule at all, which is why that is refused first.
 *   saveFold(fold, base, draft)  the next config: `base` with the fold's own paths (PATHS_OF) written from the draft, and
 *                                everything else exactly as it was, down to the order of its keys. `base` is not changed.
 *
 * Its save goes through the tab's one saver as a patch of the whole config, run on whatever config is current when it
 * goes, and what it will say is worked out on the saver's base with the same helper, so it describes that save:
 *
 *   saver.save({ row: fold, patch: (config) => saveFold(fold, config, draft), said, done, flash })
 *   consequenceOf(fold, saveFold(fold, saver.base(), draft).brain, channel)
 *
 * It holds changes when what it would write is not what the draft it opened with would write, the rows' rule
 * (storedAs): same(saveFold(fold, base, draft), saveFold(fold, base, draftOf(fold, base))). Three folds do not write
 * back exactly what they opened on every record, and say the same thing when they do not: the hours write a day the
 * record left out as {}, the rules write all four switches out, and the instructions keep a carried prompt as the
 * owner's words (S4). Judged the rows' way, opening one of them and pressing Save with nothing changed sends nothing.
 *
 * The field keys problemsOf names, for each fold to say a problem under its own field:
 *   booking_rules       lead_hours, slot_min, buffer_min, max_days_ahead, party_max: the draft's own keys
 *   notes               note-<i>, where i is the note's place in the draft
 *   extra_instructions  extra_instructions
 *   fallbacks           greeting, error, non_text: the draft's own keys
 *   calendar            ical_url
 * The other folds refuse nothing, as the old form's sections did not. Its sentences are word for word, which the
 * settings tests pin; where a sentence was JSX only for its fragment or its braces, it is a plain string here.
 */

// The days of the week in the schema's order (contracts DAYS): the hours fold writes every one of them.
const BT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// The lines of a box, one rule or reason each: those with something on them, trimmed.
const btLines = (text) => String(text == null ? "" : text).split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * The booking rules the booking_rules fold edits, each with the range the schema allows (contracts
 * BookingRulesSchema) and the old form's sentence for a number outside it. One table, so the range a save writes and
 * the range a check refuses are never two. Its notes are the fold's too; consult_first is a fold of its own.
 */
const BT_RULES = [
  ["lead_hours", 0, 168, "Least notice is 0 to 168 hours; leave it empty for no rule."],
  // The slot length has a field of its own now (S2): 15 to 240 minutes, as the schema allows; blank is the calendar's
  // default.
  ["slot_min", 15, 240, "A slot is 15 to 240 minutes; leave it empty for the calendar’s 30."],
  ["buffer_min", 0, 120, "The gap is 0 to 120 minutes; leave it empty for none."],
  ["max_days_ahead", 1, 90, "Times are offered 1 to 90 days ahead; leave it empty for no rule."],
  ["party_max", 1, 20, "A booking is for 1 to 20 people; leave it empty for no rule."],
];
// A blank box is "no rule", never zero; so is a number outside the rule's range, which problemsOf refuses first.
const btRuleNumber = (v, lo, hi) => {
  const n = parseInt(btTrimmed(v), 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

// The four rules it always keeps (contracts GUARDRAIL_KEYS), and the three messages sent in the business's name (S5).
const BT_GUARDRAILS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"];
const BT_FALLBACKS = ["greeting", "error", "non_text"];

/**
 * Exactly what each fold writes, as dotted paths into the whole config: nothing outside them is the fold's to change.
 * Two folds share booking_rules, each with only its own of its keys, and three write beside the profile: the rules
 * write the photos switch (features.vision), the instructions write the stored prompt, and the fallbacks and the
 * calendar write nothing in the profile at all.
 */
const BT_PATHS_OF = {
  tone: ["brain.profile.tone"],
  hours: ["brain.profile.hours"],
  closures: ["brain.profile.closures"],
  services: ["brain.profile.services"],
  languages: ["brain.profile.languages"],
  notes: ["brain.profile.notes"],
  escalate_when: ["brain.profile.escalate_when"],
  booking_rules: BT_RULES.map(([key]) => `brain.profile.booking_rules.${key}`).concat(["brain.profile.booking_rules.notes"]),
  consult_first: ["brain.profile.booking_rules.consult_first"],
  guardrails: BT_GUARDRAILS.map((key) => `brain.profile.guardrails.${key}`).concat(["features.vision"]),
  extra_instructions: ["brain.profile.extra_instructions", "brain.system_prompt"],
  fallbacks: BT_FALLBACKS.map((key) => `brain.fallbacks.${key}`),
  calendar: ["calendar"],
};

// The keys of the profile each fold writes into, read off its paths so the two maps never disagree.
const BT_KEYS_OF = Object.fromEntries(Object.entries(BT_PATHS_OF).map(([fold, paths]) => [
  fold,
  paths.filter((p) => p.startsWith("brain.profile.")).map((p) => p.split(".")[2]).filter((k, i, all) => all.indexOf(k) === i),
]));

// The page is untyped, so a name no fold has is said, rather than found on Object.prototype ("toString") or ignored.
const btFoldNamed = (fold) => {
  if (!Object.prototype.hasOwnProperty.call(BT_PATHS_OF, fold)) {
    throw new TypeError(`The Business tab has no fold named ${JSON.stringify(fold)}. It has ${Object.keys(BT_PATHS_OF).join(", ")}.`);
  }
};

/** What each fold opens with, from the stored profile, brain and config: as BusinessEditor set up its state. */
const BT_DRAFT_OF = {
  tone: (p) => p.tone || "",
  // One editable list per day, however the day happens to be stored: a plain open/close pair reads as a single shift,
  // so the two shapes are one thing to edit and only differ again on save. `isOpen` means the business is open, not
  // the opening time: a day is closed only when it has no times, which is what the schema stores.
  hours: (p) => {
    const week = {};
    BT_DAYS.forEach((d) => {
      const x = (p.hours || {})[d] || {};
      const shifts = (x.intervals || []).filter((s) => s && s.open && s.close).map((s) => ({ open: s.open, close: s.close }));
      if (!shifts.length && x.open && x.close) shifts.push({ open: x.open, close: x.close });
      week[d] = { isOpen: shifts.length > 0, shifts };
    });
    return week;
  },
  closures: (p) => (p.closures || []).map((x) => ({ ...x })),
  services: (p) => (p.services || []).map((x) => ({ ...x })),
  languages: (p) => (p.languages || []).slice(),
  notes: (p) => (p.notes || []).map((x) => ({ ...x })),
  escalate_when: (p) => (p.escalate_when || []).join("\n"),
  // Each number as its box holds it, "" where there is no rule; the notes one to a line.
  booking_rules: (p) => {
    const rules = p.booking_rules || {};
    const draft = {};
    BT_RULES.forEach(([key]) => { draft[key] = rules[key] !== undefined ? String(rules[key]) : ""; });
    draft.notes = (rules.notes || []).join("\n");
    return draft;
  },
  consult_first: (p) => ((p.booking_rules || {}).consult_first || []).join("\n"),
  guardrails: (p, brain, config) => {
    const g = p.guardrails || {};
    return {
      // Absent means ON. Only an explicit false turns one off, so an unset config must not render as three unticked
      // boxes.
      never_quote_prices: g.never_quote_prices !== false,
      never_confirm_booking: g.never_confirm_booking !== false,
      disclose_ai: g.disclose_ai !== false,
      // Opt-in, unlike the three above: a rule that defaulted on would have changed every composed prompt already live
      // the moment it shipped.
      no_health_advice: g.no_health_advice === true,
      // Opt-in abilities: off unless the owner turned one on.
      vision: (config.features || {}).vision === true,
    };
  },
  // Pre-filled with the workspace's existing instructions, so nothing a business already told its receptionist quietly
  // disappears the moment it fills in a form. Chosen in contracts (S4): the owner's own words, or the prompt from
  // before the form, carried and marked `carried` so the fold can say so -- never the product's opening lines, which
  // no owner wrote.
  extra_instructions: (p, brain) => window.__instructionsDraft(brain),
  // The three messages sent in the business's name when the receptionist cannot answer (S5): the workspace's own, or,
  // for one set up before them, the product's wording, which names the details rather than copying them in.
  fallbacks: (p, brain) => ({ ...(brain.fallbacks || window.__fallbackDefaults) }),
  calendar: (p, brain, config) => (config.calendar && config.calendar.ical_url) || "",
};

/** The draft `fold` opens with over the stored config `stored` (the saver's base). */
const btDraftOf = (fold, stored) => {
  btFoldNamed(fold);
  const config = stored || {};
  const brain = config.brain || {};
  return BT_DRAFT_OF[fold](brain.profile || {}, brain, config);
};

// A key, written from a draft: only what was filled in. An empty string is not a fact, and storing it would have the
// composed prompt state an address of nothing, so an emptied field DELETES its key rather than storing "" (the old
// form's `put`).
const btPut = (o, key, value) => { if (value === undefined) delete o[key]; else o[key] = value; };
// The same, for a key of the profile. A profile is made only to hold a value, so a fold that empties a field of a
// brain with no profile writes nothing at all.
const btPutProfile = (next, key, value) => {
  if (!next.brain) next.brain = {};
  if (value === undefined) { if (next.brain.profile) delete next.brain.profile[key]; return; }
  if (!next.brain.profile) next.brain.profile = {};
  next.brain.profile[key] = value;
};
const btProfileOf = (next) => (next.brain && next.brain.profile) || {};

/** How each fold writes its draft into `next`, a copy of the stored config: its own paths, and nothing else. */
const BT_WRITE = {
  tone: (next, draft) => btPutProfile(next, "tone", btTrimmed(draft) || undefined),
  hours: (next, draft) => {
    const week = draft || {};
    const hours = {};
    BT_DAYS.forEach((d) => {
      const x = week[d] || { isOpen: false, shifts: [] };
      const shifts = x.isOpen ? (x.shifts || []).filter((s) => s.open && s.close) : [];
      // ONE shift is still written as open/close, not as a one-element intervals array. Writing it the new way would
      // rewrite every existing config into a new shape the first time anybody pressed Save -- a migration nobody asked
      // for, on rows that already said this correctly.
      //
      // A day that is closed is stored as `{}` -- a real answer. Omitting it would read as "we did not say".
      hours[d] = shifts.length === 0 ? {}
        : shifts.length === 1 ? { open: shifts[0].open, close: shifts[0].close }
        : { intervals: shifts.map((s) => ({ open: s.open, close: s.close })) };
    });
    // Only once at least one day has real times, or an untouched week would save seven closed days and read as a
    // business never open; and through put, so turning every day off CLEARS the stored week instead of leaving
    // yesterday's behind.
    const stated = BT_DAYS.some((d) => week[d] && week[d].isOpen && (week[d].shifts || []).some((s) => s.open && s.close));
    btPutProfile(next, "hours", stated ? hours : undefined);
  },
  // A row with no date is a row somebody started and did not finish. Sending it would fail validation and name a field
  // they cannot see; dropping it is what they meant.
  closures: (next, draft) => {
    const closed = (draft || []).filter((c) => btTrimmed(c.date)).map((c) => {
      const o = { date: btTrimmed(c.date) };
      // `until` equal to `date` is a one-day closure said twice.
      if (btTrimmed(c.until) && btTrimmed(c.until) !== o.date) o.until = btTrimmed(c.until);
      if (btTrimmed(c.note)) o.note = btTrimmed(c.note);
      return o;
    });
    btPutProfile(next, "closures", closed.length ? closed : undefined);
  },
  services: (next, draft) => {
    const services = (draft || []).filter((x) => btTrimmed(x.name)).map((x) => {
      const o = { name: btTrimmed(x.name) };
      const d = parseInt(x.duration_min, 10);
      if (Number.isFinite(d) && d > 0) o.duration_min = d;
      if (btTrimmed(x.price_note)) o.price_note = btTrimmed(x.price_note);
      return o;
    });
    btPutProfile(next, "services", services.length ? services : undefined);
  },
  languages: (next, draft) => btPutProfile(next, "languages", draft && draft.length ? draft.slice() : undefined),
  notes: (next, draft) => {
    const notes = (draft || []).map((n) => ({ title: btTrimmed(n.title), text: btTrimmed(n.text) })).filter((n) => n.title || n.text);
    btPutProfile(next, "notes", notes.length ? notes : undefined);
  },
  escalate_when: (next, draft) => {
    const reasons = btLines(draft);
    btPutProfile(next, "escalate_when", reasons.length ? reasons : undefined);
  },
  // From the stored rules, each of the fold's keys written or deleted where it stands. Everything else stored under
  // booking_rules -- consult_first, which is a fold of its own, and a rule added later -- is kept as it was: the form
  // this replaces started the rules from {} and deleted the slot length on every save (settingsRulesKept).
  booking_rules: (next, draft) => {
    const d = draft || {};
    const rules = { ...(btProfileOf(next).booking_rules || {}) };
    BT_RULES.forEach(([key, lo, hi]) => btPut(rules, key, btRuleNumber(d[key], lo, hi)));
    const notes = btLines(d.notes);
    btPut(rules, "notes", notes.length ? notes : undefined);
    btPutProfile(next, "booking_rules", Object.keys(rules).length ? rules : undefined);
  },
  // The one key of booking_rules that is its own fold (it had no label in the form this replaces), and every other rule
  // as it was stored.
  consult_first: (next, draft) => {
    const rules = { ...(btProfileOf(next).booking_rules || {}) };
    const list = btLines(draft);
    btPut(rules, "consult_first", list.length ? list : undefined);
    btPutProfile(next, "booking_rules", Object.keys(rules).length ? rules : undefined);
  },
  // The four switches written onto what is stored beside them, where the old form wrote the four alone: a switch a
  // newer form adds is kept by an older tab's save, as a rule added later is kept under booking_rules.
  guardrails: (next, draft) => {
    const d = draft || {};
    const guardrails = { ...(btProfileOf(next).guardrails || {}) };
    BT_GUARDRAILS.forEach((key) => { guardrails[key] = d[key] === true; });
    btPutProfile(next, "guardrails", guardrails);
    // Opt-in abilities, written once the owner has touched them: an untouched workspace keeps no features at all.
    const features = next.features || {};
    const vision = d.vision === true;
    if (vision || features.vision !== undefined) next.features = { ...features, vision };
  },
  extra_instructions: (next, draft) => {
    btPutProfile(next, "extra_instructions", btTrimmed(draft && draft.text) || undefined);
    // The product's own opening lines, on every save (S4). The box showed the prompt written before the form, and
    // what the owner kept of it is now their instructions; left in the prompt as well it was stored twice, and an
    // emptied box carried it straight back. Built in contracts, under the name the brain holds when the save goes.
    next.brain.system_prompt = window.__receptionistDefaults(next.brain.business_name || "").system_prompt;
  },
  // The three messages as the fold holds them (S5), trimmed, onto what is stored beside them. An existing workspace's
  // open with its own words, never replaced because somebody opened a fold.
  fallbacks: (next, draft) => {
    const d = draft || {};
    if (!next.brain) next.brain = {};
    const messages = { ...(next.brain.fallbacks || {}) };
    BT_FALLBACKS.forEach((key) => { messages[key] = btTrimmed(d[key]); });
    next.brain.fallbacks = messages;
  },
  // A top-level section, read by the edge; an emptied field removes it.
  calendar: (next, draft) => {
    const feed = btTrimmed(draft);
    if (feed) next.calendar = { ical_url: feed }; else delete next.calendar;
  },
};

/**
 * The config a fold's save sends: the stored config `stored` (the saver's base, or whatever is current when the save
 * goes), with the fold's own paths written from its draft.
 *
 * Start from what is STORED, not from nothing. The form this replaces once started its profile from {} and added the
 * known keys back, and that is not a save -- it is a rebuild, and a rebuild silently deletes every key the form does
 * not happen to render. It is the exact mechanism that lost a live workspace its 5,000-character prompt: nobody deleted
 * anything, a rebuild simply dropped what it did not know about. So any key added later -- by a newer form, a script,
 * the API -- survives an owner opening a fold and pressing Save (business-tab-folds.test.mjs holds every fold to it).
 * On a copy all the way down, so the config handed in stays exactly as it was.
 */
const btSaveFold = (fold, stored, draft) => {
  btFoldNamed(fold);
  const next = structuredClone(stored || {});
  BT_WRITE[fold](next, draft);
  return next;
};

/** What stops each fold's save, by the field it is under: BusinessEditor's `save` checks, word for word. */
const BT_PROBLEMS_OF = {
  // A number outside what a rule allows is said under its box; it used to be dropped without a word (S22).
  booking_rules: (draft) => {
    const d = draft || {};
    const found = {};
    BT_RULES.forEach(([key, lo, hi, words]) => {
      if (btTrimmed(d[key]) !== "" && btRuleNumber(d[key], lo, hi) === undefined) found[key] = words;
    });
    return found;
  },
  // Half a note is refused; a note with neither half is dropped on save, as a row somebody started and left.
  notes: (draft) => {
    const found = {};
    (draft || []).forEach((n, i) => {
      const title = btTrimmed(n.title);
      const text = btTrimmed(n.text);
      if ((title || text) && (!title || !text)) found[`note-${i}`] = "Each note needs both a title and the text to say.";
    });
    return found;
  },
  // As much as the receptionist takes, said under the box before a round trip (S4): the server's refusal named no field.
  extra_instructions: (draft) => {
    const n = btTrimmed(draft && draft.text).length;
    const max = window.__instructionsMax;
    return n > max ? { extra_instructions: `At most ${max.toLocaleString("en-US")} characters — this is ${n.toLocaleString("en-US")}.` } : {};
  },
  // Each message says under itself what stops it (S5): nothing to send, more than a message holds, or a name that
  // nothing fills in and a customer would read as written.
  fallbacks: (draft) => {
    const d = draft || {};
    const found = {};
    BT_FALLBACKS.forEach((key) => {
      const t = btTrimmed(d[key]);
      const unknown = window.__unknownDetails(t);
      if (!t) found[key] = "Write this message, or use the default wording.";
      else if (t.length > 2000) found[key] = `At most 2,000 characters — this is ${t.length.toLocaleString("en-US")}.`;
      else if (unknown.length) found[key] = `Only {business}, {booking link} and {phone} are filled in — ${unknown[0]} would be sent as written.`;
    });
    return found;
  },
  calendar: (draft) => {
    const feed = btTrimmed(draft);
    return feed && !/^(https?|webcal):\/\/\S+$/i.test(feed)
      ? { ical_url: "The calendar feed needs to be a full address, starting with https:// or webcal://" }
      : {};
  },
};

/** Every problem with a fold's draft at once, by the field it is under: {} when it may be saved. */
const btProblemsOf = (fold, draft) => {
  btFoldNamed(fold);
  return Object.prototype.hasOwnProperty.call(BT_PROBLEMS_OF, fold) ? BT_PROBLEMS_OF[fold](draft) : {};
};

// window.__businessTabSave: the tab's one saver (`saver`: { save(job), pending(row), base(), subscribe(fn), reset() }),
// how a job's patch is applied (`patched`), the two helpers a row's draft is judged by (`same`, `trimmed`), whether a
// brain's prompt is the product's own lines under its stored name (`isBaseline`), each row's STORED_AS, CHECK_OF and
// PATCH_OF by its id, and each fold's paths and keys (PATHS_OF, KEYS_OF) and helpers (draftOf, problemsOf, saveFold).
Object.assign(window, {
  phoneShown: btPhoneShown,
  useFieldSave: useBtFieldSave,
  __businessTabSave: {
    saver: btTabSaver,
    patched: btPatched,
    same: btSame,
    trimmed: btTrimmed,
    isBaseline: btIsBaseline,
    STORED_AS: BT_STORED_AS,
    CHECK_OF: BT_CHECK_OF,
    PATCH_OF: BT_PATCH_OF,
    PATHS_OF: BT_PATHS_OF,
    KEYS_OF: BT_KEYS_OF,
    draftOf: btDraftOf,
    problemsOf: btProblemsOf,
    saveFold: btSaveFold,
  },
});
