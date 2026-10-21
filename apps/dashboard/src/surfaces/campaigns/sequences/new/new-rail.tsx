/**
 * A draft's steps (decision 0065; the New canvas's B1, B2 and B5), on the rail every sequence's Steps draws (place/rail.tsx):
 * each step a box on its day, its words as one person or business reads them, and the one press that changes each part
 * of it -- its message (one of yours, Ask's, or one written here), its words, a call's or a note's task, the values typed
 * into it -- and between two steps the wait and what must still hold, each a word pressed to change. Then Add a step;
 * where it stops is said once, in what Ask checked (the canvas's option 2). A one-off is its one message, with no rail.
 * Hookless; the sheets each press opens are the draft view's.
 */
import {
  NEW_STEPS_MAX,
  NEW_WORDS as W,
  SCHEDULE_WORDS as SW,
  scheduleChannels,
  type NewDraftDto,
  type NewStep,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Segmented } from "../../../kit/segmented/segmented";
import { gate } from "../../../legacy-verbs";
import { RailAdd, RailBox, RailRow } from "../place/rail";
import { StepWords, WordPick } from "./new-parts";
import type { NewSheet } from "./new-sheets";

/** What a step's parts change, each a change to the draft the view makes. */
export interface RailActs {
  open: (sheet: NewSheet) => void;
  /** The words sheet, on a message written from blank. */
  write: (i: number) => void;
  typed: (i: number, at: number, value: string) => void;
  hand: (i: number, words: string) => void;
  /** A call or a note, turned the other. */
  does: (i: number, does: "call" | "note") => void;
  remove: (i: number) => void;
}

/** Each step's day: the first on day 1, each after it its wait later. */
function stepDaysOf(steps: readonly NewStep[]): number[] {
  let day = 1;
  return steps.map((s, i) => {
    if (i > 0) day += s.after_days ?? 0;
    return day;
  });
}

/** A step's name on its box: its own, else what its message or its task is called. */
function stepTitleOf(step: NewStep, audience: NewDraftDto["audience"], i: number): string {
  if (step.name.trim()) return step.name;
  if (step.does === "call") return W.hand.callTitle;
  if (step.does === "note") return W.hand.noteTitle;
  if (audience === "leads") return i === 0 ? W.sheets.firstEmail : W.sheets.laterEmail;
  return step.message?.title ?? W.does.message;
}

/** How a step goes, on its box: its channels, an email, or a task for you. */
function byOf(step: NewStep, audience: NewDraftDto["audience"]): { glyph: string; words: string } | null {
  if (step.does !== "message") return { glyph: step.does === "call" ? "phone" : "note", words: SW.byTask };
  if (audience === "leads") return { glyph: "mail", words: SW.byEmail };
  const channels = step.message?.channels ?? [];
  if (channels.length === 0) return null;
  return { glyph: channels[0] === "email" ? "mail" : "chat", words: scheduleChannels(channels) };
}

/** A person's step's message, said under its words: the one it sends and the press that changes it, or none yet. */
function PersonParts({ step, i, acts, asked }: { step: NewStep; i: number; acts: RailActs; asked: boolean }) {
  const m = step.message;
  if (!m)
    return (
      <span className="sq-nw-stepacts">
        <WordPick
          label={W.draft.pickOne}
          empty
          onPick={() => acts.open({ kind: "message", i })}
          testid={`sq-nw-pick-${i + 1}`}
        />
        <Button size="sm" variant="quiet" onClick={() => acts.write(i)} data-testid={`sq-nw-write-${i + 1}`}>
          {W.draft.writeOne}
        </Button>
      </span>
    );
  return (
    <>
      <span className="sq-nw-stepacts">
        <span className="sq-nw-k">{W.draft.message}</span>
        <WordPick label={m.title} onPick={() => acts.open({ kind: "message", i })} testid={`sq-nw-pick-${i + 1}`} />
        {m.written ? (
          <>
            {asked ? <span className="sq-nw-by">{W.draft.newByAsk}</span> : null}
            <LinkButton
              size="inherit"
              onClick={() => acts.open({ kind: "words", i })}
              data-testid={`sq-nw-edit-${i + 1}`}
            >
              {W.draft.editWords}
            </LinkButton>
          </>
        ) : null}
      </span>
      {m.params.map((p, at) =>
        p.kind === "text" ? (
          <Field
            key={at}
            label={W.draft.youAdd}
            value={p.value}
            onValueChange={(v) => acts.typed(i, at, v)}
            maxLength={200}
            data-testid={`sq-nw-value-${i + 1}-${at}`}
          />
        ) : null,
      )}
    </>
  );
}

/** A lead's email, said under its words: who wrote it and the press that edits it. */
function LeadParts({ step, i, acts, asked }: { step: NewStep; i: number; acts: RailActs; asked: boolean }) {
  return (
    <span className="sq-nw-stepacts">
      {asked && step.email?.body ? <span className="sq-nw-by">{W.draft.byAsk}</span> : null}
      <LinkButton size="inherit" onClick={() => acts.open({ kind: "words", i })} data-testid={`sq-nw-edit-${i + 1}`}>
        {W.draft.editWords}
      </LinkButton>
    </span>
  );
}

