/**
 * The hand-off's words: what happens when a WhatsApp customer is handed over, what a call does with a caller who
 * needs a person, and the hand-off row at rest. The abilities card says the same sentences (abilities.ts).
 */
import { hardLimitsWords } from "../policy";
import { pluralGrouped } from "./counts";

/**
 * When the receptionist hands a customer over whatever the owner wrote: the composer's own triggers, on both channels
 * (config.ts, the two hand-off blocks: a person asked for, someone upset, a question its instructions do not cover), in
 * the words the page says them in. One clause, for the ability card and the hand-off row alike.
 */
const HANDED_OVER_ANYWAY = "a customer asks for a person or it can't help";

/**
 * What happens when a WhatsApp customer is handed over, checked against the edge: the composer teaches the model to end
 * its reply with the [[HUMAN]] token (config.ts, the chat hand-off block), and a reply carrying it is sent with the token
 * taken out; then the thread is paused for the Autonomy reply row's pause_hours (whatsapp/inbound.ts, a day when
 * nothing is stored), an escalation is opened, which is what turns the thread Needs you in the Inbox, and the alert goes
 * to the addresses the Notifications tab sets (notify.ts chooseAddressing: notifications.escalation_emails). After the
 * pause it answers the next message itself. The canvas said "It stops answering, marks the thread Needs you and emails
 * your staff": the email goes to whoever is on that list, which may be nobody, and the pause ends.
 *
 * The ability card's hand-off row and the hand-off row's fold both say it, so it is written once, here. `pauseHours` is
 * that row's stored pause_hours as it is stored, read the way the Autonomy pane reads it (hardLimitsWords).
 */
export function handoffChatWords(i: { hasEscalateWhen: boolean; pauseHours: unknown }): string {
  const when = i.hasEscalateWhen
    ? `On your reasons, or when ${HANDED_OVER_ANYWAY}, it`
    : `When ${HANDED_OVER_ANYWAY}, it`;
  const pause = heldFor(hardLimitsWords({ pause_hours: i.pauseHours }).hours);
  return `${when} stops answering, the thread turns Needs you in the Inbox, and anyone set to be alerted is emailed. It holds off for ${pause}, then answers the customer's next message itself.`;
}

/**
 * What a call does with a caller who needs a person (config.ts, the call hand-off block: "Use transfer_to_staff during
 * opening hours -- it rings the line a person answers, and you stay on until they pick up"), for the ability card's
 * transfer row and the hand-off row's fold alike.
 */
export function transferWords(hasHandoffNumber: boolean): string {
  return hasHandoffNumber
    ? "During opening hours it rings the number you gave and stays on until someone picks up. Outside them, or if nobody answers, it takes a message."
    : "No number yet, so it takes a message instead — which is better than a number nobody picks up.";
}

/**
 * The hand-off on a call, under the hand-off row's reasons: what a transfer does, and that the reasons count there too.
 * They do: the composer writes them under the call's hand-off heading as it writes them under the chat's ("and
 * whenever:"). The canvas said the phone agent's own transfer kept the reasons from reaching it, which was not true.
 */
export function handoffCallWords(i: { hasHandoffNumber: boolean; hasEscalateWhen: boolean }): string {
  return `${i.hasEscalateWhen ? "Your reasons reach a call too. " : ""}${transferWords(!!i.hasHandoffNumber)}`;
}

/** The hand-off row at rest, and what a call does, which its fold says under Phone. */
export interface HandoffWordsVM {
  /** One line: "For 2 reasons · on a call, transfers to +1 (212) 555-0142"; with no reasons, when it hands over anyway. */
  line: string;
  /** "transfers to +1 (212) 555-0142", or "takes a message" with no number. */
  phone: string;
}

/**
 * The hand-off row at rest: how many reasons the owner gave, and what a call does, on one line. It quoted the opening
 * of the reasons too, under a WhatsApp word, with the call's words under a Phone word ("on 2 reasons — They ask for a
 * person, for the owner · They are upset, or have a…"), which was two lines and an ellipsis on a row that states one
 * fact (24 Sep); the fold holds the reasons whole. `transfer` is the transfer number as the page shows it (the settings
 * read's resolved fact, written for people); the row only states it, and the Who you are row is where it is changed.
 * A stored list that is not one (a hand-edited record) is no reasons, never a throw: the page draws this as it draws.
 */
export function handoffWords(
  reasons: readonly string[] | null | undefined,
  transfer: string | null | undefined,
): HandoffWordsVM {
  const list = (Array.isArray(reasons) ? reasons : [])
    .filter((r): r is string => typeof r === "string" && r.trim() !== "")
    .map((r) => r.trim());
  const n = list.length;
  const number = typeof transfer === "string" ? transfer.trim() : "";
  const phone = number ? `transfers to ${number}` : "takes a message";
  return {
    line: `${n ? `For ${pluralGrouped(n, "reason", "reasons")}` : `When ${HANDED_OVER_ANYWAY}`} · on a call, ${phone}`,
    phone,
  };
}

/** How long a hand-off holds, in the words the page says it: "a day", "4 hours", "3 days". */
function heldFor(pauseHours: number): string {
  const hours = Math.max(1, Math.round(pauseHours));
  if (hours % 24 === 0) return hours === 24 ? "a day" : `${hours / 24} days`;
  return hours === 1 ? "an hour" : `${hours} hours`;
}
