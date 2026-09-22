/**
 * The Business tab's view models, as the bridge publishes them, and what a fold says the receptionist will be told.
 *
 * The page is untyped JSX that reads everything through `window`, so it has the tab's sentences only if the bridge
 * publishes them. And a fold's footer is worth drawing only if it is what the edge would tell the receptionist were
 * the fold saved. So every block expected here is cut from the settings read's own preview (composePromptPreview,
 * which resolves as whatsapp/inbound.ts and lib/call-start.ts do) of the same brain, with the same inputs, and never
 * recomputed the way the bridge computes it. Run, never read: the bridge is installed over a bare window and asked,
 * and its answers are compared by what they say, since the runner loads the bridge's copy of contracts apart from
 * this file's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  standingLine,
  abilityRows,
  cannotRows,
  bookingHeld,
  bookingTemplate,
  ruleStrength,
  GUARDRAIL_KEYS,
  promptBlocks,
  BrainConfigSchema,
  newReceptionistDefaults,
  hasProfile,
  PROFILE_CROSSING_WORDS,
  openWeekWords,
  closuresAheadWords,
  servicesWords,
  servicesToldWords,
  servicesSaveWords,
  blockShareWords,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  needsConsultation,
  foldName,
  serviceUndoName,
  servicesFoundWords,
  bookingRuleRefusal,
  TONE_PRESETS,
  handoffWords,
  fallbacksWords,
  guardrailsInForce,
  hoursLines,
  MAX_INTERVALS_PER_DAY,
  MAX_CLOSURES,
  PROFILE_LIMITS,
  profileRefusal,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { composePromptPreview } = await import(at("apps/dashboard/src/server/prompt-preview.ts"));

globalThis.window = {};
const W = globalThis.window;
const { installBusinessTab, FOLD_BLOCK } = await import(at("apps/dashboard/src/legacy-bridge/business-tab.ts"));
const { installInboxVerbs } = await import(at("apps/dashboard/src/legacy-bridge/inbox-verbs.ts"));
installBusinessTab();
installInboxVerbs();
const tab = W.__businessTab;

const TZ = "America/New_York";
const CHANNELS = ["whatsapp", "voice"];
/** A brain with some of its profile changed, the way a fold's save changes it. */
const profile = (brain, over) => ({ ...brain, profile: { ...brain.profile, ...over } });

/**
 * Melany's record as stored: a prompt written before the workspace had fields, not the product's baseline; no
 * number of its own to give out; its own box empty, so that prompt is carried into it; a closure long past and one
 * to come.
 */
const STORED = {
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  system_prompt:
    "You are the WhatsApp assistant for Melany's Beauty Salon. Lashes, brows and nails; end with [[HUMAN]] if unsure.",
  fallbacks: {
    greeting: "Hi! Someone will be with you shortly.",
    error: "Sorry, something went wrong on our side.",
    non_text: "Thanks, a person will look at this.",
  },
  profile: {
    tone: "Warm and unhurried.",
    languages: ["English", "Spanish"],
    address: "2581 Pitkin Ave, Brooklyn, NY 11208",
    website: "https://melanysbeautysalon.com",
    hours: { mon: { open: "09:30", close: "18:00" }, sat: { open: "09:30", close: "19:00" } },
    closures: [
      { date: "2020-01-01", note: "Long gone" },
      { date: "2099-12-24", note: "Christmas Eve" },
    ],
    services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
    notes: [{ title: "Walk-ins", text: "Walk-ins are welcome." }],
    escalate_when: ["They ask for Melany"],
    booking_rules: { lead_hours: 2, party_max: 4, consult_first: ["Color correction"] },
    guardrails: { never_quote_prices: true },
    handoff_number: "+16469325775",
  },
};
/** What the platform knows: the voice line it provisioned, and the workspace's zone. */
const KNOWN = {
  workspace: { name: "Melany's", timezone: TZ },
  channels: [{ kind: "voice", number_e164: "+13083368109", status: "active" }],
  listing: null,
};
/** The Autonomy tab holds bookings for a person to confirm. */
const POLICY = { booking: { mode: "ask" }, faq: { mode: "auto" } };
const FACTS = { tz: TZ, policy: POLICY, known: KNOWN, openings: null };

