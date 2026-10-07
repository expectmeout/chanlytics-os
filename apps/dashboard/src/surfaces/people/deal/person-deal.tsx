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
 * (components/deal-sheet.jsx, the `openDealSheet` verb). Nothing is drawn where deals are off. Hookless.
 *
 * Under its acts, a card says its next step (0007, amended): Next, what, when and for whom, with Done and, for the
 * one who wrote it, Change; with none, a quiet dashed "Set a next step". The step is the earliest open one that
 * names the deal (contracts dealStepOf); its words are the notes card's (NOTE_WORDS); Set and Change open the one step
 * sheet (components/step-sheet.jsx), and Done says so with the next one offered.
 *
 * What the JSX read off the window is an import: the deal kit (`window.__deal`: contracts' dealCardsOf and
 * DEAL_CARD_WORDS), the notes' words and their Done (`window.__personNotes`: NOTE_WORDS and people-detail.ts
 * markStepDone) and the business's clock (`window.__clock`). The guards for their absence went with them: the module
 * is there wherever the page is, and the standalone mockup, where the window lacked them, draws no person.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { DEAL_CARD_WORDS, NOTE_WORDS, dealCardsOf } from "@chanlytics/contracts";
import type { DealAct, DealCardVM, DealQuietVM, PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { StatePill } from "../../kit/pill/state-pill";
import { Icon } from "../../kit/icon/icon";
import { openDealSheet } from "../../legacy-verbs";
import { markStepDone } from "../people-detail";
import { openStepSheet, stepSheetOffered } from "./deal-verbs";
import type { StepSheetAsk } from "./deal-verbs";

/** What the page's toast is told: the tone of the flash, its words and, after Done, the way to set the next step. */
interface DealFlash {
  tone?: string;
  msg: ReactNode;
  action?: { label: string; onClick: () => void };
}

/** Say something in the page's toast. */
type FlashFn = (flash: DealFlash) => void;

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

// A step's Done while its press is on its way: a second press waits for the first, which answers for both.
const PD_STEP_PRESSED = new Set<string>();

/** What Done asked of the step sheet: the toast it raises, and the event that has the page read the person again. */
function stepDoneFlash(r: Awaited<ReturnType<typeof markStepDone>>, next: (() => void) | null): DealFlash {
  const S = NOTE_WORDS;
  return r.ok
    ? { msg: <>{S.stepDone}</>, ...(next ? { action: { label: S.setTheNext, onClick: next } } : {}) }
    : { tone: "danger", msg: <>{r.message || S.stepDone}</> };
}

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
  const done = async () => {
    if (PD_STEP_PRESSED.has(s.id)) return;
    PD_STEP_PRESSED.add(s.id);
    let r: Awaited<ReturnType<typeof markStepDone>>;
    try {
      r = await markStepDone(p.id, s.id, true, s.version);
    } finally {
      PD_STEP_PRESSED.delete(s.id);
    }
    const next = sheet({ dealId: c.id });
    if (flash) flash(stepDoneFlash(r, next));
    window.dispatchEvent(new CustomEvent("note:saved", { detail: { personId: p.id } }));
  };
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

/** The card's three quiet steps, one bar each. */
function dealSteps(c: DealCardVM) {
  return (
    <ol className="cl-prof-deal-steps" data-testid="person-deal-steps">
      {c.steps.map((s) => (
        <li
          key={s.key}
          className="cl-prof-deal-step"
          data-at={s.at}
          data-tone={s.tone || undefined}
          aria-current={s.at === "current" ? "step" : undefined}
          data-testid="person-deal-step"
        >
          <span className="cl-prof-deal-bar" aria-hidden="true" />
          <span className="cl-prof-deal-step-label">{s.label}</span>
          {s.day ? <span className="cl-prof-deal-step-day">{s.day}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** The proposal's link, and the facts beside it. */
function dealLine(c: DealCardVM, W: typeof DEAL_CARD_WORDS) {
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
      {/* Each fact keeps its words together; a line breaks between them, after the dot. */}
      {c.facts.map((f, i) => (
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

/** The card's acts: the next one as the outline button, the other moves as quiet words. */
function dealActs(p: Pick<PersonVM, "id">, c: DealCardVM, onCompose: ComposeFn) {
  return (
    <div className="cl-prof-deal-acts">
      {c.next ? (
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

// One open deal. `W` is contracts' DEAL_CARD_WORDS.
export const PersonDealOne = ({
  p,
  c,
  W,
  canRecord,
  onCompose,
  flash = null,
}: {
  p: PersonVM;
  c: DealCardVM;
  W: typeof DEAL_CARD_WORDS;
  canRecord: boolean;
  onCompose: ComposeFn;
  flash?: FlashFn | null;
}) => (
  <article className="cl-prof-deal-card" data-stage={c.stage} data-testid="person-deal-card">
    <div className="cl-prof-deal-head">
      <span className="cl-prof-deal-title" data-testid="person-deal-title">
        {c.title}
      </span>
      {c.value ? (
        <span className="cl-prof-deal-value" data-testid="person-deal-value">
          {c.value}
        </span>
      ) : null}
    </div>
    {dealSteps(c)}
    {c.link || c.facts.length ? dealLine(c, W) : null}
    {c.flags.length ? (
      <div className="cl-prof-deal-flags">
        {c.flags.map((f) => (
          <StatePill key={f.words} kind="tone" value={f.tone} label={f.words} testid="person-deal-flag" />
        ))}
      </div>
    ) : null}
    {canRecord && (c.next || c.more.length) ? dealActs(p, c, onCompose) : null}
    <PersonDealStep p={p} c={c} canRecord={canRecord} flash={flash} />
  </article>
);

// No deal open: the one line, and its act. The act is the outline button only where it is the next step nobody has
// taken (a consultation with no proposal after it); otherwise it is quiet words, like the card's other moves.
export const PersonDealQuiet = ({
  p,
  q,
  canRecord,
  onCompose,
}: {
  p: Pick<PersonVM, "id">;
  q: DealQuietVM;
  canRecord: boolean;
  onCompose: ComposeFn;
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
    {canRecord ? (
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

export const PersonDealCard = ({
  p,
  canRecord = false,
  onCompose = null,
  flash = null,
}: {
  p: PersonVM | null;
  canRecord?: boolean;
  onCompose?: ComposeFn;
  flash?: FlashFn | null;
}) => {
  if (!p || !p.dealsOn) return null;
  const tz = pageClock().zone();
  const vm = dealCardsOf(p, Date.now(), tz);
  const W = DEAL_CARD_WORDS;
  return (
    <section className="cl-prof-section cl-prof-deal" aria-labelledby="person-deal-title" data-testid="person-deal">
      <h2 className="cl-prof-section-title" id="person-deal-title">
        {W.title}
      </h2>
      {vm.quiet ? (
        <PersonDealQuiet p={p} q={vm.quiet} canRecord={canRecord} onCompose={onCompose} />
      ) : (
        <div className="cl-prof-deal-list">
          {vm.cards.map((c) => (
            <PersonDealOne
              key={c.id || c.title}
              p={p}
              c={c}
              W={W}
              canRecord={canRecord}
              onCompose={onCompose}
              flash={flash}
            />
          ))}
        </div>
      )}
    </section>
  );
};
