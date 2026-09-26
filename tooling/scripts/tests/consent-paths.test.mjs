/**
 * A converted lead's yes comes only from them, permanently (PRD v3 §0.4,
 * decision 19), proved from the other side of the door.
 *
 * consent-paths.db.test.mjs proves the rule where it lives: the two doors on
 * Postgres refuse a yes for a person a lead you found is linked to, nothing
 * else a member may execute can record one, and RLS turns a direct UPDATE into
 * nothing. That is the half that cannot be got round.
 *
 * This file proves the half a member actually walks. Every route a person can
 * reach to record a yes HANDS IT TO ONE OF THOSE DOORS -- it does not decide
 * for itself, and it does not write the columns beside the door -- and the
 * door's sentence is what the owner reads, word for word, on all five paths:
 * the visit answer and the offers answer, one person at a time and fifty at
 * once, and the desk's "in their own message" naming a real message (00137,
 * #675), which is refused too because the yes has to come through the edge.
 *
 * And the other direction, which is the point of converting a lead at all: a
 * converted lead with no yes is refused by every send path exactly as any
 * person with no yes is -- the broadcast audience, a playbook's run, the
 * message door itself, and the phone receptionist's text -- so the rule above
 * costs nothing extra to enforce and nothing leaks past it.
 *
 * Everything here runs the real code over fakes: the four routes over the
 * fakeDb whose doors refuse as release B's do, and the send paths over their
 * own fixtures. The doors' bodies are Postgres's (leads.db.test.mjs,
 * consent-paths.db.test.mjs); what is executed here is the path to them.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LEAD_CONSENT_REFUSAL,
  PEOPLE_LISTS,
  PURPOSE_REFUSALS,
  audiencePreview,
  eligibleFor,
  eligibleForPlaybook,
  mayMessageFor,
  mayReceive,
} from "../../../packages/contracts/src/index.ts";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const visitOne = await import(at("apps/dashboard/app/api/v1/contacts/[id]/consent/route.ts"));
const offersOne = await import(at("apps/dashboard/app/api/v1/contacts/[id]/marketing-consent/route.ts"));
const visitMany = await import(at("apps/dashboard/app/api/v1/contacts/consent/route.ts"));
const offersMany = await import(at("apps/dashboard/app/api/v1/contacts/marketing-consent/route.ts"));
const { ACT_TOOLS } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { outboundGate, refusalScript } = await import(at("apps/edge/lib/receptionist/outbound-gate.ts"));
const { deliver } = await import(at("packages/core/src/deliver.ts"));

beforeEach(() => setRateStore(memoryStore()));

/* ------------------------------------------- recording a yes: the four routes */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** The person an Interested call made from a lead: `leads.contact_id` points at them. */
const P1 = "11111111-1111-4111-8111-111111111111";
const MSG = "99999999-9999-4999-8999-999999999999";
const USER = "u1";

const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "operator", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  contacts: [{ id: P1, tenant_id: A, erased_at: null, consent: "unknown", marketing_consent: "unknown" }],
  decisions: [],
});

/**
 * The two doors as release B writes them: they answer for anyone else, and for
 * a person a lead is linked to they raise 42501 with contracts' own sentence
 * (00142; the bodies are proved on Postgres, not here).
 */
const doors = () => {
  const handed = [];
  const answer = (name) => (a) => {
    handed.push([name, a]);
    if (a.p_consent === "opted_in") {
      throw Object.assign(new Error(LEAD_CONSENT_REFUSAL), { code: "42501" });
    }
    return name === "set_contact_consent"
      ? { previous: "unknown", updated_at: "2026-09-20T12:00:00Z", dnc: false }
      : { marketing_consent: a.p_consent, marketing_consent_updated_at: "2026-09-20T12:00:00Z" };
  };
  return {
    handed,
    rpcs: {
      set_contact_consent: answer("set_contact_consent"),
      set_marketing_consent: answer("set_marketing_consent"),
    },
  };
};

