/**
 * A time a customer picked by text, as a row of Today's queue (decision 0061): the hold asks Booked it or Can't, and the
 * row answers it through the door every page presses (surfaces/booking-request.ts). Booked it opens the thread with the
 * confirmation drafted for the member to send; Can't leaves the thread waiting on their reply, and the row comes back as
 * that reply once Today is read again.
 */
import { BOOKING_REQUEST_WORDS as W, addressOf, type TodayQueueRowVM } from "@chanlytics/contracts";
import { answerRequest, type RequestAnswered } from "../../booking-request";
import { carryReply } from "../../inbox/carried-reply";
import { appNavigate, gate, type Flash } from "../shell";

/** Booked it, the row's button, and Can't, its quiet one; the role gate says so to anyone who may not press them. */
export function requestActs(
  row: TodayQueueRowVM,
  kind: "primary" | "ghost",
  answer: (row: TodayQueueRowVM, booked: boolean) => unknown,
) {
  const act = (booked: boolean, k: "primary" | "ghost") => {
    const label = booked ? W.booked_it : W.cant_it;
    return {
      label,
      kind: k,
      onClick: () => answer(row, booked),
      gate: { ...gate("approve", W.gate), "aria-label": `${label}: ${row.who}` },
      testid: `queue-request-${booked ? "booked" : "cant"}`,
    };
  };
  return { cta: act(true, kind), also: act(false, "ghost") };
}

/** An answer on its way, by the thread, so a second press waits. */
const ANSWERING = new Set<string>();

/**
 * Answer the request. The row goes at once (`hide`), and Today is read again behind the verb (the route's refresh); a
 * refusal is said in its own sentence. `answer` is the door; a test of the row hands in its own.
 */
export async function requestAnswer(
  row: TodayQueueRowVM,
  booked: boolean,
  page: { flash: (flash: Flash) => void; hide: (conversationId: string) => void },
  answer: typeof answerRequest = answerRequest,
) {
  const req = row.request;
  if (!req || ANSWERING.has(req.conversationId)) return;
  ANSWERING.add(req.conversationId);
  let said: RequestAnswered;
  try {
    said = await answer(req.conversationId, booked, row.who);
  } finally {
    ANSWERING.delete(req.conversationId);
  }
  if (!said.ok) {
    page.flash({ tone: "danger", msg: <>{said.message}</> });
    return;
  }
  page.hide(req.conversationId);
  page.flash({ msg: <>{said.receipt}</> });
  if (!booked) return;
  const to = addressOf({ kind: "hold", conversationId: req.conversationId });
  if (said.reply) carryReply(to, said.reply);
  appNavigate(to);
}
