/**
 * The voice doors' evidence, kept as rows (decision 0092, apps/edge/lib/voice/door-auth.ts keepKnock): the switch
 * that closes the shared secret is set on proof that every door's real deliveries carry Retell's signature, and that
 * proof lived only in a log kept a day. Each knock let in is now a `webhook.auth` row under the platform naming its door
 * and what it carried, at most once a minute per door and credential, so a public door is no write amplifier; a refusal
 * is kept only once the signature is required, as the log line is. And what provisioning hands Retell follows the same
 * switch: the secret while the doors read it, none once they do not.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
for (const k of ["RETELL_DOORS_SIGNED", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
after(() => {
  delete process.env.RETELL_FN_SECRET;
  delete process.env.RETELL_DOORS_SIGNED;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { keepKnock, secretToProvision } = await import(at("apps/edge/lib/voice/door-auth.ts"));

const PLATFORM = "00000000-0000-0000-0000-000000000000";
const MIN = 60_000;
let clock = Date.now();
/** A fresh minute for each case: the throttle is per instance, and the module's memory outlives a case. */
const later = () => (clock += 10 * MIN);

test("a knock let in is kept as one row naming the door and what it carried, and a second within the minute is not", async () => {
  const tables = { events: [] };
  const db = fakeDb(tables);
  const t0 = later();
  await keepKnock("fn", { ok: true, sig: true, secret: false }, { now: t0, db });
  await keepKnock("fn", { ok: true, sig: true, secret: false }, { now: t0 + 1000, db });
  assert.equal(tables.events.length, 1);
  const [row] = tables.events;
  assert.equal(row.tenant_id, PLATFORM);
  assert.equal(row.kind, "webhook.auth");
  assert.deepEqual(
    { door: row.data.door, sig: row.data.sig, secret: row.data.secret, ok: row.data.ok, provider: row.data.provider },
    { door: "fn", sig: true, secret: false, ok: true, provider: "retell" },
  );
  await keepKnock("fn", { ok: true, sig: true, secret: false }, { now: t0 + MIN, db });
  assert.equal(tables.events.length, 2, "a minute later, another");
  await keepKnock("inbound", { ok: true, sig: false, secret: true }, { now: t0 + MIN, db });
  assert.equal(tables.events.length, 3, "another door, another credential: its own row");
  assert.deepEqual([tables.events[2].data.door, tables.events[2].data.secret], ["inbound", true]);
});

test("a refusal is kept only once the signature alone opens the doors: until then it is somebody without the secret", async () => {
  const tables = { events: [] };
  const db = fakeDb(tables);
  await keepKnock("availability", { ok: false, sig: false, secret: false }, { now: later(), db });
  assert.equal(tables.events.length, 0);
  process.env.RETELL_DOORS_SIGNED = "1";
  try {
    await keepKnock("availability", { ok: false, sig: false, secret: false }, { now: later(), db });
    assert.equal(tables.events.length, 1, "it may be Retell's, turned away");
    assert.deepEqual([tables.events[0].data.ok, tables.events[0].data.signed_only], [false, true]);
  } finally {
    delete process.env.RETELL_DOORS_SIGNED;
  }
});

test("provisioning hands Retell the secret while the doors read it, none once they do not, and says when it has none to hand", () => {
  assert.equal(secretToProvision(), "fn-secret-for-this-file");
  process.env.RETELL_DOORS_SIGNED = "1";
  try {
    assert.equal(secretToProvision(), null, "the signature alone: no header, no ?key=");
  } finally {
    delete process.env.RETELL_DOORS_SIGNED;
  }
  const kept = process.env.RETELL_FN_SECRET;
  delete process.env.RETELL_FN_SECRET;
  try {
    assert.equal(secretToProvision(), undefined, "the doors read a secret nobody set: the provisioning door refuses");
  } finally {
    process.env.RETELL_FN_SECRET = kept;
  }
});
