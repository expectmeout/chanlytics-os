/**
 * An id that says whose it is (contracts identity.ts): a tenant id and a contact id are checked where they enter, by
 * the test every id already had, `isUuid`, and by nothing else. The checks add no rule: each takes exactly the strings
 * isUuid takes and hands back the same string, so a boundary that now checks refuses nothing it used to let through
 * from a uuid column.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asContactId, asTenantId, isUuid } from "@chanlytics/contracts";

const SAMPLES = [
  "11111111-1111-4111-8111-111111111111",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  "AbCdEf01-2345-6789-abcd-ef0123456789",
  "00000000-0000-0000-0000-000000000000",
  "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "",
  " ",
  "t1",
  "k1",
  "not-a-uuid",
  "11111111111141118111111111111111",
  "{11111111-1111-4111-8111-111111111111}",
  " 11111111-1111-4111-8111-111111111111",
  "11111111-1111-4111-8111-111111111111 ",
  "11111111-1111-4111-8111-111111111111\n",
  "11111111-1111-4111-8111-11111111111",
  "11111111-1111-4111-8111-1111111111111",
  "g1111111-1111-4111-8111-111111111111",
  "11111111_1111_4111_8111_111111111111",
  "urn:uuid:11111111-1111-4111-8111-111111111111",
];

const accepts = (check, s) => {
  try {
    assert.equal(check(s), s, "the same string back, unchanged");
    return true;
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    assert.ok(e instanceof TypeError, "a refusal is a TypeError: a row that holds it is the server's fault");
    return false;
  }
};

test("a tenant id and a contact id take exactly the strings isUuid takes, and hand back the same string", () => {
  for (const s of SAMPLES) {
    assert.equal(accepts(asTenantId, s), isUuid(s), `tenant id: ${JSON.stringify(s)}`);
    assert.equal(accepts(asContactId, s), isUuid(s), `contact id: ${JSON.stringify(s)}`);
  }
  assert.ok(SAMPLES.some(isUuid) && SAMPLES.some((s) => !isUuid(s)), "the samples hold both kinds");
});

test("the refusal says whose id it was", () => {
  assert.throws(() => asTenantId("t1"), { name: "TypeError", message: "A tenant id is a uuid." });
  assert.throws(() => asContactId("k1"), { name: "TypeError", message: "A contact id is a uuid." });
});
