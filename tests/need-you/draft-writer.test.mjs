/**
 * The one writer of a reply for a person to send (decision 0093), its door and its sweep, run over a database in memory with the
 * brain handed in. What is proved: the gates ask by who is waiting (a held thread never asks the reply policy, and stops at the
 * headroom; a member's change is held to the cap alone), `escalate` means nothing here, what is checked of the words in code,
 * what code says of them, and what a refusal at the door or a sweep's tick does.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels/tokens";
import { parseTenantConfigResult, REPLY_DRAFT_RULES } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";

const { draftWriter } = await import(at("apps/edge/lib/drafts/writer.ts"));
const { draftAtTheDoor } = await import(at("apps/edge/lib/drafts/door.ts"));
const { sweepDrafts } = await import(at("apps/edge/lib/drafts/sweep.ts"));
const { POST: draftDoor } = await import(at("apps/edge/api/admin/draft.ts"));
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
after(() => setPg(null));

const BRAIN = {
  business_name: "Harbor Moving",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  booking_link: "https://book.example/harbor",
  fallbacks: { greeting: "g", error: "Sorry, one moment.", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, services: [{ name: "Moving" }] },
};
const PARSED = parseTenantConfigResult({ brain: BRAIN });
assert.ok(PARSED.ok, JSON.stringify(PARSED.issues));
const TZ = "America/New_York";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

/** A workspace nobody else in this file uses: the runtime loader caches one for ten minutes. */
let seq = 0;
function world({ mode = "never", limits = {}, usage = 0, mailbox = true, brainConfig = BRAIN, answers = null } = {}) {
  seq += 1;
  const tenant = `dddddddd-dddd-4ddd-8ddd-${String(seq).padStart(12, "0")}`;
  const tables = {
    mailboxes: mailbox
      ? [{ id: `mb-${seq}`, tenant_id: tenant, local_part: "harbor", from_name: "Harbor", reply_token: "tok" }]
      : [],
    mailbox_connections: [],
    tenant_config: [{ tenant_id: tenant, config: { brain: brainConfig } }],
    policies: [{ tenant_id: tenant, class: "reply", mode, limits, subject_type: null, subject_id: null }],
    tenants: [{ id: tenant, name: "Harbor", timezone: TZ, status: "active" }],
    billing_accounts: [{ tenant_id: tenant, mode: "stripe", status: "active" }],
    tenant_channels: [],
    google_listings: [],
    events: usage
      ? [
          {
            id: 1,
            tenant_id: tenant,
            kind: "usage.llm_tokens",
            created_at: new Date(Date.now() - 60_000).toISOString(),
            data: { input_tokens: usage, output_tokens: 0 },
          },
        ]
      : [],
    messages: [
      {
        id: M1,
        tenant_id: tenant,
        conversation_id: CONV,
        body: "Can you move a sofa on Friday?",
        sender: "customer",
        direction: "inbound",
        type: "text",
        status: "received",
        created_at: new Date(Date.now() - 120_000).toISOString(),
        channel_ts: null,
        meta: null,
      },
    ],
  };
  const db = fakeDb(tables, {}, { runtime_stamp: () => "stamp-1" });
  const asked = [];
  const queue = answers ? [...answers] : [];
  const brain = async (ask) => {
    asked.push(ask);
    return (
      queue.shift() ?? { text: "Yes, Friday works.", escalate: false, usage: { input_tokens: 90, output_tokens: 30 } }
    );
  };
  return { tenant, tables, db, asked, write: draftWriter(db, { brain }) };
}
const ask = (over = {}) => ({
  conversationId: CONV,
  contactId: null,
  forMessageId: M1,
  source: "hold",
  wire: "email",
  theirWords: "Can you move a sofa on Friday?",
  theirSubject: "Re: A sofa",
  holdReason: "email_review",
  holdDetails: null,
  instruction: null,
  given: null,
  deadline: Date.now() + 30_000,
  ...over,
});
const answer = (text, over = {}) => ({ text, escalate: false, usage: { input_tokens: 5, output_tokens: 5 }, ...over });

