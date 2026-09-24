/**
 * The real sink keeps an address a customer wrote, or leaves one alone.
 * pgSink.noteEmail (apps/edge/lib/whatsapp/persist.ts) is the one place the
 * inbound path writes contacts.email: it reads the person's row first, because
 * the door set_person_email (00171) itself overwrites, and calls the door only
 * where nothing is on file. Every outcome here resolves -- the sink never throws
 * into the handling path -- and what it did is read back from the double's
 * `seen`: the one select, the one rpc with the address, or neither.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { pgSink } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href);

const ing = {
  message_id: "m1",
  conversation_id: "c1",
  contact_id: "k1",
  is_new: true,
  consent: "unknown",
  dnc: false,
  paused_until: null,
};
const ADDRESS = "ana@example.com";
/** The person's row, with the address the workspace already holds for them, or none. */
const person = (email) => ({ contacts: [{ id: "k1", tenant_id: "t1", email }] });
/** The door as the database answers it: the row it wrote. */
const door = () => ({ contact_id: "k1", email: ADDRESS });
/** The door refusing, with the code the migration raises; the double turns the throw into supabase-js's envelope. */
const refusal = (message, code) => () => {
  throw Object.assign(new Error(message), { code });
};
const rpcs = (db) => db.seen.filter((q) => q.rpc === "set_person_email");
const reads = (db) => db.seen.filter((q) => q.table === "contacts" && q.op === "select");

/** What the sink says on the console while `fn` runs: one structured line each. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"])
    console[stream] = (...args) => {
      try {
        lines.push(JSON.parse(args[0]));
      } catch {
        lines.push({ event: String(args[0]) });
      }
    };
  try {
    return await fn(lines);
  } finally {
    Object.assign(console, real);
  }
}

test("an address on file is left alone: the person's row is read once, by its key, and the door is never called", async () => {
  const db = fakeDb(person("kept@example.com"), {}, { set_person_email: door });
  const sink = pgSink(db, "t1", ing, null, "sms");
  assert.equal(sink.on, true);
  await listening(async (lines) => {
    assert.equal(await sink.noteEmail(ADDRESS), undefined);
    assert.deepEqual(
      reads(db).map((q) => q.filters),
      [[["eq", "id", "k1"]]],
      "the one read: this person's row",
    );
    assert.deepEqual(rpcs(db), [], "nothing is written over an address on file");
    assert.deepEqual(lines, [], "and nothing to say");
  });
});

test("none on file: the door is called once, for this person, with the address it was handed", async () => {
  const db = fakeDb(person(null), {}, { set_person_email: door });
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.deepEqual(
      rpcs(db).map((q) => q.args),
      [{ p_contact_id: "k1", p_email: ADDRESS }],
    );
    assert.deepEqual(lines, [], "the door writes the event; the sink says nothing");
  });
});

test("a read that failed keeps everything: the door is not called over an address nobody could see, and the failure is said", async () => {
  const db = fakeDb(person(null), { "contacts.select": { message: "connection reset" } }, { set_person_email: door });
  await listening(async (lines) => {
    assert.equal(
      await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS),
      undefined,
      "resolves: never a throw into the handling path",
    );
    assert.deepEqual(rpcs(db), [], "no write follows a read that failed");
    assert.deepEqual(
      lines.map((l) => [l.level, l.event]),
      [["error", "pg_note_email_failed"]],
    );
    assert.match(lines[0].error, /connection reset/);
  });
});

test("another person here holds the address: said in the log, naming the person and never the address, nothing thrown", async () => {
  const db = fakeDb(
    person(null),
    {},
    { set_person_email: refusal("Another person here already has that address.", "23505") },
  );
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.equal(rpcs(db).length, 1, "the door was asked once");
    assert.deepEqual(lines, [{ level: "info", event: "inbound_email_taken", tenant_id: "t1", contact: "k1" }]);
    assert.ok(!JSON.stringify(lines).includes(ADDRESS), "never the address");
  });
});

test("any other refusal from the door is a failure the sink swallows and says, never a throw into the handling path", async () => {
  const db = fakeDb(person(null), {}, { set_person_email: refusal("Person not found.", "P0002") });
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.equal(rpcs(db).length, 1);
    assert.deepEqual(
      lines.map((l) => [l.level, l.event]),
      [["error", "pg_note_email_failed"]],
    );
    assert.match(lines[0].error, /Person not found/);
  });
});

test("off -- no database, or no workspace to record for -- resolves without touching anything", async () => {
  const none = pgSink(null, "t1", ing, null, "sms");
  assert.equal(none.on, false);
  assert.equal(await none.noteEmail(ADDRESS), undefined);

  const db = fakeDb(person(null), {}, { set_person_email: door });
  const noWorkspace = pgSink(db, null, ing, null, "sms");
  assert.equal(noWorkspace.on, false);
  assert.equal(await noWorkspace.noteEmail(ADDRESS), undefined);
  assert.deepEqual(db.seen, [], "not one query");
});
