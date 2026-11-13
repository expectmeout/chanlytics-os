/**
 * A draft that stands, as the judge reads it while a line changes it (decision 0129 step 2, items 16 to 18; split out of
 * draft-judge.ts, which it would have taken past its length). The page tells Ask the draft as it is, Ask answers the whole
 * draft again, and the judge must tell three steps apart: one Ask left word for word as it stood (taken as it stands,
 * never judged again: its owner's own words are theirs, a price they typed and an email they wrote included), one Ask
 * changed (judged as any step, with the step that stood there to fall back to), and one that is new. Pure.
 */
import "server-only";
import type { NewDraftAnswerStep, NewDraftAsk } from "@chanlytics/contracts";

type Stands = NonNullable<NewDraftAsk["stands"]>;

/**
 * The steps of a draft that stands, in the shape Ask answers one in: each held message by the key the request lists it
 * under ("" where it lists none). What the drafter is told of them (drafts/sequence-change.ts), and what the judge sets
 * an answered step beside.
 */
export function stoodStepsOf(
  stands: Stands,
  known: { messages: ReadonlyArray<{ key: string; templateId: string }> },
): NewDraftAnswerStep[] {
  return stands.steps.map(({ template_id: held, ...step }) => ({
    ...step,
    message: known.messages.find((message) => message.templateId === held)?.key ?? "",
  }));
}

const lines = (text: string): string => text.replace(/\r\n?/g, "\n").trim();
const spaced = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Everything a step says, as one string: two steps that say the same are the same, whatever order their keys came in. */
function sayingOf(step: NewDraftAnswerStep): string {
  const write = step.write;
  return JSON.stringify([
    step.does,
    step.after_days,
    [...step.only_if].sort(),
    step.message,
    step.texts.map(spaced),
    [write.title.trim(), write.offer, lines(write.whatsapp), lines(write.email_subject), lines(write.email_body)],
    lines(write.text),
    lines(step.subject),
    lines(step.body),
    spaced(step.words),
  ]);
}

/** What an answered step is to the draft that stands. */
export interface Standing {
  /** Ask left it word for word as a step of the draft stood, in a place of the same kind (first, or later). */
  untouched: boolean;
  /** The step that stood at this place, where the places still answer each other: what a refused rewrite falls back to. */
  was: NewDraftAnswerStep | null;
  /** What the owner typed into the same message that stood here: their own words, which a rewrite of the rest keeps. */
  texts: readonly string[];
}

/** A step of a first draft: nothing stood before it. */
export const NOTHING_STOOD: Standing = { untouched: false, was: null, texts: [] };

/**
 * What one step of the answer is to the draft that stands. The places answer each other while the answer holds at least
 * the draft's steps (a step added after them moves none); an answer with fewer has taken one away, and which is not known.
 */
export function standingAt(
  stood: readonly NewDraftAnswerStep[] | null,
  answered: NewDraftAnswerStep,
  place: { at: number; of: number },
): Standing {
  if (!stood) return NOTHING_STOOD;
  const saying = sayingOf(answered);
  const first = place.at === 0;
  const untouched = stood.some((step, at) => (at === 0) === first && sayingOf(step) === saying);
  const was = place.of >= stood.length ? (stood[place.at] ?? null) : null;
  const sameMessage = !!was && !!answered.message && was.message === answered.message;
  return { untouched, was, texts: sameMessage ? was.texts : [] };
}
