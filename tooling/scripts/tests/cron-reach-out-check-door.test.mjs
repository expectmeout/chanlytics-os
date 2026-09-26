/**
 * The reach-out check's clock, run: POST /api/cron/reach-out-check over a database in memory, the model answered by the
 * test through the platform's one transport (lib/model.ts setModelClient). Its own clock (R1): who may knock; with no
 * ANTHROPIC_API_KEY nothing is touched and a waiting send says 503 (R4); with no cold lane nothing is checked, since
 * nothing checked could leave (R2); a tick where every call failed is a 503 (R4); a tick that checks says what it did.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, refusedAtTheDoor, vault, withEnv } from "./_cron-doors-world.mjs";

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setModelClient } = await import(at("apps/edge/lib/model.ts"));
const { POST } = await import(at("apps/edge/api/cron/reach-out-check.ts"));
after(() => {
  setPg(null);
  setModelClient(null);
});

const MIN = 60_000;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TPL = "44444444-aaaa-4aaa-8aaa-444444444444";
/** The cold lane and the model's key, set. Made-up values. */
const SET = {
  ANTHROPIC_API_KEY: "model-key-for-this-file",
  RESEND_API_KEY: "platform-key-for-this-file",
  RESEND_COLD_API_KEY: "cold-key-for-this-file",
  RESEND_COLD_WEBHOOK_SECRET: "cold-webhook-for-this-file",
  UNSUBSCRIBE_SECRET: "unsubscribe-seal-for-this-file",
  EMAIL_DOMAIN: "mail.chanlytics.com",
};

const send = (over = {}) => ({
  id: "send-1",
  tenant_id: T,
  broadcast_id: "run-1",
  playbook_id: "root-1",
  root_id: "root-1",
  lead_id: "lead-1",
  send_at: new Date(Date.now() + 10 * MIN).toISOString(),
  state: "planned",
  reason: null,
  checked_at: null,
  check_tries: 0,
  check_after: null,
  check_first_at: null,
  check_started_at: null,
  check_gen: 0,
  included_for: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...over,
});

function world({ sends = [send()] } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving Co", status: "active" }],
    tenant_config: [],
    business_records: [],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    templates: [
      {
        id: TPL,
        tenant_id: T,
        channel: "email",
        components: [
          { type: "HEADER", text: "Quick one" },
          { type: "BODY", text: "{{opening}}\n\nI run Harbor." },
        ],
      },
    ],
    reach_out_sends: sends,
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...vault,
      reach_out_unchecked: () =>
        tables.reach_out_sends
          .filter((s) => s.state === "planned" && s.checked_at == null && s.check_started_at == null)
          .map((s) => {
            s.check_started_at = new Date().toISOString();
            return {
              send: { ...s },
              check_gen: s.check_gen,
              template_id: TPL,
              template_language: "en",
              signed_by: null,
              included_for: [],
              business_name: "Austin Movers",
              category: "Moving company",
              city: "Austin",
              region: "TX",
              rating: 4.9,
              reviews: 16,
              website_host: "austinmovers.example",
              hours: [],
              about: "Family-run since 2009.",
              email: "owner@austinmovers.example",
              why_it_fits: "Independent mover",
              what_you_asked: "movers",
              site_listings: 1,
              name_listings: 1,
              email_domain_shared: false,
            };
          }),
      reach_out_month_sent: () => 0,
      // 00191's spend (room left) and release (nothing held here), as the SQL answers them.
      reach_out_check_take: () => true,
      reach_out_release_unavailable: () => 0,
    },
  );
  setPg(db);
  return { tables, db, row: (id) => tables.reach_out_sends.find((s) => s.id === id) };
}

/** The model's client, answering the writer and the reader by their prompts; or failing every call. */
function model(mode = "answers") {
  const asked = [];
  setModelClient({
    messages: {
      create: async (body, options) => {
        asked.push({ body, options });
        if (mode === "down") throw Object.assign(new Error("overloaded"), { status: 529 });
        const writer = String(body.system).includes("You write");
        const answer = writer
          ? { opening: "A 4.9 from 16 reviews says people find you.", angle: "their reviews", facts_used: ["rating"] }
          : { backed: true, unbacked: "", pitch: false, language: "en" };
        return {
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 50, output_tokens: 10 },
        };
      },
    },
  });
  return asked;
}
const knockWith = (env) => withEnv(env, async () => answer(await knock(POST, "reach-out-check")));

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "reach-out-check", setPg);
});

test("no model key: nothing is touched; a send waiting says so with a 503, and none waiting is a 200 (R4)", async () => {
  const asked = model();
  const w = world();
  const [status, body] = await knockWith({ ...SET, ANTHROPIC_API_KEY: undefined });
  assert.deepEqual([status, body], [503, { ok: false, error: "check_unset" }]);
  assert.deepEqual([w.row("send-1").check_started_at, asked.length], [null, 0], "not even leased");
  world({ sends: [] });
  assert.deepEqual(await knockWith({ ...SET, ANTHROPIC_API_KEY: undefined }), [200, { ok: true, unset: true }]);
});

test("no cold lane: nothing checked could leave, so nothing is checked; a send waiting names what is missing (R2)", async () => {
  const asked = model();
  const w = world();
  const [status, body] = await knockWith({ ...SET, UNSUBSCRIBE_SECRET: undefined });
  assert.deepEqual([status, body.error, body.missing], [503, "cold_lane_unset", ["UNSUBSCRIBE_SECRET"]]);
  assert.deepEqual([w.row("send-1").check_started_at, asked.length], [null, 0]);
});

test("a tick checks: the opening written and read, each call with its own deadline and no retry of its own (R1)", async () => {
  const asked = model();
  const w = world();
  const [status, body] = await knockWith(SET);
  assert.equal(status, 200);
  assert.deepEqual([body.read, body.checked, body.held, body.calls, body.calls_failed], [1, 1, 0, 2, 0]);
  const r = w.row("send-1");
  assert.deepEqual(
    [r.state, r.opening, r.check_started_at, !!r.checked_at],
    ["planned", "A 4.9 from 16 reviews says people find you.", null, true],
  );
  assert.equal(asked.length, 2);
  for (const a of asked) {
    assert.equal(a.body.model, "claude-haiku-4-5-20251001");
    assert.equal(a.options.maxRetries, 0);
    assert.ok(a.options.signal instanceof AbortSignal, "a deadline on every call");
    assert.ok(a.options.timeout <= 8_000);
  }
});

test("a tick where every call failed answers 503, and the send backs off for its next try (R4)", async () => {
  model("down");
  const w = world();
  const [status, body] = await knockWith(SET);
  assert.deepEqual(
    [status, body.error, body.failed, body.calls, body.calls_failed],
    [503, "model_unavailable", 1, 1, 1],
  );
  const r = w.row("send-1");
  assert.deepEqual([r.state, r.check_tries, r.check_started_at], ["planned", 1, null]);
  assert.ok(Date.parse(r.check_after) > Date.now() + 50_000, "tried again a minute on");
});
