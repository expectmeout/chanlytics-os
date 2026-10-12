/**
 * Every alert mail ends with ONE link to the page its notice names (wiring/records-not-pages, task 1.7; findings A2a and
 * NS-4). The mail is the channel that must always reach someone, and it said 'Reply from the Inbox' or 'Open it in the Inbox'
 * as words: read on a phone away from the app, the owner had to open the app and find the thread by hand, while the phone and
 * the bell both opened it. Now notify() (and notifyOnce, notifyEvent) ends the mail's text with `Open it: <link>`, the link
 * built from the notice's route (else its kind's list door: contracts noticeRoute) around the workspace's own address
 * (contracts appLink).
 *
 * Run: the real notify over a database in memory, and a mail transport that keeps what it is handed. The row on the bell keeps
 * the notice's words as they were; only the mail gains the line, and only the mail that goes to the workspace's own people.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMAILED_NOTIFICATION_KINDS, appLink, noticeRoute, openItLine } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Each test file is its own process: this is the whole environment. The platform's mailbox is configured; the dashboard
// is at an origin of its own, so a link that took another's would show.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
process.env.DASHBOARD_ORIGIN = "https://app.example.test";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"]) delete process.env[k];

const { notify, notifyOnce, notifyEvent, mail } = await import(at("apps/edge/lib/ops/notify.ts"));
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const ORIGIN = "https://app.example.test";
const OWNER = "owner@harbor.test";

/** The mail transport: what was handed to it, in order. */
function transport(answer = true) {
  const sent = [];
  return {
    sent,
    send: async (from, to, subject, text) => {
      sent.push({ from, to, subject, text });
      return answer;
    },
  };
}
/** The workspace as the edge's database holds it, with its tables by reference. */
function world() {
  const tables = {
    notifications: [],
    jobs: [],
    tenants: [{ id: T, name: "Harbor Moving", slug: "harbor", timezone: "UTC", status: "active" }],
  };
  return Object.assign(fakeDb(tables), { tables });
}
const addressed = { escalation_emails: [OWNER], from: "Harbor <hi@harbor.test>" };
/** A target whose slug rode with its recipients, as loadTenantNotifications hands it. */
const harbor = (over = {}) => ({ tenantId: T, notifications: addressed, isEnvDefault: false, slug: "harbor", ...over });
const msg = (kind, over = {}) => ({
  kind,
  subject: `A ${kind} notice`,
  body: "What happened.\n\nReply from the Inbox.",
  redactedBody: "Something happened to a workspace.",
  ...over,
});
const readsOfTenants = (db) => db.seen.filter((s) => s.table === "tenants");

test("every kind that is emailed ends its mail with the link to the page its notice names", async () => {
  assert.ok(EMAILED_NOTIFICATION_KINDS.length >= 10, "the list is the contracts' own, not a copy");
  for (const kind of EMAILED_NOTIFICATION_KINDS) {
    const route = `inbox/th-${ID}`;
    const db = world();
    const t = transport();
    assert.equal(await notify(harbor(), msg(kind, { route }), { db, send: t.send }), true, kind);
    assert.equal(t.sent.length, 1, `${kind}: one mail`);
    assert.ok(
      t.sent[0].text.endsWith(`\n\n${openItLine(`${ORIGIN}${appLink("harbor", route)}`)}`),
      `${kind}: ${JSON.stringify(t.sent[0].text.slice(-120))}`,
    );
    assert.equal(
      t.sent[0].text.split("Open it:").length,
      2,
      `${kind}: exactly one such line, not one for the row and another for the mail`,
    );
  }
});

