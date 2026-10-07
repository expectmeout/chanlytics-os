/**
 * The finder asks the one predicate for an address (Reach out Part 5, Task 2.3; 00220 lead_addresses_suppressed): the
 * edge's `suppressed` port hands a page's addresses to the database's rule, so a business's own domain on the
 * never-again list (a reply's no, N6) keeps every address at it out of a search, as the send door and the audience do.
 * A place keeps its own read: a place is not an address. A read that fails throws, since "we could not check" is not
 * "no". The real adapter runs over the lead world, whose model of the predicate is the SQL's; the SQL itself is proved
 * on the stack (never-again.db.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadDb } from "../../../../apps/edge/lib/leads/lead-db.ts";
import { leadWorld, TENANT } from "../_lead-world.mjs";
import { fakeDb } from "../_fake-db.mjs";

const rpcsSeen = (w) => w.db.seen.filter((s) => s.rpc).map((s) => s.rpc);

test("a business's own domain on the list keeps every address at it out, and only those", async () => {
  const w = leadWorld();
  await w.suppress("domain", "owndomain.example", "said_no");
  const got = await leadDb(w.db).suppressed(TENANT, {
    emails: ["sam@owndomain.example", "Dana@OwnDomain.example ", "sam@elsewhere.example", "owndomain.example"],
    placeIds: [],
  });
  assert.deepEqual(
    [...got.emails],
    ["sam@owndomain.example", "Dana@OwnDomain.example "],
    "each key comes back as it was asked, matched by the stored form; a bare domain is no address",
  );
  assert.deepEqual([...got.placeIds], []);
  assert.deepEqual(rpcsSeen(w), ["lead_addresses_suppressed"], "the address half is the one predicate");
});

test("an address's own row holds that address alone", async () => {
  const w = leadWorld();
  await w.suppress("email", "office@owndomain.example", "email_opt_out");
  const got = await leadDb(w.db).suppressed(TENANT, {
    emails: ["office@owndomain.example", "sam@owndomain.example"],
    placeIds: [],
  });
  assert.deepEqual([...got.emails], ["office@owndomain.example"]);
});

test("a place is still found by its own row, and an address row never hides a place", async () => {
  const w = leadWorld();
  await w.suppress("place", "ChIJfixtureHidden", "customer");
  await w.suppress("email", "ChIJfixtureOther", "email_opt_out");
  const got = await leadDb(w.db).suppressed(TENANT, {
    emails: [],
    placeIds: ["ChIJfixtureHidden", "ChIJfixtureOther"],
  });
  assert.deepEqual([...got.placeIds], ["ChIJfixtureHidden"]);
  assert.deepEqual([...got.emails], []);
  assert.deepEqual(
    rpcsSeen(w),
    ["erasure_digests"],
    "no address asked, so the predicate is not asked; the places' digests are the database's (00263)",
  );
});

test("a read of the list that fails throws: the finder never takes an address it could not check", async () => {
  const db = fakeDb(
    { lead_suppressions: [] },
    {},
    {
      lead_addresses_suppressed: () => {
        throw new Error("statement timeout");
      },
    },
  );
  await assert.rejects(
    leadDb(db).suppressed(TENANT, { emails: ["sam@owndomain.example"], placeIds: ["ChIJfixture1"] }),
    /cannot read the never-again list: statement timeout/,
  );
});

test("on a database before 00220 the finder reads an address's own row as it did, so the edge may deploy first", async () => {
  const w = leadWorld();
  await w.suppress("email", "office@owndomain.example", "email_opt_out");
  await w.suppress("place", "ChIJfixtureHidden", "customer");
  const db = fakeDb(
    w.T,
    {},
    {
      lead_addresses_suppressed: () => {
        throw Object.assign(new Error("Could not find the function public.lead_addresses_suppressed"), {
          code: "PGRST202",
        });
      },
    },
  );
  const got = await leadDb(db).suppressed(TENANT, {
    emails: ["office@owndomain.example", "sam@owndomain.example"],
    placeIds: ["ChIJfixtureHidden"],
  });
  assert.deepEqual([...got.emails], ["office@owndomain.example"]);
  assert.deepEqual([...got.placeIds], ["ChIJfixtureHidden"]);
});
