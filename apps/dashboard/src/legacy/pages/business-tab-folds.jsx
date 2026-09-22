// Chanlytics — Settings › Business: what each fold opens with, refuses and writes, and what a save will say.
//
// The folds' own helpers, split from business-tab-save.jsx (which keeps the tab's one saver and the rows' tables) when
// the two had grown to two jobs in one file, and the one helper for what a row's or a fold's save will tell the
// receptionist (willSay, at the foot). Pure but for that helper's cache, and no JSX: nothing here draws. It loads after business-tab-save.jsx
// and before business-tab.jsx (both load lists), and adds its names to the object that file published,
// window.__businessTabSave, read there as each consumer draws. Its top-level names are bt-prefixed and no pattern in it
// holds an object rest, for the reasons business-tab-save.jsx gives; the two helpers it takes from that file it takes
// through window, since in the app a top-level const of one file is nothing to another.

const btfTrimmed = (d) => window.__businessTabSave.trimmed(d);
const btfSame = (a, b) => window.__businessTabSave.same(a, b);
/* ------------------------------------ what each fold opens with, refuses and writes ------------------------------------ */

/*
 * A fold's three helpers, pure: they read nothing but what they are handed and the bridge's published functions
 * (__instructionsDraft, __fallbackDefaults, __receptionistDefaults, __instructionsMax, __unknownDetails, and
 * __businessTab's guardrailsInForce), and change
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
 * Its save goes through the tab's one saver as ONE job, which foldJob builds, and what it will say is worked out on
 * the saver's base with the same helper, so it describes that save:
 *
 *   const opened = draftOf(fold, saver.base())                      kept from the moment the fold opened
 *   saver.save(foldJob(fold, draft, { opened, said, done, flash }))
 *   consequenceOf(fold, saveFold(fold, saver.base(), draft).brain, channel)
 *
 * foldJob's patch runs on whatever config is current when the save goes, never on the one the fold opened with: a
 * fold that closed over its own copy would put back everything a save ahead of it in the queue had just written. And
 * it refuses to go when draftOf(fold, thatConfig) is no longer `opened`: the fold's own part of the settings changed
 * after it opened (a colleague's save, read back into this tab), and sending the draft would put their change back
 * as it was without a word. The owner is told, nothing is sent, and the fold stays open with what was typed.
 *
 * holdsChanges(fold, base, draft): whether Save has anything to SEND. It is not the fold's unsaved-changes test: a
 * fold asks before it throws away anything typed, which is "the draft is not the one it opened with" (BtFold,
 * business-tab-gestures.jsx), since what a save drops (half a shift, a closed day with no date, a service with no name) is
 * still something a person typed. What it would write is not what the draft it would open with writes, the rows'
 * rule (storedAs). Some records are stored the way no fold writes them back -- a day the hours leave out (written as
 * {}), two of the four rules left to their defaults (all four written out), a prompt carried into the instructions
 * (kept as the owner's words, S4), a voice or a message stored with space around it, a closure whose `until` is its
 * `date` -- so "the config would change" is the wrong test, and was the saver's only one: opening the instructions of
 * a record that is only its hand-written prompt and pressing Save with nothing typed sent a save that doubled the
 * prompt. foldJob's patch hands the config back untouched when the draft holds no changes, and the saver sends nothing.
 *
 * The field keys problemsOf names, for each fold to say a problem under its own field (i is a row's place in the draft):
 *   tone                tone
 *   hours               hours-<day> (too many shifts, a shift typed half-way, or a day switched on with no times)
 *   closures            closure-<i>-note, closures (too many)
 *   services            service-<i>-name, service-<i>-duration_min, service-<i>-price_note, services (too many)
 *   languages           languages
 *   escalate_when       escalate_when
 *   booking_rules       lead_hours, slot_min, buffer_min, max_days_ahead, party_max, notes: the draft's own keys
 *   consult_first       consult_first
 *   notes               note-<i>, notes (too many)
 *   extra_instructions  extra_instructions
 *   fallbacks           greeting, error, non_text: the draft's own keys
 *   calendar            ical_url
 * The old form's sentences are word for word, which the settings tests pin; where one was JSX only for its fragment or
 * its braces, it is a plain string here. The rest are new: the save's schema (contracts BusinessProfileSchema) refuses
 * a length or a count the old form never checked, and the server's refusal named no field the owner could see, so each
 * is said here first, from the one table of limits (LIMITS). What only the schema can judge -- overlapping shifts, a
 * date that is not on the calendar, an address the receptionist may not read -- stays the schema's to say, and
 * schemaProblems(fold, base, draft) puts its sentence under the same field keys, plus closure-<i>-date and
 * closure-<i>-until, and `elsewhere` for a refusal in a part of the settings that is not this fold's to fix. A fold's
 * Save asks saveProblems(fold, base, draft), which is both with the page's own sentence winning, and sends only when it
 * is {}.
 */