test("a mail with no route links the page the kind's list lives on", async () => {
  const doors = {
    handoff: "/w/harbor/inbox",
    deadman: "/w/harbor/inbox",
    call: "/w/harbor/conversations/phone",
    number: "/w/harbor/settings/integrations",
    sweep: "/w/harbor/settings/integrations",
    job_failed: "/w/harbor/inbox",
    playbook: "/w/harbor/campaigns",
    template_ready: "/w/harbor/templates",
    template_blocked: "/w/harbor/templates",
    broadcast_sent: "/w/harbor/broadcasts",
    broadcast_stopped: "/w/harbor/broadcasts",
    billing: "/w/harbor/settings/billing",
    leads_question: "/w/harbor/people/leads",
    reach_out_replied: "/w/harbor/inbox",
    // A customer asked to stop (0048): the people it is about, in People.
    opted_out: "/w/harbor/people",
    alert: "/w/harbor/today",
  };
  for (const kind of EMAILED_NOTIFICATION_KINDS) {
    const t = transport();
    await notify(harbor(), msg(kind), { db: world(), send: t.send });
    const want = doors[kind];
    assert.ok(want, `${kind} is an emailed kind this test does not know the door of: say it here`);
    assert.ok(t.sent[0].text.endsWith(`Open it: ${ORIGIN}${want}`), `${kind}: ${t.sent[0].text.slice(-100)}`);
    assert.equal(want, appLink("harbor", noticeRoute(kind, null)), `${kind}: and it is the one function's answer`);
  }
});

test("a kind nobody knows, and a notice that names none, are a plain alert, which opens Today", async () => {
  for (const kind of ["nobody-knows-this-kind", undefined]) {
    const t = transport();
    await notify(harbor(), msg(kind), { db: world(), send: t.send });
    assert.ok(t.sent[0].text.endsWith(`Open it: ${ORIGIN}/w/harbor/today`), String(kind));
  }
});

test("the words of the row on the bell are the notice's own: the line is the mail's", async () => {
  const db = world();
  const t = transport();
  await notify(harbor(), msg("handoff", { route: `inbox/th-${ID}` }), { db, send: t.send });
  const [row] = db.tables.notifications;
  assert.ok(row, "the row was kept");
  assert.equal(row.body, "What happened.\n\nReply from the Inbox.");
  assert.equal(row.route, `inbox/th-${ID}`);
  assert.ok(t.sent[0].text.startsWith("What happened.\n\nReply from the Inbox.\n\nOpen it:"));
});

test("a notice kept to be told exactly once (notifyOnce, notifyEvent) ends its mail the same way", async () => {
  for (const [name, tell, extra] of [
    ["notifyOnce", notifyOnce, {}],
    ["notifyEvent", notifyEvent, { sourceEvent: "escalation.opened:e1" }],
  ]) {
    const t = transport();
    const told = await tell(harbor(), msg("playbook", { route: `broadcasts/run:${ID}`, ...extra }), {
      db: world(),
      send: t.send,
    });
    assert.equal(told, true, name);
    assert.ok(t.sent[0].text.endsWith(`Open it: ${ORIGIN}/w/harbor/broadcasts/run:${ID}`), name);
  }
});

test("the redacted copy, which tells the platform that a workspace cannot be addressed, carries no link", async () => {
  const db = world();
  const t = transport();
  const target = { tenantId: T, notifications: null, isEnvDefault: false, slug: "harbor" };
  await notify(target, msg("handoff", { route: `inbox/th-${ID}` }), { db, send: t.send });
  assert.equal(t.sent.length, 1);
  assert.deepEqual(t.sent[0].to, ["ops@platform.test"], "the platform's mailbox, never the workspace's");
  assert.doesNotMatch(t.sent[0].text, /Open it|\/w\/|harbor|app\.example\.test/i);
  assert.doesNotMatch(t.sent[0].text, /What happened/, "and still none of the customer's words");
});

test("a workspace whose owner IS the platform's mailbox (the first one) is mailed in full, with the link", async () => {
  const t = transport();
  const target = { tenantId: T, notifications: null, isEnvDefault: true, slug: "harbor" };
  await notify(target, msg("handoff", { route: `inbox/th-${ID}` }), { db: world(), send: t.send });
  assert.deepEqual(t.sent[0].to, ["ops@platform.test"]);
  assert.ok(t.sent[0].text.endsWith(`Open it: ${ORIGIN}/w/harbor/inbox/th-${ID}`));
});

