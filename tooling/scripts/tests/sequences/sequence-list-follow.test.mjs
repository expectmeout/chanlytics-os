/**
 * The Sequences list as its surface publishes it (sequences/surface.ts), and an open sequence following it (use-record.ts
 * useSequenceRead). The list is read again at every arrival on the page and every send heard while the tab is on it; each
 * read made every row anew, so the list was drawn again and the open record, its People and its History were read again
 * each time, a change or none (the load review of 18 Oct 2026). Now a row that did not change is kept as the object it was,
 * and an open sequence is read again only when its own row moved. Run here on the stub React, through the real surface and
 * the real hook, with GET sequences answered by the test.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { again, fresh, installLegacyReact, settle, unmount } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// use-record.ts makes the record foot's context as it loads, and "react" under this runner's react-server condition has no
// createContext: the stub gives it one that holds its value, which nothing here draws (as sequence-batch-read.test.mjs).
const reactOfDashboard = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const { sequencesOverride } = await import(`${S}/surfaces/campaigns/sequences/surface.ts`);
const { useSequenceRead } = await import(`${S}/surfaces/campaigns/sequences/use-record.ts`);

/** A sequence's row as GET sequences answers it: what the list says of it, made anew by each read as JSON is. */
const rowOf = (id, line) => ({
  id,
  name: `Sequence ${id}`,
  starts: "moment",
  state: "on",
  created_at: "2026-10-01T12:00:00.000Z",
  first: null,
  date: null,
  steps: 2,
  channels: ["email"],
  needs: { waiting: 0, waiting_people: 0, held: 0, to_send: 0, replies: 0, oldest_at: null, batches: [] },
  next: null,
  last: { id: `b-${id}`, at: "2026-10-17T14:00:00.000Z", sent: line, replied: 0 },
  in_it: line,
});

/** What the door answers now: each sequence's line by id, read anew on every request. */
let lines = {};
const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  assert.equal(u.pathname, "/api/v1/sequences", `the test answers GET sequences alone, not ${u.pathname}`);
  return json({
    ok: true,
    data: { sequences: Object.entries(lines).map(([id, n]) => rowOf(id, n)), timezone: "UTC", word: "appointment" },
  });
};
/** The list read again, as the runner applies it on an arrival or a send heard. */
const listRead = () => sequencesOverride.apply();

/** One sequence's own read, answered here and counted by the id it was asked for. */
let reads = [];
const readOne = async (id) => {
  reads.push(id);
  return { ok: true, status: 200, data: { id } };
};
const peekNone = () => null;
let shown = null;
function Probe({ id }) {
  shown = useSequenceRead(id, readOne, peekNone);
  return null;
}
const draw = (id) => again(() => globalThis.React.createElement(Probe, { id }));

beforeEach(async () => {
  unmount();
  fresh();
  reads = [];
  shown = null;
  values.setSurfaceValue("sequences", undefined);
  lines = { a: 3, b: 5 };
  await listRead();
});

test("a list read that finds nothing new publishes the list it held; a changed row is new and every other row is kept", async () => {
  const held = values.surfaceValue("sequences");
  await listRead();
  assert.equal(values.surfaceValue("sequences"), held, "the same answer moves nothing: no row of it is drawn again");
  lines = { a: 3, b: 6 };
  await listRead();
  const now = values.surfaceValue("sequences");
  assert.notEqual(now, held, "something changed: the list is new");
  assert.equal(now.sequences[0], held.sequences[0], "a's row did not change and is the object it was");
  assert.notEqual(now.sequences[1], held.sequences[1], "b's row changed and is new");
  assert.equal(now.sequences[1].in_it, 6);
});

test("an open sequence is read as it opens, and again only when its own row in the list moves", async () => {
  draw("a");
  await settle();
  draw("a");
  assert.deepEqual(reads, ["a"], "read once, as it opened");
  assert.equal(shown.state, "read");
  // An arrival or a send heard that changed nothing; then a send in another sequence.
  await listRead();
  draw("a");
  await settle();
  lines = { a: 3, b: 9 };
  await listRead();
  draw("a");
  await settle();
  assert.deepEqual(reads, ["a"], "neither read the open sequence again: its row is the object it was");
  // Its own row moved (someone joined it): read again.
  lines = { a: 4, b: 9 };
  await listRead();
  draw("a");
  await settle();
  assert.deepEqual(reads, ["a", "a"], "its own row moved, so it is read again");
});

test("an id the list has no row for (a step's or a batch's, which the record reads its sequence by) follows the whole list", async () => {
  draw("step-1");
  await settle();
  draw("step-1");
  await listRead();
  draw("step-1");
  await settle();
  assert.deepEqual(reads, ["step-1"], "a list read that changed nothing reads nothing");
  lines = { a: 3, b: 7 };
  await listRead();
  draw("step-1");
  await settle();
  assert.deepEqual(reads, ["step-1", "step-1"], "any row moved: read again, as before it followed a row");
});
