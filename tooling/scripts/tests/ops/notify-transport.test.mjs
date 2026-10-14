/**
 * The alarm's transport and its one door, executed.
 *
 * Resend is the only way the edge reaches a human, and post() is the one
 * call every alert and every page rides on. Its header names three defects
 * it was written to close -- an unchecked response, no timeout, tenant-blind
 * fallbacks -- and until now nothing ran it: a test read its text for the
 * words "notify_rejected". Here the wire is a stub that answers what Resend
 * answers, and the row store is the fake database, so the order (row first,
 * then mail), the redaction and every refusal are run rather than read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { post, notify, recordNotification, platformTo, reachesTenant } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href
);

/** console.error, kept instead of printed. */
function capture() {
  const lines = [];
  const real = console.error;
  console.error = (...a) => lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  return {
    lines,
    restore: () => {
      console.error = real;
    },
  };
}

/** The logger writes one JSON object per line; find the line for an event. */
function lineFor(lines, event) {
  return lines.find((l) => {
    try {
      return JSON.parse(l).event === event;
    } catch {
      return false;
    }
  });
}

/** The wire: records every request and answers as told. */
function wire(answer) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: init?.headers,
      body: JSON.parse(init?.body ?? "null"),
      signal: init?.signal,
    });
    if (answer instanceof Error) throw answer;
    return answer();
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/** Set (or with undefined, unset) variables for one call, and put them back. */
async function withEnv(patch, fn) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const ok =
  (body = { id: "em_1" }, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("without a key nothing is sent, and the log says so without the customer's number", async () => {
  const log = capture();
  const w = wire(ok());
  try {
    await withEnv({ RESEND_API_KEY: undefined }, async () => {
      assert.equal(await post("a@x", ["b@y"], "WhatsApp handoff needed: +1 917 555 0100", "body"), false);
    });
    assert.equal(w.calls.length, 0, "no key, no request");
    const line = lineFor(log.lines, "notify_skipped_no_api_key");
    assert.ok(line, "said in the log");
    assert.ok(line.includes("[number]") && !line.includes("917"), "the subject names the customer; the log must not");
  } finally {
    log.restore();
    w.restore();
  }
});

test("a 200 from Resend is a delivery: one POST with the key as a bearer, from/to/subject/text as given, and a timeout on the request", async () => {
  const w = wire(ok());
  try {
    await withEnv({ RESEND_API_KEY: "re_test" }, async () => {
      assert.equal(await post("Chanlytics <noreply@chanlytics.com>", ["a@x", "b@y"], "Subject", "Text"), true);
    });
    assert.equal(w.calls.length, 1);
    const c = w.calls[0];
    assert.equal(c.url, "https://api.resend.com/emails");
    assert.equal(c.method, "POST");
    assert.equal(c.headers.Authorization, "Bearer re_test");
    assert.equal(c.headers["Content-Type"], "application/json");
    assert.deepEqual(c.body, {
      from: "Chanlytics <noreply@chanlytics.com>",
      to: ["a@x", "b@y"],
      subject: "Subject",
      text: "Text",
    });
    assert.ok(
      c.signal instanceof AbortSignal,
      "a request that hangs is abandoned, not awaited to the end of the invocation",
    );
  } finally {
    w.restore();
  }
});

test("a refusal (401, 422, 500) is NOT a delivery: false, with the status and the provider's first words in the log, the subject redacted", async () => {
  for (const status of [401, 422, 500]) {
    const log = capture();
    const w = wire(ok({ statusCode: status, message: "API key is invalid" }, status));
    try {
      await withEnv({ RESEND_API_KEY: "re_dead" }, async () => {
        assert.equal(
          await post("a@x", ["b@y"], "Reminder for +19175550100 tomorrow", "…"),
          false,
          `a ${status} must not read as sent`,
        );
      });
      const line = lineFor(log.lines, "notify_rejected");
      assert.ok(line, `${status} is logged`);
      const detail = JSON.parse(line);
      assert.equal(detail.status, status);
      assert.match(detail.detail, /API key is invalid/);
      assert.equal(detail.subject, "Reminder for [number] tomorrow");
    } finally {
      log.restore();
      w.restore();
    }
  }
});

test("a transport that throws (a timeout, a DNS failure) is false and logged, never thrown to the caller", async () => {
  const log = capture();
  const w = wire(new Error("The operation was aborted due to timeout"));
  try {
    await withEnv({ RESEND_API_KEY: "re_test" }, async () => {
      assert.equal(await post("a@x", ["b@y"], "s", "t"), false);
    });
    const line = lineFor(log.lines, "notify_failed");
    assert.ok(line);
    assert.match(line, /aborted due to timeout/);
  } finally {
    log.restore();
    w.restore();
  }
});

test("LEAD_TO is one address or several: split on commas, trimmed, blanks dropped; unset is nobody", async () => {
  await withEnv({ LEAD_TO: "ops@platform.test, second@platform.test,, " }, () => {
    assert.deepEqual(platformTo(), ["ops@platform.test", "second@platform.test"]);
  });
  await withEnv({ LEAD_TO: "   " }, () => assert.deepEqual(platformTo(), []));
  await withEnv({ LEAD_TO: undefined }, () => assert.deepEqual(platformTo(), []));
});

// ---- notify(): the row, the addressing, the send, together -----------------

const TENANT = "11111111-1111-4111-8111-111111111111";
const MAILBOX = { escalation_emails: ["owner@salon.example"], from: "Salon <hi@salon.example>" };
const PLATFORM_ENV = { LEAD_TO: "ops@platform.test, second@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };

function transport(result = true) {
  const sent = [];
  return {
    sent,
    send: async (from, to, subject, text) => {
      sent.push({ from, to, subject, text });
      return result;
    },
  };
}
const inserts = (db) => db.seen.filter((q) => q.table === "notifications" && q.op === "insert");

test("a failed push job's alert is kept and mailed but tells no phone, so a refusing push service does not loop", async () => {
  // A push_send that failed for good alerted job_failed, a push kind, which scheduled another push_send, which failed
  // the same way twelve minutes later and alerted again, for as long as the service refused. The mail still goes.
  const { alertFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/job-alert.ts")).href);
  const news = (kind) => ({
    kind: "job_failed",
    route: "today",
    subject: "Something in the background did not finish",
    body: `Reference: job j1 (${kind}).`,
  });
  for (const [kind, pushes] of [
    ["push_send", 0],
    ["push_receipts", 0],
    ["lead_collect", 1],
  ]) {
    const jobs = [];
    const db = fakeDb({ notifications: [], jobs });
    const t = transport();
    await withEnv(PLATFORM_ENV, () => alertFor(null, { tenant_id: TENANT, kind }, { db, send: t.send })(news(kind)));
    assert.equal(inserts(db).length, 1, `${kind}: the row is kept`);
    assert.equal(jobs.filter((j) => j.kind === "push_send").length, pushes, `${kind}: pushes scheduled`);
  }
});

test("a tenant with its own mailbox: the row is kept BEFORE the mail leaves, and the mail carries the full detail to that address", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const t = transport();
  const send = async (...a) => {
    assert.equal(inserts(db).length, 1, "the row is the workspace's record, written before the transport is asked");
    return t.send(...a);
  };
  const out = await withEnv(PLATFORM_ENV, () =>
    notify(
      { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
      {
        kind: "handoff",
        route: "inbox/th-c1",
        about: { type: "conversation", id: "c1" },
        subject: "WhatsApp handoff needed: +19175550100",
        body: "The customer wrote: I need a person",
      },
      { db, send },
    ),
  );
  assert.equal(out, true);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.tenant_id, TENANT);
  assert.equal(row.kind, "handoff");
  assert.equal(row.title, "WhatsApp handoff needed: +19175550100");
  assert.equal(row.body, "The customer wrote: I need a person");
  assert.equal(row.route, "inbox/th-c1");
  assert.equal(row.subject_type, "conversation");
  assert.equal(row.subject_id, "c1");
  assert.deepEqual(t.sent, [
    {
      from: "Salon <hi@salon.example>",
      to: ["owner@salon.example"],
      subject: "WhatsApp handoff needed: +19175550100",
      text: "The customer wrote: I need a person",
    },
  ]);
});

test("a kind the table does not know is kept as an alert; a title and a body past the columns' room are cut, not refused", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  await notify(
    { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
    { kind: "bogus", subject: "x".repeat(250), body: "y".repeat(5000) },
    { db, send: transport().send },
  );
  const row = rows[0];
  assert.equal(row.kind, "alert");
  assert.equal(row.title.length, 200);
  assert.equal(row.body.length, 4000);
  assert.equal(row.route, null);
  assert.equal(row.subject_type, null);
});

test("reaching the workspace is a different question from sending: the redacted note sends, and reaches nobody in it", async () => {
  await withEnv(PLATFORM_ENV, async () => {
    assert.equal(
      reachesTenant({
        tenantId: TENANT,
        notifications: { escalation_emails: ["owner@salon.test"] },
        isEnvDefault: false,
      }),
      true,
      "its own people",
    );
    assert.equal(
      reachesTenant({ tenantId: TENANT, notifications: null, isEnvDefault: true }),
      true,
      "the designated workspace's mailbox IS the platform's",
    );
    // Sends fine, tells the owner nothing. A caller that spends a once-only
    // guard on `notify`'s true here marks a waiting customer as handled.
    assert.equal(
      reachesTenant({ tenantId: TENANT, notifications: null, isEnvDefault: false }),
      false,
      "the redacted note is not the workspace being told",
    );
  });
  await withEnv({ LEAD_TO: "", LEAD_FROM: "" }, async () => {
    assert.equal(
      reachesTenant({ tenantId: TENANT, notifications: null, isEnvDefault: false }),
      false,
      "nowhere to send is not reaching anyone either",
    );
  });
});

test("ANOTHER tenant with no mailbox: the row is theirs, the platform gets the redacted fact with the workspace id, and never the customer's words", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const t = transport();
  const log = capture();
  let out;
  try {
    out = await withEnv(PLATFORM_ENV, () =>
      notify(
        { tenantId: TENANT, notifications: null, isEnvDefault: false },
        {
          kind: "job_failed",
          subject: "A reminder to +19175550100 did not send",
          body: "Customer +19175550100 wrote: my appointment",
          redactedBody: "A background job failed for a workspace (kind: outbound_send).",
        },
        { db, send: t.send },
      ),
    );
  } finally {
    log.restore();
  }
  assert.equal(out, true);
  assert.equal(rows.length, 1, "the workspace still owns its alert on its bell");
  assert.equal(
    rows[0].body,
    "Customer +19175550100 wrote: my appointment",
    "the row is the tenant's own, under its RLS",
  );
  assert.equal(t.sent.length, 1);
  const m = t.sent[0];
  assert.deepEqual(m.to, ["ops@platform.test", "second@platform.test"], "every platform address");
  assert.equal(m.from, "Pager <pager@platform.test>");
  assert.equal(m.subject, "A workspace needs notification settings");
  assert.ok(
    m.text.includes("A background job failed for a workspace (kind: outbound_send).") &&
      m.text.includes(`Workspace: ${TENANT}`) &&
      m.text.includes("Set them in Settings."),
  );
  assert.ok(
    !m.text.includes("9175550100") && !m.text.includes("my appointment"),
    "a stranger's mailbox never sees the customer",
  );
  const said = lineFor(log.lines, "notify_tenant_unaddressable");
  assert.ok(said && said.includes("[number]") && !said.includes("9175550100"));
});

test("unaddressable and nothing safe to say: the row is kept, nothing is sent, false", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const t = transport();
  const log = capture();
  let out;
  try {
    out = await withEnv(PLATFORM_ENV, () =>
      notify(
        { tenantId: TENANT, notifications: null, isEnvDefault: false },
        { subject: "Handoff", body: "words" },
        { db, send: t.send },
      ),
    );
  } finally {
    log.restore();
  }
  assert.equal(out, false);
  assert.equal(t.sent.length, 0);
  assert.equal(rows.length, 1);
});