// The days of the week in the schema's order (contracts DAYS): the hours fold writes every one of them.
const BT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// The lines of a box, one rule or reason each: those with something on them, trimmed.
const btLines = (text) => String(text == null ? "" : text).split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * The booking rules the booking_rules fold edits, each with the range the schema allows (contracts
 * BookingRulesSchema, whose bounds a folds test holds these to), as a plain [key, least, most]. One table, so the range
 * a save writes and the range a check refuses are never two. Its notes are the fold's too; consult_first is a fold of
 * its own.
 *
 * The sentence for a number outside a rule's range is contracts' (bookingRuleRefusal, through the bridge), asked for
 * when the check runs: it states the range and what an empty box uses, with its unit ("…leave it empty to use 2 hours."),
 * and a sentence with a number in it is contracts' (spec §3). The old form's said "leave it empty for no rule" of rules
 * that have a default, under a box whose hint says what it uses. With no bridge to ask, the page states no number of its
 * own: only that the box is refused.
 */
const BT_RULES = [
  ["lead_hours", 0, 168],
  // The slot length has a field of its own now (S2): 15 to 240 minutes, as the schema allows; blank is the calendar's
  // default.
  ["slot_min", 15, 240],
  ["buffer_min", 0, 120],
  ["max_days_ahead", 1, 90],
  ["party_max", 1, 20],
];
const BT_RULE_REFUSED = "That is not a number this rule takes.";
const btRuleRefusal = (key) => {
  const tab = window.__businessTab;
  return tab && typeof tab.bookingRuleRefusal === "function" ? tab.bookingRuleRefusal(key) : BT_RULE_REFUSED;
};
// A blank box stores no rule, never zero, and the default applies where the rule has one; anything that is not a whole
// number in the rule's range would store none either, which is why problemsOf refuses it first. Digits only: parseInt
// read "2.5" as 2, "30min" as 30 and "1e2" as 1, and stored a rule nobody typed.
const btRuleNumber = (v, lo, hi) => {
  const typed = btfTrimmed(v);
  if (!/^[0-9]+$/.test(typed)) return undefined;
  const n = parseInt(typed, 10);
  return n >= lo && n <= hi ? n : undefined;
};

// The four rules it always keeps (contracts GUARDRAIL_KEYS), and the three messages sent in the business's name (S5).
const BT_GUARDRAILS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"];
const BT_FALLBACKS = ["greeting", "error", "non_text"];

/**
 * How much of each thing the save's schema takes (contracts BusinessProfileSchema and its parts), once, for the folds:
 * a list offers no "Add" past its count, a box says its length before a round trip, and a number input takes its range
 * from RULES. The old form enforced one of these in its own markup (ten notes) and none of the rest, so a name of 81
 * characters was refused by the server under no field at all.
 *
 * The closures and shifts caps are the bridge's (window.__configLimits, from contracts MAX_CLOSURES and
 * MAX_INTERVALS_PER_DAY), which the old form read too. They are read when asked, since the bridge publishes them as it
 * installs, and the literal each falls back to where there is no bridge (the standalone mockup) is here and nowhere
 * else: it was `|| 60` in two files.
 */
const BT_LIMITS = {
  tone: 200,
  services: 60, serviceName: 80, serviceMinutes: 1440, servicePrice: 120,
  languages: 8, languageMin: 2, languageMax: 40,
  reasons: 20, reason: 200,
  consultFirst: 20, consultFirstLine: 80,
  ruleNotes: 10, ruleNote: 200,
  notes: 10, noteTitle: 80, noteText: 1200,
  closureNote: 200,
  get closures() { return (window.__configLimits && window.__configLimits.maxClosures) || 60; },
  get shifts() { return (window.__configLimits && window.__configLimits.maxIntervalsPerDay) || 4; },
};
// A service's minutes as its box holds them: a whole number, 0 for an empty box, NaN for anything else.
const btMinutes = (v) => {
  const typed = btfTrimmed(v);
  if (typed === "") return 0;
  return /^[0-9]+$/.test(typed) ? parseInt(typed, 10) : NaN;
};
const BT_DAY_NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const btCount = (n) => n.toLocaleString("en-US");

