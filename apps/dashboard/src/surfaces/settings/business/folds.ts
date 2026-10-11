// Chanlytics — Settings › Business: what each fold opens with, refuses and writes, and what a save will say.
//
// The folds' own helpers, split from save.tsx (which keeps the tab's one saver and the rows' tables) when the two had
// grown to two jobs in one file, and the one helper for what a row's or a fold's save will tell the receptionist
// (willSay, at the foot). Pure but for that helper's cache, and no JSX: nothing here draws. The tab's saver (saver.ts)
// adds its names to what save.tsx holds. The save helpers it needs are save.tsx's, imported by name.

import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import {
  CHECK_OF,
  STORED_AS,
  answerOf,
  refusal,
  same,
  trimmed,
  type Brain,
  type Config,
  type FoldJob,
  type Profile,
  type StoredNote,
} from "./save";
import {
  BT_DAYS,
  BT_DAY_NAMES,
  BT_FALLBACKS,
  BT_GUARDRAILS,
  BT_KEYS_OF,
  BT_LIMITS,
  BT_PATHS_OF,
  BT_RULES,
  btCalendarDraft,
  btCalendarPart,
  btCalendarProblems,
  btFoldNamed,
  btLines,
  btMinutes,
  btRefusalOf,
  btRuleNumber,
  btPut,
  btRuleRefusal,
  btWhole,
  btWriteCalendar,
  type ClosureRow,
  type DayDraft,
  type DraftOf,
  type FoldName,
  type Problems,
  type ReceptionistDraft,
  type RulesDraft,
  type ServiceRow,
  type ShiftDraft,
} from "./fold-shapes";
import { BT_RUN_BLOCKS, btChangedLines, btWillSay } from "./fold-says";
import { fallbackDefaults, instructionsDraft, receptionistDefaults, unknownDetails } from "./shell";
import { greetingDraftOf, greetingStoredOf } from "./phone/greeting-draft";

/* ------------------------------------ what each fold opens with, refuses and writes ------------------------------------ */

/*
 * A fold's three helpers, pure: they read nothing but what they are handed and the bridge's published functions
 * (instructionsDraft, fallbackDefaults, receptionistDefaults, unknownDetails, and BUSINESS_TAB's guardrailsInForce),
 * and change nothing they are handed. Ported from the form they replace, BusinessEditor in settings.jsx, section by
 * section: how it opened each part of its state, what its `save` checked, and how it wrote each part back. A fold is
 * named by its id, the same name consequenceOf knows it by (the bridge's FOLD_BLOCK); any other name is a TypeError
 * naming it.
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
 * gestures/), since what a save drops (half a shift, a closed day with no date, a service with no name) is
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
 *   phone_greeting      phone_greeting (notes only: nothing about a greeting stops a save, decision 0051)
 *   hours               hours-<day> (too many shifts, a shift typed half-way, or a day switched on with no times)
 *   closures            closure-<i>-note, closures (too many)
 *   services            service-<i>-name, service-<i>-duration_min, service-<i>-price_note, services (too many)
 *   languages           languages
 *   escalate_when       escalate_when
 *   booking_rules       lead_hours, slot_min, buffer_min, max_days_ahead, party_max, ask_email, notes: the draft's own keys
 *   consult_first       consult_first
 *   notes               note-<i>, notes (too many)
 *   extra_instructions  extra_instructions
 *   fallbacks           greeting, error, non_text: the draft's own keys
 *   calendar            ical_url, with
 *   receptionist        name, number, link (the number's sentence is the create card's own check, which knows the line)
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

/** Each hours day, however the day happens to be stored, as one editable list of shifts. */
const btOpenHours = (p: Profile) => {
  const week: Record<string, DayDraft> = {};
  BT_DAYS.forEach((d) => {
    const x = (p.hours || {})[d] || {};
    // BOTH shapes, when a stored day holds both, as the composer reads them (contracts dayIntervals unions them, and
    // says why: dropping either makes a fact disappear from the prompt with nothing to show it had). The old form let
    // the intervals win, so opening such a day and pressing Save took its open/close stretch away.
    const shifts: ShiftDraft[] = [];
    if (x.open && x.close) shifts.push({ open: x.open, close: x.close });
    (x.intervals || []).forEach((s) => {
      if (s && s.open && s.close) shifts.push({ open: s.open, close: s.close });
    });
    week[d] = { isOpen: shifts.length > 0, shifts };
  });
  return week;
};

