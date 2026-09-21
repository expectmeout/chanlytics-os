// Chanlytics — Settings › Business: what each fold opens with, refuses and writes.
//
// The folds' own helpers, split from business-tab-save.jsx (which keeps the tab's one saver and the rows' tables) when
// the two had grown to two jobs in one file. Pure, and no JSX: nothing here draws. It loads after business-tab-save.jsx
// and before business-tab.jsx (both load lists), and adds its names to the object that file published,
// window.__businessTabSave, read there as each consumer draws. Its top-level names are bt-prefixed and no pattern in it
// holds an object rest, for the reasons business-tab-save.jsx gives; the two helpers it takes from that file it takes
// through window, since in the app a top-level const of one file is nothing to another.

const btfTrimmed = (d) => window.__businessTabSave.trimmed(d);
const btfSame = (a, b) => window.__businessTabSave.same(a, b);
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
  const n = parseInt(btfTrimmed(v), 10);
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
  tone: (next, draft) => btPutProfile(next, "tone", btfTrimmed(draft) || undefined),
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
    const closed = (draft || []).filter((c) => btfTrimmed(c.date)).map((c) => {
      const o = { date: btfTrimmed(c.date) };
      // `until` equal to `date` is a one-day closure said twice.
      if (btfTrimmed(c.until) && btfTrimmed(c.until) !== o.date) o.until = btfTrimmed(c.until);
      if (btfTrimmed(c.note)) o.note = btfTrimmed(c.note);
      return o;
    });
    btPutProfile(next, "closures", closed.length ? closed : undefined);
  },
  services: (next, draft) => {
    const services = (draft || []).filter((x) => btfTrimmed(x.name)).map((x) => {
      const o = { name: btfTrimmed(x.name) };
      const d = parseInt(x.duration_min, 10);
      if (Number.isFinite(d) && d > 0) o.duration_min = d;
      if (btfTrimmed(x.price_note)) o.price_note = btfTrimmed(x.price_note);
      return o;
    });
    btPutProfile(next, "services", services.length ? services : undefined);
  },
  languages: (next, draft) => btPutProfile(next, "languages", draft && draft.length ? draft.slice() : undefined),
  notes: (next, draft) => {
    const notes = (draft || []).map((n) => ({ title: btfTrimmed(n.title), text: btfTrimmed(n.text) })).filter((n) => n.title || n.text);
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
    btPutProfile(next, "extra_instructions", btfTrimmed(draft && draft.text) || undefined);
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
    BT_FALLBACKS.forEach((key) => { messages[key] = btfTrimmed(d[key]); });
    next.brain.fallbacks = messages;
  },
  // A top-level section, read by the edge; an emptied field removes it.
  calendar: (next, draft) => {
    const feed = btfTrimmed(draft);
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
      if (btfTrimmed(d[key]) !== "" && btRuleNumber(d[key], lo, hi) === undefined) found[key] = words;
    });
    return found;
  },
  // Half a note is refused; a note with neither half is dropped on save, as a row somebody started and left.
  notes: (draft) => {
    const found = {};
    (draft || []).forEach((n, i) => {
      const title = btfTrimmed(n.title);
      const text = btfTrimmed(n.text);
      if ((title || text) && (!title || !text)) found[`note-${i}`] = "Each note needs both a title and the text to say.";
    });
    return found;
  },
  // As much as the receptionist takes, said under the box before a round trip (S4): the server's refusal named no field.
  extra_instructions: (draft) => {
    const n = btfTrimmed(draft && draft.text).length;
    const max = window.__instructionsMax;
    return n > max ? { extra_instructions: `At most ${max.toLocaleString("en-US")} characters — this is ${n.toLocaleString("en-US")}.` } : {};
  },
  // Each message says under itself what stops it (S5): nothing to send, more than a message holds, or a name that
  // nothing fills in and a customer would read as written.
  fallbacks: (draft) => {
    const d = draft || {};
    const found = {};
    BT_FALLBACKS.forEach((key) => {
      const t = btfTrimmed(d[key]);
      const unknown = window.__unknownDetails(t);
      if (!t) found[key] = "Write this message, or use the default wording.";
      else if (t.length > 2000) found[key] = `At most 2,000 characters — this is ${t.length.toLocaleString("en-US")}.`;
      else if (unknown.length) found[key] = `Only {business}, {booking link} and {phone} are filled in — ${unknown[0]} would be sent as written.`;
    });
    return found;
  },
  calendar: (draft) => {
    const feed = btfTrimmed(draft);
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

// Added to window.__businessTabSave, the object business-tab-save.jsx published: each fold's paths and keys (PATHS_OF,
// KEYS_OF) and its helpers (draftOf, problemsOf, saveFold).
if (!window.__businessTabSave) throw new Error("business-tab-folds.jsx loads after business-tab-save.jsx: window.__businessTabSave is not there.");
Object.assign(window.__businessTabSave, {
  PATHS_OF: BT_PATHS_OF,
  KEYS_OF: BT_KEYS_OF,
  draftOf: btDraftOf,
  problemsOf: btProblemsOf,
  saveFold: btSaveFold,
});
