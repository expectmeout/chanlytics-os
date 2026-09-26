/**
 * The reach-out clock, run: POST /api/cron/reach-out over a database in memory (Reach out, Part 3). Each step, each
 * outcome: a queued send reads its email's fate once; a claim left mid-way is adopted or freed; a closed run's sends
 * are skipped; a stale one is planned again (and, after two weeks without room, given up); a run with nothing open
 * finishes. Then the sender (PR 6): a due send is claimed and becomes one email and one job; the lane refuses without
 * its secrets; the month's allowance holds; a refused person or request skips; a step's send answers its lead's email
 * before; a claim left mid-way is written again as the same email.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, refusedAtTheDoor, vault, withEnv } from "./_cron-doors-world.mjs";

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/reach-out.ts"));
const { sendMessageId } = await import(at("packages/core/src/campaigns/reach-out-ids.ts"));
const { checkedWordsOf } = await import(at("apps/edge/lib/reach-out/request.ts"));
const { emailWordsOf } = await import("@chanlytics/db");
const { parseTenantConfig } = await import("@chanlytics/contracts");
after(() => setPg(null));

const MIN = 60_000;
const DAY = 86_400_000;
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROOT = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const DOM = "33333333-3333-4333-8333-333333333333";
const TPL = "44444444-aaaa-4aaa-8aaa-444444444444";
/** The cold lane, set: what the sender needs to write an email (sender.ts coldLane). Made-up values. */
const LANE = {
  RESEND_API_KEY: "platform-key-for-this-file",
  RESEND_COLD_API_KEY: "cold-key-for-this-file",
  RESEND_COLD_WEBHOOK_SECRET: "cold-webhook-for-this-file",
  UNSUBSCRIBE_SECRET: "unsubscribe-seal-for-this-file",
  EMAIL_DOMAIN: "mail.chanlytics.com",
};
/** The lane unset: every variable it reads, absent. The clock's steps run without it. */
const NO_LANE = Object.fromEntries(Object.keys(LANE).map((k) => [k, undefined]));
/** A profile the parser takes (contracts parseTenantConfig), with the address the foot names. */
const CONFIG = (address = "100 Example St, Austin, TX 78701") => ({
  brain: {
    business_name: "Harbor Moving Co",
    system_prompt: "You answer for Harbor Moving Co, a moving company in Austin, Texas.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { address },
  },
});
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();

let n = 0;
/**
 * A send as reach_out_sends holds one, in a run that goes ahead on a running chain, checked (Part 4: the claim takes a
 * checked send only). Its checked_words are stamped from its step's words as the world holds them, before each tick,
 * unless a case names its own.
 */
const send = (over = {}) => {
  n += 1;
  return {
    id: `send-${n}`,
    tenant_id: T,
    broadcast_id: RUN,
    playbook_id: ROOT,
    root_id: ROOT,
    lead_id: `lead-${n}`,
    contact_id: null,
    domain_id: DOM,
    message_id: null,
    send_at: ago(MIN),
    state: "planned",
    reason: null,
    attempts: 0,
    claimed_at: null,
    sent_at: null,
    created_at: ago(DAY),
    updated_at: ago(DAY),
    checked_at: ago(2 * MIN),
    check_gen: 0,
    opening: null,
    included_for: [],
    ...over,
  };
};
const email = (id, status, over = {}) => ({
  id,
  tenant_id: T,
  channel: "email",
  direction: "outbound",
  status,
  error: null,
  meta: {},
  created_at: ago(10 * MIN),
  ...over,
});

/** 00186's reads over the tables, as the SQL makes them (its limits and its filters are proved on a stack). */
function clockReads(t) {
  const runOf = (s) => t.broadcasts.find((b) => b.id === s.broadcast_id);
  const running = (id) => t.playbooks.some((p) => p.id === id && p.state === "running");
  const emailOf = (s) => (s.message_id ? t.messages.find((m) => m.id === s.message_id) : null);
  return {
    reach_out_queued_outcomes: () =>
      t.reach_out_sends
        .filter((s) => s.state === "queued")
        .map((s) => {
          const m = emailOf(s);
          return {
            send: { ...s },
            status: m?.status ?? null,
            error: m?.error ?? null,
            sent_at: m?.meta?.status_at?.sent ?? null,
            written_at: m?.created_at ?? null,
          };
        }),
    reach_out_stale_sends: (a) =>
      t.reach_out_sends
        .filter(
          (s) =>
            s.state === "planned" &&
            s.send_at <= a.p_before &&
            ["scheduled", "sending"].includes(runOf(s)?.state) &&
            running(s.playbook_id) &&
            running(s.root_id),
        )
        .map((s) => ({ ...s })),
    reach_out_closed_sends: (a) =>
      t.reach_out_sends
        .filter(
          (s) =>
            ["canceled", "failed"].includes(runOf(s)?.state) &&
            (["planned", "held", "queued"].includes(s.state) ||
              (s.state === "claimed" && s.claimed_at < a.p_stuck_before)),
        )
        .map((s) => ({ send: { ...s }, email_status: emailOf(s)?.status ?? null })),
    reach_out_finishable: () =>
      t.broadcasts
        .filter(
          (b) =>
            b.audience?.kind === "reach_out" &&
            ["scheduled", "sending"].includes(b.state) &&
            !t.reach_out_sends.some(
              (s) => s.broadcast_id === b.id && ["planned", "held", "claimed", "queued"].includes(s.state),
            ),
        )
        .map((b) => b.id),
    // 00197: a hold, fourteen days from when its send was planned.
    reach_out_held_stale: (a) =>
      t.reach_out_sends
        .filter((s) => s.state === "held" && s.created_at < a.p_before)
        .sort((x, y) => (x.created_at < y.created_at ? -1 : 1))
        .map((s) => ({ ...s })),
  };
}

/**
 * The sender's doors over the tables, as 00184 and 00187 make them (their SQL is proved on a stack,
 * reach-out-sender.db.test.mjs): the domains with sends due (clean, verified, longest waiting first, past the ones the
 * sender skips), the month's count, the claim (on a verified domain, within its share), and the person made once.
 * `failClaim` names the domains whose claim the database refuses.
 */
