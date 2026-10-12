/**
 * The journey's guide (spec 2026-10-10 §5.1, Ask the marketing manager, task 4): what each touch point of the journey a
 * workspace can run sends, and when, as Ask reads it beside the stages (campaigns.journey). One guide, keyed by the
 * calendar and by deals, never by a trade: its stages are the journey's own (journeyOf), each on the moment that runs it
 * here and said when its moment says it is, and the month's offer, which stands on no stage, after them. It states what
 * the product does and nothing it cannot vouch for (12 Oct 2026, the review after the merge): no "why". Executed over
 * contracts' own function; every sentence is held to the words trade-neutral.test.mjs bans, copied here, since that
 * test's scan reads no value a function returns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

/** repo/trade-neutral.test.mjs's two predicates, as it writes them: one trade's words, and a visit where an appointment is. */
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;
const VISIT = /(?<![\w-])visit(?:a)?s?(?![\w-])/i;

/** The four shapes a workspace can have: a calendar connected or not, deals on or not; each calls it an appointment. */
const SHAPES = [
  { calendarOn: false, dealsOn: false, word: "appointment" },
  { calendarOn: true, dealsOn: false, word: "appointment" },
  { calendarOn: true, dealsOn: true, word: "appointment" },
  { calendarOn: false, dealsOn: true, word: "appointment" },
];

const rowsOf = (shape) => C.journeyGuide(shape).map((r) => [r.stage, r.moment]);

test("with a calendar, five rows in the journey's order, the day before and the day after among them, each on the moment that runs it here, the month's offer last on no stage", () => {
  assert.deepEqual(rowsOf(SHAPES[1]), [
    ["first_contact", null],
    ["before", "visit_tomorrow"],
    ["after", "visited"],
    ["quiet", "lapsed"],
    [null, "everyone_monthly"],
  ]);
  const guide = C.journeyGuide(SHAPES[1]);
  const said = (stage) => guide.find((r) => r.stage === stage).sends;
  assert.equal(
    said("first_contact"),
    "your receptionist's answers, which ask once on WhatsApp for the yes to offers, the yes every offer needs",
    "the receptionist asks once, on WhatsApp alone (contracts offers-ask.ts), never in a first reply of its own",
  );
  assert.equal(said("before"), "the day before an appointment on the calendar: a reminder");
  assert.equal(
    said("after"),
    "the day after an appointment, when nothing is booked next: a thank-you and how it went, with a review ask where your Google listing keeps a review link",
  );
  assert.equal(guide.at(-1).sends, "every month, one offer to those who said yes");
  // What goes out, never a why: the outcomes the guide once promised are no fact the product keeps.
  assert.deepEqual(
    guide.map((r) => Object.keys(r)),
    guide.map(() => ["stage", "moment", "sends"]),
  );
});

test("the win-back's row says when it goes in its own moment's words, by silence without a calendar and by appointments with one, never a count of weeks of its own", () => {
  for (const shape of SHAPES) {
    const row = C.journeyGuide(shape).find((r) => r.stage === "quiet");
    const when = C.triggerWords(C.triggerOf(row.moment), shape.word).hint.toLowerCase();
    assert.equal(row.sends, `${when}: a win-back`, JSON.stringify(shape));
    assert.ok(!/weeks/.test(row.sends), `${row.sends}: the moment's days, never weeks`);
  }
  // Both win-backs are said, each by the moment that runs it: the hints differ, so the rows do.
  const [none, cal] = [SHAPES[0], SHAPES[1]].map((s) => C.journeyGuide(s).find((r) => r.stage === "quiet").sends);
  assert.notEqual(none, cal);
});

