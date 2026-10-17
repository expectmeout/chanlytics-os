import { appointmentWordWhere, appointmentWords } from "../journey/appointment-word.js";
import { MERGE_ANSWERS } from "../people/person-merge.js";
import { NEEDS_TITLE } from "../shell/refusal.js";
import { WORKS_AT_WORDS } from "./words.js";
export const COMBINE_WORDS = {
  title: WORKS_AT_WORDS.combineWith,
  sub: (business) => `Two records at ${business}`,
  body: (kept, other) => `${other} and ${kept} are one person, so ${kept} keeps their own record and takes everything under ${other}.`,
  /** The same, for someone who answered without giving a name. */
  bodySomeone: (other) => `${other} and the person who answered are one person, so they keep their own record and take everything under ${other}.`,
  keeps: "Keeps their own name, number and address",
  keepsNoName: "Keeps their own number and address, and no name until they give one",
  takesThread: (other) => `Takes the messages and calls on ${other}'s record, in one thread`,
  /** In the workspace's word for its appointments: "Takes its notes, deals, appointments and lists". */
  takesRecords: (many) => `Takes its notes, deals, ${many} and lists`,
  takesReachOut: "Takes the emails we sent it, the replies, and the lead's link to it",
  answers: MERGE_ANSWERS,
  after: (other) => `${other}'s record stays as a merged record with no number or address`,
  why: (business, wroteTo, answerer, from) => `Both work at ${business}. We wrote to ${wroteTo}, and ${answerer ?? "someone"} answered from ${from}.`,
  owner: NEEDS_TITLE.owner,
  cancel: "Cancel",
  yes: "Combine",
  busy: "Combining\u2026",
  close: "Close",
  done: (kept) => `Combined into ${kept}`,
  failed: "Could not combine these records."
};
export function combineOf(f) {
  const W = COMBINE_WORDS;
  const { here, act, business } = f;
  const k = act.keepsOther;
  const kept = {
    id: k ? act.otherId : here.id,
    name: k ? act.otherName : here.name,
    email: k ? act.otherEmail : here.email
  };
  const drop = {
    id: k ? here.id : act.otherId,
    name: k ? here.name : act.otherName,
    email: k ? here.email : act.otherEmail
  };
  const named = act.keptNamed;
  return {
    keepId: kept.id,
    dropId: drop.id,
    keptName: kept.name,
    // "Combine with" names the other record, which is a name of no one where the person who answered gave none.
    title: k && !named ? W.yes : W.title(act.otherName),
    sub: W.sub(business),
    body: named ? W.body(kept.name, drop.name) : W.bodySomeone(drop.name),
    rows: [
      named ? W.keeps : W.keepsNoName,
      W.takesThread(drop.name),
      W.takesRecords(appointmentWords(appointmentWordWhere(f.dealsOn)).many),
      W.takesReachOut,
      W.answers,
      W.after(drop.name)
    ],
    why: drop.email && kept.email ? W.why(business, drop.email, named ? kept.name : null, kept.email) : ""
  };
}
