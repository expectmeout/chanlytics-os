/**
 * A new sequence (decision 0060, S4: the canvas's New): the owner says in a line what it should do, Ask drafts the flow
 * every sequence has (POST sequences/draft, the `sequence_draft` verb), and the pane shows it as a record's Steps would --
 * what starts it, each step with its wait and its message, what stops it -- with "by Ask" on what Ask chose, so a wrong
 * guess is plain and one line said again redraws it. A value the message takes as typed words is a box here. Nothing is
 * made until the foot is pressed: kept as a draft, which stays under Drafts and sends nothing, or started
 * (`sequence_make`); either opens the sequence's own record. Every word is contracts' (sequence-draft.ts).
 */
import { useState } from "react";
import {
  SEQUENCES_ROUTE,
  SEQUENCE_DRAFT_WORDS_MAX,
  SEQUENCE_NEW_WORDS as W,
  exampleParams,
  fillSlots,
  momentStartsSentence,
  sequenceChannelsWords,
  sequenceRoute,
  sequenceWaitWords,
  stepsStopSentence,
  type AppointmentWord,
  type SequenceDraftDto,
  type SequenceDraftStepDto,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { gate, navigate, refusalToast, useLegacyToast } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { CmPane } from "../parts/split";

/** A typed value's box, by its step and its place among the message's values. */
const typedKey = (step: number, slot: number) => `${step}-${slot}`;

/** A step of the draft, as the record's Steps draws one: its wait, its number, its name, its message and its boxes. */
function DraftStep(p: {
  step: SequenceDraftStepDto;
  place: number;
  business: string;
  typed: Record<string, string>;
  type: (key: string, words: string) => void;
}) {
  const { step, place, business, typed, type } = p;
  // The message as one person would read it, as every composer previews one: an example name, the business's own.
  const values = step.params.map((v, i) =>
    v.kind === "text" ? { kind: "text" as const, value: typed[typedKey(place, i)] ?? v.value } : v,
  );
  const preview = fillSlots(step.message.body, exampleParams(values, business));
  return (
    <li className="sq-step" data-testid={`sq-new-step-${place}`}>
      {step.after_days !== null ? (
        <p className="sq-wait">
          {sequenceWaitWords({ after_days: step.after_days, only_if: step.only_if, kind: "moment" })}{" "}
          <span className="sq-by-ask">{W.byAsk}</span>
        </p>
      ) : null}
      <div className="sq-step-row">
        <span className="sq-node" aria-hidden="true">
          {place}
        </span>
        <div className="sq-step-body">
          <p className="sq-step-line">
            <span className="sq-step-name">{step.name}</span>
            <span className="sq-step-via">{sequenceChannelsWords(step.message.channels)}</span>
          </p>
          <p className="sq-step-said">
            “{step.message.title}” <span className="sq-by-ask">{W.byAsk}</span>
          </p>
          {step.message.body ? <p className="sq-new-body">{preview}</p> : null}
          {step.params.map((v, i) =>
            v.kind === "text" ? (
              <Field
                key={typedKey(place, i)}
                label={`Value ${i + 1}`}
                value={typed[typedKey(place, i)] ?? v.value}
                onValueChange={(words) => type(typedKey(place, i), words)}
                maxLength={200}
                data-testid={`sq-new-value-${place}-${i}`}
              />
            ) : null,
          )}
        </div>
      </div>
    </li>
  );
}

/** What the foot's press makes: the draft's steps with the words typed in their boxes, kept as a draft or started. */
function madeOf(draft: SequenceDraftDto, typed: Record<string, string>, start: boolean) {
  const steps = draft.steps.map((s, at) => ({
    ...s,
    params: s.params.map((v, i) =>
      v.kind === "text" ? { kind: "text" as const, value: typed[typedKey(at + 1, i)] ?? v.value } : v,
    ),
  }));
  const [first, ...then] = steps;
  if (!first) return null;
  return {
    first: {
      name: draft.name,
      trigger: draft.trigger,
      template_id: first.template_id,
      params: first.params,
      run_hour: draft.run_hour,
    },
    then: then.map((s) => ({
      after_days: s.after_days,
      only_if: s.only_if,
      template_id: s.template_id,
      params: s.params,
      name: s.name,
    })),
    start,
  };
}

/** The draft as a record's Steps draws a flow: what Ask could not do, what starts it, its steps, what stops it. */
function DraftFlow(p: {
  draft: SequenceDraftDto;
  word: AppointmentWord;
  asking: boolean;
  typed: Record<string, string>;
  type: (key: string, words: string) => void;
}) {
  const { draft, word, asking, typed, type } = p;
  return (
    <div className="sq-flow" data-testid="sq-new-flow" aria-busy={asking}>
      {draft.cannot ? (
        <p className="sq-new-cannot" data-testid="sq-new-cannot">
          {draft.cannot}
        </p>
      ) : null}
      <p className="sq-flow-end">
        <span className="sq-flow-k">Starts</span>
        <span>
          {momentStartsSentence(draft.trigger, draft.run_hour, word)} <span className="sq-by-ask">{W.byAsk}</span>
        </span>
      </p>
      <ol className="sq-steps">
        {draft.steps.map((step, at) => (
          <DraftStep
            key={`${at}-${step.template_id}`}
            step={step}
            place={at + 1}
            business={draft.business}
            typed={typed}
            type={type}
          />
        ))}
      </ol>
      <p className="sq-flow-end">
        <span className="sq-flow-k">Stops</span>
        <span>{stepsStopSentence(draft.steps)} · never to anyone who said stop</span>
      </p>
    </div>
  );
}

export function NewSequence() {
  const page = useSurface("sequences");
  const [toast, flash] = useLegacyToast();
  const [words, setWords] = useState("");
  const [draft, setDraft] = useState<SequenceDraftDto | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => navigate(SEQUENCES_ROUTE);

  const ask = async () => {
    setAsking(true);
    const previous = draft ? { previous: { name: draft.name, steps: draft.steps.length } } : {};
    const r = await commitVerb("sequence_draft", { words: words.trim(), ...previous });
    setAsking(false);
    if (!r.ok) {
      flash(refusalToast(r));
      return;
    }
    // The draft route's answer, as the typed client names it.
    const drafted: Output<"POST sequences/draft"> = r.data as Output<"POST sequences/draft">;
    setDraft(drafted);
    setTyped({});
  };

  const make = async (start: boolean) => {
    const payload = draft ? madeOf(draft, typed, start) : null;
    if (!payload) return;
    setBusy(true);
    const r = await commitVerb("sequence_make", payload);
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r));
      return;
    }
    // Its record says what landed: a draft with its Start and Discard, or a sequence that is on.
    navigate(r.made ? sequenceRoute(r.made) : SEQUENCES_ROUTE);
  };

  // What the workspace calls an appointment, as the list read says it; the first word until it is read.
  const word = page ? page.word : "appointment";
  return (
    <CmPane
      title={draft ? draft.name : W.title}
      badge={draft ? <StatePill kind="tone" value="plain" label="Draft" /> : null}
      sub={draft ? W.head : null}
      onClose={close}
      testid="sq-new"
      foot={
        draft ? (
          <>
            <p className="sq-new-say">{W.first}</p>
            <Button size="sm" onClick={() => void make(false)} disabled={busy} data-testid="sq-new-keep">
              {W.keep}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void make(true)}
              disabled={busy}
              data-testid="sq-new-start"
              {...gate("approve")}
            >
              <Icon name="play" size={12} /> {W.start}
            </Button>
          </>
        ) : null
      }
    >
      <div className="sq-new">
        <Field
          label={W.ask}
          rows={3}
          value={words}
          onValueChange={setWords}
          placeholder={W.example}
          maxLength={SEQUENCE_DRAFT_WORDS_MAX}
          readOnly={asking}
          data-testid="sq-new-words"
        />
        <div className="sq-new-acts">
          <Button
            size="sm"
            variant={draft ? "secondary" : "primary"}
            onClick={() => void ask()}
            disabled={asking || words.trim().length < 8}
            data-testid="sq-new-draft"
            {...gate("approve")}
          >
            <Icon name="sparkle" size={12} /> {asking ? W.drafting : draft ? W.again : W.draft}
          </Button>
        </div>
        {draft ? (
          <DraftFlow
            draft={draft}
            word={word}
            asking={asking}
            typed={typed}
            type={(key, w) => setTyped((t) => ({ ...t, [key]: w }))}
          />
        ) : null}
      </div>
      {toast}
    </CmPane>
  );
}
