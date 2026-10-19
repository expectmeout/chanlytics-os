/**
 * A sequence's reads following the Sequences list (sequences/use-record.ts), run on the stub React through the real hooks
 * and the real surface (sequences/surface.ts), with the doors answered by the test. The list is read again at every arrival
 * on the page and every send heard while the tab is on it.
 *
 * The list and an open sequence: each read made every row anew, so the list was drawn again and the open record, its
 * People and its History were read again each time, a change or none (the load review of 18 Oct 2026). Now a row that did
 * not change is kept as the object it was (shareUnchanged), and an open sequence is read again only when its own row moved;
 * an id the list has no row for (a step's, a batch's) follows the whole list.
 *
 * A batch of it, read where its record draws it (History's day, a lead step's next email, the step editor's people:
 * useBatchRead), through the batch's own door, GET broadcasts/[id], which its run's sheet in Sent reads, so the two say one
 * thing from one answer. A day of History that ended months ago was read whole again at every move of the list. It follows
 * the door's own rule now, its sheet's (contracts runStillMoving): read as it opens, and again as the list moves only while
 * the batch is underway or within the reply window after it ended.
 *
 * The list's sequences, read ahead (sequences/verbs.ts warmRecordsAhead): on a phone a row has no pointer to reach it before
 * the press, so a sequence opened waited for its record behind "Reading…" (480 to 570 ms on a local build, 19 Oct 2026). The
 * list reads them once the frame is idle, one after another, each with who is in it where its Steps draws them.
 */
