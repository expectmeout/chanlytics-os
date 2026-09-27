/**
 * The send job, executed: the outbox through the one door.
 *
 * outbound_send is where every queued message -- a person's reply, the
 * receptionist's held draft, a template outside the window -- becomes a text
 * on a real phone. It asked only "have they opted out?" while the broadcast
 * wire asked the one predicate with the template's purpose, so a promotional
 * template queued from the Inbox reached somebody who had said yes to their
 * appointments and no to offers. And a draft the receptionist held for review
 * fired underneath the owner's own reply from the WhatsApp Business app, which
 * only paused the thread. Both are rules about what may reach a person; the
 * door (packages/core, deliver.test.mjs) holds them, and this proves the job
 * walks through it -- against a fake database and a fake Graph API.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { dispatchJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);
const { whatsappSender } = await import(pathToFileURL(path.join(ROOT, "packages/core/dist/index.js")).href);

const T = "t1";
const WRITTEN = "2026-09-10T10:00:00.000Z";
const tables = (over = {}) => ({
  messages: [
    {
      id: "m1",
      tenant_id: T,
      conversation_id: "c1",
      status: "queued",
      body: "See you at 3",
      sender: "human",
      channel: "whatsapp",
      direction: "outbound",
      created_at: WRITTEN,
    },
  ],
  conversations: [
    {
      id: "c1",
      tenant_id: T,
      paused_until: null,
      contacts: { consent: "opted_in", dnc: false, marketing_consent: "opted_out", erased_at: null },
      tenants: { status: "active" },
    },
  ],
  templates: [
    { tenant_id: T, channel: "whatsapp", name: "month_offer", language: "en_US", category: "marketing" },
    { tenant_id: T, channel: "whatsapp", name: "visit_reminder", language: "en_US", category: "utility" },
  ],
  events: [],
  escalations: [],
  ...over,
});
const job = (payload = {}) => ({
  id: "j1",
  tenant_id: T,
  kind: "outbound_send",
  payload: { message_id: "m1", conversation_id: "c1", to_phone: "+13475550101", body: "See you at 3", ...payload },
});
function ctxFor(db, over = {}) {
  const alerts = [];
  return {
    ctx: {
      db,
      wire: { whatsapp: whatsappSender({ phoneId: "p1", accessToken: "tok" }), sms: null },
      alert: async (news) => {
        alerts.push(news);
      },
      schedule: async () => {},
      deadline: Date.now() + 60_000,
      ...over,
    },
    alerts,
  };
}

/* A Graph API that accepts everything and says so. */
const graph = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url, init) => {
    graph.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.sent" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

const message = (db) => db.tables.messages[0];
const blocked = (db) => db.tables.events.filter((e) => e.kind === "message.send_blocked").map((e) => e.data);
const wrap = (t) => {
  const db = fakeDb(t);
  db.tables = t;
  return db;
};

test("a person's words to somebody who has not opted out go out, and the row says so", async () => {
  graph.length = 0;
  const db = wrap(tables());
  assert.equal(await dispatchJob(ctxFor(db).ctx, job()), "done");
  assert.equal(graph.length, 1, "one text");
  assert.equal(graph[0].body.to, "13475550101", "Graph wants bare digits");
  assert.equal(message(db).status, "sent");
  assert.equal(message(db).external_id, "wamid.sent");
  assert.ok(db.tables.events.some((e) => e.kind === "message.sent" && e.data.sender === "human"));
});

test("a promotional template does not reach somebody who said no to offers, whoever queued it", async () => {
  graph.length = 0;
  const db = wrap(tables());
  await dispatchJob(ctxFor(db).ctx, job({ template: { name: "month_offer", language: "en_US", params: [] } }));
  assert.equal(graph.length, 0, "nothing went to Meta");
  assert.equal(message(db).status, "canceled");
  assert.deepEqual(message(db).error, { reason: "no_marketing_consent" });
  assert.deepEqual(blocked(db), [
    {
      reason: "no_marketing_consent",
      purpose: "marketing",
      consent: "opted_in",
      dnc: false,
      marketing_consent: "opted_out",
    },
  ]);
});

test("an appointment template is about their own visit, and goes to the same person", async () => {
  graph.length = 0;
  const db = wrap(tables());
  await dispatchJob(ctxFor(db).ctx, job({ template: { name: "visit_reminder", language: "en_US", params: ["Luna"] } }));
  assert.equal(graph.length, 1);
  assert.equal(graph[0].body.template.name, "visit_reminder");
  assert.equal(message(db).status, "sent");
});

test("a template Meta has not told us about is marketing until it says otherwise", async () => {
  graph.length = 0;
  const db = wrap(tables());
  await dispatchJob(ctxFor(db).ctx, job({ template: { name: "seeded_by_hand", language: "en_US", params: [] } }));
  assert.equal(graph.length, 0);
  assert.equal(message(db).error.reason, "no_marketing_consent");
});

test("a template whose row cannot be read fails the job rather than guessing its purpose", async () => {
  graph.length = 0;
  const db = wrap(tables());
  db.faults = { "templates.select": { message: "connection reset" } };
  const faulted = fakeDb(db.tables, { "templates.select": { message: "connection reset" } });
  await assert.rejects(
    dispatchJob(ctxFor(faulted).ctx, job({ template: { name: "month_offer", language: "en_US", params: [] } })),
    /cannot read template month_offer/,
  );
  assert.equal(graph.length, 0);
  assert.equal(db.tables.messages[0].status, "queued", "settled by the tick's failure path, not here");
});

test("STOP still means stop, on every purpose", async () => {
  graph.length = 0;
  const db = wrap(
    tables({
      conversations: [
        {
          id: "c1",
          tenant_id: T,
          paused_until: null,
          contacts: { consent: "opted_out", dnc: true, marketing_consent: "opted_in", erased_at: null },
          tenants: { status: "active" },
        },
      ],
    }),
  );
  await dispatchJob(ctxFor(db).ctx, job());
  assert.equal(graph.length, 0);
  assert.equal(message(db).error.reason, "opted_out");
});

test("the receptionist's held draft is retired when a person answered after it was written", async () => {
  graph.length = 0;
  const db = wrap(
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "We open at 9!",
          sender: "ai",
          channel: "whatsapp",
          direction: "outbound",
          created_at: WRITTEN,
        },
        // The owner's reply from the WhatsApp Business app, recorded by the echo.
        {
          id: "m2",
          tenant_id: T,
          conversation_id: "c1",
          status: "sent",
          body: "Hi! 9am, see you then",
          sender: "human",
          channel: "whatsapp",
          direction: "outbound",
          created_at: "2026-09-10T10:00:20.000Z",
          meta: { echo: true },
        },
      ],
    }),
  );
  await dispatchJob(ctxFor(db).ctx, job({ body: "We open at 9!" }));
  assert.equal(graph.length, 0, "the customer does not get both");
  assert.equal(message(db).status, "canceled");
  assert.deepEqual(message(db).error, { reason: "superseded_by_human" });
  assert.deepEqual(blocked(db), [
    {
      reason: "superseded_by_human",
      purpose: "conversational",
      consent: "opted_in",
      dnc: false,
      marketing_consent: "opted_out",
      after: "m2",
    },
  ]);
});

