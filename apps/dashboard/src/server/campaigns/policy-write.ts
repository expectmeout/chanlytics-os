/**
 * A change to one class's autonomy row (PUT /api/v1/policies): its class, a mode or none (the row keeps its own), and
 * the reply row's dials by the names the row keeps them under. A dial that is not a number is refused in its own words
 * by the schema; its range, which class may carry it and whether the class can honour the mode (contracts
 * policyModeOffered, over POLICY_CLASS_MODES) are judged here, and every refusal is a sentence. The money lock lives in
 * a database trigger, so even this route cannot unlock it. The change is one write in the database (policy_change,
 * 00624), which records it on the ledger every other consequential act lands in as it makes it. The route declares who
 * may and how often; the GET's body is its reader's (readers/autonomy.ts).
 */
import { z } from "zod";
import {
  AppError,
  isOneOf,
  POLICY_CLASSES,
  POLICY_MODES,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
  policyModeRefusal,
  causedBy,
} from "@chanlytics/contracts";
import { listPolicies, savePolicyChange } from "@chanlytics/db/workspace";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";

/** Each dial's refusal, said once: by the schema for a value that is not a number, below for one out of its range. */
const DIAL_WORDS = {
  reply_delay_ms: `The reply delay must be between ${REPLY_DELAY_MIN_MS / 1000}s and ${REPLY_DELAY_MAX_MS / 60000} minutes.`,
  min_confidence: "The confidence dial is a number from 0 (off) to 1.",
  max_llm_tokens_day: "The token budget is a whole number from 1,000 to 5,000,000, or 0 to turn it off.",
  max_replies_day: "The reply cap is a whole number from 1 to 200.",
  pause_hours: "The pause is a whole number of hours from 1 to 168.",
  answer_within_hours: "The time to answer people is a whole number of hours from 1 to 168.",
} as const;

/**
 * The dials' camelCase names, still read for one release from 28 September 2026, when this body became snake_case
 * (the wire is snake_case: docs/naming.md, decision 0022). A tab opened before that deploy sends them, and so does
 * Ask's autonomy card (`minConfidence`, contracts' ask/proposals/workspace.ts, Ask Rewired's to move). A body that
 * says both is read by its snake_case name. This map goes, and the old names with it, in the release after the card
 * sends `min_confidence`.
 */
const OLD_NAMES = {
  replyDelayMs: "reply_delay_ms",
  minConfidence: "min_confidence",
  maxTokensDay: "max_llm_tokens_day",
  maxRepliesDay: "max_replies_day",
  pauseHours: "pause_hours",
} as const;

function withOldNames(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const named: Record<string, unknown> = { ...body };
  for (const [old, name] of Object.entries(OLD_NAMES)) {
    if (!(old in named)) continue;
    if (!(name in named)) named[name] = named[old];
    delete named[old];
  }
  return named;
}

/**
 * A change to one class's row: its class, a mode or none (the row keeps its own), and the reply row's dials, by the
 * names the row keeps them under and GET answers them with (`policy.limits`). A dial that is not a number is refused
 * in its own words; its range, and which class may carry it, are the handler's to judge.
 */
export const PolicyChange = z.preprocess(
  withOldNames,
  z.object({
    class: z.string({ error: "Unknown policy class." }),
    mode: z.string({ error: "Unknown mode." }).optional(),
    reply_delay_ms: z.number({ error: DIAL_WORDS.reply_delay_ms }).optional(),
    min_confidence: z.number({ error: DIAL_WORDS.min_confidence }).optional(),
    max_llm_tokens_day: z.number({ error: DIAL_WORDS.max_llm_tokens_day }).optional(),
    max_replies_day: z.number({ error: DIAL_WORDS.max_replies_day }).optional(),
    pause_hours: z.number({ error: DIAL_WORDS.pause_hours }).optional(),
    answer_within_hours: z.number({ error: DIAL_WORDS.answer_within_hours }).optional(),
  }),
);

/**
 * What a class's row held before a change, for the answer: its mode and its confidence dial, each null where it held
 * none (or there was no row). The row is read once at the head of the change, where a delay edit takes its mode from
 * too, so an undo puts back what was there at the write and not what a card read when it was proposed.
 */
function policyWas(row: { mode: string; limits: unknown } | undefined): {
  mode: string | null;
  min_confidence: number | null;
} {
  const dial =
    row && row.limits !== null && typeof row.limits === "object" && !Array.isArray(row.limits) ? row.limits : {};
  const confidence = "min_confidence" in dial && typeof dial.min_confidence === "number" ? dial.min_confidence : null;
  return { mode: row?.mode ?? null, min_confidence: confidence };
}

/** The reply row's whole-number dials: each one's range, and what a class other than the reply row is told of it. */
const WHOLE_DIALS = [
  { key: "max_replies_day", min: 1, max: 200, only: "The reply cap only applies to the reply policy." },
  { key: "pause_hours", min: 1, max: 168, only: "The pause only applies to the reply policy." },
  { key: "answer_within_hours", min: 1, max: 168, only: "The time to answer people only applies to the reply policy." },
] as const;

/** A whole-number dial's value as it may be kept: in its range, on the reply row alone; undefined where none was given. */
function wholeDial(cls: string, value: number | undefined, dial: (typeof WHOLE_DIALS)[number]): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < dial.min || value > dial.max)
    throw new AppError("validation", DIAL_WORDS[dial.key]);
  if (cls !== "reply") throw new AppError("validation", dial.only);
  return value;
}

