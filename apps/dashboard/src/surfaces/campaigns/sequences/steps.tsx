/**
 * A sequence's Steps (the phone review's Steps board): what goes next first, as one capsule that opens who it goes to;
 * then its setup said once, as a flow read top to bottom on one line that joins its nodes. What starts it, with its hour
 * and the act that changes it; each step with the wait before it on its own line, whole, then its message by its title
 * (a door to it in Messages) and how it goes, its words as one person reads them (step-words.tsx), what it sent and drew
 * back in 30 days where it sent any, and its acts: Edit, Send me a test, and its More, where a step after the first is
 * taken away. A customer's sequence may take a step more, never a reminder before a visit (contracts takesFollowUps);
 * what stops it is said where it has steps to stop; and where a sequence to leads sends from. Who approves its batches
 * and what starts it are the head's line, said there once. A customer's step opens in place to be changed
 * (step-editor.tsx); the record's dock opens one too (new words turned down). A sequence to leads marks each step done,
 * going now or still to come; the step going now stands open with the next email as it reads (lead-step.tsx) and the
 * others are one line each. A one-off is its one message, and while it waits for its day, Cancel this send. Every word is
 * contracts' (sequence-words.ts).
 */
import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import {
  PLAYBOOK_HOURS,
  SEQUENCE_ACT_WORDS as A,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_TEST_WORDS as T,
  SEQUENCE_WORDS,
  addressOf,
  clockTime,
  clockWhen,
  leadStepStand,
  sequenceCancels,
  sequenceChannelsWords,
  sequenceNextOf,
  sequenceNextWords,
  sequenceRoute,
  sequenceStartsSentence,
  sequenceStopsSentence,
  sequenceWaitWords,
  takesFollowUps,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import { Select } from "../../kit/select/select";
import { gate, navigate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { addLeadsTo } from "../reach-out/people";
import { FlowRow } from "./flow-row";
import { LeadStepOpen } from "./lead-step";
import { StepEditor } from "./step-editor";
import { StepMessageName, StepWords, useStepMessage } from "./step-words";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

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

/**
 * Add leads: a sequence fed by a list takes leads by hand, so Leads opens with the pile set to add to it (people.tsx);
 * one fed by its search writes to what the search finds, which opens. Which it is, the record says (`fed_by`).
 */
function addLeadsOf(rec: SequenceRecordDto, rootId: string, searchAt: string) {
  if (rec.fed_by === "list") addLeadsTo(rootId, rec.sequence.name);
  else navigate(searchAt);
}

/**
 * What goes next, at the top of anything that runs (the phone review: a reminder's record never said it): when its next
 * batch goes and to how many where they are counted, a capsule that opens who it goes to (People). Nothing for one that
 * is paused, ended, a draft or a one-off, whose day its flow opens with.
 */
function NextLine({ rec }: { rec: SequenceRecordDto }) {
  const nowMs = Date.now();
  const next = sequenceNextOf(rec.sequence, rec.last_run_for, rec.timezone, nowMs);
  if (!next) return null;
  return (
    <a className="sq-next" {...routeDoor(sequenceRoute(rec.sequence.id, "people"))} data-testid="sq-next">
      <span className="sq-next-k">{SEQUENCE_WORDS.next}</span>
      <span className="sq-next-w">{sequenceNextWords(next, rec.timezone, nowMs)}</span>
      <Icon name="chevron" size={12} />
    </a>
  );
}

/**
 * What starts it, with its hour, and its act: the hour changed where a moment or a list starts it, leads added to a
 * search. A one-off's day says itself and no Change: no door moves it to another day or other people.
 */
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
  // Its search's address is the door's, which a new tab opens; a press goes the way the sequence takes leads.
  const searchAt = first?.search_id ? addressOf({ kind: "lead", searchId: first.search_id }) : null;
  const addLeads =
    row.starts === "leads" && first && searchAt ? (
      <LinkButton {...routeDoor(searchAt, () => addLeadsOf(rec, first.id, searchAt))} data-testid="sq-add-leads">
        {F.addLeads} <Icon name="chevron" size={11} />
      </LinkButton>
    ) : null;
  return (
    <FlowRow node={<Icon name={STARTS_GLYPH[row.starts]} size={13} />} end={addLeads} testid="sq-starts">
      <p className="sq-fl-line">
        <span className="sq-fl-starts">{sequenceStartsSentence(row, rec.word, rec.timezone, Date.now())}</span>
        {changes && !open ? (
          <LinkButton onClick={() => setOpen(true)} data-testid="sq-starts-change" {...gate("approve")}>
            {SEQUENCE_WORDS.change}
          </LinkButton>
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

/**
 * What a step did in its batches of the last 30 days, said only where it sent any (a zero is no news under every step);
 * a lead's step going now says when its next go instead.
 */
function StepStats({ sent, replied, next }: { sent: number; replied: number; next: string | null }) {
  if (sent === 0 && replied === 0 && !next) return null;
  const parts: { key: string; said: ReactNode }[] = [];
  if (sent > 0)
    parts.push({
      key: "sent",
      said: (
        <>
          <b>{sent}</b> {F.sent}
        </>
      ),
    });
  if (replied > 0)
    parts.push({
      key: "replied",
      said: (
        <>
          <b>{replied}</b> {F.replied}
        </>
      ),
    });
  parts.push({ key: "when", said: next ?? F.last30 });
  return (
    <p className="sq-fl-done tabular">
      {parts.map((x, i) => (
        <Fragment key={x.key}>
          {i > 0 ? " · " : null}
          {x.said}
        </Fragment>
      ))}
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

/**
 * A customer's step's acts, under its words (the canvas: 32 drawn, a thumb's press): Edit, Send me a test where it has a
 * message to send, and its More, where a step after the first is taken away (asked first).
 */
function StepActs(p: {
  rec: SequenceRecordDto;
  step: SequenceStepDto;
  flash: Flash;
  onEdit: () => void;
  onTakeAway: () => void;
}) {
  const { rec, step, flash } = p;
  // Send me a test mails the step's message to the member alone: nothing on the page moves, so nothing is read again.
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    await pressed("sequence_test", { sequence_id: rec.sequence.id, step_id: step.id }, flash, () => undefined);
    setTesting(false);
  };
  return (
    <div className="sq-acts">
      <Button size="sm" onClick={p.onEdit} data-testid={`sq-step-edit-${step.place}`} {...gate("approve")}>
        {SEQUENCE_WORDS.edit}
      </Button>
      {step.template_id ? (
        <Button
          size="sm"
          onClick={() => void test()}
          disabled={testing}
          aria-busy={testing}
          title={T.tip}
          data-testid={`sq-step-test-${step.place}`}
          {...gate("approve")}
        >
          {testing ? T.sending : T.press}
        </Button>
      ) : null}
      {step.place > 1 ? (
        <Menu
          label={A.more(`step ${step.place}`)}
          trigger={
            <Button
              size="sm"
              iconOnly
              aria-label={A.more(`step ${step.place}`)}
              data-testid={`sq-step-more-${step.place}`}
            >
              <Icon name="more" size={14} />
            </Button>
          }
          groups={[
            {
              items: [
                {
                  label: F.takeAway,
                  glyph: <Icon name="x" size={13} />,
                  tone: "danger",
                  gate: gate("approve"),
                  onSelect: p.onTakeAway,
                },
              ],
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/** A customer's step's message: its words as one person reads them, or, where its message is gone, the act that picks one. */
function CustomerStepBody({ step, onEdit }: { step: SequenceStepDto; onEdit: () => void }) {
  const message = useStepMessage(step.template_name, step.template_language);
  return (
    <StepWords
      name={step.template_name}
      message={message}
      params={step.params}
      gone={
        <Button size="sm" onClick={onEdit} data-testid={`sq-step-pick-${step.place}`} {...gate("approve")}>
          {F.pickMessage}
        </Button>
      }
      testid={`sq-step-words-${step.place}`}
    />
  );
}

/** A customer's step's title: its message's, a door to it in Messages. */
function CustomerStepName({ step }: { step: SequenceStepDto }) {
  const message = useStepMessage(step.template_name, step.template_language);
  return <StepMessageName name={step.template_name} message={message} testid={`sq-step-words-${step.place}`} />;
}

/** Where a lead's step stands, and when its next go where it is the one going now (the Leads board's nodes). */
function leadStandOf(rec: SequenceRecordDto, step: SequenceStepDto) {
  const next = rec.sequence.next;
  if (rec.sequence.starts !== "leads") return { stand: null, nextWords: null };
  const stand = leadStepStand(step.place, step.sent, next?.place ?? null);
  const nextWords =
    stand === "now" && next ? F.next(next.people, clockWhen(Date.parse(next.at), rec.timezone, Date.now())) : null;
  return { stand, nextWords };
}

/**
 * A step's line: its name (a customer's by its message's title, a door to it in Messages; a lead's by its own, a press
 * opening it where it stands folded), how it goes, and Going now for a lead's step under way.
 */
function StepLine(p: { step: SequenceStepDto; shown: StepShown; going: boolean; onOpen: () => void }) {
  const { step, shown } = p;
  const customer = step.kind === "moment" && !step.hand;
  // Each lead's email is written for its business: said once, where the flow says where they send from.
  const via = step.hand ? F.call : sequenceChannelsWords(step.channels);
  return (
    <p className="sq-fl-line">
      {customer ? (
        <CustomerStepName step={step} />
      ) : shown === "line" ? (
        <LinkButton
          size="inherit"
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
      {via ? <span className="sq-fl-via">{via}</span> : null}
      {p.going ? <span className="sq-fl-now">{F.goingNow}</span> : null}
    </p>
  );
}

/** What a step opens onto: its editor while it is changed, else its words (a customer's), the next email (a lead's) or the call. */
function StepOpen(p: StepProps) {
  const { rec, step, shown } = p;
  const next = rec.sequence.next;
  if (shown === "edit")
    return (
      <StepEditor
        sequenceId={rec.sequence.id}
        step={step}
        policyClass={rec.sequence.first?.policy_class ?? ""}
        batchId={rec.sequence.needs.batches.find((x) => x.step_id === step.id)?.id ?? null}
        flash={p.flash}
        onDone={p.onDone}
        onCancel={p.onCancel}
      />
    );
  if (shown !== "open") return null;
  if (step.hand) return <p className="sq-msg-none">{step.hand.words}</p>;
  if (rec.sequence.starts === "leads")
    return <LeadStepOpen batch={next && next.place === step.place ? next.id : null} />;
  return <CustomerStepBody step={step} onEdit={p.onEdit} />;
}

/** New words waiting on WhatsApp, or turned down (amber), and what the step sends meanwhile. */
function NewWords({ step }: { step: SequenceStepDto }) {
  if (!step.next_words) return null;
  const refused = step.next_words.status === "rejected";
  return (
    <div className="sq-fl-next" data-testid={`sq-step-next-${step.place}`}>
      <p className={refused ? "sq-needs" : undefined}>{F.newWords(refused)}</p>
      <p className="sq-fl-keeps">{F.keepsWords}</p>
    </div>
  );
}

/** One step of the flow: the wait before it, its line, its words and acts (or its editor), what it did. */
function Step(p: StepProps) {
  const { rec, step, flash, moved, shown } = p;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  // A customer's step opens to be changed (its first, its words alone); one after the first may be taken away.
  const customer = step.kind === "moment" && !step.hand;
  const { stand, nextWords } = leadStandOf(rec, step);
  const remove = async () => {
    setBusy(true);
    await pressed("sequence_step_remove", { sequence_id: rec.sequence.id, step_id: step.id }, flash, moved);
    setBusy(false);
    setSure(false);
  };
  const editing = shown === "edit";
  return (
    <FlowRow
      node={
        step.hand ? <Icon name="phone" size={12} /> : stand === "done" ? <Icon name="check" size={12} /> : step.place
      }
      tone={editing || stand === "now" ? "now" : stand === "done" ? "done" : null}
      open={editing}
      testid={`sq-step-${step.place}`}
    >
      {/* The wait before it, on its own line and whole, however many lines it takes: a step's when is never cut. */}
      {step.place > 1 ? (
        <p className="sq-fl-wait">
          <Icon name="clock" size={11} /> <span>{sequenceWaitWords(step)}</span>
        </p>
      ) : null}
      <StepLine step={step} shown={shown} going={stand === "now"} onOpen={p.onOpen} />
      <StepOpen {...p} />
      {editing ? null : <NewWords step={step} />}
      {editing ? null : <StepStats sent={step.sent} replied={step.replied} next={nextWords} />}
      {customer && shown === "open" ? (
        <StepActs rec={rec} step={step} flash={flash} onEdit={p.onEdit} onTakeAway={() => setSure(true)} />
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

/**
 * A one-off's one message (the canvas's One-off board): its batch's message as the record reads it (`one_off`), by its
 * title, how it goes (its sends' channels, none guessed), its words as every step's are, and what it sent and drew back
 * once it went, as History counts its day (the row's last batch, which is this one). Its name alone where the record holds
 * no message.
 */
function DateStep({ rec, date }: { rec: SequenceRecordDto; date: NonNullable<SequenceRecordDto["sequence"]["date"]> }) {
  const m = rec.one_off?.template_name ? rec.one_off : null;
  const message = useStepMessage(m?.template_name ?? null, m?.template_language ?? null);
  const went = date.state === "sent";
  const last = rec.sequence.last?.id === date.batch_id ? rec.sequence.last : null;
  const via = sequenceChannelsWords(rec.one_off?.channels ?? []);
  return (
    <FlowRow node={went ? <Icon name="check" size={12} /> : 1} tone={went ? "done" : null} testid="sq-step-1">
      <p className="sq-fl-line">
        {m ? (
          <StepMessageName name={m.template_name} message={message} testid="sq-step-words-1" />
        ) : (
          <span className="sq-fl-name">{rec.sequence.name}</span>
        )}
        {via ? <span className="sq-fl-via">{via}</span> : null}
      </p>
      {m ? <StepWords name={m.template_name} message={message} params={m.params} testid="sq-step-words-1" /> : null}
      {went && last ? <StepStats sent={last.sent} replied={last.replied} next={null} /> : null}
    </FlowRow>
  );
}

/** Where a sequence to leads sends from: its own settings line after the flow. */
function SendsFrom({ rec }: { rec: SequenceRecordDto }) {
  const first = rec.sequence.first;
  if (rec.sequence.starts !== "leads" || !first) return null;
  return (
    <div className="sq-settings">
      <p className="sq-setting" data-testid="sq-sends-from">
        <span className="sq-fl-k">{F.sendsFrom}</span>
        <span>
          {first.owner_sends ? F.fromYou : F.fromMailboxes} · <span className="sq-fl-src">{F.writtenEach}</span>
        </span>
        <LinkButton {...routeDoor(addressOf({ kind: "channel" }))} data-testid="sq-mailboxes">
          {first.owner_sends ? F.connect : F.mailboxes}
        </LinkButton>
      </p>
    </div>
  );
}

interface StepsProps {
  rec: SequenceRecordDto;
  flash: Flash;
  moved: () => void;
  /** The step open to be changed ("new" for a step being added), held by the record so its dock can open one. */
  editing: string | null;
  onEditing: (id: string | null) => void;
  /** Cancel this send, asked first by the record (a one-off waiting for its day). */
  onCancelSend: () => void;
}

export function SequenceSteps({ rec, flash, moved, editing, onEditing, onCancelSend }: StepsProps) {
  // A sequence to leads holds one step open: the one going now until another is pressed.
  const [picked, setPicked] = useState<number | null>(null);
  const done = () => {
    onEditing(null);
    moved();
  };
  const row = rec.sequence;
  const leads = row.starts === "leads";
  const openPlace = picked ?? row.next?.place ?? 1;
  const shownOf = (step: SequenceStepDto): StepShown =>
    editing === step.id ? "edit" : !leads || step.hand || step.place === openPlace ? "open" : "line";
  return (
    <div className="sq-steps-body" data-testid="sq-steps">
      <NextLine rec={rec} />
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
            onEdit={() => onEditing(step.id)}
            onOpen={() => setPicked(step.place)}
            onDone={done}
            onCancel={() => onEditing(null)}
          />
        ))}
        {row.starts === "date" && row.date ? <DateStep rec={rec} date={row.date} /> : null}
        {takesFollowUps(row) ? (
          editing === "new" ? (
            <FlowRow node={rec.steps.length + 1} tone="now" open testid="sq-step-new">
              <p className="sq-fl-line">
                <span className="sq-fl-name">{SEQUENCE_WORDS.addFollowUp}</span>
              </p>
              <StepEditor
                sequenceId={row.id}
                step={null}
                policyClass={row.first?.policy_class ?? ""}
                flash={flash}
                onDone={done}
                onCancel={() => onEditing(null)}
              />
            </FlowRow>
          ) : (
            <FlowRow node={<Icon name="plus" size={12} />} tone="dot">
              <Button
                size="sm"
                variant="quiet"
                className="sq-fl-add"
                onClick={() => onEditing("new")}
                data-testid="sq-add-step"
                {...gate("approve")}
              >
                {SEQUENCE_WORDS.addFollowUp}
              </Button>
            </FlowRow>
          )
        ) : null}
        {/* What stops it, where it has steps to stop: a sequence of one message stops when it has sent it. */}
        {rec.steps.length > 1 ? (
          <FlowRow node={<Icon name="stop" size={11} />} testid="sq-stops">
            <p className="sq-fl-line">
              <span className="sq-fl-k">{F.stops}</span>
              <span>
                {sequenceStopsSentence(row, rec.steps)} · <span className="sq-fl-src">{F.stopsAlways}</span>
              </span>
            </p>
          </FlowRow>
        ) : null}
      </ol>
      {sequenceCancels(row) ? (
        <div className="sq-acts sq-flow-end">
          <Button
            size="sm"
            variant="quiet"
            tone="danger"
            onClick={onCancelSend}
            data-testid="sq-cancel-ask"
            {...gate("approve")}
          >
            {F.cancelSend}
          </Button>
        </div>
      ) : null}
      <SendsFrom rec={rec} />
    </div>
  );
}
