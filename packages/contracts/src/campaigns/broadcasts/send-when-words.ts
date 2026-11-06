/**
 * The words of the sentence that picks when a send goes (the send screen's "Now", or "On [a day] at [a time] Tokyo time").
 * The page draws the pickers and holds the instant; every word they say is here, so a sentence of the page is never typed in
 * its markup. The day and the time are the business's, by its clock, and the city is the clock's own name for it.
 */
export const SEND_WHEN_WORDS = {
  /** The sentence's lead, as a person said it: Now, or On a day. */
  now: "Now",
  on: "On",
  /** Between the day and the time. */
  at: "at",
  /** The choice's two options, each with what it means under its words. */
  nowSub: "As soon as you press Send now",
  later: "Pick a time",
  laterSub: (city: string, maxDays: number): string => `A day and a time, by ${city} time, within ${maxDays} days`,
  /** What the zone is called after the time. */
  zone: (city: string): string => `${city} time`,
  /** The day as a token says it when it is today. */
  today: "Today",
  /** Each picker's name, for a screen reader. */
  modeLabel: "When it goes",
  dayLabel: "The day it goes out",
  timeLabel: "The time it goes out",
} as const;
