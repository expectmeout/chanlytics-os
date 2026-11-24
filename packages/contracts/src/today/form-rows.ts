/**
 * Today's rows for a business's own forms (00680; the Forms plan, 3.5 and 3.10): a request nobody has answered, a
 * person waiting on a reply, and a form's pile of entries held for a look that nobody has looked at in three days,
 * which nobody waits on. Apart from the queue (queue.ts) so each holds one thing: the queue orders and counts, and
 * these say what a form's row is. Pure.
 */
import { BOOKING_REQUEST_WORDS, slotShort } from "../calendar/visit/booking-request";
import { formatWaited } from "../conversations/thread-clock";
import { initialsOf } from "../conversations/thread-contact";
import { formsRouteOf, requestAddress } from "../forms/address";
import type { FormHeldDto, FormOpenRequestDto } from "../forms/dtos";
import { NEED_YOU_WORDS } from "../need-you/words";
import { DAY_MS } from "../shared/time";
import type { TodayFacts } from "./facts";
import type { TodayQueueRowVM } from "./vm";

/**
 * A request sent through a form that nobody has answered (00680): who asked, in their own words, how long ago and
 * through which form, with one door, the request where it is answered. A person waiting on a reply, so it stands with
 * them by Need you's order and in its one count. A reply that left and never reached them says so, as a failed reply
 * to anyone does.
 */
/** Where a request's time stands, as its row says it (F3): held for the owner's answer, past its day, or answered. */
function timeStatusOf(time: NonNullable<FormOpenRequestDto["time"]>): string {
  const { form } = NEED_YOU_WORDS;
  if (time.holds) return form.timeHeld;
  if (time.status === "proposed") return form.timeLapsed;
  return time.status === "cancelled" ? form.timeCant : form.timeBooked;
}

function requestRow(request: FormOpenRequestDto, todayFacts: TodayFacts): TodayQueueRowVM {
  const asker = request.name?.trim() || NEED_YOU_WORDS.form.someone;
  const waitedMs = Math.max(0, todayFacts.now.getTime() - Date.parse(request.created_at));
  const time = request.time ?? null;
  const status = time
    ? timeStatusOf(time)
    : request.phone_only
      ? NEED_YOU_WORDS.form.phoneOnly
      : NEED_YOU_WORDS.form.status;
  // A time asked for is said first, as a time asked in a chat is: "Asked for Sat, Nov 28, 11:00 AM · Balayage".
  const timeLine = time
    ? BOOKING_REQUEST_WORDS.hold(slotShort(Date.parse(time.starts_at), time.timezone), time.service)
    : null;
  return {
    id: `q-f-${request.id}`,
    kind: "form",
    conversationId: null,
    callId: null,
    person_id: request.person_id,
    who: asker,
    initials: initialsOf(asker),
    channel: "Form",
    // A site's form says the site it is on (00709): "Consultation · lumasalon.com".
    via: request.site ? `${request.heading} · ${request.site}` : request.heading,
    when: `waited ${formatWaited(waitedMs)}`,
    // A reply that left and never reached them is said as a failed reply to anyone is, in the house's one sentence.
    sentence: request.unreached ? NEED_YOU_WORDS.failed.sentence : (timeLine ?? (request.words || request.heading)),
    quoted: !request.unreached && !timeLine && !!request.words,
    status: [status],
    tone: "escalated",
    warn: request.unreached,
    cta: { label: NEED_YOU_WORDS.form.open, to: requestAddress(request.id) },
    also: null,
    waitedMs,
  };
}

/**
 * One form's entries held for a look that nobody has looked at in three days (00680; the Forms plan, 3.10): the form,
 * how many, how long nobody has looked, and one door, the form's held pile. A held entry has no person yet, so nobody
 * is waiting on it: it stands with what was found, after everyone who is, and in no count.
 */
function heldPileRow(held: FormHeldDto, todayFacts: TodayFacts): TodayQueueRowVM {
  const waitedMs = Math.max(0, todayFacts.now.getTime() - Date.parse(held.oldest_at));
  return {
    id: `q-fh-${held.form_id}`,
    kind: "form_held",
    conversationId: null,
    callId: null,
    person_id: null,
    who: held.heading.trim() || NEED_YOU_WORDS.formHeld.aForm,
    initials: "",
    channel: "Form",
    when: `waited ${formatWaited(waitedMs)}`,
    sentence: NEED_YOU_WORDS.formHeld.sentence(held.held, Math.floor(waitedMs / DAY_MS)),
    quoted: false,
    status: [NEED_YOU_WORDS.formHeld.status],
    tone: "warn",
    warn: false,
    cta: { label: NEED_YOU_WORDS.formHeld.open, to: formsRouteOf({ form: held.form_id, part: "share" }) },
    also: null,
    waitedMs: Number.NEGATIVE_INFINITY,
  };
}

/** The forms' rows of a day: each request nobody has answered, then each held pile left three days. */
export function formRowsOf(todayFacts: TodayFacts): TodayQueueRowVM[] {
  return [
    ...todayFacts.formRequests.map((request) => requestRow(request, todayFacts)),
    ...todayFacts.formHeld.map((held) => heldPileRow(held, todayFacts)),
  ];
}

/** What the queue's words say of the held piles: how many entries in all, or nothing where there is none. */
export function formHeldPart(piles: readonly FormHeldDto[]): string {
  const entries = piles.reduce((sum, pile) => sum + pile.held, 0);
  return entries ? NEED_YOU_WORDS.formHeld.part(entries) : "";
}
