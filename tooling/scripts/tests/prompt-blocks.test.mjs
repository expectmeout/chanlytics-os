/**
 * The Business tab's prompt view, as a pure function: what the receptionist reads, cut into the
 * blocks that wrote it, and whose words each block holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promptBlocks,
  composeSystemPrompt,
  resolveSystemPrompt,
  ownWordsOf,
  newReceptionistDefaults,
} from "@chanlytics/contracts";

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

const tz = "America/New_York";
const own = "Never discuss competitors.\nA first name is all the personal data you need.";
/** A prompt written before the workspace had fields, restating its hours and services under headings of its own. */
const OLD =
  "You are the WhatsApp assistant for Melany's Beauty Salon.\n\nServices:\n- Lashes, brows, nails.\n\nOpening hours: 9 to 6, closed Sundays.\n\nAlways end with [[HUMAN]] if unsure.";
/** The Autonomy tab's Booking and FAQ rows, both under "ask", so they compose into the prompt as rules. */
const ASK = { booking: { mode: "ask" }, faq: { mode: "ask" } };

/* ---- Whose words: the resolver's rule, stated once ---- */

test("the owner's words are what they wrote, or the prompt the resolver carries in their place", () => {
  const stored = { ...brain, system_prompt: OLD };
  assert.equal(ownWordsOf({ ...stored, profile: { hours: profile.hours, extra_instructions: "Mine." } }), "Mine.");
  for (const blank of [undefined, "", "   "]) {
    assert.equal(ownWordsOf({ ...stored, profile: { hours: profile.hours, extra_instructions: blank } }), OLD, `a box holding ${JSON.stringify(blank)} carries the prompt`);
  }
  assert.equal(ownWordsOf(stored), OLD, "with no fields, the prompt is read as it stands");
  assert.equal(ownWordsOf({ profile: { extra_instructions: "  " } }), null, "nothing written and nothing to carry");
  assert.equal(ownWordsOf(null), null);
  // And they are the words the resolver composes, on both channels.
  for (const p of [{ hours: profile.hours }, { hours: profile.hours, extra_instructions: "Mine." }]) {
    const b = { ...stored, profile: p };
    for (const channel of ["whatsapp", "voice"]) assert.ok(resolveSystemPrompt(b, channel, tz).includes(ownWordsOf(b).trim()), channel);
  }
});

/* ---- The cut: every block named, sized and its own ---- */

test("the prompt is cut into blocks, each naming the row that wrote it", () => {
  const text = composeSystemPrompt(brain, profile, "whatsapp", tz);
  const blocks = promptBlocks(text, "whatsapp", { profile });

  const rows = blocks.map((b) => b.row);
  assert.ok(rows.includes("identity"), "who you are");
  assert.ok(rows.includes("hours"));
  assert.ok(rows.includes("services"));
  assert.ok(rows.includes("handoff"));
  assert.ok(rows.includes("guardrails"), "the rules compose into the prompt too");
  // The head block holds the tone and the languages, which have no heading of their own.
  const head = blocks.find((b) => b.row === "identity");
  assert.match(head.text, /^Tone: Warm and unhurried\./m);
  assert.match(head.text, /You speak: English, Spanish\./);

  // Each block carries its own size, and the sizes add up to the whole.
  const total = blocks.reduce((n, b) => n + b.chars, 0);
  assert.ok(total <= text.length, "blocks cannot claim more than the prompt holds");
  for (const b of blocks) assert.ok(b.chars > 0 && b.label.length > 0);
});

test("every character belongs to exactly one block", () => {
  // The page draws a bar per block to show where the characters go. A bar that
  // quietly drops the separators is a small copy of the invisibility this exists to fix.
  const drafts = [profile, { ...profile, extra_instructions: own }, { ...profile, handoff_number: "+16469325775" }, {}];
  const stored = [
    { ...brain, system_prompt: OLD, profile: { hours: profile.hours } },
    { ...brain, system_prompt: newReceptionistDefaults("Melany's Beauty Salon").system_prompt, profile: { hours: profile.hours } },
    { ...brain, system_prompt: OLD },
    { ...brain, system_prompt: "" },
  ];
  for (const channel of ["whatsapp", "voice"]) {
    const cuts = [
      ...drafts.map((p) => [composeSystemPrompt(brain, p, channel, tz), { profile: p }]),
      ...stored.map((s) => [resolveSystemPrompt(s, channel, tz, new Date(), ASK), s]),
    ];
    for (const [text, from] of cuts) {
      const blocks = promptBlocks(text, channel, from);
      assert.equal(blocks.reduce((n, b) => n + b.chars, 0), text.length, `${channel}: the bars add up to the prompt`);
      for (const b of blocks) assert.ok(b.text.trim().length > 0, `${channel}: ${b.row} is not empty`);
      // Adjacent blocks from the same row are one block.
      for (let n = 1; n < blocks.length; n++) assert.notEqual(blocks[n].row, blocks[n - 1].row, `${channel}: ${blocks[n].row} is not split in two`);
      assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length, `${channel}: every id is its own`);
    }
  }
});