/** The settings read's preview of a brain: what `__SETTINGS.prompt` carries. */
const preview = (brain) => composePromptPreview(brain, FACTS, new Date());
/** The page's window after the settings read of a stored record. */
const settle = (stored = STORED) => {
  W.__SETTINGS = { config: { brain: stored }, prompt: preview(stored) };
};
/** The block the server's preview of a brain cuts for a row: what the edge would send, were that brain saved. */
// With the length of the whole prompt it was cut from, which a block's share of everything the receptionist reads is over.
const served = (brain, channel, row) => {
  const text = preview(brain)[channel];
  const block = promptBlocks(text, channel, brain).find((b) => b.row === row);
  return block ? { ...block, total: text.length } : null;
};

/** The real rows whose effect never reaches the cached prompt. */
// And the create fold of a workspace with no receptionist, which the settings read composes no preview for.
const NOWHERE = ["fallbacks", "calendar", "vision", "timezone", "receptionist"];

test("the bridge publishes the tab's view models, and each says what contracts says", () => {
  assert.deepEqual(Object.keys(tab).sort(), [
    "ABILITY_CHANNEL_WORDS",
    "BOOKING_RULE_HINTS",
    "CHIPS_SHOWN",
    "GUARDRAIL_KEYS",
    "POLICY_MODES",
    "PROFILE_LIMITS",
    "RULES_WITHOUT_FIELDS_WORDS",
    "TONE_PRESETS",
    "abilityRows",
    "blockShareWords",
    "bookingHeld",
    "bookingRuleRefusal",
    "bookingRulesWords",
    "bookingTemplate",
    "cannotRows",
    "capabilityStatus",
    "chipsMoreWords",
    "closuresAheadWords",
    "consequenceOf",
    "fallbacksWords",
    "foldName",
    "guardrailsInForce",
    "handoffCallWords",
    "handoffChatWords",
    "handoffWords",
    "hasProfile",
    "hoursZoneWords",
    "instructionsWords",
    "needsConsultation",
    "notesWords",
    "openWeekWords",
    "profileCrossing",
    "profileRefusal",
    "promptBlocks",
    "ruleStrength",
    "saveIssues",
    "serviceUndoName",
    "servicesFoundWords",
    "servicesSaveWords",
    "servicesToldWords",
    "servicesWords",
    "standingLine",
    "writtenOutDetail",
  ]);
  // How it answers': contracts' own, and the resolver's test of whether a record composes, never a copy of it.
  for (const p of [
    null,
    {},
    { guardrails: { disclose_ai: false } },
    { handoff_number: "+16465550100" },
    { tone: "Warm." },
    STORED.profile,
  ]) {
    assert.equal(tab.hasProfile(p), hasProfile(p), JSON.stringify(p));
  }
  assert.deepEqual(tab.TONE_PRESETS, TONE_PRESETS);
  for (const g of [undefined, {}, { never_quote_prices: false }, { no_health_advice: true }])
    assert.deepEqual(tab.guardrailsInForce(g), guardrailsInForce(g), JSON.stringify(g));
  assert.deepEqual(
    tab.handoffWords(STORED.profile.escalate_when, "+1 (646) 932-5775"),
    handoffWords(STORED.profile.escalate_when, "+1 (646) 932-5775"),
  );
  assert.equal(tab.fallbacksWords(null).own, fallbacksWords(null).own);
  assert.deepEqual(tab.standingLine(STORED), standingLine(STORED));
  // The When you're open card's two sentences with a number in them.
  assert.equal(tab.openWeekWords(STORED.profile.hours, TZ), openWeekWords(STORED.profile.hours, TZ));
  const at = new Date("2026-09-21T12:00:00Z");
  assert.deepEqual(
    tab.closuresAheadWords(STORED.profile.closures, TZ, at),
    closuresAheadWords(STORED.profile.closures, TZ, at),
  );
  assert.equal(tab.closuresAheadWords(STORED.profile.closures, TZ, at).count, 1, "the one long gone is not ahead");
  // What you offer's: the services row and sheet, and the booking rules.
  assert.deepEqual(tab.servicesWords(STORED.profile.services), servicesWords(STORED.profile.services));
  assert.equal(
    tab.servicesToldWords({ count: 33, chars: 1190, total: 4345 }),
    servicesToldWords({ count: 33, chars: 1190, total: 4345 }),
  );
  assert.equal(tab.servicesSaveWords(33), servicesSaveWords(33));
  assert.equal(tab.serviceUndoName("Balayage"), serviceUndoName("Balayage"));
  assert.equal(tab.servicesFoundWords(11, 33), servicesFoundWords(11, 33));
  assert.equal(tab.blockShareWords(1190, 4345), blockShareWords(1190, 4345));
  assert.deepEqual(
    tab.bookingRulesWords(STORED.profile.booking_rules),
    bookingRulesWords(STORED.profile.booking_rules),
  );
  assert.deepEqual(tab.BOOKING_RULE_HINTS, BOOKING_RULE_HINTS);
  for (const key of ["lead_hours", "slot_min", "buffer_min", "max_days_ahead", "party_max"])
    assert.equal(tab.bookingRuleRefusal(key), bookingRuleRefusal(key), key);
  // Every other cap a fold holds, and the sentence written from it: the page reads both here, so a number it offers up
  // to and a number it names are one number, and that one is the schema's (PROFILE_LIMITS is read off the schemas).
  assert.deepEqual(tab.PROFILE_LIMITS, PROFILE_LIMITS);
  for (const key of Object.keys(PROFILE_LIMITS)) {
    if (key === "languageMin" || key === "languageMax") continue;
    assert.equal(tab.profileRefusal(key, 3, "Monday"), profileRefusal(key, 3, "Monday"), key);
  }
  assert.equal(tab.profileRefusal("language", undefined, "Xy"), profileRefusal("language", undefined, "Xy"));
  for (const [text, link, is] of [
    ["book at https://b.example/x", "https://b.example/x", "link"],
    ["ring (646) 555-0100", "https://b.example/x", "number"],
    ["hello", "https://b.example/x", null],
  ]) {
    assert.equal(tab.writtenOutDetail(text, link), is, text);
  }
  // The rules the services sheet marks and searches by are the Calendar's and the phone tool's own.
  for (const name of ["Color correction", " color CORRECTION ", "Colour correction"])
    assert.equal(
      tab.needsConsultation(name, STORED.profile.booking_rules),
      needsConsultation(name, STORED.profile.booking_rules),
      name,
    );
  assert.equal(tab.foldName("Uñas de Gel"), foldName("Uñas de Gel"));
  const inputs = {
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasBookingTemplate: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    pauseHours: null,
    visionOn: false,
    bookingHeld: false,
    replyMode: "auto",
  };
  assert.deepEqual(tab.abilityRows(inputs), abilityRows(inputs));
  for (const smsLive of [false, true]) assert.deepEqual(tab.cannotRows({ smsLive }), cannotRows({ smsLive }));
  const policies = [null, { booking: { mode: "auto" } }, POLICY];
  assert.deepEqual(
    policies.map((p) => tab.bookingHeld(p)),
    policies.map((p) => bookingHeld(p)),
  );
  assert.equal(tab.bookingHeld(POLICY), true, "a held booking is said to be held");
  const starter = {
    name: "booking_link",
    language: "en_US",
    meta_status: "approved",
    variables: [{ position: 1 }, { position: 2 }, { position: 3 }],
  };
  assert.equal(tab.bookingTemplate([starter]), bookingTemplate([starter]));
  assert.equal(tab.bookingTemplate([starter]), starter, "the approved starter is the one a call sends the link with");
  assert.deepEqual(tab.GUARDRAIL_KEYS, GUARDRAIL_KEYS);
  for (const key of GUARDRAIL_KEYS) assert.deepEqual(tab.ruleStrength(key), ruleStrength(key), key);
  const text = preview(STORED).whatsapp;
  assert.deepEqual(tab.promptBlocks(text, "whatsapp", STORED), promptBlocks(text, "whatsapp", STORED));
});