const ctxFor = (t, rpcs, params = {}) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const put = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "PUT", body: JSON.stringify(body) });

test("ACCEPTANCE: every consent route a member can reach hands the yes to a door, and carries the door's refusal back in its own words", async () => {
  const cases = [
    [
      "the visit answer, one person",
      visitOne,
      "set_contact_consent",
      { consent: "opted_in", source: "in_person" },
      { id: P1 },
    ],
    [
      "the visit answer, a batch",
      visitMany,
      "set_contact_consent",
      { ids: [P1], consent: "opted_in", source: "phone" },
      {},
    ],
    [
      "the offers answer, one person",
      offersOne,
      "set_marketing_consent",
      { consent: "opted_in", source: "form", note: "they signed a slip" },
      { id: P1 },
    ],
    [
      "the offers answer, a batch",
      offersMany,
      "set_marketing_consent",
      { ids: [P1], consent: "opted_in", source: "form" },
      {},
    ],
    // The desk's own-message door (00137, #675) names a real message and is
    // still refused: the yes has to come through the edge.
    [
      "the offers answer, in their own message",
      offersOne,
      "set_marketing_consent",
      { consent: "opted_in", source: "customer_message", message_id: MSG },
      { id: P1 },
    ],
  ];
  for (const [label, route, door, body, params] of cases) {
    const t = tables();
    const { handed, rpcs } = doors();
    const ctx = ctxFor(t, rpcs, params);
    const out = await route.PUT.run(put(body), ctx).catch((e) => e);
    // One sentence, whichever path the owner took and whichever door answered.
    const words = out instanceof Error ? out.message : out.failed?.[0]?.message;
    assert.equal(words, LEAD_CONSENT_REFUSAL, label);
    // It is the DOOR's refusal, not the route's: the route asked, and asked the
    // right one. A route that decided for itself would never appear here.
    assert.deepEqual(
      handed.map(([name]) => name),
      [door],
      `${label}: it went through the door`,
    );
    assert.equal(handed[0][1].p_consent, "opted_in", `${label}: with the yes it was asked to record`);
    assert.equal(out.done ?? 0, 0, `${label}: nobody's answer was recorded`);
    // And nothing wrote the columns beside it.
    assert.deepEqual(
      ctx.supabase.seen.filter((q) => q.table === "contacts" && q.op === "update"),
      [],
      `${label}: no write around the door`,
    );
    assert.deepEqual(
      [t.contacts[0].consent, t.contacts[0].marketing_consent],
      ["unknown", "unknown"],
      `${label}: nothing moved`,
    );
    assert.deepEqual(t.decisions, [], `${label}: a refused answer is not a decision`);
  }
});

test("the same routes still record what is theirs to record: a no, and a reset", async () => {
  // The rule is about a yes for a converted lead and nothing else. If these
  // stopped working the test above would still be green and the product would
  // be broken -- a desk that cannot write down "no more offers" is worse than
  // one that cannot write down a yes.
  const t = tables();
  const { handed, rpcs } = doors();
  assert.equal(
    (await visitOne.PUT.run(put({ consent: "opted_out", source: "phone" }), ctxFor(t, rpcs, { id: P1 }))).consent,
    "opted_out",
  );
  assert.equal((await offersOne.PUT.run(put({ consent: "unknown" }), ctxFor(t, rpcs, { id: P1 }))).consent, "unknown");
  assert.deepEqual(
    await offersMany.PUT.run(put({ ids: [P1], consent: "opted_out", source: "phone" }), ctxFor(t, rpcs)),
    { done: 1, failed: [], skipped: [] },
  );
  assert.deepEqual(
    handed.map(([name, a]) => [name, a.p_consent]),
    [
      ["set_contact_consent", "opted_out"],
      ["set_marketing_consent", "unknown"],
      ["set_marketing_consent", "opted_out"],
    ],
    "each answer reached its own door",
  );
});

