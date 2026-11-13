/**
 * A draft changed by a line (decision 0129 step 2; the canvas "New: start from what's ready", N7): the draft keeps a line
 * under it, and what its owner types or says there changes the draft that stands. Pure: the draft as Ask is told it
 * stands (each step in the shape Ask answers one in), Ask's answer taken as that draft changed (a step that says what it
 * said is the step it was, and what the owner set by hand that Ask never names stays), and what changed, said on top
 * with Undo. Its words are the dashboard's own, since no other tree says them.
 */
import {
  NEW_VALUES,
  NUMBERED_SLOT,
  type NewDraftAsk,
  type NewDraftDto,
  type NewStep,
  type NewWrittenMessage,
} from "@chanlytics/contracts";

type Stands = NonNullable<NewDraftAsk["stands"]>;

/** How little a change may say: a word is one ("Shorter"). */
export const CHANGE_LINE_MIN = 2;

export const CHANGE_WORDS = {
  label: "What should change?",
  placeholder: "Change it by saying it",
  hint: "Ask changes what you say and leaves the rest",
  letGo: "Let go to change it",
  send: "Change it",
  changing: "Ask is changing it",
  same: "Ask changed nothing",
  changed: (parts: readonly string[]) =>
    `Ask changed ${new Intl.ListFormat("en-GB", { type: "conjunction" }).format(parts)}`,
  part: {
    kind: "what it is",
    who: "who it is for",
    when: "when it goes",
    name: "its name",
    message: "the message",
    email: "the email",
    step: (place: number) => `step ${place}`,
    fewer: "how many steps it has",
  },
} as const;

/** A value's name as it is written, from the kind a message holds it as. */
const valueSayOf = (kind: string): string => NEW_VALUES.find((value) => value.kind === kind)?.say ?? kind;

/** A written message's words with its values by name ({{first name}}), as they are written and as Ask is told them. */
export function valuesByName(text: string, slots: NewWrittenMessage["slots"]): string {
  return text.replace(NUMBERED_SLOT, (all, place: string) => {
    const slot = slots.find((held) => held.position === Number(place));
    return slot ? `{{${valueSayOf(slot.kind)}}}` : all;
  });
}

/** One step as Ask is told it stands: a held message by its id with what was typed into it, or the words as written. */
function standingStep(step: NewStep): Stands["steps"][number] {
  const message = step.message;
  const written = message?.written ?? null;
  const named = (text: string | undefined) => valuesByName(text ?? "", written?.slots ?? []);
  return {
    does: step.does,
    after_days: step.after_days ?? 0,
    only_if: step.only_if,
    template_id: written ? null : (message?.template_id ?? null),
    texts: (message?.params ?? []).flatMap((param) => (param.kind === "text" ? [param.value] : [])),
    write: {
      title: written ? (message?.title ?? "") : "",
      offer: written ? !!message?.offer : false,
      whatsapp: named(written?.versions.whatsapp?.body),
      email_subject: named(written?.versions.email?.subject),
      email_body: named(written?.versions.email?.body),
      text: named(written?.versions.sms?.body),
    },
    subject: step.email?.subject ?? "",
    body: step.email?.body ?? "",
    words: step.hand,
  };
}

/** The draft as Ask is told it stands (contracts NewDraftAsk `stands`). */
export function standsOf(draft: NewDraftDto): Stands {
  return {
    said: draft.said,
    kind: draft.kind,
    audience: draft.audience,
    name: draft.name,
    who: draft.who,
    hour: draft.run_hour,
    when: draft.kind === "once" ? (draft.at ? draft.at.replace("T", " ") : "now") : "",
    steps: draft.steps.map(standingStep),
  };
}

/** Whether two steps say the same: what each does, waits on and sends, word for word. */
const sameStep = (one: NewStep | undefined, other: NewStep): boolean =>
  !!one && JSON.stringify(standingStep(one)) === JSON.stringify(standingStep(other));

const sameWho = (one: NewDraftDto, other: NewDraftDto): boolean =>
  JSON.stringify(one.who) === JSON.stringify(other.who);

/**
 * Ask's answer taken as the draft changed: a step that says what it said is the step it was (its message as it was
 * filed or written, never a second writing of it), under the name the answer gives it, since the first step carries the
 * sequence's own; and what the owner set by hand that Ask's answer never names stays
 * where the draft is still what it was -- how each batch is decided and whether new leads join, for who it was for; a
 * one-off's channels, while its message is the one it was.
 */
