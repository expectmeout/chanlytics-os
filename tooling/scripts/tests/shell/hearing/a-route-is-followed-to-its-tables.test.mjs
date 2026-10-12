/**
 * The tracer that holds a page to what it draws (_reads.mjs, ported from the Wiring Blueprint's deps.mjs) follows a route to its
 * tables as the code does -- and no further. Run on a repository in miniature (_reads-repo.mjs), so what it finds is known:
 * a table, an embed of two more, a SQL function reached through a namespace import and a view, a write with the event it makes
 * and the triggers made for that event, the exclusions that kept the trace exact (an erasure trigger, the ledger's own, the
 * wrapper's reads of the caller's seat), and an edge door a route asks, kept apart from the dashboard's own code.
 *
 * The coverage test (reads-are-heard.test.mjs) runs the same tracer on the real repository; this holds the tracer to its word, so
 * a table it stopped finding cannot let a page read one in silence.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PLUMBING,
  drawnTables,
  getsIn,
  getsOfFile,
  readsOf,
  registeredOverrides,
  traceRoutes,
  unheardReads,
  untoldWrites,
} from "./_reads.mjs";
import { writeRepo } from "./_reads-repo.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "chanlytics-reads-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
writeRepo(root);
const { tables, routes } = traceRoutes(root);

/** Two kinds of record, as contracts' RECORD_KINDS names them. */
const KINDS = { person: ["contacts"], thread: ["messages", "conversations"] };
const liveTablesOf = (kinds) => kinds.flatMap((k) => KINDS[k]);

test("it reads the tables of the schema, and each route the handlers export by their method", () => {
  assert.deepEqual(
    [...tables].sort(),
    ["audits", "contacts", "erasures", "events", "memberships", "messages", "notes", "recounts", "sweeps"],
    "tables, not the view",
  );
  assert.deepEqual(Object.keys(routes).sort(), ["GET people", "PATCH people/[id]", "POST people"]);
});

test("a read is the tables its code reaches: a table, an embed, a SQL function through a namespace import and a view; not the wrapper's seat", () => {
  const book = routes["GET people"];
  // contacts is read by .from; messages and notes by the select's embed; the function's body reads notes and, through the view, messages.
  assert.deepEqual(book.reads, ["contacts", "messages", "notes"]);
  assert.equal(
    book.reads.includes("memberships"),
    false,
    "the wrapper reads the caller's seat for every route: not the route's",
  );
  assert.deepEqual(book.rpcs, ["note_count"], "reached as facts.counted, an import * as");
  assert.deepEqual(book.writes, []);
  assert.equal(
    book.via.reads.notes,
    "apps/dashboard/src/server/readers/people.ts#everyone",
    "and it says where it met each",
  );
});

test("a write is what the code writes, by the event it makes, and what the triggers made for those events write; not a comment, an erasure or the ledger", () => {
  const add = routes["POST people"];
  assert.deepEqual(add.verbs, {
    audits: ["INSERT"],
    contacts: ["INSERT", "UPDATE"],
    messages: ["UPDATE"],
    notes: ["INSERT"],
  });
  assert.deepEqual(add.writes, ["audits", "contacts", "messages", "notes"]);
  assert.equal(add.via.writes.audits, "a trigger", "audits is written by the insert's trigger, not by the route");
  for (const left of ["recounts", "erasures", "sweeps"])
    assert.equal(
      add.writes.includes(left),
      false,
      `${left}: an update's trigger, an erasure's, a comment's and a door's are not this route's`,
    );
});

test("an update fires the triggers made for updates and not the insert's", () => {
  const touch = routes["PATCH people/[id]"];
  assert.deepEqual(touch.verbs, { notes: ["UPDATE"], recounts: ["UPDATE"] });
  assert.equal(touch.writes.includes("audits"), false);
});

test("an edge door a route names is followed apart: what it adds is the door's, and the route's own reads and writes stay the dashboard's", () => {
  const add = routes["POST people"];
  assert.deepEqual(add.doors, ["/api/admin/steer"]);
  assert.deepEqual(add.doorWrites, ["sweeps"]);
  assert.deepEqual(add.doorReads, ["recounts"]);
  assert.equal(add.writes.includes("sweeps"), false);
  assert.deepEqual(add.allVerbs.sweeps, ["INSERT"], "with its event");
  assert.deepEqual(routes["GET people"].doors, [], "a route that asks no door has none");
});

