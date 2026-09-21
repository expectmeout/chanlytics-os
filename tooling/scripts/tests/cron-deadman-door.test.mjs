/**
 * The deadman sweep, run: POST /api/cron/deadman over a database in memory
 * and a captured wire to the mailer. Until 13 Sep 2026 its text was pinned
 * and its POST had never been called.
 *
 * An escalation nobody picked up in two hours is a candidate. A workspace
 * with somebody on file is told -- a row on its bell of kind `deadman`, and a
 * mail carrying the customer to the workspace's OWN mailbox -- and the
 * escalation is stamped, so it is raised at most once however long it stays
 * open. A workspace with nobody on file is not warned from here at all and
 * its escalation is left unstamped; the platform is told through the pager
 * that remembers, one page per workspace per six hours, carrying the
 * workspace and never the customer. Only a delivered warning earns the stamp.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { at, knock, answer, wire, refusedAtTheDoor, vault } from "./_cron-doors-world.mjs";

// Each test file is its own process, so this is the whole environment. The
// mailer and the platform mailbox are configured; no workspace is the
// environment's own, so the env pair is nobody's mailbox but the platform's.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/cron/deadman.ts"));
after(() => setPg(null));

const H = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** Harbor Moving: its owner is on file. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** A self-serve workspace in its default state: nobody on file. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "owner@harbor.test";
const CUSTOMER = "+16465550123";
const DETAIL = "asked for a quote on moving a piano";

/** One row of deadman_candidates(): an open escalation, three hours old, nobody stamped it. */
const waiting = (id, tenant, over = {}) => ({
  escalation_id: id,
  tenant_id: tenant,
  conversation_id: `cv-${id}`,
  reason: "customer_asked_for_human",
  details: DETAIL,
  opened_at: ago(3 * H),
  phone_e164: CUSTOMER,
  ...over,
});

/* -------------------------------------------------------------- the world */

function world(candidates, { deadman_candidates = () => candidates, messages = [], jobs = [], fail = {} } = {}) {
  const tables = {
    tenant_config: [
      { tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } },
      { tenant_id: B, config: {} },
    ],
    tenant_channels: [
      { tenant_id: A, kind: "whatsapp", status: "active", external_id: "wa-harbor" },
      { tenant_id: B, kind: "whatsapp", status: "active", external_id: "wa-probe" },
    ],
    notifications: [],
    operator_pages: [],
    messages,
    jobs,
    escalations: [],
  };
  const marks = [];
  const db = fakeDb(tables, fail, {
    ...vault,
    deadman_candidates,
    deadman_mark_alerted: (a) => { marks.push(a.p_ids); return a.p_ids.length; },
    // The real one stamps meta.processed_at on the row (migration 00003).
    mark_processed: (a) => { const m = tables.messages.find((x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id); if (m) m.meta = { ...(m.meta ?? {}), processed_at: new Date().toISOString() }; return null; },
  });
  setPg(db);
  return { db, tables, marks, tick: () => knock(POST, "deadman") };
}
const bell = (w, tenant) => w.tables.notifications.filter((n) => n.tenant_id === tenant);
/** The two newer questions the tick asks (lib/unfinished.ts), finding nothing. */
const quiet = { unanswered: 0, orphaned: 0, told: 0 };

/* -------------------------------------------------------------- the door */

test("the door: the wrong key is a 401, a key Vault cannot produce is a 503, no database is a 503", async () => {
  await refusedAtTheDoor(POST, "deadman", setPg);
});

/* --------------------------------------------------------------- nobody */

test("nobody has waited two hours: the sweep asks for exactly that and does nothing else", async () => {
  const w = world([]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, ...quiet }]);
    assert.deepEqual(w.db.seen.filter((s) => s.rpc === "deadman_candidates").map((s) => s.args), [{ p_older_than: "2 hours" }], "how long a customer may wait on a human before this is a problem");
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.marks, []);
  } finally { line.restore(); }
});

/* -------------------------------------------------------- somebody on file */

test("a workspace with its owner on file: a row of kind deadman on its bell, a mail carrying the customer to ITS mailbox, the escalation stamped once", async () => {
  const w = world([waiting("e-a1", A)]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 1, ...quiet }]);

    const rows = bell(w, A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "deadman");
    assert.equal(rows[0].route, "inbox", "the bell sends the reader to the Inbox");
    assert.equal(rows[0].title, "Still waiting: a customer has had no answer for 3 hours");
    assert.match(rows[0].body, new RegExp(`Customer: \\${CUSTOMER}`));
    assert.match(rows[0].body, /Flagged because: customer_asked_for_human/);
    assert.match(rows[0].body, new RegExp(`Detail: ${DETAIL}`));

    const mail = line.mail();
    assert.equal(mail.length, 1, "the owner's mail, and no platform note: the workspace could be reached");
    assert.deepEqual(mail[0].to, [OWNER], "the workspace's own mailbox, never the platform's");
    assert.equal(mail[0].from, "Pager <pager@platform.test>", "sent from the platform's verified sender, since the workspace set none");
    assert.equal(mail[0].subject, rows[0].title);
    assert.ok(mail[0].text.includes(CUSTOMER) && mail[0].text.includes(DETAIL), "full detail: this mailbox belongs to the business whose customer it is");

    assert.deepEqual(w.marks, [["e-a1"]], "stamped: raised once however long it stays open");
    assert.deepEqual(w.tables.operator_pages, [], "nothing for the pager");
  } finally { line.restore(); }
});

