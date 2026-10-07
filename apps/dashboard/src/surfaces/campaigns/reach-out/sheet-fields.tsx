/**
 * The reach-out sheet's fields (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR
 * 6): who gets it, what you'd say, and the steps that follow. Each part is a component of the sheet's own, as the JSX drew
 * them, over the draft the sheet holds (sheet-draft.ts) and contracts' words (`reachOuts.words`).
 */
import { REACH_OUT_SLOTS, REACH_OUT_SLOT_SET, REACH_OUT_SLOT_WORDS } from "@chanlytics/contracts";
import type {
  HandKind,
  ReachOutDraft,
  ReachOutDraftIssues,
  ReachOutDraftStep,
  ReachOutReachDto,
  StepHand,
} from "@chanlytics/contracts";
import { setupDto } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { cmChevron, cmNumbers } from "../parts/picks";
import { useSlotSeats } from "../templates/slots/slot-seats";
import type { SlotSeats } from "../templates/slots/slot-seats";
import { WordsField } from "../templates/slots/words-field";
import type { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

/** Where the reply comes back to: the workspace's mailbox, as Setup read it. */
function roMailbox(): string | null {
  const setup = setupDto();
  const e = setup && setup.email;
  return (e && e.mailbox && e.mailbox.address) || null;
}

/** One field's problems, under it, in contracts' words. */
function RoIssues({ lines, testid }: { lines: string[]; testid: string }) {
  return lines && lines.length ? (
    <ul className="ro-issues" data-testid={testid}>
      {lines.map((t) => (
        <li key={t} className="ro-issue">
          {t}
        </li>
      ))}
    </ul>
  ) : null;
}

interface WhoProps {
  W: Words;
  search: { id: string; name: string };
  reach: ReachOutReachDto | null;
  include: boolean;
  onInclude: (include: boolean) => void;
}

/** Who gets it: the search, and its reach as the database counts it, with the unconfirmed addresses' door. */
export function RoWho({ W, search, reach, include, onInclude }: WhoProps) {
  const line = reach ? W.reachLineOf(reach, include) : null;
  return (
    <section className="pb-sec" data-testid="ro-who">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.who}</span>
      <div className="pb-pick is-fixed">
        <span className="pb-pick-text">
          <span className="pb-pick-title">{search.name}</span>
          <span className="pb-pick-sub" data-testid="ro-who-line">
            {W.reachOutWhoWords(include)}
          </span>
        </span>
      </div>
      {line && (
        <div className="cm-reach ro-reach" data-testid="ro-reach">
          <span className="cm-reach-n">
            <span className="cm-reach-will" data-testid="ro-reach-count">
              {line.count}
            </span>
            <span className="cm-reach-of">{line.of}</span>
          </span>
          <span className="cm-reach-bar" aria-hidden="true">
            <span className="cm-reach-bar-will" style={{ width: `${line.bar.will}%` }} />
            <span className="cm-reach-bar-held" style={{ width: `${line.bar.held}%` }} />
            <span className="cm-reach-bar-rest" />
          </span>
          <ul className="cm-reach-why">
            {line.why.map((w) => (
              <li key={w.text}>
                <span className="cm-reach-dot" data-tone={w.tone} />
                {w.text}
                {w.door && (
                  <LinkButton className="cm-reach-door" onClick={() => onInclude(!include)} data-testid="ro-include">
                    {w.door}
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface StepWordsProps {
  W: Words;
  step: ReachOutDraftStep;
  n: number;
  issues: ReachOutDraftIssues["steps"][number];
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
}

/**
 * The six slots as buttons, each by its name: each puts its slot in the box last used, at the caret it had as it lost
 * focus to the press (the editor's own seats). They are buttons and not the Templates page's menu because the sheet is
 * modal: Tab stays in it, and a menu's popup opens outside it, where the sheet's trap holds nothing.
 */
function RoSlots({ W, n, seats }: { W: Words; n: number; seats: SlotSeats }) {
  return (
    <div className="em-slots" data-testid={n === 0 ? "ro-slots" : `ro-slots-${n}`}>
      {REACH_OUT_SLOTS.map((slot, i) => (
        <Button
          key={slot}
          size="sm"
          className="em-slot"
          title={REACH_OUT_SLOT_WORDS[slot]}
          onClick={() => seats.add(slot)}
          data-testid={`ro-slot-${slot.replace(/ /g, "-")}`}
        >
          {REACH_OUT_SLOT_SET.labels[i]}
        </Button>
      ))}
      <span className="em-slots-hint">{W.REACH_OUT_SHEET_WORDS.slotsHint}</span>
    </div>
  );
}

/**
 * One step's words, written in the box every email is written in (templates/slots/words-field.tsx, the Templates page's
 * too): the subject for the first only, the words with each slot a chip by its name, the six slots to put in at the
 * caret, and each field's problems under it. The stored words keep their named slots ({{business}}).
 */
function RoStepWords({ W, step, n, issues, onEdit }: StepWordsProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  const subject = n === 0 ? (step.subject ?? "") : "";
  const seats = useSlotSeats({ subject, body: step.body }, (to, words) => onEdit(n, { [to]: words }));
  const box = { slots: REACH_OUT_SLOT_SET, readOnly: false, seats };
  return (
    <div className="ro-words" data-testid={`ro-words-${n}`}>
      {n === 0 && (
        <>
          <WordsField
            {...box}
            name="subject"
            label={P.subject}
            lines={1}
            value={subject}
            onType={(words) => onEdit(n, { subject: words })}
            testid="ro-subject"
          />
          <RoIssues lines={issues.subject} testid="ro-subject-issues" />
        </>
      )}
      <WordsField
        {...box}
        name="body"
        label={P.body}
        lines={n === 0 ? 8 : 4}
        value={step.body}
        onType={(words) => onEdit(n, { body: words })}
        testid={n === 0 ? "ro-body" : `ro-step-body-${n}`}
      />
      <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
      <RoSlots W={W} n={n} seats={seats} />
    </div>
  );
}

interface WhatProps {
  W: Words;
  draft: ReachOutDraft;
  issues: ReachOutDraftIssues;
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
  onSigned: (name: string) => void;
  from: string | null;
}

/** What you'd say: the first email, the slots, the opening's note, the fills, and the name it signs with. */
export function RoWhat({ W, draft, issues, onEdit, onSigned, from }: WhatProps) {
  const S = W.REACH_OUT_SHEET_WORDS;
  const mailbox = roMailbox();
  return (
    <section className="pb-sec" data-testid="ro-what">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.words}</span>
      <RoStepWords W={W} step={draft.steps[0]} n={0} issues={issues.steps[0]} onEdit={onEdit} />
      <p className="pb-note">{S.opening}</p>
      <div className="pb-fills">
        {from && (
          <div className="pb-fill">
            <span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.fromLine}</span>
            <span className="pb-fill-val">
              <span className="pb-fill-words">{from}</span>
            </span>
          </div>
        )}
        <div className="pb-fill">
          <span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.footLine}</span>
          <span className="pb-fill-val">
            <span className="pb-fill-words">{S.foot}</span>
            <span className="pb-fill-hint">{S.footHint}</span>
          </span>
        </div>
        {mailbox && (
          <div className="pb-fill">
            <span className="pb-fill-key">{W.REACH_OUT_SHEET_PARTS.repliesLine}</span>
            <span className="pb-fill-val">
              <span className="pb-fill-words">{mailbox}</span>
              <span className="pb-fill-hint">{S.repliesHint}</span>
            </span>
          </div>
        )}
      </div>
      <div className="ro-stack">
        <Field
          label={W.REACH_OUT_SHEET_PARTS.signAs}
          value={draft.signed_by}
          maxLength={60}
          onValueChange={onSigned}
          data-testid="ro-signed"
        />
        <RoIssues lines={issues.signed_by} testid="ro-signed-issues" />
      </div>
      <RoIssues lines={issues.chain} testid="ro-chain-issues" />
      <p className="pb-note" data-testid="ro-stop-one">
        {S.stopOne}
      </p>
    </section>
  );
}

/** A step that is a call or a note for the team: it carries its hand. */
type HandStep = ReachOutDraftStep & { hand: StepHand };
const isHandStep = (s: ReachOutDraftStep): s is HandStep => !!s.hand;

interface HandWordsProps {
  W: Words;
  step: HandStep;
  n: number;
  issues: ReachOutDraftIssues["steps"][number];
  onHand: (n: number, words: string) => void;
}

/** A call's or a note's words: what to do when each business comes up on your Today (Part 5, G20). */
function RoHandWords({ W, step, n, issues, onHand }: HandWordsProps) {
  const S = W.REACH_OUT_SHEET_WORDS;
  return (
    <div className="ro-stack" data-testid={`ro-hand-${n}`}>
      <Field
        label={S.handWords}
        hint={S.handHint}
        rows={2}
        maxLength={W.HAND_WORDS_MAX}
        value={step.hand.words}
        placeholder={S.handPlaceholder}
        onValueChange={(words) => onHand(n, words)}
        data-testid={`ro-hand-words-${n}`}
      />
      <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
    </div>
  );
}

interface ThenProps {
  W: Words;
  draft: ReachOutDraft;
  issues: ReachOutDraftIssues;
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
  onAfter: (n: number, days: number) => void;
  onAdd: () => void;
  onAddHand: (kind: HandKind) => void;
  onHand: (n: number, words: string) => void;
  onDrop: () => void;
}

/** Then: the chain as steps, each later one after its days with nothing back, up to five; the last may be taken off. */
export function RoThen({ W, draft, issues, onEdit, onAfter, onAdd, onAddHand, onHand, onDrop }: ThenProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  const S = W.REACH_OUT_SHEET_WORDS;
  const days = W.reachOutAfterDayChoices().map((n) => ({ v: n, t: `${n} days` }));
  return (
    <section className="pb-sec" data-testid="ro-then">
      <span className="pb-sec-k">{P.then}</span>
      <div className="pb-chain">
        <div className="pb-chain-row">
          <span className="pb-chain-k">{W.stepLabel(0)}</span>
          <span className="dim">{P.dayOne}</span>
        </div>
        {draft.steps.slice(1).map((s, i) => {
          const n = i + 1;
          return (
            <div key={n} className="pb-chain-row" data-testid={`ro-step-${n}`}>
              <span className="pb-chain-k">{W.stepLabelOf({ n, hand: s.hand })}</span>
              <span>
                {P.after}{" "}
                <Picker
                  label={`${P.after} how many days`}
                  value={String(s.after_days)}
                  onValueChange={(v) => onAfter(n, Number(v))}
                  groups={cmNumbers(days)}
                  chevron={cmChevron()}
                  data-testid={`ro-after-${n}`}
                />{" "}
                {P.afterTail}
              </span>
              {isHandStep(s) ? (
                <RoHandWords W={W} step={s} n={n} issues={issues.steps[n]} onHand={onHand} />
              ) : (
                <RoStepWords W={W} step={s} n={n} issues={issues.steps[n]} onEdit={onEdit} />
              )}
              {n === draft.steps.length - 1 && (
                <LinkButton onClick={onDrop} data-testid="ro-remove">
                  {P.remove}
                </LinkButton>
              )}
            </div>
          );
        })}
        {W.reachOutMayAddStep(draft) && (
          <>
            <LinkButton className="pb-chain-add" onClick={onAdd} data-testid="ro-add">
              <Icon name="plus" size={12} /> {S.anotherStep} <span className="dim">{S.anotherStepHint}</span>
            </LinkButton>
            <LinkButton className="pb-chain-add" onClick={() => onAddHand("call")} data-testid="ro-add-call">
              <Icon name="plus" size={12} /> {S.anotherCall}
            </LinkButton>
            <LinkButton className="pb-chain-add" onClick={() => onAddHand("note")} data-testid="ro-add-note">
              <Icon name="plus" size={12} /> {S.anotherNote}
            </LinkButton>
          </>
        )}
      </div>
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.stops}</p>
    </section>
  );
}
