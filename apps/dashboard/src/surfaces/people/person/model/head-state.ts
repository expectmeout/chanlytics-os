/**
 * The one state a person's head says (canvas A): their state as People's row says it (personStateFor, the same pill the
 * list draws), never the receptionist's standing, with one sentence under it, always: what needs someone and why where
 * someone is needed, else what the row's own detail says of them (first heard from, last heard from, no contact, asked to
 * stop), as a sentence. The standing is the receptionist's, and is said in Messages and receptionist.
 */
import type { PersonState } from "@chanlytics/contracts";

/** What the head draws: the state (its pill's family is People's), its word, and the sentence under it. */
export interface PersonHeadStateVM {
  state: PersonState;
  word: string;
  sentence: string | null;
  /**
   * A stand-in's story ("We wrote first · Nov 5") where no notice takes its row, which a phone says on the state's line
   * beside the face in the sentence's place ("● Not heard from · We wrote first · Nov 5"), where a row of its own under
   * the face stood the head 30px taller for six words (Ruben, 17 Nov 2026). A desk says it under the name (hero.tsx).
   */
  story: string | null;
}

/** What it is read from: the row's state, its word and its detail, and Right now's sentence for one that needs someone. */
export interface PersonHeadStateFacts {
  state: PersonState;
  stateLabel: string;
  stateDetail: string;
  rightNow: { detail: string };
  /** How they came to be here and when (contracts personOriginOf): a form or a booking is contact, said in its place. */
  origin?: string | null;
  /** The head's line (business.ts personHeadOf): a lead's stand-in's says how they met. */
  head?: { line: { kind: string; text: string } | null };
  /** The page's notices; one that stands under the name takes the line's row. */
  notices?: readonly { home: string }[];
}

/** A detail in a few words as a sentence: its first letter up, a full stop after it. */
const asSentence = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const up = `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return /[.!?]$/.test(up) ? up : `${up}.`;
};

/** The head's state and its sentence (canvas A's head, every board). */
export function personHeadStateOf(stateFacts: PersonHeadStateFacts): PersonHeadStateVM {
  const needs = stateFacts.state === "needs_you" || stateFacts.state === "waiting_on_you";
  // A stand-in's head that says how they met ("We wrote first · Oct 30") is not told it again under the pill ("First
  // contact Oct 30."; the phone pass, 3 Nov 2026): the line is drawn where no notice stands in its row (hero.tsx).
  const line = stateFacts.head?.line;
  const met = line?.kind === "origin" && !(stateFacts.notices ?? []).some((n) => n.home === "name");
  return {
    state: stateFacts.state,
    word: stateFacts.stateLabel,
    // Why someone is needed is Now's first row (the one page, D6: said once, there): the head says the state alone.
    // Someone not heard from on any wire may still have reached you another way (a form, a booking): their head says how,
    // never "No contact recorded" above the form they filled (the one page, D5).
    sentence:
      needs || met
        ? null
        : stateFacts.state === "unheard" && stateFacts.origin
          ? asSentence(stateFacts.origin)
          : asSentence(stateFacts.stateDetail),
    story: met && line ? line.text : null,
  };
}
