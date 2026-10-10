/**
 * Reports › People — what the lens is read from, counted once on the server.
 *
 * The lens has two halves. The window is the database's (people_series, 00394): the people who reached the business in the
 * days asked and the days before, by the wire they used, how the new ones first came, the yeses and stops they gave, the
 * addresses that stopped working, and the steps the team finished on time. The book is the pool's (people-now.ts): everyone
 * as they stand now, counted by People's own rules. This is the window's shape, its guard, and the one place the two become
 * what the route answers. Either half may be missing without the other: a database with no people_series yet still has a
 * book, and a book that could not be counted leaves the window. Counts only; a name never leaves the database. Pure.
 */
import { recordOrNull } from "../../shared/unknown";
import type { PeopleNowDto } from "./people-now";

/** The people who reached the business in a period: all of them, and those whose first moment with it was in the same period. */
interface ReachedDto {
  people: number;
  new: number;
}

/** The people who reached the business on each wire, a person once in each wire they used: the four add to at least the people reached. */
interface ByChannelDto {
  whatsapp: number;
  sms: number;
  email: number;
  voice: number;
}

/** The answers given in the window, one a person, a kind of message and an answer: how many, by who gave it and by what it was about. */
interface AnswersDto {
  total: number;
  by_source: Record<string, number>;
  by_purpose: { messages: number; offers: number; email_offers: number };
}

/** people_series's own answer (00394). */
export interface PeopleSeriesDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
  end?: string;
  days: number;
  /** The window (`now`) and the same number of days before it (`before`). */
  reached: { now: ReachedDto; before: ReachedDto };
  by_channel: { now: ByChannelDto; before: ByChannelDto };
  /** The new people of the window by the door they came through (`acquired_via`); the values add up to `reached.now.new`. */
  first_came: { by_via: Record<string, number> };
  /** The yeses and stops of the window by who gave them and what for; the period before is totals. */
  consent: { now: { yes: AnswersDto; stop: AnswersDto }; before: { yes: number; stop: number } };
  /** Addresses that stopped working in the window, a person once, by the first reason. */
  email_stopped: { total: number; by_reason: Record<string, number> };
  /** The steps finished in the window, and how many of them on their day or before. */
  steps: { done: number; on_time: number };
}

/** What the route answers (the reader's body). `series` is null where the database has no people_series yet; `now` is null where the book could not be counted. */
export interface PeopleDto {
  timezone: string;
  today: string;
  end?: string;
  days: number;
  series: PeopleSeriesDto | null;
  now: PeopleNowDto | null;
}

/**
 * The parts of a people_series answer the lens's fold reads as objects (it takes a period's counts from `reached.now`, its
 * ways in from `first_came.by_via`, its sources from `consent.now.yes.by_source`, ...), each as the keys down to it: an
 * answer missing one would make the fold throw, so it is not an answer.
 */
const SERIES_RECORDS: readonly (readonly string[])[] = [
  ["reached", "now"],
  ["reached", "before"],
  ["by_channel", "now"],
  ["by_channel", "before"],
  ["first_came", "by_via"],
  ["consent", "now", "yes", "by_source"],
  ["consent", "now", "yes", "by_purpose"],
  ["consent", "now", "stop", "by_source"],
  ["consent", "now", "stop", "by_purpose"],
  ["consent", "before"],
  ["email_stopped", "by_reason"],
  ["steps"],
];

/** Whether each key down `path` is an object, from `from` (a path through objects only: one gap and it is not there). */
const hasRecordAt = (from: Record<string, unknown>, path: readonly string[]): boolean =>
  path.reduce<Record<string, unknown> | null>((at, key) => (at === null ? null : recordOrNull(at[key])), from) !== null;

/**
 * Whether the database answered a People read (people_series): the window, and the people reached, the ways they came, the
 * answers given, the addresses stopped and the steps done the lens is made of, each an object, and not its own `{ error }`
 * (an unknown workspace).
 */
export function isPeopleSeriesDto(answer: unknown): answer is PeopleSeriesDto {
  const a = recordOrNull(answer);
  return (
    a !== null &&
    typeof a.timezone === "string" &&
    typeof a.today === "string" &&
    typeof a.days === "number" &&
    SERIES_RECORDS.every((path) => hasRecordAt(a, path))
  );
}

/**
 * The route's answer from the database's and the pool's: the window as the series says it (`end` only where there is
 * one), or, with no people_series in this database (`series` null), as the route asked it (`head`); the book as counted,
 * or null. Pure: the reader feeds it both halves.
 */
export function peopleDtoOf(
  series: PeopleSeriesDto | null,
  parts: {
    /** The book as it stands now; null where it could not be counted. */
    now: PeopleNowDto | null;
    /** The window as the route asked it, which the DTO echoes (used when `series` is null). */
    head: { timezone: string; today: string; end?: string; days: number };
  },
): PeopleDto {
  const asked = series ?? parts.head;
  return {
    timezone: asked.timezone,
    today: asked.today,
    ...(asked.end === undefined ? {} : { end: asked.end }),
    days: asked.days,
    series,
    now: parts.now,
  };
}
