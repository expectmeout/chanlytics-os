/**
 * A person's touch as every reader of the shared record reads it (the content loop PRD's Appendix A.2): who, what it was
 * of, what kind, when, where it happened, whether it made the person, and which home it was read from. Two homes so far:
 * touches (a reply to a story, a comment, a coded first message, about a post or through a link) and ad_entries (a
 * message that came from an ad, Ads' own home, never moved). A form's entry joins with Forms' own reader. Inbox's note of
 * which ad a thread came from keeps its own narrow shape (ads/touch.ts `Touch`), which names the ad.
 */
import type { CreditSubject } from "./credit";
import type { TouchKind } from "./sets";

/** Where a touch was read from. */
export type TouchHome = "touches" | "ad_entries";

export interface RecordedTouch {
  /** The row's id in its home. */
  id: string;
  home: TouchHome;
  kind: TouchKind | "ad_message";
  subject: CreditSubject;
  /** Null once emptied (erased, or past its time). */
  contact_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  new_person: boolean;
  at: string;
  /** What only a comment carries: its words and who wrote it there. Null for every other kind, and once emptied. */
  said: { words: string | null; username: string | null } | null;
}
