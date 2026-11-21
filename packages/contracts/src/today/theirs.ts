/**
 * Who owns it (Working for you, W19, 21 Nov 2026): a conversation a teammate has taken, while its hold is open, is theirs and
 * not yours. It is in nobody's count of who needs you already (conversations/standing.ts "theirs", facts.ts
 * openEscalations); Today says it as a quiet line of its own, "A teammate has it", with their last words, which opens the
 * conversation, where it can be taken back. Pure: the page and its tests make it alike.
 */
import { waitsOnAPerson, type EscalationDto } from "../conversations/escalations";
import { clipAtWord, messageWords } from "../conversations/message-words";
import { standingOfThread } from "../conversations/standing";
import { contactName, initialsOf } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";

/** A conversation a teammate has: who, and what they last said. */
export interface TodayTheirsVM {
  conversationId: string;
  who: string;
  initials: string;
  /** Their last words, in quotes; null where none were read. */
  said: string | null;
}

/** How much of their last words a teammate's line says. */
const THEIRS_WORDS_MAX = 60;

/** Their newest words on the thread, in quotes, or null. */
function lastSaid(conv: ConversationDto): string | null {
  let newest: { at: number; words: string } | null = null;
  for (const m of conv.messages) {
    const at = Date.parse(m.created_at);
    if (m.sender !== "customer" || !Number.isFinite(at) || (newest && at <= newest.at)) continue;
    newest = { at, words: clipAtWord(messageWords(m), THEIRS_WORDS_MAX) };
  }
  return newest?.words ? `“${newest.words}”` : null;
}

/** The conversations teammates have, oldest hold first, each once. */
export function todayTheirsOf(
  conversations: readonly ConversationDto[],
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  nowMs: number,
): TodayTheirsVM[] {
  const byThread = new Map(conversations.map((c) => [c.id, c]));
  const seen = new Set<string>();
  return [...escalations]
    .filter((e) => e.state === "open" && waitsOnAPerson(e.reason))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .flatMap((e) => {
      const conv = byThread.get(e.conversation_id);
      if (!conv || seen.has(conv.id) || standingOfThread(conv, e, nowMs).standing !== "theirs") return [];
      seen.add(conv.id);
      const name = contactName(conv);
      return [{ conversationId: conv.id, who: name, initials: initialsOf(name), said: lastSaid(conv) }];
    });
}