test("without a calendar, no row for the day before or the day after, and the win-back goes by silence", () => {
  for (const dealsOn of [false, true]) {
    const rows = rowsOf({ calendarOn: false, dealsOn, word: "appointment" });
    assert.deepEqual(
      rows.filter(([stage]) => stage === "before" || stage === "after"),
      [],
      `deals ${dealsOn ? "on" : "off"}`,
    );
    assert.deepEqual(
      rows.find(([stage]) => stage === "quiet"),
      ["quiet", "quiet_30"],
    );
  }
  assert.deepEqual(rowsOf(SHAPES[0]), [
    ["first_contact", null],
    ["quiet", "quiet_30"],
    [null, "everyone_monthly"],
  ]);
});

test("a proposal's row only where deals are on, before quiet, on the follow-up's moment", () => {
  for (const shape of SHAPES) {
    const rows = rowsOf(shape);
    const at = rows.findIndex(([stage]) => stage === "proposal");
    if (!shape.dealsOn) {
      assert.equal(at, -1, JSON.stringify(shape));
      continue;
    }
    assert.deepEqual(rows[at], ["proposal", "proposal_waiting"], JSON.stringify(shape));
    assert.equal(rows[at + 1][0], "quiet", `${JSON.stringify(shape)}: before quiet`);
  }
  assert.equal(C.journeyGuide(SHAPES[2]).length, 6);
});

test("every row's moment is a trigger a campaign starts from, offered here, and its stage the one that trigger stands on", () => {
  for (const shape of SHAPES)
    for (const r of C.journeyGuide(shape)) {
      if (r.moment === null) {
        assert.equal(r.stage, "first_contact", "the receptionist's alone has no moment");
        continue;
      }
      const t = C.triggerOf(r.moment);
      assert.ok(t, r.moment);
      assert.equal(C.momentOffered(t, shape), true, `${JSON.stringify(shape)}: ${r.moment} offered`);
      assert.equal(C.journeyStageOf(r.moment), r.stage, `${r.moment} stands on ${r.stage}`);
    }
});

test("every sentence the guide says is any trade's: none of trade-neutral's banned words, and an appointment, never a visit", () => {
  const said = SHAPES.flatMap((shape) => C.journeyGuide(shape).map((r) => r.sends));
  assert.ok(said.length >= 3 * SHAPES.length, "every row says what it sends");
  for (const s of said) {
    assert.ok(s.trim().length > 0, "a sentence");
    assert.equal(BANNED.exec(s), null, `a trade's word: ${s}`);
    assert.equal(VISIT.test(s), false, `a visit: ${s}`);
  }
  // The predicates bite: what they would fail, they fail.
  assert.ok(BANNED.test("a reminder from the salon") && VISIT.test("the day before a visit"));
});

test("the guide says the workspace's own word for an appointment, and the day after names the review ask only where the listing keeps a review link, which the review starter takes", () => {
  const guide = C.journeyGuide({ calendarOn: true, dealsOn: true, word: "meeting" });
  const row = (stage) => guide.find((r) => r.stage === stage);
  assert.equal(row("before").sends, "the day before a meeting on the calendar: a reminder");
  assert.equal(
    row("after").sends,
    "the day after a meeting, when nothing is booked next: a thank-you and how it went, with a review ask where your Google listing keeps a review link",
  );
  // Each moment's row says when in its moment's own words (contracts triggerWords), the workspace's word among them.
  for (const r of guide.filter((x) => x.stage !== null && x.moment !== null)) {
    const when = C.triggerWords(C.triggerOf(r.moment), "meeting").hint.toLowerCase();
    assert.ok(r.sends.startsWith(`${when}: `), `${r.stage}: ${r.sends}`);
  }
  // Every sentence of a workspace that says meeting says it, and never the appointment it does not say.
  const said = guide.map((r) => r.sends).join(" ");
  assert.ok(!/\bappointments?\b/.test(said), said);
  // Where the listing keeps a review link, the after row's moment sends the review ask: a starter written for it takes
  // the link (Ask's plan and its campaign card propose it only there; elsewhere the check that asks how it went).
  assert.ok(
    C.startersForTrigger(row("after").moment).some((s) =>
      C.starterText(s, "en_US").slots.some((x) => x.kind === "review_link"),
    ),
    "a starter of the day after asks for the review",
  );
});