test("the live card reads the server's composition word for word, and nothing without one (inbox-verbs.ts)", () => {
  settle();
  for (const channel of CHANNELS) {
    assert.deepEqual(
      W.__composedPrompt(channel),
      { text: W.__SETTINGS.prompt[channel], now: W.__SETTINGS.prompt.now, tz: TZ },
      channel,
    );
  }
  W.__SETTINGS = { config: { brain: STORED }, prompt: null };
  assert.equal(W.__composedPrompt("whatsapp"), null, "no receptionist to compose for");
});

test("for the record as stored, every fold shows the block the server's preview cuts for it, on both channels", () => {
  settle();
  assert.deepEqual(
    W.__SETTINGS.prompt.inputs,
    { policy: POLICY, known: KNOWN },
    "the preview carries what it was resolved with",
  );
  for (const channel of CHANNELS) {
    const cut = promptBlocks(W.__SETTINGS.prompt[channel], channel, STORED);
    for (const [section, row] of Object.entries(FOLD_BLOCK)) {
      const block = tab.consequenceOf(section, STORED, channel);
      const want = row ? (cut.find((b) => b.row === row) ?? null) : null;
      // With the whole prompt's length, which the stored record gives it on this channel.
      assert.deepEqual(
        block,
        want ? { ...want, total: W.__SETTINGS.prompt[channel].length } : null,
        `${section} on ${channel}`,
      );
      if (row) assert.ok(block, `${section} on ${channel}: this record writes a ${row} block`);
    }
  }
  // What composing the draft left out, and the edge sends.
  assert.match(
    tab.consequenceOf("tone", STORED, "whatsapp").text,
    /^Phone: \+1 \(308\) 336-8109$/m,
    "the number it gives out is the line the platform provisioned",
  );
  assert.match(
    tab.consequenceOf("guardrails", STORED, "whatsapp").text,
    /^- Booking: when someone wants to book, reschedule or cancel, do not send the booking link\./m,
    "the Autonomy tab's rule",
  );
  assert.match(
    tab.consequenceOf("hours", STORED, "voice").text,
    /^Opening hours \(all times America\/New_York\):$/m,
    "the zone the hours are in",
  );
  const closures = tab.consequenceOf("closures", STORED, "whatsapp").text;
  assert.match(closures, /Christmas Eve/);
  assert.doesNotMatch(closures, /Long gone/, "a closure that has passed is not said");
  const carried = tab.consequenceOf("extra_instructions", STORED, "whatsapp");
  assert.ok(
    carried.text.endsWith(STORED.system_prompt),
    "an empty box holds the stored prompt the resolver carries in",
  );
  assert.match(carried.note, /before it had fields/);
});