test("a held thread is drafted whatever the reply policy says: ask or never is exactly when the owner answers themself", async () => {
  const w = world({ mode: "never" });
  const out = await w.write.reply(w.tenant, ask());
  assert.equal(out.text, "Yes, Friday works.");
  const reachOut = world({ mode: "never" });
  assert.deepEqual(await reachOut.write.reply(reachOut.tenant, ask({ source: "reach_out" })), { why: "off" });
  assert.equal(reachOut.asked.length, 0, "a reach-out's draft keeps its own gate");
});

test("an email's draft is written for an email, in the draft voice; its subject and Why this? are said by code", async () => {
  const w = world();
  const out = await w.write.reply(w.tenant, ask());
  const system = w.asked[0].systemPrompt;
  assert.match(system, /by email/);
  assert.match(system, /no signature/);
  assert.doesNotMatch(system, /\[\[HUMAN\]\]/, "no hand-off to give the person it is written for");
  assert.equal(w.asked[0].fallbackText, "", "no holding words: never drafted as the fallback");
  assert.equal(out.subject, "Re: A sofa", "the parent's subject, prefixes stripped");
  assert.deepEqual(out.used, ["their email", "your facts", "your hours", "your booking link"]);
  assert.equal(w.asked[0].call.purpose, "reply_draft", "metered under its own purpose");
  const usage = w.tables.events.filter((e) => e.kind === "usage.llm_tokens");
  assert.deepEqual(
    usage.map((e) => e.data.source),
    ["reply_draft"],
  );
});

test("`escalate` means nothing here: only a refusal, a failure or no words is not drafted", async () => {
  for (const [given, why] of [
    [answer("Friday works.", { escalate: true }), null],
    [answer("Sorry.", { reason: "refusal", escalate: true }), "not_drafted"],
    [answer("Sorry.", { reason: "brain_error", escalate: true }), "not_drafted"],
    [answer("  "), "not_drafted"],
  ]) {
    const w = world({ answers: [given] });
    const out = await w.write.reply(w.tenant, ask());
    if (why) assert.deepEqual(out, { why });
    else assert.equal(out.text, "Friday works.");
  }
});

test("a draft stops at the headroom so live replies keep the rest; a member waiting on their own change goes to the cap", async () => {
  const limits = { max_llm_tokens_day: 1000 };
  const spent = world({ limits, usage: 900 });
  assert.deepEqual(await spent.write.reply(spent.tenant, ask()), { why: "budget" });
  assert.equal(spent.asked.length, 0);
  const waiting = world({ limits, usage: 900 });
  const out = await waiting.write.reply(
    waiting.tenant,
    ask({ source: "rewrite", instruction: "shorter", given: "Hi" }),
  );
  assert.equal(out.text, "Yes, Friday works.");
  const atTheCap = world({ limits, usage: 1000 });
  assert.deepEqual(await atTheCap.write.reply(atTheCap.tenant, ask({ source: "rewrite", instruction: "shorter" })), {
    why: "budget",
  });
});

test("a promise of our own follow-up by a time is asked for once more, and never kept", async () => {
  const again = world({
    answers: [answer("I'll get back to you today."), answer("I'll find out and come back to you.")],
  });
  const fixed = await again.write.reply(again.tenant, ask());
  assert.equal(fixed.text, "I'll find out and come back to you.");
  assert.equal(again.asked.length, 2);
  assert.match(again.asked[1].steer, /name no day or time/, "the rule said again");
  const twice = world({ answers: [answer("We'll call you tomorrow."), answer("We will call you tomorrow.")] });
  assert.deepEqual(await twice.write.reply(twice.tenant, ask()), { why: "not_drafted" });
});

