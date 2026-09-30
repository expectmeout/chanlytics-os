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
  PROMPT_OPENINGS,
  whoseWords,
  instructionsDraft,
  hasProfile,
  policyRules,
  NO_FIELDS_COMPOSED_WORDS,
  RULES_WITHOUT_FIELDS_WORDS,
  DATA_NOT_INSTRUCTIONS,
} from "@chanlytics/contracts";

const brain = {
  business_name: "Marisa's Beauty Salon",
  phone_display: "+1 (305) 555-0123",
  booking_link: "https://booksy.com/x",
};
const profile = {
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  address: "1200 Maple Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sat: { open: "09:30", close: "19:00" } },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome." }],
  escalate_when: ["They ask for Marisa"],
  guardrails: { never_quote_prices: true },
};

const tz = "America/New_York";
const own = "Never discuss competitors.\nA first name is all the personal data you need.";
/** A prompt written before the workspace had fields, restating its hours and services under headings of its own. */
const OLD =
  "You are the WhatsApp assistant for Marisa's Beauty Salon.\n\nServices:\n- Lashes, brows, nails.\n\nOpening hours: 9 to 6, closed Sundays.\n\nAlways end with [[HUMAN]] if unsure.";
/** The Autonomy tab's Booking and FAQ rows, both under "ask", so they compose into the prompt as rules. */
const ASK = { booking: { mode: "ask" }, faq: { mode: "ask" } };
const NOW = new Date("2026-09-21T15:00:00Z");
/** The product's own opening lines, as a new workspace is given them, and as one named earlier would still have them. */
const BASELINE = newReceptionistDefaults("Marisa's Beauty Salon").system_prompt;
const BASELINE_EARLIER_NAME = newReceptionistDefaults("Marisa's Salon").system_prompt;

/* ---- Whose words: the resolver's rule, stated once ---- */

test("the owner's words are what they wrote, or the prompt the resolver carries in their place", () => {
  const stored = { ...brain, system_prompt: OLD };
  assert.equal(ownWordsOf({ ...stored, profile: { hours: profile.hours, extra_instructions: "Mine." } }), "Mine.");
  for (const blank of [undefined, "", "   "]) {
    assert.equal(
      ownWordsOf({ ...stored, profile: { hours: profile.hours, extra_instructions: blank } }),
      OLD,
      `a box holding ${JSON.stringify(blank)} carries the prompt`,
    );
  }
  assert.equal(ownWordsOf(stored), OLD, "with no fields, the prompt is read as it stands");
  assert.equal(ownWordsOf({ profile: { extra_instructions: "  " } }), null, "nothing written and nothing to carry");
  assert.equal(ownWordsOf(null), null);
  // And they are the words the resolver composes, on both channels.
  for (const p of [{ hours: profile.hours }, { hours: profile.hours, extra_instructions: "Mine." }]) {
    const b = { ...stored, profile: p };
    for (const channel of ["whatsapp", "voice"])
      assert.ok(resolveSystemPrompt(b, channel, tz).includes(ownWordsOf(b).trim()), channel);
  }
});

test("whose words these are is decided once, wherever they are stored", () => {
  const stored = (p, system_prompt = OLD) => ({ ...brain, system_prompt, ...(p === undefined ? {} : { profile: p }) });
  const hours = profile.hours;
  const cases = [
    ["the owner's own, over a prompt", stored({ hours, extra_instructions: own }), "own", own],
    ["the owner's own, with no prompt behind them", stored({ extra_instructions: own }, ""), "own", own],
    ["the owner's own, over the baseline", stored({ hours, extra_instructions: own }, BASELINE), "own", own],
    ["a blank box: the prompt is carried in", stored({ hours, extra_instructions: "  " }), "carried", OLD],
    ["fields and no box: the prompt is carried in", stored({ hours }), "carried", OLD],
    ["no profile: the workspace's prompt, as it stands", stored(undefined), "prompt", OLD],
    // No profile to the resolver, which hands the prompt back as it stands (hasProfile).
    ["a profile with nothing the resolver composes from", stored({}), "prompt", OLD],
    ["a profile holding only closures, which expire", stored({ closures: [{ date: "2026-12-24" }] }), "prompt", OLD],
    ["the baseline as the prompt, with fields", stored({ hours }, BASELINE), "baseline", BASELINE],
    ["the baseline as the prompt, with none", stored(undefined, BASELINE), "baseline", BASELINE],
    [
      "the baseline under the name the business had",
      stored(undefined, BASELINE_EARLIER_NAME),
      "baseline",
      BASELINE_EARLIER_NAME,
    ],
    [
      "the baseline in the owner's own field, where saves before S4 put it",
      stored({ hours, extra_instructions: BASELINE }),
      "baseline",
      BASELINE,
    ],
    ["nothing written and nothing to carry", stored({ hours, extra_instructions: "" }, ""), "none", null],
    ["a prompt of spaces", stored({ hours }, "   "), "none", null],
    ["no brain", null, "none", null],
  ];
  for (const [what, b, kind, text] of cases) assert.deepEqual(whoseWords(b), { kind, text }, what);
  // The words are ownWordsOf's, the resolver's own rule, whoever's they are.
  for (const [what, b, kind] of cases) if (kind !== "none") assert.equal(whoseWords(b).text, ownWordsOf(b), what);
});

