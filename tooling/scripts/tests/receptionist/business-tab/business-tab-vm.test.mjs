/**
 * The Business tab's sentence tables, as pure functions: a fact's tone, how far a rule goes, the
 * gap line, what the receptionist can do, and what it cannot. The prompt view
 * is prompt-blocks.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILE_LIMITS,
  profileRefusal,
  writtenOutDetail,
  BrainConfigSchema,
  ClosureSchema,
  MAX_CLOSURES,
  MAX_INTERVALS_PER_DAY,
  stateOf,
  SOURCE_WORDS,
  ruleStrength,
  VISION_SWITCH_WORDS,
  GUARDRAIL_KEYS,
  ALWAYS_TOLD,
  ALWAYS_ON,
  guardrailsInForce,
  rulesKept,
  RULES_AT_REST_WORDS,
  businessGap,
  ABILITY_CHANNEL_WORDS,
  abilityRows,
  cannotRows,
  POLICY_MODES,
  POLICY_MODE_WORDS,
  bookingHeld,
  policyAskClass,
  openWeekWords,
  closuresAheadWords,
  closureDatesLabel,
  closuresFrom,
  servicesWords,
  servicesToldWords,
  serviceUndoName,
  servicesFoundWords,
  blockShareWords,
  promptCostWords,
  promptTotalWords,
  PROMPT_READERS,
  PROMPT_NOW,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  bookingRuleRefusal,
  needsConsultation,
  BookingRulesSchema,
  BOOKING_DEFAULTS,
  TONE_PRESETS,
  handoffWords,
  handoffChatWords,
  handoffChatRow,
  handoffCallRow,
  HANDOFF_ANYWAY,
  notesWords,
  noteEndedWords,
  composeSystemPrompt,
  instructionsWords,
  fallbacksWords,
  RULES_WITHOUT_FIELDS_WORDS,
  rulesWithoutFieldsWords,
  NO_FIELDS_COMPOSED_WORDS,
  BusinessProfileSchema,
  FALLBACK_DEFAULTS,
  INSTRUCTIONS_MAX,
  promptBlocks,
  resolveSystemPrompt,
} from "@chanlytics/contracts";

/* ---- A fact says where it came from ---- */

test("a fact's source carries a tone and the words facts.ts already wrote", () => {
  assert.equal(stateOf("fact", "verified").tone, "ok");
  assert.equal(stateOf("fact", "provisioned").tone, "ok");
  assert.equal(stateOf("fact", "typed").tone, "plain");
  assert.equal(stateOf("fact", "workspace").tone, "plain");
  assert.equal(stateOf("fact", "absent").tone, "plain");
  assert.equal(stateOf("fact", "disputed").tone, "warn");
  // One copy of the words: the pill reads facts.ts, it does not restate it. Every
  // source is checked, or the claim holds for two of five and nobody would know.
  for (const source of ["verified", "provisioned", "workspace", "typed", "absent"]) {
    assert.equal(stateOf("fact", source).label, SOURCE_WORDS[source], `${source} reads its words from facts.ts`);
  }
  assert.equal(stateOf("fact", "disputed").label, "doesn't match");
});

test("a source nobody has registered falls back rather than throwing", () => {
  // stateTone's contract, and the reason FACT_SOURCE_TONE is typed: a sixth
  // FactSource would fail to compile there rather than landing here.
  assert.deepEqual(stateOf("fact", "imported_from_somewhere"), { tone: "plain", label: "imported_from_somewhere" });
});

/* ---- A rule says how far it goes ---- */