import { test, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { REPLY_WINDOW_MS } from "@chanlytics/contracts";
import { again, fresh, installLegacyReact, settle, unmount } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// use-record.ts makes the record foot's context as it loads, and "react" under this runner's react-server condition has no
// createContext: the stub gives it one that holds its value, which nothing here draws.
const reactOfDashboard = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const { sequencesOverride } = await import(`${S}/surfaces/campaigns/sequences/surface.ts`);
const { broadcasts } = await import(`${S}/surfaces/campaigns/broadcasts/verbs.ts`);
const { useBatchRead, useSequenceRead } = await import(`${S}/surfaces/campaigns/sequences/use-record.ts`);
const { warmRecordsAhead } = await import(`${S}/surfaces/campaigns/sequences/verbs.ts`);

describe("the list and an open sequence", () => {
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
});

describe("a batch of it, through its own door", () => {
  const HOUR = 3_600_000;
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  /** A batch's answer as the door gives it: the row, and nobody on it (what the hook judges is the row). */
  const answerOf = (id, row) => ({
    broadcast: { id, state: "sent", started_at: null, finished_at: null, ...row },
    recipients: [],
    reach_out: null,
  });
  const BATCHES = {
    old: answerOf("old", { finished_at: ago(30 * 24 * HOUR) }),
    recent: answerOf("recent", { finished_at: ago(2 * HOUR) }),
    waiting: answerOf("waiting", { state: "pending_approval" }),
  };

  /** The door, answered here: each read counted by its id, and kept as the read cache keeps it, for the next paint. */
  let reads = [];
  let held = new Map();
  broadcasts.detail = async (id) => {
    reads.push(id);
    const r = { ok: true, status: 200, data: BATCHES[id] };
    held.set(id, r);
    return r;
  };
  broadcasts.peekDetail = (id) => held.get(id) ?? null;

  let shown = null;
  function Probe({ id }) {
    shown = useBatchRead(id);
    return null;
  }
  const draw = (id) => again(() => globalThis.React.createElement(Probe, { id }));
  /** The Sequences list read again: a new value of the surface the record follows. */
  const listMoves = () => values.setSurfaceValue("sequences", { sequences: [], timezone: "UTC", word: "appointment" });

  beforeEach(() => {
    unmount();
    fresh();
    reads = [];
    held = new Map();
    shown = null;
    listMoves();
  });

  test("a day that ended past the reply window is read as it opens, and not again as the list moves", async () => {
    draw("old");
    await settle();
    draw("old");
    assert.equal(shown.state, "read");
    assert.deepEqual(reads, ["old"], "read once, as it opened");
    for (let n = 0; n < 3; n += 1) {
      listMoves();
      draw("old");
      await settle();
    }
    assert.deepEqual(reads, ["old"], "three sends heard in the workspace read nothing of it");
    assert.equal(shown.state, "read", "and it still shows what it read");
    // A write in the tab empties its read cache (read-cache.ts stale): what the day said is still what it said.
    held.clear();
    listMoves();
    draw("old");
    await settle();
    assert.deepEqual(reads, ["old"], "after a write, the list read again reads nothing of it either");
    assert.equal(shown.state, "read");
  });

  test("a batch underway, or ended within the reply window, is read again each time the list moves", async () => {
    assert.ok(Date.parse(BATCHES.recent.broadcast.finished_at) > Date.now() - REPLY_WINDOW_MS);
    for (const id of ["waiting", "recent"]) {
      reads = [];
      draw(id);
      await settle();
      listMoves();
      draw(id);
      await settle();
      listMoves();
      draw(id);
      await settle();
      assert.deepEqual(reads, [id, id, id], `${id}: as it opened, then at each move of the list`);
    }
  });

  test("another batch opened is read, whatever the last one said", async () => {
    draw("old");
    await settle();
    draw("recent");
    await settle();
    draw("old");
    await settle();
    assert.deepEqual(reads, ["old", "recent", "old"], "a day opened again is read again, painted from what is held");
  });
});

describe("the list's sequences, read ahead", () => {
  /** What the doors were asked, in order: `record <id>` or `people <id>`. */
  let asked = [];
  /**
   * A sequence's record as GET sequences/[id] answers it: a sequence on a date where its id says `date`, else on a moment,
   * of one step where its id ends `-1`, else of two.
   */
  const recordOf = (id) => ({
    sequence: { id, starts: id.startsWith("date") ? "date" : "moment" },
    steps: id.endsWith("-1") ? [{ id: "s1" }] : [{ id: "s1" }, { id: "s2" }],
  });
  const json = (body) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  /** Until `done` holds, or three seconds have gone. */
  const until = async (done) => {
    for (let i = 0; i < 300 && !done(); i += 1) await new Promise((r) => setTimeout(r, 10));
  };
  let theirs;
  beforeEach(() => {
    asked = [];
    theirs = globalThis.window.fetch;
    globalThis.window.fetch = async (url) => {
      const [id, people] = new URL(String(url), "https://app.chanlytics.com").pathname
        .replace("/api/v1/sequences/", "")
        .split("/");
      asked.push(`${people ? "people" : "record"} ${id}`);
      return json({ ok: true, data: people ? { people: [] } : recordOf(id) });
    };
  });
  afterEach(() => {
    globalThis.window.fetch = theirs;
    delete globalThis.document.visibilityState;
  });

  test("one after another, in the list's order, each with who is in it where its Steps draws them, and none it holds", async () => {
    warmRecordsAhead(["ahead-a", "ahead-b-1", "date-ahead-c"]);
    await until(() => asked.length === 4);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(
      asked,
      ["record ahead-a", "people ahead-a", "record ahead-b-1", "record date-ahead-c"],
      "a sequence of one step, or on a date, draws nobody in line on its Steps: its record alone",
    );
    asked = [];
    warmRecordsAhead(["ahead-a", "ahead-b-1", "ahead-d-1"]);
    await until(() => asked.length === 1);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(asked, ["record ahead-d-1"], "the two it holds paint at once and are read again as they open");
  });

  test("twelve at most, and none once it is stopped or the tab is put away", async () => {
    const many = Array.from({ length: 14 }, (_, i) => `many-${i}-1`);
    warmRecordsAhead(many);
    await until(() => asked.length === 12);
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(
      asked,
      many.slice(0, 12).map((id) => `record ${id}`),
    );
    asked = [];
    const stop = warmRecordsAhead(["stop-a-1", "stop-b-1"]);
    await until(() => asked.length === 1);
    stop();
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(asked, ["record stop-a-1"]);
    asked = [];
    globalThis.document.visibilityState = "hidden";
    warmRecordsAhead(["hidden-a-1"]);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(asked, [], "a tab put away reads nothing ahead");
  });
});