test("the instructions box opens by the prompt view's one rule, and exactly two rows moved to get there", () => {
  // instructionsDraft asks whoseWords (plan Task 3.8), so the box and the view read the owner's
  // field by one rule: the owner's own words open as theirs, a prompt standing in their place
  // opens marked carried, and the product's own opening lines -- in the stored prompt or in the
  // owner's own field -- open an EMPTY box, because no owner wrote them. Each row: what the box
  // opened with on main, and what it opens with now. The two rows that move are named in
  // `moved` below; every other row opens as the form that is live has always opened it.
  const EMPTY = { text: "", carried: false };
  const hours = profile.hours;
  const rows = [
    ["no brain", null, EMPTY, EMPTY],
    ["a brain with nothing in it", {}, EMPTY, EMPTY],
    [
      "the owner's own words",
      { ...brain, system_prompt: OLD, profile: { hours, extra_instructions: own } },
      { text: own, carried: false },
      { text: own, carried: false },
    ],
    [
      "the owner's own words, with the spaces they were stored with",
      { ...brain, system_prompt: OLD, profile: { extra_instructions: "  Mine.\n" } },
      { text: "  Mine.\n", carried: false },
      { text: "  Mine.\n", carried: false },
    ],
    [
      "the owner's own words, over the baseline",
      { ...brain, system_prompt: BASELINE, profile: { hours, extra_instructions: own } },
      { text: own, carried: false },
      { text: own, carried: false },
    ],
    [
      "a blank box over the old prompt",
      { ...brain, system_prompt: OLD, profile: { hours, extra_instructions: "   " } },
      { text: OLD, carried: true },
      { text: OLD, carried: true },
    ],
    [
      "fields and no box, over the old prompt",
      { ...brain, system_prompt: OLD, profile: { hours } },
      { text: OLD, carried: true },
      { text: OLD, carried: true },
    ],
    [
      "no profile, over the old prompt",
      { ...brain, system_prompt: OLD },
      { text: OLD, carried: true },
      { text: OLD, carried: true },
    ],
    [
      "an empty profile, over the old prompt",
      { ...brain, system_prompt: OLD, profile: {} },
      { text: OLD, carried: true },
      { text: OLD, carried: true },
    ],
    [
      "the baseline as the prompt, with fields",
      { ...brain, system_prompt: BASELINE, profile: { hours } },
      EMPTY,
      EMPTY,
    ],
    ["the baseline as the prompt, with none", { ...brain, system_prompt: BASELINE }, EMPTY, EMPTY],
    [
      "the baseline under an earlier name, as the prompt",
      { ...brain, system_prompt: BASELINE_EARLIER_NAME },
      EMPTY,
      EMPTY,
    ],
    ["a prompt of spaces", { ...brain, system_prompt: "   ", profile: { hours } }, EMPTY, EMPTY],
    [
      "the baseline in the owner's box",
      { ...brain, system_prompt: OLD, profile: { hours, extra_instructions: BASELINE } },
      { text: BASELINE, carried: false },
      EMPTY,
    ],
    [
      "the baseline under an earlier name in the owner's box",
      { ...brain, system_prompt: BASELINE, profile: { hours, extra_instructions: BASELINE_EARLIER_NAME } },
      { text: BASELINE_EARLIER_NAME, carried: false },
      EMPTY,
    ],
  ];
  const moved = [];
  for (const [what, b, before, now] of rows) {
    assert.deepEqual(instructionsDraft(b), now, what);
    if (JSON.stringify(before) !== JSON.stringify(now)) moved.push(what);
  }
  assert.deepEqual(
    moved,
    ["the baseline in the owner's box", "the baseline under an earlier name in the owner's box"],
    "exactly the two rows this task moves, and no others: the product's own opening lines in the owner's own field, where a save before S4 copied them. The view has always called them the platform's; the box agrees now and opens empty, since no owner wrote them. Nothing an owner typed moves with them -- the owner's field is read under the strict test (isBaselineInOwnersField), pinned below.",
  );
});

