/**
 * The day (Today in three zones, 2 Nov 2026), Today's second zone: what's ahead first. Its name and how it stands, the
 * visit under way or next and the one after it, each with one fact of who is coming (contracts todayZoneDay, from the
 * board's own read), the day as a bar with now on it, then the rest of it at its times: the visits after them, who comes
 * back from Not now, an hour a cancellation freed with Offer it (the edge's freed-time offer, decision 0082) and what goes
 * on its own today with its Stop (decision 0064). What is over, the runs that went out among it, is folded into the foot
 * ("3 earlier"), with what the Calendar holds past the lines. Once the day has closed it turns to tomorrow, and its foot
 * says how today went. A line that asks for something or comes back is never cut for a seat; on a phone the plain visits
 * are the Calendar's, and the foot says how many. With no calendar linked, the one row that links one, under what goes and
 * the runs that went out.
 */
import { useState } from "react";
import {
  CALENDAR_SETTING_ROUTE,
  GOING_TODAY_WORDS,
  TODAY_PHONE_WORDS as P,
  clockInZone,
  goingTodayOf,
  runRoute,
  runStopWords,
  runStoppedWords,
  runTitleOf,
  todayDayFoot,
  todayWentFoot,
  todayZoneDay,
  type BroadcastVM,
  type CalendarLike,
  type GoingTodayRowVM,
  type TodayDayBarVM,
  type TodayDayVM,
  type TodayVM,
  type TodayZoneCellVM,
  type TodayZoneDayVM,
  type TodayZoneLineVM,
} from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { pageClock, type PageClock } from "@/bridge/zone";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import { Button, Meter } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { SAYS_WHEN } from "../../kit/says-when";
import { routeDoor } from "../../frame-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { broadcastVerbs, broadcastsRead, refreshPlaybooks, useRunsActing } from "../../waits/run-acts";
import { TODAY_HELPERS } from "../helpers";
import { useTodayOnPhone } from "../phone";
import { borrowed, canDo, gate, refusalFlash, useMoved, useToast, workspaceClock, type Flash } from "../shell";
import { useDayVm } from "./day-vm";

/**
 * How many lines of the rest of the day it draws on a desk, more only where more ask for something: past these, the
 * Calendar holds them, and the foot says so.
 */
const LINES_MAX = 5;

/** The runs that go on their own today, soonest first: a batch held for a stop, a message set for later, a reach-out's run. */
function goingNow(): GoingTodayRowVM[] {
  const runs = (broadcastsRead()?.rows ?? []).map((r) => ({ ...r, title: runTitleOf(r) }));
  return goingTodayOf({ runs, tz: pageClock().zone(), nowMs: Date.now() });
}

/** Stop a run going today: Sent's own cancel, asked as Sent asks it, said in the toast. */
async function stopGoing(row: GoingTodayRowVM, flash: (f: Flash) => void): Promise<void> {
  const verbs = broadcastVerbs();
  if (!canDo("approve") || !verbs) return;
  const res = await verbs.cancel(row.stop.id);
  if (!res.ok) {
    flash(refusalFlash(res, "Not canceled"));
    return;
  }
  refreshPlaybooks();
  flash({
    msg: (
      <>
        <b>{row.name}</b> {runStoppedWords("scheduled")}
      </>
    ),
  });
}

/** A run that started, one the day says went out. */
type StartedRun = BroadcastVM & { started_at: string };

/** A run that went out today, with the time it went on the business's clock. */
type WentOut = { run: StartedRun; at: string; atMs: number };

/** The runs that went out today: how many, and the first two, each with the time it went on the business's clock. */
function runsDoneToday(): { rows: WentOut[]; count: number } {
  const all = broadcastsRead()?.rows ?? [];
  const clock = workspaceClock() as PageClock | null;
  if (!clock) return { rows: [], count: 0 };
  const went = all.filter(
    (r): r is StartedRun =>
      (r.state === "sent" || r.state === "sending") &&
      !!r.started_at &&
      clock.dayKey(Date.parse(r.started_at)) === clock.dayKey(Date.now()),
  );
  return {
    rows: went
      .slice(0, 2)
      .map((run) => ({ run, at: clock.time(Date.parse(run.started_at)), atMs: Date.parse(run.started_at) })),
    count: went.length,
  };
}