/**
 * Exactly what each fold writes, as dotted paths into the whole config: nothing outside them is the fold's to change.
 * Two folds share booking_rules, each with only its own of its keys, and three write beside the profile: the rules
 * write the photos switch (features.vision), the instructions write the stored prompt, and the fallbacks and the
 * calendar write nothing in the profile at all. The calendar's is its address alone: whatever else its section comes
 * to hold is kept, as it is under the rules, the messages and the features.
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
  calendar: ["calendar.ical_url"],
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
      // BOTH shapes, when a stored day holds both, as the composer reads them (contracts dayIntervals unions them, and
      // says why: dropping either makes a fact disappear from the prompt with nothing to show it had). The old form let
      // the intervals win, so opening such a day and pressing Save took its open/close stretch away.
      const shifts = [];
      if (x.open && x.close) shifts.push({ open: x.open, close: x.close });
      (x.intervals || []).forEach((s) => { if (s && s.open && s.close) shifts.push({ open: s.open, close: s.close }); });
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
  // Which rules are in force is contracts' one reading (guardrailsInForce, through the bridge), the composer's and Ask's:
  // absent means ON for three, so an unset config must not render as three unticked boxes, and the health rule is
  // opt-in, since a rule that defaulted on would have changed every composed prompt already live the moment it shipped.
  // The form this replaces read them with a copy of that rule, and two copies had already drifted once (Ask took the
  // health rule as on when absent).
  guardrails: (p, brain, config) => ({
    ...window.__businessTab.guardrailsInForce(p.guardrails),
    // Opt-in abilities: off unless the owner turned one on.
    vision: (config.features || {}).vision === true,
  }),
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
  if (value === undefined) { if (next.brain && next.brain.profile) delete next.brain.profile[key]; return; }
  if (!next.brain) next.brain = {};
  if (!next.brain.profile) next.brain.profile = {};
  next.brain.profile[key] = value;
};
// A draft the page built with a part missing is said, naming the part: written as it stood, a missing switch was stored
// as off, the opposite of the schema's "absent means on", and a missing message as "", which the save refuses.
const btWhole = (fold, draft, parts, kind) => {
  parts.forEach((key) => {
    if (typeof (draft || {})[key] !== kind) throw new TypeError(`The ${fold} fold's draft needs ${JSON.stringify(key)} as a ${kind}; it holds ${JSON.stringify((draft || {})[key])}.`);
  });
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
      // Digits, as a booking rule's number is (btRuleNumber says what parseInt made of "1.5"); an empty box or a zero
      // is no duration, as it always was, and anything else problemsOf refuses first.
      const d = btMinutes(x.duration_min);
      if (d > 0) o.duration_min = d;
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
    btWhole("guardrails", draft, BT_GUARDRAILS.concat(["vision"]), "boolean");
    const d = draft;
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
    if (!next.brain) next.brain = {};
    // The product's own opening lines, on every save (S4). The box showed the prompt written before the form, and
    // what the owner kept of it is now their instructions; left in the prompt as well it was stored twice, and an
    // emptied box carried it straight back. Built in contracts, under the name the brain holds when the save goes.
    next.brain.system_prompt = window.__receptionistDefaults(next.brain.business_name || "").system_prompt;
  },
  // The three messages as the fold holds them (S5), trimmed, onto what is stored beside them. An existing workspace's
  // open with its own words, never replaced because somebody opened a fold.
  fallbacks: (next, draft) => {
    btWhole("fallbacks", draft, BT_FALLBACKS, "string");
    const d = draft;
    if (!next.brain) next.brain = {};
    const messages = { ...(next.brain.fallbacks || {}) };
    BT_FALLBACKS.forEach((key) => { messages[key] = btfTrimmed(d[key]); });
    next.brain.fallbacks = messages;
  },
  // A top-level section, read by the edge. The address is written onto what the section holds, and an emptied one
  // removes it, and the section with it once nothing else is in it.
  calendar: (next, draft) => {
    const feed = btfTrimmed(draft);
    const section = { ...(next.calendar || {}) };
    btPut(section, "ical_url", feed || undefined);
    if (Object.keys(section).length) next.calendar = section; else delete next.calendar;
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
  tone: (draft) => {
    const n = btfTrimmed(draft).length;
    return n > BT_LIMITS.tone ? { tone: `At most ${btCount(BT_LIMITS.tone)} characters — this is ${btCount(n)}.` } : {};
  },
  // A shift with one of its two times is said under its day, in the words the save's own rule has for a day stated
  // half-way (contracts config.ts checkDay; business-tab-folds.test.mjs holds the two sentences together): written as
  // it stood it was dropped, and a day with no other shift was saved as closed. A shift with neither, beside one that is
  // filled in, is a row nobody filled in, and is dropped as it always was.
  //
  // And a day switched on with no times at all is said under the same key, in the page's words (the schema has none:
  // to it a day with no times is a closed day). The save writes such a day as closed, so a week whose only change was
  // the switch "changed nothing", and the fold closed without a word with the owner's Sunday gone.
  //
  // More shifts than a day takes (LIMITS.shifts) is said first, since removing one is what answers it. The fold offers
  // no Add past the cap and puts none back past it, so this is a week that arrived that way; the schema's own refusal
  // names no number, and reached the owner as "This can't be saved as it is written." Only shifts the save would write
  // are counted: a row nobody filled in is dropped.
  hours: (draft) => {
    const found = {};
    BT_DAYS.forEach((d) => {
      const x = (draft || {})[d];
      if (!x || !x.isOpen) return;
      const shifts = x.shifts || [];
      const written = shifts.filter((s) => btfTrimmed(s.open) && btfTrimmed(s.close)).length;
      if (written > BT_LIMITS.shifts) found[`hours-${d}`] = `At most ${btCount(BT_LIMITS.shifts)} shifts in a day — ${BT_DAY_NAMES[d]} has ${btCount(written)}.`;
      else if (shifts.some((s) => !!btfTrimmed(s.open) !== !!btfTrimmed(s.close))) found[`hours-${d}`] = `${BT_DAY_NAMES[d]} needs both an opening and a closing time, or neither.`;
      else if (!shifts.some((s) => btfTrimmed(s.open) && btfTrimmed(s.close))) found[`hours-${d}`] = `${BT_DAY_NAMES[d]} is switched on with no times. Give it an opening and a closing time, or switch it off.`;
    });
    return found;
  },
  closures: (draft) => {
    const found = {};
    const rows = draft || [];
    const max = BT_LIMITS.closures;
    if (rows.filter((c) => btfTrimmed(c.date)).length > max) found.closures = `At most ${btCount(max)} closed days. Dates that have passed can go.`;
    rows.forEach((c, i) => {
      const n = btfTrimmed(c.note).length;
      if (n > BT_LIMITS.closureNote) found[`closure-${i}-note`] = `At most ${btCount(BT_LIMITS.closureNote)} characters — this is ${btCount(n)}.`;
    });
    return found;
  },
  services: (draft) => {
    const found = {};
    const rows = draft || [];
    if (rows.filter((x) => btfTrimmed(x.name)).length > BT_LIMITS.services) found.services = `At most ${btCount(BT_LIMITS.services)} services.`;
    rows.forEach((x, i) => {
      const name = btfTrimmed(x.name).length;
      if (name > BT_LIMITS.serviceName) found[`service-${i}-name`] = `At most ${btCount(BT_LIMITS.serviceName)} characters — this is ${btCount(name)}.`;
      const minutes = btMinutes(x.duration_min);
      if (Number.isNaN(minutes)) found[`service-${i}-duration_min`] = "Minutes are a whole number, like 45.";
      else if (minutes > BT_LIMITS.serviceMinutes) found[`service-${i}-duration_min`] = `At most ${btCount(BT_LIMITS.serviceMinutes)} minutes, a whole day.`;
      const price = btfTrimmed(x.price_note).length;
      if (price > BT_LIMITS.servicePrice) found[`service-${i}-price_note`] = `At most ${btCount(BT_LIMITS.servicePrice)} characters — this is ${btCount(price)}.`;
    });
    return found;
  },
  languages: (draft) => {
    const list = draft || [];
    if (list.length > BT_LIMITS.languages) return { languages: `At most ${btCount(BT_LIMITS.languages)} languages.` };
    const odd = list.find((l) => String(l).length < BT_LIMITS.languageMin || String(l).length > BT_LIMITS.languageMax);
    return odd !== undefined ? { languages: `“${odd}” is not a language's name: ${BT_LIMITS.languageMin} to ${BT_LIMITS.languageMax} characters.` } : {};
  },
  escalate_when: (draft) => {
    const reasons = btLines(draft);
    if (reasons.length > BT_LIMITS.reasons) return { escalate_when: `At most ${btCount(BT_LIMITS.reasons)} reasons, one to a line — this is ${btCount(reasons.length)}.` };
    return reasons.some((r) => r.length > BT_LIMITS.reason) ? { escalate_when: `Each reason is at most ${btCount(BT_LIMITS.reason)} characters.` } : {};
  },
  consult_first: (draft) => {
    const list = btLines(draft);
    if (list.length > BT_LIMITS.consultFirst) return { consult_first: `At most ${btCount(BT_LIMITS.consultFirst)} services, one to a line — this is ${btCount(list.length)}.` };
    return list.some((l) => l.length > BT_LIMITS.consultFirstLine) ? { consult_first: `Each service is at most ${btCount(BT_LIMITS.consultFirstLine)} characters.` } : {};
  },
  // A number outside what a rule allows is said under its box; it used to be dropped without a word (S22).
  booking_rules: (draft) => {
    const d = draft || {};
    const found = {};
    BT_RULES.forEach(([key, lo, hi]) => {
      if (btfTrimmed(d[key]) !== "" && btRuleNumber(d[key], lo, hi) === undefined) found[key] = btRuleRefusal(key);
    });
    const notes = btLines(d.notes);
    if (notes.length > BT_LIMITS.ruleNotes) found.notes = `At most ${btCount(BT_LIMITS.ruleNotes)} notes, one to a line — this is ${btCount(notes.length)}.`;
    else if (notes.some((n) => n.length > BT_LIMITS.ruleNote)) found.notes = `Each note is at most ${btCount(BT_LIMITS.ruleNote)} characters.`;
    return found;
  },
  // Half a note is refused; a note with neither half is dropped on save, as a row somebody started and left.
  notes: (draft) => {
    const found = {};
    const rows = draft || [];
    if (rows.filter((n) => btfTrimmed(n.title) || btfTrimmed(n.text)).length > BT_LIMITS.notes) found.notes = `At most ${btCount(BT_LIMITS.notes)} notes.`;
    rows.forEach((n, i) => {
      const title = btfTrimmed(n.title);
      const text = btfTrimmed(n.text);
      if ((title || text) && (!title || !text)) found[`note-${i}`] = "Each note needs both a title and the text to say.";
      else if (title.length > BT_LIMITS.noteTitle) found[`note-${i}`] = `A note's title is at most ${btCount(BT_LIMITS.noteTitle)} characters — this is ${btCount(title.length)}.`;
      else if (text.length > BT_LIMITS.noteText) found[`note-${i}`] = `A note's text is at most ${btCount(BT_LIMITS.noteText)} characters — this is ${btCount(text.length)}.`;
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

// The schema's sentence, as the owner reads it. Its own rules write sentences ("Monday: two shifts overlap."); where a
// refusal is only a type's default ("Too big: expected...", "Invalid string: must match pattern..."), which problemsOf
// should have said first and did not foresee, the owner is told that much in the page's words, never the pattern.
const btSchemaWords = (message) => (/^(Too big|Too small|Invalid|Unrecognized|Expected|Required)/i.test(String(message))
  ? "This can't be saved as it is written. Check it, and try again."
  : String(message));

// Which row of the draft each WRITTEN row came from: saveFold drops the rows nobody filled in before it writes, so the
// save's schema counts from a list the owner is not looking at.
const BT_WRITTEN_ROWS = {
  services: (draft) => (draft || []).map((x, i) => (btfTrimmed(x.name) ? i : -1)).filter((i) => i >= 0),
  closures: (draft) => (draft || []).map((c, i) => (btfTrimmed(c.date) ? i : -1)).filter((i) => i >= 0),
  notes: (draft) => (draft || []).map((n, i) => (btfTrimmed(n.title) || btfTrimmed(n.text) ? i : -1)).filter((i) => i >= 0),
};
// The field a refusal is said under, from where the schema found it; null when it is not under this fold's own paths.
const btFieldOf = (fold, path, draft) => {
  const dotted = path.join(".");
  const own = BT_PATHS_OF[fold].some((p) => dotted === p || dotted.startsWith(`${p}.`));
  if (!own) return null;
  if (fold === "hours") return `hours-${path[3]}`;
  if (fold === "services" || fold === "closures" || fold === "notes") {
    if (typeof path[3] !== "number") return fold;
    const row = BT_WRITTEN_ROWS[fold](draft)[path[3]];
    const at = row === undefined ? path[3] : row;
    if (fold === "notes") return `note-${at}`;
    return `${fold === "services" ? "service" : "closure"}-${at}${typeof path[4] === "string" ? `-${path[4]}` : ""}`;
  }
  if (fold === "booking_rules" || fold === "consult_first") return String(path[3]);
  if (fold === "fallbacks") return String(path[2]);
  if (fold === "calendar") return "ical_url";
  return fold === "guardrails" && path[0] === "features" ? "vision" : fold;
};

/**
 * What the save's own schema refuses of a fold's draft, by the field it is under: { fieldKey: sentence }, {} when the
 * save would take it. The schema's judgement and its sentence (the bridge's saveIssues), and this file's field keys:
 * a row is named by its place in the DRAFT, which is the list the owner is looking at. The fold's part of the config
 * is judged alone, the brain or the calendar, as the bridge says why. A refusal somewhere that is not this fold's to
 * fix (a stored day that closes before it opens, met while saving the voice) would stop this save too, so it is said
 * once, as `elsewhere`, naming where the way the server's refusal does. {} without the bridge: nothing to ask.
 */
