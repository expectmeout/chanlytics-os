/**
 * 00303 on a real Postgres: one rule for a connected call, one for an automated send, one for a person's first moment,
 * and who answered with the hold the answer waited. A broadcast's or a reach-out's send is written as 'human' and is nobody's answer.
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const plus = (d, s) => new Date(d.getTime() + s * 1000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-answers-${Date.now()}`, name: "Harbor Answers", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

async function person(phone, over = {}) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest", ...over })
      .select("id")
      .single(),
  );
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: ago(1).toISOString() })
      .select("id")
      .single(),
  );
  return { contact: contact.id, conv: conv.id };
}

const message = (p, over) => ({
  tenant_id: tenantId,
  conversation_id: p.conv,
  contact_id: p.contact,
  channel: "whatsapp",
  type: "text",
  body: "hi",
  meta: {},
  ...over,
});

test("a connected call is one rule: ended or ongoing, or an error someone spoke on", { skip }, async () => {
  const cases = [
    ["ended", null, true],
    ["ongoing", null, true],
    ["error", 30_000, true],
    ["error", 0, false],
    ["error", null, false],
    ["not_connected", null, false],
    ["registered", null, false],
  ];
  for (const [status, ms, want] of cases) {
    const got = ok(await db.rpc("call_connected", { p_status: status, p_duration_ms: ms }));
    assert.equal(got, want, `${status} ${ms}`);
  }
});

test(
  "an automated send is one rule: a broadcast's or a reach-out's, never the owner's or an echo",
  { skip },
  async () => {
    const cases = [
      [{ source: "broadcast" }, true],
      [{ source: "reach_out" }, true],
      [{}, false],
      [{ echo: true }, false],
    ];
    for (const [meta, want] of cases) {
      const got = ok(await db.rpc("automated_send", { p_meta: meta }));
      assert.equal(got, want, JSON.stringify(meta));
    }
  },
);

test(
  "who answered: the receptionist's answer carries its hold; a broadcast is nobody's; the owner's is yours",
  { skip },
  async () => {
    const a = await person("+15550138001");
    const b = await person("+15550138002");
    const askA = ago(120);
    const askB = ago(60);
    ok(
      await db.from("messages").insert([
        message(a, {
          direction: "inbound",
          sender: "customer",
          status: "received",
          created_at: askA.toISOString(),
          channel_ts: askA.toISOString(),
        }),
        message(a, {
          direction: "outbound",
          sender: "ai",
          status: "sent",
          body: "hello",
          created_at: plus(askA, 61),
          meta: { source: "veto_window", delay_ms: 60000 },
        }),
        message(b, {
          direction: "inbound",
          sender: "customer",
          status: "received",
          created_at: askB.toISOString(),
          channel_ts: askB.toISOString(),
        }),
        message(b, {
          direction: "outbound",
          sender: "human",
          status: "sent",
          body: "This month's offer",
          created_at: plus(askB, 30),
          meta: { source: "broadcast" },
        }),
      ]),
    );
    const since = ago(24 * 60).toISOString();
    const rows = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since }));
    const byConv = Object.fromEntries(rows.map((r) => [r.conversation_id, r]));
    assert.equal(byConv[a.conv].who, "ai");
    assert.equal(Math.round(Number(byConv[a.conv].ai_seconds)), 61);
    assert.equal(Number(byConv[a.conv].ai_hold_s), 60, "the hold the answer waited");
    assert.equal(byConv[b.conv].who, "none", "a broadcast's send is nobody's answer");
    assert.equal(byConv[b.conv].ai_hold_s, null);

    ok(
      await db.from("messages").insert(
        message(b, {
          direction: "outbound",
          sender: "human",
          status: "sent",
          body: "Yes, Saturday",
          created_at: plus(askB, 90),
        }),
      ),
    );
    const again = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since }));
    assert.equal(again.find((r) => r.conversation_id === b.conv).who, "you", "the owner's own reply is still yours");
  },
);

test(
  "a first moment is a message or a connected call; never an erased person, never a person with neither",
  { skip },
  async () => {
    const spoke = await person("+15550138003");
    const erased = await person("+15550138004", { erased_at: new Date().toISOString() });
    const silent = await person("+15550138005");
    const caller = await person("+15550138006");
    const spokeAt = ago(30).toISOString();
    ok(
      await db.from("messages").insert([
        message(spoke, {
          direction: "inbound",
          sender: "customer",
          status: "received",
          created_at: spokeAt,
          channel_ts: spokeAt,
        }),
        message(erased, {
          direction: "inbound",
          sender: "customer",
          status: "received",
          created_at: spokeAt,
          channel_ts: spokeAt,
        }),
      ]),
    );
    ok(
      await db.from("calls").insert([
        {
          tenant_id: tenantId,
          retell_call_id: `ans-${Date.now()}-a`,
          contact_id: caller.contact,
          status: "error",
          started_at: ago(20).toISOString(),
          duration_ms: 0,
        },
        {
          tenant_id: tenantId,
          retell_call_id: `ans-${Date.now()}-b`,
          contact_id: caller.contact,
          status: "error",
          started_at: ago(10).toISOString(),
          duration_ms: 45_000,
        },
      ]),
    );
    const firsts = ok(await db.rpc("contact_first_moments", { p_tenant_id: tenantId }));
    const ids = new Set(firsts.map((f) => f.contact_id));
    assert.ok(ids.has(spoke.contact));
    assert.ok(!ids.has(erased.contact), "an erased person has no first moment");
    assert.ok(!ids.has(silent.contact), "a person who never wrote or phoned has none");
    const callerFirst = firsts.find((f) => f.contact_id === caller.contact);
    assert.ok(callerFirst, "a call someone spoke on is a first moment");
    assert.ok(
      Math.abs(new Date(callerFirst.first_at).getTime() - ago(10).getTime()) < 120_000,
      "the call that errored at once is not",
    );
  },
);
