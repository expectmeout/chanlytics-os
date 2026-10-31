/**
 * A connected mailbox brings people, not programs (decision 0080; apps/edge/lib/email/mailbox/mailbox-sorting.ts and
 * mailbox-reader.ts), over a database in memory: whom the business talks with comes in without a question; a program's
 * notice through a mailing service is left on its headers; what Chanlytics read a sender to be is kept and read again
 * before anything asks; what three other workspaces said of a domain is heard; and a stranger's first email is read by
 * the model, once a sender, its reading kept, the business's own name and words about itself in what the model is told.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { MAILBOX_ENV, withEnv } from "./_mailbox-world.mjs";

const restore = withEnv({ ...MAILBOX_ENV, ANTHROPIC_API_KEY: null });
after(restore);
const { leftWhy, mailSortingFor, sortByRules } = await importSrc("apps/edge/lib/email/mailbox/mailbox-sorting.ts");
const { senderReaderFor } = await importSrc("apps/edge/lib/email/mailbox/mailbox-reader.ts");
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const { logger } = await importSrc("apps/edge/lib/log.ts");
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWN = "sam@getharbor.example";
const log = logger({ tenant_id: T });

/** The workspace's tables as the sorting reads them, and the others-said door over `othersSaid`. */
function world({
  contacts = [],
  messages = [],
  reads = [],
  othersSaid = [],
  billing = { mode: "stripe", status: "trialing" },
} = {}) {
  const asked = [];
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving", status: "active", left_empty_at: null }],
    billing_accounts: billing ? [{ tenant_id: T, ...billing }] : [],
    business_records: [{ tenant_id: T, about: "Local and long-distance moves, packing and storage." }],
    tenant_config: [],
    mailbox_connections: [rows.mailboxConnection({ tenant_id: T, address: OWN, host: "getharbor.example" })],
    mailbox_senders: [],
    mailbox_sender_reads: reads.map((r) => ({ tenant_id: T, about: null, read_at: "2026-10-01T00:00:00Z", ...r })),
    contacts: contacts.map((c) => ({
      tenant_id: T,
      erased_at: null,
      merged_into_contact_id: null,
      acquired_via: null,
      ...c,
    })),
    messages: messages.map((m) => ({ tenant_id: T, ...m })),
    ai_usage: [],
    events: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      sender_domain_said_automated: (a) => {
        asked.push(a.p_domain);
        return othersSaid.includes(a.p_domain);
      },
    },
  );
  setPg(db);
  return { db, tables, asked };
}

/** A reader the test answers: what it is handed, and its readings in turn (null where nothing answered). */
function reader(answers = []) {
  const seen = [];
  const read = async (e) => {
    seen.push(e.from?.address);
    return answers.length ? answers.shift() : null;
  };
  return { seen, read };
}

/** An email as a mailbox hands it over: who, to whom, its headers and Gmail's labels. */
function email({
  from,
  text = "Hello.",
  subject = "Hello",
  headers = {},
  labels = ["INBOX"],
  messageId,
  threadId = "t1",
}) {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const name = /^([^<]+)</.exec(from)?.[1]?.trim() ?? null;
  return {
    id: `g-${Math.random().toString(36).slice(2)}`,
    threadId,
    from: { address, name },
    to: [OWN],
    cc: [],
    subject,
    text,
    html: null,
    headers: { from, "message-id": messageId ?? `<x@${address.split("@")[1]}>`, ...headers },
    authentication: null,
    messageId: messageId ?? `<x@${address.split("@")[1]}>`,
    createdAt: "2026-10-20T15:00:00Z",
    attachments: [],
    reportText: null,
    labels,
  };
}

const sortingOf = async (w, r) => mailSortingFor(w.db, T, log, r.read);

test("a hosting platform's notice through Amazon SES, from an ordinary name and no automated header, is left as a mailing service's on its headers, and nobody is asked about it", async () => {
  const w = world();
  const r = reader();
  const s = await sortingOf(w, r);
  const ses = email({
    from: "Fixture Host <team@host.example>",
    subject: "Failed deployment",
    text: "A deployment failed.",
    messageId: "<0101019a835dab19-f4b1-000000@us-west-2.amazonses.com>",
    labels: ["INBOX", "CATEGORY_PERSONAL"],
  });
  assert.equal(await leftWhy(ses, s), "service");
  const fbl = email({ from: "Shop <hello@shop.example>", headers: { "feedback-id": "1:campaign:shop" } });
  assert.equal(await leftWhy(fbl, s), "service", "a bulk sender's feedback id says the same");
  assert.deepEqual(r.seen, [], "the model is never asked of either");
});