test("no platform pair and no mailbox: nowhere to send, said in the log, the row still kept", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const t = transport();
  const log = capture();
  let out;
  try {
    out = await withEnv({ LEAD_TO: undefined, LEAD_FROM: undefined }, () =>
      notify(
        { tenantId: TENANT, notifications: null, isEnvDefault: true },
        { subject: "Deadman: +19175550100", body: "…" },
        { db, send: t.send },
      ),
    );
  } finally {
    log.restore();
  }
  assert.equal(out, false);
  assert.equal(t.sent.length, 0);
  assert.equal(rows.length, 1);
  const said = lineFor(log.lines, "notify_no_recipient");
  assert.ok(said && said.includes("[number]"));
});

test("a platform notice (no tenant) keeps no row -- there is no bell for the platform -- and goes to every platform address in full", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const t = transport();
  const out = await withEnv(PLATFORM_ENV, () =>
    notify(
      { tenantId: null, notifications: null, isEnvDefault: true },
      { subject: "A background sweep is not running: deadman", body: "the edge answered 401" },
      { db, send: t.send },
    ),
  );
  assert.equal(out, true);
  assert.equal(rows.length, 0);
  assert.equal(inserts(db).length, 0, "not even attempted");
  assert.deepEqual(t.sent[0].to, ["ops@platform.test", "second@platform.test"]);
  assert.equal(t.sent[0].text, "the edge answered 401");
});

