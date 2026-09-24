/**
 * Settings › Business: What it can do (the plan's Tasks 4.1 and 4.1b), EXECUTED on the stub React.
 *
 * The fifth card of the record, and the first one built under the owner's 22 September rule from the start: a row
 * states one fact and at most ONE quiet signal. So what is asserted here is as much what the card does NOT draw --
 * a sentence on a row that is whole, a pill, a switch, the same hold said six times -- as what it does.
 *
 * Its own file, as every other card has one (business-tab-open.test.mjs, business-tab-offer.test.mjs); the plan named
 * business-tab-page.test.mjs, which is the page's own file and is already two thousand lines of the standing line, the
 * saver and Who you are. The page, the fixture and the presses are _business-tab-harness.mjs, shared with all of them.
 *
 * Every sentence the card says is contracts' (abilityRows, cannotRows), so a test that meant to hold a wording holds
 * contracts' own string rather than a copy of it typed here.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { ABILITY_CHANNEL_WORDS, abilityRows, cannotRows, POLICY_MODE_WORDS } from "@chanlytics/contracts";
import { unmount, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";
import {
  POLICIES,
  SETUP,
  W,
  drawTab,
  marisa,
  openFold,
  openFolds,
  openRows,
  redrawTab,
  went,
} from "./_business-tab-harness.mjs";

after(() => unmount());

/** Every input, as the page computes it for Marisa (the plan's table under Task 4.1 step 3). */
const MARISA_INPUTS = {
  voiceLive: true,
  whatsappLive: true,
  hasCalendarFeed: true,
  hasBookingLink: true,
  linkOptional: false,
  hasBookingTemplate: true,
  hasHandoffNumber: true,
  hasEscalateWhen: true,
  pauseHours: undefined,
  visionOn: false,
  bookingHeld: false,
  replyMode: "auto",
};

const canCard = (tree) => byTestId(tree, "rec-card-can");
const chipsOf = (row) => all(row, (n) => classes(n).includes("rec-can-chip"));
/** The sentence a row keeps out of the way: drawn, for a screen reader and for a mouse's tip, and not read at rest. */
const saidAtRest = (row) => find(row, (n) => classes(n).includes("bt-can-why"));

/* ------------------------------------ the plan's five ------------------------------------ */

