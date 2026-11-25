/**
 * What a week of posts says (the content loop PRD's 12.5 and 21.2, through docs/words.md): the notices that leave the app
 * when a week is ready and when it asks for clips, Today's point, and the Week's head. A week is said as what it is ("A
 * reel and 2 posts"), never "4 pieces, 6 places"; a place is Instagram or Google.
 */
import { weekdayShortOf } from "./week";

/** The days a week's posts go up on, first to last: "Tue to Fri", or one day alone. */
export function weekDaysSaid(days: readonly string[]): string {
  const sorted = [...new Set(days)].sort();
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last) return "";
  return first === last ? weekdayShortOf(first) : `${weekdayShortOf(first)} to ${weekdayShortOf(last)}`;
}

export const WEEK_WORDS = {
  /** The notice of a week ready (plan_ready): its subject, and its body. */
  readySubject: "This week's posts are ready",
  readyBody: (size: string, days: string) => `${size}, ${days}. Nothing goes up until you approve them.`,
  /**
   * The same notice for a week AI may approve (00714): it goes up at its time unless the owner stops it. `when` names
   * the day too ("Mon 8:00 AM"): a week planned mid-week goes the next morning, and a notice is read later.
   */
  readyBodyHeld: (size: string, days: string, when: string) =>
    `${size}, ${days}. They go up ${when} unless you stop them.`,
  /** And for a week made while AI is paused (Stop everything): no time is promised, it waits for the owner. */
  readyBodyPaused: (size: string, days: string) =>
    `${size}, ${days}. AI is paused, so nothing goes up until you approve them.`,
  /** And for a week AI sends as soon as it is ready (00714). */
  readyBodySent: (size: string, days: string) =>
    `${size}, ${days}. AI approves them, as you set it. Each goes up at its time.`,
  /** The notice of what to film (footage_ask). */
  askSubject: (count: number) => (count === 1 ? "A clip to film for the week" : `${count} clips to film for the week`),
  /** A week with nothing to post: its head. */
  nothing: "Nothing to post this week",
  /** Today's point for a week ready, with its size and days after the dot. */
  todayReady: "This week's posts are ready",
  /** Today's point for what to film. */
  todayFilm: (count: number) =>
    count === 1 ? "Film a short clip for the week" : `Film ${count} short clips for the week`,
  /** The head's line under a ready week's size: how often it goes up, and where. */
  goingUp: (count: number, places: string) => `Going up ${count === 1 ? "once" : `${count} times`} on ${places}`,
  approve: "Approve the week",
  /** A week AI may approve, held (00714, board B5): the Week's head, Today's point, the press that stops it, and after. */
  held: (at: string) => `Goes up at ${at} unless you stop it`,
  todayHeld: (at: string) => `Your week goes up at ${at} unless you stop it`,
  stop: "Stop it",
  stopped: "Stopped. Nothing goes up until you approve it.",
  /** A ready week that waits on the owner's press, whatever let it go. */
  untilApproved: "Nothing goes up until you approve it.",
  /** An approved week's head: who approved it and when (nobody's press: AI, under the owner's setting), then what goes. */
  approvedBy: {
    owner: (at: string) => `Approved ${at}.`,
    ai: (at: string) => `AI approved it ${at}, as you set it.`,
  },
  eachGoes: "Each goes up at its time.",
  approvedTitle: (size: string) => `Approved · ${size}`,
  /** The head while the week is drafted: AI plans it and words it; nothing is made until it is approved. */
  drafting: "AI is planning this week",
  draftingBy: "Ready by Monday 8:00 AM. Nothing is made until you approve it.",
  needsYou: "Needs you",
  ready: "Ready",
  inOrder: "In time order",
  soFar: "So far",
  goingUpGroup: "Going up",
  upAndGoing: "Up, and going up",
  waiting: "Waiting",
  film: "Film these",
  filmNext: "For next week, film these",
  filmWhy: "No clip fits what this week needs. Film these, and AI makes the week from them.",
  /** "This week · Dec 1 to 7". */
  kicker: (span: string) => `This week · ${span}`,
  place: { instagram: "Instagram", google: "Google" },
  paused: "AI is paused. Nothing will post.",
  pausedSince: (at: string) =>
    at ? `Paused ${at}. What's set waits until you resume.` : "What's set waits until you resume.",
  resume: "Resume",
  /** The Week before it has a week: nothing connected, or a week not planned yet. */
  empty: {
    unconnected: {
      title: "A week of posts, made from your photos and clips",
      line: "AI plans each week from what you film and what the business needs, and posts each one where you approve it.",
    },
    unplanned: {
      title: "Your first week",
      line: "AI plans each week on Sunday evening, ready by Monday 8:00 AM. Or plan this one now.",
    },
  },
  connect: "Connect Instagram",
  connectGoogle: "Connect Google",
  plan: "Plan this week",
  add: "Add",
  /**
   * A row's line, as its creative stands. Where its posts say where it stands, the words are the one table's
   * (placements/standing-words.ts, its `week` column: "Goes up Tue 6:00 PM", "On Instagram · Tue", "Didn't post on
   * Instagram · why"); here, what the Week alone says.
   */
  waits: (when: string) => `Waits for you · was ${when}`,
  making: "Being made",
  videoMaking: "Its video is being made",
  videoMade: (when: string) => `Made · approve it to go up ${when}`,
  videoFailed: "Its video couldn't be made",
  /** A slot whose time has passed, by anyone's approval: it is never put up late, and its one fix picks another time. */
  timePassed: "Its time passed. Pick another time.",
  /** A row's one fix. */
  fix: {
    offer: "Add it",
    connect: "Connect",
    again: "Try again",
    open: "Open",
    post: "Approve",
    time: "Pick another time",
  },
  /** Picking another time, in the row opened: the sentence before the day and the time, and its two presses. */
  pickTime: { says: "Goes up", yes: "Set the time", set: (when: string) => `Set for ${when}.` },
  /** The piece of a row not made yet: where each place takes it, and its words. */
  whereItGoes: "Where it goes",
  caption: "Caption",
  plannedFrom: (name: string) => `Planned from ${name}`,
  approvedToast: "Approved. Each goes up at its time.",
  leftOut: (count: number) => (count === 1 ? "1 was left out: it says why." : `${count} were left out: each says why.`),
  /**
   * How AI's approval of a held week ended, where it says so (week-endings.ts): Today's point for a week that waits on
   * the owner and for one AI approved, the bell where AI did not approve it, and each reason in a clause.
   */
  ending: {
    todayWaits: "This week's posts are waiting for you",
    todayApproved: "AI approved this week's posts",
    notApproved: "AI didn't approve this week's posts",
    aiDidnt: "AI didn't approve it.",
    aiDidntThem: "AI didn't approve them.",
    youStopped: "You stopped it.",
    paused: "AI is paused, so nothing goes up.",
    noneReady: "No post is ready to go up. Each says why.",
    waitsThem: "Nothing goes up until you approve them.",
    look: "Look at it, then approve the week.",
  },
} as const;