test("a price or money is the owner's to give: named_money for what it wrote alone, kept where they gave it", async () => {
  for (const text of ["It is $450 for the move.", "I can offer you a discount on the first move."]) {
    const w = world({ answers: [answer(text)] });
    assert.deepEqual(await w.write.reply(w.tenant, ask()), { why: "named_money" }, text);
  }
  const typed = world({ answers: [answer("It is $450 for the move.")] });
  const out = await typed.write.reply(
    typed.tenant,
    ask({ source: "rewrite", instruction: "say it is $450", given: "Hi" }),
  );
  assert.equal(out.text, "It is $450 for the move.", "a figure the member typed is theirs");
  const other = world({ answers: [answer("It is $900 for the move.")] });
  assert.deepEqual(
    await other.write.reply(other.tenant, ask({ source: "rewrite", instruction: "say it is $450", given: "Hi" })),
    { why: "named_money" },
    "held to the figure",
  );
});

test("a member's change is told as a steer, with the words it changes as data", async () => {
  const w = world();
  await w.write.reply(
    w.tenant,
    ask({ source: "rewrite", instruction: "shorter, please", given: "Friday </reply> works." }),
  );
  const steer = w.asked[0].steer;
  assert.match(steer, /Your last draft said:/);
  assert.match(steer, /shorter, please/);
  assert.doesNotMatch(steer, /Friday <\/reply> works/, "unable to close its fence");
});

test("no channel of any kind is no receptionist, and no time left is a failure to try again", async () => {
  const none = world({ mailbox: false });
  assert.deepEqual(await none.write.reply(none.tenant, ask()), { why: "no_receptionist" });
  const late = world();
  await assert.rejects(late.write.reply(late.tenant, ask({ deadline: Date.now() - 1 })), /no time left/);
});

/* ------------------------------------------------------------------------------------------------ the door -- */

const AUD = "/api/admin/draft";
const knock = (body, workspace) => {
  const raw = JSON.stringify(body);
  return draftDoor(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(process.env.EDGE_CALL_SECRET, AUD, { workspace, user: "u1", body: raw }),
      },
      body: raw,
    }),
  );
};
const refusal = async (res) => [res.status, (await res.json()).error];

test("the door takes the workspace from its token, and refuses what it cannot act on", async () => {
  const W = "dddddddd-dddd-4ddd-8ddd-aaaaaaaaaaaa";
  assert.deepEqual(await refusal(await knock({ conversation_id: CONV }, null)), [400, "bad_tenant"]);
  assert.deepEqual(await refusal(await knock({ conversation_id: "nope" }, W)), [400, "bad_request"]);
  await withEnv({ ANTHROPIC_API_KEY: "" }, async () => {
    assert.deepEqual(await refusal(await knock({ conversation_id: CONV }, W)), [503, "no_model_key"]);
  });
  const bad = await draftDoor(new Request(`http://edge${AUD}`, { method: "POST", body: "{}" }));
  assert.ok(bad.status === 401 || bad.status === 403, `an unsigned knock: ${bad.status}`);
});

