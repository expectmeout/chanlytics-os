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
import { reasonLabelOf } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { at, knock, answer, wire, refusedAtTheDoor, vault } from "../_cron-doors-world.mjs";

// Each test file is its own process, so this is the whole environment. The
// mailer and the platform mailbox are configured; no workspace is the
// environment's own, so the env pair is nobody's mailbox but the platform's.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.harbor.test";
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

function world(
  candidates,
  {
    deadman_candidates = () => candidates,
    messages = [],
    jobs = [],
    broadcasts = [],
    fail = {},
    // Each message the sweep stamps handled, as it is stamped: where a case spends the function's time.
    stamped = () => {},
  } = {},
) {
  const tables = {
    tenants: [{ id: A, name: "Harbor Moving", slug: "harbor", timezone: "UTC", status: "active" }],
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
    broadcasts,
    escalations: [],
  };
  const marks = [];
  const db = fakeDb(tables, fail, {
    ...vault,
    deadman_candidates,
    deadman_mark_alerted: (a) => {
      marks.push(a.p_ids);
      return a.p_ids.length;
    },
    // The real one stamps meta.processed_at on the row (migration 00003).
    mark_processed: (a) => {
      const m = tables.messages.find((x) => x.id === a.p_message_id && x.tenant_id === a.p_tenant_id);
      if (m) m.meta = { ...(m.meta ?? {}), processed_at: new Date().toISOString() };
      stamped(a.p_message_id);
      return null;
    },
  });
  setPg(db);
  return { db, tables, marks, tick: () => knock(POST, "deadman") };
}
const bell = (w, tenant) => w.tables.notifications.filter((n) => n.tenant_id === tenant);
/** The holds' events: owner_notice tells the owner of each, once, after the commit (decision 0043). */
const told = (w) =>
  (w.tables.events ?? [])
    .filter((e) => e.kind === "escalation.opened" || e.kind === "escalation.changed")
    .map((e) => e.subject_id);
/** The two newer questions the tick asks (lib/unfinished.ts), finding nothing. */
const quiet = { unanswered: 0, orphaned: 0, told: 0, stranded: 0 };

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
    assert.deepEqual(
      w.db.seen.filter((s) => s.rpc === "deadman_candidates").map((s) => s.args),
      [{ p_older_than: "2 hours" }],
      "how long a customer may wait on a human before this is a problem",
    );
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.marks, []);
  } finally {
    line.restore();
  }
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
    assert.equal(
      rows[0].route,
      "inbox/th-cv-e-a1",
      "the bell sends the reader to THE CONVERSATION the sweep holds (it opened the Inbox, whose top is not that customer)",
    );
    assert.deepEqual(
      [rows[0].subject_type, rows[0].subject_id],
      ["conversation", "cv-e-a1"],
      "and says whose it is, so the bell can pair it with the customer's derived 'needs you' row (dedupeFeed)",
    );
    assert.equal(rows[0].title, "Still waiting: a customer has had no answer for 3 hours");
    assert.match(rows[0].body, new RegExp(`Customer: \\${CUSTOMER}`));
    assert.match(rows[0].body, /Flagged because: customer_asked_for_human/);
    assert.match(rows[0].body, new RegExp(`Detail: ${DETAIL}`));

    const mail = line.mail();
    assert.equal(mail.length, 1, "the owner's mail, and no platform note: the workspace could be reached");
    assert.deepEqual(mail[0].to, [OWNER], "the workspace's own mailbox, never the platform's");
    assert.equal(
      mail[0].from,
      "Pager <pager@platform.test>",
      "sent from the platform's verified sender, since the workspace set none",
    );
    assert.equal(mail[0].subject, rows[0].title);
    assert.ok(
      mail[0].text.endsWith("\n\nOpen it: https://app.harbor.test/w/harbor/inbox/th-cv-e-a1"),
      "and ends with the link to that conversation, the page the bell and the phone open",
    );
    assert.ok(
      mail[0].text.includes(CUSTOMER) && mail[0].text.includes(DETAIL),
      "full detail: this mailbox belongs to the business whose customer it is",
    );

    assert.deepEqual(w.marks, [["e-a1"]], "stamped: raised once however long it stays open");
    assert.deepEqual(w.tables.operator_pages, [], "nothing for the pager");
  } finally {
    line.restore();
  }
});

