/**
 * A read never writes (decision 0047, lane 6; decision 0034 section 4): the GET routes that write are held to a short
 * allow-list, each for its reason, and no other GET may reach a write door.
 *
 * Three reads wrote by accident of history, and are POSTs or writes of someone else's now:
 *   - GET calendar added the people the feed names to People (R1a): the sweep and the booking email's reader do, and a
 *     visit the board cannot match offers "Add to People" (POST contacts);
 *   - GET workspaces seated a person from an open invitation on every same-origin read (R1c): one POST the shell makes
 *     once, which says "You joined X" (POST me/invitations/accept);
 *   - GET leads/export marked the leads it took, which moves the month's count (R1d): POST leads/export.
 *
 * What is left writes on purpose, and the allow-list says why. Each is a download, and a download of the owner's
 * customers is the act the log must show: a `decisions` row names who took a copy, or who listened to a call, and when.
 * They stay GETs because the browser saves a GET's file and plays a GET's audio from a link (an anchor, an <audio src>),
 * and the row is the ledger's, not a change to anything a page draws.
 *
 * The trace is _trace.mjs's: from the function each GET hands to `read({ handle })`, through every function it calls by
 * name in the dashboard's own files, to a row written through supabase-js, a fact put on the ledger (emitEvent,
 * recordEvent, recordDecision) or an `.rpc()` of a function the schema's snapshot shows writing a table. It is held both
 * ways: a GET that writes and is not listed fails, and so does a listed one that no longer writes, so the list can only
 * fall. tracer.test.mjs runs the tracer on fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { repoFiles } from "../_ast.mjs";
import { checkout, declaresGet, writesReachedBy } from "./_trace.mjs";

const API = "apps/dashboard/app/api/v1/";

/**
 * The reads that write, and why. A new entry is a decision, argued where this list is read: a read that puts a fact
 * on the ledger for an audit may belong here; a read that changes what a page draws, or what the owner is charged, is a POST.
 */
const ALLOWED = {
  "GET contacts/export":
    "the people list as a CSV: the ledger row (export, workspace) is who took a copy of the whole customer list, and when",
  "GET conversations/[id]/export":
    "one conversation as a file: the ledger row (export, conversation) is who took a copy of a customer's words",
  "GET calls/[id]/export":
    "one call's transcript as a file: the ledger row (export, call) is who took a copy of a customer's voice, in text",
  "GET calls/[id]/recording":
    "a call's recording opened: the ledger row (open_recording, call; recording_opened, 00277) is who listened, written before the link leaves, once an hour per member",
  "GET export":
    "everything the workspace holds, as one file: the ledger row (export, workspace) is who took a copy of all of it",
};

const world = checkout();

/** Every route that declares a GET, by the key the typed client uses: `GET <path under /api/v1>`. */
const gets = repoFiles([API], { keep: /\/route\.ts$/ })
  .filter((file) => declaresGet(world, file))
  .map((file) => [`GET ${file.slice(API.length).replace(/\/route\.ts$/, "")}`, file]);

/** The doors each GET reaches, for the ones that reach any. */
const measured = Object.fromEntries(
  gets
    .map(([key, file]) => [key, writesReachedBy(world, file)])
    .filter(([, doors]) => doors.length > 0)
    .sort(([a], [b]) => a.localeCompare(b)),
);

test("the trace reads the routes there are", () => {
  // A tracer that found no GET would pass the next test for the wrong reason.
  assert.ok(gets.length > 40, `${gets.length} GET routes found: the trace reads nothing`);
  assert.ok(
    gets.some(([key]) => key === "GET calendar"),
    "the calendar's read is among them",
  );
  assert.ok(
    gets.some(([key]) => key === "GET workspaces"),
    "and the workspace list",
  );
});

test("a GET that writes is on the allow-list, with its reason", () => {
  const unlisted = Object.entries(measured)
    .filter(([key]) => !Object.hasOwn(ALLOWED, key))
    .map(([key, doors]) => `${key} reaches ${doors.join(", ")}`);
  assert.deepEqual(
    unlisted,
    [],
    "a read must not write: make it a POST, move the write to the sweep or the event that causes it, or, if it is a download whose ledger row is the point, list it in ALLOWED with the reason",
  );
});

test("the allow-list holds only reads that still write, so it can only fall", () => {
  const stale = Object.keys(ALLOWED).filter((key) => !Object.hasOwn(measured, key));
  assert.deepEqual(stale, [], "these no longer write (or no longer exist): take them off the list");
  for (const [key, why] of Object.entries(ALLOWED)) assert.ok(why.length > 40, `${key}: say why`);
});

test("the three reads that wrote by accident of history are no longer among them", () => {
  assert.deepEqual(measured["GET calendar"] ?? [], [], "R1a: the board adds nobody to People");
  assert.deepEqual(measured["GET workspaces"] ?? [], [], "R1c: the list seats nobody from an invitation");
  assert.equal(
    gets.some(([key]) => key === "GET leads/export"),
    false,
    "R1d: the leads export is a POST (it marks what it took)",
  );
});
