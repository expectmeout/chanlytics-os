/**
 * The one New (decision 0060, S4: the canvas's New; the Campaigns wiring review's rule F, lane 6, 19 Oct 2026: one New,
 * which asks who and when, replaces New sequence and New message). First who it is for and when it goes, the four ways a
 * sequence starts. On a moment or a list, the owner says in a line what it should do, and Ask drafts the flow every
 * sequence has (POST sequences/draft, the `sequence_draft` verb), drawn as a record's Steps draws it (flow-row.tsx) -- what
 * starts it, each step with its wait, its message as one person reads it and its boxes, what stops it -- with "by Ask" on
 * what Ask chose, so a wrong guess is plain and one line said again redraws it. A list is picked from the lists a campaign
 * may run on (playbooks' pools), read only once a list is asked for. Nothing is made until the foot is pressed: kept as a
 * draft, which stays under Drafts and sends nothing, or started (`sequence_make`); either opens the sequence's own record.
 *
 * Once (Send once is New with "now") and leads are drawn here too, where they were a composer of their own one press
 * away (home/new-message.tsx: the send screen, and Write to leads): each its own chunk, asked for as it is picked. The
 * choice is the address's (`new:once[:to:<audience>]`, `new:leads`), replaced as it is made, so every door opens New with
 * who filled in: People's and a list's "message these people", Send it again, the Calendar. Every word is contracts'
 * (sequence-draft.ts).
 */
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
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
  newForLeadsRoute,
  newSequenceLine,
  newSequenceRoute,
  sendOnceRoute,
  sequenceChannelsWords,
  sequenceRoute,
  sequenceWaitWords,
  stepsStopSentence,
  type AppointmentWord,
  type NewWho,
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
import { gate, navigate, refusalToast, replaceRoute, routeDoor, useLegacyToast } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { HomeReading } from "../home/failed";
import { useCampaignsToast } from "../home/route-toast";
import { MessagePreview } from "../parts/message-preview";
import { CmPane } from "../parts/split";
import { FlowRow } from "./flow-row";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** The four ways a sequence starts, in the chooser's order: who it is for and when it goes. */
type StartsOn = "moment" | "list" | "date" | "leads";
const STARTS_ON: readonly StartsOn[] = ["moment", "list", "date", "leads"];
const isStartsOn = (v: string): v is StartsOn => STARTS_ON.some((s) => s === v);

/** The way it starts that the address's who names: once is a message sent once (`date`); none, a moment. */
const startsOnOf = (who: NewWho | null): StartsOn => (who === "once" ? "date" : who === "leads" ? "leads" : "moment");

/** Who a way it starts is for, as the address says it: a moment and a list are New's own address, and say none. */
const whoOf = (on: StartsOn): NewWho | null => (on === "date" ? "once" : on === "leads" ? "leads" : null);

/** Send once and Write to leads, each its own chunk (Sent's send screen, the searches): asked for as one is picked. */
const NewOnce = lazy(() => import("../home/new-message").then((m) => ({ default: m.NewOnce })));
const NewForLeads = lazy(() => import("../reach-out/sources").then((m) => ({ default: m.WriteToLeads })));

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

/** Who and when: the four ways it starts, and what the one picked does. */
function StartsChooser({ on, onStarts }: { on: StartsOn; onStarts: (on: StartsOn) => void }) {
  return (
    <div className="sq-new-starts">
      <Segmented
        label={W.starts}
        value={on}
        onValueChange={(v) => onStarts(isStartsOn(v) ? v : "moment")}
        options={STARTS_ON.map((s) => ({ value: s, label: W.startsOn[s], testid: `sq-new-on-${s}` }))}
      />
      <p className="sq-new-body">{W.startsHint[on]}</p>
    </div>
  );
}

interface SayItProps {
  on: StartsOn;
  /** Who and when, until a draft is in (StartsChooser). */
  chooser: ReactNode;
  list: SequenceDraftListDto | null;
  onList: (list: SequenceDraftListDto | null) => void;
  words: string;
  onWords: (words: string) => void;
  drafted: boolean;
  asking: boolean;
  onAsk: () => void;
}

