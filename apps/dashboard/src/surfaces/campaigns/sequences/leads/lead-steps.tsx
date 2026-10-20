/**
 * A sequence to leads' parts of the one record's Steps (the Campaigns wiring review's rule E, lane 5, 19 Oct 2026: every
 * sequence draws the one rail, place/rail.tsx StepsRail, and four parts change with who it is for). Who joins it (its
 * Start: who, how many are in it, the day's pace, How it runs and Add leads); how its words are written (each step a box
 * on its day, the first by its subject with its values by name, a follow-up as the follow-up it is, two lines of its email
 * or "Not written yet" in amber, and its sheet, step-sheet.tsx, with Insert and Preview); where it sends from (under the
 * rail, with the door to its mailboxes); and the check (How it runs, runs-sheet.tsx). Add a step stands above the call
 * that always closes it. The rail is the draft as it is being written (use-chain.ts), so a step added or taken out shows
 * at once; what each step did in 30 days and what it is doing are the record's. The record's dock opens a step too
 * (`editing`: Write step N). It drew a rail of its own (the lead-to-sequence canvas's board A), beside the customers'.
 */
import { useEffect, useState } from "react";
import {
  LEAD_BUILD_WORDS as W,
  SCHEDULE_WORDS as SW,
  SEQUENCE_FLOW_WORDS as F,
  addressOf,
  leadBuildStepsOf,
  leadDraftChainOf,
  leadStartOf,
  reachOutInsertStep,
  reachOutMayInsertStep,
  scheduleDays,
  scheduleEnd,
  scheduleSpan,
  scheduleStepState,
  type LeadBuildPart,
  type ScheduleCtx,
  type SequenceRecordDto,
  type SequenceRowDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { gate, routeDoor, type LegacyFlash } from "../../../legacy-verbs";
import { addLeadsTo } from "../../reach-out/people";
import { RailAdd, RailBox, RailRow, RailStart, StepsRail, type RailStep } from "../place/rail";
import { LeadRunsSheet } from "./runs-sheet";
import { LeadStepSheet } from "./step-sheet";
import { useLeadChain } from "./use-chain";
import "./build.css";

type Flash = (f: LegacyFlash) => void;

/** A step's words with each value a chip by its name, as the editor draws them. */
function Parts({ parts }: { parts: readonly LeadBuildPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} className="ld-slotname">
            {p.label}
          </span>
        ),
      )}
    </>
  );
}

