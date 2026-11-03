/**
 * The order a message is taken through is the product (packages/core/src/inbound/answer.ts), and it is said once, as
 * data: core's INBOUND_GATES (./order.ts). This runs the verb against that list, over the receptionist's world
 * (_world.mjs: the real adapter and gates, everything outside them faked), and holds the page written from it.
 *
 *   - each gate, tripped alone, stops the message with its own log line and the hold the list names for it;
 *   - the order: a world with a gate's condition AND the conditions of gates the list puts after it still stops at
 *     that gate, so no later gate is asked first. Conditions that cannot share a world (a message has one shape; a
 *     carrier's text is never the environment's own WhatsApp number; a mode that holds is decided before the live
 *     hold and the budget are asked) are proven in the chains they can share.
 *
 * Every world here but the hold window's refuses the model (the world's brain throws), so a gate that let the message
 * through would fail loudly rather than pass by answering.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESCALATION_REASONS, HOUR_MS } from "@chanlytics/contracts";
import { INBOUND_GATES } from "@chanlytics/core";
import { world, runtime, text, FROM } from "./_world.mjs";
import { linesOf } from "../_log-lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { LOG_EVENTS } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/log-events.ts")).href);
const { OUT, gatesPage } = await import(pathToFileURL(path.join(ROOT, "tooling/scripts/gen/inbound-gates.mjs")).href);

const GATES = INBOUND_GATES.filter((g) => g.kind === "gate");
const byKey = new Map(INBOUND_GATES.map((g) => [g.key, g]));
const LOGS = new Set(GATES.map((g) => g.log));

/**
 * Each gate's condition, as a world option, a runtime field or a change to the message. `shape` is the message's own
 * (one per message); the rest can stack.
 */
