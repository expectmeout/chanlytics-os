/**
 * 00301 on a real Postgres: message_keep_cost keeps what a message cost to send (the Reports lenses spec, K8). Meta's
 * receipt carries a `pricing` object (billable, pricing_model, category, type; no amount), and the door merges it into
 * the outbound row's meta, found by the provider's own id in the named workspace, once: the first receipt carrying it
 * stands. The webhook is public input, so each key is checked on its own (a boolean for billable; letters, digits, _ or
 * - and at most forty characters for the words) and what fails is dropped, never stored. The category is the one key the
 * cost is priced by, so an answer without a valid one writes nothing (and cannot block a later receipt that has it); the
 * type may be absent on older payloads. The door touches no other key,
 * never the status, and no row at all when there is nothing new to keep. It is the service role's alone. Runs against the
 * database `supabase start` builds on this machine, never production.
 *
 * The rule for what a pricing keeps is written twice, because the edge must say a drop on its log before it asks the door
 * (the door's answer cannot tell a pricing it refused from one it already holds): waPricingOf in packages/channels
 * (PRICING_WORD, the category it requires) and the door's own checks above. The last test runs one table of pricings
 * through both and holds them to the same answer. CI runs database files only when database paths change, so an edit to
 * the channels side finds this test by the comment above PRICING_WORD.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { keepMessageCost } from "@chanlytics/db";
import { waPricingOf } from "@chanlytics/channels";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and messages"
      : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let n = 0;
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const PRICING = { billable: true, pricing_model: "PMP", category: "utility", type: "regular" };

async function workspace(tag) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-cost-${tag}-${stamp}`, name: `Harbor Cost ${tag}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: id, phone_e164: `+1555013${tag === "a" ? "9101" : "9102"}` })
      .select("id")
      .single(),
    "contact",
  ).id;
  const conversation = ok(
    await db.from("conversations").insert({ tenant_id: id, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  return { id, th: { tenant_id: id, contact_id: contact, conversation_id: conversation } };
}
const message = async (th, over = {}) =>
  ok(
    await db
      .from("messages")
      .insert({
        ...th,
        channel: "whatsapp",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: "made-up words",
        status: "sent",
        external_id: `wamid.k8.${stamp}.${++n}`,
        meta: { source: "ai" },
        ...over,
      })
      .select("id, external_id")
      .single(),
    "message",
  );
const keep = (tenant, external, pricing) =>
  db.rpc("message_keep_cost", { p_tenant_id: tenant, p_external_id: external, p_pricing: pricing });
const metaOf = async (id) => ok(await db.from("messages").select("meta").eq("id", id).single(), "meta").meta;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("a");
  B = await workspace("b");
});
after(async () => {
  if (skip) return;
  for (const t of [A, B]) {
    if (!t) continue;
    await db.from("events").delete().eq("tenant_id", t.id);
    await db.from("tenants").delete().eq("id", t.id);
  }
});

test(
  "Meta's pricing is merged into the outbound message's meta once, beside every key it had and never over one; the first answer stands",
  { skip },
  async () => {
    const had = { source: "ai", handled: "ai", intent: "pricing", processed_at: "2026-10-03T10:00:00Z" };
    const m = await message(A.th, { meta: had });
    assert.equal(ok(await keep(A.id, m.external_id, PRICING), "keep"), true);
    assert.deepEqual(await metaOf(m.id), { ...had, pricing: PRICING });
    assert.equal(
      ok(await keep(A.id, m.external_id, { ...PRICING, category: "marketing" })),
      false,
      "a second pricing is not kept",
    );
    assert.equal(ok(await keep(A.id, m.external_id, PRICING)), false, "the same pricing again writes no row either");
    assert.deepEqual(await metaOf(m.id), { ...had, pricing: PRICING });
    assert.equal(
      ok(await db.from("messages").select("status").eq("id", m.id).single()).status,
      "sent",
      "the status is the receipt's own write, never this door's",
    );
  },
);

test(
  "what is not a pricing object is ignored and writes no row: an array, a word, a number, null, an empty object, an oversized word",
  { skip },
  async () => {
    const m = await message(A.th);
    const unchanged = await metaOf(m.id);
    for (const odd of [[1, 2], "utility", 7, true, null, {}, { category: "x".repeat(600) }])
      assert.equal(ok(await keep(A.id, m.external_id, odd), JSON.stringify(odd).slice(0, 40)), false);
    assert.deepEqual(await metaOf(m.id), unchanged);
    assert.equal(ok(await keep(A.id, m.external_id, PRICING)), true, "none of the refusals took the key");
    assert.deepEqual((await metaOf(m.id)).pricing, PRICING);
  },
);

test(
  "each key is checked on its own: what fails is dropped and the rest is kept, and no key but Meta's four is kept",
  { skip },
  async () => {
    const forty = "a".repeat(40);
    const m = await message(A.th);
    const answer = {
      billable: "true",
      pricing_model: "PMP",
      category: "utility",
      type: forty,
      amount: 5,
      currency: "USD",
      nested: { category: "marketing" },
    };
    assert.equal(ok(await keep(A.id, m.external_id, answer)), true);
    assert.deepEqual(
      (await metaOf(m.id)).pricing,
      { pricing_model: "PMP", category: "utility", type: forty },
      "a string is no billable; an amount, a currency and a nested object are no key of Meta's",
    );

    const spaced = await message(A.th);
    assert.equal(ok(await keep(A.id, spaced.external_id, { ...PRICING, type: "free entry" })), true);
    assert.deepEqual(
      (await metaOf(spaced.id)).pricing,
      { billable: true, pricing_model: "PMP", category: "utility" },
      "a type that fails is dropped and the answer is kept without it: older payloads carry none",
    );

    const plain = await message(A.th);
    assert.equal(ok(await keep(A.id, plain.external_id, { billable: false, category: "service" })), true);
    assert.deepEqual((await metaOf(plain.id)).pricing, { billable: false, category: "service" }, "a false is kept");

    for (const [key, words] of [
      ["category", "a".repeat(41)],
      ["category", "utility\n"],
      ["category", "<script>"],
      ["type", "regular; drop"],
      ["pricing_model", "pép"],
      ["type", ""],
      ["category", 7],
      ["category", null],
      ["type", ["regular"]],
      ["pricing_model", { a: 1 }],
    ]) {
      const m2 = await message(A.th);
      assert.equal(
        ok(await keep(A.id, m2.external_id, { [key]: words }), `${key}=${JSON.stringify(words).slice(0, 30)}`),
        false,
        `${key}: ${JSON.stringify(words).slice(0, 30)} is dropped, and nothing is left to keep`,
      );
      assert.equal("pricing" in (await metaOf(m2.id)), false);
    }
    const kept = await message(A.th);
    assert.equal(
      ok(await keep(A.id, kept.external_id, { category: "authentication", type: "free-entry_point9" })),
      true,
    );
    assert.deepEqual((await metaOf(kept.id)).pricing, { category: "authentication", type: "free-entry_point9" });
  },
);

test(
  "an answer with no valid category writes nothing and takes nothing, so a later receipt that carries it is still kept",
  { skip },
  async () => {
    const m = await message(A.th);
    const unchanged = await metaOf(m.id);
    for (const thin of [
      { billable: true },
      { billable: true, pricing_model: "PMP", type: "regular" },
      { ...PRICING, category: "util ity" },
      { ...PRICING, category: "a".repeat(41) },
      { ...PRICING, category: 7 },
      { ...PRICING, category: null },
    ])
      assert.equal(
        ok(await keep(A.id, m.external_id, thin), JSON.stringify(thin).slice(0, 50)),
        false,
        `no category to price by: ${JSON.stringify(thin).slice(0, 50)}`,
      );
    assert.deepEqual(await metaOf(m.id), unchanged, "no row was touched, and no key was taken");
    assert.equal(ok(await keep(A.id, m.external_id, PRICING)), true, "a later receipt with the whole answer is kept");
    assert.deepEqual((await metaOf(m.id)).pricing, PRICING);
    assert.equal(ok(await keep(A.id, m.external_id, { billable: true })), false, "and then it stands");
  },
);

test("two receipts at once keep one pricing, whole, and one of them says it wrote", { skip }, async () => {
  const m = await message(A.th);
  const marketing = { ...PRICING, category: "marketing" };
  const both = await Promise.all([keep(A.id, m.external_id, PRICING), keep(A.id, m.external_id, marketing)]);
  const wrote = both.map((r) => ok(r));
  assert.deepEqual([...wrote].sort(), [false, true], "one writes, one finds the key there");
  const pricing = (await metaOf(m.id)).pricing;
  assert.deepEqual(pricing, wrote[0] ? PRICING : marketing, "the one that wrote is the one that stands");
});

test(
  "only this workspace's outbound message is found: another workspace's under the same id, a customer's own, an id nobody holds",
  { skip },
  async () => {
    const mine = await message(A.th, { external_id: `wamid.k8.${stamp}.shared` });
    const theirs = await message(B.th, { external_id: `wamid.k8.${stamp}.shared` });
    const inbound = await message(A.th, { direction: "inbound", sender: "customer", status: "received" });
    assert.equal(ok(await keep(A.id, `wamid.k8.${stamp}.shared`, PRICING)), true);
    assert.deepEqual(
      await metaOf(theirs.id),
      { source: "ai" },
      "another workspace's message with the same provider id is untouched",
    );
    assert.equal(ok(await keep(A.id, inbound.external_id, PRICING)), false, "a customer's message is nobody's cost");
    assert.deepEqual(await metaOf(inbound.id), { source: "ai" });
    assert.equal(ok(await keep(A.id, `wamid.k8.${stamp}.nobody`, PRICING)), false);
    assert.equal(ok(await keep(A.id, null, PRICING)), false, "no provider id finds nothing");
    assert.deepEqual((await metaOf(mine.id)).pricing, PRICING);
  },
);

test("a later receipt keeps the cost: the status guard merges its own time beside it", { skip }, async () => {
  const m = await message(A.th);
  ok(await keep(A.id, m.external_id, PRICING));
  ok(await db.from("messages").update({ status: "delivered" }).eq("id", m.id), "delivered");
  const meta = await metaOf(m.id);
  assert.deepEqual([meta.pricing, typeof meta.status_at?.delivered], [PRICING, "string"]);
});

test(
  "the repository's door (keepMessageCost) answers whether it wrote, and a refusal throws in the database's words for the receipt door that calls it to catch",
  { skip },
  async () => {
    const m = await message(A.th);
    assert.equal(await keepMessageCost(db, A.id, m.external_id, PRICING), true);
    assert.equal(await keepMessageCost(db, A.id, m.external_id, { ...PRICING, category: "marketing" }), false);
    assert.deepEqual((await metaOf(m.id)).pricing, PRICING);
    assert.equal(await keepMessageCost(db, A.id, `wamid.k8.${stamp}.nobody`, PRICING), false);
    await assert.rejects(
      keepMessageCost(db, "not-a-uuid", m.external_id, PRICING),
      /^Error: message_keep_cost: .*uuid/,
    );
  },
);

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const m = await message(A.th);
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const refused = await anon.rpc("message_keep_cost", {
    p_tenant_id: A.id,
    p_external_id: m.external_id,
    p_pricing: PRICING,
  });
  assert.equal(
    refused.error?.code,
    "42501",
    `refused as a permission, not as a missing function: ${refused.error?.message}`,
  );
  assert.deepEqual(await metaOf(m.id), { source: "ai" });
});

/** An object's keys in order, so two spellings of one pricing compare equal (jsonb keeps its own key order). */
const sorted = (o) =>
  o && typeof o === "object" ? Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))) : o;

