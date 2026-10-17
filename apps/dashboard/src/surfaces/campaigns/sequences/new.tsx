/**
 * A new sequence (decision 0060, S4: the canvas's New): first what starts it, the four ways a sequence starts. On a moment
 * or a list, the owner says in a line what it should do, and Ask drafts the flow every sequence has (POST sequences/draft,
 * the `sequence_draft` verb), drawn as a record's Steps draws it (flow-row.tsx) -- what starts it, each step with its wait,
 * its message as one person reads it and its boxes, what stops it -- with "by Ask" on what Ask chose, so a wrong guess is
 * plain and one line said again redraws it. A list is picked from the lists a campaign may run on (the composer's own,
 * playbooks' pools), read only once a list is asked for. A date and leads have composers of their own, one press away.
 * Nothing is made until the foot is pressed: kept as a draft, which stays under Drafts and sends nothing, or started
 * (`sequence_make`); either opens the sequence's own record. Every word is contracts' (sequence-draft.ts).
 */
import { useState } from "react";
import {
  SEQUENCES_ROUTE,
  SEQUENCE_DRAFT_WORDS_MAX,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_NEW_WORDS as W,
  SEQUENCE_WORDS,
  SEQUENCE_EDIT_WORDS as E,
  SEQUENCE_STATE_WORDS,
  POLICY_MODE_WORDS,
  exampleParams,
  listStartsSentence,
  momentStartsSentence,
  newSequenceLine,
  sequenceChannelsWords,
  sequenceRoute,
  sequenceWaitWords,
  stepsStopSentence,
  type AppointmentWord,
  type SequenceDraftDto,
  type SequenceDraftListDto,
  type SequenceDraftStepDto,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Notice } from "../../kit/notice/notice";
import { StatePill } from "../../kit/pill/state-pill";
import { Segmented } from "../../kit/segmented/segmented";
import { Select } from "../../kit/select/select";
import { gate, navigate, refusalToast, routeDoor, useLegacyToast } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { MessagePreview } from "../parts/message-preview";
import { CmPane } from "../parts/split";
import { FlowRow } from "./flow-row";

/** The four ways a sequence starts, in the chooser's order. */
type StartsOn = "moment" | "list" | "date" | "leads";
const STARTS_ON: readonly StartsOn[] = ["moment", "list", "date", "leads"];
const isStartsOn = (v: string): v is StartsOn => STARTS_ON.some((s) => s === v);

/** Where a date and leads are written: the one-off composer, and the composer on Write to leads. */
const COMPOSER: Record<"date" | "leads", string> = { date: "campaigns/new", leads: "campaigns/new:leads" };

/** A typed value's box, by its step and its place among the message's values. */
const typedKey = (step: number, slot: number) => `${step}-${slot}`;

/** A step of the draft, as the record's Steps draws one: its node, its line with its wait, its message and its boxes. */
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
  return (
    <FlowRow node={place} testid={`sq-new-step-${place}`}>
      <p className="sq-fl-line">
        <span className="sq-fl-name">{step.name}</span>
        {step.after_days !== null ? (
          <span className="sq-fl-wait">
            <Icon name="clock" size={11} />{" "}
            {sequenceWaitWords({ after_days: step.after_days, only_if: step.only_if, kind: "moment" })}
          </span>
        ) : null}
        <span className="sq-fl-via">{sequenceChannelsWords(step.message.channels)}</span>
      </p>
      <div className="sq-msg">
        {step.message.body ? (
          <MessagePreview
            compact
            bare
            from={business}
            body={step.message.body}
            values={exampleParams(values, business)}
          />
        ) : null}
        <p className="sq-msg-meta">
          <span>
            {F.from} “{step.message.title}”
          </span>
          <span className="sq-by-ask">{W.byAsk}</span>
        </p>
      </div>
      {step.params.map((v, i) =>
        v.kind === "text" ? (
          <Field
            key={typedKey(place, i)}
            label={E.value(i)}
            value={typed[typedKey(place, i)] ?? v.value}
            onValueChange={(words) => type(typedKey(place, i), words)}
            maxLength={200}
            data-testid={`sq-new-value-${place}-${i}`}
          />
        ) : null,
      )}
    </FlowRow>
  );
}