/** What it sent and drew back in 30 days, where it sent any. */
function LeadStepFigures({ sent, replied }: { sent: number; replied: number }) {
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

interface LeadStepsProps {
  rec: SequenceRecordDto;
  flash: Flash;
  moved: () => void;
  ctx: Omit<ScheduleCtx, "gone">;
  /** The step the record's dock opened to be written (its id), or none. */
  editing: string | null;
  onEditing: (id: string | null) => void;
  /** How it runs, asked open by the head's Who approves: a count, each ask opening it again. */
  howAsked: number;
}

/**
 * Who joins it: who it starts with and when (contracts leadStartOf), How it runs, which opens its sheet, and Add leads,
 * which takes the finder to the search its leads came from.
 */
function LeadStartRow({
  row,
  start,
  onRuns,
}: {
  row: SequenceRowDto;
  start: ReturnType<typeof leadStartOf>;
  onRuns: () => void;
}) {
  return (
    <RailStart
      day={SW.start}
      lead={
        <>
          {start.lead}
          <b>{start.name}</b>
        </>
      }
      sub={start.sub}
      acts={
        <>
          {/* Its doors as the run's are (the run-to-leads canvas's Open in Campaigns): inset pills, a thumb's reach. */}
          <Button size="sm" className="sq-rail-go" onClick={onRuns} data-testid="ld-how-it-runs">
            {W.howItRuns} <Icon name="chevron" size={11} />
          </Button>
          <Button
            size="sm"
            className="sq-rail-go"
            onClick={() =>
              addLeadsTo(row.id, row.name, row.first?.source_search_id ?? row.first?.source_could?.id ?? null)
            }
            data-testid="sq-add-leads"
            {...gate("approve", "add leads to this sequence")}
          >
            <Icon name="plus" size={12} /> {F.addLeads}
          </Button>
        </>
      }
    />
  );
}

/** Where it sends from, under the rail: the owner's own inbox or the workspace's mailboxes, with the door to them. */
function SendsFrom({ rec }: { rec: SequenceRecordDto }) {
  const first = rec.sequence.first;
  if (!first) return null;
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

export function LeadSteps({ rec, flash, moved, ctx, editing, onEditing, howAsked }: LeadStepsProps) {
  const lc = useLeadChain(rec, flash, moved);
  const [open, setOpen] = useState<number | null>(null);
  const [runs, setRuns] = useState(false);
  useEffect(() => {
    if (howAsked > 0) setRuns(true);
  }, [howAsked]);
  const draft = lc?.draft ?? null;
  // The dock's Write step N: the step it names, by its place in the draft.
  useEffect(() => {
    if (!editing || !draft) return;
    const at = draft.steps.findIndex((s) => s.id === editing);
    if (at >= 0) setOpen(at + 1);
    onEditing(null);
  }, [editing, draft, onEditing]);
  // While a sheet is open, what the record reads back waits: a word being typed is never put back.
  const holding = open !== null || runs;
  const hold = lc?.hold;
  useEffect(() => {
    hold?.(holding);
  }, [hold, holding]);
  if (!lc || !draft) return null;
  const row = rec.sequence;
  const chain = leadDraftChainOf(lc.chain, draft);
  const boxes = leadBuildStepsOf(chain);
  const dayRows = draft.steps.map((s, i) => ({ place: i + 1, after_days: i === 0 ? null : s.after_days }));
  const days = scheduleDays(dayRows);
  const span = scheduleSpan(row, dayRows);
  const end = scheduleEnd(row, []);
  const start = leadStartOf(row, { ...lc.chain, owner_sends: draft.owner_sends, gap_minutes: draft.gap_minutes });
  const last = draft.steps[draft.steps.length - 1];
  const closes = !!last?.hand && draft.steps.length > 1;
  const add = () => {
    const place = closes ? draft.steps.length : draft.steps.length + 1;
    lc.edit(reachOutInsertStep);
    setOpen(place);
  };
  // Each step on its day, after the wait before it: how its words are written is this part's.
  const steps: RailStep[] = chain.steps.flatMap((s, i) => {
    const box = boxes.get(s.id);
    if (!box) return [];
    const place = i + 1;
    const recStep = rec.steps.find((x) => x.id === s.id) ?? null;
    const state = box.unwritten
      ? { tone: "need" as const, words: W.notWritten }
      : recStep
        ? scheduleStepState(row, recStep, { ...ctx, gone: false })
        : null;
    return [
      {
        id: s.id,
        place,
        wait: place > 1 ? { wait: `${W.waits} ${W.afterDays(s.after_days ?? 0)}`, only: W.onlyIfQuiet } : null,
        row: (
          <RailRow day={SW.day(days.get(place) ?? 1)} tone={state?.tone} testid={`sq-step-${place}`}>
            <RailBox
              place={place}
              title={<Parts parts={box.title} />}
              named={box.named}
              onOpen={() => setOpen(place)}
              by={box.hand ? null : { glyph: "mail", words: SW.byEmail }}
              figures={recStep ? <LeadStepFigures sent={recStep.sent} replied={recStep.replied} /> : null}
              pre={
                box.hand ? (
                  <span className="sq-stepbox-pre is-said">{W.callLine}</span>
                ) : box.pre ? (
                  <span className="sq-stepbox-pre">
                    <Parts parts={box.pre} />
                  </span>
                ) : null
              }
              state={state}
              done={state?.tone === "done"}
            />
          </RailRow>
        ),
      },
    ];
  });
  return (
    <StepsRail
      span={{ count: span.count, over: span.over, per: row.state !== "draft" }}
      start={<LeadStartRow row={row} start={start} onRuns={() => setRuns(true)} />}
      steps={steps}
      add={reachOutMayInsertStep(draft) ? <RailAdd onAdd={add} gateProps={gate("approve")} /> : null}
      addAboveLast={closes}
      end={end}
    >
      <SendsFrom rec={rec} />
      <LeadStepSheet open={open !== null} place={open} rec={rec} lc={lc} flash={flash} onClose={() => setOpen(null)} />
      <LeadRunsSheet open={runs} rec={rec} lc={lc} flash={flash} moved={moved} onClose={() => setRuns(false)} />
    </StepsRail>
  );
}