const btSchemaProblems = (fold, base, draft) => {
  btFoldNamed(fold);
  const ask = window.__businessTab && window.__businessTab.saveIssues;
  if (typeof ask !== "function") return {};
  const next = btSaveFold(fold, base, draft);
  const issues = ask(fold === "calendar" ? { calendar: next.calendar } : { brain: next.brain });
  const found = {};
  issues.forEach((issue) => {
    const key = btFieldOf(fold, issue.path, draft);
    if (key) { if (!found[key]) found[key] = btSchemaWords(issue.message); return; }
    if (found.elsewhere) return;
    const where = issue.path.filter((p) => typeof p === "string").slice(-2).join(".");
    found.elsewhere = `Something else in your settings stops this save — ${where ? `${where}: ` : ""}${btSchemaWords(issue.message)}`;
  });
  return found;
};

/**
 * The one question a fold asks before it saves: { fieldKey: sentence }, and nothing is sent unless it is {}. The
 * page's own sentence wins under a field both would speak of: problemsOf says a name of 81 characters in the page's
 * words, where the schema says "Too big: expected string to have <=80 characters". Asked as two maps and merged by
 * each fold, one merged the other way round would have shown the owner that.
 */
const btSaveProblems = (fold, base, draft) => Object.assign({}, btSchemaProblems(fold, base, draft), btProblemsOf(fold, draft));

