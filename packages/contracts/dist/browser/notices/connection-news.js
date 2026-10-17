import { DAY_MS, agoWords } from "../shared/time.js";
export const GOOGLE_SYNC_TOLD_AFTER_MS = 2 * DAY_MS;
export const GOOGLE_SYNC_NOTICE_WORDS = {
  title: "Google Business Profile stopped syncing",
  body: (f) => (f.lasting ? "Google stopped letting Chanlytics read your Business Profile, so new reviews no longer arrive here." : `Your Business Profile ${f.lastSyncedMs === null ? "has not synced since it was connected" : `last synced ${agoWords(f.lastSyncedMs, f.nowMs)}`}, and every try since has failed, so new reviews no longer arrive here.`) + " Connections says what Google answered. Reconnecting it there, under Google, mends most causes."
};
export const CALENDAR_UNREADABLE_TOLD_AFTER_MS = DAY_MS;
export const CALENDAR_UNREADABLE_WORDS = {
  title: "Your calendar link stopped answering",
  body: (f) => `Your calendar link stopped answering ${agoWords(f.sinceMs, f.nowMs)}. Until it answers again, the receptionist does not say which times are open, and new bookings do not reach the Calendar. Check the link in Settings, under Business.`
};
