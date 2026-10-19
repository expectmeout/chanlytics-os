/**
 * Combine (decision 0052, amending 0028): the record we wrote to at a business, named for it and never answering, and
 * the person who answered from another address there, made one person, an owner's press. The merge door judges the pair
 * and keeps the person who answered, whichever page it is pressed from, with their own name and address (or no name, where
 * they gave none: never the business's, 00420); the business's address stays the lead's. The sheet says what the door does, each row a thing it makes true (merge_people): no count,
 * since the other record is not read here, and no Undo, since no door undoes a merge.
 */
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { MERGE_ANSWERS } from "../people/person-merge";
import { NEEDS_TITLE } from "../shell/refusal";
import type { CombineAct } from "./notices";
import { WORKS_AT_WORDS } from "./words";

export const COMBINE_WORDS = {
  title: WORKS_AT_WORDS.combineWith,
  sub: (business: string) => `Two records at ${business}`,
  body: (kept: string, other: string) =>
    `${other} and ${kept} are one person, so ${kept} keeps their own record and takes everything under ${other}.`,
  /** The same, for someone who answered without giving a name. */
  bodySomeone: (other: string) =>
    `${other} and the person who answered are one person, so they keep their own record and take everything under ${other}.`,
  keeps: "Keeps their own name, number and address",
  keepsNoName: "Keeps their own number and address, and no name until they give one",
  takesThread: (other: string) => `Takes the messages and calls on ${other}'s record, in one thread`,
  /** In the workspace's word for its appointments: "Takes its notes, deals, appointments and lists". */
  takesRecords: (many: string) => `Takes its notes, deals, ${many} and lists`,
  takesReachOut: "Takes the emails we sent it, the replies, and the lead's link to it",
  answers: MERGE_ANSWERS,
  after: (other: string) => `${other}'s record stays as a merged record with no number or address`,
  why: (business: string, wroteTo: string, answerer: string | null, from: string) =>
    `Both work at ${business}. We wrote to ${wroteTo}, and ${answerer ?? "someone"} answered from ${from}.`,
  owner: NEEDS_TITLE.owner,
  cancel: "Cancel",
  yes: "Combine",
  busy: "Combining…",
  close: "Close",
  done: (kept: string) => `Combined into ${kept}`,
  failed: "Could not combine these records.",
} as const;

export interface CombineVM {
  /** The record the door keeps (the person who answered) and the one it folds in (the record we wrote to). */
  keepId: string;
  dropId: string;
  keptName: string;
  title: string;
  sub: string;
  body: string;
  /** What the kept person keeps and takes, each a row with a check. */
  rows: string[];
  /** Why they are one: the business, the address we wrote to, and the one they answered from. */
  why: string;
}

/** The Combine sheet, from this page's person, the notice's act, the business they share and the workspace's word. */
export function combineOf(f: {
  here: { id: string; name: string; email: string | null };
  act: CombineAct;
  business: string;
  word: AppointmentWord;
}): CombineVM {
  const W = COMBINE_WORDS;
  const { here, act, business } = f;
  const k = act.keepsOther;
  const kept = {
    id: k ? act.otherId : here.id,
    name: k ? act.otherName : here.name,
    email: k ? act.otherEmail : here.email,
  };
  const drop = {
    id: k ? here.id : act.otherId,
    name: k ? here.name : act.otherName,
    email: k ? here.email : act.otherEmail,
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
      W.takesRecords(appointmentWords(f.word).many),
      W.takesReachOut,
      W.answers,
      W.after(drop.name),
    ],
    why: drop.email && kept.email ? W.why(business, drop.email, named ? kept.name : null, kept.email) : "",
  };
}