test("a mail the mailer refuses earns no stamp: the bell row stays (it is the workspace's own record) and the next tick will try again", async () => {
  const w = world([waiting("e-a2", A)]);
  const refused = wire(() => new Response("invalid api key", { status: 401 }));
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 0, ...quiet }]);
    assert.equal(bell(w, A).length, 1, "the row first, addressed or not");
    assert.equal(refused.mail().length, 1, "it tried");
    assert.deepEqual(w.marks, [], "undelivered: not stamped, so the customer is not marked as handled");
  } finally { refused.restore(); }
});

/* ---------------------------------------------------------- nobody on file */

test("a workspace with nobody on file: skipped -- no bell, no mail, never stamped -- and the platform paged once per workspace, by a row that remembers across ticks; the page names the workspace and never the customer", async () => {
  // Two open escalations in the same workspace, and the rows come back next
  // tick because nothing was stamped: the flood this pager exists to prevent.
  const w = world([waiting("e-b1", B), waiting("e-b2", B, { conversation_id: "cv-other", phone_e164: "+19175550199" })]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 0, ...quiet }]);
    assert.deepEqual(bell(w, B), [], "not warned from here at all: nobody would see it");
    assert.deepEqual(w.marks, [], "left unstamped, so it is raised the moment somebody is on file");

    const mail = line.mail();
    assert.equal(mail.length, 1, "one page for the workspace, not one per escalation");
    assert.deepEqual(mail[0].to, ["ops@platform.test"]);
    assert.equal(mail[0].subject, "[Chanlytics] A workspace has a customer waiting and nobody to tell");
    assert.ok(mail[0].text.includes(`workspace ${B}`), "names the workspace");
    assert.match(mail[0].text, /Settings › Notifications/, "and what to do");
    for (const secret of [CUSTOMER, "+19175550199", DETAIL, "cv-"]) assert.ok(!mail[0].text.includes(secret), `never the customer: ${secret}`);

    assert.equal(w.tables.operator_pages.length, 1);
    const page = w.tables.operator_pages[0];
    assert.equal(page.key, `deadman_unaddressable:${B}`);
    assert.equal(page.count, 1);
    assert.ok(page.alerted_at, "stamped as told, because it was");

    // Ten minutes later the same rows come back. Counted; not re-paged.
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 0, ...quiet }]);
    assert.equal(line.mail().length, 1, "one page per workspace per six hours");
    assert.equal(w.tables.operator_pages[0].count, 2);
    assert.deepEqual(bell(w, B), []);
    assert.deepEqual(w.marks, []);
  } finally { line.restore(); }
});

test("both in one tick: the reachable workspace is warned and stamped, the unreachable one is paged, and neither hears about the other", async () => {
  const w = world([waiting("e-b3", B), waiting("e-a3", A), waiting("e-b4", B)]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 3, flagged: 1, ...quiet }]);
    assert.deepEqual(w.marks, [["e-a3"]]);
    assert.deepEqual(bell(w, A).map((r) => r.kind), ["deadman"]);
    assert.deepEqual(bell(w, B), []);
    const mail = line.mail();
    assert.deepEqual(mail.map((m) => m.to), [[OWNER], ["ops@platform.test"]], "the owner's warning, then the platform's page");
    assert.ok(!mail[1].text.includes(A) && !mail[0].text.includes(B), "one business is never described in another's mail");
    assert.deepEqual(w.tables.operator_pages.map((p) => p.key), [`deadman_unaddressable:${B}`]);
  } finally { line.restore(); }
});

/* ------------------------------------------------------- cannot be read */

/* ------------------------------------------------- the unfinished */

const M = 60_000;
// The channel is load-bearing now: this sweep claims only the channels whose

// intake runs inside the webhook, because a row a JOB is still working on is

// in progress rather than abandoned (edge unfinished.ts INLINE_INTAKE).

const inbound = (id, over = {}) => ({ id, tenant_id: A, conversation_id: `cv-${id}`, channel: "whatsapp", direction: "inbound", sender: "customer", body: "are you open tomorrow?", status: "received", created_at: ago(5 * M), meta: {}, ...over });
const outbound = (id, conversation_id, over = {}) => ({ id, tenant_id: A, conversation_id, channel: "whatsapp", direction: "outbound", sender: "ai", body: "Yes, from 9.", status: "sent", created_at: ago(4 * M), meta: {}, ...over });

