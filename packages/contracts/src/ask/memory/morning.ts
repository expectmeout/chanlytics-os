/**
 * Ask speaks first (decision 0070; the operator's D7, "a card on Today and a line in the bell, never a pop-up"): once a
 * day, when a member who acts arrives on Today, the page asks for the day's morning turn (POST ask/morning). The server
 * claims the day (one a member a day, ask_mornings), runs one Ask turn as that member in a thread of their own titled
 * with the day, and Today shows the cards it left in Ask found (Today in three zones, 2 Nov 2026), its Say no more; the
 * bell says they are there. Approving a card runs it from its row, or opens it in Ask.
 *
 * Pure: the route, the page and the tests read the same question, limits and words.
 */
import type { AskProposal } from "../thread-words";
import type { AskRested } from "./findings";
import type { AskLately } from "./lately";

/** How many of the morning's cards Today shows: Ask is asked for three at most. */
export const ASK_MORNING_CARDS_MAX = 3;

/**
 * What Ask asks itself each morning, as the member: their day, what happened and what it remembers, then at most three
 * cards. The leads' ideas are named so the tool search finds them; the answer's language is the member's, said to the
 * turn apart from these words. Since decision 0071 the people waiting are Today's rows, each with its reply or its call's
 * brief drafted there, so the morning makes no card that only answers or rings one of them (its card stood under their
 * row, saying it twice), and words each card as its act and its why. A batch waiting for an OK is the same (2 Nov 2026):
 * Your OK holds its row, and the run tool refuses a morning its card. Since Today in three zones (2 Nov 2026) the morning
 * writes no Say of its own: the head says how the day stands, and nothing draws the morning's sentence, so its answer
 * says only how many cards it made.
 */
const MORNING_HEAD =
  "Good morning. Look at my day: what is due, what happened since yesterday, what you remember about the business, and the lead finder's ideas if Leads has any. The people waiting on me already have their replies or call briefs drafted on Today, and the batches waiting for my OK are under Your OK there, so make no card that only answers or calls back someone who is waiting, or that approves or skips a batch.";
const MORNING_TAIL =
  "Give me at most three other things worth doing first, each as a card I can approve: its title the act in a few words, its line why it comes first, without repeating the name. Today already says how my day stands, so say only how many cards you made, in a few words. If nothing else is worth doing, say so in a few words and make no card.";
export const ASK_MORNING_QUESTION = `${MORNING_HEAD} ${MORNING_TAIL}`;

/**
 * The morning's question on a day after the member edited cold emails (decision 0078 step 2; the server asks it only
 * then, companion/morning.ts): it names the sequences tool's `edited` so the tool search finds it, and where what they
 * changed in Ask's drafts shows a lasting habit Ask does not already remember, in any words, one card may be a line about
 * how they write, which waits for their press (act/remember.ts). A morning with nothing edited asks nothing of it.
 */
export const ASK_MORNING_EDITED_QUESTION = `${MORNING_HEAD} I edited cold emails since yesterday: read them (the sequences tool's edited). Where what I changed in your drafts shows a lasting habit in how I write them that you don't already remember, in any words, one card may be a line to remember about it, starting "In cold emails:". ${MORNING_TAIL}`;

/** Whether a turn is the morning's, asked either way: a turn Ask asks itself, which holds no words of the member's. */
export const isAskMorningQuestion = (question: string | null | undefined): boolean =>
  question === ASK_MORNING_QUESTION || question === ASK_MORNING_EDITED_QUESTION;

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
  /** What Ask noticed from the workspace's own facts (decision 0087), the most worth acting on first; absent from a server before it. */
  findings?: AskMorningCard[];
  /** This member's rests of what it noticed, which a new rest is written over; absent from a server before it. */
  rested?: AskRested;
  /** What came of the ideas approved lately; absent from a server before it. */
  lately?: AskLately[];
}

/**
 * What the morning's cards say outside Today's rows (whose words are need-you/words.ts since decision 0071): what a card
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
