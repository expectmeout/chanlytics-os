/**
 * A word said in a visit's sheet is answered in the sheet (12 Nov 2026).
 *
 * The Calendar's sheet asked "Did Ana come yesterday?", took Kept, and said a small grey "Kept" beside More under the
 * question it had just been answered; the door's answer (which sequence writes to them, and when: decisions 0119 and
 * 0123) was dropped, where Today's row says it and offers Change. A Missed then led with "Ask for a new time" whatever
 * followed, so a customer a sequence was about to ask could be asked twice.
 *
 * Now the sheet keeps the door's answer while it stands on the visit: the visit is drawn as it was told before the board
 * has read again, the foot says what the word sets going and offers the other word as the way back, and a Missed a
 * sequence answers is offered no new time from here. The board's word wins once it differs.
 *
 * And who the sheet is about is said by the one rule every page shortens a name by (contracts shortName): a person
 * called by their number was "Message +1", and a team "Message The".
 *
 * The visit (visit-sheet.tsx OpenVisit, the desk's peek) is the real TSX drawn on a stub React, its presses sent over a
 * scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCalendarVM } from "@chanlytics/contracts";
import { installStubReact, fresh, again, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

const TZ = "America/New_York";
const NOW = new Date("2026-09-08T16:00:00.000Z");
const ANA = { id: "p1", name: "Ana Ruiz", via: "phone", thread: "t1", reply_wire: "sms" };

installStubReact({ __DEMO_MODE: false, CHANLY: { nav: () => {} } });
const { OpenVisit } = await import("../../../apps/dashboard/src/surfaces/calendar/visit/visit-sheet");

/** What the wire saw (request line and body), and what it answers a word said on a visit with. */
const sent = [];
let answer = () => ({ status: 200, body: { ok: true, data: {} } });
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  sent.push({ line: `${init.method ?? "GET"} ${u.pathname}`, body: init.body ? JSON.parse(init.body) : undefined });
  const a = answer();
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
};
/** The words the wire saw said on a visit: the re-reads behind each answer are the surfaces' own. */
const said = () => sent.filter((s) => s.line.startsWith("POST /api/v1/calendar/visits/"));
/** The door's answer to a word: the row as it stands now, and what the word sets going. */
const took = (status, follows = null) => ({
  status: 200,
  body: {
    ok: true,
    data: { visit: { id: "v1", status }, from: "booked", decision_id: "d1", unchanged: false, follows },
  },
});

/** The Calendar's block for yesterday's visit, ended, booked, nobody's word on it yet; `item` changes what the board read. */
const shownOf = (item = {}) => {
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: `2026-09-${String(7 + i).padStart(2, "0")}`, items: [], windows: [] });
  days[0].items.push({
    id: "e1",
    start: "2026-09-07T18:00:00.000Z",
    end: "2026-09-07T19:30:00.000Z",
    title: "Ana Ruiz · Balayage",
    all_day: false,
    person: ANA,
    contacts: { phones: ["+19175550100"], emails: [] },
    visit: { id: "v1", status: "booked" },
    ...item,
  });
  const vm = toCalendarVM(
    {
      timezone: TZ,
      from: "2026-09-07",
      to: "2026-09-13",
      feed: {
        present: true,
        state: "ok",
        read_at: "2026-09-08T15:58:00.000Z",
        events: 1,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      hours: { tue: { open: "09:00", close: "18:00" } },
      closures: [],
      rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
      booking_link: "https://book.example.com/luna",
      days,
    },
    NOW,
  );
  return { block: vm.days[0].blocks[0], vm };
};
const flashed = [];
const draw = ({ block, vm }) =>
  again(() =>
    OpenVisit({
      b: block,
      day: vm.days[0],
      todayKey: vm.today,
      tz: TZ,
      source: "your calendar",
      bookingLink: vm.bookingLink,
      moments: null,
      days: vm.days,
      onClose() {},
      onWalk() {},
      flash: (text) => flashed.push(text),
    }),
  );
/** A new sheet over a quiet wire. */
const open = (shown) => {
  fresh();
  sent.length = 0;
  flashed.length = 0;
  return draw(shown);
};
/** What More offers, by its words. */
const moreOf = (tree) =>
  (find(tree, (n) => Array.isArray(n.props?.groups))?.props.groups ?? []).flatMap((g) => g.items.map((i) => i.label));
const answerOf = (tree) => byTestId(tree, "cal-visit-outcome");
const wordsOf = (tree) => textOf(find(answerOf(tree), (n) => n.props?.role === "status")).trim();

