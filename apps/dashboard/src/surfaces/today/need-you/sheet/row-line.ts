/**
 * What a row of Need you says, whatever it is (Today: one row, one sheet, 9 Nov 2026): one line of who or what, how long and
 * the verb, and one line of what it is about across the whole row. Most rows say the person and their words as the queue
 * wrote them. A to-do leads with the job, since the job is what it is, and says whose and how late under it; a visit says
 * when it was and asks; a review is a row of To do as a step is, with its stars where a wait would stand.
 *
 * Pure: the page, the sheet and the tests read the same lines.
 */
import { reviewRoute, type GoogleReviewDto, type TodayQueueRowVM } from "@chanlytics/contracts";

/** Who wrote a review, as its row names them. */
export const reviewerOf = (review: Pick<GoogleReviewDto, "author">): string =>
  review.author?.trim() || "A Google reviewer";

/** A review's verb on its row, which the sheet goes on from. */
const REVIEW_VERB = "Answer";

/** A review's stars as its row says them. */
export const reviewStars = (rating: number): string => `${rating} star${rating === 1 ? "" : "s"}`;

/** A review to answer as a row of To do: nobody waits on it, so it has no wait to sort by and no thread. */
export function reviewRowOf(review: GoogleReviewDto): TodayQueueRowVM {
  return {
    id: `q-r-${review.id}`,
    kind: "review",
    conversationId: null,
    callId: null,
    person_id: null,
    who: reviewerOf(review),
    initials: "",
    channel: "Google",
    when: "",
    sentence: review.body ?? "",
    quoted: !!review.body,
    status: ["To answer"],
    tone: "warn",
    warn: false,
    cta: { label: REVIEW_VERB, to: reviewRoute(review.id) },
    also: null,
    review,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The first word of a day's words made to follow a dot: "Overdue since Thu" under a name is "overdue since Thu". */
const lowered = (words: string): string => words.charAt(0).toLowerCase() + words.slice(1);

/** What a row of Need you says on its two lines: who or what, what it is about, and what tone that second line takes. */
interface NeedYouLine {
  name: string;
  sentence: string;
  /** Their own words, set in quotes. */
  quoted: boolean;
  /** Amber for a to-do past its day, red for a reply that never reached them: the words themselves say why. */
  tone: "warn" | "danger" | null;
  /**
   * The words of the sentence the tone is on, where only they warn: a to-do's "overdue since Thu", not whose it is or for
   * whom (the 60-30-10 read, 17 Nov 2026: three whole lines of amber made Today a page of alerts). Null: the whole line.
   */
  toneOn: string | null;
}

/** A row's two lines, by what it is. */
export function needYouLineOf(
  row: Pick<
    TodayQueueRowVM,
    "kind" | "who" | "sentence" | "quoted" | "status" | "when" | "warn" | "failed" | "request"
  >,
): NeedYouLine {
  if (row.kind === "step") {
    const [when, whose] = row.status;
    const late = when ? lowered(when) : "";
    return {
      name: row.sentence,
      sentence: [row.who, late, whose ?? ""].filter(Boolean).join(" · "),
      quoted: false,
      tone: row.warn ? "warn" : null,
      toneOn: row.warn && late ? late : null,
    };
  }
  if (row.kind === "visit") {
    const title = (row.status[1] ?? "").replace(` · ${row.who}`, "");
    return { name: row.who, sentence: title, quoted: false, tone: null, toneOn: null };
  }
  // A time asked for says what for, on the one line: its sheet holds the rest.
  const service = row.request?.service?.trim();
  return {
    name: row.who,
    sentence: service && !row.sentence.includes(service) ? `${row.sentence} · ${service}` : row.sentence,
    quoted: row.quoted,
    tone: row.failed ? "danger" : null,
    toneOn: null,
  };
}
