/**
 * The repair for people kept under a North American number they never had (tooling/scripts/ops/plus-ten-digit-numbers.mjs,
 * after 00367): a person kept as +1 and ten digits whose own identity on a number wire is exactly those ten digits was
 * read from a + and ten digits abroad, and is given back + and the ten. The script's main (the reads, the backup) needs
 * production and is not run here; these are the two parts it is made of, run over a world in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planNumbers, writeNumbers } from "../../../ops/plus-ten-digit-numbers.mjs";
import { fakeDb } from "../../_fake-db.mjs";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const person = (id, phone_e164, tenant_id = T1) => ({ id, tenant_id, phone_e164 });
const who = (contact_id, channel, external_id) => ({ contact_id, channel, external_id });
const heldBy = (rows) => new Set(rows.map((c) => `${c.tenant_id} ${c.phone_e164}`));

test("a +1 and ten digits whose own WhatsApp, text or call identity is those ten digits is given back + and the ten; a North American, a typed number and an email identity are left alone", () => {
  const people = [
    person("wa", "+14791000101"), // WhatsApp's id is the international number's digits: 47 and eight.
    person("sms", "+16591000102"), // a text's identity is the sender's digits.
    person("call", "+14591000103"), // a call's is the caller's number with its +.
    person("us", "+16465550104"), // North American: its WhatsApp id carries the 1, eleven digits.
    person("typed", "+14791000105"), // a member typed it: nothing on the wire says where it is.
    person("mail", "+14791000106"), // an email identity says nothing about a number.
  ];
  const ids = [
    who("wa", "whatsapp", "4791000101"),
    who("sms", "sms", "6591000102"),
    who("call", "voice", "+4591000103"),
    who("us", "whatsapp", "16465550104"),
    who("mail", "email", "4791000106"),
  ];
  const { repairs, left } = planNumbers(people, ids, heldBy(people));
  assert.deepEqual(
    repairs.map((r) => [r.id, r.phone_e164, r.right]),
    [
      ["wa", "+14791000101", "+4791000101"],
      ["sms", "+16591000102", "+6591000102"],
      ["call", "+14591000103", "+4591000103"],
    ],
  );
  assert.deepEqual(left, []);
});

test("a person whose right number another person in the workspace holds is left for the merge, never written over it; another workspace's holder is not in the way", () => {
  const people = [
    person("old", "+14791000201"),
    person("twin", "+4791000201"),
    person("there", "+14791000202"),
    person("elsewhere", "+4791000202", T2),
  ];
  const ids = [who("old", "whatsapp", "4791000201"), who("there", "whatsapp", "4791000202")];
  const { repairs, left } = planNumbers(people, ids, heldBy(people));
  assert.deepEqual(
    repairs.map((r) => r.id),
    ["there"],
  );
  assert.deepEqual(
    left.map((l) => [l.id, l.right]),
    [["old", "+4791000201"]],
  );
});

test("the write lands only where the row still holds the number it was planned from, and says which did not", async () => {
  const contacts = [person("a", "+14791000301"), person("b", "+14791000302")];
  const db = fakeDb({ contacts: contacts.map((c) => ({ ...c })) });
  const plan = [
    { ...contacts[0], right: "+4791000301" },
    { ...contacts[1], right: "+4791000302" },
  ];
  // Someone fixed b by hand between the plan and the apply.
  await db.from("contacts").update({ phone_e164: "+4791000399" }).eq("id", "b");
  const { written, skipped } = await writeNumbers(db, plan);
  assert.deepEqual(
    written.map((w) => w.id),
    ["a"],
  );
  assert.deepEqual(
    skipped.map((s) => [s.id, s.why]),
    [["b", "write matched no row: the number changed since"]],
  );
  const { data } = await db.from("contacts").select("id, phone_e164");
  assert.deepEqual(
    data.map((r) => [r.id, r.phone_e164]),
    [
      ["a", "+4791000301"],
      ["b", "+4791000399"],
    ],
  );
});
