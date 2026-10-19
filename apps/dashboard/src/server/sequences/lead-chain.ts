import "server-only";
import { AppError, leadFirstUnwritten, type ReachOutChainInput } from "@chanlytics/contracts";
import { sequenceOverview, setChainSource } from "@chanlytics/db";
import { chainsOf, saveChain } from "@/server/campaigns/reach-outs";
import type { Member } from "@/server/route";
import { dbRefusal, type RouteContext } from "@/server/with-route";

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
  seq: { id: string; tenant_id: string },
  input: Omit<ReachOutChainInput, "search_id"> & { source_search_id?: string | null },
) {
  const [row] = await sequenceOverview(ctx.supabase, seq.tenant_id, seq.id);
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

/**
 * The first email of a sequence to leads still to write, by its place, or null: a draft may keep one, and Start asks for
 * it (the canvas's dock, "Step 2 isn't written yet · Then Start"), so nothing goes out with no words.
 */
export async function unwrittenPlaceOf(ctx: RouteContext, tenantId: string, rootId: string): Promise<number | null> {
  const chain = (await chainsOf(ctx, tenantId)).find((c) => c.root_id === rootId);
  return chain ? leadFirstUnwritten([...chain.steps].sort((a, b) => a.n - b.n)) : null;
}
