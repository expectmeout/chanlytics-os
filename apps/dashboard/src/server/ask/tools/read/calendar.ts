import "server-only";
import { z } from "zod";
import { dayInZone, isDayKey, shiftKey, toCalendarVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { calendar } from "../../../readers/calendar";
import { openings } from "../../../readers/openings";
import { defineActions, readAction, str, type ToolContext } from "../context";

async function getOpenings(t: ToolContext, input: { day: string; service: string }): Promise<unknown> {
  // The palette's own read (readers/openings.ts), once a turn, with the zone and the settings the turn read; what was
  // asked is cut where the route cuts it, the service at 160 (ledger #13).
  const r = (await load(t.rc, openings, { day: str(input.day, 20) || null, service: str(input.service, 160) || null }))
    .data.openings;
  return { state: r.state, text: r.text, days: r.days, service: r.service?.name ?? null };
}

const WEEKDAY_KEYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** The calendar for a day or a few, in the words the page uses. */
async function getCalendar(t: ToolContext, input: { day: string; days?: number }): Promise<unknown> {
  const todayKey = dayInZone(t.timezone, t.now.getTime()).key;
  const asked = str(input.day, 20).trim().toLowerCase();
  const askedKey = isDayKey(asked) ? asked : null;
  let from = todayKey;
  if (asked === "tomorrow") from = shiftKey(todayKey, 1);
  else if (askedKey) from = askedKey;
  else if (asked.slice(0, 3) in WEEKDAY_KEYS) {
    const want = WEEKDAY_KEYS[asked.slice(0, 3)];
    for (let i = 0; i < 7; i++) {
      const k = shiftKey(todayKey, i);
      if (new Date(`${k}T12:00:00Z`).getUTCDay() === want) {
        from = k;
        break;
      }
    }
  }
  const days = Math.min(14, Math.max(1, Math.round(Number(input.days)) || 1));
  // The board as its page reads it (readers/calendar.ts), once a turn, with the zone and the settings the turn read,
  // and never a write. No day asked is the page's own span from its Monday: its week, as the Calendar opens (ledger
  // #11), or as many days as were asked for; a day asked is that day and the days after it, as before. Then the page's
  // own view model, as the bridge builds it.
  const r = await load(
    t.rc,
    calendar,
    asked ? { from, days } : { from: null, days: input.days === undefined ? 7 : days },
  );
  const vm = toCalendarVM(r.data.calendar, t.now);
  // A person the calendar names is a row read: the answer may name them, and open their profile.
  for (const d of vm.days) for (const b of [...d.allDay, ...d.blocks]) if (b.person) t.read.person.add(b.person.id);
  return {
    route: "calendar",
    feed: vm.feed.line,
    timezone: vm.timezone,
    days: vm.days.map((d) => ({
      day: d.key,
      label: d.long,
      closed: d.closed.yes ? (d.closed.note ? `closed · ${d.closed.note}` : "closed") : null,
      taken: [...d.allDay, ...d.blocks].map((b) => ({
        time: b.time,
        title: b.title,
        person: b.person ? { contact_id: b.person.id, name: b.person.name } : null,
      })),
      open: d.windows.map((w) => w.label),
    })),
    note: "Taken is the owner's own calendar; open is what the receptionist would offer a caller.",
  };
}

/**
 * The calendar (D11): a day or a few, taken beside open (week, once get_calendar), and the free slots alone (openings,
 * once get_openings).
 */
export const calendarTool = defineActions({
  name: "calendar",
  description:
    "The owner's calendar as the receptionist reads it. Action week takes day and an optional days and reads a day or a few: what is taken (in the calendar's own words, with the person in People when the title names one), whether the business is closed that day, and the windows the receptionist would offer; day is today, tomorrow, a weekday (mon..sun), a date (YYYY-MM-DD), or empty for the page's own week, and days is how many from there, at most 14. Action openings takes day and service and reads the open times from the connected calendar, against the business hours, closures and booking rules, as the receptionist would offer them to a caller: a state, a sentence, and the open windows day by day, sized for a service when one is named; day is a weekday (mon..sun), a date (YYYY-MM-DD), or empty for the next days, and service is the service's name to size the slot, or empty. Call action week for what a day looks like or who is booked when, and action openings for when there is room or what is free on a day, the free slots alone, sized to a service. Openings need a connected calendar feed, said in the workspace's facts above. Taken is the owner's own calendar and open is what the receptionist would offer; nothing is booked from here, since customers book through the booking link, or with the team where there is none.",
  actions: {
    week: readAction({
      input: z.object({ day: z.string(), days: z.number().optional() }),
      examples: [{ day: "tomorrow" }, { day: "2026-10-03", days: 3 }, { day: "", days: 7 }],
      label: "Reading the calendar",
      run: getCalendar,
    }),
    openings: readAction({
      input: z.object({ day: z.string(), service: z.string() }),
      examples: [
        { day: "fri", service: "consultation" },
        { day: "2026-10-03", service: "" },
      ],
      label: "Checking the calendar",
      run: getOpenings,
    }),
  },
});