test("the box and the prompt view agree on whose words these are", () => {
  // Phase 3 puts both on one page. A block charged to the owner's row is words the box opens
  // with; a block that says where its words came from is a box that says it was carried in.
  const hours = profile.hours;
  const shapes = [
    ["own words", { ...brain, system_prompt: OLD, profile: { hours, extra_instructions: own } }],
    ["carried", { ...brain, system_prompt: OLD, profile: { hours } }],
    ["no fields", { ...brain, system_prompt: OLD }],
    ["an empty profile", { ...brain, system_prompt: OLD, profile: {} }],
    ["the baseline as the prompt", { ...brain, system_prompt: BASELINE, profile: { hours } }],
    ["the baseline with no fields", { ...brain, system_prompt: BASELINE }],
    // The case the two knowingly disagreed on until Phase 3 (plan Task 3.8), reconciled: the box
    // opens empty and the view charges the words to the platform. Pinned on its own below too.
    [
      "the baseline in the owner's box",
      { ...brain, system_prompt: OLD, profile: { hours, extra_instructions: BASELINE } },
    ],
    ["nothing at all", { ...brain, system_prompt: "", profile: { hours } }],
  ];
  for (const [what, b] of shapes) {
    const box = instructionsDraft(b);
    for (const channel of ["whatsapp", "voice"]) {
      const blocks = promptBlocks(resolveSystemPrompt(b, channel, tz, NOW, ASK), channel, b);
      const mine = blocks.find((x) => x.row === "extra_instructions");
      assert.equal(
        Boolean(mine),
        box.text !== "",
        `${channel}, ${what}: the view has the owner's block exactly when the box has words`,
      );
      if (mine) {
        assert.ok(mine.text.includes(box.text.trim()), `${channel}, ${what}: and they are the box's words`);
        assert.equal(
          Boolean(mine.note),
          box.carried,
          `${channel}, ${what}: and both say, or neither says, that they were carried in`,
        );
      }
    }
  }
});

test("a workspace whose fields compose nothing is told its prompt is read as it stands", () => {
  // The carried note says the prompt is the one it "had before it had fields" -- not true of a
  // workspace that has none, whose prompt the resolver hands back exactly as stored.
  for (const stored of [
    { ...brain, system_prompt: OLD },
    { ...brain, system_prompt: OLD, profile: {} },
  ]) {
    for (const channel of ["whatsapp", "voice"]) {
      const mine = promptBlocks(resolveSystemPrompt(stored, channel, tz), channel, stored).find(
        (b) => b.row === "extra_instructions",
      );
      assert.equal(mine.text, OLD.trim(), `${channel}: the prompt, word for word`);
      assert.doesNotMatch(mine.note ?? "", /before it had fields/, channel);
      // The second sentence is the rules fold's own, not a near-miss of it: one sentence, in contracts, built
      // into both notes on this page (the plan's M-2).
      assert.equal(mine.note, `This workspace's own prompt, read as it stands. ${NO_FIELDS_COMPOSED_WORDS}`, channel);
      assert.ok(RULES_WITHOUT_FIELDS_WORDS.startsWith(NO_FIELDS_COMPOSED_WORDS), "and the rules fold opens with it");
    }
  }
});

