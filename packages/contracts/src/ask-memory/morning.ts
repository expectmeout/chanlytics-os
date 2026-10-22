/**
 * Ask speaks first (decision 0070; the operator's D7, "a card on Today and a line in the bell, never a pop-up"): once a
 * day, when a member who acts arrives on Today, the page asks for the day's morning turn (POST ask/morning). The server
 * claims the day (one a member a day, ask_mornings), runs one Ask turn as that member in a thread of their own titled
 * with the day, and Today shows its Say and the cards it left, up to three; the bell says they are there. Approving a
 * card opens it in Ask, where every card is approved, changed or let go as it always is.
 *
 * Pure: the route, the page and the tests read the same question, limits and words.
 */
import type { AskProposal } from "../ask/ask";

/** How many of the morning's cards Today shows: Ask is asked for three at most. */
export const ASK_MORNING_CARDS_MAX = 3;

/**
 * What Ask asks itself each morning, as the member: their day, what happened and what it remembers, then at most three
 * cards. The leads' ideas are named so the tool search finds them; the answer's language is the member's, said to the
 * turn apart from these words.
 */
export const ASK_MORNING_QUESTION =
  "Good morning. Look at my day: what needs me now, what is due, what happened since yesterday, and what you remember about the business, and the lead finder's ideas if Leads has any. Then give me at most three things to do first, each as a card I can approve, and say in one short sentence why each comes first. If nothing needs me, say so in one sentence and make no card.";

/** A card the morning left waiting, as Today draws it: nothing has become of it yet, so it carries no outcome. */
export type AskMorningCard = Omit<AskProposal, "outcome">;

/** How the morning stands for the member, as Today reads it. */
export type AskMorningState = "none" | "writing" | "ready" | "quiet" | "failed";

/** Today's read of the member's morning (GET ask/morning). */
export interface AskMorningDto {
  /** The workspace's today, YYYY-MM-DD. */
  day: string;
  state: AskMorningState;
  /** Whether the member may have one: a member who acts, while mornings are on. */
  offered: boolean;
  thread_id: string | null;
  /** The answer's own row, which a card's outcome is recorded on. */
  message_id: string | null;
  headline: string;
  detail: string;
  /** The cards still waiting, fresh, at most ASK_MORNING_CARDS_MAX. */
  cards: AskMorningCard[];
}

/** The words Today's section says. */
export const ASK_MORNING_WORDS = {
  title: "Ask for you",
  sub: "What Ask would do first today",
  writing: "Ask is looking at your day.",
  failed: "Ask could not look at your day just now.",
  open: "Open in Ask",
  approve: "Approve",
  notNow: "Not now",
  dismissed: "Let go",
  quiet: "Nothing needs you first today.",
  /** The member's own bell line when the morning's cards wait (kind ask_cards). */
  bell: (cards: number) => ({
    title: cards === 1 ? "Ask has one thing for you today" : `Ask has ${cards} things for you today`,
    body: "It waits on Today, to approve or let go.",
  }),
} as const;
