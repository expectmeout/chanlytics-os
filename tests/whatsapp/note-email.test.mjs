/**
 * The real sink keeps an address a customer wrote, or leaves one alone.
 * pgSink.noteEmail (apps/edge/lib/inbound/persist.ts) is the one place the
 * inbound path writes contacts.email, and it does it in one call: the door
 * note_person_email (00582) keeps the address only where none is on file,
 * under the person's row lock, so two messages cannot both write. Every outcome
 * here resolves -- the sink never throws into the handling path -- and what it
 * did is read back from the double's `seen`: the one call, and the row. The SQL
 * itself runs on Postgres in people/person-email.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { pgSink } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/inbound/persist.ts")).href);

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
/** The workspace's people: this person with the address on file (or none), and another holding `taken`, if given. */
const people = (email, taken = null) => ({
  contacts: [{ id: "k1", tenant_id: "t1", email }, ...(taken ? [{ id: "k2", tenant_id: "t1", email: taken }] : [])],
});
/** The door as 00582 answers it, over the rows the world holds: kept where none is on file, never moved, never over one. */
const door = (tables) => (a) => {
  const row = tables.contacts.find((c) => c.id === a.p_contact_id && c.tenant_id === a.p_tenant_id);
  if (!row) return "not_found";
  if (row.email) return "had_one";
  if (tables.contacts.some((c) => c.tenant_id === a.p_tenant_id && c.email === a.p_email)) return "taken";
  row.email = a.p_email;
  return "kept";
};
const world = (tables, faults = {}) => fakeDb(tables, faults, { note_person_email: door(tables) });
const calls = (db) => db.seen.filter((q) => q.rpc === "note_person_email");

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

test("none on file: one call, for this person in this workspace, with the address it was handed; nothing to say", async () => {
  const tables = people(null);
  const db = world(tables);
  const sink = pgSink(db, "t1", ing, null, "sms");
  assert.equal(sink.on, true);
  await listening(async (lines) => {
    assert.equal(await sink.noteEmail(ADDRESS), undefined);
    assert.deepEqual(
      calls(db).map((q) => q.args),
      [{ p_tenant_id: "t1", p_contact_id: "k1", p_email: ADDRESS }],
    );
    assert.equal(tables.contacts[0].email, ADDRESS);
    assert.deepEqual(lines, [], "the door writes the event; the sink says nothing");
    assert.equal(
      db.seen.filter((q) => q.table === "contacts").length,
      0,
      "no read of the row beside the door: the door reads it under its lock",
    );
  });
});

test("an address on file is left alone: the door answers had_one, and nothing is said", async () => {
  const tables = people("kept@example.com");
  const db = world(tables);
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.equal(calls(db).length, 1);
    assert.equal(tables.contacts[0].email, "kept@example.com", "nothing is written over an address on file");
    assert.deepEqual(lines, []);
  });
});

test("another person here holds the address: said in the log, naming the person and never the address, nothing thrown", async () => {
  const tables = people(null, ADDRESS);
  const db = world(tables);
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.equal(tables.contacts[0].email, null, "never moved from the other person: the owner merges them");
    assert.deepEqual(lines, [{ level: "info", event: "inbound_email_taken", tenant_id: "t1", contact: "k1" }]);
    assert.ok(!JSON.stringify(lines).includes(ADDRESS), "never the address");
  });
});

test("a refusal from the door is a failure the sink swallows and says, never a throw into the handling path", async () => {
  const db = fakeDb(
    people(null),
    {},
    {
      note_person_email: () => {
        throw Object.assign(new Error("That is not an email address."), { code: "22023" });
      },
    },
  );
  await listening(async (lines) => {
    assert.equal(await pgSink(db, "t1", ing, null, "sms").noteEmail(ADDRESS), undefined);
    assert.deepEqual(
      lines.map((l) => [l.level, l.event]),
      [["error", "pg_note_email_failed"]],
    );
    assert.match(lines[0].error, /not an email address/);
  });
});

test("off -- no database, or no workspace to record for -- resolves without touching anything", async () => {
  const none = pgSink(null, "t1", ing, null, "sms");
  assert.equal(none.on, false);
  assert.equal(await none.noteEmail(ADDRESS), undefined);

  const db = world(people(null));
  const noWorkspace = pgSink(db, null, ing, null, "sms");
  assert.equal(noWorkspace.on, false);
  assert.equal(await noWorkspace.noteEmail(ADDRESS), undefined);
  assert.deepEqual(db.seen, [], "not one query");
});
