/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell. Published on window the way the calendar's verbs are,
 * so the page composes and never derives.
 */
import { todayDay, todayDayFacts, todayDayLine, todayWeek, todayJourney, todayAway, todayAwayGrouped, todayLeaks } from "@chanlytics/contracts";

declare global {
  interface Window {
    __today?: {
      day: typeof todayDay;
      facts: typeof todayDayFacts;
      dayLine: typeof todayDayLine;
      week: typeof todayWeek;
      journey: typeof todayJourney;
      away: typeof todayAway;
      awayGrouped: typeof todayAwayGrouped;
      leaks: typeof todayLeaks;
    };
  }
}

export function installToday(): void {
  window.__today = { day: todayDay, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway, awayGrouped: todayAwayGrouped, leaks: todayLeaks };
}