test("the resolver composes the typed details with the owner's words as ownWordsOf names them", () => {
  // Spec 7.3's equivalence. With no platform facts (known = null), a workspace whose fields
  // compose is composeSystemPrompt over the details it typed and its profile, the owner's slot
  // holding ownWordsOf's words; one whose fields compose nothing is its stored prompt as it
  // stands, with only the Autonomy tab's rules after it.
  const typed = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const profiles = [
    undefined,
    {},
    { closures: [{ date: "2026-12-24" }] },
    { hours: profile.hours },
    profile,
    { ...profile, extra_instructions: own },
    { ...profile, extra_instructions: "  " },
    { ...profile, extra_instructions: BASELINE },
    {
      ...profile,
      handoff_number: "+12125550142",
      closures: [{ date: "2026-12-24", until: "2026-12-26", note: "Holidays" }],
      booking_rules: { lead_hours: 0, party_max: 2 },
    },
  ];
  const prompts = [OLD, BASELINE, ""];
  const phones = [undefined, "+1 (305) 555-0123", "  (212) 555-0142  "];
  const policies = [null, ASK, { booking: { mode: "ask" } }, { reply: { mode: "ask" } }];
  let composed = 0,
    asStored = 0;
  for (const p of profiles)
    for (const system_prompt of prompts)
      for (const phone of phones)
        for (const policy of policies) {
          const b = {
            business_name: brain.business_name,
            booking_link: brain.booking_link,
            system_prompt,
            ...(phone === undefined ? {} : { phone_display: phone }),
            ...(p === undefined ? {} : { profile: p }),
          };
          for (const channel of ["whatsapp", "voice"])
            for (const zone of [null, tz]) {
              const got = resolveSystemPrompt(b, channel, zone, NOW, policy, null);
              let want;
              if (hasProfile(b.profile)) {
                composed++;
                want = composeSystemPrompt(
                  { business_name: b.business_name, phone_display: typed(phone), booking_link: b.booking_link },
                  { ...b.profile, extra_instructions: ownWordsOf(b) ?? undefined },
                  channel,
                  zone,
                  NOW,
                  policy,
                );
              } else {
                asStored++;
                // The Autonomy rows in force, then the standing rules (the money row, the fence): never none.
                const rules = [...policyRules(policy, channel), DATA_NOT_INSTRUCTIONS];
                want = `${system_prompt}\n\n${PROMPT_OPENINGS.rules}\n${rules.map((r) => `- ${r}`).join("\n")}`;
              }
              assert.equal(
                got,
                want,
                `${channel}, ${zone}, ${JSON.stringify(p)?.slice(0, 60)}, ${JSON.stringify(policy)}`,
              );
            }
        }
  // Both paths, every combination: six profiles that compose and three that do not.
  assert.deepEqual({ composed, asStored }, { composed: 864, asStored: 432 });
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
  const drafts = [profile, { ...profile, extra_instructions: own }, { ...profile, handoff_number: "+12125550142" }, {}];
  const stored = [
    { ...brain, system_prompt: OLD, profile: { hours: profile.hours } },
    {
      ...brain,
      system_prompt: newReceptionistDefaults("Marisa's Beauty Salon").system_prompt,
      profile: { hours: profile.hours },
    },
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
      assert.equal(
        blocks.reduce((n, b) => n + b.chars, 0),
        text.length,
        `${channel}: the bars add up to the prompt`,
      );
      for (const b of blocks) assert.ok(b.text.trim().length > 0, `${channel}: ${b.row} is not empty`);
      // Adjacent blocks from the same row are one block.
      for (let n = 1; n < blocks.length; n++)
        assert.notEqual(blocks[n].row, blocks[n - 1].row, `${channel}: ${blocks[n].row} is not split in two`);
      assert.equal(new Set(blocks.map((b) => b.id)).size, blocks.length, `${channel}: every id is its own`);
    }
  }
});

test("each block carries its share of the whole, and the shares make the whole", () => {
  // The prompt sheet draws a block's cost as a share, never a count (the owner's 22 Sep rule): the page divides
  // nothing, so the share is the cut's own, over the prompt it cut.
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, everything, channel, tz, NOW, ASK);
    const blocks = promptBlocks(text, channel, { profile: everything });
    for (const b of blocks) assert.equal(b.share, b.chars / text.length, `${channel}: ${b.id}`);
    const whole = blocks.reduce((n, b) => n + b.share, 0);
    assert.ok(Math.abs(whole - 1) < 1e-9, `${channel}: the shares add up to everything it reads (${whole})`);
  }
  assert.deepEqual(promptBlocks("", "whatsapp", null), [], "nothing to cut, nothing to share");
});

test("every block has an id of its own, and a row keeps its meaning", () => {
  // On a call the platform speaks on both sides of the owner's words, so a row can
  // recur, and a key or a test id built from the row collides there.
  const withOwn = { ...profile, extra_instructions: own };
  const blocks = promptBlocks(composeSystemPrompt(brain, withOwn, "voice", tz), "voice", { profile: withOwn });
  const ids = blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, `unique: ${ids.join(", ")}`);
  assert.equal(
    blocks.filter((b) => b.row === "platform").length,
    2,
    "the platform, before and after the owner's words",
  );
  for (const b of blocks)
    if (b.row !== "platform") assert.equal(b.id, b.row, `${b.row} appears once, so it is its own id`);
});

