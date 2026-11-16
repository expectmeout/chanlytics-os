/**
 * A lead's name or city put right by its owner (00631 lead_named; the sprint's step 8: a wrong value is fixed once).
 *
 *   said as typed     a name its owner typed is never tidied as a listing's title is, in any email's blank
 *   the route         its policy, what it asks of the door, its answer and its refusals in contracts' words
 *   their preview     takes the name too: the record AI answers from, written through the settings' schema
 *   the card          says a value is the owner's own, and what its listing said
 *
 * The rule itself is SQL's and is the database suite's to prove; here the door answers as 00631 writes it, over a
 * database in memory. Made-up businesses only.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import {
  LEAD_NAMED,
  isBaselinePrompt,
  leadCalledByOf,
  leadNamedRefusal,
  leadOwnOf,
  leadWordsPieces,
  newReceptionistDefaults,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setLinkPageClient } = await import(at("apps/dashboard/src/server/public/link-page.ts"));
const named = await import(at("apps/dashboard/app/api/v1/leads/[id]/name/route.ts"));
const { withPreviewNamed } = await import(at("apps/dashboard/src/server/previews/named.ts"));
const {
  LEAD_FILL_WORDS: F,
  fillInFixOf,
  fillInSaysOf,
} = await import(at("apps/dashboard/src/surfaces/leads/sheet/model/fill-ins.ts"));

beforeEach(() => setRateStore(memoryStore()));

const OWN = { own: { name: true } };

/* ---- said as typed ---- */

test("a name its owner typed is said as typed; a listing's title is still tidied", () => {
  assert.equal(leadCalledByOf({ business_name: "IKEA", city: "Austin" }), "Ikea", "a listing that shouts");
  assert.equal(leadCalledByOf({ business_name: "IKEA", city: "Austin", facts: OWN }), "IKEA");
  assert.equal(
    leadCalledByOf({ business_name: "Morgan Lewis, Bockius LLC", city: null, facts: OWN }),
    "Morgan Lewis, Bockius LLC",
    "nothing after a comma is cut, and no company form",
  );
  assert.equal(leadCalledByOf({ business_name: "  the   daily grind ", facts: OWN }), "the daily grind");
  // A city alone put right leaves the name its listing's.
  assert.equal(leadCalledByOf({ business_name: "IKEA", facts: { own: { city: true } } }), "Ikea");
  assert.equal(leadCalledByOf({ business_name: "  ", facts: OWN }), null, "no name is still no name");
});

test("every email's blank says it: the one fill reads the lead's own facts", () => {
  const pieces = (lead) =>
    leadWordsPieces({
      body: "Hi {{business}} in {{city}}",
      lead,
      workspace: { businessName: "Harbor Moving Co", yourName: "Sam", bookingLink: null },
      opening: null,
    })
      .filter((piece) => piece.kind === "value")
      .map((piece) => piece.text);
  assert.deepEqual(pieces({ business_name: "IKEA", city: "Austin" }), ["Ikea", "Austin"]);
  assert.deepEqual(pieces({ business_name: "IKEA", city: "Austin", facts: OWN }), ["IKEA", "Austin"]);
});

test("what is the owner's own is read off the lead's facts, and anything else says nothing is", () => {
  assert.deepEqual(leadOwnOf({ own: { name: true, was: { name: "IKEA AUSTIN | Furniture" } } }), {
    name: true,
    city: false,
    was: { name: "IKEA AUSTIN | Furniture", city: null },
  });
  const none = { name: false, city: false, was: { name: null, city: null } };
  for (const junk of [null, undefined, "x", [], { own: "yes" }, { own: { name: "true", was: [] } }])
    assert.deepEqual(leadOwnOf(junk), none, JSON.stringify(junk));
});

/* ---- their preview takes the name ---- */

const brainOf = (name, over = {}) => ({ business_name: name, ...newReceptionistDefaults(name), ...over });

