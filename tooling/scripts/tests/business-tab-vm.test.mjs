/**
 * The Business tab's own view models, as pure functions: a fact's tone, how far a rule goes,
 * the standing line's three clauses, the ability rows and the prompt's blocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, SOURCE_WORDS, ruleStrength, GUARDRAIL_KEYS, standingLine, abilityRows, CANNOT_ROWS, promptBlocks, composeSystemPrompt } from "@chanlytics/contracts";

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

test("the four rules carry three different guarantees", () => {
  assert.equal(ruleStrength("never_confirm_booking").strength, "structural");
  assert.equal(ruleStrength("never_quote_prices").strength, "checked");
  assert.equal(ruleStrength("disclose_ai").strength, "instructed");
  assert.equal(ruleStrength("no_health_advice").strength, "instructed");
  // Every key the editor writes has a strength, and no key has one it does not write.
  assert.deepEqual([...GUARDRAIL_KEYS].sort(), ["disclose_ai", "never_confirm_booking", "never_quote_prices", "no_health_advice"]);
  for (const k of GUARDRAIL_KEYS) {
    const r = ruleStrength(k);
    assert.ok(r.chip.length > 0 && r.sentence.length > 0, `${k} needs a chip and a sentence`);
  }
  // The structural one says the switch does not decide it.
  assert.match(ruleStrength("never_confirm_booking").sentence, /no appointments table/i);
  // The checked one names both channels, because they differ -- and it names them in
  // checkedOn, not in the sentence: the page draws both, so a sentence that said the
  // channels too would print the same fact twice on one row.
  const priced = ruleStrength("never_quote_prices");
  assert.equal(priced.checkedOn?.length, 2);
  assert.deepEqual(priced.checkedOn.map((c) => c.channel), ["whatsapp", "voice"]);
  // On chat a draft sits in between, so the swap happens before anyone reads it.
  assert.match(priced.checkedOn[0].words, /before the customer sees them/i);
  // On a call there is no before. Saying there is would be the one dishonest sentence
  // on a page whose whole point is that these four rules are not equivalent.
  assert.doesNotMatch(priced.checkedOn[1].words, /before/i);
  assert.match(priced.checkedOn[1].words, /already been heard/i);
  assert.doesNotMatch(priced.sentence, /WhatsApp|call/i);
});

const full = {
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  profile: {
    address: "2581 Pitkin Ave, Brooklyn, NY 11208",
    tone: "Warm and unhurried.",
    hours: { mon: { open: "09:30", close: "18:00" } },
    services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
    escalate_when: ["They ask for Melany"],
    guardrails: { never_quote_prices: true },
  },
};

test("the standing line is three clauses, and never a percentage", () => {
  const s = standingLine(full);
  assert.match(s.can, /where you are/);
  assert.match(s.can, /when you.re open/);
  assert.match(s.can, /how to book/);
  assert.equal(s.missing, null, "a full record is missing nothing");
  assert.match(s.wont ?? "", /consult instead of a price/);
  assert.equal(typeof s.percent, "undefined", "there is no score on this page");
});

test("the standing line names the one thing missing, and where to fix it", () => {
  const noVoice = { ...full, profile: { ...full.profile, tone: undefined } };
  const s = standingLine(noVoice);
  assert.match(s.missing.sentence, /no voice of its own/i);
  assert.equal(s.missing.row, "tone");
});

test("a record with nothing says so without listing every gap", () => {
  const s = standingLine({ business_name: "", booking_link: "", profile: {} });
  assert.match(s.can, /cannot answer anyone yet/i);
  assert.equal(s.wont, null);
  assert.equal(s.missing.row, "name");
});

test("an ability names its channels and the row it runs on", () => {
  const rows = abilityRows({
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  assert.deepEqual(byId.open_times.channels, { voice: true, whatsapp: true });
  assert.match(byId.open_times.detail, /at that moment/i, "the phone asks live; chat is handed a snapshot");
  assert.equal(byId.open_times.runsOn.row, "calendar");

  assert.match(byId.booking_link.detail, /texts it to the number they rang from/i);

  assert.deepEqual(byId.transfer.channels, { voice: true, whatsapp: false });
  assert.deepEqual(byId.handoff.channels, { voice: false, whatsapp: true });

  assert.equal(byId.vision.on, false);
});

test("an ability whose input is missing says which row to fill", () => {
  const rows = abilityRows({
    voiceLive: true, whatsappLive: true, hasCalendarFeed: false,
    hasBookingLink: true, hasHandoffNumber: false, hasEscalateWhen: true, visionOn: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.open_times.ready, false);
  assert.equal(byId.transfer.ready, false);
  assert.match(byId.transfer.detail, /takes a message instead/i);
});

test("nothing is ready on a channel that is not answering", () => {
  // The contract the doc comment states. An input filled against a dead line is a
  // setting, not an ability: a workspace with nothing picking up must not be told
  // its receptionist sends the booking link.
  const dark = abilityRows({
    voiceLive: false, whatsappLive: false, hasCalendarFeed: true,
    hasBookingLink: true, hasHandoffNumber: true, hasEscalateWhen: true, visionOn: true,
  });
  for (const r of dark) assert.equal(r.ready, false, `${r.id} cannot be ready with nothing answering`);
  // And a phone-only workspace has no chat abilities, whatever is filled in.
  const phoneOnly = abilityRows({
    voiceLive: true, whatsappLive: false, hasCalendarFeed: true,
    hasBookingLink: true, hasHandoffNumber: true, hasEscalateWhen: true, visionOn: true,
  });
  const byId = Object.fromEntries(phoneOnly.map((r) => [r.id, r]));
  assert.equal(byId.handoff.ready, false, "there is no thread to hand over");
  assert.equal(byId.vision.ready, false, "and no photo to look at");
  assert.equal(byId.transfer.ready, true, "but a caller can still be put through");
});

test("what it cannot do is stated, and is not a setting", () => {
  const ids = CANNOT_ROWS.map((r) => r.id);
  assert.deepEqual(ids, ["book", "outbound_call", "sms"]);
  assert.match(CANNOT_ROWS[0].detail, /no appointments table/i);
  assert.match(CANNOT_ROWS[1].detail, /never dials/i);
  assert.equal(CANNOT_ROWS[2].soon, true);
});

const brain = { business_name: "Melany's Beauty Salon", phone_display: "+1 (308) 336-8109", booking_link: "https://booksy.com/x" };
const profile = {
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sat: { open: "09:30", close: "19:00" } },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome." }],
  escalate_when: ["They ask for Melany"],
  guardrails: { never_quote_prices: true },
};

test("the prompt is cut into blocks, each naming the row that wrote it", () => {
  const text = composeSystemPrompt(brain, profile, "whatsapp", "America/New_York");
  const blocks = promptBlocks(text, "whatsapp");

  const ids = blocks.map((b) => b.row);
  assert.ok(ids.includes("identity"), "who you are");
  assert.ok(ids.includes("hours"));
  assert.ok(ids.includes("services"));
  assert.ok(ids.includes("escalate_when"));
  assert.ok(ids.includes("guardrails"), "the rules compose into the prompt too");
  // The head block holds the tone and the languages, which have no heading of their own.
  const head = blocks.find((b) => b.row === "identity");
  assert.match(head.text, /^Tone: Warm and unhurried\./m);
  assert.match(head.text, /You speak: English, Spanish\./);

  // Each block carries its own size, and the sizes add up to the whole.
  const total = blocks.reduce((n, b) => n + b.chars, 0);
  assert.ok(total <= text.length, "blocks cannot claim more than the prompt holds");
  for (const b of blocks) assert.ok(b.chars > 0 && b.label.length > 0);
});

test("the hand-off block is WhatsApp's alone", () => {
  const wa = promptBlocks(composeSystemPrompt(brain, profile, "whatsapp", "America/New_York"), "whatsapp");
  const voice = promptBlocks(composeSystemPrompt(brain, profile, "voice", "America/New_York"), "voice");
  assert.ok(wa.some((b) => b.row === "escalate_when"), "chat is told how to hand over");
  assert.ok(!voice.some((b) => b.row === "escalate_when"), "the phone has its own transfer, so the block is absent");
  assert.match(wa.find((b) => b.row === "escalate_when").note ?? "", /WhatsApp only/i);
});

test("the call's hand-off is its own block, under its own heading", () => {
  // composeSystemPrompt writes a different heading on voice -- "Handing the caller
  // to a person:" -- driven by the transfer number, not by escalate_when. Missed, it
  // was folded silently into whatever block came before it.
  const withLine = { ...profile, handoff_number: "+16469325775" };
  const voice = promptBlocks(composeSystemPrompt(brain, withLine, "voice", "America/New_York"), "voice");
  const h = voice.find((b) => b.row === "handoff_number");
  assert.ok(h, "the call's hand-off has a block");
  assert.match(h.text, /transfer_to_staff/);
  assert.match(h.note ?? "", /Phone only/i);
  for (const b of voice) if (b.row !== "handoff_number") assert.doesNotMatch(b.text, /Handing the caller to a person/, `${b.row} does not swallow it`);
});

const own = "Never discuss competitors.\nA first name is all the personal data you need.";

test("the owner's own words are one block, on both channels", () => {
  // Pushed as `\n${text}`, sometimes under a header and sometimes not, so a cut on
  // headings alone folded them into whatever came before. They are the reason this
  // view exists: an owner has to be able to see their own words, and their size.
  const withOwn = { ...profile, extra_instructions: own };
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, withOwn, channel, "America/New_York");
    const blocks = promptBlocks(text, channel, withOwn.extra_instructions);
    const mine = blocks.filter((b) => b.row === "extra_instructions");
    assert.equal(mine.length, 1, `${channel}: one block for the owner's words`);
    assert.match(mine[0].text, /Never discuss competitors\./);
    assert.match(mine[0].text, /A first name is all/);
    for (const b of blocks) {
      if (b.row !== "extra_instructions") assert.doesNotMatch(b.text, /Never discuss competitors/, `${channel}: ${b.row} does not claim them`);
    }
  }
});

test("a prompt carried over from before the form is not mistaken for the rows it restates", () => {
  // Melany's owner text is exactly this: a prompt written before the form existed,
  // restating the hours and services under headings of its own. A cut on headings
  // would count the owner's old prose as the Hours and Services rows.
  const carried = { ...profile, extra_instructions: "You are the WhatsApp assistant.\nServices: balayage, cuts.\nOpening hours: 9 to 6." };
  const text = composeSystemPrompt(brain, carried, "whatsapp", "America/New_York");
  const blocks = promptBlocks(text, "whatsapp", carried.extra_instructions);
  const services = blocks.filter((b) => b.row === "services");
  assert.equal(services.length, 1, "the real services block, once");
  assert.doesNotMatch(services[0].text, /balayage, cuts/, "the owner's old line is not the services row");
  const hours = blocks.filter((b) => b.row === "hours");
  assert.equal(hours.length, 1);
  assert.doesNotMatch(hours[0].text, /9 to 6/);
  assert.match(blocks.find((b) => b.row === "extra_instructions").text, /Services: balayage, cuts\./);
});

test("text no row wrote is named as the platform's, and never folded into a row", () => {
  // The call's tool mechanics, the medium line and the open-times line are written
  // by Chanlytics for every workspace. With nothing else present, they used to land
  // in "Who you are" and grow it from 108 characters to 1,366 the owner never typed.
  const text = composeSystemPrompt(brain, {}, "voice", "America/New_York");
  const blocks = promptBlocks(text, "voice", null);
  const identity = blocks.find((b) => b.row === "identity");
  assert.doesNotMatch(identity.text, /check_availability|send_booking_link|end_call/, "the tools are not who you are");
  assert.doesNotMatch(identity.text, /speaking aloud/);
  const platform = blocks.filter((b) => b.row === "platform");
  assert.ok(platform.some((b) => /check_availability/.test(b.text)), "the tools are the platform's");
  assert.ok(platform.some((b) => /speaking aloud/.test(b.text)));
  for (const b of platform) assert.match(b.note ?? "", /every workspace/i);
});

test("every character belongs to exactly one block", () => {
  // The page draws a bar per block to show where the characters go. A bar that
  // quietly drops the separators is a small copy of the invisibility this exists to fix.
  const cases = [profile, { ...profile, extra_instructions: own }, { ...profile, handoff_number: "+16469325775" }, {}];
  for (const channel of ["whatsapp", "voice"]) {
    for (const p of cases) {
      const text = composeSystemPrompt(brain, p, channel, "America/New_York");
      const blocks = promptBlocks(text, channel, p.extra_instructions ?? null);
      assert.equal(blocks.reduce((n, b) => n + b.chars, 0), text.length, `${channel}: the bars add up to the prompt`);
      for (const b of blocks) assert.ok(b.text.trim().length > 0, `${channel}: ${b.row} is not empty`);
      // Adjacent blocks from the same row are one block.
      for (let n = 1; n < blocks.length; n++) assert.notEqual(blocks[n].row, blocks[n - 1].row, `${channel}: ${blocks[n].row} is not split in two`);
    }
  }
});
