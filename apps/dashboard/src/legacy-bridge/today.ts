/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell, the broadcasts. Published on window the way the
 * calendar's verbs are, so the page composes and never derives. The mockup's
 * sample (today-sample.ts) publishes the same object, so the two cannot drift.
 *
 * `facts`, `dayLine`, `week`, `journey` and `away` are the period card's and
 * the journey's; they leave with those cards in the page PR.
 */
import { todayDay, todayDayFacts, todayDayLine, todayWeek, todayJourney, todayAway, todayAwayGrouped, todayLeaks, todayPeriodLine, todayRunWords, todayRunsSub, todayRunApproved } from "@chanlytics/contracts";

export const TODAY_HELPERS = { day: todayDay, periodLine: todayPeriodLine, runs: todayRunWords, runsSub: todayRunsSub, runApproved: todayRunApproved, leaks: todayLeaks, awayGrouped: todayAwayGrouped, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway };
export type TodayHelpers = typeof TODAY_HELPERS;

declare global {
  interface Window {
    __today?: TodayHelpers;
  }
}

export function installToday(): void {
  window.__today = TODAY_HELPERS;
}
