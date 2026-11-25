/**
 * The world the tests of folds/ share. Split by behaviour from business-tab-folds.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * A save patches; it never rebuilds.
 *
 * The editor this replaces once started its profile from {} and added the known keys back, which is not a save -- it
 * is a rebuild, and a rebuild silently deletes every key the form does not happen to render. That is how a live
 * workspace lost a 5,000-character prompt. Every fold is held to the opposite, here, before any fold can save (plan
 * Task 3.6): each fold of the Business tab opens a draft from the stored config (draftOf), is stopped by the old form's
 * own sentences (problemsOf), and writes its own paths onto the config and nothing else (saveFold). All three are
 * surfaces/settings/business/folds.ts's (with fold-shapes.ts and fold-says.ts), run on the stub React as the page tests load it; they are pure, so nothing is drawn.
 *
 * EXECUTED, never read: every claim is something a helper returned for a config it was handed.
 */
import assert from "node:assert/strict";
import { newReceptionistDefaults, resolveSystemPrompt } from "@chanlytics/contracts";
import { installStubReact } from "../../../_stub-react.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";

// The folds import what a new receptionist starts with, what the instructions box opens with, the product's wording for
// the three messages, the names in a message nothing fills in and the web-address normalizer (contracts'), so a test
// runs them as the tab does.
installStubReact();

await import("../_business-parts.mjs");

export const W = globalThis.window;

export const S = W.__businessTabSave;

// What each fold's "It will say" is asked of: every fold here must be one consequenceOf knows by name.
export const { BUSINESS_TAB, FOLD_BLOCK, loadSaveRules } =
  await import("../../../../apps/dashboard/src/bridge/business-tab.ts");

export const { setSurfaceValue, surfaceValue } =
  await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

/** The record the settings read holds now (the seam's `settings`; a window global, `__SETTINGS`, until 12 Nov 2026). */
export const settingsHeld = () => surfaceValue("settings")?.settings ?? undefined;

/** The settings read landing a record, the rest of that read as it stands (undefined: the read not landed yet). */
export const landSettings = (record) =>
  setSurfaceValue("settings", { ...(surfaceValue("settings") ?? {}), settings: record });

// And what the save's own schema refuses, which schemaProblems puts under the fold's fields: its rules here, as the tab
// has them by the time a fold is open.
await loadSaveRules();

/* ------------------------------------ the record ------------------------------------ */

/**
 * A stored config, as the settings read hands it over: Marisa's record with something in every fold, and three things
 * no form renders, which every save must leave exactly as they are: a key of the profile, a rule of booking_rules, and
 * the config's other sections. Never handed to a helper itself: each call gets its own copy (stored()), and what comes
 * back is compared with this, so a helper that wrote into the config it was handed cannot hide it.
 *
 * Three of its fields are stored the way no fold writes them back, which is what shows those folds' saves are not
 * exact (INEXACT, below): hours for two days of the seven, two guardrails of four, and a prompt from before the
 * workspace had fields, carried as its instructions.
 */
export const STORED = {
  brain: {
    business_name: "Marisa's Beauty Salon",
    booking_link: "https://book.example.com/en-us/4471902",
    system_prompt:
      "You are the WhatsApp assistant for Marisa's Beauty Salon. Lashes, brows and nails; end with [[HUMAN]] if unsure.",
    fallbacks: {
      greeting: "Hi! Thanks for reaching out to {business}.",
      error: "Sorry, something went wrong on our side.",
      non_text: "Thanks, a person will look at this.",
    },
    profile: {
      address: "1200 Maple Ave, Brooklyn, NY 11208",
      website: "https://marisasbeautysalon.example.com",
      tone: "Warm and unhurried.",
      languages: ["English", "Spanish"],
      hours: {
        mon: { open: "09:30", close: "18:00" },
        sat: {
          intervals: [
            { open: "09:30", close: "13:00" },
            { open: "14:00", close: "19:00" },
          ],
        },
      },
      closures: [{ date: "2026-12-24", until: "2026-12-26", note: "Christmas" }],
      services: [
        { name: "Balayage", duration_min: 180, price_note: "quoted at consult" },
        { name: "Highlights", duration_min: 45 },
      ],
      notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; appointments are recommended for long services." }],
      escalate_when: ["They ask for Marisa", "They are upset, or have a complaint"],
      booking_rules: {
        lead_hours: 2,
        slot_min: 30,
        party_max: 4,
        consult_first: ["Color correction", "Extensions"],
        notes: ["No bookings after 5pm on Saturdays"],
        a_rule_added_later: "keep me",
      },
      guardrails: { never_quote_prices: true, no_health_advice: true },
      handoff_number: "+12125550142",
      a_key_no_form_renders: "keep me too",
    },
  },
  calendar: { ical_url: "https://calendar.example.com/marisa/basic.ics" },
  features: { vision: false },
  notifications: { escalation_emails: ["marisa@example.com"] },
};

