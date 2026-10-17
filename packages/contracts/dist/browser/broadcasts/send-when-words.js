export const SEND_WHEN_WORDS = {
  /** The sentence's lead, as a person said it: Now, or On a day. */
  now: "Now",
  on: "On",
  /** Between the day and the time. */
  at: "at",
  /** The choice's two options, each with what it means under its words. */
  nowSub: "As soon as you press Send now",
  later: "Pick a time",
  laterSub: (city, maxDays) => `A day and a time, by ${city} time, within ${maxDays} days`,
  /** What the zone is called after the time. */
  zone: (city) => `${city} time`,
  /** The day as a token says it when it is today. */
  today: "Today",
  /** Each picker's name, for a screen reader. */
  modeLabel: "When it goes",
  dayLabel: "The day it goes out",
  timeLabel: "The time it goes out"
};