// Each number as its box holds it, "" where there is no rule; the notes one to a line; the email switch off unless
// it is stored on (the schema's absent means no).
const btOpenRules = (p: Profile): RulesDraft => {
  const rules = p.booking_rules || {};
  const draft: RulesDraft = { notes: "", ask_email: false };
  BT_RULES.forEach(([key]) => {
    const value = rules[key] as number | undefined;
    draft[key] = value !== undefined ? String(value) : "";
  });
  draft.notes = (rules.notes || []).join("\n");
  draft.ask_email = !!rules.ask_email;
  return draft;
};

/** What each fold opens with, from the stored profile, brain and config: as BusinessEditor set up its state. */
const BT_DRAFT_OF: { [F in FoldName]: (p: Profile, brain: Brain, config: Config) => DraftOf[F] } = {
  tone: (p) => p.tone || "",
  phone_greeting: greetingDraftOf,
  // One editable list per day, however the day happens to be stored: a plain open/close pair reads as a single shift,
  // so the two shapes are one thing to edit and only differ again on save. `isOpen` means the business is open, not
  // the opening time: a day is closed only when it has no times, which is what the schema stores.
  hours: btOpenHours,
  closures: (p) => (p.closures || []).map((x) => ({ ...x })),
  services: (p) => (p.services || []).map((x) => ({ ...x })),
  languages: (p) => (p.languages || []).slice(),
  notes: (p) => (p.notes || []).map((x) => ({ ...x })),
  escalate_when: (p) => (p.escalate_when || []).join("\n"),
  booking_rules: btOpenRules,
  consult_first: (p) => ((p.booking_rules || {}).consult_first || []).join("\n"),
  // Which rules are in force is contracts' one reading (guardrailsInForce, through the bridge), the composer's and Ask's:
  // absent means ON for three, so an unset config must not render as three unticked boxes, and the health rule is
  // opt-in, since a rule that defaulted on would have changed every composed prompt already live the moment it shipped.
  // The form this replaces read them with a copy of that rule, and two copies had already drifted once (Ask took the
  // health rule as on when absent).
  guardrails: (p, brain, config) => ({
    ...BUSINESS_TAB.guardrailsInForce(p.guardrails),
    // Opt-in abilities: off unless the owner turned one on.
    vision: (config.features || {}).vision === true,
  }),
  // Pre-filled with the workspace's existing instructions, so nothing a business already told its receptionist quietly
  // disappears the moment it fills in a form. Chosen in contracts (S4): the owner's own words, or the prompt from
  // before the form, carried and marked `carried` so the fold can say so -- never the product's opening lines, which
  // no owner wrote.
  extra_instructions: (p, brain) => instructionsDraft()(brain),
  // The three messages sent in the business's name when the receptionist cannot answer (S5): the workspace's own, or,
  // for one set up before them, the product's wording, which names the details rather than copying them in.
  fallbacks: (p, brain) => ({ ...(brain.fallbacks || fallbackDefaults()) }),
  calendar: (p, brain, config) => btCalendarDraft(config),
  // The name, the number it gives out as the Who you are row holds it (the line it answers, `own`, unless a different
  // number is typed), and the booking link: the old form's create path.
  receptionist: (p, brain) => ({
    name: brain.business_name || "",
    own: !brain.phone_display,
    typed: brain.phone_display || "",
    link: brain.booking_link || "",
  }),
};

/** The draft `fold` opens with over the stored config `stored` (the saver's base). */
function btDraftOf<F extends FoldName>(fold: F, stored: Config | null | undefined): DraftOf[F];
function btDraftOf(fold: string, stored: Config | null | undefined): unknown;
function btDraftOf(fold: string, stored: Config | null | undefined): unknown {
  btFoldNamed(fold);
  const config = stored || {};
  const brain = config.brain || {};
  return BT_DRAFT_OF[fold](brain.profile || {}, brain, config);
}

// A key, written from a draft: only what was filled in. An empty string is not a fact, and storing it would have the
// composed prompt state an address of nothing, so an emptied field DELETES its key rather than storing "" (the old
// form's `put`).
// The same, for a key of the profile. A profile is made only to hold a value, so a fold that empties a field of a
// brain with no profile writes nothing at all.
const btPutProfile = (next: Config, key: string, value: unknown) => {
  if (value === undefined) {
    if (next.brain && next.brain.profile) delete next.brain.profile[key];
    return;
  }
  if (!next.brain) next.brain = {};
  if (!next.brain.profile) next.brain.profile = {};
  next.brain.profile[key] = value;
};
const btProfileOf = (next: Config): Profile => (next.brain && next.brain.profile) || {};