test("every block has an id of its own, and a row keeps its meaning", () => {
  // On a call the platform speaks on both sides of the owner's words, so a row can
  // recur, and a key or a test id built from the row collides there.
  const withOwn = { ...profile, extra_instructions: own };
  const blocks = promptBlocks(composeSystemPrompt(brain, withOwn, "voice", tz), "voice", { profile: withOwn });
  const ids = blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, `unique: ${ids.join(", ")}`);
  assert.equal(blocks.filter((b) => b.row === "platform").length, 2, "the platform, before and after the owner's words");
  for (const b of blocks) if (b.row !== "platform") assert.equal(b.id, b.row, `${b.row} appears once, so it is its own id`);
});

/* ---- The hand-off ---- */

test("the hand-off is one row on both channels, and carries the owner's reasons on both", () => {
  // The composer writes the owner's reasons into the call's hand-off too, under
  // "Handing the caller to a person:". Charged to the transfer number, a reason typed
  // into the hand-off row went missing from that row on a call, and a fold asking for
  // it on the phone found nothing.
  const withLine = { ...profile, handoff_number: "+16469325775" };
  for (const [channel, p] of [["whatsapp", profile], ["voice", profile], ["voice", withLine]]) {
    const blocks = promptBlocks(composeSystemPrompt(brain, p, channel, tz), channel, { profile: p });
    const h = blocks.filter((b) => b.row === "handoff");
    assert.equal(h.length, 1, `${channel}: one hand-off block`);
    assert.match(h[0].text, /They ask for Melany/, `${channel}: the reasons are the hand-off's`);
    assert.ok(!blocks.some((b) => b.row === "escalate_when" || b.row === "handoff_number"), `${channel}: and it goes by one name`);
    for (const b of blocks) {
      if (b.row !== "handoff") assert.doesNotMatch(b.text, /They ask for Melany|Handing the (conversation|caller) to a person/, `${channel}: ${b.row} does not swallow it`);
    }
  }
  const call = promptBlocks(composeSystemPrompt(brain, withLine, "voice", tz), "voice", { profile: withLine });
  assert.match(call.find((b) => b.row === "handoff").text, /transfer_to_staff/, "with a number, the call's hand-off transfers");
});

test("the hand-off says it is always sent, and promises nothing its channel cannot do", () => {
  // It is written whether or not there are reasons -- the promise that anything it
  // should not decide reaches a person depends on it -- so the note says why it is
  // there on a record that has typed nothing into it.
  for (const p of [profile, {}]) {
    const wa = promptBlocks(composeSystemPrompt(brain, p, "whatsapp", tz), "whatsapp", { profile: p }).find((b) => b.row === "handoff");
    const call = promptBlocks(composeSystemPrompt(brain, p, "voice", tz), "voice", { profile: p }).find((b) => b.row === "handoff");
    for (const h of [wa, call]) assert.match(h.note ?? "", /always sent/i);
    // Chat hands the thread over. It has no transfer to promise.
    assert.doesNotMatch(wa.note, /transfer/i);
    // A call with no number takes a message, so its note cannot promise a transfer outright.
    assert.match(call.note, /message/i);
  }
});

/* ---- The owner's words: fenced off first, and named for who wrote them ---- */

