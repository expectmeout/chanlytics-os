/**
 * A sequence to leads' Steps (the lead-to-sequence canvas's board A: the draft is the record, same tabs, Start row, dock):
 * where it starts (who joins it, how many are in it, the day's pace, and How it runs), each step a box on its day (the
 * first by its subject with its values by name, a follow-up as the follow-up it is, two lines of its email or "Not
 * written yet" in amber), the wait between two and who it keeps going, Add a step above the call that always closes it,
 * and where it stops. The rail is the draft as it is being written (use-chain.ts), so a step added or taken out shows at
 * once; what each step did in 30 days and what it is doing are the record's. A box opens its sheet (step-sheet.tsx); the
 * record's dock opens one too (`editing`: Write step N).
 */
import { useEffect, useState } from "react";
import {
  LEAD_BUILD_WORDS as W,
  SCHEDULE_WORDS as SW,
  SEQUENCE_FLOW_WORDS as F,
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
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { gate, type LegacyFlash } from "../../../legacy-verbs";
import { addLeadsTo } from "../../reach-out/people";
import { RailBox, RailRow, RailWait } from "../place/rail";
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
}

export function LeadSteps({ rec, flash, moved, ctx, editing, onEditing }: LeadStepsProps) {
  const lc = useLeadChain(rec, flash, moved);
  const [open, setOpen] = useState<number | null>(null);
  const [runs, setRuns] = useState(false);
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
  const addRow = reachOutMayInsertStep(draft) ? (
    <RailRow key="add">
      <div className="sq-addstep">
        <Button
          variant="quiet"
          className="sq-addstep-press"
          onClick={add}
          data-testid="sq-add-step"
          {...gate("approve")}
        >
          <Icon name="plus" size={14} /> {SW.addStep}
        </Button>
      </div>
    </RailRow>
  ) : null;
  return (
    <div className="sq-steps-body" data-testid="sq-steps">
      <p className="sq-span">
        <span>
          <b>{span.count}</b>
          {span.over ? ` ${span.over}` : null}
        </span>
        {row.state === "draft" ? null : <span className="sq-span-per">{SW.per}</span>}
      </p>
      <ol className="sq-rail">
        <RailRow day={SW.start} testid="sq-starts">
          <div className="sq-rail-line">
            <span className="sq-rail-lead">
              {start.lead}
              <b>{start.name}</b>
            </span>
            <span className="sq-rail-sub">{start.sub}</span>
            <span className="ld-start-acts">
              <LinkButton onClick={() => setRuns(true)} data-testid="ld-how-it-runs">
                {W.howItRuns}
              </LinkButton>
              <LinkButton
                onClick={() =>
                  addLeadsTo(row.id, row.name, row.first?.source_search_id ?? row.first?.source_could?.id ?? null)
                }
                data-testid="sq-add-leads"
                {...gate("approve", "add leads to this sequence")}
              >
                {F.addLeads}
              </LinkButton>
            </span>
          </div>
        </RailRow>
        {chain.steps.flatMap((s, i) => {
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
            closes && i === draft.steps.length - 1 ? addRow : null,
            place > 1 ? (
              <RailWait
                key={`wait-${s.id}`}
                wait={`${W.waits} ${W.afterDays(s.after_days ?? 0)}`}
                only={W.onlyIfQuiet}
                testid={`sq-step-wait-${place}`}
              />
            ) : null,
            <RailRow key={s.id} day={SW.day(days.get(place) ?? 1)} need={box.unwritten} testid={`sq-step-${place}`}>
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
            </RailRow>,
          ];
        })}
        {closes ? null : addRow}
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
      <LeadStepSheet open={open !== null} place={open} rec={rec} lc={lc} flash={flash} onClose={() => setOpen(null)} />
      <LeadRunsSheet open={runs} rec={rec} lc={lc} onClose={() => setRuns(false)} />
    </div>
  );
}