/** A change only that fold makes, the line its block then holds, and the channel it is read on. */
const EDITS = [
  [
    "business_name",
    "identity",
    (b) => ({ ...b, business_name: "Melany's Salon & Spa" }),
    "You are the assistant for Melany's Salon & Spa, answering customers over WhatsApp.",
  ],
  [
    "address",
    "identity",
    (b) => profile(b, { address: "10 Pier St, Brooklyn, NY 11201" }),
    "Address: 10 Pier St, Brooklyn, NY 11201",
  ],
  [
    "website",
    "identity",
    (b) => profile(b, { website: "https://melanys.example" }),
    "Website: https://melanys.example",
  ],
  [
    "booking_link",
    "identity",
    (b) => ({ ...b, booking_link: "https://book.example/melany" }),
    "Booking link: https://book.example/melany",
  ],
  ["phone_display", "identity", (b) => ({ ...b, phone_display: "+1 (646) 555-0100" }), "Phone: +1 (646) 555-0100"],
  ["tone", "identity", (b) => profile(b, { tone: "Brisk and exact." }), "Tone: Brisk and exact."],
  [
    "languages",
    "identity",
    (b) => profile(b, { languages: ["English", "French"] }),
    "You speak: English, French. Answer in whichever of these the caller uses",
    "voice",
  ],
  ["hours", "hours", (b) => profile(b, { hours: { mon: { open: "08:00", close: "12:00" } } }), "- Monday: 08:00–12:00"],
  [
    "closures",
    "closures",
    (b) => profile(b, { closures: [{ date: "2099-07-04", note: "Independence Day" }] }),
    "Independence Day",
  ],
  [
    "services",
    "services",
    (b) => profile(b, { services: [{ name: "Keratin", duration_min: 120 }] }),
    "- Keratin — about 120 minutes",
  ],
  [
    "booking_rules",
    "booking_rules",
    (b) => profile(b, { booking_rules: { lead_hours: 0 } }),
    "- Same-day bookings are fine, right up to the time.",
  ],
  [
    "consult_first",
    "booking_rules",
    (b) => profile(b, { booking_rules: { ...b.profile.booking_rules, consult_first: ["Perms"] } }),
    "- These need a consultation before they can be booked: Perms.",
  ],
  [
    "notes",
    "notes",
    (b) => profile(b, { notes: [{ title: "Parking", text: "Free after 6." }] }),
    "- Parking: Free after 6.",
  ],
  ["escalate_when", "handoff", (b) => profile(b, { escalate_when: ["They want a refund"] }), "- They want a refund"],
  [
    "handoff_number",
    "handoff",
    (b) => profile(b, { handoff_number: undefined }),
    "There is no line to transfer to.",
    "voice",
  ],
  [
    "guardrails",
    "guardrails",
    (b) => profile(b, { guardrails: { never_quote_prices: true, no_health_advice: true } }),
    "- Never give medical or health advice",
  ],
  [
    "extra_instructions",
    "extra_instructions",
    (b) => profile(b, { extra_instructions: "Never discuss competitors." }),
    "Never discuss competitors.",
  ],
  // A rename writes the product's opening lines again under the new name, where the stored prompt was them.
  [
    "system_prompt",
    "platform",
    (b) => ({ ...b, system_prompt: newReceptionistDefaults("Melany's Salon & Spa").system_prompt }),
    newReceptionistDefaults("Melany's Salon & Spa").system_prompt,
  ],
];

