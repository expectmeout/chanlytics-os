/**
 * The deferred hygiene from the Tier 1 review, closed.
 *
 * F44 the session role could UPDATE any column the row policies allowed —
 * an operator could rewrite an inbound message's body through PostgREST;
 * F48 opening one person's profile materialised every message the tenant
 * ever exchanged, and the metrics CTEs were materialised where an index was
 * meant to be used; F51 a GET wrote invitations on the way through, exempt
 * from the cross-site check by being a GET; F15 a hundred calls with
 * per-word timings on every refresh were most of the payload.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toLiveCallVM, toCallVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { stripWordTimings } = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/dto.ts")).href);
const sql = readRaw("supabase/migrations/00037_hygiene.sql");

test("F44: the session role updates exactly the columns the verbs set, and nothing else", () => {
  assert.ok(sql.includes("revoke update on public.conversations from authenticated, anon;"));
  assert.ok(sql.includes("grant update (state, paused_until, snooze_until, assignee_user_id, last_message_at)\n  on public.conversations to authenticated;"));
  assert.ok(sql.includes("revoke update on public.messages from authenticated, anon;"));
  assert.ok(sql.includes("grant update (status, error) on public.messages to authenticated;"), "cancel-send and the superseded-draft cancel");
  assert.ok(sql.includes("revoke update on public.escalations from authenticated, anon;"));
  assert.ok(sql.includes("grant update (state, resolved_by_user_id, decision_id) on public.escalations to authenticated;"));
  // Every session-client UPDATE in the dashboard sets only granted columns.
  const granted = {
    conversations: ["state", "paused_until", "snooze_until", "assignee_user_id", "last_message_at"],
    messages: ["status", "error"],
    escalations: ["state", "resolved_by_user_id", "decision_id"],
  };
  const files = [
    "apps/dashboard/app/api/v1/conversations/[id]/archive/route.ts", "apps/dashboard/app/api/v1/conversations/[id]/hand-back/route.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts", "apps/dashboard/app/api/v1/conversations/[id]/snooze/route.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/take-over/route.ts", "apps/dashboard/app/api/v1/conversations/[id]/wake/route.ts",
    "apps/dashboard/app/api/v1/escalations/[id]/resolve/route.ts", "apps/dashboard/app/api/v1/messages/[id]/cancel-send/route.ts",
    "apps/dashboard/src/server/verbs.ts",
  ];
  for (const rel of files) {
    const src = readCode(rel);
    const re = /\.from\("(conversations|messages|escalations)"\)\s*\.update\(\{([\s\S]*?)\}\)/g;
    let m;
    while ((m = re.exec(src))) {
      const cols = m[2].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean);
      for (const c of cols) assert.ok(granted[m[1]].includes(c), `${rel}: ${m[1]}.${c} is not a granted column`);
    }
  }
});

test("F48: one person's profile reads one person's rows; the metrics CTEs are not materialised", () => {
  const people = sql.slice(sql.indexOf("create or replace function public.people_list"), sql.indexOf("create or replace function public.metrics_summary"));
  assert.ok(people.includes("and (p_contact_id is null or m.contact_id = p_contact_id)\n  )"), "the filter is inside the message CTE");
  assert.equal((sql.match(/real_msgs as not materialized \(/g) ?? []).length, 2, "metrics_summary and report_series");
  assert.ok(sql.includes("revoke all on function public.metrics_summary(uuid, integer) from public, anon;"), "the guards ride along");
  assert.ok(sql.includes("grant execute on function public.report_series(uuid, integer) to authenticated;"));
  // Re-created verbatim: the 00035 rule and the 00031 exclusions are still there.
  assert.equal((sql.match(/from public\.first_replies\(p_tenant_id, v_start\)/g) ?? []).length, 2);
  assert.ok(sql.includes("and k.status <> 'not_connected'"));
});

test("F51: a cross-site GET of the workspaces reads and writes nothing", () => {
  const route = readCode("apps/dashboard/app/api/v1/workspaces/route.ts");
  assert.ok(route.includes("isSameOrigin(_req) && (await acceptOpenInvites(userId, email ?? null)) > 0"));
  assert.ok(route.includes('from "@/server/request-guards"'));
});

test("F15: the list route ships each turn's start, not every word's timing, and the viewers read either", () => {
  const stripped = stripWordTimings([
    { role: "agent", content: "hi", words: [{ word: "hi", start: 0.4, end: 0.6 }] },
    { role: "user", content: "when?", words: [{ word: "when", start: 27.2, end: 27.5 }, { word: "?", start: 27.5, end: 27.6 }] },
    { role: "injected", content: "owner text" },
  ]);
  assert.deepEqual(stripped, [
    { role: "agent", content: "hi", start: 0.4 },
    { role: "user", content: "when?", start: 27.2 },
    { role: "injected", content: "owner text" },
  ]);
  assert.equal(stripWordTimings(null), null);
  assert.ok(!JSON.stringify(stripped).includes("words"));
  const dto = (transcript_object) => ({
    id: "k1", retell_call_id: "r1", direction: "inbound", call_type: null, status: "ended", from_e164: "+19175746416", from_raw: null, to_e164: null,
    started_at: "2026-09-05T03:00:00Z", ended_at: "2026-09-05T03:01:00Z", duration_ms: 60000, disconnection_reason: null, sentiment: null, call_successful: null, in_voicemail: null,
    summary: "ok", transcript_object, recording: null, conversation_id: "c1", contact_id: "p1", message_id: null,
    created_at: "2026-09-05T03:00:00Z", updated_at: "2026-09-05T03:01:00Z",
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175746416" },
  });
  const now = new Date("2026-09-05T03:05:00Z");
  assert.equal(toLiveCallVM(dto(stripped), now).transcript[1].t, "0:27", "the Live page reads `start`");
  assert.equal(toCallVM(dto(stripped), now).transcript[1].t, "0:27", "so does the Conversations viewer");
  assert.equal(toCallVM(dto([{ role: "user", content: "x", words: [{ start: 61 }] }]), now).transcript[0].t, "1:01", "and the raw provider shape still works");
  const route = readCode("apps/dashboard/src/server/dto.ts");
  assert.ok(route.includes("transcript_object: stripWordTimings(c.transcript_object),"));
});

test("every route pg_cron calls stands behind the one door", () => {
  // apps/edge/lib/cron-auth.ts is proved by running it (cron-auth.test.mjs).
  // This holds each scheduled route to it, so a route written tomorrow cannot
  // carry a tenth copy of the comparison that drifts from the others.
  const dir = path.join(here, "../../../apps/edge/api/cron");
  const routes = [
    ...fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => `apps/edge/api/cron/${f}`),
    "apps/edge/api/jobs/tick.ts",
  ];
  assert.ok(routes.length >= 9, `found ${routes.length} scheduled routes`);
  for (const r of routes) {
    const src = readCode(r);
    assert.ok(src.includes("await authorizeCron(request, db, L)"), `${r} stands behind authorizeCron`);
    assert.ok(!src.includes("timingSafeEqual") && !src.includes('rpc("get_cron_sweep_key")'), `${r} keeps no door of its own`);
  }
});