/* ---- The cut follows the composer's own openings ---- */

/** Every section the composer can write, filled in, with the owner's own words and Autonomy's rules. */
const everything = {
  ...profile,
  website: "https://marisas.example",
  closures: [{ date: "2026-12-24", until: "2026-12-26", note: "Holidays" }],
  booking_rules: {
    lead_hours: 2,
    consult_first: ["Color correction"],
    party_max: 4,
    notes: ["No children under five."],
  },
  handoff_number: "+12125550142",
  extra_instructions: own,
};

test("with every section present, the blocks are the composer's sections, in its order", () => {
  // The test each drifted opening would have failed. A mark that stopped matching the
  // composer folded its section into the block above: the closures into the hours, the
  // booking rules into the notes, the medium line into the owner's own words.
  const O = PROMPT_OPENINGS;
  const want = {
    whatsapp: [
      ["identity", "You are the assistant for Marisa's Beauty Salon"],
      ["hours", O.hours],
      ["closures", O.closures],
      ["services", O.services],
      ["notes", O.notes],
      ["booking_rules", O.bookingRules],
      ["handoff", O.handoffChat],
      ["extra_instructions", O.ownWordsUnderDetails],
      ["platform", O.chatMedium],
      ["guardrails", O.rules],
    ],
    voice: [
      ["identity", "You are the assistant for Marisa's Beauty Salon"],
      ["hours", O.hours],
      ["closures", O.closures],
      ["services", O.services],
      ["notes", O.notes],
      ["booking_rules", O.bookingRules],
      ["handoff", O.handoffCall],
      ["platform", O.callTools],
      ["extra_instructions", O.ownWordsUnderDetails],
      ["platform", O.callMedium],
      ["guardrails", O.rules],
    ],
  };
  for (const channel of ["whatsapp", "voice"]) {
    const blocks = promptBlocks(composeSystemPrompt(brain, everything, channel, tz, NOW, ASK), channel, {
      profile: everything,
    });
    assert.deepEqual(
      blocks.map((b) => b.row),
      want[channel].map(([row]) => row),
      `${channel}: the rows, in order`,
    );
    blocks.forEach((b, n) =>
      assert.ok(
        b.text.startsWith(want[channel][n][1]),
        `${channel}: ${b.id} opens with its own opening, not ${JSON.stringify(b.text.slice(0, 50))}`,
      ),
    );
    // The owner's block is their words under the one line the composer frames them with, and
    // nothing after them: a medium line that stopped matching would have ended up in here.
    const mine = blocks.find((b) => b.row === "extra_instructions").text.split("\n");
    assert.equal(mine.slice(1).join("\n"), own, `${channel}: the owner's words, and only theirs, under the frame`);
    // The platform's last block carries the open-times line too, on a line of its own.
    assert.ok(
      blocks
        .at(-2)
        .text.split("\n")
        .some((l) => l.startsWith(O.openTimes)),
      `${channel}: the open-times line is the platform's`,
    );
  }
});

test("the composer writes every opening the prompt view cuts on, once, at the start of a line", () => {
  const O = PROMPT_OPENINGS;
  const openings = {
    whatsapp: [
      O.hours,
      O.closures,
      O.services,
      O.notes,
      O.bookingRules,
      O.handoffChat,
      O.ownWordsUnderDetails,
      O.chatMedium,
      O.openTimes,
      O.rules,
    ],
    voice: [
      O.hours,
      O.closures,
      O.services,
      O.notes,
      O.bookingRules,
      O.handoffCall,
      O.callTools,
      O.ownWordsUnderDetails,
      O.callMedium,
      O.openTimes,
      O.rules,
    ],
  };
  for (const channel of ["whatsapp", "voice"]) {
    const lines = composeSystemPrompt(brain, everything, channel, tz, NOW, ASK).split("\n");
    for (const opening of openings[channel]) {
      assert.equal(lines.filter((l) => l.startsWith(opening)).length, 1, `${channel}: ${opening}`);
    }
  }
  // On a call with nothing above to disagree with, the frame is the call's line alone, and it
  // comes with the owner's words rather than staying with whatever sits above them.
  const bare = { tone: "Warm.", extra_instructions: own };
  const call = composeSystemPrompt(brain, bare, "voice", tz, NOW);
  assert.equal(call.split("\n").filter((l) => l.startsWith(O.ownWordsOnACall)).length, 1);
  const blocks = promptBlocks(call, "voice", { profile: bare });
  const mine = blocks.find((b) => b.row === "extra_instructions");
  assert.ok(mine.text.startsWith(O.ownWordsOnACall), "the frame opens the owner's block");
  assert.equal(mine.text.split("\n").slice(1).join("\n"), own);
  for (const b of blocks)
    if (b.row !== "extra_instructions")
      assert.ok(!b.text.includes(O.ownWordsOnACall), `${b.id} does not keep the frame`);
});

