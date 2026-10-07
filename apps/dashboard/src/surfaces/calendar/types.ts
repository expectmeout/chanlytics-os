/**
 * A day as the board draws it (calendar-page.tsx): the view model's day where the loaded window has it, and the frame the
 * dates alone give (contracts frameOf) where the read is still on its way, marked `loading`, or failed, marked `unread`.
 */
import type { CalendarDayVM } from "@chanlytics/contracts";

export type CalendarFrame = Omit<CalendarDayVM, "beyondOffer"> & {
  beyondOffer?: boolean;
  loading?: boolean;
  unread?: boolean;
};
