/**
 * The voice canary (decision 0092): once a day a real call walks the whole road a customer's call takes, and the next
 * knock asks what it left behind.
 *
 * WHY A REAL CALL. Every test of the phone receptionist runs a delivery written by hand against a database in memory,
 * and production had held 63 calls by 3 November 2026, none longer than two minutes. Nothing proved that Retell still
 * reaches our doors with a signature that verifies, that the inbound plan still composes the business's facts inside
 * Retell's ten seconds, that the webhook still lands a row, a thread line, a notice and the audio, or that the provider's
 * account still has the credit to place a call at all (two real calls ended `credit_exhausted` on 6 October). A
 * scripted caller ringing a workspace of ours proves all of it, every day, for the cost of two short calls.
 *
 * THE ROAD. A GitHub schedule (.github/workflows/voice-canary.yml, outside the database's failure domain, as pg_cron is
 * not) knocks twice. `place`: the edge, which alone holds the provider's key, asks Retell to ring the canary
 * workspace's line from the platform's own number, played by a scripted agent that asks what times are open tomorrow
 * and says goodbye (VOICE_CANARY_CALLER_AGENT, which has no webhook of its own, so its side of the call reaches no door
 * of ours). The receptionist answers it as it answers anyone. Ten minutes later, `verdict`: the call's row, read with
 * the service role, is judged by judgeCanary, and a failure pages the platform and answers 503, so the workflow fails
 * and opens an issue.
 *
 * THE KNOCK. Its own key (VOICE_CANARY_KEY, the GitHub secret of the same name), never a platform token: a key that can
 * mint tokens for every door does not belong in GitHub. What this key opens is narrow: one call a half hour at most,
 * from the platform's number, to a workspace of ours, and a read of what that call left. Any of the four settings
 * unset, the door places nothing (voice_canary_unset).
 */
import crypto from "node:crypto";
import { createPhoneCall } from "@chanlytics/channels/voice";
import { getCanaryCallFacts, findCanaryLine, type CanaryCallFacts } from "@chanlytics/db/voice";
import { MIN_MS, isE164, isTenantId } from "@chanlytics/contracts";
import { json, refuse } from "../../shared/http.js";
import { pg } from "../../shared/pg.js";
import { env } from "../../shared/env.js";
import { errField, logger } from "../../shared/log.js";
import { pageOperator } from "../../shared/alerts/page-operator.js";
import type { TenantId } from "@chanlytics/contracts";

/** One canary call a half hour at most: the key can place no more, whoever holds it. */
const CANARY_EVERY_MS = 30 * MIN_MS;