/** The first step's own body: a campaign's, on its moment, or on the list it starts on. */
function firstStepBody(draft: SequenceDraftDto, params: unknown[], templateId: string) {
  const list = draft.list?.token ?? "";
  const on = list.startsWith("seg:")
    ? { list_key: list.slice(4) }
    : list.startsWith("list:")
      ? { list_id: list.slice(5) }
      : {};
  return {
    name: draft.name,
    trigger: draft.trigger,
    ...on,
    ...(draft.list ? { policy_class: draft.policy_class } : {}),
    template_id: templateId,
    params,
    run_hour: draft.run_hour,
  };
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
    first: firstStepBody(draft, first.params, first.template_id),
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

/** What starts the draft, in the flow's first line: its moment at its hour, or the list it starts on. */
function draftStarts(draft: SequenceDraftDto, word: AppointmentWord): string {
  if (draft.list) return listStartsSentence(draft.list.label, draft.run_hour);
  return momentStartsSentence(draft.trigger, draft.run_hour, word);
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
    <div className="sq-steps-body" aria-busy={asking} data-testid="sq-new-flow">
      {draft.cannot ? (
        <p className="sq-new-cannot" data-testid="sq-new-cannot">
          {draft.cannot}
        </p>
      ) : null}
      <ol className="sq-flow">
        <FlowRow node={<Icon name={draft.list ? "users" : "bell"} size={13} />}>
          <p className="sq-fl-line">
            <span className="sq-fl-k">{F.starts}</span>
            <span>{draftStarts(draft, word)}</span>
            <span className="sq-by-ask">{W.byAsk}</span>
          </p>
        </FlowRow>
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
        <FlowRow node={<Icon name="stop" size={11} />}>
          <p className="sq-fl-line">
            <span className="sq-fl-k">{F.stops}</span>
            <span>
              {stepsStopSentence(draft.steps)} · <span className="sq-fl-src">{F.stopsAlways}</span>
            </span>
          </p>
        </FlowRow>
      </ol>
      <div className="sq-settings">
        <p className="sq-setting">
          <span className="sq-fl-k">{SEQUENCE_WORDS.you}</span>
          <span>{POLICY_MODE_WORDS.ask.does}</span>
        </p>
      </div>
    </div>
  );
}

/** The lists a sequence may start on, as the composer offers them: People's, then the workspace's own. */
function ListPick({ value, onPick }: { value: string; onPick: (list: SequenceDraftListDto | null) => void }) {
  const playbooks = useSurface("playbooks");
  const lists = playbooks?.lists ?? [];
  if (playbooks && lists.length === 0) return <p className="sq-new-body">{W.noLists}</p>;
  return (
    <Field
      label={W.whichList}
      control={
        <Select
          value={value}
          onValueChange={(token) => {
            const l = lists.find((x) => x.id === token);
            onPick(l ? { token: l.id, label: l.name } : null);
          }}
          chevron={<Icon name="chevron-down" size={12} />}
          options={lists.map((l) => ({
            value: l.id,
            label: l.name,
            ...(l.candidates === null ? {} : { meta: String(l.candidates) }),
          }))}
          readOnly={!playbooks}
          data-testid="sq-new-list"
        />
      }
    />
  );
}

interface SayItProps {
  on: StartsOn;
  onStarts: (on: StartsOn) => void;
  list: SequenceDraftListDto | null;
  onList: (list: SequenceDraftListDto | null) => void;
  words: string;
  onWords: (words: string) => void;
  drafted: boolean;
  asking: boolean;
  onAsk: () => void;
}

/**
 * What the owner says before Ask drafts: what starts it (until a draft is in), the list it starts on, and their line with
 * Draft it; a date and leads, their composers' door instead.
 */
