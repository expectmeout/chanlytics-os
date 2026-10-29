/**
 * The day on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md §5): the
 * date and how the day stands beside it, the visit under way or the next and the one after it, the day as a bar with now on
 * it, then one line for the rest of the day, which opens in place: the visits still to come, what goes on its own today
 * with its Stop (Going today's band on a desk, decision 0064), the runs that went out, and the Calendar's door. It stands
 * where the strip stands on a desk (strip.tsx), from the same one derivation (day.tsx useDayVm), and opens by itself when
 * nothing waits on the owner: on a calm day the day is the page.
 */
import { useState } from "react";
import {
  GOING_TODAY_WORDS,
  TODAY_PHONE_WORDS as P,
  appointmentWords,
  runRoute,
  runStopWords,
  runTitleOf,
  type GoingTodayRowVM,
  type TodayDayBarVM,
  type TodayDayFrameVM,
  type TodayDayItemVM,
} from "@chanlytics/contracts";
import { Button, Meter } from "../../kit";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { useRunsActing } from "../../waits/run-acts";
import { TODAY_HELPERS } from "../helpers";
import { gate, useMoved, useToast, workspaceClock, type Flash } from "../shell";
import { runsDoneToday } from "./card";
import { useDayVm } from "./day";
import { goingNow, stopGoing } from "./going-today";

/** A part of the bar, in the kit's Meter's tones: what is over, under way, still to come, and the free time between. */
const BAR_TONE = { past: "rest", now: "ink", next: "open", later: "open", gap: "ground" } as const;

const barParts = (bar: TodayDayBarVM) => bar.parts.map((p) => ({ share: p.share, tone: BAR_TONE[p.phase] }));

/** Who and what, as the strip says it: "Camila Ortiz · Color"; the service alone where nobody is named. */
const visitWhatOf = (b: TodayDayItemVM): string =>
  (b.person ? [b.person.name, b.service] : [b.service]).filter(Boolean).join(" · ");

/** The hours on the business's clock an instant stands at (14.5 is 2:30 PM), so a send takes its place among the visits. */
function hoursOnTheClock(zone: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(atMs)
    .reduce<Record<string, string>>((o, p) => ({ ...o, [p.type]: p.value }), {});
  return Number(parts.hour) + Number(parts.minute) / 60;
}

/** The date beside the note: the frame's label without the word Today, which the page already is. */
const dayDateOf = (f: TodayDayFrameVM): string => f.label.replace(/^Today · /, "");

/** One of the day's rest, a visit or a send, at its place in the day. */
type RestItem = { key: string; at: number } & ({ visit: TodayDayItemVM } | { send: GoingTodayRowVM });

/** Now (or Next) and the one after it, each its time over who and what, each opening its visit. Called, not drawn. */
function dayCells(first: TodayDayItemVM, second: TodayDayItemVM | null) {
  const now = first.phase === "now";
  return (
    <div className="tpd-cells">
      <a className="tpd-cell" {...routeDoor(first.to)} data-testid="today-day-first">
        <span className="tpd-eyebrow">{now ? P.now : P.next}</span>
        <span className="tpd-when tabular">{now ? first.time : first.start}</span>
        <span className="tpd-what">{visitWhatOf(first)}</span>
      </a>
      {second ? (
        <a className="tpd-cell" {...routeDoor(second.to)}>
          <span className="tpd-eyebrow">{now ? P.next : P.then}</span>
          <span className="tpd-when tabular">{second.start}</span>
          <span className="tpd-what">{visitWhatOf(second)}</span>
        </a>
      ) : null}
    </div>
  );
}

/** A visit still to come, in the day's rest: its time, who and what, opening it. Called, not drawn. */
function dayVisitRow(v: TodayDayItemVM) {
  return (
    <a key={v.id} className="tpd-li" {...routeDoor(v.to)}>
      <span className="tpd-tm tabular">{v.start}</span>
      <span className="tpd-tx">
        <b>{v.person ? v.person.name : v.service}</b>
        <span>{[v.person ? v.service : "", v.dur].filter(Boolean).join(" · ")}</span>
      </span>
    </a>
  );
}

