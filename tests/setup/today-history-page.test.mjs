/**
 * The business's history on Today (decision 0073, R23; today/zones/history.tsx), drawn without a browser: rows in the
 * setting-up card, from the imports ledger Setup reads, and only while they help. One line while any of it is still
 * coming in; a row for each source that stopped where Try again can bring it in, the press answering at once; nothing
 * once it is all in (18 Nov 2026: "Your history · All in" was a card with nothing to do), and nothing for what Content
 * reads for itself. The world is the first run's (_first-run-world.mjs): the rows read the same Setup surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { until } from "../shared/_until.mjs";
import {
  byTestId,
  flashes,
  fresh,
  mountWith,
  saidOf,
  setSetup,
  setupVerbs,
  surface,
  textOf,
  withFacts,
} from "./_first-run-world.mjs";

const { TodayHistory } = await importSrc("apps/dashboard/src/surfaces/today/zones/history.tsx");
const DAY = 86_400_000;
const row = (source, state, counts, over = {}) => ({
  source,
  state,
  counts,
  parts_done: state === "done" ? 1 : 0,
  parts_total: 1,
  oldest: null,
  started_at: new Date(Date.now() - DAY).toISOString(),
  finished_at: state === "done" ? new Date(Date.now() - DAY).toISOString() : null,
  last_error: null,
  via: null,
  ...over,
});
/** Today's rows drawn, as the page draws them, over Setup as the seam holds it (their own state kept across draws). */
const draw = () => mountWith(TodayHistory);
/** Today's rows drawn as a page opened again: every hook's cell empty. */
const drawFresh = () => {
  fresh();
  return draw();
};

test("while the history is still coming in: one line, how far it has come, and nothing to press", () => {
  const imports = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 412, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  setSetup(surface({ ...withFacts, imports, people: 640 }));
  const tree = drawFresh();
  const rows = byTestId(tree, "today-history");
  assert.ok(rows);
  const coming = byTestId(rows, "today-history-coming");
  assert.equal(textOf(coming), "Bringing in your history3 of 4 in · Keeps going if you leave.");
  assert.equal(byTestId(coming, "setup-verb"), null, "taken, still under way: no act");
  assert.doesNotMatch(
    textOf(rows),
    /All in|640 people|stopped/,
    "no facts, no count of people: Today's own are the day's",
  );
});

test("nothing once it is all in, the minute it finished too; nothing before anything came; nothing for Content's own reads", () => {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  setSetup(
    surface({
      ...withFacts,
      imports: [row("google_reviews", "done", { reviews: 3 }, { finished_at: justNow })],
      people: 3,
    }),
  );
  assert.equal(byTestId(drawFresh(), "today-history"), null, "all in: People's, the Inbox's and the Calendar's own");
  setSetup(surface({ ...withFacts, imports: [] }));
  assert.equal(byTestId(draw(), "today-history"), null, "nothing came");
  // A website read again, or one that stopped, is Content's to say (it kept "Your history" on Today).
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("contacts", "done", { people: 3 }),
        row("website_media", "running", {}),
        row("instagram", "failed", {}),
      ],
      people: 3,
    }),
  );
  assert.equal(byTestId(draw(), "today-history"), null, "Content's own reads");
  setSetup(undefined);
  assert.equal(byTestId(draw(), "today-history"), null, "Setup not read yet");
});

test("a source that stopped: what happened, what it kept, and Try again that answers at the press", async (t) => {
  const again = [];
  let answer = { ok: true, message: "" };
  t.after(() => delete setupVerbs.importAgain);
  setupVerbs.importAgain = async (source) => {
    again.push(source);
    return answer;
  };
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("google_reviews", "done", { reviews: 3 }),
        row("mailbox", "failed", { messages: 130 }, { last_error: "It stopped part way. What came in is kept." }),
      ],
      people: 3,
    }),
  );
  let tree = drawFresh();
  assert.equal(byTestId(tree, "today-history-coming"), null, "nothing is coming in");
  const stopped = byTestId(tree, "today-history-stopped-mailbox");
  assert.match(textOf(stopped), /^Your inbox stopped coming in130 emails keptTry again$/);
  const press = byTestId(tree, "today-history-again-mailbox");
  assert.equal(textOf(press), "Try again");
  press.props.onClick();
  await until(() => again.length === 1, "the press asked the run to start again");
  assert.deepEqual(again, ["mailbox"]);
  tree = draw();
  const busy = byTestId(tree, "today-history-again-mailbox");
  assert.equal(saidOf(busy), "Starting");
  assert.equal(busy.props.disabled, true, "a second press does nothing while the first is on its way");
  // The run is heard starting: the row gives way to the one line of what is coming in.
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("google_reviews", "done", { reviews: 3 }),
        row("mailbox", "running", { messages: 130 }, { oldest: "2026-07-01T00:00:00Z", parts_total: null }),
      ],
      people: 3,
    }),
  );
  tree = draw();
  assert.equal(byTestId(tree, "today-history-stopped-mailbox"), null);
  assert.match(textOf(byTestId(tree, "today-history-coming")), /1 of 2 in/);
  // A press the door refuses: Try again again, and the refusal in a toast.
  answer = { ok: false, message: "Your mailbox signed out." };
  setSetup(
    surface({
      ...withFacts,
      imports: [row("mailbox", "failed", {}, { last_error: "It stopped part way. What came in is kept." })],
      people: 3,
    }),
  );
  tree = drawFresh();
  flashes.length = 0;
  assert.match(textOf(byTestId(tree, "today-history-stopped-mailbox")), /What came in is kept\./);
  byTestId(tree, "today-history-again-mailbox").props.onClick();
  await until(() => flashes.length > 0, "the refusal was said");
  tree = draw();
  assert.equal(textOf(byTestId(tree, "today-history-again-mailbox")), "Try again");
  assert.equal(flashes.length, 1, "the refusal said once");
});