/** Whether a fold's draft holds changes: what it would write onto `base` is not what the draft it would open with writes. */
const btHoldsChanges = (fold, base, draft) => !btfSame(btSaveFold(fold, base, draft), btSaveFold(fold, base, btDraftOf(fold, base)));

const BT_FOLD_MOVED = "Not saved — this changed after you opened it. Close it and open it again to see what is there now.";

/**
 * A fold's save, as the one job the tab's saver takes: { row, patch, said, done, flash }. `opened` is the draft the
 * fold opened with (draftOf on the saver's base, kept from that moment), and it is required: a fold that left it out
 * would lose the refusal below with nothing to say so, on a page with no types.
 *
 * The patch runs on whatever config is current when the save goes. There it refuses (the saver's refusal) when the
 * fold's own part of that config no longer opens as `opened`: a colleague's save changed it, the re-read brought it
 * into this tab, and the draft, typed over the list as it was, would put their change back. A services list opened
 * before a colleague added one and saved after would have removed theirs without a word; the old form did the same,
 * and a sheet of thirty-three rows held open is where it happens. Another fold's part changing is no refusal: this
 * one's draft never held it, and saveFold keeps it. And a draft that holds no changes hands the config back as it was,
 * so the saver sends nothing (holdsChanges says why "the config would change" is the wrong test).
 *
 * A fold that stays open after its save is taken (a sheet, saved row by row) takes `opened` again as its `done` runs,
 * from the saver's base, or its next save with something new in it is refused as changed by its own last one; and it
 * takes no second press while saver.pending(fold).
 */
