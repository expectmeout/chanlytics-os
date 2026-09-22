/**
 * The erased, recognised by the digest they left: the passive doors leave
 * them erased, and a call begun before the request belongs to it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { erasedPhoneHash } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { erasedTombstones, erasedBeforeCall, erasedBeforeEmail } = await import(at("apps/edge/lib/erased.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PHONE = "+16465550123";

test("the digest is sha256 of tenant:number, hex, and keyed by the tenant: the same number names nobody elsewhere", async () => {
  const h = await erasedPhoneHash(T, PHONE);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await erasedPhoneHash(T, PHONE), "deterministic");
  assert.notEqual(h, await erasedPhoneHash(OTHER, PHONE), "tenant-keyed");
  assert.notEqual(h, await erasedPhoneHash(T, "+16465550124"));
});

test("a tombstone is found by its digest, in its own workspace only; a number nobody erased is not", async () => {
  const h = await erasedPhoneHash(T, PHONE);
  const db = fakeDb({
    contacts: [
      {
        id: "k-gone",
        tenant_id: T,
        phone_e164: null,
        erased_at: "2026-09-10T12:00:00.000Z",
        erasing_since: "2026-09-10T11:59:00.000Z",
        erased_phone_hash: h,
      },
      {
        id: "k-live",
        tenant_id: T,
        phone_e164: "+16465550124",
        erased_at: null,
        erasing_since: null,
        erased_phone_hash: null,
      },
    ],
  });
  const found = await erasedTombstones(db, T, [PHONE, "+16465550124"]);
  assert.deepEqual([...found.keys()], [PHONE]);
  assert.deepEqual(found.get(PHONE), {
    erased_at: "2026-09-10T12:00:00.000Z",
    erasing_since: "2026-09-10T11:59:00.000Z",
  });
  assert.equal((await erasedTombstones(db, OTHER, [PHONE])).size, 0, "another workspace's digest is not this one's");
  assert.equal((await erasedTombstones(db, T, [])).size, 0);
});

test("a call begun before the request belongs to the erasure; one begun after is the person calling back", async () => {
  const h = await erasedPhoneHash(T, PHONE);
  const db = fakeDb({
    contacts: [
      {
        id: "k-gone",
        tenant_id: T,
        phone_e164: null,
        erased_at: null,
        erasing_since: "2026-09-10T11:59:00.000Z",
        erased_phone_hash: h,
      },
    ],
  });
  assert.equal(
    await erasedBeforeCall(db, T, PHONE, "2026-09-10T11:00:00.000Z"),
    true,
    "a call that began an hour before the request",
  );
  assert.equal(
    await erasedBeforeCall(db, T, PHONE, "2026-09-10T13:00:00.000Z"),
    false,
    "a call an hour after it: the person is back",
  );
  assert.equal(
    await erasedBeforeCall(db, T, "+16465550124", "2026-09-10T11:00:00.000Z"),
    false,
    "a number nobody erased",
  );
  const refusing = fakeDb({ contacts: [] }, { "contacts.select": { message: "connection reset" } });
  await assert.rejects(
    erasedBeforeCall(refusing, T, PHONE, "2026-09-10T11:00:00.000Z"),
    /erased_tombstones/,
    "we could not check is not nobody",
  );
});

test("the same of an email: one received before the request belongs to the erasure; one received after is the person writing again", async () => {
  const { erasedEmailHash } = await import("@chanlytics/contracts");
  const ADDRESS = "ana@example.com";
  const db = fakeDb({
    contacts: [
      {
        id: "k-gone",
        tenant_id: T,
        email: null,
        erased_at: "2026-09-10T12:05:00.000Z",
        erasing_since: "2026-09-10T11:59:00.000Z",
        erased_email_hash: await erasedEmailHash(T, ADDRESS),
      },
    ],
  });
  assert.equal(
    await erasedBeforeEmail(db, T, ADDRESS, "2026-09-10T11:00:00.000Z"),
    true,
    "sent an hour before they asked to be forgotten, taken in late: it must not make them again",
  );
  assert.equal(
    await erasedBeforeEmail(db, T, ADDRESS, "2026-09-10T13:00:00.000Z"),
    false,
    "an hour after: the person is back, and is a new conversation",
  );
  assert.equal(
    await erasedBeforeEmail(db, T, "bo@example.com", "2026-09-10T11:00:00.000Z"),
    false,
    "an address nobody erased",
  );
  assert.equal(
    await erasedBeforeEmail(db, OTHER, ADDRESS, "2026-09-10T11:00:00.000Z"),
    false,
    "the digest names nobody in another workspace",
  );
  const refusing = fakeDb({ contacts: [] }, { "contacts.select": { message: "connection reset" } });
  await assert.rejects(
    erasedBeforeEmail(refusing, T, ADDRESS, "2026-09-10T11:00:00.000Z"),
    /erased_tombstones/,
    "we could not check is not nobody",
  );
});