/** The visits a run was already made for (a freed hour offered, by the press or as the cancellation arrived). */
const offeredHours = (): ReadonlySet<string> =>
  new Set((broadcastsRead()?.rows ?? []).flatMap((r) => (r.offered_from ? [r.offered_from] : [])));

/** A part of the bar, in the kit's Meter's tones: what is over, under way, still to come, and the free time between. */
const BAR_TONE = { past: "rest", now: "ink", next: "open", later: "open", gap: "ground" } as const;

const barParts = (bar: TodayDayBarVM) => bar.parts.map((p) => ({ share: p.share, tone: BAR_TONE[p.phase] }));

/** The hours on the business's clock an instant stands at (14.5 is 2:30 PM), so a send takes its place among the visits. */
function hoursOnTheClock(zone: string, atMs: number): number {
  const { hh, mm } = clockInZone(zone, atMs);
  return hh + mm / 60;
}

/** The two cells over the bar, each its time over who and what and one fact of them, each opening its visit. */
function dayCells(cells: readonly TodayZoneCellVM[]) {
  return (
    <div className="tpd-cells">
      {cells.map((c, i) => (
        <a
          key={c.to + i}
          className="tpd-cell"
          {...routeDoor(c.to)}
          data-testid={i === 0 ? "today-day-first" : undefined}
        >
          <span className="tpd-eyebrow" data-now={c.now || undefined} {...SAYS_WHEN}>
            {c.eyebrow}
          </span>
          <span className="tpd-when tabular" {...SAYS_WHEN}>
            {c.when}
          </span>
          <span className="tpd-what">{c.what}</span>
          {c.fact ? (
            <span className="tpd-fact" data-testid="today-day-fact" {...SAYS_WHEN}>
              {c.fact}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}

/**
 * A line's words: its glyph where it has one, its title, and what it says under it. Called, not drawn. What it says under its
 * title is a time more often than not; `timed` says the title is too (an hour freed: "Open · 45 min", which may be over by now).
 */
function dayLineWords(l: { glyph: string | null; title: string; sub: string }, timed = false) {
  return (
    <>
      <b {...(timed ? SAYS_WHEN : undefined)}>
        {l.glyph ? <Icon name={l.glyph} size={12} /> : null}
        {l.title}
      </b>
      <span {...SAYS_WHEN}>{l.sub}</span>
    </>
  );
}

/** A line's time, in the column they all stand in. Called, not drawn. */
function dayLineTime(time: string) {
  return (
    <span className="tpd-tm tabular" {...SAYS_WHEN}>
      {time}
    </span>
  );
}

/** A visit, or someone who comes back, at its time, opening it. Called, not drawn. */
function dayLine(l: TodayZoneLineVM) {
  return l.to ? (
    <a key={l.key} className="tpd-li" {...routeDoor(l.to)} data-kind={l.kind}>
      {dayLineTime(l.time)}
      <span className="tpd-tx">{dayLineWords(l)}</span>
    </a>
  ) : (
    <div key={l.key} className="tpd-li" data-kind={l.kind} data-open={l.open || undefined}>
      {dayLineTime(l.time)}
      <span className="tpd-tx">{dayLineWords(l)}</span>
    </div>
  );
}

/** What Offer it came to: offered, to how many and whether it waits for the owner's OK, or not, and why. */
type Offered = { ok: true; people: number; waits: boolean } | { ok: false; why: string };

/**
 * Offer an hour a cancellation freed to the people who asked and never booked (the edge's freed-time offer, decision 0082,
 * through POST calendar/freed): its batch waits for the owner's OK in To decide where the sequence asks first, else it goes
 * on its own, as its sequence's mode says; or it says why it could not.
 */
async function offerFreed(freed: NonNullable<TodayZoneLineVM["freed"]>): Promise<Offered> {
  // The visit alone: the edge reads the time it frees from the visit itself (contracts freedTimeOf).
  const r = await api()("POST calendar/freed", { body: { visit_id: freed.visitId } });
  if (!r.ok) return { ok: false, why: r.message };
  return r.data.offered ? { ok: true, people: r.data.people, waits: r.data.waits } : { ok: false, why: r.data.why };
}

/** What an offer says once made: in To decide where it waits for the owner, else to how many it went. */
const offeredWords = (o: Extract<Offered, { ok: true }>) => (o.waits ? P.offer.done : P.offer.sent(o.people));

/**
 * An hour a cancellation freed: its time, how long and who cancelled, and Offer it, which says what it came to. A press
 * told to the day (`onOffered`), which keeps the line while the runs read again with its batch in them.
 */
function OpenLine({ line, onOffered }: { line: TodayZoneLineVM; onOffered: (visitId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Offered | null>(null);
  const press = async () => {
    if (!line.freed) return;
    setBusy(true);
    const r = await offerFreed(line.freed);
    setBusy(false);
    setSaid(r);
    if (r.ok) onOffered(line.freed.visitId);
  };
  const sub = said ? (said.ok ? offeredWords(said) : said.why) : line.sub;
  return (
    <div className="tpd-li" data-kind="open" data-open="true" data-testid="today-day-open">
      {dayLineTime(line.time)}
      <span className="tpd-tx">{dayLineWords({ ...line, sub }, true)}</span>
      {line.freed && !said?.ok ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => void press()}
          data-testid="today-day-offer"
          {...gate("approve", "offer a freed time")}
        >
          {P.offer.act}
        </Button>
      ) : null}
    </div>
  );
}

/** A run that went out today, at the time it went: what it has earned so far, opening it. Called, not drawn. */
function wentOutRow({ run, at }: WentOut) {
  return (
    <a
      key={run.id}
      className="tpd-li"
      data-past="true"
      {...routeDoor(runRoute(run.id, run.sequence_id))}
      data-testid="today-day-went"
    >
      {dayLineTime(at)}
      <span className="tpd-tx">
        {dayLineWords({
          glyph: "check",
          title: runTitleOf(run),
          sub: [P.wentOut(at, !!run.playbook_id), TODAY_HELPERS.runs(run).done.counts].filter(Boolean).join(" · "),
        })}
      </span>
    </a>
  );
}

/**
 * A send going today, in the rest of the day: its time, its name and who it reaches, which open its run, and Stop, asked as
 * Sent asks it.
 */
function SendRow({
  row: g,
  clock,
  acting,
  flash,
}: {
  row: GoingTodayRowVM;
  clock: ReturnType<typeof workspaceClock>;
  acting: ReturnType<typeof useRunsActing>;
  flash: (f: Flash) => void;
}) {
  const [asking, setAsking] = useState(false);
  const stopWords = runStopWords("scheduled");
  return (
    <div className="tpd-li" data-testid="today-day-send">
      {dayLineTime(clock ? clock.time(g.atMs) : "")}
      {/* Its words open its run, over Today, as Going today's row did. */}
      <a className="tpd-tx" {...routeDoor(g.to)} data-testid="today-day-send-open">
        {dayLineWords({ glyph: "bolt", title: g.name, sub: g.sentence })}
      </a>
      <Button
        variant="secondary"
        size="sm"
        disabled={acting.busy(g.key)}
        aria-busy={acting.busy(g.key) || undefined}
        onClick={() => setAsking(true)}
        {...gate("approve", "stop a send")}
      >
        {GOING_TODAY_WORDS.stop}
      </Button>
      {asking ? (
        <Confirm
          block
          danger
          question={stopWords.question({ name: g.name })}
          detail={stopWords.detail}
          yes={stopWords.yes}
          onYes={() => {
            setAsking(false);
            void acting.run(g.key, () => stopGoing(g, flash));
          }}
          onNo={() => setAsking(false)}
          testid="today-day-stop"
        />
      ) : null}
    </div>
  );
}

/** One line of the rest of the day at its place: the day's own, a send going, or a run that went out. */
type DayItem = { key: string; at: number } & (
  { line: TodayZoneLineVM } | { send: GoingTodayRowVM } | { went: WentOut }
);

/** Whether a line stays on a phone: one that asks for something or comes back; a plain visit is the Calendar's. */
const staysOnAPhone = (i: DayItem) => !("line" in i) || i.line.kind !== "visit";

/** A line that asks for something or comes back: a send's Stop, a freed hour's Offer it, someone back from Not now. */
const asks = (i: DayItem) => "send" in i || ("line" in i && (i.line.kind === "back" || !!i.line.freed));

/**
 * A desk's five lines: every one that asks for something or comes back, never cut for a seat, and the others at their
 * times in the seats left. The visits past them are the Calendar's, which the foot says.
 */
function onADesk(items: readonly DayItem[]): DayItem[] {
  const rest = items.filter((i) => !asks(i)).slice(0, Math.max(0, LINES_MAX - items.filter(asks).length));
  return items.filter((i) => asks(i) || rest.includes(i));
}

/** The day's head: its name, how it stands, and the door to the Calendar. Called, not drawn. */
function dayHead(title: string, note: string) {
  return (
    <div className="tpd-head">
      <h2 className="tpd-title" id="today-day-title">
        {title}
      </h2>
      {note ? (
        <span className="tpd-note" {...SAYS_WHEN}>
          {note}
        </span>
      ) : null}
      <a className="tpd-door" {...routeDoor("calendar")}>
        {P.calendar}
        <Icon name="chevron" size={12} />
      </a>
    </div>
  );
}

/** The day with no calendar linked (the fresh workspace's canvas): the one row that links one. Called, not drawn. */
function linkRow() {
  return (
    <div className="tpd-li" data-kind="link" key="link">
      <span className="tpd-tm" />
      <span className="tpd-tx">{dayLineWords({ glyph: "calendar", title: P.link.title, sub: P.link.sub })}</span>
      <Button variant="secondary" size="sm" {...routeDoor(CALENDAR_SETTING_ROUTE)} data-testid="today-day-link">
        {P.link.act}
      </Button>
    </div>
  );
}

/** A line of the day drawn: the day's own, an hour freed with Offer it, a send with Stop, or a run that went out. */
function drawItem(
  i: DayItem,
  ports: {
    clock: ReturnType<typeof workspaceClock>;
    acting: ReturnType<typeof useRunsActing>;
    flash: (f: Flash) => void;
    onOffered: (visitId: string) => void;
  },
) {
  if ("send" in i)
    return <SendRow key={i.key} row={i.send} clock={ports.clock} acting={ports.acting} flash={ports.flash} />;
  if ("went" in i) return wentOutRow(i.went);
  return i.line.kind === "open" ? <OpenLine key={i.key} line={i.line} onOffered={ports.onOffered} /> : dayLine(i.line);
}

/**
 * The rest of the day at its places, the day's own lines among the sends going (and, with no calendar, the runs that went),
 * and what the foot says: on a desk five lines, every one that asks for something among them, on a phone the ones that ask
 * for something or come back; the visits past them are the Calendar's, said with what is over, or once the day has turned
 * how today went.
 */
function dayLinesOf(
  zone: TodayZoneDayVM | null,
  runs: { going: GoingTodayRowVM[]; wentOut: ReturnType<typeof runsDoneToday> },
  at: {
    phone: boolean;
    tz: string;
    day: TodayDayVM | null;
    vm: TodayVM | undefined;
    offered: (l: TodayZoneLineVM) => boolean;
  },
): { kept: DayItem[]; foot: string } {
  // On a calendar's day what went out is over, as the visits before now are: folded into "N earlier", never a seat taken
  // from what is coming (the canvas). With no calendar it is the day's own say of the runs.
  const fold = !!zone && !zone.tomorrow;
  const items: DayItem[] = [
    // An hour already offered (its batch is in the runs) is To decide's or gone: never offered twice.
    ...(zone?.lines ?? []).filter((l) => !at.offered(l)).map((line) => ({ key: line.key, at: line.at, line })),
    ...runs.going.map((g) => ({ key: g.key, at: hoursOnTheClock(at.tz, g.atMs), send: g })),
    ...(fold
      ? []
      : runs.wentOut.rows.map((w) => ({ key: `went-${w.run.id}`, at: hoursOnTheClock(at.tz, w.atMs), went: w }))),
  ].sort((a, b) => a.at - b.at);
  const kept = at.phone ? items.filter(staysOnAPhone) : onADesk(items);
  const cut = items.filter((i) => !kept.includes(i) && "line" in i && i.line.kind === "visit").length;
  const word = at.day?.word ?? at.vm?.word ?? "appointment";
  if (!zone?.tomorrow) {
    const earlier = (zone?.earlier ?? 0) + (fold ? runs.wentOut.count : 0);
    return { kept, foot: todayDayFoot(earlier, (zone?.more ?? 0) + cut, word) };
  }
  const today = at.day?.frames.find((f) => f.today) ?? null;
  const answered = at.vm?.figures.find((f) => f.id === "answered") ?? null;
  return { kept, foot: todayWentFoot(today, zone.toMark, answered, word) };
}

/** The day's bar, with now on it; tomorrow's has no now, and says none. Called, not drawn. */
function dayBar(zone: TodayZoneDayVM, clock: ReturnType<typeof workspaceClock>) {
  const bar = zone.bar;
  if (!bar) return null;
  return (
    <Meter
      className="tpd-bar"
      parts={barParts(bar)}
      mark={bar.now}
      aria-label={[zone.note, bar.now !== null && clock ? `now ${clock.time(Date.now())}` : ""]
        .filter(Boolean)
        .join("; ")}
      {...(bar.now === null ? {} : SAYS_WHEN)}
    />
  );
}

export function DayZone() {
  // The runs it says: a run made, canceled or sending; the calendar's weeks; who comes back, which is Today's own read.
  useMoved(["broadcasts", "calendar", "today"]);
  const day = useDayVm();
  const calRead = useSurface("calendar");
  // It stands where the strip stood, drawn once the Calendar's weeks are in (client/page-speed.ts).
  usePartShown("today", "strip", calRead !== undefined);
  const vm = useSurface("today");
  const phone = useTodayOnPhone();
  const [toastNode, flash] = useToast();
  const acting = useRunsActing();
  // The freed hours offered from here this visit: the line stays, saying what came of it, once the runs hold its batch.
  const [offeredHere, setOfferedHere] = useState<readonly string[]>([]);
  const cal = borrowed<CalendarSurface>("__CALENDAR");
  // No calendar linked: the one row that links one (a read that failed is the Calendar's to say, not this), under what
  // goes on its own today and what went out, which a workspace with no calendar still has.
  const noCalendar = cal?.vm?.feed.state === "none";
  const zone = noCalendar
    ? null
    : todayZoneDay((cal?.vm as CalendarLike | undefined) ?? null, day, vm?.back ?? [], Date.now());
  const runs = { going: zone?.tomorrow ? [] : goingNow(), wentOut: runsDoneToday() };
  if (!zone && !noCalendar && !runs.going.length && !runs.wentOut.rows.length) return toastNode;
  const clock = workspaceClock();
  const offered = offeredHours();
  const { kept, foot } = dayLinesOf(zone, runs, {
    phone,
    tz: clock?.zone() ?? "UTC",
    day,
    vm,
    offered: (l) => !!l.freed && offered.has(l.freed.visitId) && !offeredHere.includes(l.freed.visitId),
  });
  const onOffered = (visitId: string) => setOfferedHere((was) => (was.includes(visitId) ? was : [...was, visitId]));
  return (
    <section className="tpd tz-day" data-testid="today-day" aria-labelledby="today-day-title">
      {dayHead(zone?.title ?? P.day, noCalendar ? P.link.note : (zone?.note ?? ""))}
      {zone?.cells.length ? dayCells(zone.cells) : null}
      {zone ? dayBar(zone, clock) : null}
      {kept.length || noCalendar ? (
        <div className="tpd-rest" data-testid="today-day-rest">
          {kept.map((i) => drawItem(i, { clock, acting, flash, onOffered }))}
          {noCalendar ? linkRow() : null}
        </div>
      ) : null}
      {foot ? (
        <a className="tpd-more" {...routeDoor("calendar")} data-testid="today-day-foot">
          {foot}
        </a>
      ) : null}
      {toastNode}
    </section>
  );
}
