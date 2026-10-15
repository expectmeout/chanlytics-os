/**
 * A sequence's Steps (the canvas's Steps and Leads boards): its setup said once, as a flow read top to bottom on one line
 * that joins its nodes. What starts it, with its hour and the act that changes it; each step with the wait before it
 * written on its own line, its words as one person reads them with their standing (step-words.tsx), how it goes and what it
 * sent and drew back in 30 days; a customer's sequence may take a step more; what stops it; and the settings left, who
 * approves its batches and, for leads, where it sends from. A customer's step opens in place to be changed, and one after
 * the first may be taken away (step-editor.tsx). A sequence to leads marks each step done, going now or still to come; the
 * step going now stands open with the next email as it reads (lead-step.tsx) and the others are one line each, a press
 * opening one and closing the other. Every word is contracts' (sequence-words.ts).
 */
import { useState } from "react";
import type { ReactNode } from "react";
import {
  PLAYBOOK_HOURS,
  POLICY_MODE_WORDS,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_WORDS,
  addressOf,
  clockTime,
  clockWhen,
  leadStepStand,
  sequenceChannelsWords,
  sequenceStartsSentence,
  sequenceStopsSentence,
  sequenceWaitWords,
  type PolicyMode,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Select } from "../../kit/select/select";
import { gate, openAutonomy, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { FlowRow } from "./flow-row";
import { LeadStepOpen } from "./lead-step";
import { StepEditor } from "./step-editor";
import { StepWords } from "./step-words";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

const isMode = (m: string | null): m is PolicyMode => m !== null && m in POLICY_MODE_WORDS;

/** Whether a sequence takes a step after its first here: a customer's, on a moment or a list (D6). */
const takesFollowUps = (rec: SequenceRecordDto) => rec.sequence.starts === "moment" || rec.sequence.starts === "list";

/** The glyph what starts a sequence wears on its node: a moment, a list, a date, a lead. */
const STARTS_GLYPH: Record<SequenceRecordDto["sequence"]["starts"], string> = {
  moment: "bell",
  list: "users",
  date: "calendar",
  leads: "globe",
};

/** An hour as the flow says it ("9:00 AM"), on the business's clock face. */
const hourWords = (h: number) => clockTime(Date.UTC(2026, 0, 1, h), "UTC");

const HOURS = Array.from({ length: PLAYBOOK_HOURS.max - PLAYBOOK_HOURS.min + 1 }, (_, i) => PLAYBOOK_HOURS.min + i);

/** What starts it, with its hour, and its act: the hour changed where a moment or a list starts it, leads added to a search. */
function Starts({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const row = rec.sequence;
  const first = row.first;
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(String(first?.run_hour ?? 10));
  const [busy, setBusy] = useState(false);
  const changes = !!first && (row.starts === "moment" || row.starts === "list");
  const was = String(first?.run_hour ?? 10);
  const cancel = () => {
    setHour(was);
    setOpen(false);
  };
  const save = async () => {
    setBusy(true);
    const ok = await pressed(
      "playbook_change",
      { playbook_id: row.id, name: row.name, run_hour: Number(hour) },
      flash,
      moved,
    );
    setBusy(false);
    if (ok) setOpen(false);
  };
  const addLeads =
    row.starts === "leads" && first?.search_id ? (
      <LinkButton {...routeDoor(addressOf({ kind: "lead", searchId: first.search_id }))} data-testid="sq-add-leads">
        {F.addLeads} <Icon name="chevron" size={11} />
      </LinkButton>
    ) : null;
  return (
    <FlowRow node={<Icon name={STARTS_GLYPH[row.starts]} size={13} />} end={addLeads} testid="sq-starts">
      <p className="sq-fl-line">
        <span className="sq-fl-k">{F.starts}</span>
        <span>{sequenceStartsSentence(row, rec.word, rec.timezone, Date.now())}</span>
        {changes && !open ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setOpen(true)}
            data-testid="sq-starts-change"
            {...gate("approve")}
          >
            {SEQUENCE_WORDS.change}
          </Button>
        ) : null}
      </p>
      {open ? (
        <div className="sq-fl-inline" data-testid="sq-starts-hour">
          <Select
            label={F.hour}
            value={hour}
            onValueChange={setHour}
            options={HOURS.map((h) => ({ value: String(h), label: hourWords(h) }))}
            chevron={<Icon name="chevron-down" size={12} />}
          />
          <Button size="sm" onClick={cancel}>
            {F.cancel}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void save()}
            disabled={busy || hour === was}
            data-testid="sq-starts-save"
          >
            {F.saveHour}
          </Button>
        </div>
      ) : null}
    </FlowRow>
  );
}

