/**
 * The journey's guide (spec 2026-10-10 §5.1, Ask the marketing manager, task 4): what a business of any trade sends at
 * each touch point of the journey it can run, as Ask reads it beside the stages (campaigns.journey). One guide, keyed by
 * the calendar and by deals, never by a trade: its stages are the journey's own (journeyOf), each on the moment that runs
 * it here, and the month's offer, which stands on no stage, after them. Executed over contracts' own function; every
 * sentence is held to the words trade-neutral.test.mjs bans, copied here, since that test's scan reads no value a
 * function returns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

/** repo/trade-neutral.test.mjs's two predicates, as it writes them: one trade's words, and a visit where an appointment is. */
const BANNED = /\b(salons?|stylists?|balayage|therapists?|chair rental|haircuts?|keratin|blowouts?|lash(?:es)?)\b/i;
const VISIT = /(?<![\w-])visit(?:a)?s?(?![\w-])/i;

/** The four shapes a workspace can have: a calendar connected or not, deals on or not. */
const SHAPES = [
  { calendarOn: false, dealsOn: false },
  { calendarOn: true, dealsOn: false },
  { calendarOn: true, dealsOn: true },
  { calendarOn: false, dealsOn: true },
];

const rowsOf = (shape) => C.journeyGuide(shape).map((r) => [r.stage, r.moment]);

test("with a calendar, five rows in the journey's order, the day before and the day after among them, each on the moment that runs it here, the month's offer last on no stage", () => {
  assert.deepEqual(rowsOf({ calendarOn: true, dealsOn: false }), [
    ["first_contact", null],
    ["before", "visit_tomorrow"],
    ["after", "visited"],
    ["quiet", "lapsed"],
    [null, "everyone_monthly"],
  ]);
  const guide = C.journeyGuide({ calendarOn: true, dealsOn: false });
  const said = (stage) => guide.find((r) => r.stage === stage).sends;
  assert.equal(said("before"), "the day before an appointment, a reminder");
  assert.equal(said("after"), "the day after, a thank-you and a review ask");
  assert.equal(said("quiet"), "quiet six weeks or more, a win-back");
  assert.equal(guide.at(-1).sends, "every month, one offer to those who said yes");
});

test("without a calendar, no row for the day before or the day after, and the win-back goes by silence", () => {
  for (const dealsOn of [false, true]) {
    const rows = rowsOf({ calendarOn: false, dealsOn });
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
  assert.deepEqual(rowsOf({ calendarOn: false, dealsOn: false }), [
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
  assert.equal(C.journeyGuide({ calendarOn: true, dealsOn: true }).length, 6);
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
  const said = SHAPES.flatMap((shape) => C.journeyGuide(shape).flatMap((r) => [r.sends, r.why]));
  assert.ok(said.length >= 2 * 3 * SHAPES.length, "every row says what it sends and why");
  for (const s of said) {
    assert.ok(s.trim().length > 0, "a sentence");
    assert.equal(BANNED.exec(s), null, `a trade's word: ${s}`);
    assert.equal(VISIT.test(s), false, `a visit: ${s}`);
  }
  // The predicates bite: what they would fail, they fail.
  assert.ok(BANNED.test("a reminder from the salon") && VISIT.test("the day before a visit"));
});