test("the owner's own words are one block, on both channels", () => {
  // Pushed as `\n${text}`, sometimes under a header and sometimes not, so a cut on
  // headings alone folded them into whatever came before. They are the reason this
  // view exists: an owner has to be able to see their own words, and their size.
  const withOwn = { ...profile, extra_instructions: own };
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, withOwn, channel, tz);
    const blocks = promptBlocks(text, channel, { profile: withOwn });
    const mine = blocks.filter((b) => b.row === "extra_instructions");
    assert.equal(mine.length, 1, `${channel}: one block for the owner's words`);
    assert.match(mine[0].text, /Never discuss competitors\./);
    assert.match(mine[0].text, /A first name is all/);
    assert.equal(mine[0].note, undefined, `${channel}: typed by the owner, so nothing to say about where they came from`);
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
  const text = composeSystemPrompt(brain, carried, "whatsapp", tz);
  const blocks = promptBlocks(text, "whatsapp", { profile: carried });
  const services = blocks.filter((b) => b.row === "services");
  assert.equal(services.length, 1, "the real services block, once");
  assert.doesNotMatch(services[0].text, /balayage, cuts/, "the owner's old line is not the services row");
  const hours = blocks.filter((b) => b.row === "hours");
  assert.equal(hours.length, 1);
  assert.doesNotMatch(hours[0].text, /9 to 6/);
  assert.match(blocks.find((b) => b.row === "extra_instructions").text, /Services: balayage, cuts\./);
});

test("an owner's own rules heading does not start the rules block inside their words", () => {
  // The fence's second mechanism, beside the carried headings: an owner who wrote a line
  // that opens like the platform's rules must keep that line as theirs.
  const mine = "Be warm.\nRules you must follow: always greet by name.";
  const withRules = { ...profile, extra_instructions: mine };
  const text = composeSystemPrompt(brain, withRules, "whatsapp", "America/New_York");
  const blocks = promptBlocks(text, "whatsapp", { profile: withRules });
  assert.match(blocks.find((b) => b.row === "extra_instructions").text, /Rules you must follow: always greet by name\./);
  const rules = blocks.filter((b) => b.row === "guardrails");
  assert.equal(rules.length, 1, "the platform's own rules block, once");
  assert.doesNotMatch(rules[0].text, /always greet by name/);
});

test("the prompt the resolver carries is found where the owner's words go, not cut on its own headings", () => {
  // The page shows the RESOLVED prompt, and a profile whose own words are blank carries
  // the workspace's old prompt in their place. Looking for the profile's blank field
  // found nothing, and the old prose was cut on its own headings: "Lashes" charged to
  // Services on a record that has no services at all.
  const stored = { ...brain, system_prompt: OLD, profile: { hours: profile.hours } };
  for (const channel of ["whatsapp", "voice"]) {
    const blocks = promptBlocks(resolveSystemPrompt(stored, channel, tz), channel, stored);
    const mine = blocks.filter((b) => b.row === "extra_instructions");
    assert.equal(mine.length, 1, `${channel}: the carried prompt is one block`);
    assert.match(mine[0].text, /Lashes, brows, nails/);
    assert.match(mine[0].text, /9 to 6, closed Sundays/);
    assert.ok(!blocks.some((b) => b.row === "services"), `${channel}: a row with nothing in it writes nothing`);
    assert.doesNotMatch(blocks.find((b) => b.row === "hours").text, /9 to 6/);
    // The owner's box shows these words as carried, not typed, and so does the block.
    assert.match(mine[0].note ?? "", /before it had fields/i);
  }
});

test("what the prompt was composed from decides whose words are looked for", () => {
  // Only the resolver carries. A fold composes its draft with composeSystemPrompt,
  // which never does, so its words are the draft's; the sheet cuts the resolved prompt,
  // where a blank box means the carried prompt IS what the receptionist reads.
  const draft = { ...profile, extra_instructions: "Only what the draft says." };
  const folded = promptBlocks(composeSystemPrompt(brain, draft, "whatsapp", tz), "whatsapp", { profile: draft });
  assert.match(folded.find((b) => b.row === "extra_instructions").text, /^Only what the draft says\.$/m);

  const blank = { ...brain, system_prompt: OLD, profile: { ...draft, extra_instructions: "  " } };
  const resolved = promptBlocks(resolveSystemPrompt(blank, "whatsapp", tz), "whatsapp", blank);
  const carried = resolved.find((b) => b.row === "extra_instructions");
  assert.match(carried.text, /Lashes, brows, nails/);
  assert.doesNotMatch(carried.text, /Only what the draft says/);
});