const btFoldJob = (fold, draft, job) => {
  btFoldNamed(fold);
  const j = job || {};
  if (j.opened === undefined) throw new TypeError(`The ${fold} fold's job needs \`opened\`, the draft it opened with (draftOf on the saver's base).`);
  return {
    row: fold,
    said: j.said,
    done: j.done,
    flash: j.flash,
    patch: (config) => {
      // Nothing to write first: a draft the config already holds is refused nothing, whoever wrote it there -- a
      // colleague who saved the same words, or this fold's own save a moment ago, which changed its part too.
      if (!btHoldsChanges(fold, config, draft)) return config;
      if (!btfSame(btDraftOf(fold, config), j.opened)) throw window.__businessTabSave.refusal(BT_FOLD_MOVED);
      return btSaveFold(fold, config, draft);
    },
  };
};

/* ------------------------------------ what a save will tell the receptionist ------------------------------------ */

// Each block as the brain a save goes on writes it, by channel and block: resolved once for that brain rather than on
// every keystroke, since each asks the bridge to parse a whole brain and resolve a full prompt. The saver hands back the
// same base while nothing moves, so the brain's identity is the key, AND the settings read's preview's: consequenceOf
// resolves with the preview's inputs (the zone, the Autonomy rows), so a zone saved and read back under the same config
// object would have kept the old zone's block for the base, and the new heading read as a change of the next save. A
// new base or a new preview forgets them all. One cache for the page: each row once kept its own, and twelve folds
// would have kept twelve more.
let btSaidOn = { brain: null, prompt: null, blocks: {} };
const btPreview = () => (window.__SETTINGS && window.__SETTINGS.prompt) || null;
const btBlockLines = (b) => (b && typeof b.text === "string" ? b.text.split("\n").filter((l) => l.trim() !== "") : []);