test("a preview answers by the new name, and the product's own prompt is written under it", () => {
  const was = brainOf("Harbor Movers Austin", { profile: { website: "https://harbormovers.example" } });
  const now = withPreviewNamed(was, "  Harbor   Movers ");
  assert.equal(now.business_name, "Harbor Movers");
  assert.equal(now.system_prompt, newReceptionistDefaults("Harbor Movers").system_prompt);
  assert.ok(isBaselinePrompt(now.system_prompt));
  assert.deepEqual(now.profile, was.profile, "what it knows does not move");
  assert.deepEqual(now.fallbacks, was.fallbacks);
  // A prompt somebody wrote is theirs: the name changes, their words stay.
  const written = brainOf("Harbor Movers Austin", {
    system_prompt: "You answer customers for a made-up moving company, kindly and briefly.",
  });
  assert.equal(withPreviewNamed(written, "Harbor Movers").system_prompt, written.system_prompt);
  assert.equal(withPreviewNamed(was, "Harbor Movers Austin"), null, "the name it has is no change");
  assert.equal(withPreviewNamed(was, "   "), null);
});

/* ---- the route ---- */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "55555555-5555-4555-8555-555555555555";

const tables = (role = "owner", preview = null) => ({
  memberships: [{ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
  tenants: [{ id: A, name: "Harbor Fitness Co", timezone: "America/Chicago" }],
  lead_previews: preview ? [{ id: "p1", tenant_id: A, lead_id: LEAD, preview_tenant_id: WS, ...preview }] : [],
});
/** The door as 00631 answers it, each ask kept. */
const door = (answer) => {
  const asked = [];
  return {
    asked,
    rpcs: {
      lead_named: (a) => {
        asked.push(a);
        return typeof answer === "function" ? answer(a) : answer;
      },
    },
  };
};
const said = (a) => ({
  ok: true,
  business_name: a.p_business_name ?? "Iron Works Gym LLC",
  city: a.p_city ?? "Austin",
  again: 2,
  version: 8,
});
const ctxFor = (t, rpcs) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: { id: LEAD },
});
const send = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

test("its policy: who may find leads, at the lead doors' own rate, and it spends nothing", () => {
  assert.deepEqual(named.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "lead_member",
    spend: false,
  });
});

test("it asks the door for what was typed, and answers the lead as it now says", async () => {
  const d = door(said);
  const out = await named.POST.run(send({ business_name: "  Iron Works  " }), ctxFor(tables(), d.rpcs));
  assert.deepEqual(out, {
    lead_id: LEAD,
    business_name: "Iron Works",
    city: "Austin",
    again: 2,
    version: 8,
  });
  await named.POST.run(send({ city: "Round Rock" }), ctxFor(tables(), d.rpcs));
  await named.POST.run(send({ business_name: "Iron Works", city: "Round Rock" }), ctxFor(tables(), d.rpcs));
  assert.deepEqual(d.asked, [
    { p_lead_id: LEAD, p_business_name: "Iron Works" },
    { p_lead_id: LEAD, p_city: "Round Rock" },
    { p_lead_id: LEAD, p_business_name: "Iron Works", p_city: "Round Rock" },
  ]);
});

test("what is refused before the door: nothing typed, a name too short or too long, a viewer", async () => {
  const d = door(said);
  for (const body of [
    {},
    { business_name: " " },
    { business_name: "x" },
    { business_name: "x".repeat(LEAD_NAMED.name.max + 1) },
    { city: "x".repeat(LEAD_NAMED.city.max + 1) },
  ])
    await refused(named.POST.run(send(body), ctxFor(tables(), d.rpcs)), "validation", 400);
  await refused(named.POST.run(send({ city: "Austin" }), ctxFor(tables("viewer"), d.rpcs)), "forbidden", 403);
  await refused(named.POST.run(send({ city: "Austin" }), ctxFor(tables("operator"), d.rpcs)), "forbidden", 403);
  assert.deepEqual(d.asked, [], "the door is never asked");
});

test("the door's refusals, in contracts' words at the status each code means", async () => {
  const body = send.bind(null, { business_name: "Iron Works" });
  const gone = door({ error: "gone" });
  await refused(named.POST.run(body(), ctxFor(tables(), gone.rpcs)), "not_found", 404, leadNamedRefusal("gone"));
  const same = door({ error: "nothing" });
  await refused(named.POST.run(body(), ctxFor(tables(), same.rpcs)), "conflict", 409, leadNamedRefusal("nothing"));
  const bad = door({ error: "bad_name" });
  await refused(named.POST.run(body(), ctxFor(tables(), bad.rpcs)), "validation", 400, leadNamedRefusal("bad_name"));
  // The door's own P0002 (a lead of a workspace the caller may not find leads in) is a 404 in its words.
  const hidden = door(() => {
    throw Object.assign(new Error("Lead not found."), { code: "P0002" });
  });
  await refused(named.POST.run(body(), ctxFor(tables(), hidden.rpcs)), "not_found", 404, "Lead not found.");
});