/** A send going today, in the day's rest: its time, its name and who it reaches, and Stop, asked as Sent asks it. */
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
      <span className="tpd-tx">
        <b>{g.name}</b>
        <span>{g.sentence}</span>
      </span>
      <Button
        variant="quiet"
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

export function TodayPhoneDay({ openByItself }: { openByItself: boolean }) {
  // The runs it says: a run made, canceled or sending.
  useMoved(["broadcasts"]);
  const day = useDayVm();
  // It stands where the strip stands, drawn once the Calendar's weeks are in (client/page-speed.ts).
  usePartShown("today", "strip", useSurface("calendar") !== undefined);
  const [toastNode, flash] = useToast();
  const acting = useRunsActing();
  const [opened, setOpened] = useState<boolean | null>(null);
  const today = day?.frames.find((f) => f.today) ?? null;
  const going = goingNow();
  const wentOut = runsDoneToday();
  if (!day || (!today && !going.length)) return toastNode;
  const clock = workspaceClock();
  const zone = clock?.zone() ?? "UTC";
  const timed = today ? today.items.filter((i) => !i.allDay) : [];
  const first = timed.find((i) => i.phase === "now") ?? timed.find((i) => i.phase === "next") ?? null;
  const after = first ? timed.slice(timed.indexOf(first) + 1).filter((i) => i.phase !== "past") : [];
  const second = after[0] ?? null;
  const visits = after.slice(1);
  const rest: RestItem[] = [
    ...visits.map((v) => ({ key: v.id, at: v.at ? v.at.from : 0, visit: v })),
    ...going.map((g) => ({ key: g.key, at: hoursOnTheClock(zone, g.atMs), send: g })),
  ].sort((a, b) => a.at - b.at);
  const W = appointmentWords(day.word);
  const more = visits.length + (today ? today.more : 0);
  const restLine = P.dayRest(
    more,
    going.map((g) => ({ name: g.name, clock: clock ? clock.time(g.atMs) : "" })),
    W.many,
    W.one,
  );
  const hasRest = rest.length > 0 || wentOut.length > 0;
  const open = hasRest && (opened ?? openByItself);
  return (
    <section className="tpd" data-testid="today-day" aria-label={today ? dayDateOf(today) : P.calendar}>
      {today ? (
        <div className="tpd-head">
          <span className="tpd-date">{dayDateOf(today)}</span>
          <span className="tpd-note">{TODAY_HELPERS.dayNote(today, day.nextOpening, day.word)}</span>
        </div>
      ) : null}
      {first ? dayCells(first, second) : null}
      {today?.bar ? (
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
      {hasRest ? (
        <Button
          variant="quiet"
          className="tpd-more"
          aria-expanded={open}
          onClick={() => setOpened(!open)}
          data-testid="today-day-more"
        >
          <span className="tpd-more-words">{restLine ?? wentOut.map(({ run }) => runTitleOf(run)).join(" · ")}</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
        </Button>
      ) : null}
      {open ? (
        <div className="tpd-rest" data-testid="today-day-rest">
          {wentOut.map(({ run, at }) => (
            <a key={run.id} className="tpd-li" {...routeDoor(runRoute(run.id, run.sequence_id))}>
              <span className="tpd-tm tabular">{at}</span>
              <span className="tpd-tx">
                <b>{runTitleOf(run)}</b>
                <span>{[P.wentOut(at), TODAY_HELPERS.runs(run).done.counts].filter(Boolean).join(" · ")}</span>
              </span>
            </a>
          ))}
          {rest.map((r) =>
            "send" in r ? (
              <SendRow key={r.key} row={r.send} clock={clock} acting={acting} flash={flash} />
            ) : (
              dayVisitRow(r.visit)
            ),
          )}
          {today?.moreLine ? <span className="tpd-li tpd-li-more">{today.moreLine}</span> : null}
          <a className="tpd-li tpd-foot" {...routeDoor("calendar")}>
            <span>{P.calendar}</span>
            <Icon name="chevron" size={13} />
          </a>
        </div>
      ) : null}
      {toastNode}
    </section>
  );
}
