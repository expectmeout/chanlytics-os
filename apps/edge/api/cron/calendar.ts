/**
 * The calendar sweep's door: pg_cron asks it every hour at :23 ('calendar-people-sweep', 00053) with the sweep key, and
 * it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepCalendar in lib/calendar/calendar-sweep.ts: a bounded, rotating page of the workspaces whose calendar feed is
 * due, each with the people its appointments name put in People.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepCalendar } from "../../lib/calendar/calendar-sweep.js";

export const POST = sweepDoor({ sweep: "calendar" }, sweepCalendar);