test("a person who asked to stop waits for nobody: settled once without a warning, so it never holds a place among the oldest; a person the owner handles waits on the owner, and is warned", async () => {
  // 11 Oct 2026: "a customer has had no answer for N hours" was said of an opt-out, and it came back every tick.
  const w = world([
    waiting("e-stop", A, { reason: "opt_out" }),
    waiting("e-held", A, { reason: "person_hold" }),
    waiting("e-a1", A),
  ]);
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.flagged, 2, "the two customers still waiting are warned");
    assert.equal(bell(w, A).length, 2);
    assert.deepEqual(
      // Each reason in the owner's words (contracts reasonLabelOf), never its token.
      bell(w, A).map((r) => /Flagged because: (.+)/.exec(r.body)?.[1]),
      [reasonLabelOf("person_hold"), reasonLabelOf("customer_asked_for_human")],
    );
    assert.deepEqual(
      w.marks,
      [["e-stop"], ["e-held"], ["e-a1"]],
      "each settled once: the opt-out unwarned, two warned",
    );
  } finally {
    line.restore();
  }
});

test("a mail the mailer refuses earns no stamp: the bell row stays (it is the workspace's own record) and the next tick will try again", async () => {
  const w = world([waiting("e-a2", A)]);
  const refused = wire(() => new Response("invalid api key", { status: 401 }));
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 0, ...quiet }]);
    assert.equal(bell(w, A).length, 1, "the row first, addressed or not");
    assert.equal(refused.mail().length, 1, "it tried");
    assert.deepEqual(w.marks, [], "undelivered: not stamped, so the customer is not marked as handled");
  } finally {
    refused.restore();
  }
});

test("REGRESSION: a mail refused tick after tick keeps one row on the bell for the hold, not one a tick; the mailer back, its mail goes alone, the hold is stamped, and the row is still one (the wiring's second audit, S6-4)", async () => {
  const w = world([waiting("e-a3", A)]);
  let up = false;
  const mailer = wire(() =>
    up
      ? new Response(JSON.stringify({ id: "email-1" }), { status: 200 })
      : new Response("rate limited", { status: 429 }),
  );
  try {
    await w.tick();
    await w.tick();
    assert.equal(bell(w, A).length, 1, "one row for the hold however often its mail is refused");
    assert.ok(bell(w, A)[0].mail_due_at, "and it says its mail is owed");
    assert.equal(mailer.mail().length, 2, "each tick tried the mail");
    assert.deepEqual(w.marks, []);
    assert.equal(
      w.tables.jobs.filter((j) => j.kind === "push_send").length,
      1,
      "the phones were told once, with the row",
    );

    up = true;
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 1, flagged: 1, ...quiet }]);
    assert.equal(mailer.mail().length, 3);
    assert.deepEqual(w.marks, [["e-a3"]], "told in full: stamped");
    assert.equal(bell(w, A).length, 1, "still one row");
    assert.equal(bell(w, A)[0].mail_due_at, null, "its mail went");
  } finally {
    mailer.restore();
  }
});

/* ---------------------------------------------------------- nobody on file */

test("a workspace with nobody on file: skipped -- no bell, no mail, never stamped -- and the platform paged once per workspace, by a row that remembers across ticks; the page names the workspace and never the customer", async () => {
  // Two open escalations in the same workspace, and the rows come back next
  // tick because nothing was stamped: the flood this pager exists to prevent.
  const w = world([
    waiting("e-b1", B),
    waiting("e-b2", B, { conversation_id: "cv-other", phone_e164: "+19175550199" }),
  ]);
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
    for (const secret of [CUSTOMER, "+19175550199", DETAIL, "cv-"])
      assert.ok(!mail[0].text.includes(secret), `never the customer: ${secret}`);

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
  } finally {
    line.restore();
  }
});

