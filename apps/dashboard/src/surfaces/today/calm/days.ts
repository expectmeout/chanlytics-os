/**
 * The business's last days, a day each, for what Today says of them (Working for you, W8 and W9): the week's card and a day
 * against a usual one. Today's headline follows the period this device last picked on Reports, which may be a week, or a
 * month five days old: too few days for either, and both went silent there (the review of 22 Nov 2026). Where the
 * headline the page already holds has days enough, they are its own and nothing more is read; where it has not, the last
 * thirty are read once, kept for the hour, and shared by whoever asks.
 */
import { useEffect, useState } from "react";
import { HOUR_MS, toHeadlineVM, type ReportHeadlineVM, type ReportPeriodId } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { useSurface } from "../../use-surface";

/** A period's days, oldest first, today last. */
export type LastDays = ReportHeadlineVM["perDay"];

/** The period read where the device's own is too short: one of Reports' own, long enough for four weeks of a weekday. */
const LONG_PERIOD = "30d" satisfies ReportPeriodId;

/** The thirty days as last asked for, and when: asked once by whoever needs them first, and again after an hour. */
let asked: { at: number; days: Promise<LastDays | null> } | null = null;

function thirtyDays(): Promise<LastDays | null> {
  if (asked && Date.now() - asked.at < HOUR_MS) return asked.days;
  const days = read("GET reports/headline", { query: { period: LONG_PERIOD } }).then(
    (answer) => toHeadlineVM(answer.headline).perDay,
    // A read that failed says nothing, and is asked again by the next who needs it.
    () => {
      asked = null;
      return null;
    },
  );
  asked = { at: Date.now(), days };
  return days;
}

/** Today is left: the next visit asks again. */
export function forgetLastDays(): void {
  asked = null;
}

/**
 * At least `atLeast` of the last days, today last: the headline's own where it holds that many, else the last thirty,
 * read once. Null until one of them is in, where neither holds enough, and while `wanted` is false (a sentence said only
 * once the day is done asks for nothing before it).
 */
export function useLastDays(atLeast: number, wanted = true): LastDays | null {
  const headline = useSurface("reports_headline");
  const [own, setOwn] = useState<LastDays | null>(null);
  const held = headline && headline.perDay.length >= atLeast ? headline.perDay : null;
  const short = wanted && !!headline && !held;
  useEffect(() => {
    if (!short) return undefined;
    let live = true;
    void thirtyDays().then((days) => {
      if (live) setOwn(days);
    });
    return () => {
      live = false;
    };
  }, [short]);
  if (held) return held;
  return short && own && own.length >= atLeast ? own : null;
}