test("the card draws every ability, with the channel that has it", () => {
  const card = canCard(drawTab({ profile: marisa }));
  assert.ok(card, "the card is on the page");
  // abilityRows throws on a boolean left out, so a wiring slip fails here instead of drawing a card that lies.
  for (const a of abilityRows(MARISA_INPUTS).rows) {
    const row = byTestId(card, `rec-can-${a.id}`);
    assert.ok(row, `${a.id} is drawn`);
    assert.match(textOf(row), new RegExp(a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // A channel that does not have it is drawn dim, not absent: absence reads as "we did not say".
    assert.equal(chipsOf(row).length, 2, `${a.id} names both channels`);
  }
});

test("an ability whose input is missing points at the row that supplies it", () => {
  const thin = { ...marisa, handoff_number: undefined };
  const card = canCard(drawTab({ profile: thin }));
  const transfer = byTestId(card, "rec-can-transfer");
  assert.match(textOf(transfer), /takes a message instead/i);
  assert.ok(
    find(transfer, (n) => typeof n.props?.onClick === "function"),
    "and offers the row that fixes it",
  );
});

test("the card reads the Autonomy tab: a pause nobody set is a day, and held bookings are said", () => {
  // Nothing under pause_hours is the common case. Passed as a number the page worked out, it
  // read "holds off for NaN hours"; passed as stored, abilityRows reads it as the pane does.
  const card = canCard(drawTab({ profile: marisa }));
  assert.match(textOf(byTestId(card, "rec-can-handoff")), /holds off for a day/);
  // Booking on ask: the page asks contracts' bookingHeld, the edge's own question, never a copy.
  const held = canCard(
    drawTab({
      profile: marisa,
      policies: {
        rows: [
          { class: "reply", mode: "auto", limits: {} },
          { class: "booking", mode: "ask", limits: {} },
        ],
        role: "owner",
      },
    }),
  );
  assert.match(textOf(byTestId(held, "rec-can-booking_link")), /Your Autonomy tab holds bookings for you to confirm/);
});

test("a workspace with both lines and an approved booking-link message is told the call sends the link", () => {
  // hasBookingTemplate is contracts' bookingTemplate over the workspace's templates: left out,
  // every two-channel workspace was told the call can't send it.
  const row = byTestId(canCard(drawTab({ profile: marisa })), "rec-can-booking_link");
  assert.match(textOf(row), /caller's WhatsApp, when their number has one/);
});

test("what it cannot do carries no switch", () => {
  const card = byTestId(drawTab({ profile: marisa }), "rec-card-cannot");
  for (const c of cannotRows({ smsLive: false })) {
    const row = byTestId(card, `rec-cannot-${c.id}`);
    assert.ok(row, `${c.id} is drawn`);
    assert.equal(
      find(row, (n) => n.props?.role === "switch"),
      null,
      `${c.id} is not offered as a setting`,
    );
    assert.equal(chipsOf(row).length, 0, `${c.id} names no channel: there is none`);
  }
  assert.match(textOf(byTestId(card, "rec-cannot-sms")), /not part of what is sold yet/i);
});

/* ------------------------------------ the quiet rule ------------------------------------ */

test("a whole ability is its title and two glyphs: the sentence is there to be read, not in the way", () => {
  // The owner's 22 September rule. Six abilities, each with a sentence of two clauses, is six
  // paragraphs on a phone about a card nothing on which needs deciding. The sentence stays in the
  // row -- a screen reader reads it, a mouse gets it as the row's tip -- and only a row whose input
  // this page supplies draws it where it cannot be missed.
  const card = canCard(drawTab({ profile: marisa }));
  const rows = Object.fromEntries(abilityRows(MARISA_INPUTS).rows.map((a) => [a.id, a]));
  for (const id of ["answer", "open_times", "booking_link", "transfer", "handoff"]) {
    const row = byTestId(card, `rec-can-${id}`);
    assert.equal(saidAtRest(row), null, `${id} is whole, so it says nothing at rest`);
    assert.equal(row.props.title, rows[id].detail, `${id} still carries its sentence`);
    assert.ok(textOf(row).includes(rows[id].detail), `${id}'s sentence is drawn for a reader`);
  }
  // The photo switch is off, which is a decision, so that one row does say so.
  const vision = byTestId(card, "rec-can-vision");
  assert.ok(saidAtRest(vision), "the one that is off says so");
  assert.match(textOf(vision), /A photo is passed to a person/);
});

test("a row nothing does says so once: both glyphs dark, and the title in the dim ink", () => {
  // The card's one signal per row. Contracts folds each ability's input into its channels, so the
  // pair of glyphs IS the readiness; `data-ready` is what settings.css takes the title's ink from.
  const thin = { ...marisa, handoff_number: undefined };
  const card = canCard(drawTab({ profile: thin }));
  for (const a of abilityRows({ ...MARISA_INPUTS, hasHandoffNumber: false }).rows) {
    const row = byTestId(card, `rec-can-${a.id}`);
    assert.equal(row.props["data-ready"], a.ready ? "true" : "false", a.id);
    assert.equal(
      chipsOf(row).some((g) => g.props["data-on"] === "true"),
      a.ready,
      `${a.id}: a lit glyph and a row nothing does never sit together`,
    );
  }
  // The two the salon record has nothing for, and no others.
  assert.deepEqual(
    all(card, (n) => (n.props?.["data-testid"] || "").startsWith("rec-can-") && n.props["data-ready"] === "false").map(
      (n) => n.props["data-testid"],
    ),
    ["rec-can-transfer", "rec-can-vision"],
  );
});

test("a door opens the row that supplies what is missing", () => {
  // Every runsOn this card can offer, pressed: the fold or the inline editor behind it opens, by the
  // same registry the standing line's door goes through (so a row holding changes is asked first).
  const nothing = { ...marisa, handoff_number: undefined, escalate_when: [] };
  for (const [id, row] of [
    ["open_times", "calendar"],
    ["booking_link", "booking_link"],
    ["transfer", "handoff_number"],
    ["vision", "guardrails"],
  ]) {
    const tree = drawTab({ profile: nothing, brain: { booking_link: undefined }, config: { calendar: undefined } });
    const door = byTestId(canCard(tree), `rec-can-door-${id}`);
    assert.ok(door, `${id} offers its door`);
    press(door);
    const after = redrawTab();
    assert.ok(
      openFolds(after).includes(row) || openRows(after).includes(row),
      `${id} opens ${row}, not ${openFolds(after).concat(openRows(after)).join(", ") || "nothing"}`,
    );
  }
});

test("a glyph says which channel in words, so dim is never the only thing that said it", () => {
  const card = canCard(drawTab({ profile: marisa, setup: null }));
  assert.ok(card, "the card is still drawn");
  const lit = canCard(drawTab({ profile: marisa }));
  const named = chipsOf(byTestId(lit, "rec-can-transfer")).map((n) => n.props["aria-label"]);
  assert.deepEqual(named, [ABILITY_CHANNEL_WORDS.whatsapp.not, ABILITY_CHANNEL_WORDS.voice.has]);
  const both = chipsOf(byTestId(lit, "rec-can-answer")).map((n) => n.props["aria-label"]);
  assert.deepEqual(both, [ABILITY_CHANNEL_WORDS.whatsapp.has, ABILITY_CHANNEL_WORDS.voice.has]);
});

test("nothing on the card is a pill, a switch or a count", () => {
  const card = canCard(drawTab({ profile: marisa }));
  assert.equal(
    all(card, (n) => classes(n).includes("pill")).length,
    0,
    "no bordered pill: the owner named them by name",
  );
  assert.equal(all(card, (n) => n.props?.role === "switch").length, 0, "nothing here is a control");
  assert.doesNotMatch(textOf(byTestId(card, "rec-can-answer")), /\d/, "no number an owner cannot act on");
});

/* ------------------------------------ 4.1b: the hold, said once ------------------------------------ */

test("with replies held, the card says so once, above the rows, and no row repeats it", () => {
  for (const mode of ["ask", "never"]) {
    const rows = POLICIES().rows.map((r) => (r.class === "reply" ? { ...r, mode } : r));
    const tree = drawTab({ profile: marisa, policies: { rows, role: "owner" } });
    const card = canCard(tree);
    const held = byTestId(card, "rec-can-held");
    assert.ok(held, `${mode} is said`);
    const sentence = abilityRows({ ...MARISA_INPUTS, replyMode: mode }).held.sentence;
    assert.ok(textOf(held).includes(sentence), `${mode}: ${textOf(held)}`);
    assert.ok(sentence.includes(POLICY_MODE_WORDS[mode].chip), "in the pane's own words");
    // The door's words are contracts' too (held.door), never typed into the JSX.
    assert.equal(
      textOf(byTestId(card, "rec-can-held-door")),
      abilityRows({ ...MARISA_INPUTS, replyMode: mode }).held.door,
    );
    // Once, and nowhere else: not on the six rows it holds.
    for (const a of abilityRows({ ...MARISA_INPUTS, replyMode: mode }).rows) {
      assert.ok(!textOf(byTestId(card, `rec-can-${a.id}`)).includes(sentence), `${a.id} does not repeat the hold`);
    }
    // And every chat glyph is dim, while a call is untouched.
    for (const a of abilityRows({ ...MARISA_INPUTS, replyMode: mode }).rows) {
      const chat = chipsOf(byTestId(card, `rec-can-${a.id}`))[0];
      assert.equal(chat.props["data-on"], "false", `${a.id} has no chat`);
      assert.equal(chat.props["aria-label"], ABILITY_CHANNEL_WORDS.whatsapp.not);
    }
    assert.equal(chipsOf(byTestId(card, "rec-can-transfer"))[1].props["data-on"], "true", "a call still answers");
    // One door, to the tab that fixes it.
    const doors = all(card, (n) => n.props?.["data-testid"] === "rec-can-held-door");
    assert.equal(doors.length, 1);
    const before = went.length;
    press(doors[0]);
    assert.deepEqual(went.slice(before), ["admin/autonomy"]);
  }
});

test("on the mode a workspace is provisioned with, the card says nothing about a hold", () => {
  const card = canCard(drawTab({ profile: marisa }));
  assert.equal(byTestId(card, "rec-can-held"), null);
  assert.equal(chipsOf(byTestId(card, "rec-can-handoff"))[0].props["data-on"], "true");
});

/* ------------------------------------ what it cannot read ------------------------------------ */

test("a read that failed is said where the rows would be, and never guessed at", () => {
  // A false passed for a boolean nobody could read draws a live line dark and a hold as none. Each
  // surface the card reads is named where its rows would be, so the owner knows what is missing.
  for (const [what, over] of [
    ["the Autonomy tab", { policies: null }],
    // A failed templates read was being turned into "no approved booking-link message", which
    // narrows the call's row and the openings row's clause on a read that never happened.
    ["your approved messages", { templates: null }],
  ]) {
    const card = canCard(drawTab({ profile: marisa, ...over }));
    const said = byTestId(card, "rec-can-unread");
    assert.ok(said, what);
    assert.ok(textOf(said).includes(what), `${what}: ${textOf(said)}`);
    assert.equal(byTestId(card, "rec-can-answer"), null, `${what}: no row is guessed at`);
    assert.equal(byTestId(card, "rec-can-held"), null, `${what}: and no hold is either`);
    // The three limits read only the lines, so they stand whatever the settings surface lost.
    assert.ok(byTestId(card, "rec-cannot-book"), `${what}: what it cannot do still stands`);
  }
  // Both at once is still one sentence, naming both.
  const both = canCard(drawTab({ profile: marisa, policies: null, templates: null }));
  assert.match(textOf(byTestId(both, "rec-can-unread")), /the Autonomy tab and your approved messages/);
});

test("the connections gone is ONE failed read for the whole card, with one retry", () => {
  // Every row of it, the abilities and the limits alike, turns on the lines that answer. Said twice
  // it was two alarms and two Retries for one cause.
  const tree = drawTab({ profile: marisa, setup: null });
  const card = canCard(tree);
  assert.match(textOf(byTestId(card, "rec-can-unread")), /the connections/);
  assert.equal(byTestId(card, "rec-cannot-unread"), null, "not a second failed read under it");
  assert.equal(byTestId(card, "rec-card-cannot"), null, "and no group head over nothing");
  assert.equal(all(card, (n) => classes(n).includes("empty-failed")).length, 1, "one alarm");
  // And one Retry behind it: the kit draws one per failed read, through the surface it names.
  const was = W.__refreshSurface;
  try {
    W.__refreshSurface = () => {};
    const again = canCard(drawTab({ profile: marisa, setup: null }));
    assert.equal(all(again, (n) => /-retry$/.test(n.props?.["data-testid"] || "")).length, 1, "one retry");
  } finally {
    W.__refreshSurface = was;
  }
});

test("a surface still being read is not a surface that failed", () => {
  // On a cold boot the settings surface lands before Setup (the boot queue ranks the tab's own
  // surface first, and setupOverride is 14th of 16), so a healthy workspace read "Couldn't read the
  // connections" with a Retry until it arrived. The house says it the other way round
  // (pages/setup.jsx, pages/settings.jsx): null is a failure, undefined is still on its way.
  for (const global of ["__SETUP", "__POLICIES", "__TEMPLATES_ALL"]) {
    drawTab({ profile: marisa });
    const was = W[global];
    try {
      W[global] = undefined;
      const card = canCard(redrawTab());
      assert.ok(card, `${global}: the card keeps its place`);
      assert.ok(byTestId(card, "rec-can-reading"), `${global}: and says it is reading`);
      assert.equal(byTestId(card, "rec-can-unread"), null, `${global}: nothing failed`);
      assert.equal(byTestId(card, "rec-cannot-unread"), null, `${global}: nor here`);
      assert.equal(byTestId(card, "rec-can-answer"), null, `${global}: and no row is guessed at`);
    } finally {
      W[global] = was;
    }
  }
});

test("texting live takes its row out, and it is read from ready rather than live", () => {
  // capabilityStatus("sms").live needs a `tested` that texting never records, so it can never be
  // true; `ready` is the active, non-rehearsal carrier line textingWords calls "Texting is on."
  const setup = SETUP();
  setup.dto.lines.rows[0].sms_state = "active";
  const card = byTestId(drawTab({ profile: marisa, setup }), "rec-card-cannot");
  assert.equal(byTestId(card, "rec-cannot-sms"), null, "it is sold on this line, so it is not a limit");
  assert.ok(byTestId(card, "rec-cannot-book"), "the two that are structural stay");
  // A rehearsal filing is not a line that texts (capabilities.ts), and the row comes back.
  const mock = SETUP();
  mock.dto.lines.rows[0].sms_state = "active";
  mock.dto.lines.rows[0].reg_mock = true;
  assert.ok(byTestId(byTestId(drawTab({ profile: marisa, setup: mock }), "rec-card-cannot"), "rec-cannot-sms"));
});

/* ------------------------------------ on the page ------------------------------------ */

test("the card is drawn on every render, after How it answers and before the services sheet", () => {
  const tree = drawTab({ profile: marisa });
  const order = all(
    tree,
    (n) =>
      typeof n.props?.["data-testid"] === "string" && /^(rec-card-|rec-sheet-services)/.test(n.props["data-testid"]),
  ).map((n) => n.props["data-testid"]);
  assert.deepEqual(order.slice(0, 5), [
    "rec-card-who",
    "rec-card-open",
    "rec-card-offer",
    "rec-card-answers",
    "rec-card-can",
  ]);
  // A fold opened elsewhere draws the page again; the card holds no hook, and comes back whole.
  openFold(tree, "hours");
  const again = redrawTab();
  assert.ok(canCard(again), "the card survives a redraw");
  assert.equal(chipsOf(byTestId(canCard(again), "rec-can-answer")).length, 2);
  assert.ok(byTestId(again, "rec-card-cannot"), "and so does what it cannot");
});

test("a viewer reads the whole card and is offered no door", () => {
  const was = W.canDo;
  try {
    W.canDo = () => false;
    const card = canCard(drawTab({ profile: { ...marisa, handoff_number: undefined } }));
    const transfer = byTestId(card, "rec-can-transfer");
    assert.match(textOf(transfer), /takes a message instead/i, "the sentence is theirs to read");
    assert.equal(
      find(transfer, (n) => typeof n.props?.onClick === "function"),
      null,
      "and the row behind the door would not open for them",
    );
  } finally {
    W.canDo = was;
  }
});