test("the machinery's tables are named, and a page is not held to them", () => {
  for (const table of ["events", "event_outbox", "idempotency_keys", "jobs", "sweep_status"])
    assert.ok(PLUMBING.has(table), table);
  // The seat, the workspace's row and the standing are records a page draws, not plumbing: the wrapper's own reads are cut instead.
  for (const table of ["memberships", "tenants", "billing_accounts"]) assert.equal(PLUMBING.has(table), false, table);
  const fake = {
    "GET x": {
      reads: ["events", "notes"],
      via: { reads: { events: "a", notes: "b" } },
      doorReads: ["jobs", "sweeps"],
      doorVia: { reads: { jobs: "c", sweeps: "d" } },
    },
  };
  assert.deepEqual([...readsOf(["GET x"], fake).keys()], ["notes"]);
  assert.deepEqual([...readsOf(["GET x"], fake, { doors: true }).keys()], ["notes", "sweeps"]);
  assert.equal(readsOf(["GET x"], fake).get("notes"), "GET x <- b");
});

test("the routes a surface reads are the keys its source names, less its comments; the shell's surfaces are the names its list holds, less its comments", () => {
  assert.deepEqual(getsIn('read("GET people"); read(`GET people/[id]`); "GET not a route"; "GET Upper"'), [
    "GET people",
    "GET people/[id]",
  ]);
  assert.deepEqual(
    getsOfFile("apps/dashboard/src/surfaces/people/surface.ts", root),
    ["GET people", "GET people/[id]"],
    'prose that names "GET commented" is not a read',
  );
  assert.deepEqual(registeredOverrides(root), ["workspaceOverride", "todayOverride", "peopleOverride"]);
});

test("a surface's unheard reads are the tables it reads that its kinds do not cover; a kind it declares covers its tables", () => {
  const people = { key: "people", reads: ["person"], gets: ["GET people"] };
  const unheard = unheardReads(people, routes, liveTablesOf);
  assert.deepEqual([...unheard.keys()].sort(), ["messages", "notes"], "contacts is the person's");
  assert.equal(unheard.get("notes"), "GET people <- apps/dashboard/src/server/readers/people.ts#everyone");
  assert.deepEqual(
    [...unheardReads({ ...people, reads: ["person", "thread"] }, routes, liveTablesOf).keys()],
    ["notes"],
  );
  // A route the trace does not know reads nothing it can name; the coverage test fails a surface that names one.
  assert.deepEqual([...unheardReads({ ...people, gets: ["GET nowhere"] }, routes, liveTablesOf).keys()], []);
});

test("a write is untold when the surface draws a table it changes and the feed would not tell it of that event", () => {
  const surface = {
    key: "s",
    reads: ["person", "thread"],
    omit: [{ tables: ["conversations"], why: "it counts messages, not threads" }],
    refreshOnTables: ["contacts", "messages"],
  };
  assert.deepEqual(drawnTables(surface, liveTablesOf), ["contacts", "messages"], "less what it omits");
  // The feed tells contacts of its inserts only; messages of both.
  const told = { contacts: ["INSERT"], messages: ["INSERT", "UPDATE"] };
  const verbs = { contacts: ["INSERT", "UPDATE"], messages: ["UPDATE"], conversations: ["UPDATE"], events: ["INSERT"] };
  assert.deepEqual(untoldWrites(surface, verbs, told, liveTablesOf), ["contacts:UPDATE"]);
  // A surface that hears nothing is told of nothing.
  assert.deepEqual(untoldWrites({ ...surface, refreshOnTables: [] }, verbs, told, liveTablesOf), [
    "contacts:INSERT",
    "contacts:UPDATE",
    "messages:UPDATE",
  ]);
  assert.deepEqual(untoldWrites(surface, { sweeps: ["INSERT"] }, told, liveTablesOf), [], "a table it does not draw");
});
