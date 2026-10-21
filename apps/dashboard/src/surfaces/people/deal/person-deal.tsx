/**
 * Chanlytics — a person's deal, where the work is (docs/decisions/0008-a-proposal-is-part-of-the-deal.md), moved from
 * legacy/pages/person-deal.jsx (decision 0015).
 *
 * The person page's Deal section, first in its left column, above Coming up: one card per open deal -- a proposal out,
 * a client; a person may hold one per service -- newest first, each in Coming up's family (the raised ground, one
 * hairline, the kit's middle radius; no shadow). A card says the service and its value, three quiet steps (the
 * Consultation only for someone who has one), the proposal's link with whether it went and the day it stands until,
 * what wants a look as a state in its tone (the house's one StatePill: a lapsed day, nothing back in a week), and then
 * its acts: the one next act as an outline button (the page's one filled button stays Open the thread) and the other
 * moves as quiet words. With no deal open it is one slim line: the last that closed, or "No proposal yet", and the one
 * act that fits.
 *
 * Every sentence, every step, every act and which one leads are contracts' (deal-sheet.ts dealCardsOf, dealNextAct). A
 * send -- "Send proposal", "Follow up" -- opens their thread through the page's own path (`onCompose`, the More menu's),
 * with the words in its box where free text can go; where only an approved message can, it opens the thread with
 * nothing in the box, which offers those, and its hover says so. Every other act opens the one deal sheet
 * (components/deal-sheet.jsx, the `openDealSheet` verb). On the person page each
 * deal is a row that folds the card open (canvas A); the Pipeline's deal sheet draws the card's steps (dealSteps) and
 * leads with its act from the sheet's own foot (pipeline/peek-foot.tsx).
 *
 * Under its acts, a card says its next step (0007, amended): Next, what, when and for whom, with Done and, for the
 * one who wrote it, Change; with none, a quiet dashed "Set a next step". The step is the earliest open one that
 * names the deal (contracts dealStepOf); its words are the notes card's (NOTE_WORDS); Set and Change open the one step
 * sheet (components/step-sheet.jsx), and Done says so with an Undo.
 *
 * What the JSX read off the window is an import: the deal kit (`window.__deal`: contracts' dealCardsOf and
 * DEAL_CARD_WORDS), the notes' words and their Done (`window.__personNotes`: NOTE_WORDS and people-detail.ts
 * markStepDone) and the business's clock (`window.__clock`). The guards for their absence went with them: the module
 * is there wherever the page is, and the standalone mockup, where the window lacked them, draws no person.
 */
