/**
 * A call the member made from their own phone, logged on the person (decision 0052, canvas A M4 and P2): the number Call
 * rings, "How did the call go?", its outcomes (and a lead's own two where the business they work at is an open lead), the
 * day a call back is for, and what Save says it does before it does it. One door writes it, `person_call_logged`: a note
 * (the team's only unless the receptionist should know; with a day, a step), and the lead's outcome through
 * `lead_set_stage` where their business is an open lead, so Leads' own call log and this one are one record.
 */
import { stageArgs } from "../leads/lead-plan";
import {
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CALL_OUTCOMES,
  LEAD_CALL_QUESTION,
  LEAD_CLOSED_WORDS,
  LEAD_NOTE_MAX,
  LEAD_STAGE_WORDS,
} from "../leads/lead-words";
import { formatPhoneDisplay } from "../shared/phone";
import { holdActOf } from "../conversations/escalations";
import type { PersonEscalationDto } from "../people/person-dto";
import type { BusinessRecordVM } from "./business";

/** What a call came to: Spoke, then a lead's six (decision 0052: the person's own outcomes are the lead's, and Spoke). */
export const PERSON_CALL_OUTCOMES = ["spoke", ...LEAD_CALL_OUTCOMES] as const;

export type PersonCallOutcome = (typeof PERSON_CALL_OUTCOMES)[number];

/** The two outcomes that are a lead's alone: offered only where the person's business is an open lead. */
const LEADS_OWN: readonly PersonCallOutcome[] = ["interested", "not_interested"];

/** What was said fits the lead's own note (lead_set_stage's 280), so one sentence is both records. */
export const PERSON_CALL_SAID_MAX = LEAD_NOTE_MAX;

/** The order the chips stand in: Spoke first, a lead's two after it, then the calls that went nowhere. */
const CALL_OUTCOME_ORDER: readonly PersonCallOutcome[] = [
  "spoke",
  "interested",
  "not_interested",
  "call_back",
  "voicemail",
  "no_answer",
  "wrong_number",
];

export const PERSON_CALL_WORDS = {
  call: "Call",
  dial: "Call from your phone",
  dialHint: "Your own phone rings them; the receptionist never does",
  logPast: "Log a call you already made",
  question: LEAD_CALL_QUESTION,
  outcomes: { spoke: "Spoke", ...LEAD_CALL_OUTCOME_WORDS } as Record<PersonCallOutcome, string>,
  callBack: "Call back",
  said: "What was said",
  saidPlaceholder: "What was said (team only)",
  tell: "The receptionist should know",
  tellHint: "Off, the note is the team's only, and the receptionist never repeats it",
  spokeWith: "Who did you speak with?",
  spokeWithPlaceholder: "Their name, if they said it",
  fromPhone: "from your phone",
  onLead: "logged on the lead",
  logged: "Logged as a team-only note",
  told: "Logged as a note the receptionist reads",
  save: (what: string) => `Save as ${what}`,
  /** Save before an outcome is picked, when it cannot be pressed yet. */
  saveBare: "Save",
  saved: "Call logged",
  couldNot: "Could not log this call.",
  notNow: "Not now",
  /** The step a call back writes beside a note the receptionist reads (a step is always the team's own). */
  stepBody: "Call back",
  /** They asked for a call back, still open: this call was it, and Save closes it (X3-1). */
  closesCallBack: "This was the call back they asked for",
  closesCallBackHint: "Closes their call-back request: Today, the badge and the bell stop asking",
} as const;

/** The outcomes that reached them, so a call back they asked for is done unless the member says otherwise (X3-1). */
const REACHED: readonly PersonCallOutcome[] = ["spoke", "interested", "not_interested"];

/**
 * Whether Save closes the call back they asked for, before the member says (X3-1): yes where the call reached them
 * (Spoke, Interested, Not interested), no where it went nowhere; the member's own answer stands over either.
 */
export function personCallClosesBack(o: PersonCallOutcome | null): boolean {
  return !!o && REACHED.includes(o);
}

/**
 * They asked for a call back and it is still open (an open hold on their thread whose verb is Call back, decision 0048's
 * holdActOf): the call sheet then asks whether this call was it (X3-1), and the door hands their thread back when it was.
 * A thread a teammate has is theirs to close (`theirs`), as the Inbox says: the sheet does not ask, and the door would not.
 */
export function callBackWaits(
  escalations: readonly Pick<PersonEscalationDto, "state" | "reason">[],
  theirs: boolean,
): boolean {
  return !theirs && escalations.some((e) => e.state === "open" && holdActOf(e.reason) === "call_back");
}

/** The popover's and the sheet's head, the outcomes it offers, and whether Save moves a lead too. */
export interface PersonCallVM {
  /** What Call opens: their number, or the listing's for someone at a business with none of their own. */
  tel: string;
  /** The number as the page shows it. */
  number: string;
  /** The head's title on a desk: the number, or the business and its listing number. */
  heading: string;
  /** "from your phone", or the listing's hours and that the call is logged on the lead. */
  sub: string;
  /** The number rung is the business's listing, not theirs: a wrong number is the listing's. */
  listing: boolean;
  outcomes: { id: PersonCallOutcome; label: string }[];
  /** Their business is an open lead: Save logs the outcome on it too. */
  onLead: boolean;
  /** They are the business's stand-in (named for it): Interested asks who answered, the name their page takes. */
  asksWho: boolean;
}