test("the product's opening lines are not the owner's words, even where theirs would go", () => {
  // Every workspace the form sets up gets them as its prompt, and the resolver carries
  // them like any other until the owner writes their own. The owner's box shows them as
  // empty (instructionsDraft), so charging them to "In your own words" would give every
  // new workspace a share of words nobody there wrote.
  const { system_prompt } = newReceptionistDefaults("Melany's Beauty Salon");
  for (const stored of [{ ...brain, system_prompt, profile: { hours: profile.hours } }, { ...brain, system_prompt }]) {
    for (const channel of ["whatsapp", "voice"]) {
      const blocks = promptBlocks(resolveSystemPrompt(stored, channel, tz), channel, stored);
      const where = stored.profile ? "with fields" : "with none";
      assert.ok(!blocks.some((b) => b.row === "extra_instructions"), `${channel}, ${where}: the owner wrote none of it`);
      assert.ok(blocks.some((b) => b.row === "platform" && b.text.includes(system_prompt)), `${channel}, ${where}: it is the platform's`);
    }
  }
});

/* ---- What no row on this page wrote ---- */

test("text no row wrote is named as the platform's, and never folded into a row", () => {
  // The call's tool mechanics, the medium line and the open-times line are written
  // by Chanlytics for every workspace. With nothing else present, they used to land
  // in "Who you are" and grow it from 108 characters to 1,366 the owner never typed.
  const text = composeSystemPrompt(brain, {}, "voice", tz);
  const blocks = promptBlocks(text, "voice", { profile: {} });
  const identity = blocks.find((b) => b.row === "identity");
  assert.doesNotMatch(identity.text, /check_availability|send_booking_link|end_call/, "the tools are not who you are");
  assert.doesNotMatch(identity.text, /speaking aloud/);
  const platform = blocks.filter((b) => b.row === "platform");
  assert.ok(platform.some((b) => /check_availability/.test(b.text)), "the tools are the platform's");
  assert.ok(platform.some((b) => /speaking aloud/.test(b.text)));
  for (const b of platform) assert.match(b.note ?? "", /every workspace/i);
});

test("with no fields, the prompt is the workspace's own, and the only rules are Autonomy's", () => {
  // The resolver hands back a prompt it did not compose as it stands, adding only the
  // Autonomy tab's Booking and FAQ rows. None of that is the guardrails row's -- it
  // composes nothing into a prompt with no fields -- and none of the prose is a row's
  // for having a line that looks like one of their headings.
  const stored = { ...brain, system_prompt: OLD };
  for (const channel of ["whatsapp", "voice"]) {
    const blocks = promptBlocks(resolveSystemPrompt(stored, channel, tz, new Date(), ASK), channel, stored);
    assert.deepEqual(blocks.map((b) => b.row), ["extra_instructions", "autonomy"], channel);
    assert.match(blocks[1].text, /^Rules you must follow:/);
    assert.match(blocks[1].note ?? "", /Autonomy/);
  }
  const quiet = promptBlocks(resolveSystemPrompt(stored, "whatsapp", tz), "whatsapp", stored);
  assert.deepEqual(quiet.map((b) => b.row), ["extra_instructions"], "with nothing set to ask, there are no rules to show");
  // A blank prompt leaves no owner's words to anchor on. Autonomy's rows are still not the guardrails.
  const blank = { ...brain, system_prompt: "" };
  const alone = promptBlocks(resolveSystemPrompt(blank, "whatsapp", tz, new Date(), ASK), "whatsapp", blank);
  assert.deepEqual(alone.map((b) => b.row), ["autonomy"]);
});

/* ---- The caller says what the prompt was composed from ---- */

test("a caller has to say what the prompt was composed from", () => {
  // Optional, this argument made the original bug the default: a caller that left it
  // out got the owner's words folded into a neighbour, silently. The page that calls it
  // is untyped JSX, so a type alone would not have stopped it.
  const text = composeSystemPrompt(brain, profile, "whatsapp", tz);
  assert.throws(() => promptBlocks(text, "whatsapp"), TypeError);
  // The owner's words as a bare string is the shape this replaced. It cannot say whether
  // they were carried, and a caller cutting the resolved prompt would pass the wrong ones.
  assert.throws(() => promptBlocks(text, "whatsapp", own), TypeError);
  assert.doesNotThrow(() => promptBlocks(text, "whatsapp", null), "null says there is nothing to look for");
});
