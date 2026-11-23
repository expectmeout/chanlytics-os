/**
 * The time a request asked for (00691; the canvas's board "Ask for a time: you confirm it"): its day on a square, its
 * hours and what it is for, and how long it is held; answered Booked it or Can't, as a time asked in a chat is, by the
 * same door. A time someone else was booked for since says so and leads with Can't. One past its day is never booked
 * blind: it says so, and the reply below offers what is open now. Nothing reaches them by either press: the reply
 * that tells them is the request's own, below.
 */
import { BOOKING_REQUEST_WORDS, bookingRequestCardOf, slotNear, type FormRequestDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Panel } from "../../kit/panel/panel";
import { gate } from "../shell";
import type { RequestPage } from "./use-request";
import { REQUEST_WORDS } from "./words";

const TIME_WORDS = REQUEST_WORDS.time;

type TimeAskedDto = NonNullable<FormRequestDto["time"]>;

/** The two answers, Booked it first unless the time was booked for someone else since. */
function Answers({ page, cantLeads }: { page: RequestPage; cantLeads: boolean }) {
  const busy = page.busy !== null;
  const booked = (
    <Button
      size="sm"
      variant={cantLeads ? undefined : "primary"}
      disabled={busy}
      onClick={page.book}
      data-testid="ix-rq-book"
      {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
    >
      {cantLeads ? TIME_WORDS.taken.too : BOOKING_REQUEST_WORDS.booked_it}
    </Button>
  );
  const cant = (
    <Button
      size="sm"
      variant={cantLeads ? "primary" : undefined}
      disabled={busy}
      onClick={page.cant}
      data-testid="ix-rq-cant"
      {...gate("approve", BOOKING_REQUEST_WORDS.gate)}
    >
      {BOOKING_REQUEST_WORDS.cant_it}
    </Button>
  );
  return (
    <div className="ix-rq-acts">
      {cantLeads ? (
        <>
          {cant}
          {booked}
        </>
      ) : (
        <>
          {booked}
          {cant}
        </>
      )}
    </div>
  );
}

/** How the time stands, as its card heads it, and how long it is held. */
function timeStandingOf(time: TimeAskedDto, nowMs: number): { head: string; held: string; gone: boolean } {
  if (time.status === "cancelled") return { head: TIME_WORDS.cant, held: TIME_WORDS.notHeld, gone: true };
  if (time.status !== "proposed") return { head: TIME_WORDS.booked, held: TIME_WORDS.onCalendar, gone: false };
  if (!time.holds) return { head: TIME_WORDS.asked, held: TIME_WORDS.notHeld, gone: true };
  const until = time.expires_at ? slotNear(Date.parse(time.expires_at), time.timezone, nowMs) : null;
  return { head: TIME_WORDS.asked, held: until ? TIME_WORDS.held(until) : TIME_WORDS.onCalendar, gone: false };
}

/** The time a request asked for, and its two answers while it waits on them. */
export function TimeAsked({ page, time, nowMs }: { page: RequestPage; time: TimeAskedDto; nowMs: number }) {
  const card = bookingRequestCardOf(
    {
      id: time.appointment_id,
      starts_at: time.starts_at,
      ends_at: time.ends_at,
      service: time.service,
      expires_at: time.expires_at,
    },
    time.timezone,
    nowMs,
  );
  const standing = timeStandingOf(time, nowMs);
  const waits = time.status === "proposed" && time.holds;
  const taken = waits && time.taken_by !== null;
  return (
    <>
      {taken ? (
        <Panel variant="inset" size="sm" className="ix-rq-waits" data-testid="ix-rq-taken">
          <strong>{TIME_WORDS.taken.title}</strong>
          <p>{TIME_WORDS.taken.body(time.taken_by ?? "", card.near)}</p>
          <Answers page={page} cantLeads />
        </Panel>
      ) : null}
      {time.status === "proposed" && !time.holds ? (
        <Panel variant="inset" size="sm" className="ix-rq-waits" data-testid="ix-rq-lapsed">
          <strong>{TIME_WORDS.lapsed.title}</strong>
          <p>
            {TIME_WORDS.lapsed.body(time.expires_at ? slotNear(Date.parse(time.expires_at), time.timezone, nowMs) : "")}
          </p>
        </Panel>
      ) : null}
      <Panel
        variant="pane"
        size="sm"
        className="ix-rq-time"
        data-testid="ix-rq-time"
        data-gone={standing.gone || undefined}
      >
        <span className="ix-rq-time-head">{standing.head}</span>
        <div className="ix-rq-slot">
          <span className="ix-rq-day" aria-label={card.dayLong}>
            <small>{card.weekday}</small>
            <b>{card.date}</b>
          </span>
          <span className="ix-rq-slot-words">
            <b>{card.hours}</b>
            {card.service ? <span>{card.service}</span> : null}
            <em>{standing.held}</em>
          </span>
        </div>
        {waits && !taken ? (
          <>
            <Answers page={page} cantLeads={false} />
            <p className="ix-rq-note">{TIME_WORDS.foot}</p>
          </>
        ) : null}
      </Panel>
    </>
  );
}