/** The preview workspace's settings, as its build wrote them under the listing's name. */
const previewWorld = (brain) => {
  const kept = {
    tenant_config: [
      { tenant_id: WS, config: { brain }, version: 1, updated_at: "2026-11-15T12:00:00Z", updated_by: null },
    ],
  };
  setLinkPageClient(fakeDb(kept));
  return kept;
};

test("a new name reaches their preview's record while it is still a preview", async () => {
  const kept = previewWorld(brainOf("Iron Works Gym"));
  const d = door(said);
  await named.POST.run(send({ business_name: "Iron Works" }), ctxFor(tables("owner", { state: "ready" }), d.rpcs));
  const brain = kept.tenant_config[0].config.brain;
  assert.equal(brain.business_name, "Iron Works");
  assert.equal(brain.system_prompt, newReceptionistDefaults("Iron Works").system_prompt);
});

test("their record is left alone by a city, by a preview made theirs, and where there is none", async () => {
  const d = door(said);
  const city = previewWorld(brainOf("Iron Works Gym"));
  await named.POST.run(send({ city: "Round Rock" }), ctxFor(tables("owner", { state: "ready" }), d.rpcs));
  assert.equal(city.tenant_config[0].config.brain.business_name, "Iron Works Gym");
  const theirs = previewWorld(brainOf("Iron Works Gym"));
  await named.POST.run(
    send({ business_name: "Iron Works" }),
    ctxFor(tables("owner", { state: "claimed", claimed_at: "2026-11-14T12:00:00Z" }), d.rpcs),
  );
  assert.equal(
    theirs.tenant_config[0].config.brain.business_name,
    "Iron Works Gym",
    "one made theirs is theirs to name",
  );
  const none = previewWorld(brainOf("Iron Works Gym"));
  const out = await named.POST.run(send({ business_name: "Iron Works" }), ctxFor(tables(), d.rpcs));
  assert.equal(out.business_name, "Iron Works");
  assert.equal(none.tenant_config[0].version, 1);
});

test("a record that cannot be written leaves the lead right: the name is saved and the answer is the door's", async () => {
  setLinkPageClient(fakeDb({ tenant_config: [] }));
  const d = door(said);
  const out = await named.POST.run(
    send({ business_name: "Iron Works" }),
    ctxFor(tables("owner", { state: "ready" }), d.rpcs),
  );
  assert.equal(out.business_name, "Iron Works");
});

/* ---- the card ---- */

test("the card says a value is the owner's own, and what its listing said", () => {
  const lead = { business_name: "Iron Works", city: "Austin" };
  assert.equal(fillInSaysOf("business", lead, "Google Maps").from, F.source("Google Maps"));
  const fixed = { ...lead, facts: { own: { name: true, was: { name: "IRON WORKS GYM LLC" } } } };
  assert.equal(fillInSaysOf("business", fixed, "Google Maps").from, F.yoursWas("IRON WORKS GYM LLC"));
  assert.equal(fillInSaysOf("company", fixed, "Google Maps").from, F.yoursWas("IRON WORKS GYM LLC"));
  assert.equal(
    fillInSaysOf("city", fixed, "Google Maps").from,
    F.source("Google Maps"),
    "its city is still the listing's",
  );
  const city = { ...lead, facts: { own: { city: true } } };
  assert.equal(fillInSaysOf("city", city, null).from, F.yours, "with nothing kept of the listing, it says only whose");
});

test("only a lead's own name and city can be put right for every email", () => {
  assert.deepEqual(["business", "company", "city"].map(fillInFixOf), ["name", "name", "city"]);
  for (const slot of ["first name", "title", "role", "your name", "your business", "booking link", "opening"])
    assert.equal(fillInFixOf(slot), null, slot);
});

test("what it says once saved: every email, and how many waiting lines are written again", () => {
  assert.equal(F.every.saved(0), "Saved. Every email to them says this now.");
  assert.ok(F.every.saved(1).includes("1 waiting email"));
  assert.ok(F.every.saved(3).includes("3 waiting emails"));
});
