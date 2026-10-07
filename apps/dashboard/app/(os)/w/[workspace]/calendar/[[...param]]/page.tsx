"use client";

import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { calendarAddress, calendarParam } from "@/surfaces/calendar/address";
import { CalendarPage } from "@/surfaces/calendar/calendar-page";

/**
 * /w/<slug>/calendar, and the addresses under it (`calendar/2026-09-10`, a day opened in Day view): the owner's calendar
 * as the receptionist reads it. A surface that left the shell (decision 0015, step 6): its code is `src/surfaces/calendar/`,
 * and the frame in the layout draws its chrome around this page. The address is read from the path, since a move between two
 * calendar addresses is a pushed entry and no request for a page that is already drawn; each address is its own mount.
 */
export default function Page() {
  const param = calendarParam(routeOfPath(usePathname()));
  return <CalendarPage key={param ?? ""} {...calendarAddress(param)} />;
}