test("each fold's draft lands in the block it maps to, as the server would compose that draft", () => {
  assert.deepEqual(
    Object.keys(FOLD_BLOCK).sort(),
    [...EDITS.map((e) => e[0]), ...NOWHERE].sort(),
    "every fold and row the page has is here, once",
  );
  settle();
  for (const [section, row, edit, holds, channel = "whatsapp"] of EDITS) {
    const draft = edit(STORED);
    const block = tab.consequenceOf(section, draft, channel);
    assert.equal(block?.row, row, `${section} writes the ${row} block`);
    assert.deepEqual(block, served(draft, channel, row), `${section}: what the server would compose from the draft`);
    assert.ok(block.text.includes(holds), `${section}: ${block.text}`);
    assert.notDeepEqual(block, tab.consequenceOf(section, STORED, channel), `${section}: the draft moved it`);
  }
  // The transfer number is a call's: the chat hand-off is the same block with it or without it.
  assert.deepEqual(
    tab.consequenceOf("handoff_number", profile(STORED, { handoff_number: undefined }), "whatsapp"),
    tab.consequenceOf("handoff_number", STORED, "whatsapp"),
  );
});

test("a record that composes nothing is answered with its stored prompt: no rules, notice or hand-off block, and the prompt as it stands", () => {
  // What a save that writes only the switches leaves: nothing the resolver composes from (hasProfile).
  const RULES_ONLY = {
    ...STORED,
    system_prompt: "Answer as the front desk of Northside Studio: brief, warm, and never a price.",
    profile: {
      guardrails: { no_health_advice: true },
      booking_rules: { lead_hours: 2 },
      handoff_number: "+16469325775",
    },
  };
  settle(RULES_ONLY);
  for (const channel of CHANNELS) {
    for (const section of [
      "guardrails",
      "booking_rules",
      "consult_first",
      "escalate_when",
      "handoff_number",
      "tone",
      "hours",
    ]) {
      assert.equal(
        tab.consequenceOf(section, RULES_ONLY, channel),
        null,
        `${section} on ${channel}: the edge sends none of it`,
      );
    }
    const own = tab.consequenceOf("extra_instructions", RULES_ONLY, channel);
    assert.deepEqual(own, served(RULES_ONLY, channel, "extra_instructions"), channel);
    assert.equal(own.text, RULES_ONLY.system_prompt, "its own prompt, as it stands");
  }
});

