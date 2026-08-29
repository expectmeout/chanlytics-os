/**
 * The consent truth table.
 *
 * Consent lives in `contacts.consent`, which only Postgres knows, and the gate
 * read it from the ingest result. That result is null when Postgres is
 * unreachable — so the guarantee failed OPEN at exactly the moment it mattered:
 * during an outage, a customer who opted out last week started receiving bot
 * replies again, and nothing in the logs said why.
 *
 * The distinction the whole table turns on is `recorded: false` vs
 * `recorded: null`. One is a record saying this person is opted in. The other is
 * no record at all. Collapsing them is the bug.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { resolveConsent } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/consent.ts")).href
);

/** Postgres answered, nobody opted out, nothing cached — the ordinary case. */
const base = { optOutNow: false, optInNow: false, recorded: false, cached: undefined };
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
  assert.equal(d.cache, true);
});

test("a recorded opt-out blocks a later, ordinary message", () => {
  const d = on({ recorded: true });
  assert.equal(d.optedOut, true);
  assert.equal(d.source, "record");
});

/* ------------------------- the outage, which is the point ------------------ */

test("REGRESSION: an opt-out survives Postgres being unreachable", () => {
  // The old gate was `n.optOut || (!!ing && isOptedOutContact(ing))`. With ing
  // null this is false, and the bot replied to someone who had asked it to stop.
  const d = on({ recorded: null, cached: true });
  assert.equal(d.optedOut, true, "an outage must not silently re-subscribe anyone");
  assert.equal(d.source, "cache");
});

test("no record and no cache still replies — the documented ceiling", () => {
  // Blocking every reply whenever the database blips would be its own outage.
  // This is deliberate, and stated so it is a choice rather than an oversight.
  const d = on({ recorded: null, cached: undefined });
  assert.equal(d.optedOut, false);
  assert.equal(d.source, "none");
});

test("START works during an outage, or the cache becomes a trap", () => {
  // Without this the cached flag holds during every outage and the customer has
  // no action available that lifts it — the one state they cannot escape.
  const d = on({ optInNow: true, recorded: null, cached: true });
  assert.equal(d.optedOut, false);
  assert.equal(d.source, "this_message");
  assert.equal(d.cache, false);
});

/* ------------------------- the cache never outranks the record ------------- */

test("a stale cache never holds out someone the record says opted back in", () => {
  const d = on({ recorded: false, cached: true });
  assert.equal(d.optedOut, false, "Postgres owns consent whenever it answers");
  assert.equal(d.source, "record");
  assert.equal(d.cache, false, "and the stale copy is corrected");
});

test("the record refreshes the cache in both directions", () => {
  assert.equal(on({ recorded: true, cached: undefined }).cache, true);
  assert.equal(on({ recorded: false, cached: true }).cache, false);
});

test("STOP outranks an opt-in record; START outranks an opt-out record", () => {
  assert.equal(on({ optOutNow: true, recorded: false }).optedOut, true);
  assert.equal(on({ optInNow: true, recorded: true }).optedOut, false);
});