test("both in one tick: the reachable workspace is warned and stamped, the unreachable one is paged, and neither hears about the other", async () => {
  const w = world([waiting("e-b3", B), waiting("e-a3", A), waiting("e-b4", B)]);
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 3, flagged: 1, ...quiet }]);
    assert.deepEqual(w.marks, [["e-a3"]]);
    assert.deepEqual(
      bell(w, A).map((r) => r.kind),
      ["deadman"],
    );
    assert.deepEqual(bell(w, B), []);
    const mail = line.mail();
    assert.deepEqual(
      mail.map((m) => m.to),
      [[OWNER], ["ops@platform.test"]],
      "the owner's warning, then the platform's page",
    );
    assert.ok(
      !mail[1].text.includes(A) && !mail[0].text.includes(B),
      "one business is never described in another's mail",
    );
    assert.deepEqual(
      w.tables.operator_pages.map((p) => p.key),
      [`deadman_unaddressable:${B}`],
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- the minute */

test("each delivered warning is stamped the moment it is delivered, before the next is started: a tick the platform kills part way warns nobody twice", async () => {
  // Stamped all at once after the last of up to fifty warnings, a tick killed at the function's minute stamped nothing,
  // and every owner was warned again ten minutes later.
  const w = world([waiting("e-a1", A), waiting("e-a2", A, { conversation_id: "cv-other" })]);
  const stampedBeforeEachMail = [];
  const line = wire((url) => {
    if (url.includes("api.resend.com")) stampedBeforeEachMail.push(w.marks.flat());
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 2, ...quiet }]);
    assert.deepEqual(
      stampedBeforeEachMail,
      [[], ["e-a1"]],
      "the first warning was stamped before the second one's mail left",
    );
    assert.deepEqual(w.marks, [["e-a1"], ["e-a2"]]);
  } finally {
    line.restore();
  }
});

test("past the tick's budget no warning is started: the rest wait, unstamped and oldest first, and the next tick warns them once", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const all = [waiting("e-a1", A), waiting("e-a2", A, { conversation_id: "cv-2" }), waiting("e-a3", A)];
  // deadman_candidates as the database answers it: the open escalations nobody has stamped.
  const w = world(null, { deadman_candidates: () => all.filter((c) => !w.marks.flat().includes(c.escalation_id)) });
  let mails = 0;
  // The first warning's mail takes the rest of the function's minute.
  const line = wire(() => {
    mails += 1;
    if (mails === 1) t.mock.timers.tick(60_000);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 3, flagged: 1, ...quiet }]);
    assert.deepEqual(w.marks, [["e-a1"]], "the one delivered is stamped; the two never started are not");
    assert.equal(bell(w, A).length, 1, "and nobody was told of them yet");

    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, candidates: 2, flagged: 2, ...quiet }]);
    assert.deepEqual(w.marks, [["e-a1"], ["e-a2"], ["e-a3"]], "each warned once, in turn");
    assert.equal(bell(w, A).length, 3);
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- cannot be read */

/* ------------------------------------------------- the unfinished */

const M = 60_000;
// The channel is load-bearing now: this sweep claims only the channels whose

// intake runs inside the webhook, because a row a JOB is still working on is

// in progress rather than abandoned (edge unfinished.ts INLINE_INTAKE).

const inbound = (id, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id: `cv-${id}`,
  channel: "whatsapp",
  direction: "inbound",
  sender: "customer",
  body: "are you open tomorrow?",
  status: "received",
  created_at: ago(5 * M),
  meta: {},
  ...over,
});
const outbound = (id, conversation_id, over = {}) => ({
  id,
  tenant_id: A,
  conversation_id,
  channel: "whatsapp",
  direction: "outbound",
  sender: "ai",
  body: "Yes, from 9.",
  status: "sent",
  created_at: ago(4 * M),
  meta: {},
  ...over,
});