test("an owner who clears their box is shown the stored prompt the resolver carries into it", () => {
  const OWN = profile(STORED, { extra_instructions: "Never discuss competitors." });
  settle(OWN);
  for (const cleared of [profile(OWN, { extra_instructions: "" }), profile(OWN, { extra_instructions: undefined })]) {
    for (const channel of CHANNELS) {
      const block = tab.consequenceOf("extra_instructions", cleared, channel);
      assert.deepEqual(block, served(cleared, channel, "extra_instructions"), channel);
      assert.ok(block.text.endsWith(STORED.system_prompt), block.text);
      assert.doesNotMatch(block.text, /competitors/, "their old words are gone with the box");
      assert.match(block.note, /before it had fields/);
    }
  }
});

test("no block where nothing true can be shown", () => {
  settle();
  for (const section of NOWHERE) {
    for (const channel of CHANNELS)
      assert.equal(tab.consequenceOf(section, STORED, channel), null, `${section} never reaches the prompt`);
  }
  // Only a brain the save would accept is ever told to the receptionist.
  assert.equal(
    tab.consequenceOf("booking_rules", profile(STORED, { booking_rules: { lead_hours: "" } }), "whatsapp"),
    null,
    "a notice box left empty is not a notice of ' hours'",
  );
  assert.equal(
    tab.consequenceOf("tone", { ...STORED, system_prompt: undefined }, "whatsapp"),
    null,
    "a brain the edge would refuse",
  );
  assert.equal(tab.consequenceOf("tone", undefined, "whatsapp"), null, "no brain at all");
  // Each of these reads as a stored brain, and the save refuses it: an hours fold passes through them while an owner types.
  const refused = [
    [
      "hours",
      profile(STORED, { hours: { mon: { open: "18:00", close: "09:00" } } }),
      "a Monday that closes before it opens",
    ],
    [
      "hours",
      profile(STORED, {
        hours: {
          mon: {
            intervals: [
              { open: "09:00", close: "13:00" },
              { open: "12:00", close: "18:00" },
            ],
          },
        },
      }),
      "two shifts that overlap",
    ],
    [
      "closures",
      profile(STORED, { closures: [{ date: "2099-11-31", note: "No such day" }] }),
      "a closure on 31 November",
    ],
  ];
  for (const [section, draft, what] of refused) {
    assert.equal(BrainConfigSchema.safeParse(draft).success, true, `${what} reads as a brain`);
    assert.equal(
      tab.consequenceOf(section, draft, "whatsapp"),
      null,
      `${what}: the save refuses it, so it is never told`,
    );
  }
  // An empty list composes nothing.
  assert.equal(tab.consequenceOf("notes", profile(STORED, { notes: [] }), "whatsapp"), null);
  assert.equal(tab.consequenceOf("services", profile(STORED, { services: [] }), "whatsapp"), null);
  // No preview is no inputs: a prompt resolved without its rules is a wrong prompt, not a partial one.
  W.__SETTINGS = { config: { brain: STORED }, prompt: null };
  assert.equal(tab.consequenceOf("tone", STORED, "whatsapp"), null);
  delete W.__SETTINGS;
  assert.equal(tab.consequenceOf("tone", STORED, "whatsapp"), null);
  // A preview an older server composed carries none: one still answering mid-deploy, or a dev session's cache.
  const { inputs: _inputs, ...older } = preview(STORED);
  W.__SETTINGS = { config: { brain: STORED }, prompt: older };
  assert.equal(tab.consequenceOf("tone", STORED, "whatsapp"), null, "nothing, and never a throw");
});