// One shift is still written as open/close, not as a one-element intervals array. Writing it the new way would
// rewrite every existing config into a new shape the first time anybody pressed Save -- a migration nobody asked
// for, on rows that already said this correctly.
//
// A day that is closed is stored as `{}` -- a real answer. Omitting it would read as "we did not say".
const btWriteDay = (x: DayDraft) => {
  const shifts = x.isOpen ? (x.shifts || []).filter((s) => s.open && s.close) : [];
  const [first] = shifts;
  return !first
    ? {}
    : shifts.length === 1
      ? { open: first.open, close: first.close }
      : { intervals: shifts.map((s) => ({ open: s.open, close: s.close })) };
};

const btWriteHours = (next: Config, draft: unknown) => {
  const week = (draft || {}) as Record<string, DayDraft | undefined>;
  const hours: Record<string, unknown> = {};
  BT_DAYS.forEach((d) => {
    hours[d] = btWriteDay(week[d] || { isOpen: false, shifts: [] });
  });
  // Only once at least one day has real times, or an untouched week would save seven closed days and read as a
  // business never open; and through put, so turning every day off CLEARS the stored week instead of leaving
  // yesterday's behind.
  const stated = BT_DAYS.some((d) => {
    const x = week[d];
    return x && x.isOpen && (x.shifts || []).some((s) => s.open && s.close);
  });
  btPutProfile(next, "hours", stated ? hours : undefined);
};

// A row with no date is a row somebody started and did not finish. Sending it would fail validation and name a field
// they cannot see; dropping it is what they meant.
const btWriteClosures = (next: Config, draft: unknown) => {
  const closed = ((draft || []) as ClosureRow[])
    .filter((c) => trimmed(c.date))
    .map((c) => {
      const o: ClosureRow = { date: trimmed(c.date) };
      // `until` equal to `date` is a one-day closure said twice.
      if (trimmed(c.until) && trimmed(c.until) !== o.date) o.until = trimmed(c.until);
      if (trimmed(c.note)) o.note = trimmed(c.note);
      return o;
    });
  btPutProfile(next, "closures", closed.length ? closed : undefined);
};

const btWriteServices = (next: Config, draft: unknown) => {
  const services = ((draft || []) as ServiceRow[])
    .filter((x) => trimmed(x.name))
    .map((x) => {
      const o: ServiceRow = { name: trimmed(x.name) };
      // Digits, as a booking rule's number is (btRuleNumber says what parseInt made of "1.5"); an empty box or a zero
      // is no duration, as it always was, and anything else problemsOf refuses first.
      const d = btMinutes(x.duration_min);
      if (d > 0) o.duration_min = d;
      if (trimmed(x.price_note)) o.price_note = trimmed(x.price_note);
      return o;
    });
  btPutProfile(next, "services", services.length ? services : undefined);
};

// From the stored rules, each of the fold's keys written or deleted where it stands. Everything else stored under
// booking_rules -- consult_first, which is a fold of its own, and a rule added later -- is kept as it was: the form
// this replaces started the rules from {} and deleted the slot length on every save (settingsRulesKept).
const btWriteRules = (next: Config, draft: unknown) => {
  const d = (draft || {}) as Record<string, unknown>;
  const rules = { ...(btProfileOf(next).booking_rules || {}) };
  BT_RULES.forEach(([key, lo, hi]) => btPut(rules, key, btRuleNumber(d[key], lo, hi)));
  const notes = btLines(d.notes);
  btPut(rules, "notes", notes.length ? notes : undefined);
  // Off is no key at all, as an empty box is no rule: a stored false would read as a choice the owner made.
  btPut(rules, "ask_email", d.ask_email ? true : undefined);
  btPutProfile(next, "booking_rules", Object.keys(rules).length ? rules : undefined);
};