function senderReads(t, { monthSent = 0, failClaim = [] } = {}) {
  const runOf = (s) => t.broadcasts.find((b) => b.id === s.broadcast_id);
  const running = (id) => t.playbooks.some((p) => p.id === id && p.state === "running");
  // 00197: a checked send only.
  const due = (s, at) =>
    s.state === "planned" &&
    s.checked_at != null &&
    s.send_at <= at &&
    ["scheduled", "sending"].includes(runOf(s)?.state) &&
    running(s.playbook_id) &&
    running(s.root_id);
  return {
    reach_out_due_domains: (a) => {
      const first = (d) =>
        t.reach_out_sends
          .filter((s) => s.domain_id === d.id && due(s, a.p_at))
          .map((s) => s.send_at)
          .sort()[0];
      return t.sending_domains
        .filter(
          (d) =>
            d.state === "verified" &&
            d.clean_since &&
            first(d) &&
            (!a.p_tenant_id || d.tenant_id === a.p_tenant_id) &&
            !(a.p_skip_tenants ?? []).includes(d.tenant_id) &&
            !(a.p_skip_domains ?? []).includes(d.id),
        )
        .sort((x, y) => (first(x) < first(y) ? -1 : first(x) > first(y) ? 1 : 0))
        .slice(0, a.p_limit)
        .map((d) => ({ id: d.id, tenant_id: d.tenant_id }));
    },
    reach_out_month_sent: () => monthSent,
    reach_out_claim: (a) => {
      if (failClaim.includes(a.p_domain_id)) throw new Error("canceling statement due to lock timeout");
      if (!t.sending_domains.some((d) => d.id === a.p_domain_id && d.state === "verified")) return [];
      const picked = t.reach_out_sends
        .filter((s) => s.domain_id === a.p_domain_id && due(s, a.p_at))
        .sort((x, y) => (x.send_at < y.send_at ? -1 : 1))
        .slice(0, Math.min(a.p_limit, a.p_cap));
      for (const s of picked) Object.assign(s, { state: "claimed", claimed_at: a.p_at });
      return picked.map((s) => ({ ...s }));
    },
    reach_out_person: (a) => {
      const lead = t.leads.find((l) => l.id === a.p_lead_id && l.tenant_id === a.p_tenant_id);
      if (!lead) return { refused: "lead_gone" };
      if (!["ready", "nurture"].includes(lead.stage)) return { refused: "lead_closed" };
      const email = lead.email?.trim().toLowerCase();
      if (!email) return { refused: "no_address" };
      let made = false;
      if (!lead.contact_id) {
        if (t.contacts.some((c) => c.tenant_id === a.p_tenant_id && c.email === email))
          return { refused: "already_yours" };
        const id = crypto.randomUUID();
        t.contacts.push({ id, tenant_id: a.p_tenant_id, email });
        lead.contact_id = id;
        made = true;
      }
      let thread = t.conversations.find((c) => c.tenant_id === a.p_tenant_id && c.contact_id === lead.contact_id);
      if (!thread) {
        thread = { id: crypto.randomUUID(), tenant_id: a.p_tenant_id, contact_id: lead.contact_id };
        t.conversations.push(thread);
      }
      return { contact_id: lead.contact_id, conversation_id: thread.id, made };
    },
  };
}

function world({
  sends = [],
  messages = [],
  runs = null,
  playbooks = null,
  domains = null,
  leads = [],
  contacts = [],
  conversations = [],
  jobs = [],
  templates = null,
  config = CONFIG(),
  monthSent = 0,
  failClaim = [],
} = {}) {
  const leadIds = [...new Set(sends.map((s) => s.lead_id))].filter((id) => !leads.some((l) => l.id === id));
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving Co", timezone: "America/Chicago" }],
    tenant_config: [{ tenant_id: T, config }],
    mailboxes: [{ id: "mb-1", tenant_id: T, local_part: "harbor", reply_token: "abcdefghijklmnopqrstuvwx" }],
    templates: templates ?? [
      {
        id: TPL,
        tenant_id: T,
        channel: "email",
        body_preview: null,
        components: [
          { type: "HEADER", format: "TEXT", text: "A quote for {{business}}" },
          { type: "BODY", text: "Hi {{business}}, movers in {{city}} ask us for this." },
        ],
      },
    ],
    playbooks: playbooks ?? [
      {
        id: ROOT,
        tenant_id: T,
        kind: "reach_out",
        state: "running",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
    ],
    broadcasts: runs ?? [
      {
        id: RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out", root_id: ROOT },
        updated_at: ago(DAY),
      },
    ],
    reach_out_sends: sends,
    messages,
    leads: [
      ...leads,
      ...leadIds.map((id) => ({
        id,
        tenant_id: T,
        stage: "ready",
        version: 1,
        contacted_at: null,
        region: "TX",
        hours: [],
        business_name: `Fixture Movers ${id}`,
        city: "Austin",
        email: `owner-${id}@fixture-movers.example`,
        contact_id: null,
      })),
    ],
    contacts,
    conversations,
    jobs,
    sending_domains: domains ?? [
      {
        id: DOM,
        tenant_id: T,
        state: "verified",
        host: "getharbor.example",
        from_local: "sam",
        from_name: "Sam at Harbor",
        clean_since: ago(20 * DAY),
        sent_days: 0,
      },
    ],
    events: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...vault,
      ...senderReads(tables, { monthSent, failClaim }),
      sending_domain_capacity: () => ({
        state: "verified",
        clean_since: ago(20 * DAY),
        sent_days: 0,
        used: 0,
        recent: [],
        last_sent_at: null,
      }),
      ...clockReads(tables),
    },
    { unique: ["messages"] },
  );
  setPg(db);
  const row = (id) => tables.reach_out_sends.find((s) => s.id === id);
  /** Each send's checked_words, as the check stamps them: its step's words, its chain's name, whether a link exists. */
  const stamp = async () => {
    const link = !!parseTenantConfig(config)?.brain?.booking_link;
    for (const s of tables.reach_out_sends) {
      if (s.checked_words !== undefined) continue;
      const step = tables.playbooks.find((p) => p.id === s.playbook_id);
      const root = tables.playbooks.find((p) => p.id === s.root_id);
      const words = step ? await emailWordsOf(db, s.tenant_id, step.template_id) : null;
      s.checked_words = words ? checkedWordsOf(words, root?.signed_by ?? null, link) : null;
    }
  };
  return {
    tables,
    row,
    /** One tick with the lane unset, as the clock's own steps are proved. */
    tick: async () => {
      await stamp();
      return withEnv(NO_LANE, async () => answer(await knock(POST, "reach-out")));
    },
    /** One tick with the lane set: the clock's steps, then the claim. */
    send: async (env = {}) => {
      await stamp();
      return withEnv({ ...LANE, ...env }, async () => answer(await knock(POST, "reach-out")));
    },
  };
}

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "reach-out", setPg);
});