/** What a step did in its batches of the last 30 days, at the row's end; the step going now says when its next go. */
function StepDone({ step, next }: { step: SequenceStepDto; next: string | null }) {
  return (
    <p className="sq-fl-done tabular">
      <b>{step.sent}</b> {F.sent} · <b>{step.replied}</b> {F.replied}
      <span className="sq-fl-span">{next ?? F.last30}</span>
    </p>
  );
}

/** How a step stands in the flow: changed in place, open with its words, or one line (a sequence to leads' others). */
type StepShown = "edit" | "open" | "line";

interface StepProps {
  rec: SequenceRecordDto;
  step: SequenceStepDto;
  flash: Flash;
  moved: () => void;
  shown: StepShown;
  onEdit: () => void;
  onOpen: () => void;
  onDone: () => void;
  onCancel: () => void;
}

/** A step's words under its line: a customer's message, a lead's next email, a call for the team. */
function StepBody({ rec, step, acts }: { rec: SequenceRecordDto; step: SequenceStepDto; acts: ReactNode }) {
  const next = rec.sequence.next;
  if (step.hand) return <p className="sq-msg-none">{step.hand.words}</p>;
  if (rec.sequence.starts === "leads")
    return <LeadStepOpen batch={next && next.place === step.place ? next.id : null} />;
  return (
    <StepWords
      name={step.template_name}
      language={step.template_language}
      params={step.params}
      acts={acts}
      testid={`sq-step-words-${step.place}`}
    />
  );
}

/** One step of the flow: its node, its line with the wait before it, its words and acts (or its editor), what it did. */
function Step(p: StepProps) {
  const { rec, step, flash, moved, shown } = p;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  // A customer's step opens to be changed (its first, its words alone); one after the first may be taken away.
  const editable = step.kind === "moment" && !step.hand;
  const later = editable && step.place > 1;
  const leads = rec.sequence.starts === "leads";
  const next = rec.sequence.next;
  const stand = leads ? leadStepStand(step.place, step.sent, next?.place ?? null) : null;
  const nextWords =
    stand === "now" && next ? F.next(next.people, clockWhen(Date.parse(next.at), rec.timezone, Date.now())) : null;
  const remove = async () => {
    setBusy(true);
    await pressed("sequence_step_remove", { sequence_id: rec.sequence.id, step_id: step.id }, flash, moved);
    setBusy(false);
    setSure(false);
  };
  const acts = editable ? (
    <>
      <Button
        size="sm"
        variant="quiet"
        onClick={p.onEdit}
        data-testid={`sq-step-edit-${step.place}`}
        {...gate("approve")}
      >
        {SEQUENCE_WORDS.edit}
      </Button>
      {later ? (
        <Button size="sm" variant="quiet" onClick={() => setSure(true)} {...gate("approve")}>
          {F.takeAway}
        </Button>
      ) : null}
    </>
  ) : null;
  const via = step.hand ? F.call : leads ? F.writtenEach : sequenceChannelsWords(step.channels);
  return (
    <FlowRow
      node={
        step.hand ? <Icon name="phone" size={12} /> : stand === "done" ? <Icon name="check" size={12} /> : step.place
      }
      tone={shown === "edit" || stand === "now" ? "now" : stand === "done" ? "done" : null}
      end={shown === "edit" ? null : <StepDone step={step} next={nextWords} />}
      open={shown === "edit"}
      testid={`sq-step-${step.place}`}
    >
      <p className="sq-fl-line">
        {shown === "line" ? (
          <LinkButton
            className="sq-fl-name"
            aria-expanded={false}
            onClick={p.onOpen}
            data-testid={`sq-step-open-${step.place}`}
          >
            {step.name}
          </LinkButton>
        ) : (
          <span className="sq-fl-name">{step.name}</span>
        )}
        {step.place > 1 ? (
          <span className="sq-fl-wait">
            <Icon name="clock" size={11} /> {sequenceWaitWords(step)}
          </span>
        ) : null}
        <span className="sq-fl-via">{via}</span>
        {stand === "now" ? <span className="sq-fl-now">{F.goingNow}</span> : null}
      </p>
      {shown === "edit" ? (
        <StepEditor
          sequenceId={rec.sequence.id}
          step={step}
          policyClass={rec.sequence.first?.policy_class ?? ""}
          flash={flash}
          onDone={p.onDone}
          onCancel={p.onCancel}
        />
      ) : shown === "open" ? (
        <StepBody rec={rec} step={step} acts={acts} />
      ) : null}
      {step.next_words ? (
        <p className="sq-fl-next" data-testid={`sq-step-next-${step.place}`}>
          {F.newWords(step.next_words.name, step.next_words.status === "rejected")}
        </p>
      ) : null}
      {sure ? (
        <Confirm
          question={F.takeAwayAsk(step.place)}
          detail={F.takeAwayDetail}
          yes={F.takeAway}
          danger
          busy={busy}
          onYes={() => void remove()}
          onNo={() => setSure(false)}
          testid={`sq-step-remove-${step.place}`}
        />
      ) : null}
    </FlowRow>
  );
}