/**
 * One table of pricings, for the edge's reader and the database's door alike. Each is a case of the rule's edges: what
 * keeps, what is dropped key by key, and what leaves nothing to keep.
 */
const AGREE = [
  ["a valid full pricing", PRICING],
  ["billable false, no model, no type", { billable: false, category: "service" }],
  ["the category alone", { category: "marketing_lite" }],
  ["authentication-international", { billable: true, pricing_model: "CBP", category: "authentication-international" }],
  ["type missing", { billable: true, pricing_model: "PMP", category: "utility" }],
  ["category missing", { billable: true, pricing_model: "PMP", type: "regular" }],
  ["billable alone", { billable: true }],
  ["a category of forty characters", { ...PRICING, category: "a".repeat(40) }],
  ["a category of forty-one characters", { ...PRICING, category: "a".repeat(41) }],
  ["a type of forty characters", { ...PRICING, type: "t".repeat(40) }],
  ["a type of forty-one characters", { ...PRICING, type: "t".repeat(41) }],
  ["a model of forty-one characters", { ...PRICING, pricing_model: "m".repeat(41) }],
  ["a category of a megabyte", { ...PRICING, category: "x".repeat(1_000_000) }],
  ["a category with a space", { ...PRICING, category: "util ity" }],
  ["a type with a space", { ...PRICING, type: "free entry" }],
  ["a category with punctuation", { ...PRICING, category: "a;b" }],
  ["a type with punctuation", { ...PRICING, type: "regular; drop" }],
  ["a category with a trailing newline", { ...PRICING, category: "utility" + String.fromCharCode(10) }],
  ["a category with markup", { ...PRICING, category: "<script>" }],
  ["a model with an accent", { ...PRICING, pricing_model: "pép" }],
  ["a category with a full-width letter", { ...PRICING, category: String.fromCharCode(0xff41) }],
  ["a category that starts with a digit", { ...PRICING, category: "9lives" }],
  ["a category that is an underscore", { ...PRICING, category: "_" }],
  ["a category that starts with a dash", { ...PRICING, category: "-9" }],
  ["an empty category", { ...PRICING, category: "" }],
  ["an empty type", { ...PRICING, type: "" }],
  ["billable as a string", { ...PRICING, billable: "true" }],
  ["billable as a string, nothing else", { billable: "true" }],
  ["billable as a number", { ...PRICING, billable: 1 }],
  ["a category that is a number", { ...PRICING, category: 5 }],
  ["a category that is null", { ...PRICING, category: null }],
  ["a type that is a list", { ...PRICING, type: ["regular"] }],
  ["a model that is an object", { ...PRICING, pricing_model: { a: 1 } }],
  [
    "an amount, a currency and a nested object beside the four",
    { ...PRICING, amount: 0.0136, currency: "USD", nested: { category: "x" } },
  ],
  ["an empty object", {}],
  ["no key of Meta's", { amount: 1 }],
  ["null", null],
  ["a word", "utility"],
  ["a number", 7],
  ["a boolean", true],
  ["a list", [PRICING]],
  ["an empty list", []],
];

test(
  "the edge's reader and the database's door keep exactly the same pricings, and drop exactly the same: one table through waPricingOf and message_keep_cost",
  { skip },
  async () => {
    const disagree = [];
    let kept = 0;
    for (const [what, pricing] of AGREE) {
      const read = waPricingOf(pricing);
      const m = await message(A.th);
      const wrote = ok(await keep(A.id, m.external_id, pricing), what);
      const stored = (await metaOf(m.id)).pricing ?? null;
      if (wrote) kept += 1;
      // Kept or dropped, and the same words kept: the edge's reader says what the door will store.
      if (wrote !== (read !== null) || JSON.stringify(sorted(stored)) !== JSON.stringify(sorted(read)))
        disagree.push({
          what,
          edge: read && JSON.stringify(read).slice(0, 80),
          door: wrote,
          stored: stored && JSON.stringify(stored).slice(0, 80),
        });
    }
    assert.deepEqual(disagree, [], "waPricingOf (packages/channels) and message_keep_cost (00301) must be one rule");
    assert.ok(kept > 0 && kept < AGREE.length, `the table must hold both outcomes: ${kept} of ${AGREE.length} kept`);
  },
);
