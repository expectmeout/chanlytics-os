/**
 * Ask's broadcasts (Ask Rewired, PR 4.3): campaigns.broadcasts and campaigns.broadcast answer what the Broadcasts page's
 * builders answer over the same readers -- each row as contracts toBroadcastVM says it (a run waiting on a person said
 * as such), and one run as contracts toRunReportVM draws it, by the business's clock -- over the database in memory, the
 * registry dispatching as a turn does. The readers themselves are GET broadcasts' and GET broadcasts/[id]'s
 * (ask/readers.test.mjs).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPLY_WINDOW_MS, clockStamp, toBroadcastVM, toRunReportVM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { broadcasts: broadcastsReader, broadcast: broadcastReader } = await import(
  at("apps/dashboard/src/server/readers/broadcasts.ts")
);
const { runTool, newToolContext, READ_DEFS } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BC1 = "88888888-8888-4888-8888-888888888881";
const BC2 = "88888888-8888-4888-8888-888888888882";
const BC3 = "88888888-8888-4888-8888-888888888883";
const BCB = "88888888-8888-4888-8888-88888888888b";
const PB1 = "99999999-9999-4999-8999-999999999991";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const P2 = "abababab-abab-4aba-8aba-abababababa2";
const P3 = "abababab-abab-4aba-8aba-abababababa3";
const USER = "u1";
const TZ = "America/New_York";
const HOUR = 3600_000;
const T0 = Date.parse("2026-09-20T15:00:00Z");
const NOW = new Date(T0 + 5 * HOUR);
const iso = (ms) => new Date(T0 + ms).toISOString();

/** A broadcast row as outbound-routes.test.mjs builds one. */
const bcRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: iso(0),
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: iso(-HOUR),
  playbook_id: null,
  run_for: null,
  ...over,
});
const rec = (contact_id, over) => ({
  broadcast_id: BC1,
  tenant_id: A,
  contact_id,
  state: "sent",
  reason: null,
  sent_at: iso(0),
  ...over,
});
const said = (conversation_id, direction, ms, body, sender) => ({
  tenant_id: A,
  conversation_id,
  direction,
  created_at: iso(ms),
  body,
  sender,
  type: "text",
});
/**
 * Harbor's broadcasts (ask/readers.test.mjs's run-report shape): a run sent to three -- Ana replied, Lu asked to stop,
 * Rosa was held back -- a playbook's run waiting for a person to approve it, and a failed one; one of Bayside's.
 */
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  broadcasts: [
    bcRow(BC1, A, { name: "Monday offer", state: "sent", started_at: iso(0), finished_at: iso(60_000) }),
    bcRow(BC2, A, {
      name: "Win-back",
      state: "pending_approval",
      playbook_id: PB1,
      audience: { kind: "list", id: "quiet", label: "Quiet 30 days" },
      created_at: iso(-2 * HOUR),
    }),
    bcRow(BC3, A, { name: "October", state: "failed", failure: "template_paused", created_at: iso(-3 * HOUR) }),
    bcRow(BCB, B, { name: "Elsewhere" }),
  ],
  broadcast_recipients: [
    rec(P1, {
      messages: { conversation_id: "cv-1", status: "read", meta: { status_at: { delivered: iso(60_000) } } },
      contacts: { display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null },
    }),
    rec(P2, {
      messages: { conversation_id: "cv-2", status: "delivered", meta: {} },
      contacts: { display_name: null, wa_profile_name: "Lu", phone_e164: "+19175550101", email: null },
    }),
    rec(P3, {
      state: "skipped",
      reason: "no_consent",
      sent_at: null,
      messages: null,
      contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: null, email: "rosa@example.com" },
    }),
  ],
  messages: [
    said("cv-1", "inbound", HOUR, "Yes please!", "customer"),
    said("cv-1", "outbound", 2 * HOUR, "Booked you in.", "ai"),
    said("cv-2", "inbound", 3 * HOUR, "stop", "customer"),
  ],
  events: [
    {
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P2,
      data: { consent: "opted_out", purpose: "marketing" },
      created_at: iso(3 * HOUR),
    },
  ],
  conversations: [
    { id: "cv-1", tenant_id: A, state: "open" },
    { id: "cv-2", tenant_id: A, state: "needs_human" },
  ],
});
const ctxFor = (t = tables()) => ({ supabase: fakeDb(t, {}, {}), userId: USER, email: "ada@example.com", params: {} });
const rcIn = () => readerContext(ctxFor(), { tenantId: A, role: "viewer" }, NOW);
const ask = async (input, role = "viewer") => {
  const tc = newToolContext(ctxFor(), A, role, TZ, NOW);
  const out = await runTool(tc, { name: "campaigns", input });
  return { out: JSON.parse(out.result), isError: out.isError, tc };
};

