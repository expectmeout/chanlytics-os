/**
 * A time asked for by text (decision 0061; his calls D4 and D5, 9 Nov 2026): what they said, the time on its day among what
 * stands there, what they will get, and one press that says yes and tells them, with Undo the whole of it. Another time offers the
 * business's real open times, one or two picked, and the words ready. A time no longer held says so, and offering another leads.
 * Both answers wait out the grace before anything is said to anyone: the answer has no undo of its own, so Undo is its never
 * being sent.
 */
import { useState, type ReactNode } from "react";
import {
  BOOKING_REQUEST_WORDS,
  NEED_YOU_WORDS as W,
  bookingRequestCardOf,
  clockInZone,
  otherTimeWords,
  slotNear,
} from "@chanlytics/contracts";
import { afterSlotWords, dayStripOf, stripHour } from "./moment";
import { commitVerb } from "@/bridge/verbs/commit";
import { answerRequest } from "../../../booking-request";
import { Button } from "../../../kit";
import { appNavigate, gate } from "../../shell";
import { SayToAsk } from "./ask-line";
import { rewriteDraft } from "../drafts";
import { Acts, Done, Going, Note, Words, startKind, type WorkProps } from "../parts";
import { dayOfInstant, useOpenTimes, type OpenTime } from "./reads";
import { useRowState } from "../row-state";
import { holdAct, undoSend, useSend } from "../sends";

/** How many times Another time offers. */
const TIMES_OFFERED = 5;
/** How many of them may be offered at once. */
const TIMES_PICKED = 2;

/** The hours from midnight of an instant, in the zone. */
const hourIn = (atMs: number, tz: string): number => {
  const { hh, mm } = clockInZone(tz, atMs);
  return hh + mm / 60;
};

/** The time on its day among what stands there, on the business's hours; nothing where the page holds no such day. */
function DayStrip({ startMs, endMs, tz, gone }: { startMs: number; endMs: number; tz: string; gone: boolean }) {
  const held = dayOfInstant(startMs, tz);
  if (!held) return null;
  const strip = dayStripOf(
    held.hours,
    held.day.blocks.filter((b) => !/cancel/i.test(b.title)),
    { start: hourIn(startMs, tz), end: hourIn(endMs, tz) },
  );
  return (
    <div className="ny-strip" aria-hidden="true">
      <div className="ny-strip-day">
        {strip.busy.map((b, i) => (
          <i key={i} className="ny-strip-part" {...stripSpot(b.from, b.width)} />
        ))}
        <i
          className="ny-strip-part"
          data-slot={gone ? "gone" : "open"}
          {...stripSpot(strip.slot.from, strip.slot.width)}
        />
      </div>
      <div className="ny-strip-hours">
        {strip.hours.map((h) => (
          <span key={h}>{stripHour(h)}</span>
        ))}
      </div>
    </div>
  );
}

/** Where a part stands on the strip: written as it is placed, since a share is no style a sheet can hold. */
const stripSpot = (from: number, width: number) => ({
  ref: (el: HTMLElement | null) => {
    if (!el) return;
    el.style.setProperty("--at", `${from}%`);
    el.style.setProperty("--wide", `${Math.max(width, 1.5)}%`);
  },
});

/** The time they asked for: its tile, its hours and what it is for. */
function Slot({ card }: { card: ReturnType<typeof bookingRequestCardOf> }) {
  return (
    <div className="ny-slot">
      <span className="ny-day-square">
        <small>{card.weekday}</small>
        <b>{card.date}</b>
      </span>
      <span className="ny-slot-words">
        <b>{card.when}</b>
        {card.service ? <span>{card.service}</span> : null}
      </span>
    </div>
  );
}

/** An open time as a sentence offers it: "4:30 PM tomorrow", "10:00 AM on Wed, Nov 11". */
const offerWords = (t: OpenTime): string =>
  /^(today|tomorrow)$/i.test(t.day) ? `${t.time} ${t.day.toLowerCase()}` : `${t.time} on ${t.day}`;

/** A time to offer, as a press to pick it. */
function TimePress({ time, on, onPress }: { time: OpenTime; on: boolean; onPress: () => void }) {
  return (
    <Button variant="secondary" className="ny-time" aria-pressed={on} onClick={onPress}>
      <span>{time.time}</span>
      <small>{time.day}</small>
    </Button>
  );
}