// The four switches written onto what is stored beside them, where the old form wrote the four alone: a switch a
// newer form adds is kept by an older tab's save, as a rule added later is kept under booking_rules.
const btWriteGuardrails = (next: Config, draft: unknown) => {
  btWhole("guardrails", draft, BT_GUARDRAILS.concat(["vision"]), "boolean");
  const d = draft as Record<string, unknown>;
  const guardrails = { ...(btProfileOf(next).guardrails || {}) };
  BT_GUARDRAILS.forEach((key) => {
    guardrails[key] = d[key] === true;
  });
  btPutProfile(next, "guardrails", guardrails);
  // Opt-in abilities, written once the owner has touched them: an untouched workspace keeps no features at all.
  const features = next.features || {};
  const vision = d.vision === true;
  if (vision || features.vision !== undefined) next.features = { ...features, vision };
};

// A receptionist from nothing, as the old form's create path made one, onto whatever else the config holds (the
// alerts' addresses, a calendar): never a rebuild of the config. The number is stored only where a different one is
// typed: absent is the schema's "the line it answers". A workspace with no line must type one, which the create
// card's own check says, since only the page knows the line (create.tsx). The prompt and the three
// messages are the product's own, under the name typed, and only where none is stored: a brain that has them keeps
// its own.
const btWriteReceptionist = (next: Config, draft: unknown) => {
  const d = (draft || {}) as Partial<ReceptionistDraft>;
  if (!next.brain) next.brain = {};
  const b = next.brain;
  const name = trimmed(d.name);
  b.business_name = name;
  // What the box stores is the row's rule (save.tsx STORED_AS.phone_display, btPublishedOf): the
  // number typed, or nothing at all, which is the schema's "the line it answers". That rule cannot be CALLED here:
  // it takes the line the workspace answers on, which is the settings read's (factsNow()), and a fold's write is a
  // patch on the stored config alone. So it is spelled again, and `own` is the whole of it, which is exact because
  // the create card normalises `own` before it ever reaches this draft (create.tsx): `own` is set true
  // only where there IS a line to follow, so `own` and `own && line` are the same answer for every draft it makes.
  // A number left in the box and then put back to the line is `own` again, and stores nothing -- which is what
  // makes the number it gives out FOLLOW the line instead of freezing a copy of it.
  const typed = trimmed(d.typed);
  btPut(b, "phone_display", !d.own && typed ? typed : undefined);
  // None typed is no link, for a business that quotes: the key goes, since an empty one fails the read. Typed, it is
  // stored as the row stores it (STORED_AS.booking_link: the https:// an owner leaves off, supplied), which the
  // row's check has already said it can be.
  const link = trimmed(d.link);
  btPut(b, "booking_link", link ? STORED_AS.booking_link(link) : undefined);
  const made = receptionistDefaults()(name);
  if (!b.system_prompt) b.system_prompt = made.system_prompt;
  if (!b.fallbacks) b.fallbacks = made.fallbacks;
};

/** How each fold writes its draft into `next`, a copy of the stored config: its own paths, and nothing else. */
const BT_WRITE: { [F in FoldName]: (next: Config, draft: unknown) => void } = {
  tone: (next, draft) => btPutProfile(next, "tone", trimmed(draft) || undefined),
  phone_greeting: (next, draft) => btPutProfile(next, "phone_greeting", greetingStoredOf(draft)),
  // Only once at least one day has real times: btWriteHours says why.
  hours: btWriteHours,
  closures: btWriteClosures,
  services: btWriteServices,
  languages: (next, draft) =>
    btPutProfile(next, "languages", draft && (draft as string[]).length ? (draft as string[]).slice() : undefined),
  notes: (next, draft) => {
    const notes = ((draft || []) as StoredNote[])
      .map((n) => ({ title: trimmed(n.title), text: trimmed(n.text) }))
      .filter((n) => n.title || n.text);
    btPutProfile(next, "notes", notes.length ? notes : undefined);
  },
  escalate_when: (next, draft) => {
    const reasons = btLines(draft);
    btPutProfile(next, "escalate_when", reasons.length ? reasons : undefined);
  },
  booking_rules: btWriteRules,
  // The one key of booking_rules that is its own fold (it had no label in the form this replaces), and every other rule
  // as it was stored.
  consult_first: (next, draft) => {
    const rules = { ...(btProfileOf(next).booking_rules || {}) };
    const list = btLines(draft);
    btPut(rules, "consult_first", list.length ? list : undefined);
    btPutProfile(next, "booking_rules", Object.keys(rules).length ? rules : undefined);
  },
  guardrails: btWriteGuardrails,
  extra_instructions: (next, draft) => {
    btPutProfile(next, "extra_instructions", trimmed(draft && (draft as { text?: unknown }).text) || undefined);
    if (!next.brain) next.brain = {};
    // The product's own opening lines, on every save (S4). The box showed the prompt written before the form, and
    // what the owner kept of it is now their instructions; left in the prompt as well it was stored twice, and an
    // emptied box carried it straight back. Built in contracts, under the name the brain holds when the save goes.
    next.brain.system_prompt = receptionistDefaults()(next.brain.business_name || "").system_prompt;
  },
  // The three messages as the fold holds them (S5), trimmed, onto what is stored beside them. An existing workspace's
  // open with its own words, never replaced because somebody opened a fold.
  fallbacks: (next, draft) => {
    btWhole("fallbacks", draft, BT_FALLBACKS, "string");
    const d = draft as Record<string, string>;
    if (!next.brain) next.brain = {};
    const messages = { ...(next.brain.fallbacks || {}) };
    BT_FALLBACKS.forEach((key) => {
      messages[key] = trimmed(d[key]);
    });
    next.brain.fallbacks = messages;
  },
  calendar: btWriteCalendar,
  receptionist: btWriteReceptionist,
};