test("a heading repeated inside a later block does not start a second block", () => {
  // Each opening is taken once. A note can run to several lines, and one of them can open
  // like a heading the composer has already written; it stays the note's.
  const noted = {
    ...profile,
    notes: [{ title: "Parking", text: "Street parking only.\nServices: we also do lashes on Fridays." }],
  };
  for (const channel of ["whatsapp", "voice"]) {
    const blocks = promptBlocks(composeSystemPrompt(brain, noted, channel, tz, NOW), channel, { profile: noted });
    assert.equal(blocks.filter((b) => b.row === "services").length, 1, `${channel}: one services block`);
    assert.match(
      blocks.find((b) => b.row === "notes").text,
      /^Services: we also do lashes on Fridays\.$/m,
      `${channel}: the note keeps its own line`,
    );
  }
});

test("a note's own line that reads like a section the record does not have is still the note's (M-5)", () => {
  // Found in the Phase 1 re-review: "each opening is taken once" guards only a heading the composer HAS written. On a
  // record with no services, a note whose second line opened "Services:" was the first such line, so it became a
  // Services block of its own, charged to a row the record does not fill. The composer writes every opening after a
  // blank line (`\n${heading}`), and a note's second line never follows one.
  const noted = {
    ...profile,
    services: undefined,
    notes: [
      { title: "Parking", text: "Street parking only.\nServices: we also do lashes on Fridays." },
      { title: "Cards", text: "We take cards.\nBooking rules: none, walk in any time." },
    ],
  };
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, noted, channel, tz, NOW);
    const blocks = promptBlocks(text, channel, { profile: noted });
    assert.deepEqual(
      blocks.filter((b) => b.row === "services" || b.row === "booking_rules").map((b) => b.id),
      [],
      `${channel}: no block for a row the record does not fill`,
    );
    const notes = blocks.find((b) => b.row === "notes").text;
    assert.match(notes, /^Services: we also do lashes on Fridays\.$/m, `${channel}: the note keeps its line`);
    assert.match(notes, /^Booking rules: none, walk in any time\.$/m, `${channel}: and its other one`);
    assert.equal(
      blocks.reduce((n, b) => n + b.chars, 0),
      text.length,
      `${channel}: every character still belongs to one block`,
    );
  }
});

test("a note with a blank line in it still cannot open a section that comes before the notes (M-5, the review's case)", () => {
  // A blank line inside a note satisfies "after a blank line", so that rule alone let "Park at the back.\n\nServices:
  // ask us." cut a Services block on a record with no services. The composer writes its openings in one fixed order,
  // so an opening the prompt view has already passed the place of cannot be the composer's.
  const noted = {
    ...profile,
    services: undefined,
    hours: undefined,
    notes: [
      { title: "Parking", text: "Park at the back.\n\nServices: ask us." },
      { title: "Evenings", text: "Late on Fridays.\n\nOpening hours: see the door." },
    ],
  };
  for (const channel of ["whatsapp", "voice"]) {
    const text = composeSystemPrompt(brain, noted, channel, tz, NOW);
    const blocks = promptBlocks(text, channel, { profile: noted });
    assert.deepEqual(
      blocks.filter((b) => b.row === "services" || b.row === "hours").map((b) => b.id),
      [],
      `${channel}: no block for a row the record does not fill`,
    );
    const notes = blocks.find((b) => b.row === "notes").text;
    assert.match(notes, /^Services: ask us\.$/m, `${channel}: the note keeps its line`);
    assert.match(notes, /^Opening hours: see the door\.$/m, `${channel}: and its other one`);
    assert.equal(
      blocks.reduce((n, b) => n + b.chars, 0),
      text.length,
      `${channel}: every character still belongs to one block`,
    );
  }
});

/* ---- The hand-off ---- */