/** The time asked for as this row holds it: its card, its instants and how a sentence says it, where the row has a time. */
function timeAsked(p: WorkProps) {
  const { row, tz } = p;
  const request = row.request;
  const nowMs = Date.now();
  if (!request?.starts_at || !request.ends_at)
    return { card: null, startMs: NaN, endMs: NaN, when: "", service: request?.service ?? null };
  const startMs = Date.parse(request.starts_at);
  const endMs = Date.parse(request.ends_at);
  return {
    card: bookingRequestCardOf(
      {
        id: row.id,
        starts_at: request.starts_at,
        ends_at: request.ends_at,
        service: request.service ?? null,
        expires_at: request.expires_at ?? null,
      },
      tz,
      nowMs,
    ),
    startMs,
    endMs,
    when: slotNear(startMs, tz, nowMs),
    service: request.service ?? null,
  };
}

/** The answer, held for its grace, then said and the words sent, in that order; and what is said to Ask about the words. */
function useRequestAnswer(p: WorkProps, words: string, setMine: (text: string | null) => void) {
  const { row, flash, keep, unkeep } = p;
  const request = row.request;
  const [told, setTold] = useRowState<{ words: string; done: string } | null>(row.id, "told", null);
  const [why, setWhy] = useRowState<string | null>(row.id, "askWhy", null);
  const [asking, setAsking] = useState(false);
  const sending = useSend(row.id);
  const go = (booked: boolean, doneWords: string) => {
    if (!request) return;
    keep(row);
    setTold({ words, done: doneWords });
    holdAct(row.id, {
      who: row.who,
      wire: row.writes?.wire ?? row.channel,
      act: async () => {
        const answered = await answerRequest(request.conversationId, booked, row.who);
        if (!answered.ok) {
          flash({ tone: "danger", msg: <>{answered.message}</> });
          unkeep(row);
          return false;
        }
        const text = words.trim() || answered.reply;
        if (!text) return true;
        const sent = await commitVerb("reply", { conversation_id: request.conversationId, text, who: row.who });
        if (!sent.ok) flash({ tone: "danger", msg: <>{sent.message}</> });
        return sent.ok;
      },
    });
  };
  const undo = async () => {
    await undoSend(row.id);
    setTold(null);
    unkeep(row);
  };
  const say = async (instruction: string) => {
    if (!request) return false;
    setAsking(true);
    setWhy(null);
    const r = await rewriteDraft({ conversationId: request.conversationId, kind: "reply" }, instruction, words);
    setAsking(false);
    if (!r.ok) {
      setWhy(r.why);
      return false;
    }
    setMine(r.words);
    return true;
  };
  return { told, why, asking, sending, go, undo, say };
}

