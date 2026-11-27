/**
 * Run the receptionist on a set of messages, for one workspace, and hand
 * back what it would have said — nothing is sent, nothing is written.
 *
 * The door is api/admin/eval.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this the knock
 * (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The evaluation harness. The model key lives on the edge and nowhere else,
 * so this is where a prompt or config change is exercised against the real
 * composed prompt: the runner (tooling/scripts/eval-brain.mjs) posts a case
 * set, gets the record for each (reply, intent, escalate, confidence, facts,
 * language, tokens, latency), and judges it locally against the case's
 * expectations. Internal endpoint — x-diag-key.
 *
 * Small on purpose: at most six cases per request, sequential, inside the
 * function's budget; the runner batches. Body: { tenant_id, cases: [{ id,
 * text, history?, who? }] } where history is prior turns [{ role, content }]
 * and who is the made-up person the case speaks with (contracts EVAL_DOOR): the
 * note about them is the live turn's own (db describeLead), so a case can show
 * the model an ad a person tapped, or a profile name, as a live turn shows it;
 * its answer says so (`heard_who`). The answer carries the prices the workspace may say (allowed_prices, contracts
 * priceAllowance; null for the strict rule), so the runner judges a price
 * against the workspace's own switch.
 *
 * Settings' Try it asks here too, one case at a time, with a token the dashboard minted for the member and the
 * workspace (dashboard server/receptionist/try.ts). So beside each answer is what the live turn would do with it (`then`):
 * the words layer two leaves, whether the thread goes to a person and why, and how long the reply would wait. And a
 * workspace with no WhatsApp line yet is answered as its chat would be, which is when an owner most wants to try it.
 * A lead's own receptionist's page asks the same way for its preview's workspace and no person (decision 0079), and is
 * answered only while previews are switched on.
 */
import { json, refuse } from "../shared/http.js";
import { stop, type Refused } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { loadTenantRuntime, type TenantRuntime } from "../shared/tenant-runtime.js";
import { findOpenings, takesRequests } from "../calendar/availability.js";
import {
  asContactId,
  EVAL_DOOR,
  resolveSystemPrompt,
  describeNow,
  fallbackMessages,
  priceAllowance,
  isTenantId,
  recordOrNull,
} from "@chanlytics/contracts";
import { holdPlan, layerTwo } from "@chanlytics/core";
import { findOldestActiveChannel, type RoutedChannel } from "@chanlytics/db/channels";
import { describeLead } from "@chanlytics/db/conversations";
import { brainCallOf, generateReply, type BrainReply } from "../ai/receptionist-brain.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

const MAX_CASES = 6;

interface EvalCase {
  id: string;
  text: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Who the case speaks with, unread until the door's schema reads it (casesWithPeople). */
  who?: unknown;
}

/**
 * The person a case may name, as the door declares it (contracts EVAL_DOOR): read through the declaration itself, so
 * what the door takes and what the dashboard's side of it says cannot differ.
 */
const CASE_PERSON = EVAL_DOOR.body.shape.cases.unwrap().element.shape.who.unwrap();
type CasePerson = ReturnType<typeof CASE_PERSON.parse>;

/** A case with the person it names, as the door's schema read them: null where it names nobody. */
interface CaseWithPerson {
  evalCase: EvalCase;
  person: CasePerson | null;
}

/**
 * A made-up person's id. The note about a person says nothing of anyone without one ("New contact"), and nothing is
 * read by it: describeLead is told who they are, never asked to look them up.
 */
const MADE_UP_PERSON = asContactId("00000000-0000-4000-8000-000000000000");

/**
 * The model as a port, as on the steer door. Production passes nothing and
 * gets the real brain; a test hands in an answer, because lib/brain.ts speaks
 * to the Anthropic SDK and has no seam of its own. Anything else that may
 * arrive in this position carries no generateReply and changes nothing. BOTH
 * branches are run in tests/eval-door.test.mjs: most cases
 * hand a brain in, and the last two call POST the way Vercel calls it and
 * watch the real brain reach the model.
 */
export interface EvalBrainPort {
  generateReply?: typeof generateReply;
}

/**
 * The door's answer: what the receptionist said, case by case, and the prices the workspace may say
 * (allowed_prices, contracts priceAllowance; null for the strict rule), so the runner judges by the workspace's switch.
 * The allowance is read at `now`, the clock the cases' prompt was composed at: a note that has ended lends it nothing.
 */
function evalAnswer(
  rt: Awaited<ReturnType<typeof loadTenantRuntime>>,
  now: Date,
  promptChars: number,
  results: readonly unknown[],
): Response {
  const allowed = priceAllowance(rt.brain, rt.timezone, now);
  return json(200, {
    ok: true,
    prompt_chars: promptChars,
    timezone: rt.timezone,
    allowed_prices: allowed ? [...allowed] : null,
    results,
  });
}

