/**
 * A sequence's Steps as a schedule (the Steps redesign, his pick of A, refined, 17 Oct 2026): a rail of days, read top to
 * bottom. Where it starts (what starts it, a door to its list or search, its hour and the act that changes it); each step a
 * box on its day, the whole box the press that opens it: its number, its message's title, how it goes and what it sent
 * and drew back in 30 days, two lines of its words as one person reads them, and what it is doing now, amber where it
 * needs you (a batch waiting for your OK, a message gone, new words turned down, emails the check held) and quiet where it
 * is only coming (its next run, who is in line). Between two steps, the wait and who it keeps going, on the rail where it
 * happens. Then Add a step (a reminder says once why it takes none), and where it stops. A one-off is its day and its one
 * message, with the way out while it waits. A sequence to leads is written on its own rail (leads/lead-steps.tsx). Every
 * word is contracts' (sequence-schedule.ts). A step opened is the kit's sheet (step-sheet.tsx): its words, its facts and its
 * acts, and its editor in the same sheet; the record's dock opens a step to be changed there too (`editing`).
 */
import { useEffect, useState } from "react";
import {
  SCHEDULE_WORDS as SW,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_WORDS,
  addressOf,
  clockDate,
  scheduleChannels,
  scheduleDays,
  scheduleEnd,
  scheduleSpan,
  scheduleStart,
  scheduleStepState,
  scheduleWait,
  sequenceCancels,
  takesFollowUps,
  type ScheduleCtx,
  type SequencePeopleDto,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { cx } from "../../kit/variants";
import { gate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { LeadSteps } from "./leads/lead-steps";
import { RailBox, RailRow, RailWait } from "./place/rail";
import { SettingsSheet } from "./settings-sheet";
import { StepSheet, type StepSheetTarget } from "./step-sheet";
import { StepPreviewLine, StepWords, useStepMessageRead } from "./step-words";
import { useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** What a step's state is said from, but whether its message is gone: each step's own read says that. */
export type StepsCtx = Omit<ScheduleCtx, "gone">;

/** The thing a sequence starts on, as a door: its list in People. Its name alone where it has none. */
function StartsOn({ rec, name }: { rec: SequenceRecordDto; name: string }) {
  const first = rec.sequence.first;
  const listId = first?.list_id ?? first?.list_key ?? null;
  const at = rec.sequence.starts === "list" && listId ? addressOf({ kind: "list", id: listId }) : null;
  if (!at) return <b>{name}</b>;
  return (
    <LinkButton size="inherit" className="sq-rail-door" {...routeDoor(at)} data-testid="sq-starts-on">
      {name}
    </LinkButton>
  );
}

/**
 * Where it starts: what starts it, the list it starts on a door to it, and the line under (its hour and Change where a
 * moment or a list starts it, a one-off's day and how it stands).
 */
function StartRow(p: { rec: SequenceRecordDto; flash: Flash; moved: () => void; howAsked: number }) {
  const { rec, flash, moved, howAsked } = p;
  const row = rec.sequence;
  const first = row.first;
  // How it runs, in its own sheet; a new key each time it opens, so it opens on what the record holds now. The head's
  // Who approves asks it open too (`howAsked`, a count).
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(0);
  const start = scheduleStart(row, rec.word, { tz: rec.timezone, nowMs: Date.now() });
  const changes = !!first && (row.starts === "moment" || row.starts === "list");
  useEffect(() => {
    if (howAsked === 0 || !changes) return;
    setOpened((n) => n + 1);
    setOpen(true);
  }, [howAsked, changes]);
  return (
    <RailRow day={row.starts === "date" ? SW.date : SW.start} testid="sq-starts">
      <div className="sq-rail-line">
        <span className="sq-rail-lead">
          {row.starts === "date" ? <b>{start.lead}</b> : start.lead}
          {start.name ? <StartsOn rec={rec} name={start.name} /> : null}
        </span>
        <span className="sq-rail-sub">
          {start.sub}
          {changes ? (
            <LinkButton
              onClick={() => {
                setOpened((n) => n + 1);
                setOpen(true);
              }}
              data-testid="sq-starts-change"
              {...gate("approve")}
            >
              {SEQUENCE_WORDS.change}
            </LinkButton>
          ) : null}
        </span>
      </div>
      {changes ? (
        <SettingsSheet key={opened} open={open} rec={rec} flash={flash} moved={moved} onClose={() => setOpen(false)} />
      ) : null}
    </RailRow>
  );
}

/** How a step goes, on its box: its channels, or a task for you (a call). */
function stepBy(step: SequenceStepDto): { glyph: string; words: string } {
  if (step.hand) return { glyph: "phone", words: SW.byTask };
  const channels = step.channels;
  return { glyph: channels[0] === "email" ? "mail" : "chat", words: scheduleChannels(channels) };
}

/** What a step sent and drew back in 30 days, on its box: only where it sent any (a zero is no news on every box). */
function StepFigures({ sent, replied }: { sent: number; replied: number }) {
  if (sent === 0) return null;
  return (
    <span className="sq-stepbox-fig tabular">
      <b>{sent}</b> {F.sent}
      {replied > 0 ? (
        <>
          {" · "}
          <b>{replied}</b> {F.replied}
        </>
      ) : null}
    </span>
  );
}

interface StepRowProps {
  rec: SequenceRecordDto;
  step: SequenceStepDto;
  day: number;
  ctx: StepsCtx;
  onOpen: () => void;
}

/** A step on its day: one box, the whole of it the press that opens its sheet. */
function StepRow({ rec, step, day, ctx, onOpen }: StepRowProps) {
  const customer = step.kind === "moment" && !step.hand;
  const { message, read } = useStepMessageRead(customer ? step.template_name : null, step.template_language);
  // A customer's message is gone only once the messages are read and hold none of it, never while they are read.
  const gone = customer && read && !message;
  const state = scheduleStepState(rec.sequence, step, { ...ctx, gone });
  const done = state?.tone === "done";
  const by = stepBy(step);
  const title = customer ? (message?.title ?? step.template_name ?? F.noMessage) : step.name;
  const said = step.hand ? step.hand.words : gone ? SW.gone : null;
  return (
    <RailRow day={SW.day(day)} need={state?.tone === "need"} testid={`sq-step-${step.place}`}>
      <RailBox
        place={step.place}
        title={title}
        onOpen={onOpen}
        by={by}
        figures={<StepFigures sent={step.sent} replied={step.replied} />}
        pre={
          said ? (
            <span className="sq-stepbox-pre is-said">{said}</span>
          ) : (
            <StepPreviewLine message={message} params={step.params} />
          )
        }
        state={state}
        done={done}
      />
    </RailRow>
  );
}

/** The wait before a step, and who it keeps going, on the rail between the two days. */
function WaitRow({ step }: { step: SequenceStepDto }) {
  const w = scheduleWait(step);
  return <RailWait wait={w.wait} only={w.only} testid={`sq-step-wait-${step.place}`} />;
}

/**
 * A one-off's one message on its day: its batch's message as the record reads it (`one_off`), how it goes, its words as
 * one person reads them, and what it sent and drew back once it went. It opens nothing: no door changes a one-off's
 * words, day or people; it is cancelled and made again.
 */
function DateRow({ rec, date }: { rec: SequenceRecordDto; date: NonNullable<SequenceRecordDto["sequence"]["date"]> }) {
  const m = rec.one_off?.template_name ? rec.one_off : null;
  const { message } = useStepMessageRead(m?.template_name ?? null, m?.template_language ?? null);
  const went = date.state === "sent";
  const last = rec.sequence.last?.id === date.batch_id ? rec.sequence.last : null;
  const channels = rec.one_off?.channels ?? [];
  return (
    <RailRow day={clockDate(Date.parse(date.at), rec.timezone, Date.now())} testid="sq-step-1">
      <div className="sq-stepbox">
        <span className="sq-stepbox-top">
          <span className={cx("sq-stepnum", went && "is-done")} aria-hidden="true">
            {went ? <Icon name="check" size={11} /> : 1}
          </span>
          <span className="sq-stepbox-title">{message?.title ?? m?.template_name ?? rec.sequence.name}</span>
        </span>
        {channels.length > 0 || (went && last) ? (
          <span className="sq-stepbox-meta">
            <span className="sq-stepbox-by">
              {channels.length > 0 ? (
                <>
                  <Icon name={channels[0] === "email" ? "mail" : "chat"} size={13} />
                  {scheduleChannels(channels)}
                </>
              ) : null}
            </span>
            {went && last ? <StepFigures sent={last.sent} replied={last.replied} /> : null}
          </span>
        ) : null}
        {m ? <StepWords name={m.template_name} message={message} params={m.params} testid="sq-step-words-1" /> : null}
      </div>
    </RailRow>
  );
}

/** Where a sequence to leads sends from, at the schedule's foot, with the door to its mailboxes. */
function SendsFrom({ rec }: { rec: SequenceRecordDto }) {
  const first = rec.sequence.first;
  if (rec.sequence.starts !== "leads" || !first) return null;
  return (
    <p className="sq-sendsfrom" data-testid="sq-sends-from">
      <span className="sq-sendsfrom-v">
        <b>{SW.sendsFrom}</b> {first.owner_sends ? F.fromYou : F.fromMailboxes}
      </span>
      <LinkButton {...routeDoor(addressOf({ kind: "channel" }))} data-testid="sq-mailboxes">
        {first.owner_sends ? F.connect : F.mailboxes}
      </LinkButton>
    </p>
  );
}

/** Add a step, a thumb tall at the steps' end; or, on a reminder, the one line that says why it takes none. */
function AddRow({ rec, onAdd }: { rec: SequenceRecordDto; onAdd: () => void }) {
  const row = rec.sequence;
  if (takesFollowUps(row))
    return (
      <RailRow>
        <div className="sq-addstep">
          <Button
            variant="quiet"
            className="sq-addstep-press"
            onClick={onAdd}
            data-testid="sq-add-step"
            {...gate("approve")}
          >
            <Icon name="plus" size={14} /> {SW.addStep}
          </Button>
        </div>
      </RailRow>
    );
  if (row.starts !== "moment") return null;
  return (
    <RailRow>
      <p className="sq-rail-note" data-testid="sq-no-follow-up">
        <Icon name="info" size={13} />
        <span>{F.noFollowUpOnReminder}</span>
      </p>
    </RailRow>
  );
}

interface StepsProps {
  rec: SequenceRecordDto;
  flash: Flash;
  moved: () => void;
  /** A press elsewhere on the record (an approval): who is in line is read again. */
  again: number;
  /** The step open to be changed ("new" for a step being added), held by the record so its dock can open one. */
  editing: string | null;
  onEditing: (id: string | null) => void;
  /** How it runs, asked open by the head's Who approves: a count, each ask opening it again. */
  howAsked: number;
  /** Cancel this send, asked first by the record (a one-off waiting for its day). */
  onCancelSend: () => void;
}

/** The sheet's target for the record's step open to be changed. */
const sheetTargetOf = (editing: string): StepSheetTarget =>
  editing === "new" ? { kind: "new" } : { kind: "step", id: editing };

/**
 * Who is in it, for who is in line for each step and what the check held of each: read where a step after the first has
 * people waiting for it (a one-off has one, a one-step sequence none).
 */
function usePeopleOf(rec: SequenceRecordDto, again: number): SequencePeopleDto | null {
  const wants = rec.sequence.starts !== "date" && rec.steps.length > 1;
  const read = useSequenceRead(wants ? rec.sequence.id : null, verbs.people, verbs.peekPeople, { again });
  return wants && read.state === "read" ? read.data : null;
}

export function SequenceSteps({ rec, flash, moved, again, editing, onEditing, howAsked, onCancelSend }: StepsProps) {
  const row = rec.sequence;
  const people = usePeopleOf(rec, again);
  // What the sheet holds, kept as it leaves; open is the schedule's, or the record's while it holds a step to change.
  const [held, setHeld] = useState<StepSheetTarget | null>(null);
  const [open, setOpen] = useState(false);
  const target = editing ? sheetTargetOf(editing) : held;
  // Ended (End it, or its first step gone): its steps went with it, so it says so, and History keeps what it sent.
  if (row.state === "ended" && row.starts !== "date")
    return (
      <div className="sq-steps-body" data-testid="sq-steps">
        <p className="sq-rail-note" data-testid="sq-ended">
          <Icon name="info" size={13} />
          <span>{SEQUENCE_WORDS.endedLine}</span>
        </p>
      </div>
    );
  const ctx: StepsCtx = { tz: rec.timezone, nowMs: Date.now(), lastRunFor: rec.last_run_for, people };
  // A sequence to leads is written on its record (the lead-to-sequence canvas's Build boards): its own rail and sheets,
  // drawn once its chain is read with it.
  if (row.starts === "leads")
    return rec.chain ? (
      <LeadSteps
        rec={rec}
        flash={flash}
        moved={moved}
        ctx={ctx}
        editing={editing}
        onEditing={onEditing}
        howAsked={howAsked}
      />
    ) : (
      <div className="sq-steps-body" data-testid="sq-steps" aria-busy="true" />
    );
  const days = scheduleDays(rec.steps);
  const span = scheduleSpan(row, rec.steps);
  const end = scheduleEnd(row, rec.steps);
  const openOn = (t: StepSheetTarget) => {
    setHeld(t);
    setOpen(true);
  };
  const close = () => {
    setHeld(target);
    setOpen(false);
    onEditing(null);
  };
  // The editor's Cancel or Save: back to the step as it reads, or closed where the step was still to come.
  const editDone = () => {
    if (target?.kind === "step") openOn(target);
    else setOpen(false);
    onEditing(null);
  };
  return (
    <div className="sq-steps-body" data-testid="sq-steps">
      <p className="sq-span">
        <span>
          <b>{span.count}</b>
          {span.over ? ` ${span.over}` : null}
        </span>
        {row.starts === "date" ? null : <span className="sq-span-per">{SW.per}</span>}
      </p>
      <ol className="sq-rail">
        <StartRow rec={rec} flash={flash} moved={moved} howAsked={howAsked} />
        {rec.steps.flatMap((step) => [
          step.place > 1 ? <WaitRow key={`wait-${step.id}`} step={step} /> : null,
          <StepRow
            key={step.id}
            rec={rec}
            step={step}
            day={days.get(step.place) ?? 1}
            ctx={ctx}
            onOpen={() => openOn({ kind: "step", id: step.id })}
          />,
        ])}
        {row.starts === "date" && row.date ? <DateRow rec={rec} date={row.date} /> : null}
        {row.starts === "date" ? null : <AddRow rec={rec} onAdd={() => onEditing("new")} />}
        {end ? (
          <RailRow day={SW.end} testid="sq-stops">
            <div className="sq-rail-line">
              <span className="sq-rail-lead">
                <b>{end.head}</b>
              </span>
              <span className="sq-rail-sub">{end.sub}</span>
            </div>
          </RailRow>
        ) : null}
      </ol>
      {sequenceCancels(row) ? (
        <>
          <p className="sq-rail-note">
            <Icon name="info" size={13} />
            <span>{SW.oneOffNote}</span>
          </p>
          <div className="sq-rail-out">
            <Button
              variant="quiet"
              tone="danger"
              onClick={onCancelSend}
              data-testid="sq-cancel-ask"
              {...gate("approve")}
            >
              {F.cancelSend}
            </Button>
          </div>
        </>
      ) : null}
      <SendsFrom rec={rec} />
      <StepSheet
        open={open || editing !== null}
        target={target}
        rec={rec}
        edit={editing !== null}
        ctx={ctx}
        flash={flash}
        moved={moved}
        onEdit={() => onEditing(target?.kind === "step" ? target.id : "new")}
        onEditDone={editDone}
        onClose={close}
      />
    </div>
  );
}
