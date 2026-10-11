/**
 * When a send goes, in the words every receipt and the send screen share (moved from legacy/pages/broadcasts.jsx,
 * decision 0015): the sentence for a receipt, the sentence that picks the time, and what the picked time means.
 *
 * The time is picked as a sentence, as a playbook's hour is: "Now", or "On [a day] at [a time] Tokyo time", the day the
 * kit's date picker and the time the kit's picker of the sending hours in quarter hours. It was the browser's own
 * `datetime-local` box, which drew in the system's colours and let a person type any minute of any day.
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

/** The day and time a send goes at, or "now". */
interface BcWhenPickProps {
  /** The instant picked, in ms; null is "now". */
  at: number | null;
  /** How far ahead the route takes a send, in days. */
  maxDays: number;
  onChange: (at: number | null) => void;
}

// The choices of when: now, or a day and a time. What each means is said under its words.
function modeGroups(maxDays: number) {
  const city = pageClock().city();
  return cmGroups([
    { id: "now", label: SEND_WHEN_WORDS.now, sub: SEND_WHEN_WORDS.nowSub },
    { id: "later", label: SEND_WHEN_WORDS.later, sub: SEND_WHEN_WORDS.laterSub(city, maxDays) },
  ]);
}

// The day and the time of a time picked, words of the send's sentence: the kit's date picker opened from the word that says
// the day, and the kit's picker of the sending hours, with the time already held (a send kept from before may sit off the
// quarter hours). The zone is said by the line under the sentence, where the time is said in full.
function dayAndTime({ at, maxDays, onChange }: BcWhenPickProps & { at: number }) {
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

// When the send goes, the last words of its sentence ("…, [now]." or "…, [on] [Tue, Oct 6] at [9:15 AM]."), by the
// business's clock (pageClock): 22:30 here is half past ten where the business is, whatever the device's zone. It holds
// the instant, so what is sent is what the note says, and it stops at now and at the ceiling the route keeps.
export function BcWhenPick(props: BcWhenPickProps) {
  const { at, maxDays, onChange } = props;
  return (
    <span data-testid="bc-when">
      <Picker
        label={SEND_WHEN_WORDS.modeLabel}
        value={at === null ? "now" : "later"}
        onValueChange={(mode) => onChange(mode === "later" ? firstSlot(Date.now()) : null)}
        groups={modeGroups(maxDays)}
        chevron={cmChevron()}
        face={(at === null ? SEND_WHEN_WORDS.now : SEND_WHEN_WORDS.on).toLowerCase()}
        inline
        data-testid="bc-when-mode"
      />
      {at === null ? null : <> {dayAndTime({ at, maxDays, onChange })}</>}
    </span>
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

// What Send now does, where no time is picked: it goes when it is pressed, and outside the sending hours it waits for
// the next nine o'clock, as the preview's stamp says. In the business's time, which the preview's stamp is in; the city
// is said where a time is picked (bcWhenNote), not under Now too.
export function bcNowNote(): string {
  const C = pageClock();
  const open = C.nextOpen(Date.now());
  return open.moved ? `Goes out ${C.when(open.at)} — ${sendsWaitWords(C.hours)}` : "Goes out as soon as you press Send";
}