/**
 * What the live turn is told beside the prompt, and may write (core model-turn.ts): the clock and the open times, and,
 * where the workspace takes booking requests, the two fields a time picked is written in, and what it wrote (decision
 * 0061). A workspace with no calendar is told the clock alone, as before; one that takes no requests answers as before.
 */
async function turnOf(rt: TenantRuntime, now: Date) {
  const openings = await findOpenings(rt, "chat", now);
  const clock = describeNow(rt.timezone, now, rt.brain?.profile?.closures);
  const takes = takesRequests(rt);
  return {
    nowNote: openings
      ? `${clock}

${openings}`
      : clock,
    asks: takes ? { bookingRequests: true } : {},
    said: (r: { booking?: { slot: string; service: string } }) =>
      takes ? { takes_requests: true, booking: r.booking ?? null } : {},
  };
}

/**
 * What the live turn would do with an answer (core model-turn.ts `checked`, dispatch.ts `planTheHold`), by the same two
 * functions: the words layer two leaves (`changed` names why it replaced the model's, where it did), whether the thread
 * goes to a person and under which reason, and how long the reply waits under the reply row's mode and confidence dial.
 * The words go out either way, as they do live: a hand-off sends them and holds the thread for a person. Under "ask" or
 * "never" the live receptionist is not asked at all (core reply-gates.ts), which the mode says.
 */
function thenOf(rt: TenantRuntime, brainCfg: NonNullable<TenantRuntime["brain"]>, brainReply: BrainReply, now: Date) {
  const reply = rt.policy["reply"];
  // A workspace with no reply row holds every message for a person, as the runtime reads it (an unexpected mode is ask).
  const mode = reply?.mode ?? "ask";
  const two = layerTwo({
    replyText: brainReply.text,
    escalate: brainReply.escalate,
    escalationReason: brainReply.reason ?? "human_token",
    brainCfg,
    policy: rt.policy,
    intent: brainReply.meta?.intent ?? null,
    language: brainReply.meta?.language ?? null,
    known: rt.known,
    tz: rt.timezone,
    now,
  });
  const plan = holdPlan(mode, reply?.limits ?? {}, brainReply.meta);
  return {
    mode,
    text: two.replyText,
    changed: two.replyText === brainReply.text ? null : two.priceBlocked ? "price" : two.askClass,
    escalate: two.escalate,
    reason: two.escalate ? two.escalationReason : null,
    hold_ms: plan.delayMs,
    held_for: plan.delayMs > 0 ? plan.source : null,
    min_confidence: plan.minConfidence,
  };
}

/**
 * The channel the cases are answered as: the workspace's WhatsApp, as the webhook would route it (its oldest active one,
 * where it holds two), else the workspace's chat before it has a line, loaded by the workspace (campaigns/reach-out/reply-draft.ts
 * builds its mailbox's the same way: a kind that is not WhatsApp binds no number and reads every setting by the tenant).
 */
async function routedFor(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: TenantId,
): Promise<RoutedChannel | undefined> {
  const routed = await findOldestActiveChannel(db, tenantId, "whatsapp").catch(logAndGoOn("findOldestActiveChannel"));
  if (routed !== null) return routed;
  return {
    kind: "chat",
    channelId: tenantId,
    tenantId,
    externalId: "",
    numberE164: null,
    credentialsRef: null,
    config: {},
  };
}

/** The most a case's text holds. */
const CASE_MAX_CHARS = 500;

/** A case as the request sent it: any field may be missing or of another kind until caseRefusal has read it. */
type CaseAsSent = Partial<Record<keyof EvalCase, unknown>> | null;

/** A turn of a case's history in its shape: who said it, and its words. */
function isHistoryTurn(value: unknown): boolean {
  const turn = recordOrNull(value);
  return !!turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string";
}

/** The first case the door refuses, in its own words; null where every one is whole. */
function caseRefusal(cases: readonly CaseAsSent[]): Response | null {
  for (const evalCase of cases) {
    if (
      !evalCase ||
      typeof evalCase.id !== "string" ||
      typeof evalCase.text !== "string" ||
      !evalCase.text.trim() ||
      evalCase.text.length > CASE_MAX_CHARS
    ) {
      return refuse(400, "bad_request", `each case needs an id and a text of 1-${CASE_MAX_CHARS} chars`);
    }
    if (
      evalCase.history &&
      (!Array.isArray(evalCase.history) || evalCase.history.length > 12 || !evalCase.history.every(isHistoryTurn))
    ) {
      return refuse(400, "bad_request", "history is up to 12 turns of { role, content }");
    }
  }
  return null;
}

/**
 * Each case held to the door's limits (caseRefusal), with the person it names read by the door's own schema, before
 * anything is read or asked; the first case or person out of its shape is refused. A case that names nobody carries none.
 */