test("the platform's own news, which is about no workspace, has no page to open", async () => {
  const t = transport();
  await notify({ tenantId: null, notifications: null, isEnvDefault: true }, msg("alert"), {
    db: world(),
    send: t.send,
  });
  assert.equal(t.sent[0].text, "What happened.\n\nReply from the Inbox.");
});

test("the slug rode with the recipients: the link costs no read of its own", async () => {
  const db = world();
  const t = transport();
  await notify(harbor(), msg("handoff"), { db, send: t.send });
  assert.equal(readsOfTenants(db).length, 0, "no per-mail query");
});

test("a target built without the slug (a loader that read only the recipients) has it read once, so its mail still links", async () => {
  const db = world();
  const t = transport();
  const { slug: _slug, ...bare } = harbor();
  await notify(bare, msg("handoff", { route: `inbox/th-${ID}` }), { db, send: t.send });
  assert.equal(readsOfTenants(db).length, 1, "one small read, for the one mail that goes");
  assert.ok(t.sent[0].text.endsWith(`Open it: ${ORIGIN}/w/harbor/inbox/th-${ID}`));
  // And not for a mail that does not go to the workspace's people: the redacted copy reads nothing.
  const db2 = world();
  await notify({ ...bare, notifications: null }, msg("handoff"), { db: db2, send: transport().send });
  assert.equal(readsOfTenants(db2).length, 0);
});

test("a slug that is known to be unknown, or cannot be read, sends the mail with no link rather than a wrong one", async () => {
  // Read, and the workspace has none to give.
  const t1 = transport();
  await notify(harbor({ slug: null }), msg("handoff"), { db: world(), send: t1.send });
  assert.equal(t1.sent[0].text, "What happened.\n\nReply from the Inbox.");
  // Not read, and the read fails: the alarm still goes.
  const db = fakeDb({ notifications: [], jobs: [] }, { "tenants.select": { message: "statement timeout" } });
  const t2 = transport();
  const { slug: _slug, ...bare } = harbor();
  assert.equal(await notify(bare, msg("handoff"), { db, send: t2.send }), true);
  assert.equal(t2.sent[0].text, "What happened.\n\nReply from the Inbox.");
  // No database to read it from.
  const t3 = transport();
  assert.equal(await notify(bare, msg("handoff"), { db: null, send: t3.send }), true);
  assert.equal(t3.sent[0].text, "What happened.\n\nReply from the Inbox.");
});

test("a deployment that cannot say where the dashboard is loses the link, never the alarm", async () => {
  const before = { VERCEL_ENV: process.env.VERCEL_ENV, DASHBOARD_ORIGIN: process.env.DASHBOARD_ORIGIN };
  process.env.VERCEL_ENV = "production";
  delete process.env.DASHBOARD_ORIGIN;
  try {
    const t = transport();
    assert.equal(await notify(harbor(), msg("handoff"), { db: world(), send: t.send }), true);
    assert.equal(t.sent[0].text, "What happened.\n\nReply from the Inbox.");
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("a mail sent on its own (a lead's question, you are live, an alert test) carries the link its own builder wrote, and no second", async () => {
  const t = transport();
  const own = "Dana asked.\n\nhttps://app.example.test/w/harbor/people/leads";
  await mail(harbor(), { subject: "A question", body: own, kind: "leads_question" }, { send: t.send });
  assert.equal(t.sent[0].text, own);
});

test("a kind the business turned off by email is a row on the bell and no mail, so no link goes anywhere", async () => {
  const t = transport();
  const target = harbor({ notifications: { ...addressed, email_off: ["broadcast_sent"] } });
  await notify(target, msg("broadcast_sent"), { db: world(), send: t.send });
  assert.deepEqual(t.sent, []);
});