/** The settings left after the flow: where a sequence to leads sends from, and who approves its batches. */
function Settings({ rec }: { rec: SequenceRecordDto }) {
  const mode = isMode(rec.mode) ? POLICY_MODE_WORDS[rec.mode].does : POLICY_MODE_WORDS.ask.does;
  const first = rec.sequence.first;
  return (
    <div className="sq-settings">
      {rec.sequence.starts === "leads" && first ? (
        <p className="sq-setting" data-testid="sq-sends-from">
          <span className="sq-fl-k">{F.sendsFrom}</span>
          <span>{first.owner_sends ? F.fromYou : F.fromMailboxes}</span>
          <LinkButton {...routeDoor(addressOf({ kind: "channel" }))} data-testid="sq-mailboxes">
            {first.owner_sends ? F.connect : F.mailboxes}
          </LinkButton>
        </p>
      ) : null}
      <p className="sq-setting">
        <span className="sq-fl-k">{SEQUENCE_WORDS.you}</span>
        <span>{mode}</span>
        <LinkButton onClick={openAutonomy} data-testid="sq-mode">
          {SEQUENCE_WORDS.change}
        </LinkButton>
      </p>
    </div>
  );
}

export function SequenceSteps({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  // A sequence to leads holds one step open: the one going now until another is pressed.
  const [picked, setPicked] = useState<number | null>(null);
  const done = () => {
    setEditing(null);
    moved();
  };
  const leads = rec.sequence.starts === "leads";
  const openPlace = picked ?? rec.sequence.next?.place ?? 1;
  const shownOf = (step: SequenceStepDto): StepShown =>
    editing === step.id ? "edit" : !leads || step.hand || step.place === openPlace ? "open" : "line";
  return (
    <div className="sq-steps-body" data-testid="sq-steps">
      <ol className="sq-flow">
        <Starts rec={rec} flash={flash} moved={moved} />
        {rec.steps.map((step) => (
          <Step
            key={step.id}
            rec={rec}
            step={step}
            flash={flash}
            moved={moved}
            shown={shownOf(step)}
            onEdit={() => setEditing(step.id)}
            onOpen={() => setPicked(step.place)}
            onDone={done}
            onCancel={() => setEditing(null)}
          />
        ))}
        {takesFollowUps(rec) ? (
          editing === "new" ? (
            <FlowRow node={rec.steps.length + 1} tone="now" open testid="sq-step-new">
              <p className="sq-fl-line">
                <span className="sq-fl-name">{SEQUENCE_WORDS.addFollowUp}</span>
              </p>
              <StepEditor
                sequenceId={rec.sequence.id}
                step={null}
                policyClass={rec.sequence.first?.policy_class ?? ""}
                flash={flash}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            </FlowRow>
          ) : (
            <FlowRow node={<Icon name="plus" size={12} />} tone="dot">
              <Button
                size="sm"
                variant="quiet"
                className="sq-fl-add"
                onClick={() => setEditing("new")}
                data-testid="sq-add-step"
                {...gate("approve")}
              >
                {SEQUENCE_WORDS.addFollowUp}
              </Button>
            </FlowRow>
          )
        ) : null}
        <FlowRow node={<Icon name="stop" size={11} />} testid="sq-stops">
          <p className="sq-fl-line">
            <span className="sq-fl-k">{F.stops}</span>
            <span>
              {sequenceStopsSentence(rec.sequence, rec.steps)} · <span className="sq-fl-src">{F.stopsAlways}</span>
            </span>
          </p>
        </FlowRow>
      </ol>
      <Settings rec={rec} />
    </div>
  );
}
