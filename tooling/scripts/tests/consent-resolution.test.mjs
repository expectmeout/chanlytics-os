/**
 * The consent truth table.
 *
 * Consent lives in `contacts.consent`, which only Postgres knows, and the gate
 * reads it from the ingest result. The distinction the whole table turns on is
 * `recorded: false` vs `recorded: null`. One is a record saying this person is
 * opted in. The other is no record at all. Collapsing them is the bug: the old
 * gate was `n.optOut || (!!ing && isOptedOutContact(ing))`, and a row carrying
 * neither field read as an affirmative "they are opted in".
 *
 * There used to be a third input, a copy of the answer CACHED on the Blob
 * thread, for the case where Postgres did not answer at all. It has no case
 * left: Postgres is the only memory, so a message whose thread could not be
 * read never reaches this gate — the receptionist hands it to a person
 * instead (`state_unavailable`). The cache went with the store.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { resolveConsent } = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/consent.ts")).href);

/** Postgres answered and nobody opted out — the ordinary case. */
const base = { optOutNow: false, optInNow: false, recorded: false };
const on = (over) => resolveConsent({ ...base, ...over });

test("an ordinary message to an opted-in contact goes through", () => {
  const d = on({});
  assert.equal(d.optedOut, false);
  assert.equal(d.source, "record");
});

test("STOP in THIS message wins without asking the database", () => {
  // Local knowledge: it must hold with no database at all, and a STOP must
  // never wait on a query that might not answer.
  const d = on({ optOutNow: true, recorded: null });
  assert.equal(d.optedOut, true);
  assert.equal(d.source, "this_message");
});

test("a recorded opt-out blocks a later, ordinary message", () => {
  const d = on({ recorded: true });
  assert.equal(d.optedOut, true);
  assert.equal(d.source, "record");
});

test("no record at all still replies — the documented ceiling", () => {
  // Blocking every reply whenever a row carries no answer would be its own
  // outage. This is deliberate, and stated so it is a choice rather than an
  // oversight.
  const d = on({ recorded: null });
  assert.equal(d.optedOut, false);
  assert.equal(d.source, "none");
});

test("START is the way back, whatever the record says", () => {
  // The one state a customer could not otherwise escape by any action of
  // their own.
  const d = on({ optInNow: true, recorded: true });
  assert.equal(d.optedOut, false);
  assert.equal(d.source, "this_message");
});

test("STOP outranks an opt-in record; START outranks an opt-out record", () => {
  assert.equal(on({ optOutNow: true, recorded: false }).optedOut, true);
  assert.equal(on({ optInNow: true, recorded: true }).optedOut, false);
});

test("the decision carries nothing to write back: there is no cache to keep", () => {
  // The cached copy was the third source, and keeping it current cost a read
  // and a write in front of every brain call. Its absence is the point.
  for (const over of [{}, { optOutNow: true }, { optInNow: true }, { recorded: true }, { recorded: null }]) {
    assert.deepEqual(Object.keys(on(over)).sort(), ["optedOut", "source"], JSON.stringify(over));
  }
});
