import "server-only";
/**
 * Whether a card is still true at the moment it is acted on (D26 of the answers canvas), and who else is talking (D35). A card
 * is a picture of how things stood when it was made: a one-day expiry only guessed at that. Here, what it would touch is read
 * again: a thread someone has moved on, a person who has written since, a teammate who holds it. The words are the person's to
 * read, the reason it stopped, and each says what to do next. A read that fails is never "nothing moved": for a card that
 * answers a thread, a look that could not be made is its own answer ("unchecked"), and the press waits for one that can.
 */
import {
  BROADCAST_STATE_LABELS,
  BROADCAST_STATES,
  CARD_MOVED_WORDS,
  DbFailure,
  isOneOf,
  type AskProposal,
  type TenantId,
} from "@chanlytics/contracts";
import { findThreadCard, findThreadSince } from "@chanlytics/db/ask";
import { listRunRowsByIds } from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
import type { RouteContext } from "@/server/shared/with-route";

/** Why a card should not go as it is, in the person's words; null where it still holds. */
export interface CardMoved {
  says: string;
  /** Whether asking again would make a better card, which the door offers. */
  redraft: boolean;
}

/** A look at the thread that could not be made: the press waits, since its words may answer what is no longer so. */
export const UNCHECKED = "unchecked" as const;

/** The kinds whose words answer a thread as it stood. */
const ANSWERS_A_THREAD = new Set<AskProposal["kind"]>(["reply", "steer"]);

const whoOf = (p: AskProposal): string => {
  const who = p.payload?.who;
  return typeof who === "string" && who ? who : "They";
};

export async function cardMoved(
  ctx: RouteContext,
  tenantId: TenantId,
  userId: string,
  p: AskProposal,
): Promise<CardMoved | typeof UNCHECKED | null> {
  if (p.kind === "run") {
    const [decided] = await runsDecided(ctx, tenantId, [p]);
    return decided ? { says: CARD_MOVED_WORDS.runDecided(decided.state), redraft: false } : null;
  }
  if (!ANSWERS_A_THREAD.has(p.kind)) return null;
  const id = p.payload?.conversation_id;
  if (typeof id !== "string" || !id) return null;
  const madeAt = typeof p.made_at === "string" ? p.made_at : null;
  const thread = await findThreadCard(ctx.supabase, tenantId, id)
    .then((read) => {
      if (read.error) throw new DbFailure(read.error, "conversations");
      return read;
    })
    .catch(logAndGoOn("cardMoved thread", null));
  if (!thread) return UNCHECKED;
  // A thread this member cannot find: the verb's own door refuses a reply to it.
  if (!thread.data) return null;
  // Who has it: a teammate holding the thread, since the card was made or before, answers for it now.
  const holder = thread.data.assignee_user_id;
  if (holder && holder !== userId) return { says: CARD_MOVED_WORDS.teammateHas, redraft: false };
  if (!madeAt) return null;
  const since = await findThreadSince(ctx.supabase, tenantId, id, madeAt).catch(logAndGoOn("cardMoved since", null));
  if (!since) return UNCHECKED;
  // They wrote again: the words answer what they said before.
  if (since.inbound > 0) return { says: CARD_MOVED_WORDS.wroteAgain(whoOf(p)), redraft: true };
  // Somebody answered first: the receptionist, or a teammate.
  if (since.outbound > 0) return { says: CARD_MOVED_WORDS.answered(whoOf(p)), redraft: false };
  return null;
}

/**
 * The batch cards whose batch is no longer waiting for an OK: approved, skipped or gone on Campaigns since the card was made
 * (Ruben, 14 Nov 2026: he approved "Agency owner outreach" on its page at 7:05, Ask still named its card as waiting at 7:07,
 * and his yes to it failed). Each with the state its batch is in now, said in Sent's words; a batch gone is "Canceled". One
 * read for all of them; a read that fails names none, and the press's own door says what it finds.
 */
export async function runsDecided(
  ctx: RouteContext,
  tenantId: TenantId,
  cards: readonly AskProposal[],
): Promise<Array<{ id: string; state: string }>> {
  const runIdOf = (p: AskProposal) => (typeof p.payload?.broadcast_id === "string" ? p.payload.broadcast_id : "");
  const runCards = cards.filter((p) => p.kind === "run" && runIdOf(p));
  if (runCards.length === 0) return [];
  const read = await listRunRowsByIds(ctx.supabase, tenantId, runCards.map(runIdOf)).catch(
    logAndGoOn("ask runs decided", null),
  );
  if (!read || read.error) return [];
  const stateOf = new Map(read.data.map((r) => [r.id, r.state]));
  return runCards.flatMap((p) => {
    const was = stateOf.get(runIdOf(p));
    const state = isOneOf(BROADCAST_STATES, was) ? was : "canceled";
    return state === "pending_approval" ? [] : [{ id: p.id, state: BROADCAST_STATE_LABELS[state].toLowerCase() }];
  });
}