test("a save that crosses the resolver's line between composing and not says which way, in contracts' words", () => {
  // A sparse record: the address is the one field the resolver composes from; the rest it composes only beside it.
  const SPARSE = {
    ...STORED,
    system_prompt: newReceptionistDefaults("Bella Nails").system_prompt,
    profile: {
      address: "12 Main St, Brooklyn, NY",
      handoff_number: "+16465550100",
      booking_rules: { lead_hours: 2 },
      guardrails: { never_quote_prices: true },
    },
  };
  const BARE = {
    ...SPARSE,
    profile: {
      handoff_number: "+16465550100",
      booking_rules: { lead_hours: 2 },
      guardrails: { never_quote_prices: true },
    },
  };
  assert.deepEqual(
    [hasProfile(SPARSE.profile), hasProfile(BARE.profile)],
    [true, false],
    "the fixtures stand either side of the line",
  );

  // Emptying the last field it composes from: the prompt the edge would send falls back to the stored one.
  const stops = tab.profileCrossing(SPARSE, BARE);
  assert.deepEqual(stops, { crossing: "stops", sentence: PROFILE_CROSSING_WORDS.stops });
  const before = preview(SPARSE).whatsapp;
  const after = preview(BARE).whatsapp;
  assert.ok(
    before.includes("[[HUMAN]]") && !after.includes("[[HUMAN]]"),
    "which is what the words warn of: the hand-off token goes with it",
  );
  assert.ok(after.length < before.length / 2, `${before.length} characters to ${after.length}`);

  // Typing the first: the prompt starts composing, with the stored one carried in beneath.
  assert.deepEqual(tab.profileCrossing(BARE, SPARSE), { crossing: "starts", sentence: PROFILE_CROSSING_WORDS.starts });
  assert.ok(preview(SPARSE).whatsapp.includes(SPARSE.system_prompt), "the instructions it follows today, carried in");

  // Nothing crossed, nothing said; and nothing said of a save that will not go, or with no stored brain to compare.
  assert.equal(tab.profileCrossing(BARE, profile(BARE, { handoff_number: "+16465550199" })), null);
  assert.equal(tab.profileCrossing(STORED, profile(STORED, { address: "10 Pier St" })), null, "still composing");
  assert.equal(tab.profileCrossing(STORED, { ...STORED, system_prompt: undefined }), null, "a brain the save refuses");
  for (const none of [null, undefined]) assert.equal(tab.profileCrossing(none, STORED), null, "no stored brain");

  // Judged against the brain it is handed, which is the one the save goes on (the page's saver's base), and never the
  // settings read: that is an older brain whenever another save is out, or taken and not read back yet.
  settle(SPARSE);
  assert.deepEqual(
    tab.profileCrossing(BARE, SPARSE),
    { crossing: "starts", sentence: PROFILE_CROSSING_WORDS.starts },
    "the read composes; the brain handed does not",
  );
  settle(BARE);
  assert.deepEqual(tab.profileCrossing(SPARSE, BARE), stops);
});

test("a fold it does not know, or a channel that is not one, is refused by name", () => {
  settle();
  assert.throws(() => tab.consequenceOf("not_a_fold", STORED, "whatsapp"), {
    name: "TypeError",
    message: /"not_a_fold"/,
  });
  assert.throws(
    () => tab.consequenceOf("toString", STORED, "whatsapp"),
    { name: "TypeError", message: /"toString"/ },
    "a name every object has is not a fold",
  );
  assert.throws(() => tab.consequenceOf("tone", STORED, "sms"), { name: "TypeError", message: /"sms"/ });
  assert.throws(
    () => tab.consequenceOf("tone", STORED),
    { name: "TypeError", message: /not undefined/ },
    "the channel is never assumed",
  );
});