export const stored = () => structuredClone(STORED);

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const without = (o, key) => {
  const c = { ...o };
  delete c[key];
  return c;
};

/**
 * A copy of a config without the given dotted paths. An object the removal leaves empty goes too: a fold that empties
 * the last of its keys drops the object that held them, as the old save did, and an object holding anything else is
 * kept, so a fold that dropped one holding someone else's key is still caught.
 */
export const withoutPaths = (config, paths) => {
  const copy = structuredClone(config);
  for (const path of paths) {
    const keys = path.split(".");
    const chain = [copy];
    for (const key of keys.slice(0, -1)) {
      const next = chain[chain.length - 1][key];
      if (!next || typeof next !== "object") break;
      chain.push(next);
    }
    if (chain.length < keys.length) continue;
    delete chain[chain.length - 1][keys[keys.length - 1]];
    for (let i = chain.length - 1; i > 0 && Object.keys(chain[i]).length === 0; i--) delete chain[i - 1][keys[i - 1]];
  }
  return copy;
};

/**
 * One real change per fold, the test's own: from the draft the fold opens with (draftOf) to a changed one, and where
 * the change must land. Every fold of the brain the save file knows has one (the first test holds the two lists
 * together), so a new fold cannot arrive without proving it writes. Cold email's folds write the config's
 * reach_out section, not the brain, and tests/reach-out/settings/each-fold-writes-its-key.test.mjs holds them so.
 */