/** Whether this knock carries the canary's key, compared in constant time; an unset key opens nothing. */
export function canaryKeyMatches(request: Request): boolean {
  const key = env.VOICE_CANARY_KEY;
  const given = request.headers.get("x-canary-key");
  if (!key || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface CanaryConfig {
  tenantId: TenantId;
  from: string;
  callerAgent: string;
  apiKey: string;
}

/** The canary's four settings and the provider key, or null when any is not set. */
function canaryConfig(): CanaryConfig | null {
  const tenantId = env.VOICE_CANARY_TENANT ?? "";
  const from = env.VOICE_CANARY_FROM ?? "";
  const callerAgent = env.VOICE_CANARY_CALLER_AGENT ?? "";
  const apiKey = env.RETELL_API_KEY ?? "";
  if (!isTenantId(tenantId) || !isE164(from) || !callerAgent || !apiKey) return null;
  return { tenantId, from, callerAgent, apiKey };
}

/** What judgeCanary says of a call: each check, whether it held, and the ones that did not. */
interface CanaryVerdict {
  ok: boolean;
  checks: Record<string, boolean>;
  failed: string[];
}

/**
 * Whether the canary's call left everything a customer's call must: pure, over what canaryCallFacts read.
 *
 *   - placed and answered: a row for the call, ended (not `not_connected`, not an error);
 *   - composed: the receptionist was briefed with the business's facts (the call's row carries the settings version
 *     only when the inbound plan composed them inside its budget);
 *   - analysed, a thread line, the notice claimed and told in full, the audio stored, the hold let go;
 *   - signed: the inbound door and the webhook each took Retell's signature since the call was placed.
 * The availability door is said but not judged: whether the agent reaches for the tool is the model's, on a script.
 */
export function judgeCanary(canaryCallFacts: CanaryCallFacts): CanaryVerdict {
  const call = canaryCallFacts.call;
  const signed = (door: string) => (canaryCallFacts.doors[door]?.signed ?? 0) > 0;
  const checks: Record<string, boolean> = {
    call_placed: call !== null,
    call_ended: call?.status === "ended",
    composed: call?.composed === true,
    analysed: call?.analysed === true,
    thread_line: call?.thread_line === true,
    notice_claimed: call?.notice_claimed === true,
    notice_told: call?.notice_told === true,
    recording_stored: call?.recording === "stored",
    hold_released: call?.hold_released === true,
    inbound_signed: signed("inbound"),
    webhook_signed: signed("webhook"),
  };
  const failed = Object.entries(checks)
    .filter(([, held]) => !held)
    .map(([name]) => name);
  return { ok: failed.length === 0, checks, failed };
}

/** `place`: ring the canary workspace's line from the platform's number, at most once a half hour. */
async function placeCanary(cfg: CanaryConfig): Promise<Response> {
  const log = logger({ tenant_id: cfg.tenantId });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let line: { ours: boolean; e164: string | null };
  let recent: CanaryCallFacts;
  try {
    line = await findCanaryLine(db, cfg.tenantId);
    recent = await getCanaryCallFacts(db, {
      tenantId: cfg.tenantId,
      fromE164: cfg.from,
      sinceIso: new Date(Date.now() - CANARY_EVERY_MS).toISOString(),
    });
  } catch (e) {
    log.error("voice_canary_place_failed", { step: "read", error: errField(e) });
    return refuse(503, "read_failed");
  }
  // Only a workspace of ours is ever rung: its owner's notices are the platform's, never a customer's.
  if (!line.ours) return refuse(409, "voice_canary_unset", "the canary's workspace must be one of ours (tenants.ours)");
  if (!line.e164)
    return refuse(409, "voice_canary_unset", "the canary's workspace has no line its receptionist answers");
  if (recent.call) return refuse(409, "voice_canary_too_soon", "a canary call was placed in the last half hour");
  const placed = await createPhoneCall(
    { apiKey: cfg.apiKey },
    { from_number: cfg.from, to_number: line.e164, override_agent_id: cfg.callerAgent, metadata: { canary: true } },
  );
  if (!placed.ok) {
    log.error("voice_canary_place_failed", { step: "provider", status: placed.status });
    return refuse(502, "provider_refused", `the provider would not place the canary call (HTTP ${placed.status})`);
  }
  const callId = typeof placed.body?.call_id === "string" ? placed.body.call_id : null;
  log.info("voice_canary_placed", { call_id: callId });
  return json(200, { ok: true, placed_at: new Date().toISOString(), call_id: callId });
}

/** `verdict`: what the canary's call since `since` left behind, judged; a failure pages the platform and answers 503. */
async function judgeCanaryCall(cfg: CanaryConfig, since: string): Promise<Response> {
  const log = logger({ tenant_id: cfg.tenantId });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let facts: CanaryCallFacts;
  try {
    facts = await getCanaryCallFacts(db, { tenantId: cfg.tenantId, fromE164: cfg.from, sinceIso: since });
  } catch (e) {
    log.error("voice_canary_verdict", { held: false, step: "read", error: errField(e) });
    return refuse(503, "read_failed");
  }
  const verdict = judgeCanary(facts);
  log.info("voice_canary_verdict", { ok: verdict.ok, failed: verdict.failed.join(",") });
  if (verdict.ok) return json(200, { ok: true, verdict, doors: facts.doors });
  await pageOperator(
    { db },
    "voice_canary",
    `The daily canary call did not leave everything behind: ${verdict.failed.join(", ")}`,
    `The canary called workspace ${cfg.tenantId}'s line from ${cfg.from} at ${since}. What did not hold: ` +
      `${verdict.failed.join(", ")}. docs/runbook.md, "When calls fail", says where each one is read.`,
  );
  return refuse(503, "voice_canary_failed", `what did not hold: ${verdict.failed.join(", ")}`);
}

/** The door's verb: `place` or `verdict` (with `since`, the time `place` answered). */
export async function runVoiceCanary(body: { op?: unknown; since?: unknown }): Promise<Response> {
  const cfg = canaryConfig();
  if (!cfg)
    return refuse(
      503,
      "voice_canary_unset",
      "VOICE_CANARY_TENANT, VOICE_CANARY_FROM, VOICE_CANARY_CALLER_AGENT and RETELL_API_KEY",
    );
  if (body.op === "place") return placeCanary(cfg);
  if (body.op === "verdict") {
    const since = typeof body.since === "string" && Number.isFinite(Date.parse(body.since)) ? body.since : null;
    if (!since) return refuse(400, "bad_request", "since: the time `place` answered, ISO");
    return judgeCanaryCall(cfg, new Date(since).toISOString());
  }
  return refuse(400, "unknown_op", "op: place or verdict");
}
