import "server-only";
import {
  ASK_FINDING_WORDS,
  ASK_MORNING_CARDS_MAX,
  askFindingsOf,
  findingCardId,
  isRested,
  repliesFellCard,
  type AskFinding,
  type AskMorningCard,
  type AskRested,
  type BroadcastDto,
} from "@chanlytics/contracts";
import { listSequencesAtAGlance, type SequenceGlance } from "@chanlytics/db/campaigns";
import type { RouteContext } from "../../shared/with-route";
import type { Member } from "../../shared/route";
import { listBroadcasts } from "../../campaigns/broadcasts/broadcasts";
import { log } from "../../shared/log";
import { buildProposal, newToolContext } from "../tools";

/**
 * What Ask noticed, as Today draws it (decision 0087; contracts ask/memory/findings.ts says what counts). Read on each
 * read of the morning, by the member, with no model: a finding is the workspace's facts, so it closes itself when they
 * move and every member sees the same one.
 */

/** The sequences and their batches, read once for what Ask noticed and for what came of its ideas. */
interface SequencesRead {
  sequences: SequenceGlance[];
  runs: BroadcastDto[];
}

/** The workspace's sequences and recent batches: a read that fails costs what Ask noticed, never the morning. */
export async function getSequencesAndRuns(ctx: RouteContext, tenantId: string): Promise<SequencesRead> {
  try {
    const [sequences, { broadcasts }] = await Promise.all([
      listSequencesAtAGlance(ctx.supabase, tenantId),
      listBroadcasts(ctx, tenantId),
    ]);
    return { sequences, runs: broadcasts };
  } catch (e) {
    log.error("ask_findings_unread", { tenant_id: tenantId, error: e });
    return { sequences: [], runs: [] };
  }
}

/**
 * Steady batches, as a card: the mode's own change, built by the tool a member's question would reach, so its summary, its
 * payload and its undo are that card's. Null where the tool refuses it (one a change would not fit now).
 */
async function steadyCard(
  ctx: RouteContext,
  member: Member,
  at: { timezone: string; nowMs: number },
  askFinding: Extract<AskFinding, { kind: "steady" }>,
): Promise<AskMorningCard | null> {
  const toolContext = newToolContext(ctx, member.tenantId, member.role, at.timezone, new Date(at.nowMs));
  const out = await buildProposal(toolContext, "propose_sequence", {
    action: "change",
    playbook_id: askFinding.stepId,
    mode: "veto",
  });
  if (!out.proposal) return null;
  const { outcome: _, ...card } = out.proposal;
  return { ...card, id: findingCardId(askFinding), line: ASK_FINDING_WORDS.steady.line(askFinding.batches) };
}

/** What Ask noticed, most worth acting on first, less what this member has set aside for now. */
export async function listFindingCards(
  ctx: RouteContext,
  member: Member,
  at: { timezone: string; day: string; nowMs: number },
  read: SequencesRead,
  rested: AskRested,
): Promise<AskMorningCard[]> {
  const found = askFindingsOf(read.sequences, read.runs)
    .filter((f) => !isRested(rested, findingCardId(f), at.day))
    .slice(0, ASK_MORNING_CARDS_MAX);
  const cards = await Promise.all(
    found.map(async (f) => {
      if (f.kind === "replies_fell") return repliesFellCard(f);
      return steadyCard(ctx, member, at, f).catch((e: unknown) => {
        log.error("ask_findings_unread", { tenant_id: member.tenantId, error: e });
        return null;
      });
    }),
  );
  return cards.filter((c): c is AskMorningCard => c !== null);
}
