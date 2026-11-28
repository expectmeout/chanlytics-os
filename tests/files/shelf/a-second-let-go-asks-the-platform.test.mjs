/**
 * A second try at letting a copy go asks the video platform first (apps/edge/lib/files/copy/let-go.ts
 * `finishCopyGoing`, reached by the half-hourly pass for a copy still marked going). The first try may have deleted
 * the copy and ended before it said so, and the shelf may hold something else by the time the pass comes. A row must
 * never say a copy is here when the platform no longer has it: so a copy gone there is away, whatever the shelf says
 * now, and only one the platform is seen to hold is put back here.
 *
 * Each case kills the real letting go between two of its steps (mark, ask the shelf, delete, say), with the video
 * platform and the shelf faked, then runs the real pass. The four: the delete was never tried; it was tried and its
 * outcome is not known; it was confirmed; and the platform still holds the copy.
 */
import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { linesOf } from "../../_log-lines.mjs";
import {
  LET_GO,
  STREAM_API,
  T,
  daysAgo,
  ensureCopy,
  keepCopiesMoving,
  letUnusedCopiesGo,
  madeVideo,
  platformSaw,
  realFetch,
  runReturns,
  setPg,
  shelfWorld,
  shelveNow,
  theSync,
  theWeb,
  videoBytes,
} from "./_world.mjs";

let open = null;
let webBefore = null;
afterEach(() => {
  open?.close();
  open = null;
  if (webBefore) globalThis.fetch = webBefore;
  webBefore = null;
  resetBreakers();
});
after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});

const soon = () => Date.now() + 30_000;
const eventsOf = (lines, event) => lines.filter((line) => line.event === event);

/**
 * One made video unused for three weeks, shelved and checked, which the video platform holds as ready. `dies` names
 * the step the first try ends at:
 *
 *   before_delete   the delete at the platform throws before anything is deleted there
 *   delete_unheard  the delete lands at the platform, and its answer never arrives
 *   before_say      the delete is confirmed, and the database gives no answer to "it went"
 */
async function firstTry(dies) {
  const file = madeVideo({ ready_at: daysAgo(21), created_at: daysAgo(21), copy_used_at: daysAgo(21) });
  const web = theWeb({ held: [{ uid: file.media_ref, state: "ready" }] });
  theSync();
  // The platform's delete, killed where the case says: only the first try's, so the pass meets a platform that answers.
  const state = { dying: true };
  webBefore = globalThis.fetch;
  const answer = webBefore;
  globalThis.fetch = async (url, init = {}) => {
    const deletes = init.method === "DELETE" && String(url).startsWith(`${STREAM_API}/`);
    if (!deletes || !state.dying || dies === "before_say") return answer(url, init);
    if (dies === "delete_unheard") await answer(url, init);
    throw new Error("socket hang up");
  };
  open = shelfWorld({ files: [file] });
  const w = open;
  await shelveNow(w, file, videoBytes(1));
  const ref = file.media_ref;
  if (dies === "before_say") {
    // The database dies as the letting go says the copy went: once.
    const say = w.db.rpc.bind(w.db);
    w.db.rpc = (name, args) => {
      if (name !== "file_copy_gone" || !state.dying) return say(name, args);
      state.dying = false;
      return Promise.resolve({ data: null, error: { message: "connection terminated", code: "08006" } });
    };
  }
  assert.equal(await letUnusedCopiesGo(w.db, T, soon()), 0, "the first try ends before it can say the copy went");
  assert.deepEqual([w.file(file.id).copy_state, w.file(file.id).media_ref], ["going", ref], "still marked going");
  state.dying = false;
  resetBreakers();
  // Ten minutes on, the pass finds it still going.
  w.file(file.id).updated_at = new Date(Date.now() - LET_GO.staleMs - 60_000).toISOString();
  return { w, web, file, ref, row: () => w.file(file.id) };
}

/** What the platform holds of a copy now, as its own list has it. */
const atPlatform = (web, ref) => !web.copies.find((copy) => copy.uid === ref)?.deleted;