test("losing the row never loses the mail: an insert the database refuses is logged and the mail still goes; no database keeps no row and still sends", async () => {
  const refusing = fakeDb(
    { notifications: [] },
    { "notifications.insert": { message: "relation notifications is read only" } },
  );
  const t = transport();
  const log = capture();
  let out;
  try {
    out = await notify(
      { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
      { subject: "Handoff", body: "words" },
      { db: refusing, send: t.send },
    );
  } finally {
    log.restore();
  }
  assert.equal(out, true);
  assert.equal(t.sent.length, 1);
  const said = lineFor(log.lines, "notification_record_failed");
  assert.ok(said && said.includes("read only"));

  const t2 = transport();
  assert.equal(
    await notify(
      { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
      { subject: "Handoff", body: "words" },
      { db: null, send: t2.send },
    ),
    true,
  );
  assert.equal(t2.sent.length, 1);
});

test("the transport's verdict is the door's: a refused mail is false even though the row was kept", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  const out = await notify(
    { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
    { subject: "Handoff", body: "words" },
    { db, send: transport(false).send },
  );
  assert.equal(out, false);
  assert.equal(rows.length, 1);
});

test("recordNotification on its own: a row with the given store, none without a tenant", async () => {
  const rows = [];
  const db = fakeDb({ notifications: rows });
  await recordNotification(
    TENANT,
    { kind: "billing", title: "Your trial ends in three days", body: "…", route: "admin/billing" },
    db,
  );
  await recordNotification(null, { kind: "billing", title: "nobody's", body: "…" }, db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].route, "admin/billing");
});

test("every kind the table accepts is kept as itself -- a new kind is not turned into a plain alert on its way in", async () => {
  // 00134 added template_ready and template_blocked. The webhook chose them and the migration allowed them, but
  // this file kept its own copy of the list, so both went into the table as "alert": a bell icon pointing at Today
  // instead of a check -- or a warning -- pointing at Templates.
  const { SERVER_NOTIFICATION_KINDS } = await import("@chanlytics/contracts");
  const rows = [];
  const db = fakeDb({ notifications: rows });
  for (const kind of SERVER_NOTIFICATION_KINDS) {
    await recordNotification(TENANT, { kind, title: `a ${kind}`, body: "…" }, db);
  }
  assert.deepEqual(
    rows.map((r) => r.kind),
    [...SERVER_NOTIFICATION_KINDS],
    "REGRESSION: a kind the table accepts was stored as 'alert'",
  );
  assert.ok(
    SERVER_NOTIFICATION_KINDS.includes("template_ready") && SERVER_NOTIFICATION_KINDS.includes("template_blocked"),
    "the two template kinds are among them",
  );
  assert.ok(
    SERVER_NOTIFICATION_KINDS.includes("broadcast_sent") && SERVER_NOTIFICATION_KINDS.includes("broadcast_stopped"),
    "and the two broadcast kinds (00141); the database in memory has no CHECK, so the replay proves the table",
  );
});

test("REGRESSION: a job's alert is kept as what the job said it is -- a completed broadcast was kept as job_failed", async () => {
  // apps/edge/lib/ops/job-alert.ts hard-coded `kind: "job_failed", route: "inbox"` for every one of its six callers,
  // so "Broadcast “Spring offer” sent, 38 people got it" reached the bell as a job that did not finish.
  const { alertFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/job-alert.ts")).href);
  const rows = [];
  const t = transport();
  const log = capture();
  try {
    await withEnv(PLATFORM_ENV, () =>
      alertFor(
        null,
        { tenant_id: TENANT, kind: "broadcast_send" },
        { db: fakeDb({ notifications: rows }), send: t.send },
      )({
        kind: "broadcast_sent",
        route: "broadcasts",
        about: { type: "broadcast", id: "b1" },
        subject: "Broadcast “Spring offer” sent",
        body: "38 people got it. Replies land in the Inbox.",
      }),
    );
  } finally {
    log.restore();
  }
  assert.deepEqual(
    [rows[0].kind, rows[0].route, rows[0].subject_type, rows[0].subject_id],
    ["broadcast_sent", "broadcasts", "broadcast", "b1"],
    "REGRESSION: a completed broadcast was kept as job_failed, pointing at the Inbox",
  );
  assert.equal(rows[0].title, "Broadcast “Spring offer” sent");
});

test("a kept row of a kind a phone hears about schedules one push_send naming it, after the row and before the mail; a kind a phone does not hear about schedules none", async () => {
  const rows = [];
  const jobs = [];
  const db = fakeDb({ notifications: rows, jobs });
  const t = transport();
  const send = async (...a) => {
    assert.equal(jobs.length, 1, "the phone's job is on the ledger before the transport is asked");
    return t.send(...a);
  };
  await withEnv(PLATFORM_ENV, () =>
    notify(
      { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
      { kind: "handoff", route: "inbox/th-1", subject: "Handoff needed", body: "Maria asked." },
      { db, send },
    ),
  );
  assert.equal(jobs.length, 1);
  assert.deepEqual(
    [jobs[0].kind, jobs[0].tenant_id, jobs[0].payload],
    ["push_send", TENANT, { notification_id: rows[0].id }],
    "one job, this workspace's, naming the kept row",
  );
  assert.ok(rows[0].id, "the row was given its id back");
  await withEnv(PLATFORM_ENV, () =>
    notify(
      { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
      { kind: "sweep", subject: "Sweep late", body: "x" },
      { db, send: t.send },
    ),
  );
  assert.equal(rows.length, 2, "the sweep's row is kept");
  assert.equal(jobs.length, 1, "and stays off the phone");
  assert.equal(t.sent.length, 2, "both mails left as ever");
});

/// B16 (audit, 2 Oct 2026): Settings › Notifications said "Every alert below goes to each of these" over eleven kinds
// while notify() mailed every kind it was handed, so a WhatsApp number's flag, a template's refusal, a finished
// broadcast and more were emailed and said nowhere. What is emailed is one closed list in contracts
// (EMAILED_NOTIFICATION_KINDS), and since decision 0040 the page offers it as topics (ALERT_TOPICS): every kind a
// workspace is told is in exactly one topic or in the bell's own line, and each topic's channels are its kinds'.
test("notify mails exactly the kinds contracts lists as emailed, and the page's topics speak for every kind once (B16, 0040)", async () => {
  const {
    SERVER_NOTIFICATION_KINDS,
    EMAILED_NOTIFICATION_KINDS,
    ALERT_TOPICS,
    BELL_LINE_KINDS,
    PUSH_KINDS,
    EMAIL_ALWAYS_KINDS,
    emailsNotificationKind,
  } = await import("@chanlytics/contracts");
  // Which kinds the edge emails, written out. It is the set notify() is handed today (read off its callers: the
  // WhatsApp webhook's number and template news, the job runner's, the playbooks', the sweeps', the call summary), so
  // a kind that joins or leaves is a decision made here and in contracts' table together, and the page follows.
  const EMAILED = [
    "alert",
    "billing",
    "broadcast_sent",
    "broadcast_stopped",
    "call",
    "deadman",
    "handoff",
    "job_failed",
    "leads_question",
    "number",
    // A customer asked to stop (decision 0048): a line on the bell, emailed only as the business chooses, never always.
    "opted_out",
    "playbook",
    "reach_out_replied",
    "sweep",
    "template_blocked",
    "template_ready",
  ];
  assert.deepEqual([...EMAILED_NOTIFICATION_KINDS].sort(), EMAILED, "the closed list");
  const BELL = SERVER_NOTIFICATION_KINDS.filter((k) => !EMAILED.includes(k)).sort();
  // A booking email held for a look (00345) is the bell's alone: it waits in Settings › Business, and no mail follows.
  assert.deepEqual(
    BELL,
    // A booking that arrived and a teammate who joined (00410): told on the bell from their events, and no mail follows.
    [
      "booking",
      "booking_notice",
      "calendar_people",
      "leads_ready",
      "member_joined",
      "member_left",
      "note_for_you",
      "review",
      "reach_out_day",
    ].sort(),
    "the rest are the bell's: written by the edge or a database function, and no mail follows",
  );

  // notify, executed over every kind the table keeps.
  for (const kind of SERVER_NOTIFICATION_KINDS) {
    const rows = [];
    const t = transport();
    const out = await withEnv(PLATFORM_ENV, () =>
      notify(
        { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
        { kind, subject: `a ${kind}`, body: "…" },
        { db: fakeDb({ notifications: rows }), send: t.send },
      ),
    );
    assert.equal(
      t.sent.length,
      EMAILED.includes(kind) ? 1 : 0,
      `${kind}: ${EMAILED.includes(kind) ? "mailed" : "not mailed"}`,
    );
    assert.equal(rows.length, 1, `${kind}: the row is kept either way`);
    assert.equal(out, true, `${kind}: told, by the mail or, for the bell's kinds, by the row`);
  }
  // No kind said, and a kind the table does not know, are plain alerts: emailed as they were.
  for (const kind of [undefined, "bogus"]) {
    const t = transport();
    await withEnv(PLATFORM_ENV, () =>
      notify(
        { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
        { kind, subject: "x", body: "y" },
        { db: fakeDb({ notifications: [] }), send: t.send },
      ),
    );
    assert.equal(t.sent.length, 1, `${kind}: a plain alert`);
    assert.equal(emailsNotificationKind(kind), true);
  }
  // notifyOnce asks the same list: a bell kind is told by its row, a mailed one by the mail.
  const { notifyOnce } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  for (const [kind, mails] of [
    ["review", 0],
    ["playbook", 1],
  ]) {
    const t = transport();
    const told = await withEnv(PLATFORM_ENV, () =>
      notifyOnce(
        { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false },
        { kind, subject: `a ${kind}`, body: "…" },
        { db: fakeDb({ notifications: [] }), send: t.send },
      ),
    );
    assert.equal(told, true, kind);
    assert.equal(t.sent.length, mails, `${kind}: notifyOnce mails ${mails}`);
  }

  // The page's topics: every kind is in one topic or the bell's line, and once.
  const named = [...ALERT_TOPICS.flatMap((t) => t.kinds), ...BELL_LINE_KINDS];
  assert.deepEqual([...named].sort(), [...SERVER_NOTIFICATION_KINDS].sort(), "every kind, said once");
  assert.equal(new Set(named).size, named.length, "no kind in two places");
  for (const t of ALERT_TOPICS) {
    // What a topic says of email is what its kinds take: always for the two the receptionist needs, a choice for an
    // emailed kind, none for the bell's; and a phone where its kinds are ones a phone is told.
    for (const k of t.kinds) {
      if (t.email === "always") assert.ok(EMAIL_ALWAYS_KINDS.includes(k), `${t.key}: ${k} is always emailed`);
      if (t.email === "choice") assert.ok(EMAILED.includes(k) && !EMAIL_ALWAYS_KINDS.includes(k), `${t.key}: ${k}`);
      if (t.email === null) assert.ok(!EMAILED.includes(k), `${t.key}: ${k} is the bell's`);
      assert.equal(PUSH_KINDS.includes(k), t.phone, `${t.key}: ${k} ${t.phone ? "reaches" : "never reaches"} a phone`);
    }
  }
  assert.deepEqual(
    [...EMAIL_ALWAYS_KINDS].sort(),
    ["deadman", "handoff"],
    "a customer who needs a person, and still waiting",
  );
  assert.ok(!ALERT_TOPICS.some((t) => t.kinds.includes("alert")), "Chanlytics' own alerts are no workspace's topic");
});

// Decision 0040: the business chooses what it is emailed (notifications.email_off), and the edge asks before every
// mail. The two the receptionist must always reach someone with cannot be turned off, a kind it does not know is
// ignored, and an older config, with no email_off, is emailed as it was.
test("what the business turned off by email is not mailed on any path; the row is kept, and the two the receptionist needs are always mailed (0040)", async () => {
  const { notifyOnce, mail } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  const off = { ...MAILBOX, email_off: ["call", "handoff", "deadman", "a_kind_from_tomorrow"] };
  const target = { tenantId: TENANT, notifications: off, isEnvDefault: false };
  for (const [kind, mails] of [
    ["call", 0],
    ["handoff", 1],
    ["deadman", 1],
    ["playbook", 1],
  ]) {
    const rows = [];
    const t = transport();
    const told = await withEnv(PLATFORM_ENV, () =>
      notify(target, { kind, subject: `a ${kind}`, body: "…" }, { db: fakeDb({ notifications: rows }), send: t.send }),
    );
    assert.equal(t.sent.length, mails, `${kind}: ${mails ? "mailed" : "not mailed, as the business chose"}`);
    assert.equal(rows.length, 1, `${kind}: the bell keeps it`);
    assert.equal(told, true, `${kind}: told, by the row where no mail goes`);
  }
  // notifyOnce: a kind turned off is told by its row, and the row stays.
  const rows = [];
  const t = transport();
  const told = await withEnv(PLATFORM_ENV, () =>
    notifyOnce(
      target,
      { kind: "call", subject: "c", body: "…" },
      { db: fakeDb({ notifications: rows }), send: t.send },
    ),
  );
  assert.equal(told, true);
  assert.equal(t.sent.length, 0);
  assert.equal(rows.length, 1, "kept, never taken back as a failed mail would be");
  // mail(): a caller that names its kind is held to the choice; a mail of no kind (the first run's, a test) is not.
  const m = transport();
  assert.equal(
    await withEnv(PLATFORM_ENV, () => mail(target, { kind: "call", subject: "c", body: "…" }, { send: m.send })),
    true,
  );
  assert.equal(m.sent.length, 0, "the named kind the business turned off");
  await withEnv(PLATFORM_ENV, () => mail(target, { subject: "Test alert", body: "…" }, { send: m.send }));
  assert.equal(m.sent.length, 1, "a mail of no kind goes");
  // An older config, and a list that is not one, are emailed as before.
  for (const notifications of [MAILBOX, { ...MAILBOX, email_off: "call" }, { ...MAILBOX, email_off: null }]) {
    const o = transport();
    await withEnv(PLATFORM_ENV, () =>
      notify(
        { tenantId: TENANT, notifications, isEnvDefault: false },
        { kind: "call", subject: "c", body: "…" },
        { db: fakeDb({ notifications: [] }), send: o.send },
      ),
    );
    assert.equal(o.sent.length, 1, JSON.stringify(notifications.email_off));
  }
});

// Decision 0040: a review, a card declined and a trial ending were written to the bell by recordNotification, which
// tells no phone, though their kinds are ones phones are told (PUSH_KINDS). keepAndPush keeps the row and queues the
// push from it, never a mail.
test("keepAndPush keeps the bell's row and queues one push_send naming it, and mails nobody (0040)", async () => {
  const { keepAndPush } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  const rows = [];
  const jobs = [];
  const db = fakeDb({ notifications: rows, jobs });
  const kept = await keepAndPush(
    TENANT,
    { kind: "review", title: "A new review", body: "Five stars.", route: "reports" },
    db,
  );
  assert.equal(kept?.kind, "review");
  assert.equal(rows.length, 1);
  assert.deepEqual([jobs.length, jobs[0].kind, jobs[0].payload], [1, "push_send", { notification_id: rows[0].id }]);
  // A kind no phone is told keeps its row and queues nothing.
  await keepAndPush(TENANT, { kind: "calendar_people", title: "3 people added", body: "From your calendar." }, db);
  assert.equal(rows.length, 2);
  assert.equal(jobs.length, 1);
});

// The wiring's second audit (S6-4, S6-1): a sweep that asks again until its notice's mail goes (the deadman's "still waiting",
// the warning before a number is given back) kept a new bell row on every tick while the provider failed. Told once under the
// name of what it answers (onceKey), the row and the phones go with the first try, and every retry sends the mail alone.
test("a notice told once under its name keeps one row and tells the phones once however often its mail fails, and the retry sends the mail alone (00419)", async () => {
  const { notifyOnce } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  // A uuid made from a name (version 5), never an event's (random, version 4).
  const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const target = { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false };
  const tables = { notifications: [], jobs: [] };
  const db = fakeDb(tables);
  const pushes = () => tables.jobs.filter((j) => j.kind === "push_send").length;
  // The title says how long the customer has waited, so it changes between tries: the name does not.
  const msg = (hours) => ({
    kind: "deadman",
    route: "inbox/th-c1",
    about: { type: "conversation", id: "c1" },
    subject: `Still waiting: a customer has had no answer for ${hours} hours`,
    body: "…",
    onceKey: "deadman:e-1",
  });
  for (const hours of [2, 2, 3]) {
    const told = await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg(hours), { db, send: transport(false).send }));
    assert.equal(told, false);
  }
  assert.equal(tables.notifications.length, 1, "one row, whatever the title says by now");
  assert.match(tables.notifications[0].source_event, V5, "kept under the name's uuid");
  assert.ok(tables.notifications[0].mail_due_at);
  assert.equal(pushes(), 1, "the phones told once, with the row");

  const up = transport(true);
  assert.equal(await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg(4), { db, send: up.send })), true);
  assert.deepEqual(
    [tables.notifications.length, tables.notifications[0].mail_due_at, up.sent.length, pushes()],
    [1, null, 1, 1],
  );
  // The row says what the mail that went said: the hours as they stood when it went (the review's N4).
  assert.match(tables.notifications[0].title, /for 4 hours$/);
  // Told in full: asked again, nothing more goes.
  const after = transport(true);
  assert.equal(await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg(5), { db, send: after.send })), true);
  assert.deepEqual([tables.notifications.length, after.sent.length], [1, 0]);

  // The name's uuid: the same name always the same, another name another.
  const other = { notifications: [], jobs: [] };
  const otherDb = fakeDb(other);
  for (const key of ["deadman:e-1", "deadman:e-2"])
    await withEnv(PLATFORM_ENV, () =>
      notifyOnce(target, { ...msg(2), onceKey: key }, { db: otherDb, send: transport(true).send }),
    );
  assert.equal(other.notifications[0].source_event, tables.notifications[0].source_event);
  assert.notEqual(other.notifications[1].source_event, other.notifications[0].source_event);
  assert.match(other.notifications[1].source_event, V5);
});

