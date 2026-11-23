/**
 * What an owner says of the business for its posts (00702; the content loop PRD's 5.3 and 21.1, Settings › Content): a
 * claim kept or withdrawn (an offer, a price, a guarantee, a fact they state), what the posts are for, and how often they
 * go up, its quiet days and its languages. Each said to AI or edited in place on its Settings line; claims and goals go
 * through their doors on the member's own session, how often through the workspace's config, as Settings saves it.
 */
import "server-only";
import {
  AppError,
  CLAIM_KINDS,
  CLAIM_TEXT_MAX,
  CONTENT_GOALS,
  ContentConfigSchema,
  DAY_KEY,
  recordOrEmpty,
  type OwnerClaim,
} from "@chanlytics/contracts";
import { keepClaim, keepGoals, withdrawClaim, type GoalKept } from "@chanlytics/db/files";
import { findConfigRow } from "@/server/workspace/config-row";
import { putTenantConfig } from "@chanlytics/db/workspace";
import { z } from "zod";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

const CLAIM_DAY = z.string().regex(DAY_KEY);

/** A claim as a press or AI's card hands it in: owner's words, said in Settings or to AI. */
export const claimInput = z.strictObject({
  kind: z.enum(CLAIM_KINDS),
  text: z.string().trim().min(1).max(CLAIM_TEXT_MAX),
  source: z.enum(["said", "settings"]),
  valid_until: CLAIM_DAY.nullish(),
});

/** A claim kept: an offer, a price, a guarantee, or a fact the owner states, until its last day where it has one. */
export async function keepClaimFor(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof claimInput>,
): Promise<{ claim: OwnerClaim }> {
  if (input.kind === "fact" && !input.valid_until)
    throw new AppError("validation", "Say until when it holds: a fact you state stands until its day ends.");
  const claim = await keepClaim(ctx.supabase, member.tenantId, {
    kind: input.kind,
    text: input.text,
    source: input.source,
    valid_until: input.valid_until ?? null,
  });
  if (!claim) throw new AppError("unavailable", "That couldn't be kept. Try again.");
  return { claim };
}

/** A claim withdrawn: what carries it is held at its send, never taken down by itself (PRD 5.3, claim_withdrawn). */
export async function withdrawClaimFor(ctx: RouteContext, member: Member, input: { claim_id: string }) {
  return { withdrawn: await withdrawClaim(ctx.supabase, member.tenantId, input.claim_id) };
}

/** What the posts are for, and how often they go up: each part optional, and only what is given changes. */
export const aimsInput = z.strictObject({
  goals: z
    .array(
      z.strictObject({
        goal: z.enum(CONTENT_GOALS),
        service: z.string().trim().min(1).max(120).optional(),
        days: z
          .array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]))
          .max(7)
          .optional(),
        words: z.string().trim().min(1).max(280).optional(),
        weight: z.number().gt(0).max(1).optional(),
      }),
    )
    .max(8)
    .optional(),
  content: ContentConfigSchema.optional(),
});

/**
 * The goals kept as one set, and the cadence, quiet days and languages written onto the workspace's config beside what it
 * holds, at the version read (a second save in between is told to look again, as Settings is).
 */
export async function keepAimsFor(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof aimsInput>,
): Promise<{ goals: GoalKept[] | null; content: boolean }> {
  const goals = input.goals
    ? await keepGoals(
        ctx.supabase,
        member.tenantId,
        input.goals.map(({ goal, weight, ...detail }) => ({ goal, detail, ...(weight ? { weight } : {}) })),
      )
    : null;
  if (!input.content) return { goals, content: false };
  const row = await findConfigRow(ctx.supabase, member.tenantId);
  if (!row) throw new AppError("not_found", "This workspace's settings couldn't be read. Try again.", 404);
  const config = recordOrEmpty(row.config);
  const kept = recordOrEmpty(config.content);
  // A line's own sentence joins those kept, never replaces them all.
  const lines = input.content.lines ? { ...recordOrEmpty(kept.lines), ...input.content.lines } : kept.lines;
  const content = { ...kept, ...input.content, ...(lines ? { lines } : {}) };
  const put = await putTenantConfig(ctx.supabase, member.tenantId, { ...config, content }, row.version);
  if (!put.ok) throw new AppError("conflict", "Settings changed since you opened them. Look again.", 409);
  return { goals, content: true };
}
