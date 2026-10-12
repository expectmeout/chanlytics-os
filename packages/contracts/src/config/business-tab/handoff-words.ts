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
    : "No number yet, so it takes a message.";
}

/** One of the hand-off's outcomes as a row of its sheet: what happens, and the condition or the detail under it. */
export interface HandoffRowVM {
  name: string;
  sub: string;
}

/**
 * What a WhatsApp hand-off does, as one row of the hand-off's sheet (handoffChatWords says it as a sentence, for the
 * abilities card): it stops, the thread turns Needs you, the alerts go to whoever the Notifications tab sets, and after
 * the Autonomy reply row's pause it answers the next message itself. `pauseHours` is that row's stored pause_hours.
 */
export function handoffChatRow(pauseHours: unknown): HandoffRowVM {
  const pause = heldFor(hardLimitsWords({ pause_hours: pauseHours }).hours);
  return { name: "Stops and marks it Needs you", sub: `Sends your alerts · replies again after ${pause}` };
}

/** What a call does, as one row of the hand-off's sheet, with its door to the number's own row. */
export interface HandoffCallRowVM extends HandoffRowVM {
  /** The door's word, and its whole name for a screen reader. */
  act: string;
  actName: string;
}

/**
 * What a call does with a caller who needs a person, as one row of the hand-off's sheet (transferWords as a sentence):
 * during opening hours it rings the number and stays on until someone picks up, else it takes a message; with no number,
 * a message always. The owner's reasons reach a call too, under the call's own hand-off heading ("and whenever:").
 * `transfer` is the number as the page shows it.
 */
export function handoffCallRow(transfer: string | null | undefined): HandoffCallRowVM {
  const number = typeof transfer === "string" ? transfer.trim() : "";
  return number
    ? {
        name: `Rings ${number}`,
        sub: "In opening hours, otherwise takes a message",
        act: "Change",
        actName: "Change the transfer number",
      }
    : { name: "Takes a message", sub: "No transfer number", act: "Add one", actName: "Add a transfer number" };
}

/**
 * Who is handed over without a reason of the owner's: the composer's own triggers on both channels (a person asked
 * for, someone upset, a question its instructions do not cover). The tip beside the reasons' box.
 */
export const HANDOFF_ANYWAY = "Anyone who asks for a person, or needs help it can't give, is handed over too.";

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