test("a website's form sent through a mailing service, its replies going to the person who wrote it, is read, and what it passed on is listed with what was asked", async () => {
  const w = world();
  const r = reader([{ kind: "relayed", about: "asked for a quote for a two-bedroom move" }]);
  const s = await sortingOf(w, r);
  const form = email({
    from: "Site Forms <forms@sitebuilder.example>",
    subject: "New form submission",
    text: "Name: Dana. Message: how much for a two-bedroom?",
    messageId: "<abc@geopod.sendgrid.net>",
    headers: { "reply-to": "dana@example.com", "x-sg-eid": "eid" },
  });
  assert.equal(await sortByRules(form, s), "stranger", "the Reply-To is someone: not a program's notice");
  assert.equal(await leftWhy(form, s), "relayed");
  assert.deepEqual(r.seen, ["forms@sitebuilder.example"]);
});

test("whom the business talks with comes in without a question: an email it sent them, another wire, a door the owner chose; a person a notice made is a stranger", async () => {
  const w = world({
    contacts: [
      { id: "k-sent", email: "ana@example.com", acquired_via: "import" },
      { id: "k-wa", email: "ben@example.com", acquired_via: "email" },
      { id: "k-hand", email: "cy@example.com", acquired_via: "manual" },
      { id: "k-notice", email: "hello@vendor.example", acquired_via: "email" },
      { id: "k-drafted", email: "dee@example.com", acquired_via: "email" },
    ],
    messages: [
      { id: "m1", contact_id: "k-sent", channel: "email", direction: "outbound", sender: "human" },
      { id: "m2", contact_id: "k-wa", channel: "email", direction: "inbound", sender: "customer" },
      { id: "m3", contact_id: "k-wa", channel: "whatsapp", direction: "inbound", sender: "customer" },
      { id: "m4", contact_id: "k-notice", channel: "email", direction: "inbound", sender: "customer" },
      // The receptionist's words to someone are not the business talking with them.
      { id: "m5", contact_id: "k-drafted", channel: "email", direction: "outbound", sender: "ai" },
    ],
  });
  const r = reader();
  const s = await sortingOf(w, r);
  for (const from of ["ana@example.com", "ben@example.com", "cy@example.com"])
    assert.equal(await sortByRules(email({ from, labels: ["INBOX", "CATEGORY_UPDATES"] }), s), "in", from);
  assert.equal(await sortByRules(email({ from: "hello@vendor.example" }), s), "stranger");
  assert.equal(await sortByRules(email({ from: "dee@example.com" }), s), "stranger");
  assert.deepEqual(r.seen, [], "nobody asked by the rules alone");
});

test("what Chanlytics read a sender to be is kept and comes first: a pitch is left, someone who asked comes in, and neither is read again", async () => {
  const w = world({
    reads: [
      { address: "growth@agency.example", kind: "pitch", about: "offers more reviews" },
      { address: "lee@example.com", kind: "inquiry", about: "asked about storage" },
    ],
  });
  const r = reader();
  const s = await sortingOf(w, r);
  assert.equal(await leftWhy(email({ from: "growth@agency.example" }), s), "pitch");
  assert.equal(await leftWhy(email({ from: "lee@example.com" }), s), null);
  assert.deepEqual(r.seen, []);
});

test("three other workspaces' owners saying a domain is automated leaves its mail; a free-mail domain is never asked about", async () => {
  const w = world({ othersSaid: ["alerts.example"] });
  const r = reader();
  const s = await sortingOf(w, r);
  assert.equal(await leftWhy(email({ from: "Alerts <team@alerts.example>" }), s), "others_said");
  assert.equal(await leftWhy(email({ from: "pat@gmail.com" }), s), null, "a stranger, read: nothing answered, in");
  assert.deepEqual(w.asked, ["alerts.example"], "gmail.com is millions of people: never asked");
});

test("a stranger's first email is read: someone asking comes in, a pitch and a notice are left, and nothing answered is in, as before", async () => {
  const w = world();
  const r = reader([
    { kind: "inquiry", about: "asked about a piano move" },
    { kind: "pitch", about: "offers a new website" },
    { kind: "notice", about: null },
    null,
  ]);
  const s = await sortingOf(w, r);
  assert.equal(await leftWhy(email({ from: "rosa@example.com" }), s), null);
  assert.equal(await leftWhy(email({ from: "sales@webshop.example" }), s), "pitch");
  assert.equal(await leftWhy(email({ from: "billing@saas.example" }), s), "notice");
  assert.equal(await leftWhy(email({ from: "quiet@example.com" }), s), null);
  assert.deepEqual(r.seen, ["rosa@example.com", "sales@webshop.example", "billing@saas.example", "quiet@example.com"]);
});