const AHEAD = { pilot: "15550001111" };
const CONDITION = {
  short_code: { from: "22395" },
  one_time_code: { body: "Your Apple ID Code is: 123456. Don't share it with anyone." },
  pilot_allowlist: { over: { isEnvDefault: true, env: { allowlist: AHEAD.pilot } } },
  replay: null,
  thread_unknown: { over: { unreadable: true } },
  opt_out: {
    over: {
      ingest: async () => ({
        message_id: "m-in",
        conversation_id: "conv1",
        contact_id: "k1",
        is_new: true,
        consent: "opted_out",
        dnc: true,
        paused_until: null,
      }),
    },
  },
  carriers: {
    over: {
      carrier: {
        channel: "sms",
        send: async () => ({ ok: true, wamid: "s1", status: 200 }),
        body: (t) => t,
        held: { reason: "carriers", details: "The line is not approved for texting yet." },
      },
    },
  },
  no_request: {
    shape: (id) => ({
      from: FROM,
      id,
      type: "reaction",
      timestamp: now(),
      reaction: { message_id: "wamid.0", emoji: "👍" },
    }),
  },
  readable_non_text: {
    shape: (id) => ({
      from: FROM,
      id,
      type: "location",
      timestamp: now(),
      location: { latitude: 25.7, longitude: -80.2 },
    }),
  },
  stale: { late: true },
  unreadable: {
    shape: (id) => ({ from: FROM, id, type: "audio", timestamp: now(), audio: { id: "a1", mime_type: "audio/ogg" } }),
  },
  confirmed_yes: { body: "START" },
  human_has_it: { over: { pausedUntil: Date.now() + HOUR_MS } },
  daily_cap: { over: { repliesToday: 1 }, limits: { max_replies_day: 1 } },
  workspace_paused: { rt: { paused: true } },
  mode_holds: { mode: "ask" },
  live_hold: { over: { control: { kind: "person", ref: null, until: new Date(Date.now() + HOUR_MS).toISOString() } } },
  budget: { over: { tokensUsed: 5000 }, limits: { max_llm_tokens_day: 1000 } },
  no_persona: { rt: { brain: null } },
  photo_unseen: {
    rt: { features: { vision: true } },
    over: { media: null },
    shape: (id) => ({
      from: FROM,
      id,
      type: "image",
      timestamp: now(),
      image: { id: "media-1", mime_type: "image/jpeg" },
    }),
  },
  superseded: { over: { turn: { claim: async () => false, holds: async () => true } } },
  // After the model: a reply it wrote, held as a draft in the veto window.
  hold_window: {
    mode: "veto",
    limits: { reply_delay_ms: 60_000 },
    over: { queue: true, env: { modelKey: "sk-test" } },
    extra: {
      brain: async () => ({
        generateReply: async () => ({
          text: "We have Friday at 3.",
          escalate: false,
          meta: { intent: "booking", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" },
          usage: { input_tokens: 40 },
        }),
      }),
    },
  },
};

function now() {
  return String(Math.floor(Date.now() / 1000));
}

/** One world and one message with every condition named, stacked; the run's lines, and what it asked. */
async function stopAt(keys, id) {
  const conds = keys.map((k) => CONDITION[k]);
  const over = Object.assign({ env: {} }, ...conds.map((c) => c.over ?? {}));
  over.env = Object.assign({}, ...conds.map((c) => c.over?.env ?? {}));
  const limits = Object.assign({}, ...conds.map((c) => c.limits ?? {}));
  const mode = conds.find((c) => c.mode)?.mode ?? "auto";
  over.rt = runtime(Object.assign({ policy: { reply: { mode, limits } } }, ...conds.map((c) => c.rt ?? {})));
  const w = world(over);
  const shape = conds.find((c) => c.shape)?.shape;
  const from = conds.find((c) => c.from)?.from ?? FROM;
  const body = conds.find((c) => c.body)?.body ?? "do you have anything on Friday?";
  let m = shape ? shape(id) : text(body, id, from);
  if (conds.some((c) => c.late)) m = { ...m, timestamp: String(Math.floor((Date.now() - 3 * HOUR_MS) / 1000)) };
  const extra = conds.find((c) => c.extra)?.extra ?? {};
  const { lines } = await linesOf(() => w.run(m, extra));
  const gates = lines.map((l) => l.event).filter((e) => LOGS.has(e));
  return { gates, w };
}

test("the list is whole: keys once each, every gate's line is one the edge logs, every hold one the Inbox knows", () => {
  assert.equal(byKey.size, INBOUND_GATES.length, "a key names one row");
  for (const g of INBOUND_GATES) {
    if (g.kind === "gate") assert.ok(LOG_EVENTS.includes(g.log), `${g.key}: ${g.log} is in LOG_EVENTS`);
    else assert.equal(g.log, null, `${g.key}: a step stops nothing, so it has no line`);
    if (g.hold) assert.ok(ESCALATION_REASONS.includes(g.hold), `${g.key}: ${g.hold} is a hold reason`);
  }
});

test("the page is what the script writes", () => {
  const page = fs.readFileSync(path.join(ROOT, OUT), "utf8").split("\r\n").join("\n");
  assert.equal(page, gatesPage(), `${OUT} is stale: corepack pnpm gen:inbound-gates`);
});

test("each gate, tripped alone, stops the message with its own line and the hold the list names", async () => {
  for (const g of GATES) {
    if (!CONDITION[g.key]) continue;
    const { gates, w } = await stopAt([g.key], `wamid.${g.key}`);
    assert.equal(gates[0], g.log, `${g.key}: stops with ${g.log} (saw ${gates.join(", ") || "none"})`);
    const held = [...w.seen.escalations, ...w.seen.underHold].map((e) => e.reason);
    assert.equal(held[0] ?? null, g.hold, `${g.key}: the hold is ${g.hold}`);
  }
});

test("a redelivery of a message already handled stops at the replay gate, before its memory is read", async () => {
  const w = world({ rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await w.run(text("hello", "wamid.again"));
  const reads = w.seen.threadReads;
  const { lines } = await linesOf(() => w.run(text("hello", "wamid.again"), {}, true));
  assert.deepEqual(
    lines.map((l) => l.event).filter((e) => LOGS.has(e)),
    [byKey.get("replay").log],
  );
  assert.equal(w.seen.threadReads, reads, "no memory read for it");
});

/**
 * Chains of gates whose conditions can share one world, each in the list's order. Every gate of a chain, with its own
 * condition and every later one's, stops first.
 */
const CHAINS = [
  // The environment's own WhatsApp number, every set-aside, then the gates every text meets.
  [
    "short_code",
    "one_time_code",
    "pilot_allowlist",
    "thread_unknown",
    "opt_out",
    "stale",
    "human_has_it",
    "daily_cap",
    "workspace_paused",
    "mode_holds",
  ],
  // A texting line the carriers have not approved.
  ["thread_unknown", "opt_out", "carriers", "stale", "human_has_it", "daily_cap", "workspace_paused", "mode_holds"],
  // A message's own shape, before the gates that hold whatever it is.
  ["no_request", "stale", "human_has_it", "daily_cap", "workspace_paused", "mode_holds"],
  ["readable_non_text", "stale", "human_has_it", "daily_cap", "workspace_paused", "mode_holds"],
  ["unreadable", "daily_cap", "workspace_paused", "mode_holds"],
  ["confirmed_yes", "human_has_it", "daily_cap", "workspace_paused", "mode_holds"],
  // Asked only of a message the mode lets through: the live hold, then the budget, then a workspace with no persona.
  ["live_hold", "budget", "superseded", "hold_window"],
  ["budget", "no_persona"],
  ["superseded", "hold_window"],
];

test("the gates run in their order: with every later gate's condition on as well, each still stops first", async () => {
  const at = (k) => INBOUND_GATES.findIndex((g) => g.key === k);
  for (const chain of CHAINS) {
    for (let i = 1; i < chain.length; i++)
      assert.ok(at(chain[i - 1]) < at(chain[i]), `the chain ${chain.join(" > ")} follows the list`);
    for (let i = 0; i < chain.length; i++) {
      const keys = chain.slice(i);
      const { gates } = await stopAt(keys, `wamid.chain-${keys.join("-")}`);
      const g = byKey.get(chain[i]);
      assert.equal(gates[0], g.log, `${keys.join(" + ")}: ${g.key} is asked first (saw ${gates.join(", ") || "none"})`);
    }
  }
});