function SayIt(p: SayItProps) {
  const { on, list, words, drafted, asking } = p;
  const mayAsk = words.trim().length >= 8 && (on !== "list" || list !== null);
  return (
    <>
      {drafted ? null : (
        <div className="sq-new-starts">
          <Segmented
            label={W.starts}
            value={on}
            onValueChange={(v) => p.onStarts(isStartsOn(v) ? v : "moment")}
            options={STARTS_ON.map((s) => ({ value: s, label: W.startsOn[s], testid: `sq-new-on-${s}` }))}
          />
          <p className="sq-new-body">{W.startsHint[on]}</p>
        </div>
      )}
      {on === "list" && !drafted ? <ListPick value={list?.token ?? ""} onPick={p.onList} /> : null}
      {on === "date" || on === "leads" ? (
        <div className="sq-new-acts">
          <Button size="sm" variant="primary" {...routeDoor(COMPOSER[on])} data-testid={`sq-new-open-${on}`}>
            {W.openComposer[on]} <Icon name="chevron" size={11} />
          </Button>
        </div>
      ) : (
        <>
          <Field
            label={W.ask}
            rows={3}
            value={words}
            onValueChange={p.onWords}
            placeholder={W.example}
            maxLength={SEQUENCE_DRAFT_WORDS_MAX}
            readOnly={asking}
            data-testid="sq-new-words"
          />
          <div className="sq-new-acts">
            <Button
              size="sm"
              variant={drafted ? "secondary" : "primary"}
              onClick={p.onAsk}
              disabled={asking || !mayAsk}
              data-testid="sq-new-draft"
              {...gate("approve")}
            >
              <Icon name="sparkle" size={12} /> {asking ? W.drafting : drafted ? W.again : W.draft}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * The sequence that already starts on a moment a door asked for, any but one that ended: Setup's first reminder and Ask's
 * moment card land here whether or not the workspace has one, and a second on a visit moment is refused when started.
 */
function alreadyOn(rows: readonly SequenceRowDto[] | undefined, moment: string | null): SequenceRowDto | null {
  if (!rows || !moment) return null;
  return rows.find((r) => r.starts === "moment" && r.state !== "ended" && r.first?.trigger === moment) ?? null;
}

/** New, on the moment its address names (`new:moment:<trigger>`) where a door asked for one. */
export function NewSequence({ moment = null }: { moment?: string | null }) {
  const page = useSurface("sequences");
  const [toast, flash] = useLegacyToast();
  const [on, setOn] = useState<StartsOn>("moment");
  const [list, setList] = useState<SequenceDraftListDto | null>(null);
  // The owner's own line, once they type; until then the moment's line where a door asked for one, in the workspace's
  // word for an appointment as soon as the list read says it.
  const [typedLine, setWords] = useState<string | null>(null);
  const words = typedLine ?? (moment ? (newSequenceLine(moment, page ? page.word : "appointment") ?? "") : "");
  const already = alreadyOn(page?.sequences, moment);
  const [draft, setDraft] = useState<SequenceDraftDto | null>(null);
  const [saying, setSaying] = useState(true);
  // Each answer of Ask's is drawn afresh, so a draft said again arrives as the first did.
  const [drafted, setDrafted] = useState(0);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => navigate(SEQUENCES_ROUTE);

  const ask = async () => {
    setAsking(true);
    const previous = draft ? { previous: { name: draft.name, steps: draft.steps.length } } : {};
    const r = await commitVerb("sequence_draft", {
      words: words.trim(),
      ...previous,
      ...(on === "list" && list ? { list } : {}),
    });
    setAsking(false);
    if (!r.ok) {
      flash(refusalToast(r));
      return;
    }
    // The draft route's answer, as the typed client names it.
    const answer: Output<"POST sequences/draft"> = r.data as Output<"POST sequences/draft">;
    setDraft(answer);
    setDrafted((n) => n + 1);
    setTyped({});
    setSaying(false);
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

  const discard = () => {
    setDraft(null);
    setTyped({});
    setSaying(true);
  };

  // What the workspace calls an appointment, as the list read says it; the first word until it is read.
  const word = page ? page.word : "appointment";
  return (
    <CmPane
      title={draft ? draft.name : W.title}
      badge={draft ? <StatePill kind="tone" value="plain" label={SEQUENCE_STATE_WORDS.draft} /> : null}
      sub={draft ? W.head : null}
      tools={
        draft ? (
          <Button size="sm" variant="quiet" onClick={discard} data-testid="sq-new-discard">
            {W.discard}
          </Button>
        ) : null
      }
      onClose={close}
      testid="sq-new"
      foot={
        draft ? (
          <>
            <p className="sq-new-say">
              <b>{W.startsWhen}</b> · {W.first}
            </p>
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
        {already && !draft ? (
          <Notice
            line
            fact={W.already(already.name)}
            label={W.already(already.name)}
            act={
              <Button size="sm" {...routeDoor(sequenceRoute(already.id))} data-testid="sq-new-already-open">
                {W.open}
              </Button>
            }
            testid="sq-new-already"
          />
        ) : null}
        {draft && !saying ? (
          <p className="sq-ask-line" data-testid="sq-new-said">
            <Icon name="sparkle" size={14} />
            <span>{draft.said}</span>
            <Button size="sm" variant="quiet" onClick={() => setSaying(true)} data-testid="sq-new-again">
              {W.again}
            </Button>
          </p>
        ) : (
          <SayIt
            on={on}
            onStarts={setOn}
            list={list}
            onList={setList}
            words={words}
            onWords={setWords}
            drafted={draft !== null}
            asking={asking}
            onAsk={() => void ask()}
          />
        )}
        {draft ? (
          <DraftFlow
            key={drafted}
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
