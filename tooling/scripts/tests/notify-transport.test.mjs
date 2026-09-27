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
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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