test("reconcile: each queued send reads what became of its email, once", async () => {
  const sentAt = ago(5 * MIN);
  const s = {
    sent: send({ state: "queued", message_id: "m-sent" }),
    unknown: send({ state: "queued", message_id: "m-unknown" }),
    bounced: send({ state: "queued", message_id: "m-bounced" }),
    failed: send({ state: "queued", message_id: "m-failed" }),
    atCap: send({ state: "queued", message_id: "m-cap", attempts: 1 }),
    wrote: send({ state: "queued", message_id: "m-wrote" }),
    noDomain: send({ state: "queued", message_id: "m-nodomain" }),
    erased: send({ state: "queued", message_id: "m-gone" }),
    waiting: send({ state: "queued", message_id: "m-queued" }),
    delivered: send({ state: "queued", message_id: "m-delivered" }),
    limited: send({ state: "queued", message_id: "m-429" }),
    neverSent: send({ state: "queued", message_id: "m-never" }),
    orphan: send({ state: "queued", message_id: "m-orphan" }),
    oldUnknown: send({ state: "queued", message_id: "m-old-unknown" }),
    paused: send({ state: "queued", message_id: "m-paused" }),
  };
  const w = world({
    sends: Object.values(s),
    messages: [
      email("m-sent", "sent", { meta: { status_at: { sent: sentAt } } }),
      email("m-unknown", "failed", { error: { outcome: "unknown", http_status: 0 } }),
      email("m-bounced", "failed", { error: { provider: "bounced" } }),
      email("m-failed", "failed", { error: { http_status: 422 } }),
      email("m-cap", "canceled", { error: { reason: "sending_domain_at_cap" } }),
      email("m-wrote", "canceled", { error: { reason: "outreach_wrote_back" } }),
      email("m-nodomain", "canceled", { error: { reason: "outreach_needs_own_domain" } }),
      email("m-queued", "queued"),
      email("m-delivered", "delivered", { meta: { status_at: { sent: sentAt } } }),
      email("m-429", "failed", { error: { http_status: 429, body: "rate_limit_exceeded" } }),
      email("m-never", "failed", { error: { reason: "never_delivered" } }),
      email("m-orphan", "failed", { error: { reason: "orphaned" } }),
      email("m-old-unknown", "failed", {
        error: { outcome: "unknown", reason: "run_interrupted" },
        created_at: ago(25 * 60 * MIN),
      }),
      email("m-paused", "canceled", { error: { reason: "paused" } }),
    ],
  });
  const [status, body] = await w.tick();
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const got = (k) => w.row(s[k].id);
  assert.deepEqual([got("sent").state, got("sent").sent_at], ["sent", sentAt], "sent, when it left");
  const lead = w.tables.leads.find((l) => l.id === s.sent.lead_id);
  assert.deepEqual(
    [lead.stage, lead.last_outcome, lead.version, lead.contacted_at],
    ["nurture", "emailed", 2, sentAt],
    "its lead is written to",
  );
  assert.deepEqual(
    w.tables.events.filter((e) => e.kind === "lead.emailed").map((e) => [e.subject_id, e.data.send_id]),
    [
      [s.sent.lead_id, s.sent.id],
      [s.delivered.lead_id, s.delivered.id],
    ],
  );
  assert.equal(got("unknown").state, "queued", "its receipt settles it");
  assert.deepEqual([got("bounced").state, got("bounced").reason], ["failed", "bounced"]);
  assert.deepEqual([got("failed").state, got("failed").reason], ["failed", "send_failed"]);
  // A wait is planned again, never lost; its email was written, so its next is a new one (attempts moves on).
  // (The rows are the tables' own, moved in place: the numbers they started at are 1 and 0.)
  for (const [k, next] of [
    ["atCap", 2],
    ["noDomain", 1],
  ]) {
    const r = got(k);
    assert.equal(r.state, "planned", k);
    assert.equal(r.message_id, null, k);
    assert.equal(r.attempts, next, k);
    assert.ok(Date.parse(r.send_at) > Date.now(), `${k}: a new moment ahead`);
    assert.equal(r.domain_id, DOM, k);
  }
  assert.deepEqual([got("wrote").state, got("wrote").reason], ["skipped", "outreach_wrote_back"]);
  assert.deepEqual([got("erased").state, got("erased").reason], ["skipped", "erased"]);
  assert.equal(got("waiting").state, "queued", "its job has not run yet");
  assert.equal(got("delivered").state, "sent", "delivered is left, and more");
  // Never left: the provider's limit, a job that died before it, a row no job ever took. Another try costs nothing.
  for (const k of ["limited", "neverSent", "orphan", "paused"]) {
    assert.equal(got(k).state, "planned", k);
    assert.equal(got(k).attempts, 1, `${k}: its email was written, so its next is a new one`);
  }
  assert.deepEqual(
    [got("oldUnknown").state, got("oldUnknown").reason],
    ["failed", "outcome_unknown"],
    "a day with no receipt: it may have gone, so no second email and no nudge",
  );
  // Five settled here; the two waits are counted where they are planned again.
  assert.deepEqual([body.reconciled, body.sent, body.failed, body.skipped, body.replanned], [7, 2, 3, 2, 6]);
  // A second tick moves nothing that the first did.
  const before = JSON.stringify(w.tables.reach_out_sends);
  await w.tick();
  assert.equal(
    JSON.parse(before).filter((r) => r.state !== "planned").length,
    w.tables.reach_out_sends.filter((r) => r.state !== "planned").length,
  );
});

test("unstick: a claim left mid-way is its email's when the email was written, and planned again when it was not", async () => {
  const written = send({ state: "claimed", claimed_at: ago(11 * MIN), attempts: 2 });
  const unwritten = send({ state: "claimed", claimed_at: ago(11 * MIN), attempts: 2 });
  const fresh = send({ state: "claimed", claimed_at: ago(2 * MIN) });
  const w = world({
    sends: [written, unwritten, fresh],
    messages: [email(await sendMessageId(written.id, 2), "queued")],
  });
  const [, body] = await w.tick();
  assert.deepEqual(
    [w.row(written.id).state, w.row(written.id).message_id],
    ["queued", await sendMessageId(written.id, 2)],
    "adopted: the email goes on as its send",
  );
  assert.deepEqual(
    [w.row(unwritten.id).state, w.row(unwritten.id).attempts, w.row(unwritten.id).claimed_at],
    ["planned", 2, null],
    "planned again, keeping its number: its next email is the one it never wrote",
  );
  assert.equal(w.row(fresh.id).state, "claimed", "a writer may still be at it");
  assert.equal(body.adopted, 1);
});

