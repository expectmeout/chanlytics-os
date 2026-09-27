/**
 * The numbers Today and Reports show, made to agree and made honest.
 *
 * Review findings F8, F11, F14, F24, F26, F27, F28, F38 and R3.9/R3.11:
 * "answered by" meant two things, reply time ran from the draft, the share
 * tile's delta compared counts, "every message was answered" was asserted
 * from the absence of escalations, the quiet day dated yesterday as today,
 * a workspace with no channel read " is connected.", a failed period switch
 * dimmed the page forever, and owner-facing text printed IANA zones and raw
 * statuses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM, pointsDelta, toTodayVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";

const sql = readRaw("supabase/migrations/00035_metrics_truth.sql");

test("one definition of who answered, shared by both functions, timed from the send", () => {
  assert.ok(sql.includes("create or replace function public.first_replies(p_tenant_id uuid, p_start timestamptz)"));
  assert.equal(
    (sql.match(/from public\.first_replies\(p_tenant_id, v_start\)/g) ?? []).length,
    2,
    "metrics_summary AND report_series call it",
  );
  assert.ok(sql.includes("e.kind = 'message.sent'"), "the send moment, not the draft");
  assert.ok(
    sql.includes("when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'"),
    "first replier wins",
  );
  assert.ok(!sql.includes("where ai_at is not null),"), "the non-exclusive count is gone");
  assert.ok(sql.includes("(select count(*) from replies where who = 'ai')"));
});

test("metrics_summary has the guards its sibling had, and a DST-safe window", () => {
  const fn = sql.slice(sql.indexOf("create or replace function public.metrics_summary"));
  assert.ok(fn.includes("set search_path = public"));
  assert.ok(fn.includes("revoke all on function public.metrics_summary(uuid, integer) from public, anon;"));
  assert.ok(fn.includes("((((now() at time zone v_tz)::date) - (v_days - 1))::timestamp) at time zone v_tz"));
  assert.ok(!fn.includes("make_interval(days => v_days - 1)"));
});

/* ------------------------------- Reports ---------------------------------- */

function day(d, over = {}) {
  return {
    day: d,
    messages_in: 0,
    conversations: 0,
    answered_ai: 0,
    answered_you: 0,
    unanswered: 0,
    out_ai: 0,
    out_you: 0,
    escalations: 0,
    calls: 0,
    call_seconds: 0,
    new_contacts: 0,
    ...over,
  };
}

test("the share tile compares in points: a share that fell is never a green delta", () => {
  // Prior week: 10 in, all answered by the receptionist (100%).
  // This week: 20 in, 12 by the receptionist, 8 by you (60%).
  const prev = Array.from({ length: 7 }, (_, i) =>
    day(`2026-08-2${i + 2}`, i === 0 ? { messages_in: 10, answered_ai: 10, conversations: 5 } : {}),
  );
  const cur = Array.from({ length: 7 }, (_, i) =>
    day(
      `2026-08-${29 + i > 31 ? "0" + (29 + i - 31) : 29 + i}`,
      i === 0 ? { messages_in: 20, answered_ai: 12, answered_you: 8, conversations: 9 } : {},
    ),
  );
  const vm = toReportVM({
    timezone: "America/New_York",
    days: 7,
    span_days: 14,
    today: "2026-09-04",
    series: [...prev, ...cur],
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  });
  const by = Object.fromEntries(vm.tiles.map((t) => [t.id, t]));
  assert.equal(by.answered.value, "60%");
  assert.deepEqual(
    by.answered.delta,
    { text: "-40 pts vs prior 7 days", tone: "neg" },
    "REGRESSION: counts 12 vs 10 read +20% in green",
  );
  assert.equal(by.messages.meta, "on 1 of 7 days", "a unit the owner has");
  assert.deepEqual(pointsDelta(60, 60, "7 days"), { text: "same share as the prior 7 days", tone: "" });
  assert.equal(pointsDelta(60, null, "7 days"), null);
  assert.equal(pointsDelta(null, 60, "7 days"), null);
});

