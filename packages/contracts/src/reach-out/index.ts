/** Reach out: the campaign email's words and rules, its timetable, and the hours and time zones the window keeps. */
export {
  whyFrom,
  campaignFooter,
  campaignFooterHtml,
  isCampaignEmail,
  unsubscribePageWords,
  WHY_FROM_MAPS,
  MARKETING_LINE,
  UNSUBSCRIBE_PAGE_HEADER,
} from "./reach-out";
export type { UnsubscribeView, UnsubscribePageWords } from "./reach-out";
export { zoneOfRegion, US_STATE_ZONES } from "./us-zones";
export type { UsStateCode } from "./us-zones";
export { weekHoursOf, DEFAULT_WEEK } from "./lead-hours";
export type { WeekdayKey, OpenWindow, WeekHours } from "./lead-hours";
export {
  sendWindowsOf,
  timetable,
  SEND_WINDOW_MARGIN_MIN,
  SEND_DAY_FRAME,
  TIMETABLE_HORIZON_DAYS,
} from "./reach-out-timetable";
export type { TimetableSend, TimetableDomain, TimetableInput, Placed, TimetableResult } from "./reach-out-timetable";
export {
  outreachRefusalOf,
  isWaitRefusal,
  isReachOutRun,
  reachOutSlots,
  OUTREACH_WAIT_REFUSALS,
  REACH_OUT_MONTH_EMAILS,
} from "./reach-out-rules";
export type { OutreachLeadFacts, SlotLead } from "./reach-out-rules";
