/**
 * Persist first, or say so. pgIngest returned null for two different facts:
 * "there is no database or no tenant to record for" (by design) and "the
 * write failed" (a loss). The second is now its own error, so the webhook can
 * refuse to acknowledge what it could not record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { pgIngest, IngestFailed } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/persist.ts")).href
);

/** A WhatsApp message in the one inbound shape, as its door hands it over (decision 0001, step 3). */
const n = {
  channel: "whatsapp",
  externalId: "wamid.1",
  identity: { externalId: "13475550101", phoneE164: "+13475550101", email: null },
  profileName: "Dana",
  type: "text",
  kind: "text",
  rawType: "text",
  body: "hi",
  channelTsIso: null,
  media: null,
  consent: { optOut: false, optIn: false, optInMarketing: false },
  referral: null,
};
const row = {
  message_id: "m1",
  conversation_id: "c1",
  contact_id: "k1",
  is_new: true,
  consent: "unknown",
  dnc: false,
  paused_until: null,
};

test("no database or no tenant is null, by design", async () => {
  assert.equal(await pgIngest(null, "t1", n), null);
  assert.equal(await pgIngest(fakeDb({}, {}, { ingest_inbound: () => row }), null, n), null);
});

test("a write the database refused is IngestFailed, never a quiet null", async () => {
  const db = fakeDb(
    {},
    {},
    {
      ingest_inbound: () => {
        throw new Error("connection reset");
      },
    },
  );
  await assert.rejects(
    () => pgIngest(db, "t1", n),
    (e) => e instanceof IngestFailed && /connection reset/.test(e.message),
  );
});

test("a write that succeeded returns the row", async () => {
  const db = fakeDb({}, {}, { ingest_inbound: () => row });
  const out = await pgIngest(db, "t1", n);
  assert.equal(out.conversation_id, "c1");
  assert.equal(out.is_new, true);
});
