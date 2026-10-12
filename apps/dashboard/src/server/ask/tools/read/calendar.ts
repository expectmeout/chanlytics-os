import "server-only";
import { z } from "zod";
import { dayInZone, isDayKey, shiftKey, toCalendarVM, visitStands, type CalendarBlockVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { calendar } from "../../../readers/calendar";
import { openings } from "../../../readers/openings";
import { ROOM_DAYS } from "../../openings";
import { defineActions, noteRow, readAction, str, type ToolContext } from "../context";

/**
 * How full the book is over the next fourteen days, for pacing an offer to what the business can take: the openings
 * reader's own answer for every day and service (readers/openings.ts), read once a turn as calendar.openings reads it
 * with neither asked, its room summed (ask/openings.ts roomOf). No calendar, or one that cannot be read, is said in
 * `none`, and counts nothing. Ask's plan reads the room through it too (act/plan.ts), so the room it paces an offer to is
 * the room this says.
 */
export async function getRoom(t: ToolContext) {
  const r = (await load(t.rc, openings, { day: null, service: null })).data.openings;
  if (!r.room) {
    const none = r.state === "no_calendar" ? "no_calendar" : "unavailable";
    return { days: ROOM_DAYS, open: 0, taken: 0, by_day: [], none };
  }
  const { days, by_day, taken } = r.room;
  return { days, open: by_day.reduce((n, d) => n + d.open, 0), taken, by_day };
}

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
  // Taken is what stands: the board draws a visit the record says was cancelled, struck, and Today and People count it none.
  const standing = (blocks: CalendarBlockVM[]) => blocks.filter((b) => visitStands(b.visit));
  // A person the calendar names is a row read: the answer may name them, and open their profile.
  for (const d of vm.days)
    for (const b of [...standing(d.allDay), ...standing(d.blocks)])
      if (b.person) noteRow(t, "person", b.person.id, b.person.name, `clients/${b.person.id}`);
  return {
    route: "calendar",
    feed: vm.feed.line,
    timezone: vm.timezone,
    days: vm.days.map((d) => ({
      day: d.key,
      label: d.long,
      closed: d.closed.yes ? (d.closed.note ? `closed · ${d.closed.note}` : "closed") : null,
      taken: [...standing(d.allDay), ...standing(d.blocks)].map((b) => ({
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
 * once get_openings); since 10 Oct 2026, how full the book is over the next fourteen days (room).
 */
export const calendarTool = defineActions({
  name: "calendar",
  description: "The owner's calendar as the receptionist reads it.",
  tail: "Call action week for what a day looks like or who is booked when, action openings for when there is room or what is free on a day, the free slots alone, sized to a service, and action room for how full the book is over the next fourteen days, to pace an offer. Openings need a connected calendar feed, said in the workspace's facts above. Taken is the owner's own calendar and open is what the receptionist would offer; nothing is booked from here, since customers book through the booking link, or with the team where there is none.",
  actions: {
    week: readAction({
      input: z.object({ day: z.string(), days: z.number().optional() }),
      examples: [{ day: "tomorrow" }, { day: "2026-10-03", days: 3 }, { day: "", days: 7 }],
      label: "Reading the calendar",
      words:
        "Action week takes day and an optional days and reads a day or a few: what is taken (in the calendar's own words, with the person in People when the title names one), whether the business is closed that day, and the windows the receptionist would offer; day is today, tomorrow, a weekday (mon..sun), a date (YYYY-MM-DD), or empty for the page's own week, and days is how many from there, at most 14.",
      run: getCalendar,
    }),
    openings: readAction({
      input: z.object({ day: z.string(), service: z.string() }),
      examples: [
        { day: "fri", service: "consultation" },
        { day: "2026-10-03", service: "" },
      ],
      label: "Checking the calendar",
      words:
        "Action openings takes day and service and reads the open times from the connected calendar, against the business hours, closures and booking rules, as the receptionist would offer them to a caller: a state, a sentence, and the open windows day by day, sized for a service when one is named; day is a weekday (mon..sun), a date (YYYY-MM-DD), or empty for the next days, and service is the service's name to size the slot, or empty.",
      run: getOpenings,
    }),
    room: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Counting the open slots",
      words:
        "Action room takes nothing more and reads how full the book is over the next 14 days (days; fewer where the business offers times fewer days ahead), for pacing an offer to what the business can take: open, how many slots of the business's slot length are free against its hours, closures and booking rules once the calendar's appointments and the bookings on record are taken out, as the receptionist would offer them; by_day, the open slots of each day that has any (day is YYYY-MM-DD on the business's clock); and taken, how many slots of the same hours those appointments and bookings fill. A slot is the calendar's, one booking at a time, and never a count of staff or seats: say open as the room left in the book, never as how many people can come at once. none says no_calendar where no calendar feed is connected and unavailable where it could not be read, and the counts then say nothing of the book.",
      run: getRoom,
    }),
  },
});