test("Reports: the chart's hit targets are not keyboard stops; the zone is a tooltip; a failed period says so", () => {
  const page = readRaw("apps/dashboard/src/legacy/pages/reports.jsx");
  assert.ok(!page.includes('className="rp2-hit" tabIndex={0}'), "up to 270 unnamed stops at 90 days");
  assert.ok(page.includes("title={`Days follow ${vm.timezone}`}"));
  assert.ok(!page.includes("{vm.until} · {vm.timezone}</div>"), "no raw IANA id in the subtitle");
  // "every message was answered without you" only when true: executed in reports-page.test.mjs.
  assert.ok(page.includes("Couldn't load"), "a failed period switch says so");
  const verbs = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(verbs.includes("export async function setReportRange(days: number): Promise<boolean>"));
  assert.ok(verbs.includes("setReportDays(prev);"), "the preferred period goes back on failure");
});

/* -------------------------------- Today ----------------------------------- */

const NOW = new Date("2026-08-27T12:00:00Z"); // 8:00 AM New York
const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: over.channels ?? [{ kind: "whatsapp", status: "active", number: "+13055550188" }],
  window: {
    days: 1,
    since: "2026-08-27T04:00:00+00:00",
    since_local: "2026-08-27T00:00:00",
    now_local: "2026-08-27T08:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
    ...(over.now ?? {}),
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...(over.period ?? {}),
  },
});

test("Today's quiet day dates the last message by the tenant's calendar, not by elapsed hours", () => {
  // 9:15 AM yesterday, New York; now 8:00 AM — fewer than 24 hours ago.
  const vm = toTodayVM(metrics({ now: { last_inbound_at: "2026-08-26T13:15:00Z" } }), [], [], [], NOW);
  assert.match(
    vm.quiet.sub,
    /yesterday at 9:15 AM/,
    "REGRESSION: read 'The last message arrived 9:15 AM' under 'Nothing has come in yet today'",
  );
  const same = toTodayVM(metrics({ now: { last_inbound_at: "2026-08-27T11:30:00Z" } }), [], [], [], NOW);
  assert.match(same.quiet.sub, /arrived 7:30 AM/);
});

test("Today: a workspace with no channel says so, and statuses are words", () => {
  const vm = toTodayVM(metrics({ channels: [] }), [], [], [], NOW);
  assert.equal(vm.quiet.sub, "No line is connected yet, so nothing can come in.");
  assert.ok(vm.quiet.proof.some((p) => p.value === "none connected yet"));
  const on = toTodayVM(metrics(), [], [], [], NOW);
  assert.ok(
    on.quiet.proof.some((p) => /· on$/.test(p.value)),
    "never the raw column value 'active'",
  );
  // The count is contracts' alone (standing.lines.text, for Ask): the page stopped drawing it on 23 Sep, so it can
  // never count its own chips again ("0 of 0 agents live").
  assert.equal(on.standing.lines.text, "1 of 1 line connected");
});

test("Today claims 'handled everything' only when the receptionist did", () => {
  const all = toTodayVM(
    metrics({ period: { messages_in: 3, answered_by_ai: 3, conversations_active: 2 } }),
    [],
    [],
    [],
    NOW,
  );
  assert.match(all.standing.headline, /handled everything/);
  assert.match(all.needsYou.empty, /answered every message/);
  // One of the three was answered by you.
  const some = toTodayVM(
    metrics({
      period: { messages_in: 3, answered_by_ai: 2, answered_by_you: 1, messages_out_you: 1, conversations_active: 2 },
    }),
    [],
    [],
    [],
    NOW,
  );
  assert.doesNotMatch(some.standing.headline, /handled everything/);
  assert.match(some.standing.headline, /3 messages from 2 people today\. Nothing needs you right now\./);
  assert.doesNotMatch(some.needsYou.empty, /answered every message/);
  // One was answered by nobody.
  const none = toTodayVM(
    metrics({ period: { messages_in: 2, answered_by_ai: 1, unanswered_in_window: 1, conversations_active: 2 } }),
    [],
    [],
    [],
    NOW,
  );
  assert.doesNotMatch(none.standing.headline, /handled everything/);
});