test("a Kept said in the sheet is answered there: the visit stands as it was told before the board reads again, with the thank-you that follows and Missed as the way back", async () => {
  const shown = shownOf();
  let tree = open(shown);
  assert.match(textOf(byTestId(tree, "cal-visit-ask")), /Did Ana come yesterday\?/);
  assert.equal(answerOf(tree), null, "nothing said here yet");

  answer = () => took("kept", { name: "Thank you", when: "tomorrow 10 AM", asks: false });
  press(byTestId(tree, "cal-visit-ask-kept"));
  // The same block is drawn each time: the board has not read again, and the sheet does not wait for it.
  await until(() => answerOf((tree = draw(shown))), "the sheet answers the word");
  assert.deepEqual(said(), [{ line: "POST /api/v1/calendar/visits/v1", body: { status: "kept" } }]);
  assert.equal(byTestId(tree, "cal-visit-ask"), null, "no question of a visit that has its answer");
  assert.match(textOf(byTestId(tree, "cal-visit-state")), /Kept/, "it stands as it was told");
  assert.equal(wordsOf(tree), "Kept · “Thank you” thanks them tomorrow 10 AM.");
  assert.equal(textOf(byTestId(tree, "cal-visit-change")).trim(), "Change to Missed");
  assert.equal(moreOf(tree).includes("Change to Missed"), false, "the way back is said once, not in More too");

  // The way back is one press through the same door, and is answered the same way.
  answer = () => took("missed");
  press(byTestId(tree, "cal-visit-change"));
  await until(() => /^Missed/.test(wordsOf((tree = draw(shown)))), "the change is answered too");
  assert.deepEqual(said().at(-1), { line: "POST /api/v1/calendar/visits/v1", body: { status: "missed" } });
  assert.equal(wordsOf(tree), "Missed", "nothing follows it: the word alone");
  assert.equal(textOf(byTestId(tree, "cal-visit-change")).trim(), "Change to Kept");
  assert.ok(byTestId(tree, "cal-visit-primary-new_time"), "a Missed nobody answers leads with a new time");
});

test("a Missed a sequence answers is offered no new time from the sheet: the sequence asks them, and the foot says so", async () => {
  const shown = shownOf();
  let tree = open(shown);
  answer = () => took("missed", { name: "No-show follow-up", when: "today 3:55 PM", asks: false });
  press(byTestId(tree, "cal-visit-ask-missed"));
  await until(() => answerOf((tree = draw(shown))), "the sheet answers the word");
  assert.equal(wordsOf(tree), "Missed · “No-show follow-up” offers them another time today 3:55 PM.");
  assert.equal(byTestId(tree, "cal-visit-primary-new_time"), null, "no second ask of its own");
  assert.match(
    textOf(byTestId(tree, "cal-visit-primary-message")),
    /Message Ana/,
    "their thread is still a press away",
  );

  // One that waits for an OK says that it asks first.
  tree = open(shown);
  answer = () => took("missed", { name: "No-show follow-up", when: "today 3:55 PM", asks: true });
  press(byTestId(tree, "cal-visit-ask-missed"));
  await until(() => answerOf((tree = draw(shown))), "the sheet answers the word");
  assert.equal(
    wordsOf(tree),
    "Missed · “No-show follow-up” has a message for them today 3:55 PM, and asks you before it goes.",
  );
});

test("a refusal is said in the door's words under the question, and the answers stay to press again", async () => {
  const shown = shownOf();
  let tree = open(shown);
  answer = () => ({
    status: 400,
    body: { ok: false, error: { code: "validation", message: "It was cancelled already." } },
  });
  press(byTestId(tree, "cal-visit-ask-kept"));
  const alertOf = (t) => find(t, (n) => n.props?.role === "alert");
  await until(() => alertOf((tree = draw(shown))), "the refusal is said");
  assert.equal(textOf(alertOf(tree)).trim(), "It was cancelled already.");
  assert.equal(answerOf(tree), null, "nothing was said, so nothing is answered");
  assert.ok(byTestId(tree, "cal-visit-ask-kept") && byTestId(tree, "cal-visit-ask-missed"));
});

test("once the board has read, its word is the one drawn: the answer stays while they agree, and goes where the board says otherwise", async () => {
  const shown = shownOf();
  let tree = open(shown);
  answer = () => took("kept", { name: "Thank you", when: "tomorrow 10 AM", asks: false });
  press(byTestId(tree, "cal-visit-ask-kept"));
  await until(() => answerOf((tree = draw(shown))), "the sheet answers the word");

  const read = shownOf({ visit: { id: "v1", status: "kept" } });
  tree = draw(read);
  assert.equal(wordsOf(tree), "Kept · “Thank you” thanks them tomorrow 10 AM.", "the board agrees: still answered");

  // Someone changed it elsewhere: the sheet says what the record says, and More holds the correction again.
  const changed = shownOf({ visit: { id: "v1", status: "missed" } });
  tree = draw(changed);
  assert.equal(answerOf(tree), null);
  assert.match(textOf(byTestId(tree, "cal-visit-state")), /Missed/);
  assert.ok(moreOf(tree).includes("Change to Kept"));
});

test("who it is about is shortened by the one rule: a first name, and a number or a team's name whole", () => {
  const asks = (name) => {
    const tree = open(shownOf({ person: { ...ANA, name } }));
    return {
      question: textOf(find(byTestId(tree, "cal-visit-ask"), (n) => n.type === "p")).trim(),
      message: byTestId(tree, "cal-visit-message")?.props["aria-label"],
      call: byTestId(tree, "cal-visit-call")?.props["aria-label"],
    };
  };
  assert.deepEqual(asks("Ana Ruiz"), {
    question: "Did Ana come yesterday?",
    message: "Message Ana",
    call: "Call Ana",
  });
  assert.deepEqual(
    asks("+1 (917) 555-0100"),
    {
      question: "Did +1 (917) 555-0100 come yesterday?",
      message: "Message +1 (917) 555-0100",
      call: "Call +1 (917) 555-0100",
    },
    "a person called by their number is never “+1”",
  );
  assert.equal(asks("The Google Workspace Team").message, "Message The Google Workspace Team", "nor a team “The”");
});