test("under a pause, the receptionist's queued draft goes unless a person spoke since; a person's own reply always goes", async () => {
  const paused = {
    id: "c1",
    tenant_id: T,
    paused_until: new Date(Date.now() + 3600_000).toISOString(),
    contacts: { consent: "opted_in", dnc: false, marketing_consent: "opted_out", erased_at: null },
    tenants: { status: "active" },
  };
  {
    const db = wrap(
      tables({
        conversations: [paused],
        messages: [
          {
            id: "m1",
            tenant_id: T,
            conversation_id: "c1",
            status: "queued",
            body: "I've passed this on",
            sender: "ai",
            channel: "whatsapp",
            direction: "outbound",
            created_at: WRITTEN,
          },
        ],
      }),
    );
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "sent", "the escalation's own holding message reaches the customer");
  }
  {
    const later = new Date(Date.parse(WRITTEN) + 30_000).toISOString();
    const db = wrap(
      tables({
        conversations: [paused],
        messages: [
          {
            id: "m1",
            tenant_id: T,
            conversation_id: "c1",
            status: "queued",
            body: "I've passed this on",
            sender: "ai",
            channel: "whatsapp",
            direction: "outbound",
            created_at: WRITTEN,
          },
          {
            id: "m2",
            tenant_id: T,
            conversation_id: "c1",
            status: "sent",
            body: "Marisa here",
            sender: "human",
            channel: "whatsapp",
            direction: "outbound",
            created_at: later,
          },
        ],
      }),
    );
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "canceled");
    assert.deepEqual(
      blocked(db).map((d) => d.reason),
      ["superseded_by_human"],
    );
  }
  {
    const db = wrap(tables({ conversations: [paused] }));
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "sent", "a person's reply is never held by the pause that exists for them");
  }
});