test("a customer's message the handler never finished with: flagged for a person with the customer's words, told by its hold's event, stamped handled so it is raised once; a fresh one is left for the handler", async () => {
  const w = world([], { messages: [inbound("m-old"), inbound("m-fresh", { created_at: ago(1 * M) })] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 1, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.equal(w.tables.escalations.length, 1);
    assert.equal(w.tables.escalations[0].conversation_id, "cv-m-old");
    assert.equal(
      w.tables.escalations[0].reason,
      "brain_error",
      "the receptionist did not answer: the reason the Inbox already has words for",
    );
    assert.match(w.tables.escalations[0].details, /never answered this/);
    assert.match(w.tables.escalations[0].details, /are you open tomorrow\?/, "the customer's words travel with it");
    assert.match(w.tables.escalations[0].details, /No reply has been sent/);
    assert.deepEqual(told(w), ["cv-m-old"], "the hold's event, which tells the owner after the commit");
    assert.deepEqual([bell(w, A), line.mail()], [[], []], "and the sweep tells nobody itself");
    assert.ok(w.tables.messages.find((m) => m.id === "m-old").meta.processed_at, "stamped handled");
    assert.ok(
      !w.tables.messages.find((m) => m.id === "m-fresh").meta.processed_at,
      "a minute old is the handler's, not the sweep's",
    );
    // The next tick finds nothing: raised once.
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.equal(w.tables.escalations.length, 1);
  } finally {
    line.restore();
  }
});

test("a hold the database refused is told by the sweep itself, in its own words: the customer with no answer, and the reply that never left", async () => {
  const orphan = {
    id: "q-orphan",
    tenant_id: A,
    conversation_id: "cv-q",
    direction: "outbound",
    sender: "human",
    body: "See you at 3",
    status: "queued",
    created_at: ago(15 * M),
    meta: {},
  };
  const w = world([], {
    messages: [inbound("m-old"), orphan],
    fail: { "escalations.insert": { message: "the database is down" } },
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 1, orphaned: 1, told: 2, stranded: 0 },
    ]);
    assert.deepEqual([w.tables.escalations, told(w)], [[], []], "no hold was kept, so no event will tell");
    const rows = bell(w, A);
    assert.deepEqual(
      rows.map((r) => r.title),
      ["A customer wrote and nothing answered", "A reply never left"],
    );
    assert.deepEqual(
      rows.map((r) => [r.route, r.subject_type, r.subject_id]),
      [
        ["inbox/th-cv-m-old", "conversation", "cv-m-old"],
        ["inbox/th-cv-q", "conversation", "cv-q"],
      ],
      "each opens the conversation it is about, and names it",
    );
    assert.match(rows[0].body, /are you open tomorrow\?/);
    assert.match(rows[0].body, /nothing will be sent on its own/);
    assert.match(rows[1].body, /no job was left to send this/);
    assert.equal(line.mail().length, 2, "the owner's mail, for each");
  } finally {
    line.restore();
  }
});