export function changedFrom(before: NewDraftDto, answered: NewDraftDto): NewDraftDto {
  const steps = answered.steps.map((step, at) => {
    const was = before.steps[at];
    if (!was || !sameStep(was, step)) return step;
    return was.name === step.name ? was : { ...was, name: step.name };
  });
  const first = steps[0];
  const alike = before.kind === answered.kind && before.audience === answered.audience;
  const forSame = alike && sameWho(before, answered);
  return {
    ...answered,
    steps,
    mode: forSame ? before.mode : answered.mode,
    adds_new: forSame ? before.adds_new : answered.adds_new,
    channels: alike && first && sameStep(before.steps[0], first) ? before.channels : answered.channels,
  };
}

/**
 * What Ask drafted, after a change (decision 0078 step 2: kept beside the steps as the owner leaves them): a step the
 * change wrote is Ask's as it came, and one it left alone is still what Ask first drafted there, never the owner's own
 * edit of it. A draft Ask never drafted keeps none.
 */
export function draftedAfter(drafted: NewDraftDto | null, before: NewDraftDto, after: NewDraftDto): NewDraftDto | null {
  if (!drafted) return null;
  return {
    ...after,
    steps: after.steps.map((step, at) => (sameStep(before.steps[at], step) ? (drafted.steps[at] ?? step) : step)),
  };
}

/**
 * Whether a line left nothing on the draft: it changed no part (`sentence`, changesOf's), and the answer says nothing of
 * why that the draft did not say already (its card, `cannot`). Such a line is said in passing. One that changed nothing
 * and says why stands on top over its card as a change does: left on the change before it, the card read as that change's.
 */
export const leftNothing = (before: NewDraftDto, after: NewDraftDto, sentence: string): boolean =>
  sentence === CHANGE_WORDS.same && (!after.cannot || after.cannot === before.cannot);

/** A step's words alone, as Ask or the owner wrote them: a message written here, a lead's email, a task; none, null. */
function writtenOf(step: NewStep): string | null {
  if (step.does !== "message") return step.hand.trim() ? JSON.stringify([step.hand]) : null;
  const written = step.message?.written;
  if (written) return JSON.stringify([step.message?.title, written.versions]);
  return step.email?.body ? JSON.stringify([step.email.subject ?? "", step.email.body]) : null;
}

/**
 * The steps whose words are still as Ask wrote them, by their places: "By Ask" is said of those alone. Ask's answer
 * (`drafted`, the draft as Ask last wrote it) holds a step with the same words, wherever it now stands, so a step moved
 * up by one taken away is still Ask's; a step the owner rewrote, or added and wrote, is theirs and says nothing of Ask.
 * A draft built by hand has no answer, and no step of it is Ask's.
 */
export function placesByAsk(draft: NewDraftDto, drafted: NewDraftDto | null): number[] {
  if (!drafted) return [];
  const asks = new Set(drafted.steps.map(writtenOf));
  return draft.steps.flatMap((step, at) => {
    const words = writtenOf(step);
    return words !== null && asks.has(words) ? [at + 1] : [];
  });
}

/** What a change changed: the steps it touched, by their places, and all of it said in a line. */
export function changesOf(before: NewDraftDto, after: NewDraftDto): { steps: number[]; said: string } {
  const words = CHANGE_WORDS.part;
  const steps = after.steps.flatMap((step, at) => (sameStep(before.steps[at], step) ? [] : [at + 1]));
  const when = after.kind === "once" ? before.at !== after.at : before.run_hour !== after.run_hour;
  const one = after.kind === "once" ? (after.audience === "leads" ? words.email : words.message) : null;
  const parts = [
    before.kind !== after.kind || before.audience !== after.audience ? words.kind : null,
    sameWho(before, after) ? null : words.who,
    when ? words.when : null,
    before.name.trim() === after.name.trim() ? null : words.name,
    ...steps.map((place) => one ?? words.step(place)),
    after.steps.length < before.steps.length ? words.fewer : null,
  ].filter((part): part is string => part !== null);
  return { steps, said: parts.length ? CHANGE_WORDS.changed(parts) : CHANGE_WORDS.same };
}
