/**
 * A reach-out's reply, from the intake to the notice, over a database in memory (Reach out Part 5, PR 3; the plan's
 * Task 3.4). The real email_ingest and reply_read handlers run (packages/jobs dispatchJob), with the edge's own reader
 * (lib/reach-out/reply-read.ts): the model answered by the test through the platform's one transport (lib/model.ts
 * setModelClient), the spend taken through the workspace's billing and the day's reads, and the notice told through a
 * port the test holds. The database's doors are modelled from the SQL (00222), and the ledger's once-per-message index
 * is the fake's unique index on the payload.
 *
 * It proves: the intake schedules one reading and tells nobody itself; the reading reaches the door with the plan and
 * the bare address; one notice with the reading's subject; a second run asks no model and tells nobody; a second
 * schedule of the same message is already there; and a notice whose mail failed leaves told unmarked, throws for the
 * ledger's retry, is left alone by a try inside its claim, and is told on the retry once its claim has gone stale.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at, withEnv } from "../_cron-doors-world.mjs";
import { loadFixtures } from "../../evals/reply-intents.mjs";

const { setModelClient } = await import(at("apps/edge/lib/model.ts"));
const { replyReader } = await import(at("apps/edge/lib/reach-out/reply-read.ts"));
const { dispatchJob } = await import(at("packages/jobs/src/handlers.ts"));
const { scheduleJobOnce } = await import(at("packages/jobs/src/schedule.ts"));
const { retryWait, LEASE_SECONDS } = await import(at("packages/jobs/src/ledger.ts"));
const { receivedEmailFrom } = await import("@chanlytics/channels");
const { REACH_OUT_MODEL } = await import("@chanlytics/contracts");
after(() => setModelClient(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "11111111-aaaa-4aaa-8aaa-111111111111";
const PERSON = "22222222-aaaa-4aaa-8aaa-222222222222";
const SENT = "33333333-aaaa-4aaa-8aaa-333333333333";
const set = loadFixtures();
const ANSWERED_ID = "<reach-out-0001@owner.example.com>";
const KEY = { ANTHROPIC_API_KEY: "model-key-for-this-file" };

/** The model, scripted: each call answers the next of `answers` as JSON text, and is counted. */
function model(answers) {
  const calls = [];
  setModelClient({
    messages: {
      create: async (body) => {
        calls.push(body);
        const a = answers[Math.min(calls.length - 1, answers.length - 1)];
        return {
          content: [{ type: "text", text: JSON.stringify(a) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    },
  });
  return calls;
}

/** The workspace, its mailbox, the lead a reach-out wrote to and the email it sent; and the doors 00222 adds, modelled. */
function world() {
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving Co", status: "active", timezone: set.lead.tz }],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    mailboxes: [{ id: "mb1", tenant_id: T, local_part: "harbor" }],
    contacts: [{ id: PERSON, tenant_id: T, email: set.lead.address, erased_at: null, merged_into_contact_id: null }],
    contact_identities: [],
    conversations: [{ id: "conv-lead", tenant_id: T, contact_id: PERSON }],
    leads: [
      {
        id: LEAD,
        tenant_id: T,
        contact_id: PERSON,
        email: set.lead.address,
        website_host: "example.com",
        business_name: set.lead.business,
      },
    ],
    messages: [
      {
        id: SENT,
        tenant_id: T,
        conversation_id: "conv-lead",
        contact_id: PERSON,
        channel: "email",
        direction: "outbound",
        body: set.answered,
        meta: { email: { message_id: ANSWERED_ID } },
        created_at: "2026-09-29T13:00:00.000Z",
      },
    ],
    reach_out_sends: [
      {
        id: "send-1",
        tenant_id: T,
        lead_id: LEAD,
        contact_id: PERSON,
        state: "sent",
        message_id: SENT,
        sent_at: "2026-09-29T13:00:00.000Z",
      },
    ],
    reach_out_replies: [],
    reach_out_check_spend: [],
    escalations: [],
    jobs: [],
  };
  const applied = [];
  const convOf = (contactId) => {
    let c = tables.conversations.find((x) => x.contact_id === contactId);
    if (!c) tables.conversations.push((c = { id: `conv-${contactId}`, tenant_id: T, contact_id: contactId }));
    return c;
  };
  const rpcs = {
    // 00098's ingest, as far as an email needs it: the person by address, their one thread, the message once.
    ingest_inbound: (a) => {
      let person = tables.contacts.find((c) => c.email === a.p_identity_external_id);
      if (!person) tables.contacts.push((person = { id: `p-${a.p_identity_external_id}`, tenant_id: T, email: null }));
      const conv = convOf(person.id);
      const seen = tables.messages.find((m) => m.external_id === a.p_message_external_id);
      if (seen)
        return {
          message_id: seen.id,
          conversation_id: conv.id,
          contact_id: person.id,
          is_new: false,
          processed: !!seen.processed,
        };
      const id = `msg-${tables.messages.length}`;
      tables.messages.push({
        id,
        tenant_id: T,
        conversation_id: conv.id,
        contact_id: person.id,
        channel: "email",
        direction: "inbound",
        sender: "customer",
        external_id: a.p_message_external_id,
        body: a.p_body,
        meta: a.p_meta,
        channel_ts: a.p_channel_ts,
        created_at: a.p_channel_ts,
      });
      return { message_id: id, conversation_id: conv.id, contact_id: person.id, is_new: true, processed: false };
    },
    mark_processed: (a) => {
      tables.messages.find((m) => m.id === a.p_message_id).processed = true;
    },
    // 00222 reach_out_reply_of: the reach-out email the reply cites, and the reply itself.
    reach_out_reply_of: (a) => {
      const m = tables.messages.find(
        (x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id && x.direction === "inbound",
      );
      if (!m) return null;
      const cited = [m.meta.email.in_reply_to, ...(m.meta.email.references ?? [])];
      const send = tables.reach_out_sends.find((s) => {
        const o = tables.messages.find((x) => x.id === s.message_id);
        return s.state === "sent" && cited.includes(o?.meta?.email?.message_id);
      });
      if (!send) return null;
      const lead = tables.leads.find((l) => l.id === send.lead_id);
      return {
        send_id: send.id,
        lead_id: lead.id,
        lead_contact_id: lead.contact_id,
        lead_email: lead.email,
        lead_website: lead.website_host,
        answered_message_id: send.message_id,
        answered_text: set.answered.slice(0, 600),
        business: lead.business_name,
        tz: set.lead.tz,
        conversation_id: m.conversation_id,
        contact_id: m.contact_id,
        claim: m.meta.email.claim,
        from: m.meta.email.from,
        subject: m.meta.email.subject,
        text: m.body,
        received_at: m.channel_ts,
      };
    },
    reach_out_read_take: (a) => {
      const day = a.p_at.slice(0, 10);
      let row = tables.reach_out_check_spend.find((x) => x.tenant_id === a.p_tenant_id && x.day === day);
      if (!row) tables.reach_out_check_spend.push((row = { tenant_id: a.p_tenant_id, day, attempts: 0, reads: 0 }));
      if (row.reads >= a.p_cap) return false;
      row.reads += 1;
      return true;
    },
    // 00222 reach_out_reply_apply: kept once (a re-read by compare-and-set); what it is handed is what the SQL runs.
    reach_out_reply_apply: (a) => {
      applied.push(a);
      const tell = a.p_plan.tell === true;
      const row = tables.reach_out_replies.find((r) => r.message_id === a.p_message_id);
      const reading = {
        intent: a.p_reading.intent,
        summary: a.p_reading.summary || null,
        unread: a.p_reading.unread,
        rereads: a.p_reread,
        plan: a.p_plan,
      };
      if (a.p_reread === 0) {
        if (row) return { applied: false };
        const claim = rpcs.reach_out_reply_of(a).claim;
        tables.reach_out_replies.push({
          message_id: a.p_message_id,
          tenant_id: a.p_tenant_id,
          claim,
          ...reading,
          told_at: null,
          tell_claimed_at: null,
          undone_at: null,
        });
        return { applied: true };
      }
      if (!row || row.unread === null || row.undone_at || row.rereads !== a.p_reread - 1) return { applied: false };
      // Due a notice when the plan tells, or when the reading before was owed one that never reached the owner.
      const owed = row.plan.tell === true && row.told_at === null;
      // News (the plan tells) takes the claim back; a notice owed keeps it, for the run still telling it.
      Object.assign(
        row,
        reading,
        { plan: { ...a.p_plan, tell: tell || owed } },
        tell ? { told_at: null, tell_claimed_at: null } : {},
      );

      return { applied: true };
    },
    reach_out_reply_tell_claim: (a) => {
      const row = tables.reach_out_replies.find(
        (r) => r.message_id === a.p_message_id && r.tenant_id === a.p_tenant_id,
      );
      if (!row || row.told_at || (row.tell_claimed_at && row.tell_claimed_at >= a.p_stale_before)) return null;
      row.tell_claimed_at = new Date().toISOString();
      return row.tell_claimed_at;
    },
    // Told only while the claim that told still holds it.
    reach_out_reply_told: (a) => {
      const row = tables.reach_out_replies.find(
        (r) => r.message_id === a.p_message_id && r.told_at === null && r.tell_claimed_at === a.p_claimed_at,
      );
      if (row) row.told_at = new Date().toISOString();
      return !!row;
    },
  };
  const db = fakeDb(tables, {}, rpcs, {
    uniqueIndexes: [
      {
        table: "jobs",
        name: "jobs_reply_read_once",
        key: (r) => `${r.payload?.message_id}|${r.payload?.stage ?? "read"}`,
        where: (r) => r.kind === "reply_read" && r.state !== "failed",
      },
    ],
  });
  const told = [];
  const intakeTold = [];
  let mailWorks = true;
  const ctx = (email) => ({
    db,
    wire: { whatsapp: null, sms: null },
    alert: async () => {},
    email: {
      domain: "mail.example.com",
      fetch: async () => email,
      erasedBefore: async () => false,
      tell: async (_t, note) => {
        intakeTold.push(note);
      },
    },
    replies: replyReader(db, {
      tell: async (tenantId, notice) => {
        told.push({ tenantId, notice, delivered: mailWorks });
        return mailWorks;
      },
    }),
    schedule: async () => {},
    scheduleOnce: (kind, dueAt, payload) => scheduleJobOnce(db, { tenantId: T, kind, dueAt, payload }),
    deadline: Date.now() + 40_000,
  });
  return {
    tables,
    applied,
    told,
    intakeTold,
    ctx,
    failMail: (fails) => {
      mailWorks = !fails;
    },
    job: (kind, payload) => ({ id: `job-${kind}`, tenant_id: T, kind, payload }),
    readJobs: () => tables.jobs.filter((j) => j.kind === "reply_read"),
  };
}

/** A fixture's email as the provider's API answers it, then parsed the way the intake's fetch parses it. */
const provided = (n, over = {}) => {
  const r = set.replies.find((x) => x.email.id === `received-${String(n).padStart(2, "0")}`);
  const e = r.email;
  return {
    reply: r,
    email: receivedEmailFrom({
      id: e.id,
      from: e.from.name ? `${e.from.name} <${e.from.address}>` : e.from.address,
      to: e.to,
      cc: e.cc,
      subject: e.subject,
      text: e.text,
      html: e.html,
      headers: e.headers,
      message_id: e.messageId,
      created_at: e.createdAt,
      attachments: [],
      ...over,
    }),
  };
};

test("a person's reply: the intake schedules one reading and tells nobody; the reading applies, and tells once", async () => {
  await withEnv(KEY, async () => {
    const w = world();
    const { reply, email } = provided(1);
    const calls = model([reply.answer]);
    const ingest = w.job("email_ingest", { mailbox_id: "mb1", received_id: email.id });
    assert.equal(await dispatchJob(w.ctx(email), ingest), "done");
    assert.equal(w.intakeTold.length, 0, "the intake does not tell: the reading does, with what it meant");
    assert.match(w.tables.escalations[0].details, /^They wrote back to your reach-out/);
    const jobs = w.readJobs();
    assert.equal(jobs.length, 1);
    const messageId = jobs[0].payload.message_id;

    // The intake run again (the ledger's retry, a second webhook) finds the reading already on the ledger.
    assert.equal(await dispatchJob(w.ctx(email), ingest), "done");
    assert.equal(w.readJobs().length, 1);
    assert.equal(
      await w.ctx(email).scheduleOnce("reply_read", new Date(), { message_id: messageId }),
      "already_scheduled",
      "jobs_reply_read_once: one live read per message",
    );

    assert.equal(await dispatchJob(w.ctx(email), w.job("reply_read", jobs[0].payload)), "done");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, REACH_OUT_MODEL, "the check's model");
    assert.equal(w.applied.length, 1);
    const [a] = w.applied;
    assert.equal(a.p_reading.intent, "interested");
    assert.equal(a.p_reread, 0);
    assert.equal(a.p_days, 30);
    assert.equal(a.p_plan.convert, true);
    assert.equal(a.p_plan.skipSends, "outreach_wrote_back");
    assert.equal(w.tables.reach_out_check_spend[0].reads, 1, "one read taken from the day");
    assert.equal(w.told.length, 1);
    assert.equal(w.told[0].notice.subject, `${set.lead.business} wrote back · interested`);
    assert.equal(w.told[0].notice.conversationId, "conv-lead");
    assert.ok(w.tables.reach_out_replies[0].told_at, "marked told once the owner was told");

    // A second run of the same job: no model, no second notice.
    assert.equal(await dispatchJob(w.ctx(email), w.job("reply_read", jobs[0].payload)), "done");
    assert.equal(calls.length, 1, "a reading kept asks no model");
    assert.equal(w.told.length, 1);
  });
});

test("a no from another address of the business reaches the door as the bare address, never the display-name form", async () => {
  await withEnv(KEY, async () => {
    const w = world();
    const { reply, email } = provided(7);
    assert.equal(email.from.address, "gerencia@example.com");
    model([reply.answer]);
    await dispatchJob(w.ctx(email), w.job("email_ingest", { mailbox_id: "mb1", received_id: email.id }));
    const [job] = w.readJobs();
    await dispatchJob(w.ctx(email), w.job("reply_read", job.payload));
    const [a] = w.applied;
    assert.equal(a.p_plan.saidNo, true);
    assert.equal(a.p_plan.suppressFrom, "gerencia@example.com");
    assert.equal(a.p_plan.suppressDomain, "example.com");
    assert.equal(w.told[0].notice.subject, `${set.lead.business} said no`);
  });
});

test("an automatic 'remove us' is read and told (B1); an automatic out-of-office is recorded and told nobody", async () => {
  await withEnv(KEY, async () => {
    const w = world();
    const { reply, email } = provided(13);
    model([reply.answer]);
    await dispatchJob(w.ctx(email), w.job("email_ingest", { mailbox_id: "mb1", received_id: email.id }));
    assert.equal(w.tables.escalations.length, 0, "an automatic reply is never flagged");
    const [job] = w.readJobs();
    await dispatchJob(w.ctx(email), w.job("reply_read", job.payload));
    assert.equal(w.applied[0].p_plan.saidNo, true);
    assert.match(w.told[0].notice.subject, /automatic reply asks to be taken off your list/);

    const away = world();
    const out = provided(9);
    model([out.reply.answer]);
    await dispatchJob(away.ctx(out.email), away.job("email_ingest", { mailbox_id: "mb1", received_id: out.email.id }));
    const [awayJob] = away.readJobs();
    await dispatchJob(away.ctx(out.email), away.job("reply_read", awayJob.payload));
    assert.equal(away.applied[0].p_plan.awayUntil, "2026-10-06T04:00:00.000Z");
    assert.equal(away.told.length, 0);
  });
});

test("a notice whose mail failed: told stays unmarked, the job throws for the ledger's retry, and the retry tells once", async () => {
  await withEnv(KEY, async () => {
    const w = world();
    const { reply, email } = provided(5);
    const calls = model([reply.answer]);
    await dispatchJob(w.ctx(email), w.job("email_ingest", { mailbox_id: "mb1", received_id: email.id }));
    const [job] = w.readJobs();
    w.failMail(true);
    await assert.rejects(dispatchJob(w.ctx(email), w.job("reply_read", job.payload)), /did not reach its owner/);
    const row = w.tables.reach_out_replies[0];
    assert.equal(row.told_at, null, "never marked before the owner was told");
    assert.ok(row.tell_claimed_at);
    assert.equal(retryWait({ kind: "reply_read", attempts: 1 }), 2 * 60_000, "tried again in two minutes");
    assert.ok(2 * 60_000 > LEASE_SECONDS * 1000, "after the claim has gone stale");

    // A try inside the lease finds the claim still live (a run that died holding it looks the same): it tells nobody,
    // marks nothing, and throws for a later try rather than finish as done.
    w.failMail(false);
    await assert.rejects(dispatchJob(w.ctx(email), w.job("reply_read", job.payload)), /another run holds the notice/);
    assert.equal(row.told_at, null);
    assert.equal(w.told.length, 1);

    // The retry, once the claim is older than the lease: no second read, one notice.
    row.tell_claimed_at = new Date(Date.now() - (LEASE_SECONDS + 1) * 1000).toISOString();
    assert.equal(await dispatchJob(w.ctx(email), w.job("reply_read", job.payload)), "done");
    assert.equal(calls.length, 1);
    assert.deepEqual(
      w.told.map((t) => t.delivered),
      [false, true],
    );
    assert.ok(row.told_at);
  });
});

test("with no model key the reply is other, the chain's stop stands, the owner is told, and it is read again later", async () => {
  await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    const w = world();
    const { email } = provided(1);
    const calls = model([{}]);
    await dispatchJob(w.ctx(email), w.job("email_ingest", { mailbox_id: "mb1", received_id: email.id }));
    const [job] = w.readJobs();
    await dispatchJob(w.ctx(email), w.job("reply_read", job.payload));
    assert.equal(calls.length, 0);
    assert.equal(w.applied[0].p_reading.unread, "no_model");
    assert.equal(w.tables.reach_out_check_spend.length, 0, "nothing is spent on a read not made");
    const reread = w.readJobs().find((j) => j.payload.stage === "reread-1");
    assert.ok(reread, "read again later");
    assert.match(w.told[0].notice.body, /could not be read/);
  });
});