/**
 * The config a fold's save sends: the stored config `stored` (the saver's base, or whatever is current when the save
 * goes), with the fold's own paths written from its draft.
 *
 * Start from what is STORED, not from nothing. The form this replaces once started its profile from {} and added the
 * known keys back, and that is not a save -- it is a rebuild, and a rebuild silently deletes every key the form does
 * not happen to render. It is the exact mechanism that lost a live workspace its 5,000-character prompt: nobody deleted
 * anything, a rebuild simply dropped what it did not know about. So any key added later -- by a newer form, a script,
 * the API -- survives an owner opening a fold and pressing Save (the folds test holds every fold to it).
 * On a copy all the way down, so the config handed in stays exactly as it was.
 */
const btSaveFold = (fold: string, stored: Config | null | undefined, draft: unknown): Config => {
  btFoldNamed(fold);
  const next = structuredClone(stored || {});
  BT_WRITE[fold](next, draft);
  return next;
};

/** A shift the day writes: the two boxes of one, trimmed to what was filled in. */
const btShiftsOf = (x: DayDraft) => x.shifts || [];

// A shift with one of its two times is said under its day, in the words the save's own rule has for a day stated
// half-way (contracts config.ts checkDay; the folds test holds the two sentences together): written as
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
const btDayProblem = (d: string, x: DayDraft) => {
  const shifts = btShiftsOf(x);
  const written = shifts.filter((s) => trimmed(s.open) && trimmed(s.close)).length;
  if (written > BT_LIMITS.shifts) return btRefusalOf("shifts", written, BT_DAY_NAMES[d]);
  if (shifts.some((s) => !!trimmed(s.open) !== !!trimmed(s.close))) {
    return `${BT_DAY_NAMES[d]} needs both an opening and a closing time, or neither.`;
  }
  if (!shifts.some((s) => trimmed(s.open) && trimmed(s.close))) {
    return `${BT_DAY_NAMES[d]} is switched on with no times. Give it an opening and a closing time, or switch it off.`;
  }
  return null;
};

const btHoursProblems = (draft: unknown) => {
  const found: Problems = {};
  BT_DAYS.forEach((d) => {
    const x = ((draft || {}) as Record<string, DayDraft | undefined>)[d];
    if (!x || !x.isOpen) return;
    const problem = btDayProblem(d, x);
    if (problem !== null) found[`hours-${d}`] = problem;
  });
  return found;
};

const btServicesProblems = (draft: unknown) => {
  const found: Problems = {};
  const rows = (draft || []) as ServiceRow[];
  if (rows.filter((x) => trimmed(x.name)).length > BT_LIMITS.services) found.services = btRefusalOf("services");
  rows.forEach((x, i) => {
    const name = trimmed(x.name).length;
    if (name > BT_LIMITS.serviceName) found[`service-${i}-name`] = btRefusalOf("serviceName", name);
    const minutes = btMinutes(x.duration_min);
    if (Number.isNaN(minutes)) found[`service-${i}-duration_min`] = "Minutes are a whole number, like 45.";
    else if (minutes > BT_LIMITS.serviceMinutes) found[`service-${i}-duration_min`] = btRefusalOf("serviceMinutes");
    const price = trimmed(x.price_note).length;
    if (price > BT_LIMITS.servicePrice) found[`service-${i}-price_note`] = btRefusalOf("servicePrice", price);
  });
  return found;
};

