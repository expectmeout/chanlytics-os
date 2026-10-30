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
 * turn apart from these words. Since decision 0071 the people waiting are Today's rows, each with its reply or its call's
 * brief drafted there, so the morning makes no card that only answers or rings one of them (its card stood under their
 * row, saying it twice), says how the day stands rather than what it made, and words each card as its act and its why.
 * Since decision 0078's second step it reads the cold emails the member edited since yesterday (sequences, action
 * edited), and where what they changed in Ask's drafts shows a lasting habit, one card may be a line to remember about
 * how they write: a card that waits for their press, as every line not in their own words does (act/remember.ts).
 */
export const ASK_MORNING_QUESTION =
  'Good morning. Look at my day: what is due, what happened since yesterday, what you remember about the business, and the lead finder\'s ideas if Leads has any. The people waiting on me already have their replies or call briefs drafted on Today, so make no card that only answers or calls back someone who is waiting. Read the cold emails I edited since yesterday: where what I changed in your drafts shows a lasting habit in how I write them, one card may be a line to remember about it, starting "In cold emails:". Give me at most three other things worth doing first, each as a card I can approve: its title the act in a few words, its line why it comes first, without repeating the name. Begin with one sentence on how the day stands, never about the cards you made. If nothing else is worth doing, say so in one sentence and make no card.';

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

/**
 * What the morning's cards say outside Today's rows (whose words are need-you-words.ts since decision 0071): what a card
 * let go of is kept as on its turn, and the bell's line while they wait.
 */
export const ASK_MORNING_WORDS = {
  dismissed: "Let go",
  /** The member's own bell line when the morning's cards wait (kind ask_cards). */
  bell: (cards: number) => ({
    title: cards === 1 ? "Ask has one thing for you today" : `Ask has ${cards} things for you today`,
    body: "It waits on Today, to approve or let go.",
  }),
} as const;