test("a text whose answer is a job still waiting or running is that job's, not abandoned; once the job has failed for good, or the ledger has left it ten minutes overdue, the text is this sweep's", async () => {
  const text = (id) => inbound(id, { channel: "sms" });
  const job = (id, message, state, due = ago(4 * M)) => ({
    id,
    tenant_id: A,
    kind: "inbound_answer",
    state,
    due_at: due,
    payload: { message_id: message },
  });
  const w = world([], {
    messages: [text("t-waiting"), text("t-running"), text("t-failed"), text("t-stalled")],
    jobs: [
      job("j1", "t-waiting", "scheduled"),
      job("j2", "t-running", "fired"),
      job("j3", "t-failed", "failed"),
      // Due a quarter of an hour ago and never claimed: the ledger stopped, and the customer is waiting.
      job("j4", "t-stalled", "scheduled", ago(15 * M)),
    ],
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 2, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.deepEqual(
      w.tables.escalations.map((e) => [e.conversation_id, e.reason]).sort(),
      [
        ["cv-t-failed", "brain_error"],
        ["cv-t-stalled", "brain_error"],
      ],
      "the text whose job gave up, and the one whose job the ledger never claimed, are handed to a person",
    );
    for (const id of ["t-waiting", "t-running"])
      assert.ok(!w.tables.messages.find((m) => m.id === id).meta.processed_at, `${id}: its job's to finish, unstamped`);
  } finally {
    line.restore();
  }
});

test("a reply that went out before the stamp is not a customer with no answer: stamped quietly, nobody told", async () => {
  const w = world([], { messages: [inbound("m-1"), outbound("o-1", "cv-m-1")] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.equal(w.tables.escalations.length, 0);
    assert.equal(bell(w, A).length, 0);
    assert.ok(
      w.tables.messages.find((m) => m.id === "m-1").meta.processed_at,
      "stamped: the crash was between the send and the mark",
    );
  } finally {
    line.restore();
  }
});

test("a broadcast, a playbook's reminder, a reach-out's email, and a reply that failed or was withdrawn are nobody's answer: the customer is still raised; a held draft is an answer in hand", async () => {
  // Every outbound row after the message counted as a reply, so a reminder that went out in the same hour marked the
  // customer answered, and nobody was told they had had no reply.
  const w = world([], {
    messages: [
      inbound("m-b"),
      outbound("o-b", "cv-m-b", {
        sender: "human",
        meta: { source: "broadcast", broadcast_id: "b-1", broadcast_name: "Spring" },
      }),
      inbound("m-p"),
      outbound("o-p", "cv-m-p", {
        sender: "human",
        status: "delivered",
        meta: { source: "broadcast", broadcast_id: "b-2", playbook_id: "pb-1", playbook_name: "Visit tomorrow" },
      }),
      inbound("m-r", { channel: "sms" }),
      outbound("o-r", "cv-m-r", { channel: "email", sender: "human", meta: { source: "reach_out" } }),
      inbound("m-f"),
      outbound("o-f", "cv-m-f", { status: "failed" }),
      inbound("m-c"),
      outbound("o-c", "cv-m-c", { status: "canceled" }),
      // Written in the veto window and sent by its own job: the customer's answer is in hand.
      inbound("m-q"),
      outbound("o-q", "cv-m-q", { status: "queued", meta: { source: "veto_window", delay_ms: 600_000 } }),
    ],
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 5, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.deepEqual(w.tables.escalations.map((e) => [e.conversation_id, e.reason]).sort(), [
      ["cv-m-b", "brain_error"],
      ["cv-m-c", "brain_error"],
      ["cv-m-f", "brain_error"],
      ["cv-m-p", "brain_error"],
      ["cv-m-r", "brain_error"],
    ]);
    assert.match(
      w.tables.escalations.find((e) => e.conversation_id === "cv-m-b").details,
      /No reply has been sent/,
      "true with a broadcast on the thread: it was sent, and it was no reply",
    );
    for (const id of ["m-b", "m-p", "m-r", "m-f", "m-c", "m-q"])
      assert.ok(w.tables.messages.find((m) => m.id === id).meta.processed_at, `${id}: stamped handled`);
    assert.equal(w.tables.messages.find((m) => m.id === "o-q").status, "queued", "the draft is its job's to send");
  } finally {
    line.restore();
  }
});

test("past its budget the unfinished question raises no more: the rest keep no stamp, and the next tick raises them", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  let stamps = 0;
  const w = world([], {
    messages: [inbound("m-1", { created_at: ago(6 * M) }), inbound("m-2")],
    // The first question raised takes the rest of the function's minute.
    stamped: () => {
      stamps += 1;
      if (stamps === 1) t.mock.timers.tick(60_000);
    },
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 1, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.deepEqual(
      w.tables.escalations.map((e) => e.conversation_id),
      ["cv-m-1"],
    );
    assert.ok(!w.tables.messages.find((m) => m.id === "m-2").meta.processed_at, "left for the next tick, unstamped");

    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 1, orphaned: 0, told: 0, stranded: 0 },
    ]);
    assert.deepEqual(
      w.tables.escalations.map((e) => e.conversation_id),
      ["cv-m-1", "cv-m-2"],
    );
  } finally {
    line.restore();
  }
});

