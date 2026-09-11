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
import { listPolicies, setPolicyMode } from "@chanlytics/db";

/** GET /api/v1/policies — the workspace autonomy matrix (E3). */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ policies: await listPolicies(ctx.supabase, member.tenantId), role: member.role }),
});

/**
 * PUT /api/v1/policies — {class, mode}. Owners and operators tune autonomy
 * (the mockup's ST_PERMS says so); viewers are refused here, not just hidden.
 * 'veto' is refused until the drafts engine exists (R1: no option without an
 * enforcer), and the money lock lives in a DB trigger — even this route
 * cannot unlock it. The body is the route's own to read: which fields may
 * travel together depends on the class, and every refusal is a sentence.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as
      | { class?: string; mode?: string; replyDelayMs?: number; minConfidence?: number; maxTokensDay?: number }
      | null;
    const cls = body?.class ?? "";
    if (!(POLICY_CLASSES as readonly string[]).includes(cls)) throw new AppError("validation", "Unknown policy class.");
    // A delay edit carries no mode: the row keeps the one it has. Requiring the
    // client to resend it meant a stale page changing the hold window could
    // silently flip Replies to whatever mode that page had loaded.
    let mode = body?.mode ?? "";
    if (mode === "" && (body?.replyDelayMs !== undefined || body?.minConfidence !== undefined || body?.maxTokensDay !== undefined)) {
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
    // Only the REPLY class can be vetoed. The others have no draft to hold.
    if (mode === "veto" && cls !== "reply") {
      throw new AppError("validation", "Only replies can be held for review — the other classes have no draft to hold.");
    }
    // A switch nothing enforces is a switch that lies: each class offers only
    // the modes the runtime honours for it. Booking and service questions are
    // answered by the receptionist or by a person; there is no "never".
    if (!POLICY_CLASS_MODES[cls as PolicyClass].includes(mode as PolicyMode)) {
      throw new AppError("validation", cls === "booking" || cls === "faq"
        ? "Bookings and service questions are answered by the receptionist or by you — there is no \"never\"."
        : `The ${cls} row cannot be set to ${mode}.`);
    }

    // The wait, in ms. Clamped at the boundary as well as in the reader: a value
    // that reaches the database out of range would be silently corrected on read
    // and the workspace would see a number it never chose.
    const limits: Record<string, unknown> = {};
    if (body?.replyDelayMs !== undefined) {
      const d = Number(body.replyDelayMs);
      if (!Number.isFinite(d) || d < REPLY_DELAY_MIN_MS || d > REPLY_DELAY_MAX_MS) {
        throw new AppError(
          "validation",
          `The reply delay must be between ${REPLY_DELAY_MIN_MS / 1000}s and ${REPLY_DELAY_MAX_MS / 60000} minutes.`,
        );
      }
      if (cls !== "reply") throw new AppError("validation", "A reply delay only applies to the reply policy.");
      limits.reply_delay_ms = Math.round(d);
    }
    // The confidence dial, 0 to 1; 0 is off. Same boundary rule as the delay.
    if (body?.minConfidence !== undefined) {
      const c = Number(body.minConfidence);
      if (!Number.isFinite(c) || c < 0 || c > 1) {
        throw new AppError("validation", "The confidence dial is a number from 0 (off) to 1.");
      }
      if (cls !== "reply") throw new AppError("validation", "The confidence dial only applies to the reply policy.");
      limits.min_confidence = Math.round(c * 100) / 100;
    }
    // The day's token budget: a whole number of at least a thousand, or 0 to
    // turn it off. Same boundary rule as the others.
    if (body?.maxTokensDay !== undefined) {
      const t = Number(body.maxTokensDay);
      if (!Number.isFinite(t) || t < 0 || t > 5_000_000 || (t > 0 && t < 1000)) {
        throw new AppError("validation", "The token budget is a whole number from 1,000 to 5,000,000, or 0 to turn it off.");
      }
      if (cls !== "reply") throw new AppError("validation", "The token budget only applies to the reply policy.");
      limits.max_llm_tokens_day = Math.round(t);
    }
    try {
      const row = await setPolicyMode(ctx.supabase, member.tenantId, cls, mode, limits);
      if (!row) throw new AppError("not_found", "Policy row not found.", 404);
      // The change, in the ledger every other consequential act lands in: the
      // class, the mode, which limits moved -- never their values -- who, and
      // whether a card was tapped. Best effort, as the settings audit is: a
      // ledger row that failed to write must not fail the change that landed.
      await ctx.supabase.from("events").insert({
        tenant_id: member.tenantId,
        kind: "policy.changed",
        category: "system",
        subject_type: "workspace",
        subject_id: member.tenantId,
        data: { class: cls, mode, fields: Object.keys(limits), by: ctx.userId, ...(ctx.via ? { via: ctx.via } : {}) },
      }).then(({ error }) => { if (error) console.error("policy_event_failed", error.message); });
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