import { Fragment, useId, useState } from "react";
import { DEAL_CARD_WORDS, NOTE_WORDS, dealCardsOf } from "@chanlytics/contracts";
import type { DealAct, DealCardVM, DealQuietVM, DealStepVM, PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { openDealSheet } from "../../legacy-verbs";
import { markStepDone } from "../people-detail";
import { completeStep, type StepSay } from "../../step-done";
import { openStepSheet, stepSheetOffered } from "./deal-verbs";
import type { StepSheetAsk } from "./deal-verbs";

/** Say something in the page's toast: a step done and its Undo, said as every page says it (step-done.tsx). */
type FlashFn = StepSay;

/** Open their thread with the words in its box (or nothing, where only an approved message can go). */
type ComposeFn = ((text: string | null) => void) | null | undefined;

// The dot between a line's parts, as the JSX wrote it (&nbsp;· ): one text node, the space after it kept.
const DOT = "\u00a0· ";

// Run one of the card's acts: a send is the page's (their thread, with the words ready where they can go, and
// nothing written where they cannot); a move is the sheet's.
export const pdRun = (
  p: Pick<PersonVM, "id">,
  a: DealAct | null | undefined,
  dealId: string | null,
  onCompose: ComposeFn,
) => {
  if (!a) return;
  if (!a.mode) {
    if (onCompose) onCompose(a.text || null);
    return;
  }
  // A new proposal after a consultation opens with the service the consultation was for (contracts consultedService).
  openDealSheet({
    personId: p.id,
    mode: a.mode,
    dealId: a.mode === "propose" ? null : dealId,
    ...(a.mode === "propose" && a.service ? { service: a.service } : {}),
  });
};

// A deal's next step, or the way to set one. Hookless.
const PersonDealStep = ({
  p,
  c,
  canRecord,
  flash,
}: {
  p: Pick<PersonVM, "id">;
  c: DealCardVM;
  canRecord: boolean;
  flash: FlashFn | null;
}) => {
  const S = NOTE_WORDS;
  const s = c.step;
  const sheet = (ask: Omit<StepSheetAsk, "personId">) =>
    stepSheetOffered() ? () => openStepSheet({ personId: p.id, ...ask }) : null;
  if (!s) {
    const set = sheet({ dealId: c.id });
    return canRecord && c.id && set ? (
      <button type="button" className="cl-prof-deal-setnext" onClick={set} data-testid="person-deal-set-nextstep">
        {S.setNext}
      </button>
    ) : null;
  }
  // Done says what every page says (step-done.tsx): "Step done · its words", with an Undo. Refused, nothing was written
  // and the step the page holds may be the one that moved: the person's page reads them again (person-real.tsx hears
  // surface:clients and reloads the one person on screen).
  const done = () =>
    completeStep({
      personId: p.id,
      noteId: s.id,
      words: s.words,
      version: s.version,
      done: markStepDone,
      say: flash,
      onRefused: () => window.dispatchEvent(new CustomEvent("surface:clients")),
    });
  const change = s.mine ? sheet({ noteId: s.id }) : null;
  return (
    <div className="cl-prof-deal-nextstep" data-due={s.day.due} data-testid="person-deal-nextstep">
      <p className="cl-prof-deal-next-line">
        <span className="cl-prof-deal-next-label">{S.next}</span>
        <span className="cl-prof-deal-next-words" data-testid="person-deal-nextstep-words">
          {s.words}
        </span>
        <span className="cl-prof-deal-dot" aria-hidden="true">
          {DOT}
        </span>
        <span className="cl-prof-deal-next-day" data-testid="person-deal-nextstep-day">
          {s.day.words}
        </span>
        {s.forWho ? (
          <>
            <span className="cl-prof-deal-dot" aria-hidden="true">
              {DOT}
            </span>
            <span className="cl-prof-deal-next-for">{s.forWho}</span>
          </>
        ) : null}
      </p>
      {canRecord ? (
        <span className="cl-prof-deal-acts cl-prof-deal-next-acts">
          <button type="button" className="cl-prof-deal-act" onClick={done} data-testid="person-deal-nextstep-done">
            {S.done}
          </button>
          {change ? (
            <button
              type="button"
              className="cl-prof-deal-act"
              onClick={change}
              data-testid="person-deal-nextstep-change"
            >
              {S.change}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
};

/** A step's words: its name, then on one line how a consultation that ended stands and its day ("Kept · Oct 16"). */
function stepWords(s: DealStepVM) {
  return (
    <>
      <span className="cl-prof-deal-step-label">{s.label}</span>
      {s.word || s.day ? (
        <span className="cl-prof-deal-step-day">
          {/* A consultation that has ended says how the visit stands, as every page does: Kept, or Past while nobody has said. */}
          {s.word ? <span data-testid="person-deal-step-word">{s.word}</span> : null}
          {s.word && s.day ? DOT : null}
          {s.day}
        </span>
      ) : null}
    </>
  );
}

/**
 * The card's three quiet steps, one bar each; in a row, a step's name and its day on one line under its bar. The
 * Pipeline's deal sheet draws its row's steps with it too.
 */
export function dealSteps(steps: readonly DealStepVM[], row = false) {
  return (
    <ol className="cl-prof-deal-steps" data-testid="person-deal-steps">
      {steps.map((s) => (
        <li
          key={s.key}
          className="cl-prof-deal-step"
          data-at={s.at}
          data-tone={s.tone || undefined}
          aria-current={s.at === "current" ? "step" : undefined}
          data-testid="person-deal-step"
        >
          <span className="cl-prof-deal-bar" aria-hidden="true" />
          {row ? <span className="cl-prof-deal-step-say">{stepWords(s)}</span> : stepWords(s)}
        </li>
      ))}
    </ol>
  );
}

/** The proposal's link, and the facts beside it; with `copy`, the link copies too (the opened row). */
function dealLine(c: DealCardVM, W: typeof DEAL_CARD_WORDS, copy = false) {
  return (
    <p className="cl-prof-deal-line" data-testid="person-deal-line">
      {c.link ? (
        <a
          className="cl-prof-deal-link"
          href={c.link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={c.link.url}
          aria-label={`${W.openLink}: ${c.link.host}`}
          data-testid="person-deal-link"
        >
          <Icon name="external" size={11} />
          <span className="cl-prof-deal-host">{c.link.host}</span>
        </a>
      ) : null}
      {/* On the person page's opened row, the link copies too (canvas A, P4.3): said in place, never a toast. */}
      {c.link && copy ? (
        <CopyButton text={c.link.url} label={W.copyLink} said={W.copied} testid="person-deal-copy-link" />
      ) : null}
      {/* Each fact keeps its words together; a line breaks between them, after the dot. */}
      {[...c.facts, ...(c.pace ? [c.pace] : [])].map((f, i) => (
        <Fragment key={f}>
          {c.link || i > 0 ? (
            <span className="cl-prof-deal-dot" aria-hidden="true">
              {DOT}
            </span>
          ) : null}
          <span className="cl-prof-deal-fact" data-testid="person-deal-fact">
            {f}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * The card's acts: the next one as the outline button, the other moves as quiet words. Where the page draws Up next
 * (`rung`, the person page's Overview), the next act is its rung's alone and the card keeps the other moves.
 */
function dealActs(p: Pick<PersonVM, "id">, c: DealCardVM, onCompose: ComposeFn, rung = false) {
  return (
    <div className="cl-prof-deal-acts">
      {c.next && !rung ? (
        <button
          type="button"
          className="btn btn-sm"
          title={c.next.hint || undefined}
          onClick={() => pdRun(p, c.next, c.id, onCompose)}
          data-testid="person-deal-next"
        >
          {c.next.label}
        </button>
      ) : null}
      {c.more.map((a) => (
        <button
          key={a.id}
          type="button"
          className="cl-prof-deal-act"
          title={a.hint || undefined}
          onClick={() => pdRun(p, a, c.id, onCompose)}
          data-testid="person-deal-move"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// No deal open: the one line, and its act. The act is the outline button only where it is the next step nobody has
// taken (a consultation with no proposal after it); otherwise it is quiet words, like the card's other moves.
const PersonDealQuiet = ({
  p,
  q,
  canRecord,
  onCompose,
  rung = false,
}: {
  p: Pick<PersonVM, "id">;
  q: DealQuietVM;
  canRecord: boolean;
  onCompose: ComposeFn;
  /** Up next holds the line's act where it is the next step nobody has taken. */
  rung?: boolean;
}) => (
  <div className="cl-prof-deal-none" data-testid="person-deal-none">
    <p className="cl-prof-deal-said">
      <span data-testid="person-deal-said">{q.words}</span>
      {q.sub ? (
        <>
          <span className="cl-prof-deal-dot" aria-hidden="true">
            {DOT}
          </span>
          <span className="cl-prof-deal-sub" data-testid="person-deal-consult">
            {q.sub}
          </span>
        </>
      ) : null}
    </p>
    {canRecord && !(rung && q.primary) ? (
      <button
        type="button"
        className={q.primary ? "btn btn-sm" : "cl-prof-deal-act"}
        title={q.act.hint || undefined}
        onClick={() => pdRun(p, q.act, q.dealId, onCompose)}
        data-testid="person-deal-start"
      >
        {q.act.label}
      </button>
    ) : null}
  </div>
);

/**
 * One open deal as the person page's row (canvas A, `.a-deal`; D2): its name, its steps, its value and the fold's chevron,
 * one 52px line on a desk and two on a phone. The name is the press, and covers the row. It folds the rest of the card
 * open under it: the link line, its moves (its next act too, where Up next does not hold it; `rung`, the Overview's) and
 * its next step, and on the Deals tab what wants a look. A phone folds it too: a press there once opened the deal sheet to
 * edit the proposal, which a client's deal or a passed one cannot be (the sheet said only that the deal had moved on),
 * and its other moves and its next step were out of reach.
 */
function PersonDealRow({
  p,
  c,
  W,
  canRecord,
  onCompose,
  flash,
  rung,
}: {
  p: PersonVM;
  c: DealCardVM;
  W: typeof DEAL_CARD_WORDS;
  canRecord: boolean;
  onCompose: ComposeFn;
  flash: FlashFn | null;
  rung: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const press = () => setOpen((was) => !was);
  return (
    <li className="cl-prof-deal-item" data-open={open || undefined} data-stage={c.stage} data-testid="person-deal-card">
      <div className="cl-prof-deal-row">
        <Button
          variant="quiet"
          size="text"
          className="cl-prof-deal-title"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={press}
          data-testid="person-deal-title"
        >
          {c.title}
        </Button>
        {dealSteps(c.steps, true)}
        <span className="cl-prof-deal-value" data-testid="person-deal-value">
          {c.value ?? ""}
        </span>
        <span className="cl-prof-deal-chev" aria-hidden="true">
          <Icon name="chevron" size={12} />
        </span>
      </div>
      {open ? (
        <div className="cl-prof-deal-open" id={bodyId}>
          {c.link || c.facts.length || c.pace ? dealLine(c, W, true) : null}
          {/* What wants a look is Up next's on the Overview (its rung says it), said here only on the Deals tab. */}
          {!rung && c.flags.length ? (
            <div className="cl-prof-deal-flags">
              {c.flags.map((f) => (
                <StatePill key={f.words} kind="tone" value={f.tone} label={f.words} testid="person-deal-flag" />
              ))}
            </div>
          ) : null}
          {canRecord && ((c.next && !rung) || c.more.length) ? dealActs(p, c, onCompose, rung) : null}
          <PersonDealStep p={p} c={c} canRecord={canRecord} flash={flash} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The person page's Deals (canvas A): one row a deal in one inset, each folding open on a press, and "Start another
 * proposal" under them; with none open, the one quiet line and its act. Every workspace has deals (0008, amended 18 Oct
 * 2026), and the section is drawn for someone a deal is true of: one on file, or a consultation nothing followed (the
 * quiet act leads). Anyone else is offered a proposal from the page's More, never a line on the page.
 */
export const PersonDealCard = ({
  p,
  canRecord = false,
  onCompose = null,
  flash = null,
  rung = false,
}: {
  p: PersonVM | null;
  canRecord?: boolean;
  onCompose?: ComposeFn;
  flash?: FlashFn | null;
  /** The page draws Up next, which holds each deal's next act (the person page's Overview). */
  rung?: boolean;
}) => {
  if (!p) return null;
  const tz = pageClock().zone();
  const vm = dealCardsOf(p, Date.now(), tz);
  if (vm.quiet && p.deals.length === 0 && !vm.quiet.primary) return null;
  const W = DEAL_CARD_WORDS;
  return (
    <section className="cl-prof-section cl-prof-deal" aria-labelledby="person-deal-title" data-testid="person-deal">
      <h2 className="cl-prof-section-title" id="person-deal-title">
        {vm.quiet ? W.title : W.titleMany}
      </h2>
      {vm.quiet ? (
        <PersonDealQuiet p={p} q={vm.quiet} canRecord={canRecord} onCompose={onCompose} rung={rung} />
      ) : (
        <ol className="cl-prof-deal-rows">
          {vm.cards.map((c) => (
            <PersonDealRow
              key={c.id || c.title}
              p={p}
              c={c}
              W={W}
              canRecord={canRecord}
              onCompose={onCompose}
              flash={flash}
              rung={rung}
            />
          ))}
        </ol>
      )}
      {canRecord && !vm.quiet ? (
        <div className="cl-prof-deal-foot">
          <LinkButton
            onClick={() => openDealSheet({ personId: p.id, mode: "propose", dealId: null })}
            data-testid="person-deal-another"
          >
            <Icon name="plus" size={11} /> {W.another}
          </LinkButton>
        </div>
      ) : null}
    </section>
  );
};