test("a queued reply with no job to send it is failed with an honest note and the thread flagged; one with a live job, and a fresh one, are left alone", async () => {
  const orphan = {
    id: "q-orphan",
    tenant_id: A,
    conversation_id: "cv-q",
    direction: "outbound",
    sender: "human",
    body: "See you at 3",
    status: "queued",
    created_at: ago(15 * M),
    meta: {},
  };
  const alive = { ...orphan, id: "q-alive", conversation_id: "cv-alive" };
  const fresh = { ...orphan, id: "q-fresh", conversation_id: "cv-fresh", created_at: ago(1 * M) };
  const w = world([], {
    messages: [orphan, alive, fresh],
    jobs: [{ id: "j1", tenant_id: A, kind: "outbound_send", state: "scheduled", payload: { message_id: "q-alive" } }],
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 0, orphaned: 1, told: 0, stranded: 0 },
    ]);
    const row = w.tables.messages.find((m) => m.id === "q-orphan");
    assert.equal(row.status, "failed");
    assert.deepEqual(row.error, { reason: "orphaned", note: "no job was left to send this" });
    assert.equal(
      w.tables.messages.find((m) => m.id === "q-alive").status,
      "queued",
      "its job is scheduled: the tick will send it",
    );
    assert.equal(w.tables.messages.find((m) => m.id === "q-fresh").status, "queued", "inside its window still");
    assert.equal(w.tables.escalations.length, 1);
    assert.equal(w.tables.escalations[0].reason, "send_failed");
    assert.match(w.tables.escalations[0].details, /A reply never left: no job was left to send this/);
    assert.deepEqual([told(w), bell(w, A)], [["cv-q"], []], "told by the hold's event, not by the sweep");
  } finally {
    line.restore();
  }
});

test("a campaign's email with no job is failed the same way, and flags no thread and tells nobody: its run counts it (Reach out D4)", async () => {
  const cold = {
    id: "q-cold",
    tenant_id: A,
    conversation_id: "cv-cold",
    direction: "outbound",
    sender: "human",
    body: "Saw your shop on the map.",
    status: "queued",
    created_at: ago(15 * M),
    meta: {
      source: "reach_out",
      email: { request: { headers: { "List-Unsubscribe": "<https://app.chanlytics.com/u/token>" } } },
    },
  };
  const w = world([], { messages: [cold] });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [
      200,
      { ok: true, flagged: 0, unanswered: 0, orphaned: 1, told: 0, stranded: 0 },
    ]);
    const row = w.tables.messages.find((m) => m.id === "q-cold");
    assert.deepEqual(
      [row.status, row.error.reason],
      ["failed", "orphaned"],
      "orphaned: the clock plans its send again",
    );
    assert.equal(w.tables.escalations.length, 0, "no thread nobody wrote on is flagged");
    assert.equal(bell(w, A).length, 0, "and nobody is told");
  } finally {
    line.restore();
  }
});

test("the unfinished questions failing does not cost the two-hour watchdog its tick", async () => {
  const w = world([waiting("e-a1", A)], {
    messages: [inbound("m-1")],
    fail: { "messages.select": { message: "connection reset" } },
  });
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.flagged, 1, "the escalation nobody picked up is still raised");
    assert.equal(body.unanswered, 0);
  } finally {
    line.restore();
  }
});

test("candidates that cannot be read are a 500, and nothing is told", async () => {
  const w = world(null, {
    deadman_candidates: () => {
      throw new Error("permission denied for function deadman_candidates");
    },
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [500, { ok: false }]);
    assert.deepEqual(line.mail(), []);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(w.tables.operator_pages, []);
  } finally {
    line.restore();
  }
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
    assert.deepEqual(
      await answer(await w.tick()),
      [200, { ok: true, flagged: 0, unanswered: 0, orphaned: 0, told: 0, stranded: 0 }],
      "nothing found, because nothing here was abandoned",
    );
    assert.deepEqual(w.tables.escalations, [], "no hold invented for work in flight");
    assert.equal(email.meta.processed_at, undefined, "and the intake's own mark is left for the intake");
  } finally {
    line.restore();
  }
});