test("the hand-off is one row on both channels, and carries the owner's reasons on both", () => {
  // The composer writes the owner's reasons into the call's hand-off too, under
  // "Handing the caller to a person:". Charged to the transfer number, a reason typed
  // into the hand-off row went missing from that row on a call, and a fold asking for
  // it on the phone found nothing.
  const withLine = { ...profile, handoff_number: "+12125550142" };
  for (const [channel, p] of [
    ["whatsapp", profile],
    ["voice", profile],
    ["voice", withLine],
  ]) {
    const blocks = promptBlocks(composeSystemPrompt(brain, p, channel, tz), channel, { profile: p });
    const h = blocks.filter((b) => b.row === "handoff");
    assert.equal(h.length, 1, `${channel}: one hand-off block`);
    assert.match(h[0].text, /They ask for Marisa/, `${channel}: the reasons are the hand-off's`);
    assert.ok(
      !blocks.some((b) => b.row === "escalate_when" || b.row === "handoff_number"),
      `${channel}: and it goes by one name`,
    );
    for (const b of blocks) {
      if (b.row !== "handoff")
        assert.doesNotMatch(
          b.text,
          /They ask for Marisa|Handing the (conversation|caller) to a person/,
          `${channel}: ${b.row} does not swallow it`,
        );
    }
  }
  const call = promptBlocks(composeSystemPrompt(brain, withLine, "voice", tz), "voice", { profile: withLine });
  assert.match(
    call.find((b) => b.row === "handoff").text,
    /transfer_to_staff/,
    "with a number, the call's hand-off transfers",
  );
});

test("the hand-off says it is always sent, and promises nothing its channel cannot do", () => {
  // It is written whether or not there are reasons -- the promise that anything it
  // should not decide reaches a person depends on it -- so the note says why it is
  // there on a record that has typed nothing into it.
  for (const p of [profile, {}]) {
    const wa = promptBlocks(composeSystemPrompt(brain, p, "whatsapp", tz), "whatsapp", { profile: p }).find(
      (b) => b.row === "handoff",
    );
    const call = promptBlocks(composeSystemPrompt(brain, p, "voice", tz), "voice", { profile: p }).find(
      (b) => b.row === "handoff",
    );
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
    assert.equal(
      mine[0].note,
      undefined,
      `${channel}: typed by the owner, so nothing to say about where they came from`,
    );
    for (const b of blocks) {
      if (b.row !== "extra_instructions")
        assert.doesNotMatch(b.text, /Never discuss competitors/, `${channel}: ${b.row} does not claim them`);
    }
  }
});