// A number outside what a rule allows is said under its box; it used to be dropped without a word (S22).
const btRulesProblems = (draft: unknown) => {
  const d = (draft || {}) as Record<string, unknown>;
  const found: Problems = {};
  BT_RULES.forEach(([key, lo, hi]) => {
    if (trimmed(d[key]) !== "" && btRuleNumber(d[key], lo, hi) === undefined) found[key] = btRuleRefusal(key);
  });
  const notes = btLines(d.notes);
  if (notes.length > BT_LIMITS.ruleNotes) found.notes = btRefusalOf("ruleNotes", notes.length);
  else if (notes.some((n) => n.length > BT_LIMITS.ruleNote)) found.notes = btRefusalOf("ruleNote");
  return found;
};

// Half a note is refused; a note with neither half is dropped on save, as a row somebody started and left.
const btNotesProblems = (draft: unknown) => {
  const found: Problems = {};
  const rows = (draft || []) as StoredNote[];
  if (rows.filter((n) => trimmed(n.title) || trimmed(n.text)).length > BT_LIMITS.notes) {
    found.notes = btRefusalOf("notes");
  }
  rows.forEach((n, i) => {
    const title = trimmed(n.title);
    const text = trimmed(n.text);
    if ((title || text) && (!title || !text)) found[`note-${i}`] = "Each note needs both a title and the text to say.";
    else if (title.length > BT_LIMITS.noteTitle) found[`note-${i}`] = btRefusalOf("noteTitle", title.length);
    else if (text.length > BT_LIMITS.noteText) found[`note-${i}`] = btRefusalOf("noteText", text.length);
  });
  return found;
};

// Each message says under itself what stops it (S5): nothing to send, more than a message holds, or a name that
// nothing fills in and a customer would read as written.
const btFallbacksProblems = (draft: unknown) => {
  const d = (draft || {}) as Record<string, unknown>;
  const found: Problems = {};
  BT_FALLBACKS.forEach((key) => {
    const t = trimmed(d[key]);
    const unknown = unknownDetails()(t);
    if (!t) found[key] = "Write this message, or use the default wording.";
    else if (t.length > BT_LIMITS.message) found[key] = btRefusalOf("message", t.length);
    else if (unknown.length) {
      found[key] =
        `Only {business}, {booking link} and {phone} are filled in — ${unknown[0]} would be sent as written.`;
    }
  });
  return found;
};

/** What stops each fold's save, by the field it is under: BusinessEditor's `save` checks, word for word. */
const BT_PROBLEMS_OF: { [F in FoldName]?: (draft: unknown) => Problems } = {
  tone: (draft): Problems => {
    const n = trimmed(draft).length;
    return n > BT_LIMITS.tone ? { tone: btRefusalOf("tone", n) } : {};
  },
  hours: btHoursProblems,
  closures: (draft) => {
    const found: Problems = {};
    const rows = (draft || []) as ClosureRow[];
    const max = BT_LIMITS.closures;
    if (rows.filter((c) => trimmed(c.date)).length > max) found.closures = btRefusalOf("closures");
    rows.forEach((c, i) => {
      const n = trimmed(c.note).length;
      if (n > BT_LIMITS.closureNote) found[`closure-${i}-note`] = btRefusalOf("closureNote", n);
    });
    return found;
  },
  services: btServicesProblems,
  languages: (draft): Problems => {
    const list = (draft || []) as string[];
    if (list.length > BT_LIMITS.languages) return { languages: btRefusalOf("languages") };
    const odd = list.find((l) => String(l).length < BT_LIMITS.languageMin || String(l).length > BT_LIMITS.languageMax);
    return odd !== undefined ? { languages: btRefusalOf("language", undefined, String(odd)) } : {};
  },
  escalate_when: (draft): Problems => {
    const reasons = btLines(draft);
    if (reasons.length > BT_LIMITS.reasons) return { escalate_when: btRefusalOf("reasons", reasons.length) };
    return reasons.some((r) => r.length > BT_LIMITS.reason) ? { escalate_when: btRefusalOf("reason") } : {};
  },
  consult_first: (draft): Problems => {
    const list = btLines(draft);
    if (list.length > BT_LIMITS.consultFirst) return { consult_first: btRefusalOf("consultFirst", list.length) };
    return list.some((l) => l.length > BT_LIMITS.consultFirstLine)
      ? { consult_first: btRefusalOf("consultFirstLine") }
      : {};
  },
  booking_rules: btRulesProblems,
  notes: btNotesProblems,
  // As much as the receptionist takes, said under the box before a round trip (S4): the server's refusal named no field.
  extra_instructions: (draft): Problems => {
    const n = trimmed(draft && (draft as { text?: unknown }).text).length;
    return n > BT_LIMITS.instructions ? { extra_instructions: btRefusalOf("instructions", n) } : {};
  },
  fallbacks: btFallbacksProblems,
  calendar: btCalendarProblems,
  // The name and the booking link by the Who you are rows' own checks (save.tsx CHECK_OF), the old create
  // path's sentences. The number's check needs the line the workspace answers on, which no draft holds: the create
  // card asks the row's check with it (BtFold's `check`).
  receptionist: (draft) => {
    const d = (draft || {}) as Partial<ReceptionistDraft>;
    const found: Problems = {};
    const name = CHECK_OF.name(d.name);
    if (name) found.name = name;
    // By the answer the fold stands on: a business that quotes is not asked for a link.
    const link = CHECK_OF.booking_link(d.link, answerOf(d));
    if (link) found.link = link;
    return found;
  },
};