test("close: a canceled or failed run's open sends are skipped; a waiting run's are its owner's", async () => {
  const CANCELED = "44444444-4444-4444-8444-444444444444";
  const WAITING = "55555555-5555-4555-8555-555555555555";
  const a = send({ broadcast_id: CANCELED, send_at: ahead(DAY) });
  const b = send({ broadcast_id: CANCELED, state: "claimed", claimed_at: ago(11 * MIN) });
  const c = send({ broadcast_id: WAITING, send_at: ago(3 * 60 * MIN) });
  const young = send({ broadcast_id: CANCELED, state: "claimed", claimed_at: ago(MIN) });
  const q = send({ broadcast_id: CANCELED, state: "queued", message_id: "m-canceled-run" });
  const w = world({
    sends: [a, b, c, young, q],
    messages: [email("m-canceled-run", "queued"), email(await sendMessageId(b.id, 0), "queued")],
    runs: [
      {
        id: CANCELED,
        tenant_id: T,
        state: "canceled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
      {
        id: WAITING,
        tenant_id: T,
        state: "pending_approval",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
    ],
  });
  const [, body] = await w.tick();
  assert.deepEqual([w.row(a.id).state, w.row(a.id).reason], ["skipped", "run_canceled"]);
  // A stuck claim whose email was written is adopted first (queued), then its email withdrawn with the rest.
  assert.deepEqual([w.row(b.id).state, w.row(b.id).message_id], ["queued", await sendMessageId(b.id, 0)]);
  assert.deepEqual([w.row(c.id).state, w.row(c.id).send_at], ["planned", c.send_at], "a waiting run keeps its sends");
  assert.equal(w.row(young.id).state, "claimed", "a claim a writer may still hold is its writer's");
  const withdrawn = (id) => w.tables.messages.find((m) => m.id === id);
  assert.deepEqual(
    [withdrawn("m-canceled-run").status, withdrawn("m-canceled-run").error.reason],
    ["canceled", "run_canceled"],
    "a queued email of a canceled run is withdrawn: its job sends nothing",
  );
  assert.equal(withdrawn(await sendMessageId(b.id, 0)).status, "canceled", "and a stuck claim's email too");
  assert.deepEqual([body.closed, body.adopted, body.withdrawn], [1, 1, 2]);
  // The next tick reads the withdrawn email and skips its send.
  await w.tick();
  for (const id of [q.id, b.id]) assert.deepEqual([w.row(id).state, w.row(id).reason], ["skipped", "run_canceled"], id);
});

test("restale: a send left long past its time in a run that goes ahead is planned again from now; a due one, a paused chain's or a waiting run's is not", async () => {
  const stale = send({ send_at: ago(20 * MIN) });
  const due = send({ send_at: ago(5 * MIN) });
  const PAUSED = "66666666-6666-4666-8666-666666666666";
  const PAUSED_RUN = "77777777-7777-4777-8777-777777777777";
  const paused = send({ send_at: ago(3 * 60 * MIN), broadcast_id: PAUSED_RUN, playbook_id: PAUSED, root_id: PAUSED });
  const w = world({
    sends: [stale, due, paused],
    playbooks: [
      { id: ROOT, tenant_id: T, kind: "reach_out", state: "running", gap_minutes: 12, domain_ids: [] },
      { id: PAUSED, tenant_id: T, kind: "reach_out", state: "paused", gap_minutes: 12, domain_ids: [] },
    ],
    runs: [
      {
        id: RUN,
        tenant_id: T,
        state: "sending",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: PAUSED_RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: PAUSED,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
    ],
  });
  const [, body] = await w.tick();
  const r = w.row(stale.id);
  assert.equal(r.state, "planned");
  assert.ok(Date.parse(r.send_at) > Date.now() - MIN, "from now");
  assert.equal(r.attempts, 0, "no email was written: its number keeps");
  assert.equal(w.row(due.id).send_at, due.send_at, "due, not left: the claim's");
  assert.equal(w.row(paused.id).send_at, paused.send_at, "a paused chain keeps its sends until it resumes");
  assert.equal(body.replanned, 1);
});

test("a send with no room tries again tomorrow; after two weeks waiting it is given up, and says why", async () => {
  const young = send({ send_at: ago(20 * MIN), created_at: ago(DAY) });
  const old = send({ send_at: ago(20 * MIN), created_at: ago(15 * DAY) });
  // No verified domain: nowhere to go.
  const w = world({ sends: [young, old], domains: [{ id: DOM, tenant_id: T, state: "held" }] });
  const [, body] = await w.tick();
  const y = w.row(young.id);
  assert.equal(y.state, "planned");
  assert.ok(Date.parse(y.send_at) > Date.now() + DAY - 5 * MIN, "tomorrow");
  assert.equal(y.domain_id, null, "no domain: only the timetable places it, in its lead's hours");
  assert.deepEqual([w.row(old.id).state, w.row(old.id).reason], ["skipped", "kept_waiting"]);
  assert.deepEqual([body.waiting, body.gave_up], [1, 1]);
});

test("finish: a run that goes ahead with nothing left open is sent, through its own moves; one with a send open is not", async () => {
  const DONE = "88888888-8888-4888-8888-888888888888";
  const BUSY = "99999999-9999-4999-8999-999999999999";
  const w = world({
    sends: [
      send({ broadcast_id: DONE, state: "sent", sent_at: ago(MIN) }),
      send({ broadcast_id: DONE, state: "skipped", reason: "outreach_wrote_back" }),
      send({ broadcast_id: BUSY, state: "sent", sent_at: ago(MIN) }),
      send({ broadcast_id: BUSY, send_at: ahead(DAY) }),
    ],
    runs: [
      {
        id: DONE,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: BUSY,
        tenant_id: T,
        state: "sending",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
    ],
  });
  const [, body] = await w.tick();
  const done = w.tables.broadcasts.find((b) => b.id === DONE);
  assert.equal(done.state, "sent");
  assert.ok(done.finished_at, "it says when it finished");
  assert.equal(w.tables.broadcasts.find((b) => b.id === BUSY).state, "sending");
  assert.equal(body.finished, 1);
});

test("a send whose step was removed has nothing to be planned by, and goes no further", async () => {
  const orphan = send({ state: "claimed", claimed_at: ago(11 * MIN), playbook_id: null });
  const w = world({ sends: [orphan] });
  const [status] = await w.tick();
  assert.equal(status, 200, "the clock carries on");
  assert.deepEqual([w.row(orphan.id).state, w.row(orphan.id).reason], ["skipped", "step_removed"]);
});

/* ------------------------------------------------------------- the sender -- */

const STEP = "abababab-abab-4bab-8bab-abababababab";
const STEP_RUN = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const TPL2 = "efefefef-efef-4fef-8fef-efefefefefef";
const jobsOf = (w) => w.tables.jobs.filter((j) => j.kind === "outbound_send");
const emailOf = (w, id) => w.tables.messages.find((m) => m.id === id);

test("the claim: a due send becomes one person, one queued email under its own id, one job, and a run that is sending", async () => {
  const s = send();
  const w = world({ sends: [s] });
  const [status, body] = await w.send();
  assert.equal(status, 200);
  assert.deepEqual(body.claim, {
    claimed: 1,
    written: 1,
    rewritten: 0,
    skipped: 0,
    waited: 0,
    held: 0,
    rechecked: 0,
    gave_up: 0,
    errors: 0,
    month_spent: 0,
    workspaces_held: 0,
  });
  const id = await sendMessageId(s.id, 0);
  const person = w.tables.contacts[0];
  const thread = w.tables.conversations[0];
  assert.deepEqual(
    [w.row(s.id).state, w.row(s.id).message_id, w.row(s.id).contact_id],
    ["queued", id, person.id],
    "queued on its email, with the person made for it",
  );
  const m = emailOf(w, id);
  assert.deepEqual(
    [m.status, m.channel, m.direction, m.sender, m.type, m.conversation_id, m.contact_id],
    ["queued", "email", "outbound", "human", "text", thread.id, person.id],
  );
  assert.equal(m.body, `Hi Fixture Movers ${s.lead_id}, movers in Austin ask us for this.`);
  assert.equal(m.meta.source, "reach_out");
  assert.equal(m.meta.email.subject, `A quote for Fixture Movers ${s.lead_id}`);
  assert.deepEqual(m.meta.email.to, [person.email]);
  assert.equal(m.meta.email.request.idempotency_key, id, "the request is frozen for this row");
  assert.equal(m.meta.email.request.from, `"Sam at Harbor" <sam@getharbor.example>`);
  assert.deepEqual(m.meta.reach_out, {
    send_id: s.id,
    lead_id: s.lead_id,
    contact_id: person.id,
    playbook_id: ROOT,
    root_id: ROOT,
    broadcast_id: RUN,
    attempt: 0,
  });
  const jobs = jobsOf(w);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].payload, {
    message_id: id,
    conversation_id: thread.id,
    to_email: person.email,
    purpose: "outreach",
    proactive: true,
  });
  assert.ok(Math.abs(Date.parse(jobs[0].due_at) - Date.now()) < MIN, "due now");
  assert.equal(w.tables.broadcasts[0].state, "sending");
  // The next tick finds its email still queued for its job: nothing more is written.
  const [, again] = await w.send();
  assert.equal(again.claim.claimed, 0);
  assert.equal(w.tables.messages.length, 1);
  assert.equal(jobsOf(w).length, 1);
});

test("the lane: without a secret nothing is claimed, and a send due says what is missing (503); nothing due is a 200", async () => {
  const s = send();
  const w = world({ sends: [s] });
  const [status, body] = await w.send({ UNSUBSCRIBE_SECRET: undefined });
  assert.deepEqual([status, body.error, body.missing], [503, "cold_lane_unset", ["UNSUBSCRIBE_SECRET"]]);
  assert.equal(w.row(s.id).state, "planned", "nothing claimed");
  assert.equal(w.tables.messages.length, 0);
  const [, all] = await w.tick();
  assert.deepEqual(all.missing, [
    "RESEND_API_KEY",
    "RESEND_COLD_API_KEY",
    "RESEND_COLD_WEBHOOK_SECRET",
    "UNSUBSCRIBE_SECRET",
    "EMAIL_DOMAIN",
  ]);
  const idle = world({ sends: [send({ send_at: ahead(DAY) })] });
  const [quiet, said] = await idle.send({ RESEND_COLD_API_KEY: undefined });
  assert.equal(quiet, 200, "no send due: nothing to say yet");
  assert.deepEqual(said.lane_missing, ["RESEND_COLD_API_KEY"]);
});

test("the month: a workspace at its allowance claims nothing; one with three left claims three at most", async () => {
  const spent = world({ sends: [send()], monthSent: 2000 });
  const [, body] = await spent.send();
  assert.deepEqual([body.claim.claimed, body.claim.month_spent], [0, 1]);
  assert.equal(spent.tables.reach_out_sends[0].state, "planned");

  const five = [1, 2, 3, 4, 5].map((i) => send({ send_at: ago(i * MIN) }));
  const three = world({ sends: five, monthSent: 1997 });
  const [, b3] = await three.send();
  assert.deepEqual([b3.claim.claimed, b3.claim.written], [3, 3]);
  assert.equal(three.tables.reach_out_sends.filter((r) => r.state === "queued").length, 3);
  assert.equal(three.tables.reach_out_sends.filter((r) => r.state === "planned").length, 2);
});

test("the person refused: a customer's address, or a lead closed since it was planned, skips the send with why", async () => {
  const mine = send();
  const closed = send();
  const w = world({
    sends: [mine, closed],
    leads: [
      {
        id: mine.lead_id,
        tenant_id: T,
        stage: "ready",
        version: 1,
        business_name: "Fixture Movers",
        city: "Austin",
        email: "customer@fixture-movers.example",
        contact_id: null,
      },
      {
        id: closed.lead_id,
        tenant_id: T,
        stage: "archived",
        version: 1,
        business_name: "Closed Movers",
        city: "Austin",
        email: "closed@fixture-movers.example",
        contact_id: null,
      },
    ],
    contacts: [{ id: "k-customer", tenant_id: T, email: "customer@fixture-movers.example" }],
  });
  const [, body] = await w.send();
  assert.deepEqual([w.row(mine.id).state, w.row(mine.id).reason], ["skipped", "already_yours"]);
  assert.deepEqual([w.row(closed.id).state, w.row(closed.id).reason], ["skipped", "lead_closed"]);
  assert.equal(w.tables.messages.length, 0, "no row is written into a customer's thread");
  assert.equal(body.claim.skipped, 2);
});

test("the step's or the workspace's fault holds its sends, and nobody is made; a lead with no value is skipped alone", async () => {
  // A slot no lead could fill is the step's to fix: the send waits an hour, in its lead's hours, and keeps its place.
  const slot = world({
    sends: [send()],
    templates: [
      {
        id: TPL,
        tenant_id: T,
        channel: "email",
        components: [
          { type: "HEADER", text: "Hello" },
          { type: "BODY", text: "Hi {{first name}}" },
        ],
      },
    ],
  });
  const [, held] = await slot.send();
  const r = slot.tables.reach_out_sends[0];
  assert.deepEqual([r.state, r.reason, r.claimed_at], ["planned", null, null]);
  assert.ok(Date.parse(r.send_at) >= Date.now() + 59 * MIN, "an hour on at the soonest");
  assert.equal(held.claim.held, 1);
  assert.deepEqual(
    [slot.tables.contacts.length, slot.tables.conversations.length],
    [0, 0],
    "nobody is made for an email that cannot be written",
  );

  // No address for the foot, or no mailbox for the replies: the workspace claims nothing, and its sends keep.
  const noAddress = world({ sends: [send()], config: CONFIG("") });
  const noMailbox = world({ sends: [send()] });
  noMailbox.tables.mailboxes.length = 0;
  for (const w of [noAddress, noMailbox]) {
    const [, quiet] = await w.send();
    assert.deepEqual(
      [w.tables.reach_out_sends[0].state, quiet.claim.claimed, quiet.claim.workspaces_held],
      ["planned", 0, 1],
    );
  }

  // A lead with no city, for words that name one: that lead alone is skipped, and the next is written.
  const bare = send();
  const next = send();
  const w = world({
    sends: [bare, next],
    leads: [
      {
        id: bare.lead_id,
        tenant_id: T,
        stage: "ready",
        version: 1,
        business_name: "No City Movers",
        city: null,
        email: "nocity@fixture-movers.example",
        contact_id: null,
      },
    ],
  });
  await w.send();
  assert.deepEqual([w.row(bare.id).state, w.row(bare.id).reason], ["skipped", "missing_value"]);
  assert.equal(w.row(next.id).state, "queued");
  assert.equal(slot.tables.messages.length + noAddress.tables.messages.length + noMailbox.tables.messages.length, 0);
});

/** A chain of two: the root's email to the lead left (sent), and the step's send is due in its own run. */
async function stepWorld({ stamped = true, created = ago(DAY) } = {}) {
  const lead = "lead-step";
  const contact = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
  const first = send({
    lead_id: lead,
    state: "sent",
    sent_at: ago(3 * DAY),
    message_id: "m-first",
    contact_id: contact,
  });
  const nudge = send({
    lead_id: lead,
    broadcast_id: STEP_RUN,
    playbook_id: STEP,
    root_id: ROOT,
    contact_id: contact,
    created_at: created,
  });
  const w = world({
    sends: [first, nudge],
    leads: [
      {
        id: lead,
        tenant_id: T,
        stage: "nurture",
        version: 2,
        business_name: "Fixture Movers",
        city: "Austin",
        email: "owner@fixture-movers.example",
        contact_id: contact,
      },
    ],
    contacts: [{ id: contact, tenant_id: T, email: "owner@fixture-movers.example" }],
    conversations: [{ id: "c-thread", tenant_id: T, contact_id: contact }],
    messages: [
      email("m-first", "delivered", {
        conversation_id: "c-thread",
        meta: {
          source: "reach_out",
          email: {
            subject: "A quote for Fixture Movers",
            ...(stamped ? { message_id: "<first@getharbor.example>" } : {}),
            request: { subject: "A quote for Fixture Movers", headers: {} },
          },
        },
      }),
    ],
    playbooks: [
      {
        id: ROOT,
        tenant_id: T,
        kind: "reach_out",
        state: "running",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
      {
        id: STEP,
        tenant_id: T,
        kind: "reach_out",
        state: "running",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL2,
        after_playbook_id: ROOT,
      },
    ],
    templates: [
      {
        id: TPL2,
        tenant_id: T,
        channel: "email",
        components: [
          { type: "HEADER", text: "A heading a step never uses" },
          { type: "BODY", text: "Just following up, {{business}}." },
        ],
      },
    ],
    runs: [
      {
        id: RUN,
        tenant_id: T,
        state: "sent",
        playbook_id: ROOT,
        audience: { kind: "reach_out", root_id: ROOT },
        updated_at: ago(3 * DAY),
      },
      {
        id: STEP_RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: STEP,
        audience: { kind: "reach_out", root_id: ROOT },
        updated_at: ago(DAY),
      },
    ],
  });
  return { w, nudge };
}

test("a step's send answers its lead's email before (D19): Re: its subject, and its Message-ID in the thread's headers", async () => {
  const { w, nudge } = await stepWorld();
  const [, body] = await w.send();
  assert.equal(body.claim.written, 1);
  const m = emailOf(w, await sendMessageId(nudge.id, 0));
  assert.equal(m.conversation_id, "c-thread", "on the lead's own thread");
  assert.equal(m.meta.email.request.subject, "Re: A quote for Fixture Movers");
  assert.equal(m.meta.email.request.headers["In-Reply-To"], "<first@getharbor.example>");
  assert.equal(m.meta.email.request.headers.References, "<first@getharbor.example>");
  assert.deepEqual([m.meta.email.parent_id, m.meta.email.in_reply_to], ["m-first", "<first@getharbor.example>"]);
  assert.equal(m.body, "Just following up, Fixture Movers.");
});

test("a step's send waits an hour while the email before has no Message-ID; after two weeks it is given up", async () => {
  const { w, nudge } = await stepWorld({ stamped: false });
  const [, body] = await w.send();
  const r = w.row(nudge.id);
  assert.deepEqual([r.state, r.claimed_at], ["planned", null]);
  assert.ok(Date.parse(r.send_at) >= Date.now() + 59 * MIN, "an hour on at the soonest, in its lead's hours");
  assert.equal(body.claim.waited, 1);
  assert.equal(w.tables.contacts.length, 1, "nobody new is made while it waits");
  assert.equal(w.tables.messages.length, 1, "nothing written");

  const old = await stepWorld({ stamped: false, created: ago(15 * DAY) });
  await old.w.send();
  assert.deepEqual([old.w.row(old.nudge.id).state, old.w.row(old.nudge.id).reason], ["skipped", "parent_unstamped"]);
});

test("a claim a tick left mid-way is written again five minutes on, as the same email; its job is scheduled once", async () => {
  // Left before its email: written now, under the id its number names.
  const bare = send({ state: "claimed", claimed_at: ago(6 * MIN), attempts: 2 });
  // Left after its email and its job: its email is the one it wrote, and no second job.
  const wrote = send({ state: "claimed", claimed_at: ago(6 * MIN) });
  // Left after its email, before its job: the job, once.
  const nojob = send({ state: "claimed", claimed_at: ago(6 * MIN) });
  const young = send({ state: "claimed", claimed_at: ago(MIN) });
  const [wroteId, nojobId] = [await sendMessageId(wrote.id, 0), await sendMessageId(nojob.id, 0)];
  const w = world({
    sends: [bare, wrote, nojob, young],
    conversations: [{ id: "c-old", tenant_id: T, contact_id: "k-old" }],
    messages: [
      email(wroteId, "queued", {
        conversation_id: "c-old",
        meta: { email: { request: { to: ["was@fixture.example"] } } },
      }),
      email(nojobId, "queued", {
        conversation_id: "c-old",
        meta: { email: { request: { to: ["was@fixture.example"] } } },
      }),
    ],
    jobs: [{ id: "j-1", tenant_id: T, kind: "outbound_send", state: "scheduled", payload: { message_id: wroteId } }],
  });
  const [, body] = await w.send();
  assert.equal(body.claim.rewritten, 3);
  const bareId = await sendMessageId(bare.id, 2);
  assert.deepEqual([w.row(bare.id).state, w.row(bare.id).message_id], ["queued", bareId]);
  assert.ok(emailOf(w, bareId), "its email, under the id its number names");
  for (const [s, id] of [
    [wrote, wroteId],
    [nojob, nojobId],
  ]) {
    assert.deepEqual([w.row(s.id).state, w.row(s.id).message_id], ["queued", id]);
    assert.equal(w.tables.messages.filter((m) => m.id === id).length, 1, "the same email, never a second");
  }
  const jobs = jobsOf(w);
  assert.equal(jobs.filter((j) => j.payload.message_id === wroteId).length, 1, "its job, once");
  const nj = jobs.filter((j) => j.payload.message_id === nojobId);
  assert.equal(nj.length, 1);
  assert.deepEqual(
    [nj[0].payload.conversation_id, nj[0].payload.to_email],
    ["c-old", "was@fixture.example"],
    "the job sends the email as it was frozen",
  );
  assert.equal(w.row(young.id).state, "claimed", "a claim a writer may still hold is its writer's");
});

test("after the claim, before the email: a run closed since skips the send; a chain paused since keeps it planned", async () => {
  const CLOSED = "12121212-1212-4212-8212-121212121212";
  const shut = send({ state: "claimed", claimed_at: ago(6 * MIN), broadcast_id: CLOSED });
  const PAUSED = "34343434-3434-4434-8434-343434343434";
  const held = send({ state: "claimed", claimed_at: ago(6 * MIN), playbook_id: PAUSED, root_id: PAUSED });
  const w = world({
    sends: [shut, held],
    playbooks: [
      {
        id: ROOT,
        tenant_id: T,
        kind: "reach_out",
        state: "running",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
      {
        id: PAUSED,
        tenant_id: T,
        kind: "reach_out",
        state: "paused",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
    ],
    runs: [
      {
        id: RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: CLOSED,
        tenant_id: T,
        state: "canceled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
    ],
  });
  await w.send();
  assert.deepEqual([w.row(shut.id).state, w.row(shut.id).reason], ["skipped", "run_canceled"]);
  assert.deepEqual(
    [w.row(held.id).state, w.row(held.id).claimed_at, w.row(held.id).send_at],
    ["planned", null, held.send_at],
  );
  assert.equal(w.tables.messages.length, 0);
});

test("a claim whose email a dead tick wrote is that email's, whatever changed since; a closed run's queued one is withdrawn first", async () => {
  const CLOSED = "56565656-5656-4656-8656-565656565656";
  const PAUSED = "78787878-7878-4878-8878-787878787878";
  // Its email left, then the owner canceled the run: the send is the email's, and the clock reads it sent.
  const left = send({ state: "claimed", claimed_at: ago(6 * MIN), broadcast_id: CLOSED });
  // Still queued when the run was canceled: withdrawn, so its job sends nothing.
  const queued = send({ state: "claimed", claimed_at: ago(6 * MIN), broadcast_id: CLOSED });
  // Queued when its chain was paused: it goes on, as a paused chain's queued email does.
  const paused = send({ state: "claimed", claimed_at: ago(6 * MIN), playbook_id: PAUSED, root_id: PAUSED });
  const [leftId, queuedId, pausedId] = [
    await sendMessageId(left.id, 0),
    await sendMessageId(queued.id, 0),
    await sendMessageId(paused.id, 0),
  ];
  const frozen = { email: { request: { to: ["was@fixture-movers.example"] } } };
  const w = world({
    sends: [left, queued, paused],
    messages: [
      email(leftId, "sent", { meta: { ...frozen, status_at: { sent: ago(5 * MIN) } } }),
      email(queuedId, "queued", { meta: frozen }),
      email(pausedId, "queued", { meta: frozen }),
    ],
    jobs: [{ id: "j-p", tenant_id: T, kind: "outbound_send", state: "scheduled", payload: { message_id: pausedId } }],
    playbooks: [
      {
        id: ROOT,
        tenant_id: T,
        kind: "reach_out",
        state: "running",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
      {
        id: PAUSED,
        tenant_id: T,
        kind: "reach_out",
        state: "paused",
        gap_minutes: 12,
        domain_ids: [],
        template_id: TPL,
        after_playbook_id: null,
      },
    ],
    runs: [
      {
        id: RUN,
        tenant_id: T,
        state: "scheduled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(DAY),
      },
      {
        id: CLOSED,
        tenant_id: T,
        state: "canceled",
        playbook_id: ROOT,
        audience: { kind: "reach_out" },
        updated_at: ago(MIN),
      },
    ],
  });
  const [, body] = await w.send();
  assert.equal(body.claim.rewritten, 3);
  for (const [s, id] of [
    [left, leftId],
    [queued, queuedId],
    [paused, pausedId],
  ])
    assert.deepEqual([w.row(s.id).state, w.row(s.id).message_id], ["queued", id], "adopted: its email's");
  assert.equal(emailOf(w, leftId).status, "sent", "an email that left is never withdrawn");
  assert.deepEqual([emailOf(w, queuedId).status, emailOf(w, queuedId).error], ["canceled", { reason: "run_canceled" }]);
  assert.equal(emailOf(w, pausedId).status, "queued");
  assert.deepEqual(
    jobsOf(w).map((j) => j.payload.message_id),
    [pausedId],
    "no job for the withdrawn one, and none twice",
  );
  assert.equal(w.tables.contacts.length, 0, "nobody made: the emails were written before");
  // The next tick reads each: the one that left is sent and its lead written to, never a second first email; the
  // withdrawn one's send is skipped with its run.
  await w.tick();
  assert.equal(w.row(left.id).state, "sent");
  assert.equal(w.tables.leads.find((l) => l.id === left.lead_id).stage, "nurture");
  assert.deepEqual([w.row(queued.id).state, w.row(queued.id).reason], ["skipped", "run_canceled"]);
});

test("one domain the database refuses is its own: the next domain still claims, and the tick answers", async () => {
  const DOM2 = "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a";
  const first = send({ domain_id: DOM2, send_at: ago(3 * MIN) });
  const next = send({ send_at: ago(MIN) });
  const domain = (id, host) => ({
    id,
    tenant_id: T,
    state: "verified",
    host,
    from_local: "sam",
    from_name: "Sam at Harbor",
    clean_since: ago(20 * DAY),
    sent_days: 0,
  });
  const w = world({
    sends: [first, next],
    domains: [domain(DOM, "getharbor.example"), domain(DOM2, "harbor-two.example")],
    failClaim: [DOM2],
  });
  const [status, body] = await w.send();
  assert.equal(status, 200);
  assert.deepEqual([body.claim.errors, body.claim.written], [1, 1]);
  assert.equal(w.row(first.id).state, "planned", "the refused domain's send keeps");
  assert.equal(w.row(next.id).state, "queued", "the next domain's is written");
});

test("the switches (D17): set, a cold email's links point at the cold origin and its replies come back on the cold reply domain", async () => {
  const s = send();
  const w = world({ sends: [s] });
  await w.send({ UNSUBSCRIBE_ORIGIN: "https://links.coldmail.example", COLD_REPLY_DOMAIN: "reply.coldlinks.example" });
  const r = emailOf(w, await sendMessageId(s.id, 0)).meta.email.request;
  assert.deepEqual(r.reply_to, ["r+abcdefghijklmnopqrstuvwx@reply.coldlinks.example"]);
  assert.match(r.headers["List-Unsubscribe"], /^<https:\/\/links\.coldmail\.example\/u\//);
  // Unset, as today: the dashboard's origin and the mail domain.
  const t = send();
  const today = world({ sends: [t] });
  await today.send();
  const q = emailOf(today, await sendMessageId(t.id, 0)).meta.email.request;
  assert.deepEqual(q.reply_to, ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"]);
  assert.match(q.headers["List-Unsubscribe"], /^<https:\/\/app\.chanlytics\.com\/u\//);
});

/* ------------------------------------------------------------ Part 4: the check -- */

/** The root's words, as a case gives them: the six slots a step may name. */
const wordsTemplate = (body, subject = "A quote for {{business}}") => [
  {
    id: TPL,
    tenant_id: T,
    channel: "email",
    body_preview: null,
    components: [
      { type: "HEADER", text: subject },
      { type: "BODY", text: body },
    ],
  },
];
const rootWith = (over = {}) => [
  {
    id: ROOT,
    tenant_id: T,
    kind: "reach_out",
    state: "running",
    gap_minutes: 12,
    domain_ids: [],
    template_id: TPL,
    after_playbook_id: null,
    signed_by: null,
    ...over,
  },
];

test("a send not yet checked is never claimed, and the lane's 503 counts only what could leave (R8)", async () => {
  const s = send({ checked_at: null });
  const w = world({ sends: [s] });
  const [status, body] = await w.send();
  assert.equal(status, 200);
  assert.deepEqual([w.row(s.id).state, body.claim.claimed], ["planned", 0]);
  const [quiet] = await w.send({ UNSUBSCRIBE_SECRET: undefined });
  assert.equal(quiet, 200, "nothing checked is due: nothing that could leave waits on the lane");
});

test("the opening the check wrote, the name the chain signs with and the booking link are the email's (R6)", async () => {
  const s = send({ opening: "A 4.9 from 16 reviews says people find you." });
  const w = world({
    sends: [s],
    templates: wordsTemplate("{{opening}}\n\nFifteen minutes: {{booking link}}\n\n{{your name}}"),
    playbooks: rootWith({ signed_by: "Sam" }),
    config: { ...CONFIG(), brain: { ...CONFIG().brain, booking_link: "https://example.com/book" } },
  });
  const [, body] = await w.send();
  assert.equal(body.claim.written, 1);
  const m = emailOf(w, await sendMessageId(s.id, 0));
  assert.equal(
    m.body,
    "A 4.9 from 16 reviews says people find you.\n\nFifteen minutes: https://example.com/book\n\nSam",
  );
});

test("a workspace's fault holds the send and keeps the lead: no name to sign with, no booking link (R6)", async () => {
  for (const [body, root] of [
    ["Hi {{business}}.\n\n{{your name}}", rootWith({ signed_by: null })],
    ["Hi {{business}}. Book: {{booking link}}", rootWith({ signed_by: "Sam" })],
  ]) {
    const s = send();
    const w = world({ sends: [s], templates: wordsTemplate(body), playbooks: root });
    const [, out] = await w.send();
    const r = w.row(s.id);
    assert.deepEqual([r.state, r.reason, out.claim.held, out.claim.skipped], ["planned", null, 1, 0], body);
    assert.ok(Date.parse(r.send_at) >= Date.now() + 59 * MIN, "an hour on at the soonest");
    assert.equal(w.tables.messages.length, 0);
  }
});

test("words changed since the check, or an opening named and none written, send it back to be checked (R5)", async () => {
  // Checked against other words: the owner edited the step since.
  const edited = send({ checked_words: "0".repeat(64), check_gen: 2, included_for: ["chain"] });
  // The words name {{opening}}, and this send has none.
  const bare = send({ opening: null });
  const w = world({
    sends: [edited, bare],
    templates: wordsTemplate("{{opening}}\n\nHi {{business}}."),
  });
  const [, body] = await w.send();
  assert.equal(body.claim.rechecked, 2);
  const e = w.row(edited.id);
  assert.deepEqual(
    [e.state, e.checked_at, e.check_gen, e.checked_words, e.claimed_at, e.reason, e.included_for],
    ["planned", null, 3, null, null, null, ["chain"]],
    "unchecked at the next version, its owner's inclusion kept (R7)",
  );
  assert.deepEqual([w.row(bare.id).state, w.row(bare.id).checked_at, w.row(bare.id).reason], ["planned", null, null]);
  assert.equal(w.tables.messages.length, 0, "never a missing_value skip, and nothing written");
});

test("a held send keeps its run open, closes with its canceled run, and gives up fourteen days from its planning (R10)", async () => {
  const OPEN = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
  const CLOSED = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
  const young = send({ broadcast_id: OPEN, state: "held", reason: "chain", created_at: ago(DAY) });
  const old = send({ broadcast_id: OPEN, state: "held", reason: "language", created_at: ago(15 * DAY) });
  const shut = send({ broadcast_id: CLOSED, state: "held", reason: "chain", created_at: ago(DAY) });
  const run = (id, state) => ({
    id,
    tenant_id: T,
    state,
    playbook_id: ROOT,
    audience: { kind: "reach_out" },
    updated_at: ago(DAY),
  });
  const w = world({ sends: [young, old, shut], runs: [run(OPEN, "sending"), run(CLOSED, "canceled")] });
  const [, body] = await w.tick();
  assert.deepEqual([w.row(old.id).state, w.row(old.id).reason], ["skipped", "kept_waiting"]);
  assert.deepEqual([w.row(young.id).state, w.row(young.id).reason], ["held", "chain"], "its owner's to answer");
  assert.deepEqual([w.row(shut.id).state, w.row(shut.id).reason], ["skipped", "run_canceled"]);
  assert.equal(w.tables.broadcasts.find((b) => b.id === OPEN).state, "sending", "a held send keeps its run open");
  assert.equal(body.gave_up, 1);
});
