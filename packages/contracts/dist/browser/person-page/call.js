import { stageArgs } from "../leads/lead-plan.js";
import {
  LEAD_CALL_OUTCOME_WORDS,
  LEAD_CALL_OUTCOMES,
  LEAD_CALL_QUESTION,
  LEAD_CLOSED_WORDS,
  LEAD_NOTE_MAX,
  LEAD_STAGE_WORDS
} from "../leads/lead-words.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { mayRing } from "../consent/consent.js";
import { holdActOf } from "../conversations/escalations.js";
export const PERSON_CALL_OUTCOMES = ["spoke", ...LEAD_CALL_OUTCOMES];
const LEADS_OWN = ["interested", "not_interested"];
export const PERSON_CALL_SAID_MAX = LEAD_NOTE_MAX;
const CALL_OUTCOME_ORDER = [
  "spoke",
  "interested",
  "not_interested",
  "call_back",
  "voicemail",
  "no_answer",
  "wrong_number"
];
export const PERSON_CALL_WORDS = {
  call: "Call",
  dial: "Call from your phone",
  dialHint: "Your own phone rings them; the receptionist never does",
  logPast: "Log a call you already made",
  question: LEAD_CALL_QUESTION,
  outcomes: { spoke: "Spoke", ...LEAD_CALL_OUTCOME_WORDS },
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
  save: (what) => `Save as ${what}`,
  /** Save before an outcome is picked, when it cannot be pressed yet. */
  saveBare: "Save",
  saved: "Call logged",
  couldNot: "Could not log this call.",
  notNow: "Not now",
  /** The step a call back writes beside a note the receptionist reads (a step is always the team's own). */
  stepBody: "Call back",
  /** They asked for a call back, still open: this call was it, and Save closes it (X3-1). */
  closesCallBack: "This was the call back they asked for",
  closesCallBackHint: "Closes their call-back request: Today, the badge and the bell stop asking"
};
const REACHED = ["spoke", "interested", "not_interested"];
export function personCallClosesBack(o) {
  return !!o && REACHED.includes(o);
}
export function callBackWaits(escalations, theirs) {
  return !theirs && escalations.some((e) => e.state === "open" && holdActOf(e.reason) === "call_back");
}
function dialable(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "");
  return /\d/.test(digits) ? digits : null;
}
export function personCallOf(i) {
  const own = dialable(i.phone);
  const b = i.business;
  const onLead = !!b?.open;
  const outcomes = CALL_OUTCOME_ORDER.filter((o) => onLead || !LEADS_OWN.includes(o)).map((id) => ({
    id,
    label: PERSON_CALL_WORDS.outcomes[id]
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
      rings: mayRing({ dnc: i.dnc })
    };
  const ph = b?.phone;
  if (!b || !ph || !ph.tel) return null;
  return {
    tel: ph.tel,
    number: ph.value,
    heading: `${b.name} \xB7 ${ph.value}`,
    sub: [ph.hours, onLead ? PERSON_CALL_WORDS.onLead : null].filter(Boolean).join(" \xB7 "),
    listing: true,
    outcomes,
    onLead,
    asksWho: i.standIn,
    rings: mayRing({ dnc: i.dnc })
  };
}
export function personCallDays(o) {
  return { offered: !!o && o !== "wrong_number", tomorrow: o === "call_back" };
}
export function personCallNote(o, said) {
  const words = String(said || "").trim();
  return `Call \xB7 ${PERSON_CALL_WORDS.outcomes[o]}${words ? `: ${words}` : ""}`;
}
export function personCallSave(o, dayName) {
  const W = PERSON_CALL_WORDS;
  if (o === "call_back") return W.save(dayName ? `${W.callBack} ${dayName}` : W.outcomes.call_back);
  return W.save(dayName ? `${W.outcomes[o]} \xB7 ${W.callBack.toLowerCase()} ${dayName}` : W.outcomes[o]);
}
export function personCallFoot(vm, o, tell) {
  const W = PERSON_CALL_WORDS;
  if (vm.onLead && o && o !== "spoke" && (o !== "wrong_number" || vm.listing)) {
    if (o === "interested") return `Moves the lead to ${LEAD_STAGE_WORDS.converted}`;
    if (o === "not_interested") return `Closes the lead: ${LEAD_CLOSED_WORDS.said_no}`;
    if (o === "wrong_number") return "Marks the listing's number wrong";
    return "Logged on the lead";
  }
  return tell ? W.told : W.logged;
}
export function personCallLeadArgs(o, said, spokeWith) {
  if (o === "spoke") return null;
  const a = stageArgs({
    kind: "outcome",
    outcome: o,
    ...said && said.trim() ? { note: said.trim() } : {},
    ...spokeWith && spokeWith.trim() ? { spoke_with: spokeWith.trim() } : {}
  });
  return { p_lead_stage: a.p_stage, p_lead_reason: a.p_reason, p_lead_note: a.p_note, p_spoke_with: a.p_spoke_with };
}