test("the four rules carry three different guarantees", () => {
  assert.equal(ruleStrength("never_confirm_booking").strength, "structural");
  assert.equal(ruleStrength("never_quote_prices").strength, "checked");
  assert.equal(ruleStrength("disclose_ai").strength, "instructed");
  assert.equal(ruleStrength("no_health_advice").strength, "instructed");
  // Every key the editor writes has a strength, and no key has one it does not write.
  assert.deepEqual([...GUARDRAIL_KEYS].sort(), [
    "disclose_ai",
    "never_confirm_booking",
    "never_quote_prices",
    "no_health_advice",
  ]);
  for (const k of GUARDRAIL_KEYS) {
    const r = ruleStrength(k);
    assert.ok(r.chip.length > 0 && r.sentence.length > 0, `${k} needs a chip and a sentence`);
  }
  // The structural one says the switch does not decide it.
  // It said "There is no appointments table in this product", which stopped being true the day a booking tool's
  // emails became appointments on the record (00345). What holds is what it cannot do.
  assert.match(ruleStrength("never_confirm_booking").sentence, /^It can't make, move or cancel a booking anyway\./);
  assert.match(ruleStrength("never_confirm_booking").sentence, /Off only stops it being told not to claim it did\./);
  assert.doesNotMatch(ruleStrength("never_confirm_booking").sentence, /no appointments table/i);
  // The checked one names both channels, because they differ -- and it names them in
  // checkedOn, not in the sentence: the page draws both, so a sentence that said the
  // channels too would print the same fact twice on one row.
  const priced = ruleStrength("never_quote_prices");
  assert.equal(priced.checkedOn?.length, 2);
  assert.deepEqual(
    priced.checkedOn.map((c) => c.channel),
    ["whatsapp", "voice"],
  );
  // On chat a draft sits in between, so the swap happens before anyone reads it.
  assert.match(priced.checkedOn[0].words, /before the customer sees it/i);
  // On a call there is no before. Saying there is would be the one dishonest sentence
  // on a page whose whole point is that these four rules are not equivalent.
  assert.doesNotMatch(priced.checkedOn[1].words, /before/i);
  assert.match(priced.checkedOn[1].words, /already heard/i);
  // What always holds is that the owner is told; the correction is what the product can ALSO do while the call is
  // still reachable. The line said the correction flatly, which is not true of a call whose turns are not delivered.
  assert.match(priced.checkedOn[1].words, /You're told/);
  assert.match(priced.checkedOn[1].words, /if the caller is still on/i);
  assert.doesNotMatch(priced.sentence, /WhatsApp|call/i);
  // Each line opens with the channel's name, and that name is the one the abilities card's glyphs already carry:
  // one spelling per channel on one page. The stored value ("whatsapp") is never what an owner reads.
  assert.deepEqual(
    priced.checkedOn.map((c) => c.label),
    ["In chat", "On a call"],
  );
  for (const c of priced.checkedOn) assert.equal(c.label.toLowerCase(), ABILITY_CHANNEL_WORDS[c.channel].has);
  // And only the checked rule has channels to draw: the other three land the same way on both.
  for (const k of GUARDRAIL_KEYS) {
    if (k !== "never_quote_prices") assert.equal(ruleStrength(k).checkedOn, null, k);
  }
});

test("the photo switch is its ability's, in words of its own, and no rule's strength (18 Oct 2026)", () => {
  // It sat in the rules fold, among the limits it keeps, though it gives the receptionist something; What it can do
  // listed it with a door into that fold. The switch is on the ability's row now, and says what it did once it lands.
  assert.equal(VISION_SWITCH_WORDS.label, "Look at a photo");
  assert.equal(VISION_SWITCH_WORDS.saved(true), "Photos on: it says what it sees.");
  assert.equal(VISION_SWITCH_WORDS.saved(false), "Photos off: a photo goes to a person.");
  for (const k of GUARDRAIL_KEYS) assert.notEqual(ruleStrength(k).strength, "power", k);
});

test("a price nobody wrote is caught whatever the switch says, and the rule says what off allows", () => {
  // Decision 0051 (11 Oct 2026) reversed the 20 Sep decision: off, it may say the prices the owner wrote, and only
  // those. The detector -- priceBreach on a chat reply, spokenBreach on a call -- reads every reply either way.
  const s = ruleStrength("never_quote_prices").sentence;
  assert.match(s, /Every reply is checked for a price/);
  assert.match(s, /On, it says none; off, it may say the ones you've written, and any other is swapped out\./);
  // What the detector actually knows (policy.ts PRICE_PATTERNS): euros and pounds pass it.
  assert.match(s, /dollars or pesos/);
  assert.doesNotMatch(s, /WhatsApp|call/i, "the channels are checkedOn's to say");
});

test("the row at rest names only what the receptionist actually keeps", () => {
  const all = { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true };
  // A record whose details compose: every rule in force is a line it reads, so every one is named -- but the price
  // rule, which is a row of its own beside this one (choices.ts), and photos, an ability (18 Oct 2026).
  assert.deepEqual(rulesKept({ rules: all, composes: true }), [
    "Never confirms a booking",
    "Says it's an assistant",
    "No health advice",
  ]);
  // Said once: the price row says what it says of prices, whichever way the rule is.
  for (const never_quote_prices of [true, false]) {
    const kept = rulesKept({ rules: { ...all, never_quote_prices }, composes: true });
    assert.ok(!kept.some((w) => /price/i.test(w)), String(never_quote_prices));
  }
  // A told-and-trusted rule is a line in a prompt and nothing else, so switching it off takes the word with it.
  const noHealth = rulesKept({ rules: { ...all, no_health_advice: false }, composes: true });
  assert.equal(noHealth.length, 2);
  // Saying it is an assistant is always on (ALWAYS_TOLD): named whatever a row stores.
  assert.ok(rulesKept({ rules: { ...all, disclose_ai: false }, composes: true }).includes("Says it's an assistant"));
  // And the booking rule is in force whatever a row stores (guardrailsInForce): a stored false reads as on.
  assert.equal(guardrailsInForce({ never_confirm_booking: false }).never_confirm_booking, true);
  assert.ok(ALWAYS_ON.has("never_confirm_booking") && ALWAYS_ON.has("disclose_ai") && ALWAYS_ON.size === 2);
});

test("M-2: on a record that composes nothing the row names only what holds, and never a line it does not read", () => {
  // The resolver hands such a record its stored prompt plus Autonomy's rules (config.ts resolveSystemPrompt's
  // no-profile branch), so none of the four is a line it reads. The fold says that once
  // (RULES_WITHOUT_FIELDS_WORDS); the row at rest says nothing it cannot back, which leaves the two that hold
  // whatever it is told: the detector, and the appointments table that does not exist; and the one line every prompt
  // carries, stored or composed (decision 0051): that it is an automated assistant.
  const all = { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true };
  assert.deepEqual(rulesKept({ rules: all, composes: false }), ["Cannot book anything", "Says it's an assistant"]);
  // Every switch off changes nothing about it: none of the two is the switch's to decide.
  const none = { never_quote_prices: false, never_confirm_booking: false, disclose_ai: false, no_health_advice: false };
  assert.deepEqual(rulesKept({ rules: none, composes: false }), ["Cannot book anything", "Says it's an assistant"]);
  // And it is derived from the three strengths, not a second list to keep in step: a rule that is only instructed is
  // named at rest only where the record composes it.
  for (const key of GUARDRAIL_KEYS) {
    const named = rulesKept({ rules: all, composes: false }).length;
    assert.equal(named, 2, key);
    if (ruleStrength(key).strength === "instructed" && !ALWAYS_TOLD.has(key)) {
      assert.ok(!rulesKept({ rules: all, composes: false }).includes(RULES_AT_REST_WORDS[key]), key);
    }
  }
});

test("rulesKept refuses an input the page left out, rather than naming a rule it cannot back", () => {
  const all = { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true };
  assert.throws(() => rulesKept({ rules: all }), TypeError, "composes");
  assert.throws(() => rulesKept({ rules: null, composes: true }), TypeError, "the rules themselves");
  assert.throws(
    () => rulesKept({ rules: { ...all, disclose_ai: undefined }, composes: true }),
    TypeError,
    "a rule read as false is a rule the row silently drops",
  );
});

/* ---- The gap line ---- */

const full = {
  business_name: "Marisa's Beauty Salon",
  booking_link: "https://book.example.com/en-us/4471902",
  profile: {
    address: "1200 Maple Ave, Brooklyn, NY 11208",
    tone: "Warm and unhurried.",
    hours: { mon: { open: "09:30", close: "18:00" } },
    services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
    escalate_when: ["They ask for Marisa"],
    guardrails: { never_quote_prices: true },
  },
};

test("a full record has no gap, and the page says nothing above its cards", () => {
  assert.equal(businessGap(full), null, "a full record is missing nothing");
});

test("the gap names the one thing missing, and the row that adds it", () => {
  const noVoice = { ...full, profile: { ...full.profile, tone: undefined } };
  const gap = businessGap(noVoice);
  assert.match(gap.sentence, /no voice of its own/i);
  assert.equal(gap.row, "tone");
  assert.equal(gap.sentence.split(".").filter((p) => p.trim() !== "").length, 1, "one sentence");
});

test("a record with nothing names only its first gap", () => {
  assert.equal(businessGap({ business_name: "", booking_link: "", profile: {} }).row, "name");
});

/* ---- What it can do: one card, every ability, what each runs on ---- */

const live = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  pauseHours: 24,
  visionOn: false,
  bookingHeld: false,
  replyMode: "auto",
};
const idOf = (vm) => Object.fromEntries(vm.rows.map((r) => [r.id, r]));

test("an ability names its channels and the row it runs on", () => {
  const rows = abilityRows({
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: false,
    hasBookingTemplate: true,
    pauseHours: 24,
    bookingHeld: false,
    replyMode: "auto",
  }).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  assert.deepEqual(byId.open_times.channels, { voice: true, whatsapp: true });
  assert.match(byId.open_times.detail, /at that moment/i, "the phone asks live; chat is handed a snapshot");
  assert.equal(byId.open_times.runsOn.row, "calendar");

  assert.match(byId.booking_link.detail, /caller's WhatsApp/i, "it goes by WhatsApp, never by text");

  assert.deepEqual(byId.transfer.channels, { voice: true, whatsapp: false });
  assert.deepEqual(byId.handoff.channels, { voice: false, whatsapp: true });

  assert.equal(byId.vision.on, false);
});

test("an ability whose input is missing says which row to fill", () => {
  const rows = abilityRows({
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: false,
    hasBookingLink: true,
    hasHandoffNumber: false,
    hasEscalateWhen: true,
    visionOn: false,
    hasBookingTemplate: true,
    pauseHours: 24,
    bookingHeld: false,
    replyMode: "auto",
  }).rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.open_times.ready, false);
  assert.equal(byId.transfer.ready, false);
  assert.match(byId.transfer.detail, /takes a message/i);
});

test("nothing is ready on a channel that is not answering", () => {
  // The contract the doc comment states. An input filled against a dead line is a
  // setting, not an ability: a workspace with nothing picking up must not be told
  // its receptionist sends the booking link.
  const dark = abilityRows({
    voiceLive: false,
    whatsappLive: false,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: true,
    hasBookingTemplate: true,
    pauseHours: 24,
    bookingHeld: false,
    replyMode: "auto",
  }).rows;
  for (const r of dark) assert.equal(r.ready, false, `${r.id} cannot be ready with nothing answering`);
  // And a phone-only workspace has no chat abilities, whatever is filled in.
  const phoneOnly = abilityRows({
    voiceLive: true,
    whatsappLive: false,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: true,
    hasBookingTemplate: true,
    pauseHours: 24,
    bookingHeld: false,
    replyMode: "auto",
  }).rows;
  const byId = Object.fromEntries(phoneOnly.map((r) => [r.id, r]));
  assert.equal(byId.handoff.ready, false, "there is no thread to hand over");
  assert.equal(byId.vision.ready, false, "and no photo to look at");
  assert.equal(byId.transfer.ready, true, "but a caller can still be put through");
});

test("what it records, and how far ahead chat looks, are said as they are", () => {
  // facts_used is the chat brain's; describeOpenings hands chat up to five days.
  assert.match(idOf(abilityRows(live)).answer.detail, /In chat it also records which facts it leaned on/);
  assert.match(idOf(abilityRows(live)).open_times.detail, /next few days' openings/);
});

test("with no calendar it does not guess at times, and promises the link only where the link can go", () => {
  // The link goes where the booking-link row is ready: WhatsApp connected, a link to send, and
  // bookings not held on the Autonomy tab. Anywhere else "it sends the link instead" is not true.
  const noFeed = { ...live, hasCalendarFeed: false };
  const row = idOf(abilityRows(noFeed)).open_times;
  assert.equal(row.detail, "No calendar to read, so it does not guess at open times — it sends the link instead.");
  assert.equal(row.ready, false);
  for (const [what, shape] of [
    ["no WhatsApp", { ...noFeed, whatsappLive: false }],
    ["no link", { ...noFeed, hasBookingLink: false }],
    ["bookings held", { ...noFeed, bookingHeld: true }],
  ]) {
    assert.equal(
      idOf(abilityRows(shape)).open_times.detail,
      "No calendar to read, so it does not guess at open times.",
      what,
    );
  }
});

test("with a calendar, the link follows the times only where it can go", () => {
  assert.match(idOf(abilityRows(live)).open_times.detail, /It offers up to three that fit, then the link\.$/);
  // A phone-only workspace offers times on a call, and has no way to send the link after them.
  assert.match(
    idOf(abilityRows({ ...live, whatsappLive: false })).open_times.detail,
    /It offers up to three that fit\.$/,
  );
  // With bookings held, the call's tool offers no times (retell-availability.ts) while the call
  // starts with the openings (call-start.ts) and chat is handed them; a request to book gets no link on either.
  const held = idOf(abilityRows({ ...live, bookingHeld: true })).open_times;
  assert.equal(
    held.detail,
    "It is handed the openings on a call and in chat, but your Autonomy tab holds bookings for you to confirm, so when someone asks to book, no link follows.",
  );
});

test("with both lines and no approved message, the link that follows the times is chat's alone (M-3)", () => {
  // linkGoes asked only whether the LINK could go at all -- a booking link, WhatsApp connected,
  // bookings not held -- and never whether the CALL could send it. So a workspace on both lines
  // with no approved booking-link template was told, on the row about a call asking the calendar,
  // that the call offers times "then the link". outbound-gate refuses that send (retell-fn's
  // deliver needs the template), and the booking-link row two lines down already says so.
  const noTemplate = { ...live, hasBookingTemplate: false };
  assert.match(
    idOf(abilityRows(noTemplate)).open_times.detail,
    /It offers up to three that fit, then the link in chat\.$/,
  );
  assert.equal(
    idOf(abilityRows({ ...noTemplate, hasCalendarFeed: false })).open_times.detail,
    "No calendar to read, so it does not guess at open times — in chat it sends the link instead.",
  );
  // A workspace with no call to speak of needs no such clause: there is only chat to send it on.
  assert.match(
    idOf(abilityRows({ ...noTemplate, voiceLive: false })).open_times.detail,
    /It offers up to three that fit, then the link\.$/,
  );
  assert.equal(
    idOf(abilityRows({ ...noTemplate, voiceLive: false, hasCalendarFeed: false })).open_times.detail,
    "No calendar to read, so it does not guess at open times — it sends the link instead.",
  );
});

test("on WhatsApp alone, the link goes in the thread", () => {
  const b = idOf(abilityRows({ ...live, voiceLive: false })).booking_link;
  assert.equal(b.detail, "It sends it in the thread.");
  assert.equal(b.ready, true);
  assert.deepEqual(b.channels, { voice: false, whatsapp: true });
});

test("the booking link goes by WhatsApp, so a phone-only workspace cannot send it", () => {
  // send_booking_link delivers a WhatsApp template to the caller's WhatsApp; it never
  // sends an SMS, which is not sold. The first draft said "texts it", and drew it ready
  // on a phone-only workspace with no way to send anything at all.
  const phoneOnly = idOf(abilityRows({ ...live, whatsappLive: false })).booking_link;
  assert.equal(phoneOnly.ready, false);
  assert.equal(phoneOnly.channels.voice, false, "the call cannot send it without WhatsApp");
  assert.match(phoneOnly.detail, /WhatsApp, which isn't connected/i);

  const noTemplate = idOf(abilityRows({ ...live, hasBookingTemplate: false })).booking_link;
  assert.equal(noTemplate.ready, true, "chat can still send it in the thread");
  assert.equal(noTemplate.channels.voice, false, "but a call cannot, without an approved message");
  assert.match(noTemplate.detail, /approved booking-link message/i);

  const full = idOf(abilityRows(live)).booking_link;
  assert.equal(full.channels.voice, true);
  assert.match(full.detail, /caller's WhatsApp, when their number has one/i);

  for (const shape of [live, { ...live, whatsappLive: false }, { ...live, hasBookingTemplate: false }]) {
    assert.doesNotMatch(
      idOf(abilityRows(shape)).booking_link.detail,
      /\btexts?\b/i,
      "never 'text': texting is not sold",
    );
  }
});

test("a transfer happens during opening hours, and it stays on the line", () => {
  const t = idOf(abilityRows(live)).transfer;
  assert.match(t.detail, /during opening hours/i);
  assert.match(t.detail, /stays on until someone picks up/i);
  assert.match(t.detail, /outside them, or if nobody answers, it takes a message/i);
  assert.doesNotMatch(t.detail, /steps out/i);
});

test("a hand-off is a pause that ends, and it says how long", () => {
  // It pauses the thread for pause_hours and no longer; after that the receptionist
  // answers the next message itself, whatever the Inbox says. The first draft said it
  // would never pick the thread back up.
  const said = (h) => idOf(abilityRows({ ...live, pauseHours: h })).handoff.detail;
  assert.match(said(24), /holds off for a day, then answers the customer's next message itself/i);
  assert.match(said(4), /holds off for 4 hours/);
  assert.match(said(72), /holds off for 3 days/);
  assert.match(said(1), /holds off for an hour/);
  assert.doesNotMatch(said(24), /will not pick/i);
  // The reasons widen a hand-off; they do not switch it on.
  const noReasons = idOf(abilityRows({ ...live, hasEscalateWhen: false })).handoff;
  assert.equal(noReasons.ready, true, "it hands over on a request for a person with no reasons set");
  assert.match(noReasons.detail, /asks for a person or it can't help/i);
});

test("a hand-off holds off as long as the Autonomy tab says, and a day when nothing is stored", () => {
  // pauseHours is the Autonomy reply row's pause_hours as stored, read the way that pane reads
  // it (hardLimitsWords) and the way the edge applies it (inbound.ts: nothing, null or 0 is the
  // 24-hour default). Nothing stored is the common case, and it read "holds off for NaN hours";
  // null and 0 read "an hour" where the product holds a day.
  const said = (h) => idOf(abilityRows({ ...live, pauseHours: h })).handoff.detail;
  for (const unset of [undefined, null, 0, ""])
    assert.match(said(unset), /holds off for a day,/, JSON.stringify(unset));
  assert.match(said(4), /holds off for 4 hours,/);
  assert.match(said(72), /holds off for 3 days,/);
  // Every value the Autonomy pane offers (settings.jsx AUT_PAUSE: 1h, 4h, 12h, 24h, 3d).
  const pane = { 1: "an hour", 4: "4 hours", 12: "12 hours", 24: "a day", 72: "3 days" };
  for (const [hours, words] of Object.entries(pane))
    assert.match(said(Number(hours)), new RegExp(`holds off for ${words},`), `${hours}h`);
  for (const h of [undefined, null, 0, 1, 4, 12, 24, 72]) assert.doesNotMatch(said(h), /NaN/);
});

test("with the owner's reasons, a hand-off still happens when it can't help", () => {
  // The composer hands over whenever the customer asks for a person or asks something the
  // instructions do not cover, "and whenever" the owner's reasons apply. The reasons widen it.
  assert.match(
    idOf(abilityRows(live)).handoff.detail,
    /^On your reasons, or when a customer asks for a person or it can't help, it stops answering/,
  );
});

test("with bookings held on the Autonomy tab, the link is not ready, and the row says who holds it", () => {
  // Booking not on auto: a chat reply has the link taken back out (steps.ts layerTwo), and
  // the call's send is refused (outbound-gate.ts, booking_needs_a_person). The row said ready,
  // and "sends it".
  const held = idOf(abilityRows({ ...live, bookingHeld: true })).booking_link;
  assert.equal(held.ready, false);
  assert.equal(
    held.detail,
    "Your Autonomy tab holds bookings for you to confirm, so when someone asks to book, it sends no link: it tells them someone from the team will confirm.",
  );
  // Missing the link, or WhatsApp, is still said first: those are what the page can fix here.
  assert.match(
    idOf(abilityRows({ ...live, bookingHeld: true, hasBookingLink: false })).booking_link.detail,
    /^No booking link, so it takes their details/,
  );
  assert.match(
    idOf(abilityRows({ ...live, bookingHeld: true, whatsappLive: false })).booking_link.detail,
    /WhatsApp, which isn't connected/,
  );
  // The page computes the input with the predicate the edge asks (policyAskClass, retell-fn.ts):
  // any mode but auto holds it, fail safe, and the Replies row is not the Booking row.
  const policies = [
    null,
    {},
    { booking: { mode: "auto" } },
    { booking: { mode: "ask" } },
    { booking: { mode: "never" } },
    { booking: { mode: "veto" } },
    { reply: { mode: "ask" } },
    { faq: { mode: "ask" } },
  ];
  assert.deepEqual(policies.map(bookingHeld), [false, false, false, true, true, true, false, false]);
  for (const p of policies) assert.equal(bookingHeld(p), policyAskClass(p, "booking") === "booking", JSON.stringify(p));
});

test("with replies held on the Autonomy tab, every chat ability is dark and the card says why once", () => {
  // Task 4.1b. On ask or never the WhatsApp receptionist composes no reply at all
  // (core/inbound/context.ts through replyPosture) and a call's booking-link send is refused
  // (packages/core/src/messages/outbound-gate.ts, policy_hold). Six rows would otherwise all read ready at once.
  for (const mode of ["ask", "never"]) {
    const vm = abilityRows({ ...live, replyMode: mode });
    for (const r of vm.rows) assert.equal(r.channels.whatsapp, false, `${r.id} has no chat on ${mode}`);
    const rows = idOf(vm);
    assert.equal(rows.handoff.ready, false, "there is no reply to hand over");
    assert.equal(rows.vision.ready, false);
    assert.equal(rows.booking_link.ready, false);
    assert.equal(rows.booking_link.channels.voice, false, "the call's send is refused too");
    // A call is untouched: it answers, and it puts a caller through.
    assert.deepEqual(rows.transfer.channels, { voice: true, whatsapp: false });
    assert.equal(rows.transfer.ready, true);
    assert.equal(rows.answer.ready, true);
    assert.ok(vm.held, `${mode} is held`);
    assert.equal(vm.held.to, "admin/autonomy");
    // The door's words are contracts' too: the page draws the sentence and the door, and types neither.
    assert.equal(vm.held.door, "Your Autonomy tab");
    assert.ok(vm.held.sentence.includes("Autonomy tab"), "and the sentence names the tab the door goes to");
    // The pane's own words for the mode, never the stored value (legacy/CLAUDE.md #657).
    assert.ok(vm.held.sentence.includes(POLICY_MODE_WORDS[mode].chip), vm.held.sentence);
    assert.ok(vm.held.sentence.includes(POLICY_MODE_WORDS[mode].sub), vm.held.sentence);
    const said = vm.held.sentence.toLowerCase().split(/[^a-z]+/);
    for (const stored of POLICY_MODES)
      assert.ok(!said.includes(stored), `${stored} is a filing word, not one to read: ${vm.held.sentence}`);
  }
  // With no call, the card promises nothing about one.
  assert.doesNotMatch(abilityRows({ ...live, replyMode: "ask", voiceLive: false }).held.sentence, /call/i);
});

test("on Sends it or Holds it, nothing is held and the card says nothing", () => {
  for (const mode of ["auto", "veto"]) {
    const vm = abilityRows({ ...live, replyMode: mode });
    assert.equal(vm.held, null, mode);
    assert.deepEqual(vm.rows, abilityRows({ ...live, replyMode: "auto" }).rows, `${mode} answers as auto does`);
    assert.equal(idOf(vm).handoff.channels.whatsapp, true);
  }
});

test("each channel on a row is named in words, so the dark one is not read as a colour", () => {
  // The card draws two glyphs per row, lit and dim. Dim is a colour, and a colour says
  // nothing to a screen reader or to anyone who cannot tell the two inks apart, so each
  // glyph is named -- here, once, rather than in the JSX that draws it.
  assert.deepEqual(Object.keys(ABILITY_CHANNEL_WORDS).sort(), ["voice", "whatsapp"]);
  assert.deepEqual(ABILITY_CHANNEL_WORDS.whatsapp, { has: "in chat", not: "not in chat" });
  assert.deepEqual(ABILITY_CHANNEL_WORDS.voice, { has: "on a call", not: "not on a call" });
  for (const w of Object.values(ABILITY_CHANNEL_WORDS)) {
    assert.notEqual(w.has, w.not, "the two states do not say the same thing");
    for (const said of [w.has, w.not]) assert.match(said, /^[a-z ]+$/, said);
  }
});

test("a row says when what stops it is on this page, and when it is not", () => {
  // The card draws a sentence and a door only where the owner can act HERE. Everything else
  // -- a channel that is not connected, the Autonomy tab's hold -- is the card's to say once,
  // not six rows' to repeat, so those rows stay at their title and their two glyphs.
  const missingOf = (over) => Object.fromEntries(abilityRows({ ...live, ...over }).rows.map((r) => [r.id, r.missing]));
  assert.deepEqual(missingOf({}), {
    answer: false,
    open_times: false,
    booking_link: false,
    transfer: false,
    handoff: false,
    vision: true,
  });
  assert.equal(missingOf({ hasCalendarFeed: false }).open_times, true);
  assert.equal(missingOf({ hasBookingLink: false }).booking_link, true);
  assert.equal(missingOf({ hasHandoffNumber: false }).transfer, true);
  assert.equal(missingOf({ visionOn: true }).vision, false);
  // The reasons widen a hand-off; they do not switch it on, so none of them is missing.
  assert.equal(missingOf({ hasEscalateWhen: false }).handoff, false);
  // A dead line, held bookings and held replies are not this page's rows to fill.
  for (const over of [
    { voiceLive: false, whatsappLive: false },
    { whatsappLive: false },
    { bookingHeld: true },
    { replyMode: "ask" },
  ]) {
    const missing = missingOf(over);
    assert.equal(missing.booking_link, false, JSON.stringify(over));
    assert.equal(missing.handoff, false, JSON.stringify(over));
    assert.equal(missing.open_times, false, JSON.stringify(over));
  }
  // And a row whose input IS missing still says so on a dead line: filling it is still the fix.
  assert.equal(missingOf({ whatsappLive: false, hasBookingLink: false }).booking_link, true);
});

test("a channel says what the receptionist DOES there, so a row never disagrees with itself", () => {
  // Found in the card's review, 22 Sep. `channels` said which channel an ability BELONGS to, so a
  // workspace with a live line and no transfer number drew a lit phone beside "No number yet, so it
  // takes a message instead", and a live pair with no calendar drew two lit glyphs beside "No calendar
  // to read". Two meanings on one row, and the owner's rule allows one. A channel now folds in the
  // input the ability needs, so `ready` is exactly "one of the two channels does it".
  const missingInput = [
    ["no calendar", { hasCalendarFeed: false }, "open_times"],
    ["no transfer number", { hasHandoffNumber: false }, "transfer"],
    ["no booking link", { hasBookingLink: false }, "booking_link"],
    ["photos off", { visionOn: false }, "vision"],
  ];
  for (const [what, over, id] of missingInput) {
    const row = idOf(abilityRows({ ...live, visionOn: true, ...over }))[id];
    assert.deepEqual(row.channels, { voice: false, whatsapp: false }, `${what}: neither channel does it`);
    assert.equal(row.ready, false, what);
  }
  // And the invariant behind it, over every combination of the inputs that gate a channel.
  for (const voiceLive of [true, false])
    for (const whatsappLive of [true, false])
      for (const replyMode of ["auto", "ask"])
        for (const hasCalendarFeed of [true, false])
          for (const hasBookingLink of [true, false])
            for (const hasBookingTemplate of [true, false])
              for (const hasHandoffNumber of [true, false])
                for (const bookingHeld of [true, false])
                  for (const visionOn of [true, false]) {
                    const shape = {
                      ...live,
                      voiceLive,
                      whatsappLive,
                      replyMode,
                      hasCalendarFeed,
                      hasBookingLink,
                      hasBookingTemplate,
                      hasHandoffNumber,
                      bookingHeld,
                      visionOn,
                    };
                    for (const r of abilityRows(shape).rows) {
                      assert.equal(
                        r.ready,
                        r.channels.voice || r.channels.whatsapp,
                        `${r.id} on ${JSON.stringify(shape)}`,
                      );
                    }
                  }
});

test("an input left out throws and says which, rather than drawing a card that lies", () => {
  // The page that calls this is untyped JSX. An omitted boolean is undefined, which is falsy,
  // and the card would say a line is dark or a switch is off with no error anywhere -- the
  // stance promptBlocks already takes on its own argument.
  const { visionOn: _v, bookingHeld: _b, ...missing } = live;
  assert.throws(
    () => abilityRows(missing),
    (e) =>
      e instanceof TypeError &&
      /visionOn/.test(e.message) &&
      /bookingHeld/.test(e.message) &&
      !/voiceLive/.test(e.message),
  );
  assert.throws(
    () => abilityRows({ ...live, voiceLive: "yes" }),
    (e) => e instanceof TypeError && /voiceLive/.test(e.message),
  );
  assert.throws(
    () => abilityRows({ ...live, whatsappLive: 1 }),
    (e) => e instanceof TypeError && /whatsappLive/.test(e.message),
  );
  assert.throws(() => abilityRows(undefined), TypeError);
  // pauseHours is not one of them: whatever is stored is read the way the Autonomy pane reads it.
  assert.doesNotThrow(() => abilityRows({ ...live, pauseHours: undefined }));
  // replyMode is, and by its own name: left out, every chat ability would be drawn on a mode
  // nobody chose, and the page cannot be allowed to pick one for the Autonomy tab.
  const { replyMode: _m, ...noMode } = live;
  assert.throws(
    () => abilityRows(noMode),
    (e) => e instanceof TypeError && /replyMode/.test(e.message),
  );
  assert.throws(
    () => abilityRows({ ...live, replyMode: "sometimes" }),
    (e) => e instanceof TypeError && /replyMode/.test(e.message),
  );
});

test("a photo is looked at when the switch is on, and passed to a person when it is off", () => {
  // vision.ts: on, the photo is answered like a message under every rule the prompt carries;
  // off, it is acknowledged where the mode allows and always handed to a person (inbound.ts).
  const on = idOf(abilityRows({ ...live, visionOn: true })).vision;
  assert.equal(on.detail, "It says what it sees and suggests the next step, under the rules it always keeps.");
  assert.deepEqual([on.ready, on.on], [true, true]);
  const off = idOf(abilityRows(live)).vision;
  assert.equal(off.detail, "Off. A photo is passed to a person.");
  assert.deepEqual([off.ready, off.on], [false, false]);
});

test("each half of a hand-off opens the row that supplies it: the transfer number's one editor, and the reasons' fold", () => {
  // The transfer number is edited in one place, Who you are's "Transfer number" (handoff_number, Task 3.2's
  // decision); the reasons are "Hands you a customer", whose id is the key its fold saves (escalate_when). Both once
  // named "handoff", a row nothing drew, so a door to it would have opened nothing.
  const rows = idOf(abilityRows(live));
  assert.equal(rows.transfer.runsOn.row, "handoff_number");
  assert.equal(rows.handoff.runsOn.row, "escalate_when");
  // The photo switch is on its own row (18 Oct 2026), so no other row supplies it, on or off.
  assert.equal(rows.vision.runsOn, null);
  assert.equal(idOf(abilityRows({ ...live, visionOn: true })).vision.runsOn, null);
});

/* ---- What it cannot do ---- */

test("what it cannot do is stated, and is not a setting", () => {
  const rows = cannotRows({ smsLive: false, hasBookingLink: true });
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, ["book", "outbound_call", "sms"]);
  assert.match(rows[0].detail, /Nothing in this product can make, move or cancel a booking/);
  assert.doesNotMatch(
    rows[0].detail,
    /no appointments table/i,
    "there is one now: it records what a booking tool reports",
  );
  assert.match(rows[1].detail, /never calls a customer/i);
  assert.equal(rows[2].soon, true);
});

test("a text message is not listed as something it cannot do once texting is live", () => {
  // Texting goes live on an active carrier line that is not a rehearsal filing
  // (capabilities.ts). On such a line "not part of what is sold yet" is not true.
  assert.deepEqual(
    cannotRows({ smsLive: true, hasBookingLink: true }).map((r) => r.id),
    ["book", "outbound_call"],
  );
  // Left out by an untyped caller, it would quietly read as not live.
  assert.throws(
    () => cannotRows({}),
    (e) => e instanceof TypeError && /smsLive/.test(e.message),
  );
  assert.throws(() => cannotRows(), TypeError);
});

/* ---- When you're open ---- */

const WEEK = {
  mon: { open: "09:30", close: "18:00" },
  tue: { open: "09:30", close: "18:00" },
  wed: { open: "09:30", close: "18:00" },
  thu: { open: "09:30", close: "18:00" },
  fri: { open: "09:30", close: "19:00" },
  sat: {
    intervals: [
      { open: "09:30", close: "13:00" },
      { open: "14:00", close: "19:00" },
    ],
  },
  sun: {},
};

test("the open card's line counts the days the composer would state times for, and names whose clock they are on", () => {
  assert.equal(openWeekWords(WEEK, "America/New_York"), "Six days a week, in New York time");
  assert.equal(
    openWeekWords({ ...WEEK, sun: { open: "10:00", close: "14:00" } }, "America/Los_Angeles"),
    "Seven days a week, in Los Angeles time",
  );
  assert.equal(openWeekWords({ mon: WEEK.mon }, "Europe/Madrid"), "One day a week, in Madrid time");
  // A day stated half-way is one the receptionist calls closed (dayIntervals), so it is not counted as open.
  assert.equal(
    openWeekWords({ mon: WEEK.mon, tue: { open: "09:00" } }, "America/New_York"),
    "One day a week, in New York time",
  );
  // No week to count: only whose clock it is, and the Hours row under it says they are not set.
  for (const none of [null, undefined, {}, { sun: {} }])
    assert.equal(openWeekWords(none, "America/New_York"), "Times are in New York time");
});

test("the closures ahead are counted on the business's own day, soonest first, and the next is named as the board names it", () => {
  const closures = [
    { date: "2026-12-24", until: "2026-12-26", note: "Christmas" },
    { date: "2026-09-21" },
    { date: "2026-09-01", note: "Long gone" },
    { date: "2026-12-30", until: "2027-01-02" },
  ];
  // 03:30 UTC on the 22nd is still the 21st in New York: today's closure is still ahead there, and gone in Madrid.
  const now = new Date("2026-09-22T03:30:00Z");
  assert.deepEqual(closuresAheadWords(closures, "America/New_York", now), { count: 3, line: "3 ahead · next Sep 21" });
  assert.deepEqual(closuresAheadWords(closures, "Europe/Madrid", now), {
    count: 2,
    line: "2 ahead · next Dec 24 – 26 · Christmas",
  });
  // The dates as the Calendar's own list spells them, from the one function.
  assert.equal(closureDatesLabel(closures[3]), "Dec 30 – Jan 2");
  assert.equal(closuresFrom(closures, "2026-12-27").length, 1);
  assert.deepEqual(closuresAheadWords([closures[3]], "America/New_York", now), {
    count: 1,
    line: "1 ahead · Dec 30 – Jan 2",
  });
  // A closure that ends today is still ahead; one whose `until` is before its `date` is that one day.
  assert.equal(closuresAheadWords([{ date: "2026-09-19", until: "2026-09-21" }], "America/New_York", now).count, 1);
  assert.equal(
    closuresAheadWords([{ date: "2026-09-25", until: "2026-09-01" }], "America/New_York", now).line,
    "1 ahead · Sep 25",
  );
  // None ahead is no line at all: the row says "None ahead". A row nobody finished has no date and is not counted.
  for (const none of [null, undefined, [], [closures[2]], [{ date: "", note: "half typed" }]])
    assert.deepEqual(closuresAheadWords(none, "America/New_York", now), { count: 0, line: null });
  // A zone the clock cannot use is read as UTC (clock.ts), where it is already the 22nd: the row is never lost to one.
  assert.equal(closuresAheadWords(closures, "Not/AZone", now).count, 2);
});

/* ---- What you offer ---- */

const svc = (name, duration_min, price_note) => ({
  name,
  ...(duration_min ? { duration_min } : {}),
  ...(price_note ? { price_note } : {}),
});
const MANY = Array.from({ length: 33 }, (_, i) => svc(`Service ${i + 1}`, 30 + i, "quoted at consult"));

test("the services row counts them, names the first three with how long each takes, and says how many more", () => {
  const vm = servicesWords([
    svc("Balayage", 180, "quoted at consult"),
    svc("Highlights", 45, "quoted at consult"),
    svc("Haircut", null, "quoted at consult"),
    svc("Blowout", 120, "quoted at consult"),
    ...MANY.slice(0, 29),
  ]);
  assert.equal(vm.count, 33);
  assert.equal(vm.line, "33", "the count alone: the key says what it counts");
  // In the stored order, which is the order the receptionist reads them in: never sorted.
  // "3 h" and "45 min", never "180m", which a screen reader may say as metres (contracts serviceTakesWords).
  assert.deepEqual(vm.chips, [
    { name: "Balayage", takes: "3 h" },
    { name: "Highlights", takes: "45 min" },
    { name: "Haircut", takes: null },
  ]);
  assert.equal(vm.more, "+30");
  // Three or fewer are all chips, with no "more".
  assert.deepEqual([servicesWords(MANY.slice(0, 3)).chips.length, servicesWords(MANY.slice(0, 3)).more], [3, null]);
  assert.deepEqual([servicesWords(MANY.slice(0, 4)).more, servicesWords(MANY.slice(0, 1)).line], ["+1", "1"]);
  // None is no line at all: the row says it has none. A row nobody finished (no name) is not counted, as no save writes it.
  // And a stored list that is not one (a hand-edited record) is none, never a throw: the row is drawn as the page draws.
  for (const none of [
    null,
    undefined,
    [],
    [{ name: "" }],
    [{ name: "   ", duration_min: 30 }],
    { Balayage: 180 },
    "Balayage",
  ]) {
    assert.deepEqual(servicesWords(none), { count: 0, line: null, chips: [], more: null });
  }
  assert.equal(servicesWords([svc("Balayage", 180), { name: "" }]).count, 1);
});

test("a block's share of the prompt is a rough fraction in words, never a percentage", () => {
  // The canvas's: 1,190 characters of a 4,345-character prompt.
  assert.equal(blockShareWords(1190, 4345), "a quarter of everything it reads");
  assert.equal(blockShareWords(500, 1000), "half of everything it reads");
  assert.equal(blockShareWords(1000, 3000), "a third of everything it reads");
  assert.equal(
    blockShareWords(290, 1000),
    "about a quarter of everything it reads",
    "the nearest, and said to be rough when it is some way off",
  );
  assert.equal(blockShareWords(50, 1000), "less than a tenth of everything it reads");
  assert.equal(blockShareWords(980, 1000), "nearly everything it reads");
  assert.equal(blockShareWords(1200, 1000), "nearly everything it reads", "never more than all of it");
  for (const [chars, total] of [
    [0, 1000],
    [100, 0],
    [null, 1000],
    [100, undefined],
    [Number.NaN, 10],
  ])
    assert.equal(blockShareWords(chars, total), null);
});

/* ---- The prompt sheet (Phase 5) ---- */

test("a block's cost is its share on screen, and its exact size only where a screen reader or a tip asks", () => {
  // The owner named "4,345 characters" as technical data (22 Sep): the sheet draws a share, and the count is the
  // accessible description of the entry that draws it. One sentence says both, so they cannot disagree.
  assert.equal(promptCostWords(1190, 4345), "1,190 characters — a quarter of everything it reads.");
  assert.equal(promptCostWords(40, 4345), "40 characters — less than a tenth of everything it reads.");
  assert.equal(promptCostWords(1190, 0), "1,190 characters.", "no whole to measure against, no share");
  // The whole, for the contents' own description.
  assert.equal(promptTotalWords(4345), "4,345 characters in all.");
  assert.equal(promptTotalWords(1), "1 character in all.");
});

test("who reads the prompt is one phrase per channel, and the clock beside it says why it is apart", () => {
  assert.deepEqual(PROMPT_READERS, {
    whatsapp: "Every WhatsApp message, word for word",
    voice: "Every phone call, composed when the call starts",
  });
  // What is sent beside the prompt is drawn apart because it is sent apart, rebuilt each time (the prompt above it then
  // stays the same from one message to the next, and its cache holds). What an owner needs of that is what it is and
  // when it is rebuilt: a call's clock is composed when the call starts, so on Phone it is every call, not every
  // message (Ruben, 10 Oct 2026: the sheets "too wordy, too explanatory").
  assert.deepEqual(PROMPT_NOW.label, { whatsapp: "Today's date and time", voice: "Today's date and time" });
  assert.deepEqual(PROMPT_NOW.why, { whatsapp: "Added to every message", voice: "Added to every call" });
});

test("the services sheet's foot says how many it will be told of, how long they are, and what share of the prompt", () => {
  assert.equal(
    servicesToldWords({ count: 33, chars: 1190, total: 4345 }),
    "33 services, 1,190 characters — a quarter of everything it reads.",
    "the canvas's foot",
  );
  assert.equal(
    servicesToldWords({ count: 1, chars: 40, total: 4000 }),
    "1 service, 40 characters — less than a tenth of everything it reads.",
  );
  assert.equal(
    servicesToldWords({ count: 3, chars: null, total: 4000 }),
    "3 services.",
    "with no block to measure, the count alone",
  );
  assert.equal(servicesToldWords({ count: 3, chars: 120, total: null }), "3 services, 120 characters.");
  assert.equal(
    servicesToldWords({ count: 0, chars: null, total: 4000 }),
    "No services, so it cannot say what you offer.",
  );
  // One sentence, one home: the foot says what the gap line says of a receptionist with no services.
  const gap = businessGap({
    business_name: "A",
    booking_link: "https://a.example",
    profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
  });
  assert.deepEqual([gap.row, gap.sentence], ["services", "It cannot say what you offer."]);
  assert.equal(
    servicesToldWords({ count: 0, chars: null, total: null }),
    `No services, so it ${gap.sentence.slice("It ".length)}`,
  );
  // The Undo left where one was taken out is named for what it puts back.
  assert.deepEqual(["Balayage", "  Cut ", "", null].map(serviceUndoName), [
    "Undo removing Balayage",
    "Undo removing Cut",
    "Undo removing a service",
    "Undo removing a service",
  ]);
});

test("the booking rules are one sentence of the rules that are set, in the fold's order, with the owner's notes as sentences", () => {
  const vm = bookingRulesWords({
    lead_hours: 2,
    slot_min: 30,
    max_days_ahead: 14,
    party_max: 4,
    consult_first: ["Color correction"],
    notes: ["No chemical services after 4 PM", "Bridal parties are booked by phone."],
  });
  assert.equal(
    vm.line,
    "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people",
    "the canvas's line",
  );
  assert.equal(vm.notes, "No chemical services after 4 PM. Bridal parties are booked by phone.");
  // Only what is set is said, each in its own words, the first capitalised.
  assert.equal(bookingRulesWords({ party_max: 1 }).line, "Up to 1 person");
  assert.equal(
    bookingRulesWords({ lead_hours: 1, buffer_min: 15 }).line,
    "At least 1 hour's notice · 15 minutes between bookings",
  );
  assert.equal(
    bookingRulesWords({ lead_hours: 0, buffer_min: 0, max_days_ahead: 1 }).line,
    "Same-day bookings · no gap between bookings · up to 1 day ahead",
  );
  assert.equal(bookingRulesWords({ slot_min: 45, buffer_min: 1 }).line, "45-minute slots · 1 minute between bookings");
  // Consult-first is a row of its own, and a line of the rules nowhere here.
  assert.equal(bookingRulesWords({ consult_first: ["Extensions"] }).line, null);
  // With none set, what the openings are worked out with is said, from the defaults the calendar applies: not "no rule".
  for (const none of [null, undefined, {}, { notes: [] }, { lead_hours: null }]) {
    const empty = bookingRulesWords(none);
    assert.deepEqual([empty.line, empty.notes], [null, null]);
  }
  assert.equal(
    bookingRulesWords({}).none,
    "The calendar's own — at least 2 hours' notice, up to 14 days ahead, in 30-minute slots",
  );
  assert.deepEqual(
    BOOKING_DEFAULTS,
    { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 },
    "the numbers it says are the ones freeWindows applies",
  );
  assert.equal(bookingRulesWords({ notes: ["  ", "Walk-ins welcome!"] }).notes, "Walk-ins welcome!");
});

test("a booking rule's box shows what empty means as its placeholder; the one fact left is the party size's", () => {
  // The sheet draws each number's default as its placeholder (offer.tsx BTW_RULE_BOXES, the numbers BOOKING_DEFAULTS
  // holds), so a sentence under each box saying "Empty uses 2 hours." said it twice (Ruben, 10 Oct 2026). What a box
  // needs beside it is what no number in it says: that a bigger party is handed over.
  assert.deepEqual(BOOKING_RULE_HINTS, {
    lead_hours: null,
    slot_min: null,
    buffer_min: null,
    max_days_ahead: null,
    party_max: "Bigger groups are handed to a person.",
  });
});

test("a booking rule's refusal says its range and what an empty box uses, each with its unit, from the schema and the defaults", () => {
  // The quality review: "leave it empty to use 2" named no unit, and the sentences were the page's.
  assert.deepEqual(["lead_hours", "slot_min", "buffer_min", "max_days_ahead", "party_max"].map(bookingRuleRefusal), [
    "Least notice is 0 to 168 hours; leave it empty to use 2 hours.",
    "A slot is 15 to 240 minutes; leave it empty for the calendar’s 30 minutes.",
    "The gap is 0 to 120 minutes; leave it empty for none.",
    "Times are offered 1 to 90 days ahead; leave it empty to use 14 days.",
    // No default: a party of any size is booked when none is set, and the composer says nothing of one.
    "A booking is for 1 to 20 people; leave it empty for no rule.",
  ]);
  // Its range is the save's own schema's, and what empty uses is the one BOOKING_DEFAULTS, which the hint reads too.
  const lead = BookingRulesSchema.shape.lead_hours.unwrap();
  assert.match(
    bookingRuleRefusal("lead_hours"),
    new RegExp(
      `^Least notice is ${lead.minValue} to ${lead.maxValue} hours; leave it empty to use ${BOOKING_DEFAULTS.lead_hours} hours\\.$`,
    ),
  );
  for (const bad of ["notes", "consult_first", "", undefined])
    assert.throws(() => bookingRuleRefusal(bad), TypeError, String(bad));
});

test("a hand-edited record whose lists are not lists is read as none, never a throw", () => {
  // The quality review's probe: a stored booking_rules.notes that is a string threw as the row drew, and took the page
  // down with it. The page is drawn from whatever the record holds.
  assert.equal(bookingRulesWords({ lead_hours: 2, notes: "Cash only" }).notes, null);
  assert.equal(bookingRulesWords({ lead_hours: 2, notes: "Cash only" }).line, "At least 2 hours' notice");
  assert.equal(bookingRulesWords({ notes: { a: 1 } }).notes, null);
  // And the consult-first question, which the sheet asks of each row.
  assert.equal(needsConsultation("Extensions", { consult_first: "Extensions" }), false);
  assert.equal(needsConsultation("Extensions", { consult_first: ["extensions"] }), true);
});

test("the services search says how many rows it found, for a screen reader to hear as it narrows", () => {
  assert.equal(servicesFoundWords(11, 33), "11 of 33 services");
  assert.equal(servicesFoundWords(1, 33), "1 of 33 services");
  assert.equal(servicesFoundWords(1, 1), "1 of 1 service");
  assert.equal(servicesFoundWords(0, 33), "No service is called that.");
  assert.equal(servicesFoundWords(0, 0), "No services yet.");
});

/* ---- How it answers ---- */

test("the voice's three starting points are sentences the profile keeps, each named as the canvas names it", () => {
  assert.deepEqual(
    TONE_PRESETS.map((p) => p.label),
    ["Warm and brief", "Professional, no small talk", "Chatty, first names"],
  );
  for (const p of TONE_PRESETS) {
    assert.ok(BusinessProfileSchema.safeParse({ tone: p.tone }).success, `${p.label} is a voice the save takes`);
    assert.match(p.tone, /^[A-Z].*\.$/, `${p.label} is a sentence`);
  }
  assert.equal(new Set(TONE_PRESETS.map((p) => p.tone)).size, 3, "three different voices");
});

test("the hand-off row at rest is one line: the reasons counted, and what a call does", () => {
  const two = handoffWords(
    ["They ask for a person, for the owner", "They are upset, or have a complaint"],
    "+1 (212) 555-0142",
  );
  assert.equal(two.phone, "transfers to +1 (212) 555-0142");
  assert.equal(two.line, "For 2 reasons · on a call, transfers to +1 (212) 555-0142");
  assert.doesNotMatch(two.line, /They ask/, "the reasons themselves are the fold's, whole");
  assert.equal(handoffWords(["Refunds"], null).line, "For 1 reason · on a call, takes a message");
  // With no reasons it still hands over, on the composer's own triggers, in the words the ability card says them in.
  const none = handoffWords([], "  ");
  assert.equal(none.line, "When a customer asks for a person or it can't help · on a call, takes a message");
  assert.equal(none.phone, "takes a message");
  const [clause] = none.line.split(" · ");
  assert.ok(handoffChatWords({ hasEscalateWhen: false, pauseHours: undefined }).startsWith(`${clause}, it`));
  // A hand-edited record whose list is not one is no reasons, never a throw.
  assert.equal(handoffWords("Refunds", undefined).line, none.line);
  assert.equal(handoffWords([" ", null, 3], undefined).line, none.line);
});

test("the hand-off sentences are the ability card's own, written once", () => {
  // What the fold says happens on WhatsApp and what a transfer does ARE the ability card's two rows: one sentence each.
  for (const hasEscalateWhen of [true, false]) {
    for (const pauseHours of [undefined, 4, 72]) {
      assert.equal(
        handoffChatWords({ hasEscalateWhen, pauseHours }),
        idOf(abilityRows({ ...live, hasEscalateWhen, pauseHours })).handoff.detail,
      );
    }
  }
  assert.match(
    handoffChatWords({ hasEscalateWhen: true, pauseHours: undefined }),
    /the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed\. It holds off for a day, then answers/,
  );
  assert.doesNotMatch(
    handoffChatWords({ hasEscalateWhen: true, pauseHours: 24 }),
    /your staff/,
    "REGRESSION: the canvas emailed a staff the Notifications tab never named",
  );
  // The sheet's WhatsApp row says the same hand-off as one outcome, and holds off for the pause that sentence names.
  for (const pauseHours of [undefined, 4, 72]) {
    const held = handoffChatWords({ hasEscalateWhen: true, pauseHours }).match(/holds off for (.+?), then/)[1];
    assert.deepEqual(handoffChatRow(pauseHours), {
      name: "Stops and marks it Needs you",
      sub: `Sends your alerts · replies again after ${held}`,
    });
  }
  // Who it hands over without a reason is the composer's own triggers, the clause the row at rest says.
  assert.match(HANDOFF_ANYWAY, /asks for a person/);
  assert.match(HANDOFF_ANYWAY, /help it can't give/);
});

test("on a call the reasons count too, as the composer writes them there", () => {
  // The canvas said the phone agent's own transfer kept the reasons from reaching it. The composer writes them under the
  // call's hand-off heading too ("and whenever:").
  const brain = {
    business_name: "Northside Studio",
    booking_link: "https://example.com/book",
    system_prompt: "x",
    fallbacks: FALLBACK_DEFAULTS,
    profile: { escalate_when: ["They want a refund"], handoff_number: "+16465550100" },
  };
  assert.match(resolveSystemPrompt(brain, "voice", "America/New_York", new Date(), {}, null), /- They want a refund/);
  // The sheet's call row: the number rung in opening hours, a message otherwise; with none, a message always, and the
  // ability card's transfer row says the same.
  assert.deepEqual(handoffCallRow(" +1 (646) 555-0100 "), {
    name: "Rings +1 (646) 555-0100",
    sub: "In opening hours, otherwise takes a message",
    act: "Change",
    actName: "Change the transfer number",
  });
  assert.deepEqual(handoffCallRow(null), {
    name: "Takes a message",
    sub: "No transfer number",
    act: "Add one",
    actName: "Add a transfer number",
  });
  assert.equal(
    idOf(abilityRows({ ...live, hasHandoffNumber: false })).transfer.detail,
    "No number yet, so it takes a message.",
  );
});

test("the notes row names the first four by title, and how many more", () => {
  const six = ["Parking", "Gift cards", "Second location", "Wi-Fi", "Pets", "Payment"].map((title) => ({
    title,
    text: "…",
  }));
  assert.deepEqual(notesWords(six), {
    count: 6,
    chips: ["Parking", "Gift cards", "Second location"],
    more: "+3",
  });
  assert.equal(notesWords(six.slice(0, 3)).more, null);
  assert.deepEqual(notesWords([]), { count: 0, chips: [], more: null });
  assert.deepEqual(
    notesWords([{ title: " ", text: "half" }, null, { title: "Parking" }]).chips,
    ["Parking"],
    "a note with no title is a row nobody finished",
  );
  assert.deepEqual(notesWords("Parking"), { count: 0, chips: [], more: null });
});

test("a note's end is said beside it once its last day has passed on the business's own day, in the closures' spelling of a date", () => {
  const ny = "America/New_York";
  // 03:30 UTC on 11 October is 23:30 on the 10th in New York: a note whose last day is the 10th has not ended there.
  assert.equal(noteEndedWords("2026-10-10", ny, new Date("2026-10-11T03:30:00Z")), null);
  // 04:30 UTC is 00:30 on the 11th there: it has, and says so as a closure's row names a day (closureDatesLabel).
  assert.equal(noteEndedWords("2026-10-10", ny, new Date("2026-10-11T04:30:00Z")), "ended Oct 10");
  assert.equal(
    noteEndedWords("2026-10-10", ny, new Date("2026-10-11T04:30:00Z")),
    `ended ${closureDatesLabel({ date: "2026-10-10" })}`,
  );
  assert.equal(noteEndedWords("2026-10-11", ny, new Date("2026-10-11T04:30:00Z")), null, "its last day is today");
  for (const none of [undefined, null, "", 20261010])
    assert.equal(noteEndedWords(none, ny, new Date("2026-10-11T04:30:00Z")), null, `${none}: a note with no end`);
});

test("whether a note has ended is the composer's one rule: in a zone, and with no zone at all, the form says ended exactly when the prompt stops saying the note", () => {
  const base = { business_name: "Example Salon", booking_link: null, whatsapp_line: null };
  const said = (until, tz, at) =>
    composeSystemPrompt(base, { notes: [{ title: "Holiday hours", text: "Open 10 to 2.", until }] }, "whatsapp", tz, at)
      .split("\n")
      .some((l) => l.startsWith("- Holiday hours"));
  // 15:00 UTC on 28 September. With no zone the composer reads the day as the 27th (UTC, a day back), so a note whose
  // last day is the 27th is still said; the form, judged by the same rule, does not call it ended. A display zone
  // (New York, the 28th there) would have.
  const at = new Date("2026-09-28T15:00:00Z");
  assert.equal(said("2026-09-27", null, at), true);
  assert.equal(noteEndedWords("2026-09-27", null, at), null);
  assert.equal(said("2026-09-26", null, at), false);
  assert.equal(noteEndedWords("2026-09-26", null, at), "ended Sep 26");
  for (const [tz, when] of [
    [null, at],
    ["America/New_York", new Date("2026-10-11T03:30:00Z")],
    ["America/New_York", new Date("2026-10-11T04:30:00Z")],
    ["America/New_York", new Date("2026-12-11T04:30:00Z")],
    ["America/New_York", new Date("2026-12-11T05:30:00Z")],
    ["Pacific/Auckland", new Date("2026-10-10T11:30:00Z")],
  ])
    for (const until of ["2026-09-26", "2026-09-27", "2026-10-10", "2026-10-11", "2026-12-10", "2026-12-11"])
      assert.equal(
        noteEndedWords(until, tz, when) !== null,
        !said(until, tz, when),
        `${until} in ${tz} at ${when.toISOString()}`,
      );
});

test("the owner's own words are said by their opening, cut at a word; their size is a number for the box, not the row", () => {
  const words =
    "Never discuss competitors. A first name is all the personal data you need, and nothing is ever booked by text.";
  const said = instructionsWords(`  ${words}  `);
  assert.equal(said.opening, "“Never discuss competitors. A first name is all the personal data you…”");
  assert.equal(instructionsWords("Short.").opening, "“Short.”", "short enough to quote whole");
  assert.deepEqual(instructionsWords("   "), { opening: null, limit: null });
  // The count says how much room is left rather than how long the words are: a number alone is one an owner cannot
  // act on, and it sat on the row at rest, where nothing can be done about it. It is the box's, with the limit beside it.
  // And only as the room runs out: under a box with room to spare a count is a number to read and nothing to do
  // (Ruben, 10 Oct 2026, the sheets in one shape).
  assert.equal(instructionsWords("One").limit, null, "room to spare: no count");
  assert.equal(instructionsWords("x".repeat(INSTRUCTIONS_MAX * 0.9 - 1)).limit, null);
  const near = "x".repeat(INSTRUCTIONS_MAX * 0.9);
  assert.equal(
    instructionsWords(near).limit,
    `${near.length.toLocaleString("en-US")} of ${INSTRUCTIONS_MAX.toLocaleString("en-US")} characters`,
  );
  assert.equal(said.size, undefined, "the row states no count of its own");
  assert.equal(said.nearFull, undefined);
});

test("the three messages are one line: how many there are, and whose words they are in", () => {
  // Two lines said it before -- "3 messages sent in your name" and "3 differ from the default wording" -- where the
  // second counts a difference nobody can act on without opening the fold, which names each message that differs and
  // offers the default back. One line now, and still never who wrote them: a workspace set up before the default
  // wording was written was given messages nobody here typed.
  assert.deepEqual(fallbacksWords(FALLBACK_DEFAULTS), { line: "3 messages, the product's wording" });
  assert.equal(
    fallbacksWords(null).line,
    "3 messages, the product's wording",
    "a workspace that stores none sends the default",
  );
  assert.equal(
    fallbacksWords({ ...FALLBACK_DEFAULTS, error: "Sorry, something went wrong on our side." }).line,
    "3 messages, in your words",
  );
  assert.equal(
    fallbacksWords({ greeting: "Hi!", error: "Sorry.", non_text: "Thanks." }).line,
    "3 messages, in your words",
  );
  assert.equal(
    fallbacksWords({ ...FALLBACK_DEFAULTS, error: `  ${FALLBACK_DEFAULTS.error}\n` }).line,
    "3 messages, the product's wording",
    "space around a message is not a word of it",
  );
  assert.equal(
    fallbacksWords({ ...FALLBACK_DEFAULTS, error: "" }).line,
    "3 messages, the product's wording",
    "a message stored empty is sent in the default wording",
  );
  assert.doesNotMatch(fallbacksWords({ greeting: "Hi!" }).line, /you wrote/);
  assert.equal(fallbacksWords(FALLBACK_DEFAULTS).own, undefined, "the second line is gone");
});

test("a record whose details compose nothing is told the stored prompt and Autonomy's rules, and the rules fold's sentence says so", () => {
  const brain = {
    business_name: "Northside Studio",
    booking_link: "https://example.com/book",
    system_prompt: "You answer for Northside Studio.",
    fallbacks: FALLBACK_DEFAULTS,
    profile: { guardrails: { never_quote_prices: false } },
  };
  const text = resolveSystemPrompt(
    brain,
    "whatsapp",
    "America/New_York",
    new Date(),
    { booking: { mode: "ask" } },
    null,
  );
  const blocks = promptBlocks(text, "whatsapp", brain);
  assert.deepEqual(
    blocks.map((b) => b.row),
    ["extra_instructions", "autonomy"],
    "the stored prompt as it stands, then only Autonomy's rules",
  );
  assert.equal(
    blocks.find((b) => b.row === "guardrails"),
    undefined,
    "no rules block for the fold to show",
  );
  // The fold's sentence agrees with the prompt view's note on the same page: nothing on it is composed yet.
  // M-2: not two sentences that happen to agree -- both are built from the one contracts keeps, so a change to
  // either is a change to both, and the page cannot drift into saying it two ways again.
  assert.ok(blocks[0].note.includes(NO_FIELDS_COMPOSED_WORDS), "the prompt view's note carries it");
  assert.ok(RULES_WITHOUT_FIELDS_WORDS.startsWith(NO_FIELDS_COMPOSED_WORDS), "and the fold's note opens with it");
  assert.match(
    RULES_WITHOUT_FIELDS_WORDS,
    /Until they are, it isn't told these rules, only that it is an automated assistant\.$/,
  );
  // What it is TOLD, never what it does: the price detector reads every reply whatever the profile (layerTwo on a chat
  // reply, spokenBreach on a call), and nothing can confirm a booking anyway. The sheet draws this over "Checked", the
  // price rule's pill, so a sentence that the rules "do not reach it" would contradict the chip next to it.
  assert.doesNotMatch(
    RULES_WITHOUT_FIELDS_WORDS,
    /do not reach|does not reach|not kept|are off/i,
    "REGRESSION: it said the four rules do not reach it, and the price rule is checked on every reply",
  );
  assert.equal(ruleStrength("never_quote_prices").chip, "Checked", "the pill it is drawn beside");
});

/* ------------------------------ what a fold will not take ------------------------------ */

test("every cap a fold offers up to is the schema's own, and each is stated once", () => {
  // The page held this table as literals (BT_LIMITS) and wrote every number again in the sentence beside it, so a cap
  // widened in the schema left the page offering less than the save would take, under a sentence naming a third
  // number. Read off the schemas, there is one number, and this test is what says so.
  const p = BusinessProfileSchema.shape;
  const service = p.services.unwrap().element.shape;
  const note = p.notes.unwrap().element.shape;
  const rules = BookingRulesSchema.shape;
  const cap = (schema) => {
    if (typeof schema.maxLength === "number") return schema.maxLength;
    const check = (schema.def?.checks ?? []).find((c) => c?._zod?.def?.check === "max_length");
    return check?._zod?.def?.maximum;
  };
  assert.deepEqual(PROFILE_LIMITS, {
    tone: cap(p.tone.unwrap()),
    services: cap(p.services.unwrap()),
    serviceName: cap(service.name),
    serviceMinutes: service.duration_min.unwrap().maxValue,
    servicePrice: cap(service.price_note.unwrap()),
    languages: cap(p.languages.unwrap()),
    languageMin: p.languages.unwrap().element.minLength,
    languageMax: cap(p.languages.unwrap().element),
    reasons: cap(p.escalate_when.unwrap()),
    reason: cap(p.escalate_when.unwrap().element),
    consultFirst: cap(rules.consult_first.unwrap()),
    consultFirstLine: cap(rules.consult_first.unwrap().element),
    ruleNotes: cap(rules.notes.unwrap()),
    ruleNote: cap(rules.notes.unwrap().element),
    notes: cap(p.notes.unwrap()),
    noteTitle: cap(note.title),
    noteText: cap(note.text),
    closureNote: cap(ClosureSchema.shape.note.unwrap()),
    closures: MAX_CLOSURES,
    shifts: MAX_INTERVALS_PER_DAY,
    instructions: INSTRUCTIONS_MAX,
    message: cap(BrainConfigSchema.shape.fallbacks.shape.greeting),
  });
  // And no cap is missing: a fold asking for one that is not here would be a box with no check at all.
  assert.equal(
    Object.values(PROFILE_LIMITS).every((n) => Number.isInteger(n) && n > 0),
    true,
  );
});

test("a refusal that names a cap is written from that same cap, and says back what was measured", () => {
  const L = PROFILE_LIMITS;
  // The sentence and the check cannot disagree, because the sentence is built from the number the check uses.
  assert.equal(
    profileRefusal("message", 2345),
    `At most ${L.message.toLocaleString("en-US")} characters — this is 2,345.`,
  );
  assert.equal(
    profileRefusal("instructions", 20_001),
    `At most ${L.instructions.toLocaleString("en-US")} characters — this is 20,001.`,
  );
  assert.equal(profileRefusal("tone", 201), `At most ${L.tone} characters — this is 201.`);
  assert.equal(profileRefusal("noteTitle", 90), `A note's title is at most ${L.noteTitle} characters — this is 90.`);
  assert.equal(
    profileRefusal("noteText", 1300),
    `A note's text is at most ${L.noteText.toLocaleString("en-US")} characters — this is 1,300.`,
  );
  assert.equal(
    profileRefusal("serviceMinutes"),
    `At most ${L.serviceMinutes.toLocaleString("en-US")} minutes, a whole day.`,
  );
  assert.equal(profileRefusal("closures"), `At most ${L.closures} closed days. Dates that have passed can go.`);
  // What was measured is said back only where the sentence has a place for it.
  assert.equal(profileRefusal("services"), `At most ${L.services} services.`);
  assert.equal(profileRefusal("reasons", 21), `At most ${L.reasons} reasons, one to a line — this is 21.`);
  assert.equal(profileRefusal("reason"), `Each reason is at most ${L.reason} characters.`);
  assert.equal(profileRefusal("consultFirst", 21), `At most ${L.consultFirst} services, one to a line — this is 21.`);
  assert.equal(profileRefusal("ruleNotes", 11), `At most ${L.ruleNotes} notes, one to a line — this is 11.`);
  assert.equal(profileRefusal("notes"), `At most ${L.notes} notes.`);
  // The two that name what they were measured ON.
  assert.equal(profileRefusal("shifts", 5, "Monday"), `At most ${L.shifts} shifts in a day — Monday has 5.`);
  assert.equal(profileRefusal("languages"), `At most ${L.languages} languages.`);
  assert.equal(
    profileRefusal("language", undefined, "Q"),
    `“Q” is not a language's name: ${L.languageMin} to ${L.languageMax} characters.`,
  );
  // Every count above a thousand is written the way a person writes it, never as 1200 or 20000.
  for (const key of ["instructions", "message", "noteText", "serviceMinutes"]) {
    assert.doesNotMatch(profileRefusal(key, 9), /[0-9]{4}/, key);
  }
  // A key that is no cap of this tab is a TypeError, since the page is untyped and would have drawn `undefined`.
  assert.throws(() => profileRefusal("not_a_cap"), { name: "TypeError", message: /not_a_cap/ });
  assert.throws(
    () => profileRefusal("toString"),
    { name: "TypeError", message: /toString/ },
    "a name every object has is no cap",
  );
});

test("a message that writes a detail out instead of naming it is found, link first", () => {
  // `{business}`, `{booking link}` and `{phone}` are filled in as each message goes out; a message that spells one
  // instead says what was true when it was typed and nothing after. The link is known exactly; a number is known by
  // its shape, since the one a customer would ring need not be the one on file.
  const link = "https://booksy.example/4471902";
  assert.equal(writtenOutDetail(`Book at ${link} and we will confirm.`, link), "link");
  assert.equal(writtenOutDetail("Call us on (646) 555-0100.", link), "number");
  assert.equal(writtenOutDetail("Call 646-555-0100.", link), "number");
  assert.equal(writtenOutDetail("Call +1 646 555 0100.", link), "number");
  // Both: the link is the one it can name exactly, so that is what it says.
  assert.equal(writtenOutDetail(`Ring (646) 555-0100 or book at ${link}.`, link), "link");
  // The names themselves are not written out, which is the whole point of them.
  assert.equal(writtenOutDetail("Book at {booking link} or call {phone}.", link), null);
  assert.equal(writtenOutDetail("Thanks for writing to {business}!", link), null);
  // A workspace with no link of its own: only a number can be written out.
  assert.equal(writtenOutDetail(`Book at ${link}.`, ""), null);
  assert.equal(writtenOutDetail(null, link), null);
  assert.equal(
    writtenOutDetail("Order 12345678 is ready.", link),
    null,
    "eight digits in a row are not a phone number",
  );
});

test("with no booking link, every business is told so last, as an offer: the receptionist takes their details instead (0008, amended 18 Oct 2026)", () => {
  const none = { ...full, booking_link: undefined };
  assert.deepEqual(businessGap(none), {
    sentence: "It has no booking link to send, so it takes their details instead.",
    row: "booking_link",
  });
  assert.equal(
    businessGap({ ...none, profile: { ...full.profile, hours: undefined } }).row,
    "hours",
    "a gap a customer would hear first comes first",
  );
});

test("with no booking link, the row says it takes their details, for every business: one to add, and not ready", () => {
  const none = idOf(abilityRows({ ...live, hasBookingLink: false })).booking_link;
  assert.deepEqual(
    [none.detail, none.missing, none.ready],
    ["No booking link, so it takes their details for you to follow up.", true, false],
  );
});

test("the rules sheet over a stored prompt says one line, link or no link: what the owner can change is the details", () => {
  // It named the no-link rule a receptionist with no booking link is told first; the sheet says only what an owner can
  // act on (Ruben, 10 Oct 2026: the sheets "too wordy, too explanatory").
  assert.equal(rulesWithoutFieldsWords(), RULES_WITHOUT_FIELDS_WORDS);
  assert.equal(
    RULES_WITHOUT_FIELDS_WORDS,
    `${NO_FIELDS_COMPOSED_WORDS} Until they are, it isn't told these rules, only that it is an automated assistant.`,
  );
});

test("with no booking link, the two rows that lean on one say what does the work instead; the rest are as they were", () => {
  const detail = (hasBookingLink) =>
    Object.fromEntries(cannotRows({ smsLive: false, hasBookingLink }).map((r) => [r.id, r.detail]));
  const linked = detail(true);
  const none = detail(false);
  assert.match(linked.book, /Your booking link does that, whichever tool is behind it\.$/);
  assert.equal(
    none.book,
    "Not a setting you could switch on. Nothing in this product can make, move or cancel a booking. Your team does that, from the details it takes.",
  );
  assert.equal(
    none.sms,
    "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when.",
  );
  assert.equal(none.outbound_call, linked.outbound_call, "a row that leans on no link is as it was");
  assert.throws(() => cannotRows({ smsLive: false }), TypeError, "whether there is a link is required, as smsLive is");
});
