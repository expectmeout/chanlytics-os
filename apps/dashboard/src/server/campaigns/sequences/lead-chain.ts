import "server-only";
import {
  AppError,
  leadFirstUnwritten,
  REACH_OUT_AGAIN_DAYS,
  type ReachOutChainInput,
  type SequenceAgainDto,
} from "@chanlytics/contracts";
import { findChainAgain, listSequenceOverview, setChainAgain, setChainSource } from "@chanlytics/db/campaigns";
import { listChains } from "@/server/campaigns/reach-outs/reach-outs";
import { saveChain } from "@/server/campaigns/reach-outs/chain-acts";
import type { Member } from "@/server/shared/route";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";
import { serviceDb } from "@/server/shared/service-db";
import type { TenantId } from "@chanlytics/contracts";

/**
 * A sequence to leads, written on its own record (00459: the draft's record is its editor, the lead-to-sequence canvas's
 * Build boards): its steps' words, waits and hand, its mailboxes, pace, who signs and whether unconfirmed addresses go,
 * saved whole by the chain's own save (saveChain: every word checked, new words sending what waits back to the check), on
 * the list it holds; and its auto-add switch, the search it draws from. A draft may keep an email still to write, which
 * Start asks for; once on, every email is written.
 */
export async function saveLeadChainNow(
  ctx: RouteContext,
  member: Member,
  seq: { id: string; tenant_id: TenantId },
  input: Omit<ReachOutChainInput, "search_id"> & { source_search_id?: string | null },
) {
  const [row] = await listSequenceOverview(ctx.supabase, seq.tenant_id, seq.id);
  const list = row && row.starts === "leads" ? row.first?.search_id : null;
  if (!row || !list) throw new AppError("not_found", "Sequence not found.", 404);
  const { source_search_id: source, ...chain } = input;
  const saved = await saveChain(ctx, member, { ...chain, search_id: list }, seq.id, {
    unwritten: row.state === "draft",
  });
  if (source !== undefined && source !== (row.first?.source_search_id ?? null)) {
    const r = await setChainSource(ctx.supabase, { tenantId: seq.tenant_id, rootId: seq.id, searchId: source });
    if (r.error) throw dbRefusal(r.error);
  }
  return saved;
}

/** A sequence to leads, or not found: what try again is set on (its first step, whose id is the sequence's). */
async function leadSequenceOf(ctx: RouteContext, seq: { id: string; tenant_id: TenantId }) {
  const [row] = await listSequenceOverview(ctx.supabase, seq.tenant_id, seq.id);
  if (!row || row.starts !== "leads") throw new AppError("not_found", "Sequence not found.", 404);
  return row;
}

/**
 * Whether a sequence to leads tries a business that never answered again, and who would come back and from when (decision
 * 0120, D6): at the days it is set to, or at REACH_OUT_AGAIN_DAYS while it is off, so the switch can say what it would do.
 */
export async function findLeadChainAgain(
  ctx: RouteContext,
  seq: { id: string; tenant_id: TenantId },
): Promise<SequenceAgainDto> {
  await leadSequenceOf(ctx, seq);
  const now = await findChainAgain(serviceDb(), {
    tenantId: seq.tenant_id,
    rootId: seq.id,
    days: REACH_OUT_AGAIN_DAYS,
  });
  if (now.again_after_days === null || now.again_after_days === REACH_OUT_AGAIN_DAYS) return now;
  return findChainAgain(serviceDb(), { tenantId: seq.tenant_id, rootId: seq.id, days: now.again_after_days });
}

/**
 * Try again after `days`, or never (null), through the member's own session (00608 reach_out_again_set: who may approve).
 * Turned on, its words wait for an OK once more. Answers what the sheet then says.
 */
export async function setLeadChainAgain(
  ctx: RouteContext,
  seq: { id: string; tenant_id: TenantId },
  days: number | null,
): Promise<SequenceAgainDto> {
  await leadSequenceOf(ctx, seq);
  const r = await setChainAgain(ctx.supabase, { tenantId: seq.tenant_id, rootId: seq.id, days });
  if (r.error) throw dbRefusal(r.error);
  return findLeadChainAgain(ctx, seq);
}

/**
 * The first email of a sequence to leads still to write, by its place, or null: a draft may keep one, and Start asks for
 * it (the canvas's dock, "Step 2 isn't written yet · Then Start"), so nothing goes out with no words.
 */
export async function findUnwrittenPlace(
  ctx: RouteContext,
  tenantId: TenantId,
  rootId: string,
): Promise<number | null> {
  const chain = (await listChains(ctx, tenantId)).find((c) => c.root_id === rootId);
  return chain ? leadFirstUnwritten([...chain.steps].sort((a, b) => a.n - b.n)) : null;
}