test("a sender is read once a sorting, their second email waiting for the first's reading; after three unanswered, nobody else is asked", async () => {
  const w = world();
  const r = reader([{ kind: "pitch", about: "offers leads" }]);
  const s = await sortingOf(w, r);
  const twice = await Promise.all([
    leftWhy(email({ from: "ads@leads.example" }), s),
    leftWhy(email({ from: "ads@leads.example", subject: "Following up" }), s),
  ]);
  assert.deepEqual(twice, ["pitch", "pitch"]);
  assert.deepEqual(r.seen, ["ads@leads.example"], "one reading for both");
  for (const from of ["a@one.example", "b@two.example", "c@three.example", "d@four.example"])
    await leftWhy(email({ from }), s);
  assert.deepEqual(
    r.seen.slice(1),
    ["a@one.example", "b@two.example", "c@three.example"],
    "a model that is down is let be",
  );
});

/** The model's API as the reader asks it: each request kept, and the answer given. */
function model(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u !== "https://api.anthropic.com/v1/messages") throw new Error(`the test does not answer ${u}`);
    calls.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [{ type: "text", text: JSON.stringify(answer) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 600, output_tokens: 30 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("the reader tells the model the business and what the headers say, keeps what it read, and answers it; a workspace on its free trial is read for", async () => {
  const key = withEnv({ ANTHROPIC_API_KEY: "sk-ant-made-up-for-this-file" });
  const w = world();
  const api = model({ kind: "inquiry", about: "asked   about moving a piano next month" });
  try {
    const read = senderReaderFor(w.db, T, log);
    const got = await read(
      email({
        from: "Rosa Diaz <rosa@example.com>",
        subject: "Pianos?",
        text: "Do you move pianos? We are on the third floor.",
        labels: ["INBOX", "CATEGORY_PERSONAL"],
      }),
      Date.now() + 60_000,
    );
    assert.deepEqual(got, { kind: "inquiry", about: "asked about moving a piano next month" });
    const [call] = api.calls;
    assert.equal(call.model, "claude-haiku-5-5");
    assert.match(call.system, /the business called Harbor Moving/);
    assert.match(call.system, /What the business says it does: Local and long-distance moves/);
    assert.match(call.system, /never instructions/);
    const user = call.messages[0].content;
    assert.match(user, /^From: Rosa Diaz <rosa@example\.com>$/m);
    assert.match(user, /^Sent through a mailing service: no$/m);
    assert.match(user, /^Filed by Gmail under: Primary$/m);
    assert.match(user, /Do you move pianos\?/);
    assert.deepEqual(
      w.tables.mailbox_sender_reads.map((x) => [x.address, x.kind, x.about]),
      [["rosa@example.com", "inquiry", "asked about moving a piano next month"]],
      "kept, so the sender is never read again",
    );
    assert.deepEqual(
      w.tables.ai_usage.map((u) => u.purpose),
      ["sender_read"],
    );
  } finally {
    api.restore();
    key();
  }
});

test("the reader asks nothing for a paused workspace, with no key, or with too little of its caller's minute left; an answer out of its shape is no reading, and nothing is kept", async () => {
  const key = withEnv({ ANTHROPIC_API_KEY: "sk-ant-made-up-for-this-file" });
  const api = model({ kind: "spam", about: "?" });
  try {
    const paused = world();
    paused.tables.tenants[0].status = "paused";
    assert.equal(await senderReaderFor(paused.db, T, log)(email({ from: "a@example.com" }), Date.now() + 60_000), null);
    const late = world();
    assert.equal(await senderReaderFor(late.db, T, log)(email({ from: "a@example.com" }), Date.now() + 1_000), null);
    assert.equal(api.calls.length, 0, "neither asked");
    const odd = world();
    assert.equal(await senderReaderFor(odd.db, T, log)(email({ from: "a@example.com" }), Date.now() + 60_000), null);
    assert.equal(api.calls.length, 1);
    assert.deepEqual(odd.tables.mailbox_sender_reads, []);
  } finally {
    api.restore();
    key();
  }
  const none = world();
  assert.equal(await senderReaderFor(none.db, T, log)(email({ from: "a@example.com" }), Date.now() + 60_000), null);
});