/** Every problem with a fold's draft at once, by the field it is under: {} when it may be saved. */
const btProblemsOf = (fold: string, draft: unknown): Problems => {
  btFoldNamed(fold);
  const check = BT_PROBLEMS_OF[fold];
  return Object.prototype.hasOwnProperty.call(BT_PROBLEMS_OF, fold) && check ? check(draft) : {};
};

// The schema's sentence, as the owner reads it. Its own rules write sentences ("Monday: two shifts overlap."); where a
// refusal is only a type's default ("Too big: expected...", "Invalid string: must match pattern..."), which problemsOf
// should have said first and did not foresee, the owner is told that much in the page's words, never the pattern.
const btSchemaWords = (message: unknown) =>
  /^(Too big|Too small|Invalid|Unrecognized|Expected|Required)/i.test(String(message))
    ? "This can't be saved as it is written. Check it, and try again."
    : String(message);

// Which row of the draft each WRITTEN row came from: saveFold drops the rows nobody filled in before it writes, so the
// save's schema counts from a list the owner is not looking at.
const BT_WRITTEN_ROWS = {
  services: (draft: unknown) =>
    ((draft || []) as ServiceRow[]).map((x, i) => (trimmed(x.name) ? i : -1)).filter((i) => i >= 0),
  closures: (draft: unknown) =>
    ((draft || []) as ClosureRow[]).map((c, i) => (trimmed(c.date) ? i : -1)).filter((i) => i >= 0),
  notes: (draft: unknown) =>
    ((draft || []) as StoredNote[]).map((n, i) => (trimmed(n.title) || trimmed(n.text) ? i : -1)).filter((i) => i >= 0),
};
// The create card's field keys, by the brain's key each writes.
const BT_RECEPTIONIST_FIELDS: Record<string, string> = {
  business_name: "name",
  phone_display: "number",
  booking_link: "link",
};

// The field of a list's row a refusal is said under: the row's place in the DRAFT, which is the list the owner is
// looking at, however many rows the save dropped before it.
const btListField = (fold: "services" | "closures" | "notes", path: (string | number)[], draft: unknown) => {
  if (typeof path[3] !== "number") return fold;
  const row = BT_WRITTEN_ROWS[fold](draft)[path[3]];
  const at = row === undefined ? path[3] : row;
  if (fold === "notes") return `note-${at}`;
  return `${fold === "services" ? "service" : "closure"}-${at}${typeof path[4] === "string" ? `-${path[4]}` : ""}`;
};