/** What the call is made of: the person's own number, whether they stand in for their business, and that business. */
export interface PersonCallInput {
  phone: string | null | undefined;
  standIn: boolean;
  business: Pick<BusinessRecordVM, "name" | "open" | "phone"> | null;
}

/** A number a phone can dial, from however it was written: its digits and a leading +, or none where there are no digits. */
function dialable(raw: string | null | undefined): string | null {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  return /\d/.test(digits) ? digits : null;
}

/**
 * The call (decision 0052): their number, or, for someone at a business with none of their own, the listing's; nothing
 * where there is neither. A lead's own outcomes where the business is an open lead.
 */
export function personCallOf(i: PersonCallInput): PersonCallVM | null {
  const own = dialable(i.phone);
  const b = i.business;
  const onLead = !!b?.open;
  const outcomes = CALL_OUTCOME_ORDER.filter((o) => onLead || !LEADS_OWN.includes(o)).map((id) => ({
    id,
    label: PERSON_CALL_WORDS.outcomes[id],
  }));
  if (own)
    return {
      tel: `tel:${own}`,
      number: formatPhoneDisplay(own) ?? own,
      heading: formatPhoneDisplay(own) ?? own,
      sub: PERSON_CALL_WORDS.fromPhone,
      listing: false,
      outcomes,
      onLead,
      asksWho: false,
    };
  // No number of their own: the listing's, where their business has one; else nothing to ring.
  const ph = b?.phone;
  if (!b || !ph || !ph.tel) return null;
  return {
    tel: ph.tel,
    number: ph.value,
    heading: `${b.name} · ${ph.value}`,
    sub: [ph.hours, onLead ? PERSON_CALL_WORDS.onLead : null].filter(Boolean).join(" · "),
    listing: true,
    outcomes,
    onLead,
    asksWho: i.standIn,
  };
}

/** Whether a call back is offered under this outcome (every one but Wrong number), and the day it starts on. */
export function personCallDays(o: PersonCallOutcome | null): { offered: boolean; tomorrow: boolean } {
  return { offered: !!o && o !== "wrong_number", tomorrow: o === "call_back" };
}

/** The note the call leaves on the person: "Call · Left a voicemail: asked her to ring after five". */
export function personCallNote(o: PersonCallOutcome, said: string | null | undefined): string {
  const words = String(said || "").trim();
  return `Call · ${PERSON_CALL_WORDS.outcomes[o]}${words ? `: ${words}` : ""}`;
}

/** Save says what it saves: "Save as Call back Tomorrow", "Save as Spoke · call back Fri", "Save as No answer". */
export function personCallSave(o: PersonCallOutcome, dayName: string | null): string {
  const W = PERSON_CALL_WORDS;
  if (o === "call_back") return W.save(dayName ? `${W.callBack} ${dayName}` : W.outcomes.call_back);
  return W.save(dayName ? `${W.outcomes[o]} · ${W.callBack.toLowerCase()} ${dayName}` : W.outcomes[o]);
}

/** The line beside Save: what the lead becomes where the call moves it, else where the note goes. */
export function personCallFoot(vm: PersonCallVM, o: PersonCallOutcome | null, tell: boolean): string {
  const W = PERSON_CALL_WORDS;
  if (vm.onLead && o && o !== "spoke" && (o !== "wrong_number" || vm.listing)) {
    if (o === "interested") return `Moves the lead to ${LEAD_STAGE_WORDS.converted}`;
    if (o === "not_interested") return `Closes the lead: ${LEAD_CLOSED_WORDS.said_no}`;
    if (o === "wrong_number") return "Marks the listing's number wrong";
    return "Logged on the lead";
  }
  return tell ? W.told : W.logged;
}

/**
 * What the lead is asked (lead_set_stage, through the door), as Leads asks it for the same outcome (stageArgs): none for
 * Spoke, which is no lead's outcome. The door decides whether there is an open lead to ask, and keeps a lead already
 * Talking where a call went nowhere.
 */
export function personCallLeadArgs(
  o: PersonCallOutcome,
  said: string | null | undefined,
  spokeWith: string | null | undefined,
): {
  p_lead_stage: string | null;
  p_lead_reason: string | null;
  p_lead_note: string | null;
  p_spoke_with: string | null;
} | null {
  if (o === "spoke") return null;
  const a = stageArgs({
    kind: "outcome",
    outcome: o,
    ...(said && said.trim() ? { note: said.trim() } : {}),
    ...(spokeWith && spokeWith.trim() ? { spoke_with: spokeWith.trim() } : {}),
  });
  return { p_lead_stage: a.p_stage, p_lead_reason: a.p_reason, p_lead_note: a.p_note, p_spoke_with: a.p_spoke_with };
}
