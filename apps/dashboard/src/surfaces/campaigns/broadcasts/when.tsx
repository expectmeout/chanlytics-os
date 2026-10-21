/**
 * When a send goes (moved from legacy/pages/broadcasts.jsx, decision 0015): the day and time a one-off is set for, picked
 * as words of a sentence ("[tomorrow] at [9:15 AM]"), and what a picked time means (bcWhenNote, a run's acts).
 *
 * The day is the kit's date picker and the time the kit's picker of the sending hours in quarter hours, within the days
 * the route keeps and never a time gone by. It was the browser's own `datetime-local` box, which drew in the system's
 * colours and let a person type any minute of any day. The send screen drew it after its "now or later"; New's When
 * sheet draws it under its own "Pick a day" (decision 0065 step 7, where that screen left).
 */
import { DAY_MS, MIN_MS, SEND_WHEN_WORDS, sendsWaitWords } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { DatePicker } from "../../kit/datepicker/datepicker";
import { Icon } from "../../kit/icon/icon";
import { Picker, Token } from "../../kit/picker/picker";
import { cmChevron, cmGroups } from "../parts/picks";

// The receipt's sentence for when a send really goes is when-words.ts's (bcWhenWords): words alone, off the shell.

/** The minutes of an hour a time may be picked at: quarter hours. */
const SLOT_MINUTES = [0, 15, 30, 45];
/** The step between two of them. */
const SLOT_MS = 15 * MIN_MS;

const pad2 = (n: number) => String(n).padStart(2, "0");

// Every quarter hour of the sending hours the clock publishes (contracts SENDING_HOURS_WORDS), "09:00" to "20:45": the
// times a send is picked at. The route moves any other to the next nine o'clock, so none is offered.
function timeSlots(): string[] {
  const { min, max } = pageClock().hours;
  const out: string[] = [];
  for (let h = min; h <= max; h += 1) for (const m of SLOT_MINUTES) out.push(`${pad2(h)}:${pad2(m)}`);
  return out;
}

// A time as the page says one ("9:15 AM", as the clock's own words do), from its "09:15".
function slotWords(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad2(m)} ${h < 12 ? "AM" : "PM"}`;
}

// A day as a word of the sentence says it: "today", else its weekday and date ("Tue, Oct 6"), from the business's "YYYY-MM-DD".
function dayToken(day: string, today: string): string {
  if (day === today) return SEND_WHEN_WORDS.today.toLowerCase();
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

// An instant as the business's day and time ("2026-12-15", "13:30"), by its clock, whatever the device's zone.
function partsOf(at: number): { day: string; time: string } {
  const [day = "", time = ""] = pageClock().inputValue(at).split("T");
  return { day, time };
}

// The first time a send can be picked at: a quarter hour from now or later, and inside the sending hours (the next
// nine o'clock, after them), as the route would move it.
function firstSlot(now: number): number {
  return pageClock().nextOpen(Math.ceil((now + MIN_MS) / SLOT_MS) * SLOT_MS).at;
}

// A day picked, keeping the time of day: held to the window the route keeps (today to `maxDays` on), and never a time
// that has passed -- today's earlier hours give way to the first time still ahead.
function putDay(at: number, day: string, maxDays: number): number {
  const C = pageClock();
  const now = Date.now();
  const first = C.dayKey(now);
  const last = C.dayKey(now + maxDays * DAY_MS);
  const held = day < first ? first : day > last ? last : day;
  const next = C.fromInput(`${held}T${partsOf(at).time}`);
  return next === null || next <= now ? firstSlot(now) : next;
}

/** The day and time a send goes at. */
interface WhenDayTimeProps {
  /** The instant picked, in ms. */
  at: number;
  /** How far ahead the route takes a send, in days. */
  maxDays: number;
  onChange: (at: number) => void;
}

// The day and the time of a time picked, words of the send's sentence: the kit's date picker opened from the word that says
// the day, and the kit's picker of the sending hours, with the time already held (a send kept from before may sit off the
// quarter hours). The zone is said by the line under the sentence, where the time is said in full.
export function WhenDayTime({ at, maxDays, onChange }: WhenDayTimeProps) {
  const C = pageClock();
  const { day, time } = partsOf(at);
  const slots = timeSlots();
  const times = slots.includes(time) ? slots : [...slots, time].sort();
  const today = C.dayKey(Date.now());
  return (
    <>
      <DatePicker
        value={day}
        onValueChange={(next) => onChange(putDay(at, next, maxDays))}
        today={today}
        label={SEND_WHEN_WORDS.dayLabel}
        glyphs={{ previous: <Icon name="chevron" size={14} />, next: <Icon name="chevron" size={14} /> }}
        trigger={<Token data-testid="bc-when-day">{dayToken(day, today)}</Token>}
      />{" "}
      {SEND_WHEN_WORDS.at}{" "}
      <Picker
        label={SEND_WHEN_WORDS.timeLabel}
        value={time}
        onValueChange={(next) => onChange(C.fromInput(`${day}T${next}`) ?? at)}
        groups={cmGroups(times.map((t) => ({ id: t, label: slotWords(t) })))}
        chevron={cmChevron()}
        face={slotWords(time)}
        inline
        data-testid="bc-when-time"
      />
    </>
  );
}

/** What the box's time means: whether Send can go, in which tone, and the sentence. */
interface WhenNote {
  ok: boolean;
  tone: string;
  words: string;
}

// What the box's time means before Schedule is pressed: when the send really goes, a time outside
// 9:00-20:59 moved to the next nine o'clock as the route will move it, and a time that has passed or is
// past the ceiling refused here rather than after the click.
export function bcWhenNote(at: number | null, maxDays: number): WhenNote {
  const C = pageClock();
  const city = C.city();
  const now = Date.now();
  if (at === null) return { ok: false, tone: "", words: `By ${city} time · within ${maxDays} days` };
  if (at <= now) return { ok: false, tone: "warn", words: "That time has passed — pick a later one, or Send now" };
  const open = C.nextOpen(at);
  if (open.at > now + maxDays * DAY_MS) return { ok: false, tone: "warn", words: `Pick a time within ${maxDays} days` };
  return open.moved
    ? { ok: true, tone: "", words: `Goes out ${C.when(open.at)}, ${city} time — ${sendsWaitWords(C.hours)}` }
    : { ok: true, tone: "", words: `Goes out ${C.when(at)}, ${city} time` };
}
