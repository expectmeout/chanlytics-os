/**
 * The pause, honoured: what a paused workspace (tenants.status, written by
 * billing) means on every path that speaks or sends — WhatsApp held for a
 * person, playbooks off, broadcasts refused with their reason, the phone
 * taking a message, the sidebar saying so with the way to Billing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pausedVoiceFacts, shellStatusLine } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the gate: a paused workspace sends nothing, after consent and before the policy; the script takes a message", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/outbound-gate.ts")).href);
  const base = { contact: { consent: "unknown", dnc: false, marketing_consent: "unknown" }, purpose: "conversational", proactive: false, pausedUntilMs: null, replyMode: "auto", sentToday: 0, dailyCap: 5, nowMs: 1 };
  assert.deepEqual(mod.outboundGate({ ...base, paused: true }), { allowed: false, refusal: "paused" });
  assert.deepEqual(
    mod.outboundGate({ ...base, paused: true, contact: { consent: "opted_out", dnc: false, marketing_consent: "unknown" } }),
    { allowed: false, refusal: "opted_out" },
    "consent still outranks everything",
  );
  assert.deepEqual(mod.outboundGate({ ...base, paused: false }), { allowed: true, refusal: null });
  assert.deepEqual(mod.outboundGate(base), { allowed: true, refusal: null }, "callers that do not know about the pause are unchanged");
  assert.ok(mod.refusalScript("paused", "+1 646").includes("call them back") && !mod.refusalScript("paused", "+1 646").includes("billing"), "the caller hears an alternative, never our state");
});

test("the phone receptionist's whole prompt while paused: a message and a call back, no price, no booking, no transfer", () => {
  const f = pausedVoiceFacts("Luna Studio");
  assert.ok(f.startsWith("You are answering the phone for Luna Studio."));
  assert.ok(f.includes("Take the caller's name, their number and what they need") && f.includes("Do not quote a price, do not book or reschedule anything, do not transfer the call"));
  assert.ok(pausedVoiceFacts(null).includes("for this business."));
});

test("the sidebar's one line: a pause outranks a newer build, and points at Billing", () => {
  assert.deepEqual(shellStatusLine({ stale: true, degraded: ["Inbox"], paused: true }), { text: "Your receptionist is paused", action: "billing" });
  assert.deepEqual(shellStatusLine({ stale: false, degraded: [], paused: false }), null);
  assert.deepEqual(shellStatusLine({ stale: true, degraded: [] }), { text: "A newer version is ready", action: "reload" }, "without the flag, nothing changes");
});

test("the wiring: the runtime reads the switch, every path honours it, the foot says so", () => {
  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes('db.from("tenants").select("name, timezone, status")') && rt.includes('paused: tzQ.data?.status === "paused",') && rt.includes("paused: false,"), "one read, the same query the clock uses");
  const inbound = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(inbound.includes("if (rt?.paused) {") && inbound.includes('sink.escalate("paused",'), "kept, held for a person, not answered");
  const inboundRaw = readRaw("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(inboundRaw.indexOf("if (rt?.paused) {") < inboundRaw.indexOf("// E3: the reply policy is consulted BEFORE generation."), "before the policy, which may still read auto");
  const pb = readCode("apps/edge/lib/playbooks.ts");
  assert.ok(pb.includes('if (tenant?.status === "paused") return { error: "paused" };'));
  assert.ok(readCode("apps/edge/api/cron/playbooks.ts").includes('if ("error" in ctx && ctx.error === "paused") {'), "counted off, said once, quietly");
  const jobs = readCode("packages/core/src/messages/broadcast.ts");
  assert.ok(jobs.includes('await ports.fail(b.id, "paused");') && jobs.includes("The workspace is paused until billing resumes, so nothing went out."));
  assert.ok(readCode("apps/edge/api/retell-fn.ts").includes("paused: rt.paused,"), "a text asked for on the phone goes through the same gate");
  // The phone's pause script replaces the prompt, never adds to it, and the
  // calendar is not read for it: run in call-start.test.mjs.
  const side = readCode("apps/dashboard/src/legacy/components/sidebar.jsx");
  assert.ok(side.includes("window.__billing.vm(B.dto).paused") && side.includes('line.action === "billing"') && side.includes('window.CHANLY.nav("admin/billing")'));
});