/** Another time: the business's real open times, one or two picked, and the words ready. */
function OtherTimes(p: {
  work: WorkProps;
  when: string;
  service: string | null;
  mine: string | null;
  setMine: (text: string | null) => void;
  answer: ReturnType<typeof useRequestAnswer>;
  onBack: () => void;
}) {
  const { work, mine, setMine, answer } = p;
  const { row, main, may, tz } = work;
  const [picked, setPicked] = useRowState<readonly OpenTime[]>(row.id, "picked", []);
  const open = useOpenTimes(p.service, TIMES_OFFERED, tz);
  const words = mine ?? otherTimeWords(p.when, picked.map(offerWords));
  return (
    <>
      <div className="ny-times">
        {open
          ? open.times.map((t) => {
              const on = picked.some((x) => x.key === t.key);
              return (
                <TimePress
                  key={t.key}
                  time={t}
                  on={on}
                  onPress={() => {
                    setMine(null);
                    setPicked(on ? picked.filter((x) => x.key !== t.key) : [...picked, t].slice(-TIMES_PICKED));
                  }}
                />
              );
            })
          : null}
        <Button variant="secondary" className="ny-time" onClick={() => appNavigate("calendar")}>
          <span>{W.booked.anotherDay}</span>
          <small>{W.booked.calendar}</small>
        </Button>
      </div>
      {open && !open.times.length ? <Note>{W.booked.noneOpen}</Note> : null}
      <Words label={W.booked.theyGet} text={words} who={row.who} onChange={may ? setMine : null} busy={answer.asking} />
      {may ? (
        <SayToAsk
          placeholder={mine !== null ? W.say.tellMore : W.say.tell}
          onSay={answer.say}
          busy={answer.asking}
          why={answer.why}
        />
      ) : null}
      <Acts
        foot={work.foot}
        start={
          <Button variant={startKind(work.foot)} onClick={p.onBack}>
            {W.booked.back}
          </Button>
        }
        end={
          <Button
            variant={main}
            disabled={!picked.length && mine === null}
            onClick={() => answer.go(false, W.booked.offered(row.who))}
            {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
          >
            {W.send}
          </Button>
        }
      />
    </>
  );
}

/** The presses under a time asked for: Confirm and send leads while it is held, offering another once it is not. Called, not drawn. */
function askedActs(p: WorkProps, holds: boolean, a: { confirm: () => void; other: () => void }) {
  const { row, main, may } = p;
  const quiet = startKind(p.foot);
  return holds ? (
    <Acts
      foot={p.foot}
      start={
        <Button variant={quiet} onClick={a.other} data-testid="queue-request-cant">
          {W.booked.anotherTime}
        </Button>
      }
      end={
        <Button
          variant={main}
          disabled={!may}
          onClick={a.confirm}
          data-testid="queue-request-booked"
          {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
          aria-label={`${W.booked.confirm}: ${row.who}`}
        >
          {W.booked.confirm}
        </Button>
      }
    />
  ) : (
    <Acts
      foot={p.foot}
      start={
        <Button
          variant={quiet}
          onClick={a.confirm}
          data-testid="queue-request-booked"
          {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
        >
          {W.booked.confirmAnyway}
        </Button>
      }
      end={
        <Button variant={main} onClick={a.other} data-testid="queue-request-cant">
          {W.booked.offerAnother}
        </Button>
      }
    />
  );
}

/** What stands after the time asked for on its day, where the page holds that day. */
function afterIt(startMs: number, endMs: number, tz: string): string {
  const held = dayOfInstant(startMs, tz);
  return held ? afterSlotWords(held.hours, held.day.blocks, hourIn(endMs, tz), true) : "";
}

/** What the answer came to, where it has been given: counting down with Undo, or done. Called, not drawn. */
function requestEnded(p: WorkProps, answer: ReturnType<typeof useRequestAnswer>, words: string): ReactNode {
  const { row } = p;
  const { s: send, seconds, share } = answer.sending;
  if (send?.state === "gone") return <Done words={answer.told?.done ?? W.sent} foot={p.foot} />;
  if (send?.state !== "going") return null;
  return (
    <>
      {p.foot ? (
        <Words label={W.goingTo(row.who)} text={answer.told?.words ?? words} who={row.who} onChange={null} />
      ) : null}
      <Going
        line={W.booked.telling(row.who, seconds)}
        sub={W.sendingTo(row.who, row.writes?.wire ?? row.channel)}
        share={share}
        act={{ label: W.undo, onPress: () => void answer.undo() }}
        foot={p.foot}
      />
    </>
  );
}

/** Where the time asked for stands: on its day, and whether it is still held. Called, not drawn. */
function askedTime(asked: ReturnType<typeof timeAsked>, tz: string) {
  const { card, startMs, endMs } = asked;
  if (!card) return null;
  return (
    <>
      <Slot card={card} />
      <DayStrip startMs={startMs} endMs={endMs} tz={tz} gone={!card.holds} />
      {card.holds ? (
        <Note tone="ok">
          {[`${BOOKING_REQUEST_WORDS.holds}.`, afterIt(startMs, endMs, tz)].filter(Boolean).join(" ")}
        </Note>
      ) : (
        <Note tone="warn">{`${BOOKING_REQUEST_WORDS.lapsed}.`}</Note>
      )}
    </>
  );
}

/** A time the customer picked by text: Confirm and send, or Another time. */
export function RequestWork(p: WorkProps) {
  const { row, may, tz } = p;
  const [other, setOther] = useRowState(row.id, "other", false);
  const [mine, setMine] = useRowState<string | null>(row.id, "mine", null);
  const asked = timeAsked(p);
  const { when, service, card } = asked;
  // With no time on the row (an older hold), the door drafts the words as it answers.
  const words = mine ?? (when ? BOOKING_REQUEST_WORDS.booked(when, service) : "");
  const answer = useRequestAnswer(p, words, setMine);
  const ended = requestEnded(p, answer, words);
  if (ended) return ended;
  const holds = card?.holds ?? true;
  const confirm = () => answer.go(true, W.booked.done(when));
  const startOther = () => {
    setMine(null);
    setOther(true);
  };
  // Up next on a phone says what they asked for and the one press: the sheet holds the rest.
  if (!p.whole) return askedActs(p, true, { confirm: p.read ?? confirm, other: p.read ?? startOther });
  if (other)
    return (
      <OtherTimes
        work={p}
        when={when}
        service={service}
        mine={mine}
        setMine={setMine}
        answer={answer}
        onBack={() => setOther(false)}
      />
    );
  const says = holds && !!words;
  return (
    <>
      {askedTime(asked, tz)}
      {says ? (
        <Words
          label={W.booked.theyGet}
          text={words}
          who={row.who}
          onChange={may ? setMine : null}
          busy={answer.asking}
        />
      ) : null}
      {says && may ? (
        <SayToAsk
          placeholder={mine !== null ? W.say.tellMore : W.say.tell}
          onSay={answer.say}
          busy={answer.asking}
          why={answer.why}
        />
      ) : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      {askedActs(p, holds, { confirm, other: startOther })}
    </>
  );
}