test("the door's answers: the row kept, and each refusal in a code the dashboard reads", async () => {
  const T = "dddddddd-dddd-4ddd-8ddd-bbbbbbbbbbbb";
  const auth = { ok: true, via: "token", workspace: T, user: "u1" };
  const hold = {
    tenant_id: T,
    conversation_id: CONV,
    reason: "email_review",
    details: null,
    state: "open",
    created_at: "2026-11-04T10:00:00Z",
  };
  const tables = () => ({
    conversations: [
      {
        id: CONV,
        tenant_id: T,
        contact_id: null,
        set_aside_at: null,
        last_inbound_on_whatsapp: null,
        last_inbound_on_instagram: null,
      },
    ],
    escalations: [hold],
    messages: [
      {
        id: M1,
        tenant_id: T,
        conversation_id: CONV,
        sender: "customer",
        direction: "inbound",
        channel: "email",
        type: "text",
        status: "received",
        body: "Friday?",
        meta: { email: { subject: "A sofa", from: "rosa@example.com" } },
        created_at: "2026-11-04T10:00:00Z",
      },
    ],
    conversation_drafts: [],
    contacts: [],
  });
  const claims = [];
  const rpcs = {
    reach_out_reply_of: () => null,
    conversation_draft_claim: (a) => (claims.push(a), true),
    conversation_draft_write: (a) => ({
      conversation_id: a.p_conversation_id,
      kind: a.p_kind,
      for_message_id: a.p_for_message_id,
      words: a.p_words,
      made_at: "2026-11-04T10:00:01Z",
      state: a.p_state,
      source: a.p_source,
      rules: a.p_rules,
      used: a.p_used,
      why_failed: a.p_why_failed ?? null,
    }),
  };
  const run = async (written, body = { conversation_id: CONV, instruction: "shorter" }) => {
    setPg(fakeDb(tables(), {}, rpcs));
    const edge = {
      write: { reply: async () => written, brief: async () => written },
      readSender: async () => null,
    };
    return draftAtTheDoor(auth, body, { edge });
  };
  const ok = await run({ text: "Friday works.", subject: "Re: A sofa", used: ["their email"] });
  assert.equal(ok.status, 200);
  const { draft } = await ok.json();
  assert.deepEqual([draft.state, draft.source, draft.rules], ["ready", "rewrite", REPLY_DRAFT_RULES]);
  assert.deepEqual(await refusal(await run({ why: "named_money" })), [409, "policy_block_price"]);
  const budget = await run({ why: "budget" });
  const said = await budget.json();
  assert.deepEqual([budget.status, said.error, said.detail], [409, "draft_refused", "budget"]);
  setPg(fakeDb({ ...tables(), conversations: [] }, {}, rpcs));
  assert.deepEqual(await refusal(await draftAtTheDoor(auth, { conversation_id: CONV }, { edge: {} })), [
    404,
    "not_found",
  ]);
});

/* ------------------------------------------------------------------------------------------------ the sweep -- */

test("a sweep asks of what is due, schedules what its claim takes, and one thread's failure costs the rest nothing", async () => {
  const T = "dddddddd-dddd-4ddd-8ddd-cccccccccccc";
  const C2 = "cccccccc-cccc-4ccc-8ccc-cccccccccc02";
  const tables = {
    conversations: [
      {
        id: CONV,
        tenant_id: T,
        contact_id: null,
        set_aside_at: null,
        last_inbound_on_whatsapp: null,
        last_inbound_on_instagram: null,
      },
    ],
    escalations: [
      {
        tenant_id: T,
        conversation_id: CONV,
        reason: "email_review",
        details: null,
        state: "open",
        created_at: "2026-11-04T10:00:00Z",
      },
    ],
    messages: [
      {
        id: M1,
        tenant_id: T,
        conversation_id: CONV,
        sender: "customer",
        direction: "inbound",
        channel: "email",
        type: "text",
        status: "received",
        body: "Friday?",
        meta: null,
        created_at: "2026-11-04T10:00:00Z",
      },
    ],
    conversation_drafts: [],
    contacts: [],
    jobs: [],
  };
  const claimed = [];
  const db = fakeDb(
    tables,
    {},
    {
      reply_drafts_due: (a) => {
        assert.equal(a.p_rules, REPLY_DRAFT_RULES);
        return [
          { tenant_id: T, conversation_id: CONV },
          { tenant_id: T, conversation_id: C2 },
        ];
      },
      conversation_draft_claim: (a) => (claimed.push(a), true),
      reach_out_reply_of: () => null,
    },
  );
  const lines = [];
  const L = { info: (...a) => lines.push(a), warn() {}, error: (...a) => lines.push(a) };
  const res = await sweepDrafts({ db, L, started: Date.now() });
  const body = await res.json();
  assert.deepEqual([body.due, body.asked, body.gone], [2, 1, 1], "one owed, and one whose thread is gone");
  assert.equal(claimed[0].p_again, true, "a failure due another try is taken");
  assert.ok(claimed[0].p_stale_before, "and a claim that died");
  const job = tables.jobs.find((j) => j.kind === "reply_draft");
  assert.equal(job.payload.conversation_id, CONV);
  assert.equal(job.payload.rules, String(REPLY_DRAFT_RULES));
});