export const EDITS = {
  tone: [
    () => "Bright, and quick to the point.",
    (next) => assert.equal(next.brain.profile.tone, "Bright, and quick to the point."),
  ],
  // The phone greeting (decision 0051): the owner's line, stored with {business} for the name; the standard line stores nothing.
  phone_greeting: [
    () => "  Hi, {business}! I'm the virtual assistant. How can I help?  ",
    (next) =>
      assert.equal(next.brain.profile.phone_greeting, "Hi, {business}! I'm the virtual assistant. How can I help?"),
  ],
  hours: [
    (d) => ({ ...d, sun: { isOpen: true, shifts: [{ open: "10:00", close: "16:00" }] } }),
    (next) => assert.deepEqual(next.brain.profile.hours.sun, { open: "10:00", close: "16:00" }),
  ],
  closures: [
    (d) => [...d, { date: "2027-01-01", until: "", note: "  New Year  " }],
    (next) =>
      assert.deepEqual(next.brain.profile.closures, [
        ...STORED.brain.profile.closures,
        { date: "2027-01-01", note: "New Year" },
      ]),
  ],
  services: [
    (d) => d.map((s, i) => (i === 1 ? { ...s, name: " Full highlights ", duration_min: "60" } : s)),
    (next) =>
      assert.deepEqual(next.brain.profile.services, [
        STORED.brain.profile.services[0],
        { name: "Full highlights", duration_min: 60 },
      ]),
  ],
  languages: [
    (d) => [...d, "Portuguese"],
    (next) => assert.deepEqual(next.brain.profile.languages, ["English", "Spanish", "Portuguese"]),
  ],
  notes: [
    (d) => [...d, { title: " Parking ", text: "Behind the building." }],
    (next) =>
      assert.deepEqual(next.brain.profile.notes, [
        ...STORED.brain.profile.notes,
        { title: "Parking", text: "Behind the building." },
      ]),
  ],
  escalate_when: [
    (d) => `${d}\n  They mention a skin reaction  \n`,
    (next) =>
      assert.deepEqual(next.brain.profile.escalate_when, [
        ...STORED.brain.profile.escalate_when,
        "They mention a skin reaction",
      ]),
  ],
  booking_rules: [
    (d) => ({ ...d, lead_hours: "24", buffer_min: "10" }),
    (next) =>
      assert.deepEqual(
        [next.brain.profile.booking_rules.lead_hours, next.brain.profile.booking_rules.buffer_min],
        [24, 10],
      ),
  ],
  consult_first: [
    (d) => `${d}\nKeratin`,
    (next) =>
      assert.deepEqual(next.brain.profile.booking_rules.consult_first, ["Color correction", "Extensions", "Keratin"]),
  ],
  guardrails: [
    (d) => ({ ...d, no_health_advice: false }),
    (next) => assert.equal(next.brain.profile.guardrails.no_health_advice, false),
  ],
  extra_instructions: [
    (d) => ({ ...d, text: "  Parking is behind the building.  " }),
    (next) => {
      assert.equal(next.brain.profile.extra_instructions, "Parking is behind the building.");
      assert.equal(
        next.brain.system_prompt,
        newReceptionistDefaults(STORED.brain.business_name).system_prompt,
        "and the product's lines take the prompt's place (S4)",
      );
    },
  ],
  fallbacks: [
    (d) => ({ ...d, error: "  Sorry, a person will reply here soon.  " }),
    (next) =>
      assert.deepEqual(next.brain.fallbacks, {
        ...STORED.brain.fallbacks,
        error: "Sorry, a person will reply here soon.",
      }),
  ],
  // What the owner books with and the link's address, one fold (7 Oct 2026; they were two). The address is trimmed
  // onto the calendar's section; the tool is a section of its own (00345), since a calendar section a build from
  // before this cannot read (a tool, no address) would mute that build's receptionist.
  calendar: [
    (d) => ({ ...d, with: "booksy", ical_url: " webcal://calendar.example.com/marisa/new.ics " }),
    (next) => {
      assert.deepEqual(next.calendar, { ical_url: "webcal://calendar.example.com/marisa/new.ics" });
      assert.deepEqual(next.bookings, { tool: "booksy" });
    },
  ],
  // The create fold, drawn only where there is no receptionist; on a stored brain it writes the three it asks for, a
  // different number where one is typed, and keeps the brain's own prompt and messages.
  receptionist: [
    (d) => ({
      ...d,
      name: "  Marisa's Salon & Spa ",
      own: false,
      typed: " (646) 555-0100 ",
      link: " https://book.example/marisa ",
    }),
    (next) => {
      assert.deepEqual(
        [next.brain.business_name, next.brain.phone_display, next.brain.booking_link],
        ["Marisa's Salon & Spa", "(646) 555-0100", "https://book.example/marisa"],
      );
      assert.deepEqual(
        [next.brain.system_prompt, next.brain.fallbacks],
        [STORED.brain.system_prompt, STORED.brain.fallbacks],
        "the brain's own prompt and messages, kept",
      );
    },
  ],
};

export const FOLDS = Object.keys(EDITS);

/**
 * The folds that cannot write back exactly what they opened with, on this record, and why. Each is held to what
 * matters instead: the prompt the receptionist is given, on either channel, is the same before and after.
 */
export const INEXACT = {
  hours: "A day the record leaves out is written as {}, the closed day the schema stores. Both are said as Closed.",
  extra_instructions:
    "The prompt carried into the box is kept as the owner's words, and the product's lines take its place (S4).",
};

/** What the receptionist is told, on both channels, at one moment: the edge's own resolver. */
export const NOW = new Date("2026-09-21T15:00:00Z");

