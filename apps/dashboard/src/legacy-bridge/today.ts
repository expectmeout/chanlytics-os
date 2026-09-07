/**
 * Today's helpers for the legacy page, computed in contracts from the
 * surfaces the page already holds — the calendar, the playbooks, the people,
 * Reports, the bell. Published on window the way the calendar's verbs are,
 * so the page composes and never derives.
 */
import { todayDay, todayDayFacts, todayWeek, todayJourney, todayAway } from "@chanlytics/contracts";

declare global {
  interface Window {
    __today?: {
      day: typeof todayDay;
      facts: typeof todayDayFacts;
      week: typeof todayWeek;
      journey: typeof todayJourney;
      away: typeof todayAway;
    };
  }
}

export function installToday(): void {
  window.__today = { day: todayDay, facts: todayDayFacts, week: todayWeek, journey: todayJourney, away: todayAway };
}
