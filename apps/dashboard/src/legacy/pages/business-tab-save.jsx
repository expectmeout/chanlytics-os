/* global React */
// Chanlytics — Settings › Business: what a save writes, and the one saver every save goes through.
//
// The page (pages/business-tab.jsx) draws; this file decides what its saves write. Here: each row's check (the
// sentence that stops a save before any round trip, or null), what a row's draft stores, and its patch (the one-key
// change a save makes: a pure function of the stored brain and profile that returns the brain); the page's one saver,
// which every row, and every fold after them, saves through; how a number is written for people (phoneShown); and the
// old card's one-key save (useFieldSave), until Task 3.7 retires that card. Task 3.6 adds the folds' own helpers here.
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
 * page's one saver (btSaver) instead. Since the move it also lets go when the save fails before the server has taken
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
 * One saver for the page, so saves made close together go one at a time, and each builds on the one before.
 *
 * PUT /settings is a versioned compare-and-swap of the whole config (useFieldSave says why), and the settings re-read
 * that brings the new version lands about half a second after the server accepts. Each row saving on its own sent the
 * config and version as the page last drew them, so "Use Google's" on the address and then on the name sent version 7
 * twice, and the server refused the second as a colleague's save that never happened. So every row asks this saver:
 * a patch waits while another is out, and goes on the config the server answered the last one with (the bridge hands
 * it to onAccepted), or on the settings read when that is newer. A patch is a pure function of (brain, profile), so it
 * applies to whatever is current when it goes, and one that would change nothing is not sent. One saver for the page's
 * life, the next waiting while one is out: plViewSaver's shape (clients-a.jsx).
 *
 * A job is { row, change, said, done, flash }: `said` is the toast once the server takes it, `done` runs then too (the
 * row closes), and a refusal, or a promise that fails before the server took it, is said in the danger tone.
 */
const btSaver = (onChange) => {
  let last = null;
  let out = null;
  const queue = [];
  const base = () => {
    const read = window.__SETTINGS || null;
    const held = read && read.config ? { config: read.config, version: read.version } : null;
    return last && (!held || last.version > held.version) ? last : held;
  };
  const next = () => {
    if (out || !queue.length) return;
    const job = queue.shift();
    const from = base();
    // No door to save through, or nothing read to save onto: nothing goes, and nothing waits on a save that never lands.
    if (!from || typeof window.__saveSettings !== "function") { onChange(); next(); return; }
    const cfg = from.config;
    const brain = cfg.brain || {};
    const patched = { ...cfg, brain: job.change({ ...brain }, { ...(brain.profile || {}) }) };
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
        if (saved && saved.config && typeof saved.version === "number") last = { config: saved.config, version: saved.version };
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
  };
};

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

// window.__businessTabSave: the page's one saver (`saver(onChange)`, which answers { save(job), pending(row) }), the
// two helpers a row's draft is judged by (`same`, `trimmed`), whether a brain's prompt is the product's own lines under
// its stored name (`isBaseline`), and each row's STORED_AS, CHECK_OF and PATCH_OF by its id. Task 3.6 adds the folds'.
Object.assign(window, {
  phoneShown: btPhoneShown,
  useFieldSave: useBtFieldSave,
  __businessTabSave: {
    saver: btSaver,
    same: btSame,
    trimmed: btTrimmed,
    isBaseline: btIsBaseline,
    STORED_AS: BT_STORED_AS,
    CHECK_OF: BT_CHECK_OF,
    PATCH_OF: BT_PATCH_OF,
  },
});