/**
 * The sections whose block's lines are RUNS rather than facts (the bridge's FOLD_BLOCK names each section's block).
 * The composer collapses the week into runs of days that share their hours ("Monday–Thursday: 09:30–18:00"), so a
 * change to one day re-cuts the runs, and the lines that fall out of the old block are about days nobody changed:
 * changing Friday's close said "It will no longer be told: Monday–Thursday: 09:30–18:00". For such a section nothing
 * comes or goes line by line while the block stays: the whole new block is drawn, and the lines go only when the whole
 * block goes. A closure's line is one fact, so every other section says each line that comes and goes. A property of
 * the section, here, in one table, never an `if (fold === "hours")` in the page.
 */
const BT_RUN_BLOCKS = ["hours"];

/**
 * What a save would tell the receptionist, for a row or a fold alike: willSay({ was, next, sections, channel }).
 *
 * `was` is the brain the save goes on and `next` that brain as the save would leave it. Both are the saver's: `was` is
 * its base() (the settings read until a save is out, or taken and not read back yet) and `next` is that base with the
 * row's patch applied as the saver applies it (patched) or the fold's draft written as its save writes it (saveFold),
 * each on a copy. Read off the settings read instead, as the rows' first were, they described a save that was not the
 * one sent whenever another went first. `sections` names the block or blocks the save can change, by the names
 * consequenceOf knows (the bridge's FOLD_BLOCK), and `channel` the one its words are read on; a null channel is no
 * channel that reads them on this workspace, and nothing is resolved.
 *
 * It answers { note, added, removed, whole, caveat, chars, total }, each a string or null but the two numbers, all in
 * the composer's own words or prompt-blocks.ts', resolved as the edge resolves them (the bridge's consequenceOf);
 * nothing here writes a word of them:
 *   added    the lines the save adds or rewrites, which a row draws under "It will say";
 *   removed  the lines it takes away, under "It will no longer say": a line rewritten is one of each, and a save that
 *            drops one thing and adds another says both, where showing only what it adds hid what goes. A block the
 *            save takes away whole (the last open day closed, the last closure removed) goes line by line. A block
 *            whose lines are runs (RUN_BLOCKS) says nothing comes or goes while it stays: its lines are not facts;
 *   whole    every line of its blocks as the save would leave them, which a fold draws under "Your receptionist will
 *            be told" for as long as it is open, changed or not;
 *   caveat   those blocks' own notes (PromptBlockVM.note), where whose lines they are needs saying beside them: the
 *            rules' block carries the Autonomy tab's rules and a line Chanlytics writes, and the hand-off's is sent
 *            whether or not there are reasons. A fold draws them with `whole`; null with none;
 *   chars    those blocks' share of the prompt in characters (PromptBlockVM.chars), or null with no block: what a list
 *            too long to quote whole says in place of its lines (the services sheet's foot);
 *   total    the length of the whole prompt `next` would give the receptionist on `channel`, which `chars` is a share
 *            of: the prompt after the save, as the block is, never the one before it; null with no block;
 *   note     the sentence for a save that crosses the resolver's own line between composing a prompt and answering
 *            with the stored one (hasProfile, decided in the bridge's profileCrossing): emptying the last field it
 *            composes from drops the hand-off and every rule line, far beyond the save's own lines, and the first such
 *            field does the reverse. Not a refusal; the save still goes. Where the record stops composing, no block is
 *            left to show a line of, and the sentence says all of it: listing one block's lines would say too little.
 *
 * Null when nothing true can be said: no bridge, or a `next` the save's own schema refuses (the field's own error
 * speaks; and a block that is null for THAT reason must not read as one the save takes away). Call it only for a
 * draft the page's own checks pass, and only while the row or fold is open.
 */
