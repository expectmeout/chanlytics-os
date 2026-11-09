/**
 * A step of a sequence to leads, written in its sheet (the lead-to-sequence canvas's boards C and D: the draft is the
 * record): its subject (the first email's; a later one answers in its thread), its email in the box every email is written
 * in (templates/slots/words-field.tsx: each value a chip by its name), Insert with each value as it stands for the lead
 * previewed (insert.tsx), Ask rewrites it as you say (rewrite.tsx), and Preview as a real lead (preview.tsx), whose foot
 * sends the step as that lead gets it to your own inbox. A later step says how long it waits, and may be taken out; a call
 * or a note says what to do. Every change is saved a moment after it (use-chain.ts); Done saves what waits and closes.
 */
import { useState } from "react";
import {
  LEAD_BUILD_WORDS as W,
  REACH_OUT_SLOT_SET,
  SEQUENCE_TEST_WORDS as T,
  leadPreviewOfferOf,
  reachOutAfterDayChoices,
  reachOutPutBackStep,
  reachOutRemoveStep,
  reachOutSetHandWords,
  scheduleDays,
  type ReachOutDraftStep,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Picker } from "../../../kit/picker/picker";
import { Sheet } from "../../../kit/sheet/sheet";
import { gate, type FrameFlash } from "../../../frame-verbs";
import { cmChevron, cmNumbers } from "../../parts/picks";
import { useSlotSeats } from "../../templates/slots/slot-seats";
import { tplOwn } from "../../templates/words";
import { WordsField } from "../../templates/slots/words-field";
import { pressed } from "../verbs";
import { LeadInsert } from "./insert";
import { LeadPreview } from "./preview";
import { cardLeadOf, exampleCardLead, useLeadRow, usePreviewLeads, workspaceOf, type PreviewLead } from "./reads";
import { LeadRewrite, useLeadRewrite } from "./rewrite";
import type { LeadChain } from "./use-chain";

type Flash = (f: FrameFlash) => void;

/** Each step's day on the rail, from the draft's waits: the first on day 1. */
const stepDaysOf = (steps: readonly ReachOutDraftStep[]) =>
  scheduleDays(steps.map((s, i) => ({ place: i + 1, after_days: i === 0 ? null : s.after_days })));

interface WriteProps {
  sequenceId: string;
  lc: LeadChain;
  place: number;
  step: ReachOutDraftStep;
  lead: PreviewLead | null;
  flash: Flash;
  onPreview: () => void;
}