function casesWithPeople(cases: readonly EvalCase[]): { ok: true; cases: CaseWithPerson[] } | Refused {
  const badCase = caseRefusal(cases);
  if (badCase) return stop(badCase);
  const read: CaseWithPerson[] = [];
  for (const evalCase of cases) {
    const person = evalCase.who === undefined ? null : CASE_PERSON.safeParse(evalCase.who);
    if (person && !person.success) {
      return stop(
        refuse(
          400,
          "bad_request",
          "who is { name, returning?, ad? }: a name of up to 200 characters, and the ad as AI is told it, each part one line",
        ),
      );
    }
    read.push({ evalCase, person: person ? person.data : null });
  }
  return { ok: true, cases: read };
}

/**
 * The note about the person a case names, as a live turn on WhatsApp is handed it: written by the live turn's own
 * describeLead from what the case says of them, never the case's text as it came. Nothing else is known of a made-up
 * person, so nothing else is said: no history, no email, no deal, no notes. A case that names nobody is handed over as
 * it always was: no note, not even an empty one.
 */
function noteFor(person: CasePerson | null, now: Date, timezone: string | null): { leadNote?: string } {
  if (!person) return {};
  const lead = {
    contactId: MADE_UP_PERSON,
    conversationId: null,
    name: person.name,
    returning: person.returning ?? false,
    lastSeenAt: null,
    history: [],
    optedOut: false,
    ad: person.ad ?? null,
  };
  return { leadNote: describeLead(lead, now, timezone ?? "UTC", "whatsapp") };
}

/**
 * What an answer says of the person its case named: that the model was told who they are, so a runner can tell an answer
 * to them from an older edge's answer to a stranger (eval-judge.mjs). Nothing for a case that names nobody.
 */
const heardOf = (person: CasePerson | null): { heard_who?: true } => (person ? { heard_who: true } : {});

export async function evaluateCases(
  auth: Admitted,
  body: Partial<{ tenant_id?: string; cases?: EvalCase[] }>,
  brain?: EvalBrainPort | null,
): Promise<Response> {
  const log = logger();
  const ask = brain?.generateReply ?? generateReply;
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = String(body.tenant_id || "");
  const cases = Array.isArray(body.cases) ? body.cases : [];
  if (!isTenantId(tenantId) || !cases.length || cases.length > MAX_CASES) {
    return refuse(400, "bad_request", `tenant_id and 1-${MAX_CASES} cases required`);
  }
  const held = casesWithPeople(cases);
  if (!held.ok) return held.response;

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const routed = await routedFor(db, tenantId);
  if (routed === undefined) return refuse(503, "channel_read_failed");
  const rt = await loadTenantRuntime(db, routed);
  if (!rt.brain) return refuse(409, rt.configBroken ? "config_broken" : "no_persona");
  // A lead's own receptionist nobody has made theirs answers only while previews are switched on (decision 0079): the
  // switch is the one that stops what they spend, whatever pages are open.
  if (rt.preview && env.LEAD_PREVIEWS !== "on") return refuse(409, "preview_failed", "previews are switched off");
  const now = new Date(); // the run's one clock: the prompt, the clock note, the prices it may say, and its timing
  const system = resolveSystemPrompt(rt.brain, "whatsapp", rt.timezone, now, rt.policy, rt.known);
  const { nowNote, asks, said } = await turnOf(rt, now);
  // The holding message as a customer would get it, its details filled as they are now (S5).
  const holding = fallbackMessages(rt.brain, rt.known).error;
  const call = { ...brainCallOf(tenantId, rt), ...asks };
  const results = [];
  for (const { evalCase: otherCase, person } of held.cases) {
    const t0 = Date.now();
    try {
      const result = await ask({
        history: otherCase.history ?? [],
        userText: otherCase.text,
        systemPrompt: system,
        fallbackText: holding,
        nowNote,
        call,
        ...noteFor(person, now, rt.timezone),
      });
      results.push({
        id: otherCase.id,
        ok: true,
        text: result.text,
        escalate: result.escalate,
        reason: result.reason ?? null,
        meta: result.meta ?? null,
        usage: result.usage ?? null,
        ms: Date.now() - t0,
        then: thenOf(rt, rt.brain, result, now),
        ...said(result),
        ...heardOf(person),
      });
    } catch (e) {
      results.push({
        id: otherCase.id,
        ok: false,
        error: String(e instanceof Error ? e.message : e).slice(0, 200),
        ms: Date.now() - t0,
      });
    }
  }
  // The texts are the model's and stay out of the log; the count and the time are what a search needs.
  log.info("admin_eval", {
    tenant_id: tenantId,
    cases: cases.length,
    ms: Date.now() - now.getTime(),
    prompt_chars: system.length,
  });
  return evalAnswer(rt, now, system.length, results);
}