/**
 * What the owner says before Ask drafts: who and when (until a draft is in), the list it starts on, and their line with
 * Draft it; leads, the searches whose leads it is written to, in their place.
 */
function SayIt(p: SayItProps) {
  const { on, list, words, drafted, asking } = p;
  const mayAsk = words.trim().length >= 8 && (on !== "list" || list !== null);
  return (
    <>
      {drafted ? null : p.chooser}
      {on === "list" && !drafted ? <ListPick value={list?.token ?? ""} onPick={p.onList} /> : null}
      {on === "leads" ? (
        <div className="sq-new-part" data-testid="sq-new-part-leads">
          <Suspense fallback={<HomeReading testid="cmh-composer-reading" />}>
            <NewForLeads />
          </Suspense>
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

/**
 * Once: Send once's screen is New's pane (home/new-message.tsx), its who and when over its sentence, its Cancel New's
 * Close; New's own pane says it is reading until the screen can be drawn. Its toast is the route's where it stands under
 * Campaigns' mount, so what a send says outlives New.
 */
function NewOncePane(p: {
  to: string | null;
  flash: Flash;
  chooser: ReactNode;
  onClose: () => void;
  toast: ReactNode;
}) {
  const pane = (body: ReactNode) => (
    <CmPane title={W.title} onClose={p.onClose} testid="sq-new">
      <div className="sq-new">
        {p.chooser}
        {body}
      </div>
    </CmPane>
  );
  return (
    <>
      <Suspense fallback={pane(<HomeReading testid="cmh-composer-reading" />)}>
        <NewOnce
          to={p.to}
          flash={p.flash}
          onDone={p.onClose}
          onYes={(route) => replaceRoute(route)}
          above={p.chooser}
          pane={pane}
        />
      </Suspense>
      {p.toast}
    </>
  );
}

/** A draft's foot: when it starts, then Keep as a draft and Start. */
function draftFoot(busy: boolean, make: (start: boolean) => Promise<void>) {
  return (
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
  );
}

interface NewSequenceProps {
  /** The moment its address names (`new:moment:<trigger>`) where a door asked for one. */
  moment?: string | null;
  /** Who its address names (`new:once`, `new:leads`) where a door asked for them. */
  who?: NewWho | null;
  /** The audience a door asked to message (`new:once:to:<audience>`). */
  to?: string | null;
}

/** New, on the moment or for whom its address names. */
export function NewSequence({ moment = null, who = null, to = null }: NewSequenceProps) {
  const page = useSurface("sequences");
  const [toast, flash] = useLegacyToast();
  // What a send made in Send once says outlives New, which closes as it sends: the route's toast (route-toast.ts).
  const hosted = useCampaignsToast();
  const [on, setOn] = useState<StartsOn>(() => startsOnOf(who));
  // The address chose it (a door, Back): New follows it, keeping a moment or a list picked where it names neither.
  useEffect(() => setOn((was) => (whoOf(was) === who ? was : startsOnOf(who))), [who]);
  // Who it is for is the address's, replaced as it is picked: a reload opens on it, Back is where New was opened from, and
  // the moment or the audience a door named is kept.
  const pick = (next: StartsOn) => {
    setOn(next);
    const nextWho = whoOf(next);
    if (nextWho === who) return;
    replaceRoute(
      nextWho === "once" ? sendOnceRoute(to) : nextWho === "leads" ? newForLeadsRoute() : newSequenceRoute(moment),
    );
  };
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
  const chooser = <StartsChooser on={on} onStarts={pick} />;
  if (on === "date")
    return <NewOncePane to={to} flash={hosted ?? flash} chooser={chooser} onClose={close} toast={toast} />;
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
      foot={draft ? draftFoot(busy, make) : null}
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
            chooser={chooser}
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