test("Ask has no act that could record a yes: the only way in is a route, and every route is above", () => {
  assert.deepEqual(
    ACT_TOOLS.map((t) => t.name).filter((n) => /consent|yes|opt/i.test(n)),
    [],
  );
  const args = (t) => JSON.stringify(t.input_schema?.properties ?? {});
  assert.deepEqual(
    ACT_TOOLS.filter((t) => /"(marketing_)?consent"|"opted_in"/.test(args(t))).map((t) => t.name),
    [],
    "and no act takes a consent value as an argument, whatever it is called",
  );
});

/* ------------------------------------ being sent to: every path, one lead each */

/**
 * The converted lead as each send path holds them. A real conversation made
 * them a person; nobody has answered either question, which is where every
 * lead starts and where most of them stay.
 */
const NO_YES = { consent: "unknown", dnc: false, marketing_consent: "unknown" };
const leadRow = (over = {}) => ({
  id: "p-lead",
  name: "Fixture Strength Lab",
  givenName: null,
  waName: null,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: "+15125550151",
  consent: {
    state: "unknown",
    dnc: false,
    label: "Not asked",
    sub: "",
    source: null,
    marketing: "unknown",
    marketingSource: null,
    marketingSub: "",
  },
  lastContact: { ts: Date.parse("2026-08-01T10:00:00Z"), label: "" },
  // They last wrote on Aug 1, fifty of the workspace's days before the run: Quiet 30+ days reads this (lists.ts).
  heardDays: 50,
  ...over,
});
/** Somebody who walked in and said yes to both: the control, so a green test means the rule and not an empty list. */
const walkedIn = (over = {}) =>
  leadRow({
    id: "p-walkin",
    name: "Ada Lovelace",
    givenName: "Ada",
    phone: "+15125550152",
    consent: {
      state: "opted_in",
      dnc: false,
      label: "Opted in",
      sub: "",
      source: "in_person",
      marketing: "opted_in",
      marketingSource: "form",
      marketingSub: "",
    },
    ...over,
  });

test("a converted lead with no yes is refused by the one predicate, as any person with no yes is", () => {
  assert.deepEqual(mayMessageFor(NO_YES, "marketing", { proactive: true }), {
    ok: false,
    reason: "no_marketing_consent",
  });
  assert.deepEqual(mayMessageFor(NO_YES, "conversational", { proactive: true }), { ok: false, reason: "not_opted_in" });
  // Answering one who wrote to you is not starting a conversation, and that is
  // the same for everybody: a lead who replies is replied to.
  assert.deepEqual(mayMessageFor(NO_YES, "conversational"), { ok: true, reason: null });
  assert.equal(mayReceive(leadRow(), "marketing"), false);
  assert.equal(mayReceive(walkedIn(), "marketing"), true);
});

test("a broadcast's audience leaves the converted lead out, and says why in the owner's words", () => {
  const rows = [leadRow(), walkedIn()];
  for (const purpose of ["marketing", "conversational"]) {
    assert.deepEqual(
      eligibleFor(rows, "everyone", null, null, purpose).map((r) => r.id),
      ["p-walkin"],
      purpose,
    );
  }
  // Picked by hand into a saved list, they are still not sent to: a list
  // chooses who is considered, never who may be reached.
  assert.deepEqual(
    eligibleFor(rows, "saved", "l1", new Set(["p-lead", "p-walkin"]), "marketing").map((r) => r.id),
    ["p-walkin"],
  );
  const preview = audiencePreview(rows, "everyone", null, null, "marketing");
  assert.deepEqual([preview.sending, preview.held], [1, 1]);
  assert.deepEqual(
    preview.people.map((p) => [p.id, p.refusal]),
    [
      ["p-walkin", null],
      ["p-lead", PURPOSE_REFUSALS.no_marketing_consent],
    ],
    "the owner reads the reason before they send, not after",
  );
});