test("a run still scheduled past its time with nothing on the ledger to send it is marked not sent and its owner told, once; one with a live job, a reach-out's, and one not yet due are left alone", async () => {
  // An approval moved the run and could neither write its job nor put it back to wait (core approveRun): the page said
  // "Scheduled" for ever, and the ledger, which settles a run whose JOB died, never heard of it (wiring review P2 9).
  const run = (id, over = {}) => ({
    id,
    tenant_id: A,
    name: `Run ${id}`,
    state: "scheduled",
    playbook_id: null,
    audience: { kind: "everyone", id: null, label: "Everyone" },
    scheduled_for: ago(30 * M),
    failure: null,
    finished_at: null,
    ...over,
  });
  const w = world([], {
    broadcasts: [
      run("b-stranded"),
      run("b-moment", {
        playbook_id: "pb-1",
        audience: { kind: "playbook", id: "pb-1", label: "Win-back", trigger: "quiet_30" },
      }),
      run("b-live"),
      run("b-reach", {
        playbook_id: "st-1",
        audience: { kind: "reach_out", root_id: "st-1", step_id: "st-1", label: "Dentists" },
      }),
      run("b-soon", { scheduled_for: ago(2 * M) }),
      run("b-old", { scheduled_for: ago(9 * 24 * H) }),
    ],
    jobs: [{ id: "j-live", tenant_id: A, kind: "broadcast_send", state: "fired", payload: { broadcast_id: "b-live" } }],
  });
  const line = wire();
  try {
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, ...quiet, stranded: 2 }]);
    const state = Object.fromEntries(w.tables.broadcasts.map((b) => [b.id, [b.state, b.failure]]));
    assert.deepEqual(state, {
      "b-stranded": ["failed", "run_interrupted"],
      "b-moment": ["failed", "run_interrupted"],
      "b-live": ["scheduled", null],
      "b-reach": ["scheduled", null],
      "b-soon": ["scheduled", null],
      "b-old": ["scheduled", null],
    });
    const told = bell(w, A);
    assert.deepEqual(
      told.map((n) => [n.kind, n.title, n.route, n.subject_type, n.subject_id]),
      [
        [
          "broadcast_stopped",
          "Broadcast “Run b-stranded” not sent",
          "broadcasts/run:b-stranded",
          "broadcast",
          "b-stranded",
        ],
        ["broadcast_stopped", "Broadcast “Run b-moment” not sent", "broadcasts/run:b-moment", "broadcast", "b-moment"],
      ],
    );
    assert.equal(
      told[0].body,
      "It was due to go out, and nothing was left to send it, so it is marked not sent. Nobody got it, so sending it again reaches nobody twice.",
    );
    assert.match(
      told[1].body,
      /tomorrow's run reaches the people this one did not/,
      "a playbook's run is never told to send it again",
    );
    assert.doesNotMatch(told[1].body, /send it again/i);
    assert.equal(
      line.mail().filter((m) => m.to.includes(OWNER)).length,
      2,
      "and by mail, to the workspace's own mailbox",
    );

    // The next tick finds nothing: each is told once.
    assert.deepEqual(await answer(await w.tick()), [200, { ok: true, flagged: 0, ...quiet }]);
    assert.equal(bell(w, A).length, 2);
  } finally {
    line.restore();
  }
});

