/**
 * Today's helpers for the legacy page: the day module and the day's facts,
 * computed in contracts from the surfaces the page already holds — the
 * calendar, the playbooks, the people. Published on window the way the
 * calendar's verbs are, so the page composes and never derives.
 */
import { todayDay, todayDayFacts } from "@chanlytics/contracts";

declare global {
  interface Window {
    __today?: { day: typeof todayDay; facts: typeof todayDayFacts };
  }
}

export function installToday(): void {
  window.__today = { day: todayDay, facts: todayDayFacts };
}
