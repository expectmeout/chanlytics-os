/**
 * Customer-facing polish: the bell says a thing once and in words, a reply
 * is bounded to the send, the clock names the day, and the developer's
 * footer and the mockup's presence menu are not a customer's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeFeed, tzClock } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const row = (over) => ({ key: "x", kind: "alert", at: 1, title: "", message: "", to: "", icon: "", tone: "", action: "", unread: true, ...over });

test("the bell says a thing once: a kept handoff or call-back row hides while the derived needs-you row for its thread stands", () => {
  const derived = row({ key: "needs:th-c1", kind: "needs_you" });
  const keptSame = row({ key: "n:1", kind: "handoff", about: { type: "conversation", id: "c1" } });
  const keptOther = row({ key: "n:2", kind: "handoff", about: { type: "conversation", id: "c2" } });
  const keptCall = row({ key: "n:3", kind: "call", about: { type: "call", id: "k9" } });
  const keptCallback = row({ key: "n:4", kind: "call", about: { type: "conversation", id: "c1" } });
  assert.deepEqual(dedupeFeed([derived, keptSame, keptOther, keptCall, keptCallback]).map((r) => r.key), ["needs:th-c1", "n:2", "n:3"]);
  assert.deepEqual(dedupeFeed([keptSame, keptCallback]).map((r) => r.key), ["n:1", "n:4"], "answered: the derived row is gone and the record stays");
});

test("the clock names the day when it is not today", () => {
  const tz = "America/New_York";
  const now = new Date("2026-09-06T20:00:00Z"); // 4:00 PM Sunday in New York
  assert.equal(tzClock("2026-09-06T22:46:00Z", tz, now), "6:46 PM");
  assert.equal(tzClock("2026-09-07T22:46:00Z", tz, now), "tomorrow 6:46 PM");
  assert.equal(tzClock("2026-09-09T13:00:00Z", tz, now), "Wed 9:00 AM");
  assert.equal(tzClock(null, tz, now), null);
});

test("the wiring: words on the edge, a bounded reply on both sides, the layout fixes, and nothing of the workshop on a customer's screen", () => {
  const alerts = readCode("apps/edge/lib/whatsapp/alerts.ts");
  assert.ok(alerts.includes("subject: `${name} needs a person — ${why}`") && alerts.includes("about,") && alerts.includes('"passed to a human": "asked for a person"'), "a handoff is said in the owner's words, about its thread");
  assert.ok(!alerts.includes("WhatsApp handoff needed"));
  const inbound = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok((inbound.match(/n\.profileName \?\? null/g) ?? []).length >= 11, "every handoff carries the name and the thread");
  const webhook = readCode("apps/edge/api/retell-webhook.ts");
  assert.ok(webhook.includes("about: callAbout,") && webhook.includes("} phoned · ${") && webhook.includes('callAbout = { type: "conversation", id: res.conversation_id };'), "a call is said by name, about its call — or its thread when it needs a call back");
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/notifications.ts").includes("dedupeFeed([...applyReadState("), "the bridge shows the feed once");
  const server = readCode("apps/dashboard/src/server/broadcasts.ts");
  assert.ok(server.includes("const REPLY_WINDOW_MS = 72 * 3_600_000;") && server.includes("<= REPLY_WINDOW_MS) {") && server.includes("replied.set(m.conversation_id, m.created_at)"), "a reply is an inbound inside the window, and the FIRST one is kept with its time (slice C)");
  const mig = readRaw("supabase/migrations/00064_campaign_reply_window.sql");
  assert.ok(mig.includes("and i.created_at <= s.sent_at + interval '72 hours')  as replied") && mig.includes("create or replace function public.campaign_series"), "the SQL series keeps the same window");
  assert.ok(readCode("packages/contracts/src/campaign-report.ts").includes("wrote back within 3 days"));
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css").includes(".brief-beat-text { flex: 1; min-width: 0; }"), "a long beat wraps beside its dot, not under it");
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/components.css").includes("  overflow-wrap: anywhere;\n}\n.stat-cell-meta.pos"), "a long meta wraps in its own cell, not into the next");
  assert.ok(readCode("apps/dashboard/src/legacy/components/data-bits.jsx").includes('title={typeof meta === "string" ? meta : undefined}'));
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/reports.css").includes(".rp2-delta { font-size: 10.5px; white-space: normal; line-height: 1.25; min-width: 0; }"), "a delta wraps instead of truncating");
  const today = readCode("packages/contracts/src/today.ts");
  assert.ok((today.match(/tzClock\(/g) ?? []).length >= 5, "every closing time names its day");
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(!app.includes("other surfaces seeded") && !app.includes("liveLabels"), "the footer is the customer's");
  const topbar = readCode("apps/dashboard/src/legacy/components/topbar.jsx");
  assert.ok(topbar.includes("{window.__DEMO_MODE && (") && topbar.indexOf("{window.__DEMO_MODE && (") < topbar.indexOf('btnClass="btn btn-ghost btn-sm tb-presence"'), "presence is the mockup's");
});
