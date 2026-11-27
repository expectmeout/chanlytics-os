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
import { fakeDb } from "../_fake-db.mjs";
import { runtime, text, world } from "../inbound/_world.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("the gate: a paused workspace sends nothing, after consent and before the policy; the script takes a message", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../packages/core/src/messages/outbound-gate.ts")).href);
  const base = {
    contact: { consent: "unknown", dnc: false, marketing_consent: "unknown" },
    purpose: "conversational",
    proactive: false,
    pausedUntilMs: null,
    replyMode: "auto",
    sentToday: 0,
    dailyCap: 5,
    nowMs: 1,
  };
  assert.deepEqual(mod.outboundGate({ ...base, paused: true }), { allowed: false, refusal: "paused" });
  assert.deepEqual(
    mod.outboundGate({
      ...base,
      paused: true,
      contact: { consent: "opted_out", dnc: false, marketing_consent: "unknown" },
    }),
    { allowed: false, refusal: "opted_out" },
    "consent still outranks everything",
  );
  assert.deepEqual(mod.outboundGate({ ...base, paused: false }), { allowed: true, refusal: null });
  assert.deepEqual(
    mod.outboundGate(base),
    { allowed: true, refusal: null },
    "callers that do not know about the pause are unchanged",
  );
  assert.ok(
    mod.refusalScript("paused", "+1 646").includes("call them back") &&
      !mod.refusalScript("paused", "+1 646").includes("billing"),
    "the caller hears an alternative, never our state",
  );
});

test("the phone receptionist's whole prompt while paused: a message and a call back, no price, no booking, no transfer", () => {
  const f = pausedVoiceFacts("Luna Studio");
  assert.ok(f.startsWith("You are answering the phone for Luna Studio."));
  assert.ok(
    f.includes("Take the caller's name, their number and what they need") &&
      f.includes("Do not quote a price, do not book or reschedule anything, do not transfer the call"),
  );
  assert.ok(pausedVoiceFacts(null).includes("for this business."));
});

test("the shell's one line: a pause outranks a newer build, and points at Billing", () => {
  const paused = shellStatusLine({ stale: true, degraded: ["Inbox"], paused: true });
  assert.equal(paused.text, "AI is paused");
  assert.equal(paused.action, "billing");
  assert.equal(
    paused.detail,
    "Calls are answered only to take a message, and new messages wait in the Inbox for you to answer.",
    "and what it means while it lasts",
  );
  assert.deepEqual(shellStatusLine({ stale: false, degraded: [], paused: false }), null);
  assert.equal(shellStatusLine({ stale: true, degraded: [] }).action, "reload", "without the flag, nothing changes");
});

test("the wiring: the runtime reads the switch, every path honours it, the shell says so", async () => {
  // The runtime (edge lib/shared/tenant-runtime.ts), loaded over a database in memory: the workspace's own row, with
  // its status, in the one load (packages/db's findWorkspaceRuntimeRow, decision 0111). A fresh workspace each case,
  // since the runtime is cached per channel.
  const { loadTenantRuntime } = await import(
    pathToFileURL(path.join(here, "../../apps/edge/lib/shared/tenant-runtime.ts")).href
  );
  const loaded = async (status, n) => {
    const tenantId = `aaaaaaaa-0000-4000-8000-00000000p0${n}`;
    const db = fakeDb(
      {
        tenants: [{ id: tenantId, name: "Harbor", slug: `harbor-${n}`, timezone: "America/New_York", status }],
        tenant_config: [{ tenant_id: tenantId, config: {} }],
        policies: [],
      },
      {},
      { runtime_stamp: () => `stamp-${n}` },
    );
    return loadTenantRuntime(db, { tenantId, channelId: `ch-${n}`, kind: "whatsapp", credentialsRef: null });
  };
  assert.equal((await loaded("paused", 1)).paused, true, "billing paused it: the runtime says so");
  assert.equal((await loaded("active", 2)).paused, false);

  // A message to a paused workspace is kept, held for a person, not answered: run in inbound/phases/ ("the rate cap,
  // the budget and a paused workspace all keep the customer's words"). And before the policy, which may still read
  // auto or veto: the hold is the pause's, and no draft waits on a veto.
  for (const mode of ["auto", "veto"]) {
    const w = world({ rt: runtime({ paused: true, policy: { reply: { mode, limits: { reply_delay_ms: 60_000 } } } }) });
    await w.run(text("are you open on Sunday?", `wamid.pause-${mode}`));
    assert.deepEqual(
      w.seen.escalations.map((e) => e.reason),
      ["paused"],
      `${mode}: held for a person`,
    );
    assert.deepEqual(w.seen.sent, [], `${mode}: nothing said`);
  }
  // A sequence's run: refused in its own words before anything is made, for Run now (playbooks-run-door.test.mjs,
  // "billing paused the workspace") and counted off by the sweep (cron-playbooks-door.test.mjs). A broadcast's run fails
  // with its reason and the owner is told, at the batch's head and for a pause that lands mid-batch
  // (broadcasts/core-broadcast/a-run-claims-sends-and-stops.test.mjs, "a paused workspace fails the run"). A text asked
  // for on the phone goes through the same gate, which refuses it before the wire: run in retell-fn-door.test.mjs. The
  // phone's pause script replaces the prompt, never adds to it, and the calendar is not read for it: run in
  // call-start.test.mjs. The line under the top bar reads the pause from the billing surface and opens Billing: mounted
  // in shell/surfaces/status/. Pinned as tenant-runtime.ts's, rows.ts's, reply-gates.ts's, playbooks.ts's and the
  // broadcast's stops' text until 26 Nov 2026.
});
