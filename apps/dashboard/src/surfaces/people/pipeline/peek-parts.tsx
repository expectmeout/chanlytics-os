/**
 * The deal sheet's body (the canvas "Pipeline deal sheet", 20 Oct 2026, made compact 21 Oct: the sheet acts, their page
 * records), part by part, each a plain function of what the sheet holds (`DealSheetCtx`): where the deal stands (its
 * steps in the row's tones, then one line of the card's flags and facts, or a row's stand where it has no card), the
 * read still on its way or failed, the question a proposal waiting asks, its next step (the ring is Done, the words
 * Change) and the facts the row carries. Every word is contracts'.
 *
 * What a press does is the house's own door: Done is step-done.tsx's, Change and Set the one step sheet (a new step
 * suggested by the act the card leads with), Yes the one deal sheet.
 */
import { Fragment } from "react";
import { NOTE_WORDS } from "@chanlytics/contracts";
import type { DealCardStepVM, PersonVM, PipelinePeekVM, PipelineRowVM, PipelineSheetVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { gate } from "../../legacy-verbs";
import { completeStep } from "../../step-done";
import { dealSteps, pdRun } from "../deal/person-deal";
import { openStepSheet, stepSheetOffered } from "../deal/deal-verbs";
import { markStepDone } from "../people-detail";
import { P } from "./pipe";
import type { Flash } from "../types";

/** Open their thread with the words in its box (or nothing, where only an approved message can go). */
export type Compose = (text: string | null) => void;

/** What the sheet holds, and what its presses reach: one object its parts all read. */
export interface DealSheetCtx {
  vm: PipelinePeekVM;
  row: PipelineRowVM;
  /** The person as read; null while the read is on its way, or failed. */
  person: PersonVM | null;
  sheet: PipelineSheetVM;
  failed: string | null;
  canRecord: boolean;
  phone: boolean;
  flash: Flash;
  onCompose: Compose;
  onRetry: () => void;
  /** Ask why they passed, in the foot's place. */
  onPass: () => void;
  /** The pass is being asked in the foot: the question above it steps aside, so nothing is asked twice. */
  passing: boolean;
}

const S = P.words.sheet;

/**
 * Where the deal stands: its steps, then one line: what wants a look (the card's flags, a state in its tone) and the
 * plain facts beside it, whether it went and the day it stands until; or the row's stand where it has no card. The
 * workspace's pace is the Pipeline's waiting count's and their page's card's to say, not this line's.
 */
function DealStand({ c }: { c: DealSheetCtx }) {
  const { card, stand, steps } = c.sheet;
  const flags = card ? card.flags : stand ? [stand] : [];
  const facts = card ? card.facts : [];
  return (
    <div className="pipe-deal-stand" data-testid="pipeline-peek-stand">
      {steps.length ? dealSteps(steps) : null}
      {flags.length || facts.length ? (
        <p className="pipe-deal-state">
          {flags.map((f) => (
            <StatePill
              key={f.words}
              kind="tone"
              value={f.tone}
              label={f.words}
              testid={card ? "pipeline-peek-flag" : "pipeline-peek-stand-word"}
            />
          ))}
          {facts.map((f, i) => (
            <Fragment key={f}>
              {i > 0 ? (
                <span className="pipe-deal-sep" aria-hidden="true">
                  ·
                </span>
              ) : null}
              <span data-testid="pipeline-peek-fact">{f}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/** The person on their way, said after the standard's beat; one that could not be read, by the house's FailedRead. */
function DealReading({ c }: { c: DealSheetCtx }) {
  if (c.person) return null;
  if (c.failed !== null)
    return (
      <FailedRead
        kind="card"
        what={P.words.peek.what}
        why={c.failed || null}
        onRetry={c.onRetry}
        testid="pipeline-peek-failed"
      />
    );
  return (
    <div className="route-reading pipe-deal-reading" role="status" data-testid="pipeline-peek-reading">
      {P.words.peek.reading}
    </div>
  );
}

/**
 * "Did Sol say yes?", while a proposal waits with nothing back and Follow up leads: Yes opens Mark as client (the one deal
 * sheet, the proposal's value filled in), They passed asks why in the foot. Two equal answers, as the visit asks "Did
 * Maria come?".
 */
function DealAsk({ c }: { c: DealSheetCtx }) {
  const { ask, card } = c.sheet;
  if (!ask || !card || !c.person || !c.canRecord || c.passing) return null;
  const p = c.person;
  return (
    <section className="pipe-deal-ask" aria-label={ask.question} data-testid="pipeline-peek-ask">
      <p className="pipe-deal-ask-q">{ask.question}</p>
      <div className="pipe-deal-ask-two">
        <Button
          onClick={() => pdRun(p, ask.yes, card.id, c.onCompose)}
          data-testid="pipeline-peek-ask-yes"
          {...gate("approve", "record a deal")}
        >
          {S.yes}
        </Button>
        <Button onClick={c.onPass} data-testid="pipeline-peek-ask-no" {...gate("approve", "mark a deal as passed")}>
          {S.no}
        </Button>
      </div>
    </section>
  );
}

/**
 * The step's words, and under them that it is the next step, its day and whom it is for: the line in the warn ink once
 * the day has come (the row's own rule, data-due). The row is its own label, so the sheet spends no heading on it.
 */
function stepSay(s: DealCardStepVM) {
  return (
    <span className="pipe-deal-step-say">
      <span className="pipe-deal-step-words" data-testid="pipeline-peek-step-words">
        {s.words}
      </span>
      <span className="pipe-deal-step-when">{[S.next, s.day.words, s.forWho].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

/**
 * The deal's next step (0007, amended): the ring is Done, said with its Undo as every page says it; the words are Change,
 * for the one who wrote it. With none, Set a next step, for a member who may.
 */
function DealNextStep({ c }: { c: DealSheetCtx }) {
  const { card } = c.sheet;
  const p = c.person;
  if (!card || !p) return null;
  const s = card.step;
  const offered = stepSheetOffered();
  if (!s && !(c.canRecord && card.id && offered)) return null;
  const done = s
    ? () =>
        completeStep({
          personId: p.id,
          noteId: s.id,
          words: s.words,
          version: s.version,
          done: markStepDone,
          say: c.flash,
          onRefused: () => window.dispatchEvent(new CustomEvent("surface:clients")),
        })
    : null;
  const change = s && s.mine && offered ? () => openStepSheet({ personId: p.id, noteId: s.id }) : null;
  return (
    <section className="pipe-deal-sec" aria-label={S.next} data-testid="pipeline-peek-next">
      <div className="pipe-deal-group">
        {s ? (
          <div className="pipe-deal-step" data-due={s.day.due} data-testid="pipeline-peek-step">
            {c.canRecord && done ? (
              <Button
                variant="quiet"
                iconOnly
                className="pipe-deal-done"
                aria-label={S.done(s.words)}
                title={S.done(s.words)}
                onClick={done}
                data-testid="pipeline-peek-step-done"
              >
                <span className="pipe-deal-ring" aria-hidden="true" />
              </Button>
            ) : (
              <span className="pipe-deal-dot" aria-hidden="true" />
            )}
            {change ? (
              <Button
                variant="quiet"
                className="pipe-deal-step-change"
                aria-label={S.change(s.words)}
                onClick={change}
                data-testid="pipeline-peek-step-change"
              >
                {stepSay(s)}
              </Button>
            ) : (
              stepSay(s)
            )}
          </div>
        ) : (
          <Button
            variant="quiet"
            className="pipe-deal-set"
            onClick={() => openStepSheet({ personId: p.id, dealId: card.id, lead: card.next?.id ?? null })}
            data-testid="pipeline-peek-step-set"
          >
            <span className="pipe-deal-plus" aria-hidden="true">
              <Icon name="plus" size={16} />
            </span>
            {NOTE_WORDS.setNext}
          </Button>
        )}
      </div>
    </section>
  );
}

/** What the row carries that nothing above says: what is coming up, and a step of theirs no deal's card says. */
function DealFacts({ c }: { c: DealSheetCtx }) {
  const { facts } = c.vm;
  if (!facts.length) return null;
  return (
    <ul className="pipe-deal-facts" data-testid="pipeline-peek-facts">
      {facts.map((f) => (
        <li key={f.id} data-testid={`pipeline-peek-${f.id}`}>
          {f.words}
        </li>
      ))}
    </ul>
  );
}

/**
 * The body, in its order: where it stands, the read, the question, the next step, the facts the row carries. The rest
 * of the person (their words, how to reach them, the proposal's link, their other deals) is their page's, which the
 * head opens.
 */
export function dealBody(c: DealSheetCtx) {
  return (
    <>
      <DealStand c={c} />
      <DealReading c={c} />
      <DealAsk c={c} />
      <DealNextStep c={c} />
      <DealFacts c={c} />
    </>
  );
}