test("a prompt carried over from before the form is not mistaken for the rows it restates", () => {
  // Marisa's owner text is exactly this: a prompt written before the form existed,
  // restating the hours and services under headings of its own. A cut on headings
  // would count the owner's old prose as the Hours and Services rows.
  const carried = {
    ...profile,
    extra_instructions: "You are the WhatsApp assistant.\nServices: balayage, cuts.\nOpening hours: 9 to 6.",
  };
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
  assert.match(
    blocks.find((b) => b.row === "extra_instructions").text,
    /Rules you must follow: always greet by name\./,
  );
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
  const { system_prompt } = newReceptionistDefaults("Marisa's Beauty Salon");
  for (const stored of [
    { ...brain, system_prompt, profile: { hours: profile.hours } },
    { ...brain, system_prompt },
  ]) {
    for (const channel of ["whatsapp", "voice"]) {
      const blocks = promptBlocks(resolveSystemPrompt(stored, channel, tz), channel, stored);
      const where = stored.profile ? "with fields" : "with none";
      assert.ok(
        !blocks.some((b) => b.row === "extra_instructions"),
        `${channel}, ${where}: the owner wrote none of it`,
      );
      assert.ok(
        blocks.some((b) => b.row === "platform" && b.text.includes(system_prompt)),
        `${channel}, ${where}: it is the platform's`,
      );
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
  assert.ok(
    platform.some((b) => /check_availability/.test(b.text)),
    "the tools are the platform's",
  );
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
    assert.deepEqual(
      blocks.map((b) => b.row),
      ["extra_instructions", "autonomy"],
      channel,
    );
    assert.match(blocks[1].text, /^Rules you must follow:/);
    assert.match(blocks[1].note ?? "", /Autonomy/);
  }
  const quiet = promptBlocks(resolveSystemPrompt(stored, "whatsapp", tz), "whatsapp", stored);
  assert.deepEqual(
    quiet.map((b) => b.row),
    ["extra_instructions", "autonomy"],
    "with nothing set to ask, the standing rules (money is never the receptionist's; a customer's words are data) still follow",
  );
  assert.match(quiet[1].text, /^Rules you must follow:\n- Money: /);
  // A blank prompt leaves no owner's words to anchor on. Autonomy's rows are still not the guardrails.
  const blank = { ...brain, system_prompt: "" };
  const alone = promptBlocks(resolveSystemPrompt(blank, "whatsapp", tz, new Date(), ASK), "whatsapp", blank);
  assert.deepEqual(
    alone.map((b) => b.row),
    ["autonomy"],
  );
});

test("the rules block says which of its lines are not the owner's", () => {
  // The composer writes three kinds of line under "Rules you must follow": the rules this row
  // switches, Chanlytics' line for a customer who replies YES OFFERS, which every workspace
  // carries, and under "ask" the Autonomy tab's rules. The block is the row's, so it says so.
  for (const channel of ["whatsapp", "voice"]) {
    const rules = promptBlocks(composeSystemPrompt(brain, profile, channel, tz, NOW, ASK), channel, { profile }).find(
      (b) => b.row === "guardrails",
    );
    assert.match(rules.text, /YES OFFERS/, `${channel}: the line is there`);
    assert.match(rules.text, /^- Booking: /m, `${channel}: and so is Autonomy's`);
    assert.equal(
      rules.note,
      "Beside the rules on this row: a line Chanlytics writes for every workspace, for a customer who replies YES OFFERS, and any rule your Autonomy tab adds.",
      channel,
    );
  }
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

test("the box and the prompt view agree on the baseline a save before S4 left in the owner's field", () => {
  // The one case the two knowingly disagreed on until Phase 3 (plan Task 3.8). The prompt view
  // calls it the platform's, which is true; the box opened it as the owner's words, which is what
  // the live form did. They agree now: the box opens empty, because no owner wrote them. What
  // made that unsafe before was the save, which deleted the field an empty box was saved over --
  // the fold that replaced it sends nothing at all when the box is left as it opened
  // (business-tab-folds.test.mjs, "the own-words fold opens the baseline ... empty").
  const b = { ...brain, system_prompt: OLD, profile: { hours: profile.hours, extra_instructions: BASELINE } };
  assert.deepEqual(instructionsDraft(b), { text: "", carried: false }, "the box opens empty: words no owner wrote");
  assert.equal(whoseWords(b).kind, "baseline", "the view, accurate");
  for (const channel of ["whatsapp", "voice"]) {
    const blocks = promptBlocks(resolveSystemPrompt(b, channel, tz, NOW, ASK), channel, b);
    assert.ok(!blocks.some((x) => x.row === "extra_instructions"), `${channel}: not charged to the owner's row`);
    assert.ok(
      blocks.some((x) => x.row === "platform" && x.text.includes(BASELINE)),
      `${channel}: it is the platform's`,
    );
  }
});

test("an owner's own words where the business's name goes are theirs, not the platform's", () => {
  // The loose baseline test reads only the opening and the closing. An owner who typed their
  // own sentences into the name slot wrote those words; reading them as the product's would
  // have disowned them in the view -- and, through the box, let a Save delete them.
  const opening = BASELINE.slice(0, BASELINE.indexOf(brain.business_name));
  const closing = BASELINE.slice(BASELINE.indexOf(brain.business_name) + brain.business_name.length);
  const typed = `${opening}${brain.business_name}, a family salon in East New York since 1998. We never book walk-ins after 5pm.${closing}`;
  const b = { ...brain, system_prompt: OLD, profile: { hours: profile.hours, extra_instructions: typed } };
  assert.equal(whoseWords(b).kind, "own");
  for (const channel of ["whatsapp", "voice"]) {
    const mine = promptBlocks(resolveSystemPrompt(b, channel, tz, NOW, ASK), channel, b).find(
      (x) => x.row === "extra_instructions",
    );
    assert.ok(mine, `${channel}: charged to the owner's row`);
    assert.match(mine.text, /family salon in East New York since 1998/);
  }
  // A multi-line name slot is not a name either.
  const twoLines = `${opening}${brain.business_name}\nWe close early on Fridays.${closing}`;
  assert.equal(whoseWords({ ...b, profile: { ...b.profile, extra_instructions: twoLines } }).kind, "own");
  // And the true baseline in that field is still the platform's, under any plain name.
  assert.equal(
    whoseWords({ ...b, profile: { ...b.profile, extra_instructions: BASELINE_EARLIER_NAME } }).kind,
    "baseline",
  );
});