/** An email being written: its subject or the thread it answers, its words, Insert, Ask rewrites it, Preview. */
function EmailWrite({ sequenceId, lc, place, step, lead, flash, onPreview }: WriteProps) {
  const i = place - 1;
  const set = (patch: Partial<ReachOutDraftStep>) =>
    lc.edit((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const subject = i === 0 ? (step.subject ?? "") : "";
  const seats = useSlotSeats({ subject, body: step.body }, (to, words) => set({ [to]: words }));
  // A rewrite's words in the boxes as if typed: each drawn again with them, as the editor puts its own (seats.put).
  const rewrite = useLeadRewrite(sequenceId, { subject: i === 0 ? subject : null, body: step.body }, (w) => {
    if (i === 0) seats.put("subject", { text: w.subject ?? "", caret: (w.subject ?? "").length });
    seats.put("body", { text: w.body, caret: w.body.length });
  });
  const box = { slots: REACH_OUT_SLOT_SET, readOnly: rewrite.asking, seats };
  const [inserting, setInserting] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const keepOwn = lc.chain.steps.find((s) => s.id === step.id)?.own_words ?? 0;
  const row = useLeadRow(lead?.id ?? null);
  const slotLead = row ? cardLeadOf(row) : lead ? null : exampleCardLead();
  return (
    <div className="ld-write" data-testid={`ld-write-${place}`}>
      {i === 0 ? (
        <WordsField
          {...box}
          name="subject"
          label={W.subject}
          lines={1}
          value={subject}
          onType={(words) => set({ subject: words })}
          testid="ld-subject"
        />
      ) : (
        <p className="ld-note">{W.inThread}</p>
      )}
      <WordsField
        {...box}
        name="body"
        label={W.email}
        lines={i === 0 ? 8 : 4}
        value={step.body}
        onType={(words) => set({ body: words })}
        testid="ld-body"
      />
      {keepOwn > 0 ? (
        <p className="ld-note" data-testid="ld-keep-own">
          {W.keepOwn(keepOwn)}
        </p>
      ) : null}
      <div className="ld-write-acts">
        <Button
          size="sm"
          aria-expanded={inserting}
          onClick={() => setInserting((on) => !on)}
          data-testid="ld-insert-open"
        >
          <Icon name="plus" size={12} /> {W.insert}
        </Button>
        <Button
          size="sm"
          aria-expanded={rewriting}
          onClick={() => setRewriting((on) => !on)}
          data-testid="ld-ask-rewrite"
        >
          <Icon name="sparkle" size={12} /> {W.askRewrites}
        </Button>
        <Button size="sm" onClick={onPreview} data-testid="ld-preview-open">
          {W.preview}
        </Button>
      </div>
      {rewriting ? <LeadRewrite r={rewrite} /> : null}
      <p className="ld-note">{W.holdsOne}</p>
      {inserting ? (
        <LeadInsert
          lead={slotLead}
          workspace={workspaceOf(lc.draft.signed_by)}
          preview={leadPreviewOfferOf({ makes: tplOwn().previews, first: i === 0, lead: slotLead })}
          seats={seats}
          flash={flash}
          onSigned={(name) => lc.edit((d) => ({ ...d, signed_by: name }))}
        />
      ) : null}
    </div>
  );
}

/** A later step's wait: how many days after the one before, then only if they haven't written back. */
function StepWait({ lc, place, step }: { lc: LeadChain; place: number; step: ReachOutDraftStep }) {
  const days = reachOutAfterDayChoices().map((n) => ({ v: n, t: W.afterDays(n) }));
  return (
    <div className="ld-wait" data-testid={`ld-wait-${place}`}>
      <span className="ld-wait-k">{W.waits}</span>
      <Picker
        label={W.waits}
        value={String(step.after_days ?? 4)}
        onValueChange={(v) =>
          lc.edit((d) => ({
            ...d,
            steps: d.steps.map((s, j) => (j === place - 1 ? { ...s, after_days: Number(v) } : s)),
          }))
        }
        groups={cmNumbers(days)}
        chevron={cmChevron()}
        data-testid={`ld-wait-days-${place}`}
      />
      <span className="ld-note">{W.onlyIfQuiet}</span>
    </div>
  );
}

/** The foot while writing: Take this step out (after the first), where the save stands, Done. */
function WriteFoot(p: { lc: LeadChain; place: number; onDone: () => void; onRemove: () => void }) {
  // Its acts alone in the foot (kit.css data-foot-acts): one inset all round, the quiet one at its start, Done at its end.
  return (
    <div className="ld-foot" data-foot-acts="">
      {p.place > 1 ? (
        <Button variant="quiet" tone="danger" onClick={p.onRemove} data-testid="ld-step-remove" {...gate("approve")}>
          {W.removeStep}
        </Button>
      ) : null}
      <span className="ld-foot-said" aria-live="polite">
        {p.lc.saving === "saving" ? W.saving : null}
      </span>
      <Button variant="primary" onClick={p.onDone} data-testid="ld-step-done">
        {W.done}
      </Button>
    </div>
  );
}

/** The foot while previewing: the step as this lead gets it, and Send me a test, to your own inbox. */
function TestFoot(p: { rec: SequenceRecordDto; lc: LeadChain; place: number; lead: PreviewLead | null; flash: Flash }) {
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    // What is typed goes first, so the test is the words as they stand.
    const ids = await p.lc.flush();
    const id = ids?.[p.place - 1] ?? null;
    if (id)
      await pressed(
        "sequence_test",
        { sequence_id: p.rec.sequence.id, step_id: id, ...(p.lead ? { lead_id: p.lead.id } : {}) },
        p.flash,
        () => undefined,
      );
    setBusy(false);
  };
  return (
    <div className="ld-foot">
      <span className="ld-foot-said">
        <span className="ld-foot-fact">{W.testFact}</span>
      </span>
      <Button
        onClick={() => void test()}
        disabled={busy}
        aria-busy={busy}
        data-testid="ld-step-test"
        {...gate("approve")}
      >
        <Icon name="send" size={13} /> {busy ? T.sending : T.press}
      </Button>
    </div>
  );
}

interface LeadStepSheetProps {
  open: boolean;
  /** The step's place, from 1: the draft's. */
  place: number | null;
  rec: SequenceRecordDto;
  lc: LeadChain;
  flash: Flash;
  onClose: () => void;
}

export function LeadStepSheet({ open, place, rec, lc, flash, onClose }: LeadStepSheetProps) {
  const [previewing, setPreviewing] = useState(false);
  const [at, setAt] = useState(0);
  const leads = usePreviewLeads(rec);
  const step = place ? (lc.draft.steps[place - 1] ?? null) : null;
  const lead = leads[Math.min(at, Math.max(0, leads.length - 1))] ?? null;
  const close = () => {
    setPreviewing(false);
    void lc.flush();
    onClose();
  };
  const remove = () => {
    if (!place || !step) return;
    const at = place - 1;
    lc.edit((d) => reachOutRemoveStep(d, at));
    close();
    flash({ msg: W.stepOut(place), undo: () => lc.edit((d) => reachOutPutBackStep(d, at, step)) });
  };
  const day = place ? (stepDaysOf(lc.draft.steps).get(place) ?? 1) : 1;
  const hand = step?.hand?.kind ?? null;
  return (
    <Sheet
      open={open && !!step && !!place}
      onClose={close}
      title={previewing && place ? W.previewTitle(place) : place ? W.stepTitle(place, hand) : ""}
      sub={previewing ? undefined : W.stepSub(day, rec.sequence.in_it)}
      close={{ label: W.done, glyph: <Icon name="x" size={13} /> }}
      backCloses
      testid="ld-step-sheet"
      foot={
        !place || !step ? null : previewing ? (
          <TestFoot rec={rec} lc={lc} place={place} lead={lead} flash={flash} />
        ) : (
          <WriteFoot lc={lc} place={place} onDone={close} onRemove={remove} />
        )
      }
    >
      {!place || !step ? null : previewing ? (
        <>
          <Button variant="quiet" size="sm" onClick={() => setPreviewing(false)} data-testid="ld-preview-back">
            <span className="ld-flip">
              <Icon name="chevron" size={13} />
            </span>{" "}
            {W.previewBack}
          </Button>
          <LeadPreview
            rec={rec}
            lc={lc}
            place={place}
            leads={leads}
            at={Math.min(at, Math.max(0, leads.length - 1))}
            onAt={setAt}
          />
        </>
      ) : (
        <div className="ld-step" key={place}>
          {step.hand ? (
            <Field
              label={W.handWords}
              hint={W.handHint}
              rows={2}
              value={step.hand.words}
              onValueChange={(words) => lc.edit((d) => reachOutSetHandWords(d, place - 1, words))}
              data-testid="ld-hand-words"
            />
          ) : (
            <EmailWrite
              sequenceId={rec.sequence.id}
              lc={lc}
              place={place}
              step={step}
              lead={lead}
              flash={flash}
              onPreview={() => {
                void lc.flush();
                setPreviewing(true);
              }}
            />
          )}
          {place > 1 && !step.hand ? <StepWait lc={lc} place={place} step={step} /> : null}
        </div>
      )}
    </Sheet>
  );
}