test("a playbook's run passes the converted lead over, though the trigger's list holds them", () => {
  const rows = [leadRow(), walkedIn()];
  const quiet = PEOPLE_LISTS.find((l) => l.id === "quiet");
  // In the list the trigger reads -- so it is the yes that leaves them out and
  // not the trigger, which is the whole reason this case is worth having.
  assert.deepEqual(
    rows.filter(quiet.test).map((r) => r.id),
    ["p-lead", "p-walkin"],
  );
  const p = { trigger: "quiet_30", cap_per_run: 25, gap_days: 90, cadence_days: 30 };
  const touches = { byThis: new Map(), byAny: new Map() };
  const now = Date.parse("2026-09-20T12:00:00Z");
  assert.deepEqual(
    eligibleForPlaybook(rows, p, touches, now).map((r) => r.id),
    ["p-walkin"],
  );
  // And a standing rule that runs every month reaches them no more than one that runs once.
  assert.deepEqual(
    eligibleForPlaybook(rows, { ...p, trigger: "everyone_monthly" }, touches, now).map((r) => r.id),
    ["p-walkin"],
  );
});

const T = "t1";
const NOW = Date.parse("2026-09-20T12:00:00.000Z");
const wireOf = () => {
  const calls = [];
  return {
    calls,
    wire: {
      whatsapp: async (to, p) => {
        calls.push({ to, p });
        return { ok: true, wamid: "wamid.1", status: 200 };
      },
    },
  };
};
const world = (contact) => ({
  conversations: [
    {
      id: "c1",
      tenant_id: T,
      paused_until: null,
      contacts: { erased_at: null, ...contact },
      tenants: { status: "active" },
    },
  ],
  messages: [],
  events: [],
});
const words = (over = {}) => ({
  tenantId: T,
  conversationId: "c1",
  contactId: "p-lead",
  to: "+15125550151",
  channel: "whatsapp",
  sender: "human",
  purpose: "conversational",
  proactive: false,
  body: "A quick hello from us",
  ...over,
});

test("the message door refuses a converted lead at the wire, sends nothing and leaves no row behind", async () => {
  for (const [label, over, reason] of [
    ["an offer", { purpose: "marketing" }, "no_marketing_consent"],
    ["words that start a conversation", { proactive: true }, "not_opted_in"],
  ]) {
    const t = world(NO_YES);
    const w = wireOf();
    const out = await deliver({ db: fakeDb(t), wire: w.wire, now: () => NOW }, words(over));
    assert.deepEqual([out.outcome, out.reason], ["refused", reason], label);
    assert.deepEqual(w.calls, [], `${label}: nothing reached the wire`);
    assert.deepEqual([t.messages, t.events], [[], []], `${label}: and nothing claims it did`);
  }
  // Answering them is not refused, and must not be: the conversation that made
  // them a person is the one they are replying on.
  const t = world(NO_YES);
  const w = wireOf();
  assert.equal((await deliver({ db: fakeDb(t), wire: w.wire, now: () => NOW }, words())).outcome, "sent");
  assert.equal(w.calls.length, 1);
});

test("the phone receptionist will not text a converted lead off its own bat, and says so out loud", () => {
  const facts = {
    contact: NO_YES,
    purpose: "conversational",
    proactive: true,
    paused: false,
    pausedUntilMs: null,
    replyMode: "auto",
    bookingHeld: false,
    sentToday: 0,
    dailyCap: 3,
    nowMs: NOW,
  };
  assert.deepEqual(outboundGate(facts), { allowed: false, refusal: "not_opted_in" });
  assert.deepEqual(outboundGate({ ...facts, purpose: "marketing" }), {
    allowed: false,
    refusal: "no_marketing_consent",
  });
  // The caller hears an alternative, never our record of somebody else.
  for (const r of ["not_opted_in", "no_marketing_consent"]) {
    const script = refusalScript(r, "(512) 555-0100");
    assert.ok(script.length > 0 && !/consent|lead/i.test(script), script);
  }
  // The caller on the line asking for their OWN link is answering us, and is
  // answered -- the same as any first-time caller, converted lead or not.
  assert.deepEqual(outboundGate({ ...facts, proactive: false }), { allowed: true, refusal: null });
});