test("a customer's message the handler never finished with: flagged for a person with the customer's words, the owner told, stamped handled so it is raised once; a fresh one is left for the handler", async () => {
  const w = world([], { messages: [inbound("m-old"), inbound("m-fresh", { created_at: ago(1 * M) })] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, unanswered: 1, orphaned: 0, told: 1 }]);
    assert.equal(w.tables.escalations.length, 1);
    assert.equal(w.tables.escalations[0].conversation_id, "cv-m-old");
    assert.equal(w.tables.escalations[0].reason, "brain_error", "the receptionist did not answer: the reason the Inbox already has words for");
    assert.match(w.tables.escalations[0].details, /never answered this/);
    assert.match(w.tables.escalations[0].details, /are you open tomorrow\?/, "the customer's words travel with it");
    assert.match(w.tables.escalations[0].details, /Nothing has been sent/);
    const rows = bell(w, A);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "A customer wrote and nothing answered");
    assert.match(rows[0].body, /are you open tomorrow\?/);
    assert.match(rows[0].body, /nothing will be sent on its own/);
    assert.equal(line.mail().length, 1, "the owner's mail");
    assert.ok(w.tables.messages.find((m) => m.id === "m-old").meta.processed_at, "stamped handled");
    assert.ok(!w.tables.messages.find((m) => m.id === "m-fresh").meta.processed_at, "a minute old is the handler's, not the sweep's");
    // The next tick finds nothing: raised once.
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0 }]);
    assert.equal(w.tables.escalations.length, 1);
  } finally { line.restore(); }
});

test("a reply that went out before the stamp is not a customer with no answer: stamped quietly, nobody told", async () => {
  const w = world([], { messages: [inbound("m-1"), outbound("o-1", "cv-m-1")] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0 }]);
    assert.equal(w.tables.escalations.length, 0);
    assert.equal(bell(w, A).length, 0);
    assert.ok(w.tables.messages.find((m) => m.id === "m-1").meta.processed_at, "stamped: the crash was between the send and the mark");
  } finally { line.restore(); }
});

test("a queued reply with no job to send it is failed with an honest note and the thread flagged; one with a live job, and a fresh one, are left alone", async () => {
  const orphan = { id: "q-orphan", tenant_id: A, conversation_id: "cv-q", direction: "outbound", sender: "human", body: "See you at 3", status: "queued", created_at: ago(15 * M), meta: {} };
  const alive = { ...orphan, id: "q-alive", conversation_id: "cv-alive" };
  const fresh = { ...orphan, id: "q-fresh", conversation_id: "cv-fresh", created_at: ago(1 * M) };
  const w = world([], { messages: [orphan, alive, fresh], jobs: [{ id: "j1", tenant_id: A, kind: "outbound_send", state: "scheduled", payload: { message_id: "q-alive" } }] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, unanswered: 0, orphaned: 1, told: 1 }]);
    const row = w.tables.messages.find((m) => m.id === "q-orphan");
    assert.equal(row.status, "failed");
    assert.deepEqual(row.error, { reason: "orphaned", note: "no job was left to send this" });
    assert.equal(w.tables.messages.find((m) => m.id === "q-alive").status, "queued", "its job is scheduled: the tick will send it");
    assert.equal(w.tables.messages.find((m) => m.id === "q-fresh").status, "queued", "inside its window still");
    assert.equal(w.tables.escalations.length, 1);
    assert.equal(w.tables.escalations[0].reason, "send_failed");
    assert.match(w.tables.escalations[0].details, /A reply never left: no job was left to send this/);
    assert.equal(bell(w, A)[0].title, "A reply never left");
  } finally { line.restore(); }
});

test("the unfinished questions failing does not cost the two-hour watchdog its tick", async () => {
  const w = world([waiting("e-a1", A)], { messages: [inbound("m-1")], fail: { "messages.select": { message: "connection reset" } } });
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.flagged, 1, "the escalation nobody picked up is still raised");
    assert.equal(body.unanswered, 0);
  } finally { line.restore(); }
});

test("candidates that cannot be read are a 500, and nothing is told", async () => {
  const w = world(null, { deadman_candidates: () => { throw new Error("permission denied for function deadman_candidates"); } });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [500, { ok: false }]);
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally { line.restore(); }
});

test("REGRESSION: an email still being taken in is not this sweep's to claim", async () => {
  // The sweep found any inbound customer message with no processed stamp after
  // three minutes, whatever channel it came in on. Email's intake is a job with
  // its own lease and its own retries, so a row it is still working on is in
  // progress -- but the sweep would flag the thread "the receptionist never
  // answered this" and mark the row handled, after which the retrying job read
  // `processed` and stopped: no email_review, no mailbox stamp, and a customer
  // answered by nobody. A watchdog may find abandoned work; it may not declare
  // somebody else's finished.
  const email = inbound("mail-1", { channel: "email", body: "can you quote a move?" });
  const w = world([], { messages: [email] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0 }],
      "nothing found, because nothing here was abandoned");
    assert.deepEqual(w.tables.escalations, [], "no hold invented for work in flight");
    assert.equal(email.meta.processed_at, undefined, "and the intake's own mark is left for the intake");
  } finally {
    line.restore();
  }
});