test("a person's OLDER words do not retire the draft, and a person's own reply is never retired by another's", async () => {
  graph.length = 0;
  const older = wrap(
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "We open at 9!",
          sender: "ai",
          channel: "whatsapp",
          direction: "outbound",
          created_at: WRITTEN,
        },
        {
          id: "m0",
          tenant_id: T,
          conversation_id: "c1",
          status: "sent",
          body: "earlier",
          sender: "human",
          channel: "whatsapp",
          direction: "outbound",
          created_at: "2026-09-10T09:00:00.000Z",
        },
      ],
    }),
  );
  await dispatchJob(ctxFor(older).ctx, job({ body: "We open at 9!" }));
  assert.equal(graph.length, 1, "the draft answers a thread nobody has touched since");
  graph.length = 0;
  const human = wrap(
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "Sure, 3 works",
          sender: "human",
          channel: "whatsapp",
          direction: "outbound",
          created_at: WRITTEN,
        },
        {
          id: "m2",
          tenant_id: T,
          conversation_id: "c1",
          status: "sent",
          body: "a colleague",
          sender: "human",
          channel: "whatsapp",
          direction: "outbound",
          created_at: "2026-09-10T10:00:05.000Z",
        },
      ],
    }),
  );
  await dispatchJob(ctxFor(human).ctx, job({ body: "Sure, 3 works" }));
  assert.equal(graph.length, 1, "two people replying is two replies");
});

test("no credentials is a refusal at the wire, said to the owner, never a send on the environment's pair", async () => {
  graph.length = 0;
  const db = wrap(tables());
  const { ctx, alerts } = ctxFor(db, { wire: { whatsapp: null, sms: null } });
  assert.equal(await dispatchJob(ctx, job()), "done");
  assert.equal(graph.length, 0);
  assert.equal(message(db).status, "failed");
  assert.equal(message(db).error.body, "no_credentials");
  assert.equal(db.tables.escalations.length, 1, "the thread is flagged for a person");
  assert.equal(alerts.length, 1, "and the owner is told");
});

test("the carrier's own no on a text (Twilio 21610) is the person's STOP: the row is canceled as opted out, nobody is flagged or told, and the next job to them never reaches the line", async () => {
  // Until now a 21610 was a provider failure like any other: the thread was
  // flagged, the owner told a delivery failed, nothing recorded -- and the
  // next queued message to that person did it all again. The door (deliver
  // .test.mjs) records the no and refuses; this proves the job hears a
  // refusal, which pages nobody, and that the second job is refused before
  // the line is asked.
  graph.length = 0;
  const k = {
    id: "k1",
    tenant_id: T,
    consent: "opted_in",
    dnc: false,
    marketing_consent: "opted_out",
    erased_at: null,
  };
  const queued = (id, body) => ({
    id,
    tenant_id: T,
    conversation_id: "c1",
    status: "queued",
    body,
    sender: "ai",
    channel: "sms",
    direction: "outbound",
    created_at: WRITTEN,
  });
  const db = wrap(
    tables({
      contacts: [k],
      conversations: [
        { id: "c1", tenant_id: T, contact_id: "k1", paused_until: null, contacts: k, tenants: { status: "active" } },
      ],
      messages: [queued("m1", "We open at 9"), queued("m2", "Still there?")],
    }),
  );
  const texts = [];
  const line = async (to, p) => {
    texts.push({ to, p });
    return { ok: false, wamid: null, status: 400, errorBody: "Twilio 21610", code: 21610 };
  };
  const { ctx, alerts } = ctxFor(db, { wire: { whatsapp: null, sms: line } });
  assert.equal(await dispatchJob(ctx, job({ message_id: "m1", body: "We open at 9" })), "done");
  assert.equal(texts.length, 1, "the line was asked once");
  assert.equal(message(db).status, "canceled");
  assert.deepEqual(message(db).error, { reason: "opted_out" });
  assert.deepEqual([k.consent, k.dnc, k.consent_source], ["opted_out", true, "carrier"], "recorded as their STOP");
  assert.deepEqual(
    db.tables.events.filter((e) => e.kind === "contact.consent_changed").map((e) => e.data),
    [{ consent: "opted_out", previous: "opted_in", source: "carrier", channel: "sms" }],
  );
  assert.deepEqual(
    blocked(db).map((b) => b.reason),
    ["opted_out"],
  );
  assert.deepEqual(db.tables.escalations, [], "no thread flagged: the person asked to stop");
  assert.deepEqual(alerts, [], "and the owner is not told a delivery failed");

  // The next queued message to the same person: refused by consent before the line is asked.
  assert.equal(await dispatchJob(ctx, job({ message_id: "m2", body: "Still there?" })), "done");
  assert.equal(texts.length, 1, "the line was not asked again");
  assert.equal(db.tables.messages[1].status, "canceled");
  assert.deepEqual(db.tables.messages[1].error, { reason: "opted_out" });
  assert.deepEqual(
    blocked(db).map((b) => b.reason),
    ["opted_out", "opted_out"],
  );
  assert.deepEqual([db.tables.escalations, alerts], [[], []], "still nobody flagged, nobody told");
});