/** A call's or a note's task, as the owner says it for Today: which it is, and what to do when they come up. */
function HandParts({ step, i, acts, asked }: { step: NewStep; i: number; acts: RailActs; asked: boolean }) {
  return (
    <>
      <span className="sq-nw-stepacts">
        <span className="sq-nw-k">{W.draft.youDo}</span>
        <Segmented
          label={W.draft.youDo}
          value={step.does === "note" ? "note" : "call"}
          onValueChange={(v) => acts.does(i, v === "note" ? "note" : "call")}
          options={[
            { value: "call", label: W.does.call, testid: `sq-nw-call-${i + 1}` },
            { value: "note", label: W.does.note, testid: `sq-nw-note-${i + 1}` },
          ]}
        />
        {asked && step.hand ? <span className="sq-nw-by">{W.draft.fromLine}</span> : null}
      </span>
      <Field
        label={W.draft.whatToDo}
        rows={2}
        value={step.hand}
        onValueChange={(v) => acts.hand(i, v)}
        maxLength={280}
        data-testid={`sq-nw-hand-${i + 1}`}
      />
    </>
  );
}

/** One step's box: its number and name, how it goes, its words, and the parts that change it. */
function StepBox(p: { draft: NewDraftDto; i: number; acts: RailActs }) {
  const { draft, i, acts } = p;
  const step = draft.steps[i];
  if (!step) return null;
  const asked = !!draft.said;
  const parts =
    step.does !== "message" ? (
      <HandParts step={step} i={i} acts={acts} asked={asked} />
    ) : draft.audience === "leads" ? (
      <LeadParts step={step} i={i} acts={acts} asked={asked} />
    ) : (
      <PersonParts step={step} i={i} acts={acts} asked={asked} />
    );
  // A message Ask wrote goes to Meta for its WhatsApp version; until then the step goes by email and text.
  const review = step.message?.written?.versions.whatsapp
    ? { tone: "next" as const, words: W.checks.newMessageDetail }
    : null;
  return (
    <RailBox
      place={i + 1}
      title={stepTitleOf(step, draft.audience, i)}
      onOpen={
        step.does !== "message"
          ? null
          : () => acts.open(draft.audience === "leads" ? { kind: "words", i } : { kind: "message", i })
      }
      by={byOf(step, draft.audience)}
      pre={
        <div className="sq-nw-step">
          <StepWords step={step} draft={draft} />
          {parts}
          {i > 0 ? (
            <Button
              size="sm"
              variant="quiet"
              className="sq-nw-remove"
              onClick={() => acts.remove(i)}
              data-testid={`sq-nw-remove-${i + 1}`}
            >
              {W.draft.takeAway}
            </Button>
          ) : null}
        </div>
      }
      state={review}
      testid={`sq-nw-step-now-${i + 1}`}
    />
  );
}

/** What a later step waits on, as its rail says it: not booked, no reply, both, or either way. */
function onlyIfWords(only: readonly string[]): string {
  const O = W.draft.onlyIf;
  const booked = only.includes("no_booking");
  const reply = only.includes("no_reply");
  return booked && reply ? O.both : booked ? O.no_booking : reply ? O.no_reply : O.none;
}

/**
 * The wait before a step and what must still hold, on the rail between two days: each a word pressed to change it (the
 * step's timing sheet). A lead's step stops on a reply on its own, said as the rule it is, never pressed.
 */
function WaitRow({ draft, i, acts }: { draft: NewDraftDto; i: number; acts: RailActs }) {
  const step = draft.steps[i];
  if (!step) return null;
  const open = () => acts.open({ kind: "timing", i });
  return (
    <RailRow gap testid={`sq-nw-wait-${i + 1}`}>
      <span className="sq-nw-wait">
        <WordPick label={W.draft.later(step.after_days ?? 0)} onPick={open} testid={`sq-nw-timing-${i + 1}`} />
        {draft.audience === "leads" ? (
          <span className="sq-nw-fixed">{W.draft.stopsReply}</span>
        ) : (
          <WordPick label={onlyIfWords(step.only_if)} onPick={open} testid={`sq-nw-only-${i + 1}`} />
        )}
      </span>
    </RailRow>
  );
}

/** A sequence's steps on its rail: each on its day, the waits between, and Add a step while it takes another. */
export function DraftRail({ draft, acts }: { draft: NewDraftDto; acts: RailActs }) {
  const days = stepDaysOf(draft.steps);
  const room = draft.steps.length < NEW_STEPS_MAX[draft.audience];
  return (
    <div className="sq-steps-body sq-nw-rail" data-testid="sq-nw-steps">
      <ol className="sq-rail">
        {draft.steps.flatMap((s, i) => [
          i > 0 ? <WaitRow key={`wait-${i}`} draft={draft} i={i} acts={acts} /> : null,
          <RailRow key={`step-${i}`} day={SW.day(days[i] ?? 1)} testid={`sq-nw-step-${i + 1}`}>
            <StepBox draft={draft} i={i} acts={acts} />
          </RailRow>,
        ])}
        {room ? <RailAdd onAdd={() => acts.open({ kind: "add" })} gateProps={gate("approve")} /> : null}
      </ol>
    </div>
  );
}

/** A one-off's one message, as its box: no rail, no wait, no end. */
export function OnceMessage({ draft, acts }: { draft: NewDraftDto; acts: RailActs }) {
  return (
    <>
      <p className="sq-nw-cap">{draft.audience === "leads" ? W.draft.theEmail : W.draft.theMessage}</p>
      <div className="sq-nw-once" data-testid="sq-nw-steps">
        <StepBox draft={draft} i={0} acts={acts} />
      </div>
    </>
  );
}
