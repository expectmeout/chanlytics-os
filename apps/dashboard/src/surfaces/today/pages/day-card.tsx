/**
 * The day (the phone canvas, 28 Oct 2026, on a desk too since the redesign of 1 Nov 2026): its name and how it stands,
 * the visit under way or the next and the one after it, the day as a bar with now on it, then the rest of the day in its
 * order, open: the visits still to come, what goes on its own today with its Stop (decision 0064, which stood apart as
 * Going today on a desk), and the runs that went out, at the time each went (which stood in Your brief's lines). A visit
 * whose person waits on you says so beside it. One derivation (day.tsx useDayVm), drawn where Your brief stood on a desk,
 * beside While you were away, and under Need you on a phone. The rest stood folded behind a line on a phone, so a send's
 * Stop was a press away on the day it mattered.
 */
import { useState } from "react";
import {
  GOING_TODAY_WORDS,
  TODAY_PHONE_WORDS as P,
  appointmentWords,
  clockInZone,
  goingTodayOf,
  runRoute,
  runStopWords,
  runStoppedWords,
  runTitleOf,
  type BroadcastVM,
  type GoingTodayRowVM,
  type TodayDayBarVM,
  type TodayDayItemVM,
} from "@chanlytics/contracts";
import { pageClock, type PageClock } from "@/legacy-bridge/zone";
import { Button, Meter } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { broadcastVerbs, broadcastsRead, refreshPlaybooks, useRunsActing } from "../../waits/run-acts";
import { TODAY_HELPERS } from "../helpers";
import { canDo, gate, refusalFlash, useMoved, useToast, workspaceClock, type Flash } from "../shell";
import { useDayVm } from "./day";

/** How many of the rest of the day it draws: past these, the Calendar holds them, and a line says how many. */
const REST_MAX = 5;

/** The runs that go on their own today, soonest first: a batch held for a stop, a message set for later, a reach-out's run. */
function goingNow(): GoingTodayRowVM[] {
  const runs = (broadcastsRead()?.rows ?? []).map((r) => ({ ...r, title: runTitleOf(r) }));
  return goingTodayOf({ runs, tz: pageClock().zone(), nowMs: Date.now() });
}