// The field a refusal is said under, from where the schema found it; null when it is not under this fold's own paths.
const btFieldOf = (fold: FoldName, path: (string | number)[], draft: unknown) => {
  const dotted = path.join(".");
  const own = BT_PATHS_OF[fold].some((p) => dotted === p || dotted.startsWith(`${p}.`));
  if (!own) return null;
  if (fold === "hours") return `hours-${path[3]}`;
  if (fold === "services" || fold === "closures" || fold === "notes") return btListField(fold, path, draft);
  if (fold === "booking_rules" || fold === "consult_first") return String(path[3]);
  if (fold === "fallbacks") return String(path[2]);
  if (fold === "calendar") return path[0] === "bookings" ? "with" : "ical_url";
  // The three boxes the create card draws; the product's own prompt and messages have none, and a refusal of them is
  // said once, as a refusal elsewhere is.
  if (fold === "receptionist") {
    const box = path[1];
    return (box !== undefined && BT_RECEPTIONIST_FIELDS[box]) || null;
  }
  return fold === "guardrails" && path[0] === "features" ? "vision" : fold;
};

/**
 * What the save's own schema refuses of a fold's draft, by the field it is under: { fieldKey: sentence }, {} when the
 * save would take it. The schema's judgement and its sentence (the bridge's saveIssues), and this file's field keys:
 * a row is named by its place in the DRAFT, which is the list the owner is looking at. The fold's part of the config
 * is judged alone, the brain or the calendar, as the bridge says why. A refusal somewhere that is not this fold's to
 * fix (a stored day that closes before it opens, met while saving the voice) would stop this save too, so it is said
 * once, as `elsewhere`, naming where the way the server's refusal does. {} until the save's rules have arrived: nothing
 * to ask.
 */
const btSchemaProblems = (fold: string, base: Config | null | undefined, draft: unknown): Problems => {
  btFoldNamed(fold);
  const next = btSaveFold(fold, base, draft);
  const issues = BUSINESS_TAB.saveIssues(fold === "calendar" ? btCalendarPart(next) : { brain: next.brain });
  const found: Problems = {};
  issues.forEach((issue) => {
    const key = btFieldOf(fold, issue.path, draft);
    if (key) {
      if (!found[key]) found[key] = btSchemaWords(issue.message);
      return;
    }
    if (found.elsewhere) return;
    const where = issue.path
      .filter((p) => typeof p === "string")
      .slice(-2)
      .join(".");
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
const btSaveProblems = (fold: string, base: Config | null | undefined, draft: unknown): Problems =>
  Object.assign({}, btSchemaProblems(fold, base, draft), btProblemsOf(fold, draft));

/** Whether a fold's draft holds changes: what it would write onto `base` is not what the draft it would open with writes. */
const btHoldsChanges = (fold: string, base: Config | null | undefined, draft: unknown) =>
  !same(btSaveFold(fold, base, draft), btSaveFold(fold, base, btDraftOf(fold, base)));

const BT_FOLD_MOVED =
  "Not saved — this changed after you opened it. Close it and open it again to see what is there now.";

/** What a fold hands the saver beside its draft: the draft it opened with, the toast, the close and the flash. */
type FoldJobInput = Pick<FoldJob, "said" | "done" | "flash"> & { opened?: unknown };

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
const btFoldJob = (fold: string, draft: unknown, job?: FoldJobInput): FoldJob => {
  btFoldNamed(fold);
  const j = job || {};
  if (j.opened === undefined) {
    throw new TypeError(
      `The ${fold} fold's job needs \`opened\`, the draft it opened with (draftOf on the saver's base).`,
    );
  }
  return {
    row: fold,
    said: j.said,
    done: j.done,
    flash: j.flash,
    patch: (config) => {
      // Nothing to write first: a draft the config already holds is refused nothing, whoever wrote it there -- a
      // colleague who saved the same words, or this fold's own save a moment ago, which changed its part too.
      if (!btHoldsChanges(fold, config, draft)) return config;
      if (!same(btDraftOf(fold, config), j.opened)) throw refusal(BT_FOLD_MOVED);
      return btSaveFold(fold, config, draft);
    },
  };
};

// Each fold's paths and keys (PATHS_OF, KEYS_OF), its helpers (draftOf, saveProblems and its two halves, saveFold,
// holdsChanges, foldJob), how much of each thing the save takes (LIMITS, and RULES: each booking rule's key, least, most
// and sentence), which sections say their block in runs (RUN_BLOCKS), the lines of a box as a save writes them
// (linesOf), and what a row's or a fold's save will tell the receptionist (willSay), and which lines of a block are new
// since the one drawn before it (changedLines). The tab's saver (saver.ts) adds them to save.tsx's.
export const FOLDS = {
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
  changedLines: btChangedLines,
};