test("a reach-out's email written after the receptionist's draft is no person speaking: the draft is not retired by it", async () => {
  graph.length = 0;
  const db = wrap(
    tables({
      messages: [
        {
          id: "m1",
          tenant_id: T,
          conversation_id: "c1",
          status: "queued",
          body: "We open at 9!",
          sender: "ai",
          channel: "whatsapp",
          direction: "outbound",
          created_at: WRITTEN,
        },
        // A cold email written into the same thread since, and refused at the door: its row says "human" all the same.
        {
          id: "m2",
          tenant_id: T,
          conversation_id: "c1",
          status: "canceled",
          body: "Saw your shop on the map.",
          sender: "human",
          channel: "email",
          direction: "outbound",
          created_at: "2026-09-10T10:00:20.000Z",
          meta: { source: "reach_out" },
        },
      ],
    }),
  );
  await dispatchJob(ctxFor(db).ctx, job({ body: "We open at 9!" }));
  assert.equal(graph.length, 1, "the draft goes");
  assert.equal(message(db).status, "sent");
});

test("a cold email's job asks the door about the lead its row was written for (meta.reach_out.lead_id), and no other", async () => {
  const request = {
    from: '"Sam at Harbor" <sam@getharbor.example>',
    to: ["owner@fixture-movers.example"],
    reply_to: ["r+abcdefghijklmnopqrstuvwx@mail.chanlytics.com"],
    subject: "A quote for Fixture Movers",
    text: "Hi",
    html: "<p>Hi</p>",
    headers: {
      "List-Unsubscribe": "<https://app.chanlytics.com/u/token>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [],
    idempotency_key: "m1",
  };
  const t = tables({
    messages: [
      {
        id: "m1",
        tenant_id: T,
        conversation_id: "c1",
        status: "queued",
        body: "Hi",
        sender: "human",
        channel: "email",
        direction: "outbound",
        created_at: WRITTEN,
        meta: { source: "reach_out", email: { request }, reach_out: { lead_id: "l-closed" } },
      },
    ],
    conversations: [
      {
        id: "c1",
        tenant_id: T,
        paused_until: null,
        contact_id: "k1",
        contacts: {
          consent: "unknown",
          dnc: false,
          marketing_consent: null,
          email_marketing: "unknown",
          erased_at: null,
          erasing_since: null,
          email: "owner@fixture-movers.example",
          email_suppressed_at: null,
        },
        tenants: { status: "active" },
      },
    ],
  });
  const asked = [];
  const db = fakeDb(
    t,
    {},
    {
      // The person's other lead is open; the one this email was written for closed since.
      outreach_facts: (a) => {
        asked.push(a);
        return {
          lead_stage: a.p_lead_id === "l-closed" ? "archived" : "ready",
          suppressed: false,
          wrote_back: false,
          domain: { state: "verified", from_local: "sam", clean_since: "2026-08-01T00:00:00.000Z", sent_days: 0 },
          sent_since: 0,
        };
      },
    },
  );
  const sent = [];
  const email = async (_to, p) => {
    sent.push(p);
    return { ok: true, wamid: "re_1", status: 200 };
  };
  await dispatchJob(
    ctxFor(db, { wire: { email } }).ctx,
    job({
      to_phone: undefined,
      to_email: "owner@fixture-movers.example",
      body: undefined,
      purpose: "outreach",
      proactive: true,
    }),
  );
  assert.equal(asked.length, 1);
  assert.equal(asked[0].p_lead_id, "l-closed", "the row's own lead");
  assert.equal(sent.length, 0, "nothing reaches the wire");
  assert.deepEqual([t.messages[0].status, t.messages[0].error], ["canceled", { reason: "outreach_lead_closed" }]);
});