/** Stop a run going today: Sent's own cancel, asked as Sent asks it, said in the toast. */
async function stopGoing(row: GoingTodayRowVM, flash: (f: Flash) => void): Promise<void> {
  const api = broadcastVerbs();
  if (!canDo("approve") || !api) return;
  const res = await api.cancel(row.stop.id);
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

/** The runs that went out today, the first two, with the time each went on the business's clock. */
function runsDoneToday(): Array<{ run: StartedRun; at: string; atMs: number }> {
  const all = broadcastsRead()?.rows ?? [];
  const clock = workspaceClock() as PageClock | null;
  if (!clock) return [];
  return all
    .filter(
      (r): r is StartedRun =>
        (r.state === "sent" || r.state === "sending") &&
        !!r.started_at &&
        clock.dayKey(Date.parse(r.started_at)) === clock.dayKey(Date.now()),
    )
    .slice(0, 2)
    .map((run) => ({ run, at: clock.time(Date.parse(run.started_at)), atMs: Date.parse(run.started_at) }));
}

/** A part of the bar, in the kit's Meter's tones: what is over, under way, still to come, and the free time between. */
const BAR_TONE = { past: "rest", now: "ink", next: "open", later: "open", gap: "ground" } as const;

const barParts = (bar: TodayDayBarVM) => bar.parts.map((p) => ({ share: p.share, tone: BAR_TONE[p.phase] }));

/** Who and what, as the strip says it: "Camila Ortiz · Color"; the service alone where nobody is named. */
const visitWhatOf = (b: TodayDayItemVM): string =>
  (b.person ? [b.person.name, b.service] : [b.service]).filter(Boolean).join(" · ");

/** The hours on the business's clock an instant stands at (14.5 is 2:30 PM), so a send takes its place among the visits. */
function hoursOnTheClock(zone: string, atMs: number): number {
  const { hh, mm } = clockInZone(zone, atMs);
  return hh + mm / 60;
}

/** A visit whose person waits on you: the person's standing beside it, in the amber what needs you wears. */
const flagOf = (b: TodayDayItemVM) =>
  b.flag ? (
    <span className="tpd-flag" data-testid="today-day-flag">
      {b.flag}
    </span>
  ) : null;

/** Now (or Next) and the one after it, each its time over who and what, each opening its visit. Called, not drawn. */
function dayCells(first: TodayDayItemVM, second: TodayDayItemVM | null) {
  const now = first.phase === "now";
  return (
    <div className="tpd-cells">
      <a className="tpd-cell" {...routeDoor(first.to)} data-testid="today-day-first">
        <span className="tpd-eyebrow" data-now={now || undefined}>
          {now ? P.now : P.next}
        </span>
        <span className="tpd-when tabular">{now ? first.time : first.start}</span>
        <span className="tpd-what">{visitWhatOf(first)}</span>
        {flagOf(first)}
      </a>
      {second ? (
        <a className="tpd-cell" {...routeDoor(second.to)}>
          <span className="tpd-eyebrow">{now ? P.next : P.then}</span>
          <span className="tpd-when tabular">{second.start}</span>
          <span className="tpd-what">{visitWhatOf(second)}</span>
          {flagOf(second)}
        </a>
      ) : null}
    </div>
  );
}

/** A visit still to come, in the rest of the day: its time, who and what, opening it. Called, not drawn. */
function dayVisitRow(v: TodayDayItemVM) {
  return (
    <a key={v.id} className="tpd-li" {...routeDoor(v.to)}>
      <span className="tpd-tm tabular">{v.start}</span>
      <span className="tpd-tx">
        <b>{v.person ? v.person.name : v.service}</b>
        <span>{[v.person ? v.service : "", v.dur].filter(Boolean).join(" · ")}</span>
        {flagOf(v)}
      </span>
    </a>
  );
}

/** A run that went out today, at the time it went: what it has earned so far, opening it. Called, not drawn. */
function wentOutRow({ run, at }: { run: StartedRun; at: string }) {
  return (
    <a
      key={run.id}
      className="tpd-li"
      data-past="true"
      {...routeDoor(runRoute(run.id, run.sequence_id))}
      data-testid="today-day-went"
    >
      <span className="tpd-tm tabular">{at}</span>
      <span className="tpd-tx">
        <b>
          <Icon name="check" size={12} />
          {runTitleOf(run)}
        </b>
        <span>
          {[P.wentOut(at, !!run.playbook_id), TODAY_HELPERS.runs(run).done.counts].filter(Boolean).join(" · ")}
        </span>
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
      <span className="tpd-tm tabular">{clock ? clock.time(g.atMs) : ""}</span>
      {/* Its words open its run, over Today, as Going today's row did. */}
      <a className="tpd-tx" {...routeDoor(g.to)} data-testid="today-day-send-open">
        <b>
          <Icon name="bolt" size={12} />
          {g.name}
        </b>
        <span>{g.sentence}</span>
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

/** One of the rest of the day, a visit, a send or a run that went out, at its place in the day. */
type RestItem = { key: string; at: number } & (
  { visit: TodayDayItemVM } | { send: GoingTodayRowVM } | { went: { run: StartedRun; at: string } }
);

export function TodayDay() {
  // The runs it says: a run made, canceled or sending.
  useMoved(["broadcasts"]);
  const day = useDayVm();
  // It stands where the strip stood, drawn once the Calendar's weeks are in (client/page-speed.ts).
  usePartShown("today", "strip", useSurface("calendar") !== undefined);
  const [toastNode, flash] = useToast();
  const acting = useRunsActing();
  const today = day?.frames.find((f) => f.today) ?? null;
  const going = goingNow();
  const wentOut = runsDoneToday();
  // A workspace with no calendar read still has its sends: the day stands for what goes on its own and what went out.
  if (!today && !going.length && !wentOut.length) return toastNode;
  const clock = workspaceClock();
  const zone = clock?.zone() ?? "UTC";
  const timed = today ? today.items.filter((i) => !i.allDay) : [];
  const first = timed.find((i) => i.phase === "now") ?? timed.find((i) => i.phase === "next") ?? null;
  const after = first ? timed.slice(timed.indexOf(first) + 1).filter((i) => i.phase !== "past") : [];
  const second = after[0] ?? null;
  const rest: RestItem[] = [
    ...wentOut.map((w) => ({ key: `went-${w.run.id}`, at: hoursOnTheClock(zone, w.atMs), went: w })),
    ...after.slice(1).map((v) => ({ key: v.id, at: v.at ? v.at.from : 0, visit: v })),
    ...going.map((g) => ({ key: g.key, at: hoursOnTheClock(zone, g.atMs), send: g })),
  ].sort((a, b) => a.at - b.at);
  const drawn = rest.slice(0, REST_MAX);
  // The visits past those drawn, and past the day's own cap, are the Calendar's: a line says how many.
  const W = appointmentWords(day?.word ?? "appointment");
  const more = rest.slice(REST_MAX).filter((r) => "visit" in r).length + (today ? today.more : 0);
  return (
    <section className="tpd" data-testid="today-day" aria-labelledby="today-day-title">
      <div className="tpd-head">
        <h2 className="tpd-title" id="today-day-title">
          {P.day}
        </h2>
        {today && day ? (
          <span className="tpd-note">{TODAY_HELPERS.dayNote(today, day.nextOpening, day.word)}</span>
        ) : null}
        <a className="tpd-door" {...routeDoor("calendar")}>
          {P.calendar}
          <Icon name="chevron" size={12} />
        </a>
      </div>
      {first ? dayCells(first, second) : null}
      {today?.bar && day ? (
        <Meter
          className="tpd-bar"
          parts={barParts(today.bar)}
          mark={today.bar.now}
          aria-label={[
            TODAY_HELPERS.dayNote(today, day.nextOpening, day.word),
            clock ? `now ${clock.time(Date.now())}` : "",
          ]
            .filter(Boolean)
            .join("; ")}
        />
      ) : null}
      {drawn.length || more ? (
        <div className="tpd-rest" data-testid="today-day-rest">
          {drawn.map((r) =>
            "send" in r ? (
              <SendRow key={r.key} row={r.send} clock={clock} acting={acting} flash={flash} />
            ) : "went" in r ? (
              wentOutRow(r.went)
            ) : (
              dayVisitRow(r.visit)
            ),
          )}
          {more ? (
            <a className="tpd-li tpd-li-more" {...routeDoor("calendar")}>
              {P.dayMore(more, W.one, W.many)}
            </a>
          ) : null}
        </div>
      ) : null}
      {toastNode}
    </section>
  );
}