// Review round (decision 0040): email_off is read leniently by the edge, and the schema must be too: a stored value
// that is not a short list of short names made the whole config unparseable, which leaves the receptionist silent.
test("a stored email_off that is not a list of short names reads as none, and the config still parses (0040)", async () => {
  const { parseTenantConfigResult, emailsFor } = await import("@chanlytics/contracts");
  for (const email_off of ["call", null, ["x".repeat(41)], Array.from({ length: 41 }, (_, i) => `k${i}`)]) {
    const r = parseTenantConfigResult({ notifications: { escalation_emails: ["owner@example.com"], email_off } });
    assert.equal(r.ok, true, JSON.stringify(email_off).slice(0, 30));
    assert.equal(r.config.notifications.email_off, undefined);
    assert.equal(emailsFor(r.config.notifications, "call"), true, "everything emailed, as before the field");
  }
  const kept = parseTenantConfigResult({
    notifications: { escalation_emails: ["owner@example.com"], email_off: ["call"] },
  });
  assert.deepEqual(kept.config.notifications.email_off, ["call"]);
});

// Decision 0043: a hold's notice is told by owner_notice, from its event, and must be told exactly once: a delivery
// that runs twice, or a mail that fails, cannot become two notices or none.
test("an event's notice is told once: its row keeps the event, the phones are told with it and the mail goes; a failed mail leaves the row and the phones as they went, owes the mail, and the delivery's retry sends the mail alone; a twin's row refuses a second; nobody to mail keeps the bell and tells the platform without the words", async () => {
  const { alertFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/job-alert.ts")).href);
  const E = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
  const news = {
    kind: "handoff",
    route: "inbox/th-c1",
    about: { type: "conversation", id: "c1" },
    subject: "Rosa Diaz needs a person — asked for a person",
    body: "They wrote: “Can I move my visit?”",
    redactedBody: "A WhatsApp conversation needed a person (asked for a person), and nobody could be told.",
    sourceEvent: E,
  };
  const job = { tenant_id: TENANT, kind: "event_deliver" };
  const world = (faults = {}) => {
    const tables = {
      tenant_config: [{ tenant_id: TENANT, config: { notifications: MAILBOX } }],
      notifications: [],
      jobs: [],
    };
    return { tables, db: fakeDb(tables, faults) };
  };

  const told = world();
  const t = transport(true);
  await withEnv(PLATFORM_ENV, () => alertFor(told.db, job, { db: told.db, send: t.send })(news));
  assert.deepEqual(
    told.tables.notifications.map((n) => [n.kind, n.source_event, n.subject_id]),
    [["handoff", E, "c1"]],
  );
  assert.deepEqual(
    t.sent.map((m) => m.to),
    [["owner@salon.example"]],
  );
  assert.equal(told.tables.jobs.filter((j) => j.kind === "push_send").length, 1, "and the phones, once told");

  // The mail provider is down (decision 0048): the row and the phones went at once and stay; the mail alone is owed.
  const lost = world();
  const refused = transport(false);
  await assert.rejects(
    withEnv(PLATFORM_ENV, () => alertFor(lost.db, job, { db: lost.db, send: refused.send })(news)),
    /was not told; its delivery tries again/,
  );
  assert.deepEqual(
    lost.tables.notifications.map((n) => [n.kind, n.source_event, !!n.mail_due_at]),
    [["handoff", E, true]],
    "the row stays, and says its mail is owed",
  );
  assert.equal(
    lost.tables.jobs.filter((j) => j.kind === "push_send").length,
    1,
    "the phones were told with the row, not after the mail",
  );
  const keptId = lost.tables.notifications[0].id;
  // The retry (+2 minutes) finds the notice and sends the mail alone.
  const back = transport(true);
  await withEnv(PLATFORM_ENV, () => alertFor(lost.db, job, { db: lost.db, send: back.send })(news));
  assert.deepEqual(
    lost.tables.notifications.map((n) => [n.id, n.mail_due_at]),
    [[keptId, null]],
    "the same row, and nothing owed any more: the bell keeps no twin",
  );
  assert.deepEqual(
    back.sent.map((m) => m.to),
    [["owner@salon.example"]],
    "the mail went once",
  );
  assert.equal(lost.tables.jobs.filter((j) => j.kind === "push_send").length, 1, "and the phones were not told twice");
  // A third run of the same delivery (a lease that ran out after the work) tells nobody.
  const idle = transport(true);
  await withEnv(PLATFORM_ENV, () => alertFor(lost.db, job, { db: lost.db, send: idle.send })(news));
  assert.deepEqual(
    [idle.sent.length, lost.tables.notifications.length, lost.tables.jobs.length],
    [0, 1, 1],
    "REGRESSION: a delivery run again mailed or pushed the owner again",
  );

  const twin = world({
    "notifications.insert": { code: "23505", message: "duplicate key value violates unique constraint" },
  });
  const second = transport(true);
  await assert.rejects(
    withEnv(PLATFORM_ENV, () => alertFor(twin.db, job, { db: twin.db, send: second.send })(news)),
    /was not told/,
  );
  assert.deepEqual(second.sent, [], "REGRESSION: the second run of a delivery mailed the owner again");

  // A workspace with nobody on file: its bell is the notice, and the platform hears the fact without the words.
  const rows = [];
  const platform = transport(true);
  await withEnv(PLATFORM_ENV, () =>
    alertFor(null, job, { db: fakeDb({ notifications: rows, jobs: [] }), send: platform.send })(news),
  );
  assert.deepEqual(
    rows.map((n) => n.source_event),
    [E],
  );
  assert.equal(platform.sent.length, 1);
  assert.equal(platform.sent[0].subject, "A workspace needs notification settings");
  assert.match(platform.sent[0].text, /^A WhatsApp conversation needed a person/);
  assert.doesNotMatch(platform.sent[0].text, /Rosa|visit/, "never the customer's name or words");

  // A customer's STOP is news (decision 0048): a workspace nobody can be mailed at has its bell row and nothing more. The
  // platform's note is for what the receptionist must reach someone with, not for a business's opt-outs.
  const stopRows = [];
  const quiet = transport(true);
  await withEnv(PLATFORM_ENV, () =>
    alertFor(null, job, { db: fakeDb({ notifications: stopRows, jobs: [] }), send: quiet.send })({
      kind: "opted_out",
      route: "clients/c1",
      about: { type: "contact", id: "c1" },
      subject: "Dulce Amaro asked to stop receiving messages",
      body: "Nothing more will be sent to them.",
      redactedBody: "A customer asked to stop, and nobody could be told.",
      sourceEvent: "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2",
    }),
  );
  assert.deepEqual(
    [stopRows.map((n) => [n.kind, !n.mail_due_at]), quiet.sent.length],
    [[["opted_out", true]], 0],
    "the row is kept, owing no mail, and the operator is not written to",
  );
});

// Decision 0048: a notice is three deliveries with one state each. The row and the phones never wait on the mail, and a
// mail that failed is owed and retried alone, for every notice that can be found again.
test("notifyOnce keeps the row and tells the phones first, owes a mail that failed, and asked again finds the notice by what it is about and sends the mail alone; another notice about the same subject is not taken for it; a notice that names nothing it is about keeps the old way (S1-15)", async () => {
  const { notifyOnce } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  const target = { tenantId: TENANT, notifications: MAILBOX, isEnvDefault: false };
  const msg = {
    kind: "reach_out_replied",
    route: "inbox/th-c1",
    about: { type: "conversation", id: "c1" },
    subject: "Ana Ruiz wrote back",
    body: "She said yes.",
  };
  const world = () => {
    const tables = { notifications: [], jobs: [] };
    return { tables, db: fakeDb(tables) };
  };
  const pushes = (w) => w.tables.jobs.filter((j) => j.kind === "push_send").length;

  const w = world();
  const down = transport(false);
  assert.equal(await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg, { db: w.db, send: down.send })), false);
  assert.equal(w.tables.notifications.length, 1, "the row stays");
  assert.ok(w.tables.notifications[0].mail_due_at, "and says its mail is owed");
  assert.equal(pushes(w), 1, "the phones were told with the row, before the mail was tried");
  const id = w.tables.notifications[0].id;

  // Asked again with the provider back: the mail alone.
  const up = transport(true);
  assert.equal(await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg, { db: w.db, send: up.send })), true);
  assert.deepEqual(
    [w.tables.notifications.map((n) => [n.id, n.mail_due_at]), up.sent.length, pushes(w)],
    [[[id, null]], 1, 1],
    "one row, nothing owed, one mail, phones told once",
  );
  // Once told in full, the same words about the same thread are a notice of their own: only a notice that still owes its mail
  // is found again (noticeFor), so a business that writes back twice is told twice. Its callers keep their own once (a run's
  // mark, a reply's reading); a notice found by its event keeps it for them (notifyEvent).
  const again = transport(true);
  assert.equal(await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg, { db: w.db, send: again.send })), true);
  assert.deepEqual([again.sent.length, w.tables.notifications.length, pushes(w)], [1, 2, 2]);

  // A different notice about the same conversation is its own: it is not the owed one's retry.
  const other = world();
  await withEnv(PLATFORM_ENV, () => notifyOnce(target, msg, { db: other.db, send: transport(false).send }));
  const second = { ...msg, subject: "Ana Ruiz wrote back again" };
  assert.equal(
    await withEnv(PLATFORM_ENV, () => notifyOnce(target, second, { db: other.db, send: transport(true).send })),
    true,
  );
  assert.deepEqual(
    other.tables.notifications.map((n) => [n.title, !!n.mail_due_at]),
    [
      ["Ana Ruiz wrote back", true],
      ["Ana Ruiz wrote back again", false],
    ],
    "two rows: the first still owes its mail, the second is told in full",
  );

  // Nothing to find it by (no event, nothing it is about): the way before 0048, the row taken back with a mail that failed,
  // and the phones told only once the mail has gone.
  const bare = world();
  const { about: _about, ...unnamed } = msg;
  assert.equal(
    await withEnv(PLATFORM_ENV, () => notifyOnce(target, unnamed, { db: bare.db, send: transport(false).send })),
    false,
  );
  assert.deepEqual([bare.tables.notifications.length, pushes(bare)], [0, 0]);
  assert.equal(
    await withEnv(PLATFORM_ENV, () => notifyOnce(target, unnamed, { db: bare.db, send: transport(true).send })),
    true,
  );
  assert.deepEqual([bare.tables.notifications.length, pushes(bare)], [1, 1]);
});