test("a page of reach-out runs ahead of it does not hide a stranded run, and only a job that is scheduled or fired counts as one coming", async () => {
  // A reach-out's run waits scheduled with no broadcast job until its clock writes its first email: sixty of them, older
  // than the run this is for, filled the page the watchdog reads before it could see that run.
  const reach = (i) => ({
    id: `b-reach-${i}`,
    tenant_id: A,
    name: `Reach ${i}`,
    state: "scheduled",
    playbook_id: `st-${i}`,
    audience: { kind: "reach_out", root_id: `st-${i}`, step_id: `st-${i}`, label: "Dentists" },
    scheduled_for: ago(2 * H + i * M),
    failure: null,
    finished_at: null,
  });
  const run = (id, over = {}) => ({
    id,
    tenant_id: A,
    name: `Run ${id}`,
    state: "scheduled",
    playbook_id: null,
    audience: null,
    scheduled_for: ago(30 * M),
    failure: null,
    finished_at: null,
    ...over,
  });
  const job = (id, state, broadcast) => ({
    id,
    tenant_id: A,
    kind: "broadcast_send",
    state,
    payload: { broadcast_id: broadcast },
  });
  const w = world([], {
    broadcasts: [
      ...Array.from({ length: 60 }, (_, i) => reach(i)),
      // An audience with no kind at all (a run made before audiences had one) is not a reach-out's.
      run("b-kindless"),
      run("b-waiting", { audience: { kind: "everyone" } }),
      run("b-done-job", { audience: { kind: "everyone" } }),
      run("b-canceled-job", { audience: { kind: "everyone" } }),
    ],
    jobs: [
      job("j-1", "scheduled", "b-waiting"),
      job("j-2", "done", "b-done-job"),
      job("j-3", "canceled", "b-canceled-job"),
    ],
  });
  const line = wire();
  try {
    const [, body] = await answer(await w.tick());
    assert.equal(body.stranded, 3);
    const failed = w.tables.broadcasts.filter((b) => b.state === "failed").map((b) => b.id);
    assert.deepEqual(
      failed,
      ["b-kindless", "b-done-job", "b-canceled-job"],
      "a job done or canceled is not one coming",
    );
    assert.equal(w.tables.broadcasts.find((b) => b.id === "b-waiting").state, "scheduled", "its job will start it");
    assert.ok(w.tables.broadcasts.filter((b) => b.id.startsWith("b-reach")).every((b) => b.state === "scheduled"));
  } finally {
    line.restore();
  }
});

test("a notice that cannot be given is an error line, and the run stays marked not sent; past the tick's budget the rest wait for the next", async () => {
  const run = (id) => ({
    id,
    tenant_id: A,
    name: `Run ${id}`,
    state: "scheduled",
    playbook_id: null,
    audience: null,
    scheduled_for: ago(30 * M),
    failure: null,
    finished_at: null,
  });
  // The bell row cannot be written, so nobody is told: the mail is not sent without it (notifyOnce).
  const w = world([], { broadcasts: [run("b-1")], fail: { "notifications.insert": { message: "bell is down" } } });
  const line = wire();
  const logged = [];
  // Both streams: the logger writes an error line where the platform reads errors.
  const kept = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };
  process.stdout.write = (chunk, ...rest) => (logged.push(String(chunk)), kept.out(chunk, ...rest));
  process.stderr.write = (chunk, ...rest) => (logged.push(String(chunk)), kept.err(chunk, ...rest));
  try {
    const [, body] = await answer(await w.tick());
    assert.equal(body.stranded, 1);
    assert.equal(w.tables.broadcasts[0].state, "failed");
    assert.deepEqual(
      line.mail().filter((m) => m.to.includes(OWNER)),
      [],
      "no mail without its row",
    );
    assert.ok(
      logged.some((l) => l.includes('"stranded_run_untold"')),
      "said where alerting reads it",
    );
    assert.ok(!logged.some((l) => l.includes('"stranded_run_failed"')));
  } finally {
    process.stdout.write = kept.out;
    process.stderr.write = kept.err;
    line.restore();
  }
  // The budget: the watchdog stops telling once the tick has spent it.
  const { sweepStrandedRuns } = await import(at("apps/edge/lib/ops/stranded-runs.ts"));
  const late = world([], { broadcasts: [run("b-2"), run("b-3")] });
  const quietLog = { warn() {}, error() {}, info() {} };
  const r = await sweepStrandedRuns({
    db: late.db,
    L: quietLog,
    notifyOnce: async () => true,
    loadTenantNotifications: async () => ({ notifications: null, isEnvDefault: false }),
    deadline: Date.now() - 1,
  });
  assert.deepEqual(r, { stranded: 0 });
  assert.ok(
    late.tables.broadcasts.every((b) => b.state === "scheduled"),
    "left for the next tick",
  );
});

test("the stranded runs failing to read does not cost the watchdog its tick", async () => {
  const w = world([waiting("e-a1", A)], { fail: { "sequence_batches.select": { message: "connection reset" } } });
  const line = wire();
  try {
    const [status, body] = await answer(await w.tick());
    assert.equal(status, 200);
    assert.equal(body.flagged, 1, "the escalation nobody picked up is still raised");
    assert.equal(body.stranded, 0);
  } finally {
    line.restore();
  }
});