/** A Broadcasts row as the page's builder says it, in the words Ask's rows carry. */
const rowOf = (b) => {
  const vm = toBroadcastVM(b, TZ, NOW);
  return {
    broadcast_id: b.id,
    route: `broadcasts/run:${b.id}`,
    name: b.name,
    by: b.playbook_id ? "a playbook" : "a person",
    audience: b.audience.label,
    template: b.template_name,
    state: vm.stateLabel,
    ...(b.state === "pending_approval" ? { waiting_on_you: true } : {}),
    when: vm.when || null,
    people: b.recipient_count,
    sent: b.counts.sent,
    delivered: vm.deliveredPct === null ? null : `${vm.deliveredPct}%`,
    read: vm.readPct === null ? null : `${vm.readPct}%`,
    replied: b.counts.replied,
    held_back: b.counts.skipped,
    failed: b.counts.failed,
    ...(vm.failureLabel ? { why_it_failed: vm.failureLabel } : {}),
  };
};

test("campaigns.broadcasts answers the Broadcasts page's rows over its reader, each as toBroadcastVM says it: a playbook's run waiting for a person said as such (Needs you, waiting_on_you), a failed one with why; whether older ones exist; each broadcast a row in the read set, opened at its run", async () => {
  const { out, isError, tc } = await ask({ action: "broadcasts" });
  assert.equal(isError, false, JSON.stringify(out));
  const page = await load(rcIn(), broadcastsReader, undefined);
  assert.deepEqual(out, { route: "broadcasts", broadcasts: page.data.broadcasts.map(rowOf), older: page.data.more });
  const waiting = out.broadcasts.find((b) => b.broadcast_id === BC2);
  assert.deepEqual(
    [waiting.state, waiting.waiting_on_you, waiting.by, waiting.audience],
    ["Needs you", true, "a playbook", "Quiet 30 days"],
  );
  assert.ok(out.broadcasts.find((b) => b.broadcast_id === BC3).why_it_failed, "a failed run says why");
  // Who sent it, in the words the description reads it in; delivered and read are shares of what was sent.
  const words = READ_DEFS.find((d) => d.name === "campaigns").actions.broadcasts.words;
  assert.equal(out.broadcasts.find((b) => b.broadcast_id === BC1).by, "a person");
  assert.ok(words.includes("whether a playbook or a person sent it"), words);
  assert.ok(words.includes("the share of those delivered and read"), words);
  assert.ok(!out.broadcasts.some((b) => b.broadcast_id === BCB), "not another workspace's");
  for (const b of page.rows) assert.deepEqual(tc.read.broadcast.get(b.id), b, `${b.label}: the reader's row`);
});

test("campaigns.broadcast answers one run as its opened page draws it over the same reader: its row, the five figures, the people it touched in the page's words and what came back, by the business's clock; the run and each person said in the read set; the recipients' number field left out (everyone here has a name); one another workspace holds, or not an id, is said in words", async () => {
  const { out, isError, tc } = await ask({ action: "broadcast", broadcast_id: BC1 });
  assert.equal(isError, false, JSON.stringify(out));
  const d = (await load(rcIn(), broadcastReader, { id: BC1 })).data;
  const nowMs = NOW.getTime();
  const report = toRunReportVM(d, {
    windowMs: REPLY_WINDOW_MS,
    nowMs,
    clock: (s) => (s ? clockStamp(Date.parse(s), TZ, nowMs) : null),
  });
  assert.deepEqual(out, {
    ...rowOf(d.broadcast),
    figures: report.figures.map((f) => ({ label: f.label, n: f.n, pct: f.pct, note: f.sub })),
    people_total: 3,
    people: report.people.map((p) => ({ contact_id: p.contact_id, name: p.name, said: p.pill.label, what: p.words })),
    replies: report.replies.map((r) => ({
      contact_id: r.contact_id,
      name: r.name,
      quote: r.quote,
      since: r.outcome.words,
    })),
  });
  assert.deepEqual(
    out.people.map((p) => [p.name, p.said]),
    [
      ["Rosa", "Held back"],
      ["Ana Ruiz", "Replied"],
      ["Lu", "Asked to stop"],
    ],
    "in the page's order",
  );
  assert.ok(!JSON.stringify(out).includes("555"), "no number field: the page's name, and the id");
  assert.deepEqual(tc.read.broadcast.get(BC1).route, `broadcasts/run:${BC1}`);
  assert.deepEqual(tc.read.person.get(P1), { kind: "person", id: P1, route: `clients/${P1}`, label: "Ana Ruiz" });
  const other = await ask({ action: "broadcast", broadcast_id: BCB });
  assert.deepEqual([other.isError, other.out.error], [true, "no such broadcast in this workspace"]);
  const typo = await ask({ action: "broadcast", broadcast_id: "nope" });
  assert.deepEqual(
    [typo.isError, typo.out.error],
    [true, "broadcast_id must be an id campaigns with action broadcasts returned"],
  );
});