export const told = (brain) =>
  ["whatsapp", "voice"].map((channel) => resolveSystemPrompt(brain, channel, "America/New_York", NOW, {}, null));

/* ------------------------------------ a fold's save, through the tab's one saver ------------------------------------ */

export const settle = () => new Promise((r) => setImmediate(r));

/** The door the saver sends through, held open: each send waits to be accepted or refused by the test. */
export const door = () => {
  const sent = [];
  bridgeHolds({
    parts: {
      saveSettings: (config, version, onAccepted) => {
        const call = { config, version };
        sent.push(call);
        return new Promise((resolve) => {
          call.accept = () => {
            landSettings({ config, version: version + 1 });
            onAccepted({ config, version: version + 1 });
            resolve({ ok: true });
          };
          call.refuse = (message) => resolve({ ok: false, message });
        });
      },
    },
  });
  return sent;
};

export const read = (config, version = 7) => {
  S.saver.reset();
  landSettings({ config: structuredClone(config), version });
};

export const said = () => {
  const toasts = [];
  return { toasts, flash: (t) => toasts.push(t) };
};

export const wordsOf = (n) =>
  n == null || typeof n === "boolean"
    ? ""
    : typeof n === "string" || typeof n === "number"
      ? String(n)
      : Array.isArray(n)
        ? n.map(wordsOf).join("")
        : wordsOf(n.props?.children);

/** A record with a hand-written prompt and nothing the resolver composes from: the class of record that lost its prompt. */
export const PROMPT_ONLY = {
  brain: {
    business_name: "Northside Studio",
    booking_link: "https://northside.example/book",
    system_prompt: "You are the front desk of Northside Studio. ".repeat(30).trim(),
    fallbacks: { greeting: "Hi!", error: "Sorry.", non_text: "Thanks." },
  },
};

/**
 * The product's own opening lines in the OWNER'S own field, where a save before S4 copied them, over a hand-written
 * prompt from before the form -- and with no other field the resolver composes from, so that copy is the one thing
 * keeping this workspace on a composed prompt (plan Task 3.8). The live form opened it as the owner's words; the box
 * opens empty now (contracts instructionsDraft through whoseWords), and an empty box must delete nothing.
 */
export const BASELINE_IN_THE_OWNERS_FIELD = {
  brain: {
    business_name: "Northside Studio",
    booking_link: "https://northside.example/book",
    system_prompt: "You are the front desk of Northside Studio. Lashes and brows; say [[HUMAN]] if you are unsure.",
    fallbacks: { greeting: "Hi!", error: "Sorry.", non_text: "Thanks." },
    profile: {
      extra_instructions: newReceptionistDefaults("Northside Studio").system_prompt,
      guardrails: { never_quote_prices: true },
      // The reserved fictional range, as the page's own boxes use: a live business's number is configuration, never a literal.
      handoff_number: "+12125550143",
    },
  },
};

/* ------------------------------------ what only the save's schema can judge ------------------------------------ */

/**
 * The record as the save would take it. STORED carries two keys no form renders, to prove every fold leaves them be;
 * the save's schema is strict and refuses both, so what it judges here is the record without them.
 */
export const taken = () => {
  const config = stored();
  delete config.brain.profile.a_key_no_form_renders;
  delete config.brain.profile.booking_rules.a_rule_added_later;
  return config;
};

/* ------------------------------------ what a save will say ------------------------------------ */

// The settings read's own preview, built as the server builds it: willSay resolves a draft with its inputs.
export const { composePromptPreview } =
  await import("../../../../apps/dashboard/src/server/receptionist/prompt-preview.ts");

export const previewed = (config) => {
  landSettings({
    version: 7,
    config,
    prompt: composePromptPreview(config.brain, {
      tz: "America/New_York",
      policy: {},
      known: {
        workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York" },
        channels: [],
        listing: null,
      },
      openings: null,
    }),
  });
  return config;
};

export const linesOf = (text) => (text ? text.split("\n").filter((l) => l.trim() !== "") : []);