const btWillSay = ({ was, next, sections, channel }) => {
  const tab = window.__businessTab;
  if (!tab || !was || !next) return null;
  if (typeof tab.saveIssues === "function" && tab.saveIssues({ brain: next }).length) return null;
  const crossing = tab.profileCrossing ? tab.profileCrossing(was, next) : null;
  const added = [];
  const removed = [];
  const whole = [];
  const caveats = [];
  let chars = 0;
  let total = null;
  if (channel && tab.consequenceOf) {
    if (btSaidOn.brain !== was || btSaidOn.prompt !== btPreview()) btSaidOn = { brain: was, prompt: btPreview(), blocks: {} };
    const stored = btSaidOn.blocks;
    for (const block of [].concat(sections)) {
      const key = `${channel}:${block}`;
      if (!(key in stored)) stored[key] = tab.consequenceOf(block, was, channel);
      const before = btBlockLines(stored[key]);
      const after = tab.consequenceOf(block, next, channel);
      if (!after) {
        if (!crossing) removed.push(...before);
        continue;
      }
      const now = btBlockLines(after);
      whole.push(after.text);
      if (typeof after.note === "string" && after.note && !caveats.includes(after.note)) caveats.push(after.note);
      chars += after.chars;
      total = after.total;
      // A run block that stays says nothing line by line; one that appears whole is every line new, as one that goes
      // whole is every line gone.
      if (BT_RUN_BLOCKS.includes(block) && before.length) continue;
      added.push(...now.filter((l) => !before.includes(l)));
      removed.push(...before.filter((l) => !now.includes(l)));
    }
  }
  return {
    note: crossing ? crossing.sentence : null,
    added: added.length ? added.join("\n") : null,
    removed: removed.length ? removed.join("\n") : null,
    whole: whole.length ? whole.join("\n\n") : null,
    caveat: caveats.length ? caveats.join(" ") : null,
    chars: whole.length ? chars : null,
    total: whole.length && typeof total === "number" ? total : null,
  };
};

// Added to window.__businessTabSave, the object business-tab-save.jsx published: each fold's paths and keys (PATHS_OF,
// KEYS_OF), its helpers (draftOf, saveProblems and its two halves, saveFold, holdsChanges, foldJob), how much of each thing the save
// takes (LIMITS, and RULES: each booking rule's key, least, most and sentence), which sections say their block in runs
// (RUN_BLOCKS), the lines of a box as a save writes them (linesOf), and what a row's or a fold's save will tell the
// receptionist (willSay).
if (!window.__businessTabSave) throw new Error("business-tab-folds.jsx loads after business-tab-save.jsx: window.__businessTabSave is not there.");
Object.assign(window.__businessTabSave, {
  PATHS_OF: BT_PATHS_OF,
  KEYS_OF: BT_KEYS_OF,
  draftOf: btDraftOf,
  problemsOf: btProblemsOf,
  schemaProblems: btSchemaProblems,
  saveProblems: btSaveProblems,
  saveFold: btSaveFold,
  holdsChanges: btHoldsChanges,
  foldJob: btFoldJob,
  LIMITS: BT_LIMITS,
  RULES: BT_RULES,
  // Which rows of a list's draft its save writes (the services sheet counts its Save and its foot by them).
  WRITTEN_ROWS: BT_WRITTEN_ROWS,
  RUN_BLOCKS: BT_RUN_BLOCKS,
  // The lines of a box, as its save writes them (the hand-off's reasons): a fold that says what a draft means asks this.
  linesOf: btLines,
  willSay: btWillSay,
});