test("the mockup's bundle publishes the same helpers and never bundles the bridge's api (serve-legacy.mjs)", async () => {
  const { businessTabBundle } = await import("../serve-legacy.mjs");
  const js = await businessTabBundle();
  assert.ok(!js.includes("legacy-bridge/api.ts"), "a browser bundle with no session behind it");
  const win = {};
  // URL as every browser has it: the brain's links are checked with it before a draft is resolved.
  vm.runInNewContext(js, { window: win, console, Date, Intl, URL });
  assert.deepEqual(Object.keys(win.__businessTab).sort(), Object.keys(tab).sort(), "installed at load");
  assert.equal(
    win.__businessTab.consequenceOf("guardrails", STORED, "voice"),
    null,
    "with no settings read behind it, no fold is told anything",
  );
  win.__SETTINGS = { prompt: preview(STORED) };
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(
    plain(win.__businessTab.consequenceOf("guardrails", STORED, "voice")),
    plain(served(STORED, "voice", "guardrails")),
  );
  // And the two the page reads beside it, so the page mounted on the mockup says the week and keeps the caps the app
  // does: the composer's own run-collapsing (never a hand port of it in bridge-stubs.jsx) and the write schema's caps.
  for (const hours of [
    STORED.profile.hours,
    {},
    {
      mon: {
        intervals: [
          { open: "09:00", close: "12:00" },
          { open: "13:00", close: "17:00" },
        ],
      },
    },
  ]) {
    assert.deepEqual(plain(win.__hoursLines(hours)), hoursLines(hours), JSON.stringify(hours));
  }
  assert.deepEqual(plain(win.__configLimits), { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES });
});

test("the app's bridge publishes the week's lines and the caps with the tab's helpers, where the page reads them", () => {
  // Published once, by installBusinessTab, which the app and the mockup's bundle both run: inbox-verbs.ts published
  // them to the app alone, so the page mounted on the mockup said "Not set" over a week that had hours.
  const win = globalThis.window;
  const was = { lines: win.__hoursLines, limits: win.__configLimits };
  try {
    delete win.__hoursLines;
    delete win.__configLimits;
    installInboxVerbs();
    assert.equal(win.__hoursLines, undefined, "no second publisher");
    assert.equal(win.__configLimits, undefined);
    installBusinessTab();
    assert.deepEqual(win.__hoursLines(STORED.profile.hours), hoursLines(STORED.profile.hours));
    assert.deepEqual(win.__configLimits, { maxIntervalsPerDay: MAX_INTERVALS_PER_DAY, maxClosures: MAX_CLOSURES });
  } finally {
    win.__hoursLines = was.lines;
    win.__configLimits = was.limits;
  }
});

test("saveIssues says what the save's own schema refuses in a part of the config, each with where it is and the schema's sentence", () => {
  assert.deepEqual(tab.saveIssues({ brain: STORED }), [], "a brain the save would take has none");
  const overlapping = {
    ...STORED,
    profile: {
      ...STORED.profile,
      hours: {
        mon: {
          intervals: [
            { open: "09:00", close: "13:00" },
            { open: "12:00", close: "18:00" },
          ],
        },
      },
    },
  };
  const issues = tab.saveIssues({ brain: overlapping });
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].path.slice(0, 4), ["brain", "profile", "hours", "mon"]);
  assert.match(issues[0].message, /Monday: two shifts overlap/);
  // The part is parsed as it is handed over: the calendar alone, for a fold that writes nothing in the brain.
  const feed = tab.saveIssues({ calendar: { ical_url: "https://localhost/feed.ics" } });
  assert.deepEqual(
    feed.map((i) => i.path),
    [["calendar", "ical_url"]],
  );
  assert.deepEqual(tab.saveIssues(undefined), [], "nothing to judge is nothing refused");
});
