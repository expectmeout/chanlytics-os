/**
 * The one state a person's head says (canvas A): their state as People's row says it (personStateFor, the same pill the
 * list draws), never the receptionist's standing, with one sentence under it, always: what needs someone and why where
 * someone is needed, else what the row's own detail says of them (first heard from, last heard from, no contact, asked to
 * stop), as a sentence. The standing is the receptionist's, and is said in Messages and receptionist.
 */
import type { PersonState } from "../people/person-state";

/** What the head draws: the state (its pill's family is People's), its word, and the sentence under it. */
export interface PersonHeadStateVM {
  state: PersonState;
  word: string;
  sentence: string | null;
}

/** What it is read from: the row's state, its word and its detail, and Right now's sentence for one that needs someone. */
export interface PersonHeadStateFacts {
  state: PersonState;
  stateLabel: string;
  stateDetail: string;
  rightNow: { detail: string };
}

/** A detail in a few words as a sentence: its first letter up, a full stop after it. */
const asSentence = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const up = `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return /[.!?]$/.test(up) ? up : `${up}.`;
};

/** The head's state and its sentence (canvas A's head, every board). */
export function personHeadStateOf(p: PersonHeadStateFacts): PersonHeadStateVM {
  const needs = p.state === "needs_you" || p.state === "waiting_on_you";
  return {
    state: p.state,
    word: p.stateLabel,
    sentence: needs ? asSentence(p.rightNow.detail) : asSentence(p.stateDetail),
  };
}