test("the delete was never tried: the platform still has the copy, so the shelf decides, and one it holds goes", async () => {
  const { w, web, file, ref, row } = await firstTry("before_delete");
  assert.equal(atPlatform(web, ref), true);
  await keepCopiesMoving(w.db, Date.now());
  assert.deepEqual([row().copy_state, row().copy_why, row().media_ref], ["away", null, null]);
  assert.equal(atPlatform(web, ref), false, "deleted at the platform by the second try");
  assert.ok(w.onShelf(file.id), "and the shelf holds what gives it back");
});

test("the delete was never tried and the shelf has lost the copy since: it is here again, since the platform holds it", async () => {
  const { w, web, file, ref, row } = await firstTry("before_delete");
  w.relay.shelf.held.clear();
  const { lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.deepEqual([row().copy_state, row().media_ref], ["here", ref], "it plays as it did");
  assert.equal(atPlatform(web, ref), true, "nothing was deleted");
  assert.equal(w.shelfRow(file.id).state, "saving", "and its shelf copy is being put back");
  assert.equal(eventsOf(lines, "shelf_copy_lost").length, 1);
});

test("the delete landed and its answer never came: the copy is away, never here, though the shelf has lost it since", async () => {
  const { w, web, file, ref, row } = await firstTry("delete_unheard");
  assert.equal(atPlatform(web, ref), false, "the first try's delete landed");
  // The shelf no longer holds it either: on its word alone the row would say here, and name a copy nobody has.
  w.relay.shelf.held.clear();
  const { lines } = await linesOf(() => keepCopiesMoving(w.db, Date.now()));
  assert.deepEqual([row().copy_state, row().media_ref], ["away", null], "away: the platform no longer has it");
  assert.deepEqual(
    eventsOf(lines, "copy_let_go").map((line) => [line.by, line.file, line.found, line.went]),
    [["second_try", file.id, "gone", true]],
  );
  // Play then finds the shelf empty, has the copy put back from the kept file, and waits for it: nothing is lost.
  assert.equal((await ensureCopy(w.db, T, file.id, "play")).copy, "returning");
  assert.deepEqual(await runReturns(w), [{ returned: "waits:unreadable" }]);
  assert.equal(w.shelfRow(file.id).state, "saving");
});

test("the delete was confirmed and the run died before saying so: the copy is away, whatever the shelf says now", async () => {
  const { w, web, file, ref, row } = await firstTry("before_say");
  assert.equal(atPlatform(web, ref), false, "the first try's delete was confirmed");
  assert.deepEqual(platformSaw(web).deleted, [ref]);
  // The shelf gives no answer at all when the pass comes.
  w.relay.state.down = true;
  await keepCopiesMoving(w.db, Date.now());
  assert.deepEqual([row().copy_state, row().copy_why, row().media_ref], ["away", null, null]);
  assert.equal(w.shelfRow(file.id).state, "checked", "its shelf row is as it was: the shelf was not asked");
  assert.deepEqual(platformSaw(web).deleted, [ref], "and nothing is deleted twice");
});

test("the platform gives no answer on the second try: a copy the shelf does not vouch for is neither deleted nor said here", async () => {
  const { w, web, file, ref, row } = await firstTry("delete_unheard");
  w.relay.shelf.held.clear();
  // The platform's read fails as the pass asks: nobody can say whether the copy is there.
  const answer = globalThis.fetch;
  globalThis.fetch = (url, init = {}) =>
    String(url) === `${STREAM_API}/${ref}` && (init.method ?? "GET") === "GET"
      ? Promise.reject(new Error("socket hang up"))
      : answer(url, init);
  await keepCopiesMoving(w.db, Date.now());
  assert.deepEqual([row().copy_state, row().media_ref], ["going", ref], "left marked, for the next pass");
  // The next pass, with the platform answering: gone there, so it is away.
  globalThis.fetch = answer;
  resetBreakers();
  row().updated_at = new Date(Date.now() - LET_GO.staleMs - 60_000).toISOString();
  await keepCopiesMoving(w.db, Date.now());
  assert.deepEqual([row().copy_state, row().media_ref], ["away", null]);
  assert.equal(platformSaw(web).deleted.length, 2, "the first try's two sends, and none since");
  assert.ok(file.id);
});
