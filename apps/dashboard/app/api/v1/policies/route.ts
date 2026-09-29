import { z } from "zod";
import { read, write, workspace } from "@/server/route";
import {
  AppError,
  POLICY_CLASSES,
  POLICY_MODES,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
  POLICY_CLASS_MODES,
  type PolicyClass,
  type PolicyMode,
} from "@chanlytics/contracts";
import { emitEvent, listPolicies, setPolicyMode } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { load, readerContext } from "@/server/readers";
import { autonomy } from "@/server/readers/autonomy";

/**
 * GET /api/v1/policies — the workspace autonomy matrix (E3), and whether deals are on here (0008): the pane draws the
 * follow-ups' row only where they are (0006, contracts policyClassOffered). The body is its reader's
 * (readers/autonomy.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), autonomy, undefined)).data,
});

/** Each dial's refusal, said once: by the schema for a value that is not a number, below for one out of its range. */
const DIAL_WORDS = {
  reply_delay_ms: `The reply delay must be between ${REPLY_DELAY_MIN_MS / 1000}s and ${REPLY_DELAY_MAX_MS / 60000} minutes.`,
  min_confidence: "The confidence dial is a number from 0 (off) to 1.",
  max_llm_tokens_day: "The token budget is a whole number from 1,000 to 5,000,000, or 0 to turn it off.",
  max_replies_day: "The reply cap is a whole number from 1 to 200.",
  pause_hours: "The pause is a whole number of hours from 1 to 168.",
} as const;

/**
 * The dials' camelCase names, still read for one release from 28 September 2026, when this body became snake_case
 * (the wire is snake_case: docs/naming.md, decision 0022). A tab opened before that deploy sends them, and so does
 * Ask's autonomy card (`minConfidence`, contracts' ask-proposals/workspace.ts, Ask Rewired's to move). A body that
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
const PolicyChange = z.preprocess(
  withOldNames,
  z.object({
    class: z.string({ error: "Unknown policy class." }),
    mode: z.string({ error: "Unknown mode." }).optional(),
    reply_delay_ms: z.number({ error: DIAL_WORDS.reply_delay_ms }).optional(),
    min_confidence: z.number({ error: DIAL_WORDS.min_confidence }).optional(),
    max_llm_tokens_day: z.number({ error: DIAL_WORDS.max_llm_tokens_day }).optional(),
    max_replies_day: z.number({ error: DIAL_WORDS.max_replies_day }).optional(),
    pause_hours: z.number({ error: DIAL_WORDS.pause_hours }).optional(),
  }),
);

/**
 * PUT /api/v1/policies — {class, mode}, or a dial of the reply row. Owners and
 * operators tune autonomy (the mockup's ST_PERMS says so); viewers are refused
 * here, not just hidden. 'veto' is refused until the drafts engine exists (R1:
 * no option without an enforcer), and the money lock lives in a DB trigger —
 * even this route cannot unlock it. Which fields may travel together depends
 * on the class, so the handler judges that, and every refusal is a sentence.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: PolicyChange,
  handle: async ({ ctx, input, member }) => {
    const cls = input.class;
    if (!(POLICY_CLASSES as readonly string[]).includes(cls)) throw new AppError("validation", "Unknown policy class.");
    // A delay edit carries no mode: the row keeps the one it has. Requiring the
    // client to resend it meant a stale page changing the hold window could
    // silently flip Replies to whatever mode that page had loaded. Every dial
    // travels the same way.
    let mode = input.mode ?? "";
    const dials = [
      input.reply_delay_ms,
      input.min_confidence,
      input.max_llm_tokens_day,
      input.max_replies_day,
      input.pause_hours,
    ];
    if (mode === "" && dials.some((d) => d !== undefined)) {
      const current = (await listPolicies(ctx.supabase, member.tenantId)).find((p) => p.class === cls);
      if (!current) throw new AppError("not_found", "Policy row not found.", 404);
      mode = current.mode;
    }
    if (!(POLICY_MODES as readonly string[]).includes(mode)) throw new AppError("validation", "Unknown mode.");
    // 'veto' used to be refused here on the rule "no option without an
    // enforcer" — offering a mode nothing implemented would have been a switch
    // that lies. The enforcer now exists: the receptionist writes its reply as a
    // draft and a scheduled job sends it, so the option is real and the refusal
    // has become the thing standing in the way.
    //
    // Only the REPLY class can be vetoed, and a reach-out's (its later runs give thirty minutes to be stopped, and veto
    // is the class's own default: Reach out, Part 3). The others have no draft to hold.
    if (mode === "veto" && cls !== "reply" && cls !== "outreach") {
      throw new AppError(
        "validation",
        "Only replies can be held for review — the other classes have no draft to hold.",
      );
    }
    // A switch nothing enforces is a switch that lies: each class offers only
    // the modes the runtime honours for it. Booking and service questions are
    // answered by the receptionist or by a person; there is no "never".
    if (!POLICY_CLASS_MODES[cls as PolicyClass].includes(mode as PolicyMode)) {
      throw new AppError(
        "validation",
        cls === "booking" || cls === "faq"
          ? 'Bookings and service questions are answered by the receptionist or by you — there is no "never".'
          : `The ${cls} row cannot be set to ${mode}.`,
      );
    }

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
    // The two hard limits Chanlytics used to set for a workspace, now the
    // owner's (S6): automatic replies to one person in 24 hours before the
    // receptionist stops and asks, and the hours it stays out of a conversation
    // once a person steps in. Whole numbers inside what PolicyLimitsSchema
    // allows; same boundary rule as the others.
    if (input.max_replies_day !== undefined) {
      const n = input.max_replies_day;
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new AppError("validation", DIAL_WORDS.max_replies_day);
      if (cls !== "reply") throw new AppError("validation", "The reply cap only applies to the reply policy.");
      limits.max_replies_day = n;
    }
    if (input.pause_hours !== undefined) {
      const h = input.pause_hours;
      if (!Number.isInteger(h) || h < 1 || h > 168) throw new AppError("validation", DIAL_WORDS.pause_hours);
      if (cls !== "reply") throw new AppError("validation", "The pause only applies to the reply policy.");
      limits.pause_hours = h;
    }
    try {
      const row = await setPolicyMode(ctx.supabase, member.tenantId, cls, mode, limits);
      if (!row) throw new AppError("not_found", "Policy row not found.", 404);
      // The change, in the ledger every other consequential act lands in: the
      // class, the mode, which limits moved -- never their values -- who, and
      // whether a card was tapped. Best effort, as the settings audit is: a
      // ledger row that failed to write must not fail the change that landed.
      // As the service role: a session may not insert into events, so it never landed.
      await emitEvent(serviceDb(), member.tenantId, "policy.changed", "workspace", member.tenantId, {
        class: cls,
        mode,
        fields: Object.keys(limits),
        by: ctx.userId,
        ...(ctx.via ? { via: ctx.via } : {}),
      });
      return { policy: row };
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/money decisions are owner-only/.test(msg)) {
        throw new AppError("forbidden", "Money stays owner-only by charter — that row is locked.", 403);
      }
      throw e;
    }
  },
});