/**
 * The change, as the database's one write (packages/db savePolicyChange over policy_change, 00624): the dials merged
 * where they are kept, the mode when the change gave one (null: the row keeps its own), and the change's row on the
 * ledger with it (the class, the mode, the dials' names and never their values, who, and the card). No row is a 404,
 * and the money lock's refusal is said in the route's words.
 */
async function savePolicyRow(
  ctx: RouteContext,
  member: Member,
  cls: (typeof POLICY_CLASSES)[number],
  change: { mode: (typeof POLICY_MODES)[number] | null; limits: Record<string, unknown> },
) {
  try {
    const row = await savePolicyChange(ctx.supabase, member.tenantId, cls, { ...change, via: ctx.via ?? null });
    if (!row) throw new AppError("not_found", "Policy row not found.", 404);
    return row;
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/money decisions are owner-only/.test(msg)) {
      throw causedBy(new AppError("forbidden", "Money stays owner-only by charter — that row is locked.", 403), e);
    }
    throw e;
  }
}

export async function changePolicy(ctx: RouteContext, input: z.infer<typeof PolicyChange>, member: Member) {
  const cls = input.class;
  if (!isOneOf(POLICY_CLASSES, cls)) throw new AppError("validation", "Unknown policy class.");
  // A delay edit carries no mode: the row keeps the one it has. Requiring the
  // client to resend it meant a stale page changing the hold window could
  // silently flip Replies to whatever mode that page had loaded. Every dial
  // travels the same way. The mode the row holds is read here to judge the change by, and is never written back: a
  // dial saved while a teammate changed the mode put the old one back (the replies turned off, then on again).
  const inputMode = input.mode ?? "";
  let mode = inputMode;
  const dials = [
    input.reply_delay_ms,
    input.min_confidence,
    input.max_llm_tokens_day,
    input.max_replies_day,
    input.pause_hours,
    input.answer_within_hours,
  ];
  const current = (await listPolicies(ctx.supabase, member.tenantId)).find((p) => p.class === cls);
  if (mode === "" && dials.some((d) => d !== undefined)) {
    if (!current) throw new AppError("not_found", "Policy row not found.", 404);
    mode = current.mode;
  }
  if (!isOneOf(POLICY_MODES, mode)) throw new AppError("validation", "Unknown mode.");
  // A switch nothing enforces is a switch that lies: each class offers only the modes the runtime honours for it, by
  // the rule the Autonomy pane draws its dots by (contracts policyModeOffered, over POLICY_CLASS_MODES). Veto is
  // offered wherever something waits to be stopped: a reply in the hold window, a playbook run thirty minutes out, a
  // reach-out's later run (Reach out, Part 3).
  const refusal = policyModeRefusal(cls, mode);
  if (refusal) throw new AppError("validation", refusal);

  // The wait, in ms. Clamped at the boundary as well as in the reader: a value
  // that reaches the database out of range would be silently corrected on read
  // and the workspace would see a number it never chose.
  const limits: Record<string, unknown> = {};
  if (input.reply_delay_ms !== undefined) {
    const d = input.reply_delay_ms;
    if (!Number.isFinite(d) || d < REPLY_DELAY_MIN_MS || d > REPLY_DELAY_MAX_MS) {
      throw new AppError("validation", DIAL_WORDS.reply_delay_ms);
    }
    if (cls !== "reply") throw new AppError("validation", "A reply delay only applies to the reply policy.");
    limits.reply_delay_ms = Math.round(d);
  }
  // The confidence dial, 0 to 1; 0 is off. Same boundary rule as the delay.
  if (input.min_confidence !== undefined) {
    const c = input.min_confidence;
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      throw new AppError("validation", DIAL_WORDS.min_confidence);
    }
    if (cls !== "reply") throw new AppError("validation", "The confidence dial only applies to the reply policy.");
    limits.min_confidence = Math.round(c * 100) / 100;
  }
  // The day's token budget: a whole number of at least a thousand, or 0 to
  // turn it off. Same boundary rule as the others.
  if (input.max_llm_tokens_day !== undefined) {
    const t = input.max_llm_tokens_day;
    if (!Number.isFinite(t) || t < 0 || t > 5_000_000 || (t > 0 && t < 1000)) {
      throw new AppError("validation", DIAL_WORDS.max_llm_tokens_day);
    }
    if (cls !== "reply") throw new AppError("validation", "The token budget only applies to the reply policy.");
    limits.max_llm_tokens_day = Math.round(t);
  }
  // The two hard limits Chanlytics used to set for a workspace, now the owner's (S6): automatic replies to one person in
  // 24 hours before the receptionist stops and asks, and the hours it stays out of a conversation once a person steps
  // in; and how long someone handed to the team may wait before Today says it in the amber (contracts
  // answerWithinHoursOf). Whole numbers inside what PolicyLimitsSchema allows; same boundary rule as the others.
  for (const dial of WHOLE_DIALS) {
    const n = wholeDial(cls, input[dial.key], dial);
    if (n !== undefined) limits[dial.key] = n;
  }
  // The mode is written only when this change gave one: a dial alone hands the database none.
  const row = await savePolicyRow(ctx, member, cls, { mode: inputMode === "" ? null : mode, limits });
  return { policy: row, was: policyWas(current) };
}