test("an event's notice whose recipients could not be read waits for them: its delivery tries again, where it settled with the mail never sent (R11 S11-5)", async () => {
  const { alertFor } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/job-alert.ts")).href);
  // The workspace's settings unreadable at this moment: who it is told by is unknown, which is not nobody.
  const unreadable = fakeDb({ notifications: [] }, { "tenant_config.select": { message: "settings down" } });
  const rows = [];
  const t = transport();
  const news = {
    kind: "handoff",
    route: "inbox/th-c1",
    about: { type: "conversation", id: "c1" },
    subject: "A customer needs a person",
    body: "Dana asked for a person.",
    sourceEvent: "ev-1",
  };
  await assert.rejects(
    withEnv(PLATFORM_ENV, () =>
      alertFor(
        unreadable,
        { tenant_id: TENANT, kind: "event_deliver" },
        { db: fakeDb({ notifications: rows }), send: t.send },
      )(news),
    ),
    /could not be read; its delivery tries again/,
  );
  assert.equal(rows.length, 0, "nothing settled: the delivery's next try tells it, mail and all");
  assert.equal(t.sent.length, 0, "and no mail to a guessed address");
});

test("keepOnce keeps one row under its name and tells the phones with it where asked; asked again it finds the row and keeps no twin; a row it could not keep, or could not look for, is false, so its writer leaves its state to be judged again (R11 S6-12)", async () => {
  const { keepOnce } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/notify.ts")).href);
  const tables = { notifications: [], jobs: [] };
  const db = fakeDb(tables);
  const pushes = () => tables.jobs.filter((j) => j.kind === "push_send").length;
  const notice = {
    kind: "review",
    title: "New on Google: ★★★★★ from Rosa",
    body: "“Careful movers.”",
    route: "reports/reviews",
    about: null,
    onceKey: "review_bell:t1:g-1",
  };
  assert.equal(await keepOnce(TENANT, notice, { push: true }, db), true);
  assert.equal(await keepOnce(TENANT, notice, { push: true }, db), true, "asked again: found");
  assert.deepEqual([tables.notifications.length, pushes()], [1, 1], "one row, the phones told once");
  assert.equal(await keepOnce(TENANT, { ...notice, onceKey: "review_bell:t1:g-2" }, {}, db), true);
  assert.deepEqual([tables.notifications.length, pushes()], [2, 1], "another name is another row; no phones unasked");

  const silenced = capture();
  try {
    const refused = fakeDb({ notifications: [] }, { "notifications.insert": { message: "the bell is down" } });
    assert.equal(await keepOnce(TENANT, notice, {}, refused), false, "a row that could not be kept");
    const unread = fakeDb({ notifications: [] }, { "notifications.select": { message: "the bell is down" } });
    assert.equal(await keepOnce(TENANT, notice, {}, unread), false, "could not look: not taken for never told");
  } finally {
    silenced.restore();
  }
  assert.equal(await keepOnce(TENANT, notice, {}, null), false, "no database");
});
