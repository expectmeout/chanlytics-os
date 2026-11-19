/**
 * A person an ad brought is read with the ad's name (decision 0049, call 2; migration 00646): the person route, its real
 * module, run with a database in memory whose ad_named a test stands in. What is proved is what the read asks and
 * answers: the name by the person's own reference, nothing asked for anyone no ad brought, and a name that cannot be read
 * never failing the page.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const USER = "u1";
const inA = `?workspace=${A}`;
const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);
const ctxFor = (tables, params, rpcs) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
/** A viewer of the one workspace, and the person as their own row and as people_list answers them. */
const seat = [
  { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
];
const contact = (over) => ({
  id: P1,
  tenant_id: A,
  phone_e164: "+15550000001",
  display_name: "Ada",
  erased_at: null,
  marketing_consent: null,
  notes: null,
  ...over,
});
const personRow = { id: P1, display_name: "Ada", phone_e164: "+15550000001", consent: "opted_in", dnc: false };

test("a person an ad brought is read with the ad's name: asked by their own reference, nobody else is asked about, and a name that cannot be read never fails the page (0049)", async () => {
  const world = (over) => ({
    memberships: seat,
    contacts: [contact(over)],
    contact_identities: [],
    conversations: [],
    calls: [],
    policies: [],
    events: [],
    tenant_config: [{ tenant_id: A, config: {} }],
    tenants: [],
  });
  const asked = [];
  const read = async (over, answer) => {
    const rpcs = {
      people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow] : []),
      ad_named: (a) => {
        asked.push(a);
        return answer(a);
      },
    };
    return (await person.GET.run(get(inA), ctxFor(world(over), { id: P1 }, rpcs))).person;
  };
  const byAd = { acquired_via: "ad", acquired_ref: "120200000000031" };

  const named = await read(byAd, () => ({ platform: "meta", name: "Spring colour offer" }));
  assert.deepEqual(named.first_ad, { platform: "meta", name: "Spring colour offer" });
  assert.deepEqual(
    asked,
    [{ p_tenant_id: A, p_ref: "120200000000031" }],
    "asked once, of their workspace, by their reference",
  );

  // An ad no entry has words for: still an ad, with no name. A platform the page does not know is no platform.
  assert.deepEqual((await read(byAd, () => ({ platform: "meta", name: null }))).first_ad, {
    platform: "meta",
    name: null,
  });
  assert.deepEqual((await read(byAd, () => ({ platform: "billboard", name: "  " }))).first_ad, {
    platform: null,
    name: null,
  });
  // An ad stamp with no reference is asked with none.
  asked.length = 0;
  await read({ acquired_via: "ad", acquired_ref: null }, () => ({ platform: null, name: null }));
  assert.deepEqual(asked, [{ p_tenant_id: A, p_ref: "" }]);

  // Nobody else is asked about: a person who wrote on WhatsApp, and one whose way in was never kept.
  asked.length = 0;
  for (const over of [{ acquired_via: "whatsapp", acquired_ref: null }, {}]) {
    const plain = await read(over, () => assert.fail("no ad brought them"));
    assert.equal(plain.first_ad, undefined);
  }
  assert.deepEqual(asked, []);

  // The name is a line on the page, never the page: a read the database refuses leaves the ad unnamed.
  const refused = await read(byAd, () => {
    throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
  });
  assert.deepEqual(refused.first_ad, { platform: null, name: null });
  assert.equal(refused.row.id, P1, "the person is still read");
});
