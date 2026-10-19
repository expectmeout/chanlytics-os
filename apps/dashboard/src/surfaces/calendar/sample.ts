/**
 * The demo's Calendar: the sample day Today draws (sample-day.ts: six on the calendar today, three
 * tomorrow, two open times) laid in the weeks around today the page loads, so the page reads every view of it and steps a
 * few weeks without a read: a demo session has nothing to read from. The same contracts function a real workspace's calendar
 * goes through builds its view model (toCalendarVM), so a demo session draws the one Calendar there is. The page imports
 * it, and draws it only in a demo session that has read nothing of its own (the standalone mockup's Calendar went with the
 * shell's: a moved surface is drawn by the app).
 */
import {
  MIN_MS,
  appointmentWords,
  shiftKey,
  toCalendarVM,
  windowFor,
  type CalendarRunsDto,
} from "@chanlytics/contracts";
import { sampleCalendarDto } from "./sample-day";
import { sampleClock } from "./sample-clock";
import type { CalendarSurface } from "./surface";

let lastSample: { minute: number; sample: CalendarSurface } | null = null;

/** The sample as of `nowMs`: the same minute gives the same value, kept rather than rebuilt on every draw. */
export function calendarSample(nowMs: number = Date.now()): CalendarSurface {
  const minute = Math.floor(nowMs / MIN_MS);
  if (lastSample && lastSample.minute === minute) return lastSample.sample;
  const clock = sampleClock(nowMs);
  const dto = sampleCalendarDto(clock, "usual");
  // The weeks around today, as a read would have loaded them: the sample's days where it has them, the rest empty.
  const loaded = windowFor(clock.today);
  const held = new Map(dto.days.map((d) => [d.key, d]));
  dto.days = Array.from({ length: loaded.days }, (_, i) => {
    const key = shiftKey(loaded.from, i);
    return held.get(key) ?? { key, items: [], windows: [] };
  });
  dto.from = loaded.from;
  dto.to = shiftKey(loaded.from, loaded.days - 1);
  const sample: CalendarSurface = { vm: toCalendarVM(dto, clock.now), fetchedAt: nowMs };
  lastSample = { minute, sample };
  return sample;
}

let lastRuns: { day: string; runs: CalendarRunsDto } | null = null;

/**
 * The demo's campaigns over the same weeks (the Calendar's lane C): a one-off send this Friday, the reminder campaign that
 * went this morning and runs again tomorrow, a run waiting for approval, a campaign's last day, and a chain of cold email,
 * so every mark the board draws has one to draw. Made through the shape GET calendar/runs answers, so the page draws it
 * through the one builder (contracts calendarRunMarksOf). Kept for the day.
 */
export function sampleRuns(nowMs: number = Date.now()): CalendarRunsDto {
  const clock = sampleClock(nowMs);
  if (lastRuns && lastRuns.day === clock.today) return lastRuns.runs;
  const loaded = windowFor(clock.today);
  const day = (n: number) => shiftKey(clock.today, n);
  const reminder = appointmentWords("appointment").before.name;
  const run = (id: string, over: Partial<CalendarRunsDto["runs"][number]>): CalendarRunsDto["runs"][number] => ({
    id,
    name: "Message",
    state: "sent",
    scheduled_for: clock.at(10),
    started_at: clock.at(10),
    finished_at: clock.at(10, 5),
    run_for: clock.today,
    playbook_id: null,
    reach_out: false,
    sent: 0,
    recipient_count: 0,
    ...over,
  });
  const runs: CalendarRunsDto = {
    timezone: "America/New_York",
    from: loaded.from,
    days: loaded.days,
    paused: false,
    runs: [
      run("demo-reminder-today", { name: reminder, playbook_id: "demo-reminder", sent: 6, recipient_count: 6 }),
      run("demo-thanks-today", {
        name: "Thank you",
        playbook_id: "demo-thanks",
        sent: 3,
        recipient_count: 3,
        scheduled_for: clock.at(11),
        started_at: clock.at(11),
        finished_at: clock.at(11, 2),
      }),
      run("demo-winback", {
        name: "We miss you",
        playbook_id: "demo-winback",
        state: "pending_approval",
        run_for: day(1),
        scheduled_for: clock.at(9),
        started_at: null,
        finished_at: null,
        recipient_count: 14,
      }),
      run("demo-autumn", {
        name: "Autumn offer",
        state: "scheduled",
        run_for: null,
        scheduled_for: clock.at(10, 0, 3),
        started_at: null,
        finished_at: null,
        recipient_count: 42,
      }),
      run("demo-cold", {
        name: "Businesses nearby",
        playbook_id: "demo-chain",
        reach_out: true,
        run_for: day(-1),
        sent: 12,
        recipient_count: 12,
      }),
    ],
    moments: [
      {
        id: "demo-reminder",
        name: reminder,
        trigger: "visit_tomorrow",
        state: "running",
        mode: "auto",
        run_hour: 10,
        last_run_for: clock.today,
        until: null,
        reach_out: false,
      },
      {
        id: "demo-thanks",
        name: "Thank you",
        trigger: "visited",
        state: "running",
        mode: "veto",
        run_hour: 11,
        last_run_for: clock.today,
        until: null,
        reach_out: false,
      },
      {
        id: "demo-winback",
        name: "We miss you",
        trigger: "lapsed",
        state: "running",
        mode: "ask",
        run_hour: 9,
        last_run_for: day(1),
        until: day(9),
        reach_out: false,
      },
      {
        id: "demo-chain",
        name: "Businesses nearby",
        trigger: "reach_out",
        state: "running",
        mode: "ask",
        run_hour: 9,
        last_run_for: day(-1),
        until: null,
        reach_out: true,
      },
    ],
  };
  lastRuns = { day: clock.today, runs };
  return runs;
}
