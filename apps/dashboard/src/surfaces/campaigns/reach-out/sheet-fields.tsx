/**
 * The reach-out sheet's fields (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR
 * 6): who gets it, what you'd say, and the steps that follow. Each part is a component of the sheet's own, as the JSX drew
 * them, over the draft the sheet holds (sheet-draft.ts) and contracts' words (`reachOuts.words`).
 */
import type { SyntheticEvent } from "react";
import type {
  HandKind,
  ReachOutDraft,
  ReachOutDraftIssues,
  ReachOutDraftStep,
  ReachOutReachDto,
  ReachOutSlot,
  StepHand,
} from "@chanlytics/contracts";
import { setupDto } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { PbTok } from "../playbooks/words";
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

/** The six slots as chips: each puts its slot in at the caret of the field last focused. */
function RoSlots({
  W,
  onSlot,
  testid = "ro-slots",
}: {
  W: Words;
  onSlot: (slot: ReachOutSlot) => void;
  testid?: string;
}) {
  return (
    <div className="em-slots" data-testid={testid}>
      {W.REACH_OUT_SLOTS.map((s) => (
        <button
          key={s}
          type="button"
          className="chip em-slot"
          title={W.REACH_OUT_SLOT_WORDS[s]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSlot(s)}
          data-testid={`ro-slot-${s.replace(/ /g, "-")}`}
        >
          {s}
        </button>
      ))}
      <span className="em-slots-hint">{W.REACH_OUT_SHEET_WORDS.slotsHint}</span>
    </div>
  );
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
                  <button
                    type="button"
                    className="cm-reach-door"
                    onClick={() => onInclude(!include)}
                    data-testid="ro-include"
                  >
                    {w.door}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A field a step's words are typed in: where its caret was when it took focus or a selection. */
type WordsField = "subject" | "body";

interface StepWordsProps {
  W: Words;
  step: ReachOutDraftStep;
  n: number;
  issues: ReachOutDraftIssues["steps"][number];
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
  onFocus: (n: number, field: WordsField, at: number | null) => void;
}

/** One step's words: the subject for the first only, the words, and each field's problems under it. */
function RoStepWords({ W, step, n, issues, onEdit, onFocus }: StepWordsProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  // A focus or a selection is on the field itself: its target is the box the caret is in.
  const at = (field: WordsField) => (e: SyntheticEvent) =>
    onFocus(n, field, (e.target as HTMLInputElement | HTMLTextAreaElement).selectionStart);
  return (
    <div className="ro-words" data-testid={`ro-words-${n}`}>
      {n === 0 && (
        <label className="ro-field">
          <span className="ro-field-k">{P.subject}</span>
          <input
            className="bc-subject"
            value={step.subject || ""}
            onChange={(e) => onEdit(n, { subject: e.target.value })}
            onFocus={at("subject")}
            onSelect={at("subject")}
            data-testid="ro-subject"
          />
          <RoIssues lines={issues.subject} testid="ro-subject-issues" />
        </label>
      )}
      <label className="ro-field">
        <span className="ro-field-k">{P.body}</span>
        <textarea
          className="ro-body"
          rows={n === 0 ? 7 : 4}
          value={step.body}
          onChange={(e) => onEdit(n, { body: e.target.value })}
          onFocus={at("body")}
          onSelect={at("body")}
          data-testid={n === 0 ? "ro-body" : `ro-step-body-${n}`}
        />
        <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
      </label>
    </div>
  );
}

interface WhatProps {
  W: Words;
  draft: ReachOutDraft;
  issues: ReachOutDraftIssues;
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
  onFocus: (n: number, field: WordsField, at: number | null) => void;
  onSlot: (slot: ReachOutSlot) => void;
  onSigned: (name: string) => void;
  from: string | null;
}

/** What you'd say: the first email, the slots, the opening's note, the fills, and the name it signs with. */
export function RoWhat({ W, draft, issues, onEdit, onFocus, onSlot, onSigned, from }: WhatProps) {
  const S = W.REACH_OUT_SHEET_WORDS;
  const mailbox = roMailbox();
  return (
    <section className="pb-sec" data-testid="ro-what">
      <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.words}</span>
      <RoStepWords W={W} step={draft.steps[0]} n={0} issues={issues.steps[0]} onEdit={onEdit} onFocus={onFocus} />
      <RoSlots W={W} onSlot={onSlot} />
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
      <label className="ro-field">
        <span className="ro-field-k">{W.REACH_OUT_SHEET_PARTS.signAs}</span>
        <input
          className="bc-subject"
          value={draft.signed_by}
          maxLength={60}
          onChange={(e) => onSigned(e.target.value)}
          data-testid="ro-signed"
        />
        <RoIssues lines={issues.signed_by} testid="ro-signed-issues" />
      </label>
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
    <label className="ro-field" data-testid={`ro-hand-${n}`}>
      <span className="ro-field-k">{S.handWords}</span>
      <textarea
        className="ro-body"
        rows={2}
        maxLength={W.HAND_WORDS_MAX}
        value={step.hand.words}
        placeholder={S.handPlaceholder}
        onChange={(e) => onHand(n, e.target.value)}
        data-testid={`ro-hand-words-${n}`}
      />
      <span className="dim">{S.handHint}</span>
      <RoIssues lines={issues.body} testid={`ro-body-issues-${n}`} />
    </label>
  );
}

interface ThenProps {
  W: Words;
  draft: ReachOutDraft;
  issues: ReachOutDraftIssues;
  onEdit: (n: number, patch: Partial<ReachOutDraftStep>) => void;
  onFocus: (n: number, field: WordsField, at: number | null) => void;
  onSlot: (slot: ReachOutSlot) => void;
  onAfter: (n: number, days: number) => void;
  onAdd: () => void;
  onAddHand: (kind: HandKind) => void;
  onHand: (n: number, words: string) => void;
  onDrop: () => void;
}

/** Then: the chain as steps, each later one after its days with nothing back, up to five; the last may be taken off. */
export function RoThen({
  W,
  draft,
  issues,
  onEdit,
  onFocus,
  onSlot,
  onAfter,
  onAdd,
  onAddHand,
  onHand,
  onDrop,
}: ThenProps) {
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
                <PbTok
                  value={s.after_days as number}
                  options={days}
                  onChange={(v) => onAfter(n, Number(v))}
                  label={`${P.after} how many days`}
                  testid={`ro-after-${n}`}
                />{" "}
                {P.afterTail}
              </span>
              {isHandStep(s) ? (
                <RoHandWords W={W} step={s} n={n} issues={issues.steps[n]} onHand={onHand} />
              ) : (
                <>
                  <RoStepWords W={W} step={s} n={n} issues={issues.steps[n]} onEdit={onEdit} onFocus={onFocus} />
                  <RoSlots W={W} onSlot={onSlot} testid={`ro-slots-${n}`} />
                </>
              )}
              {n === draft.steps.length - 1 && (
                <button type="button" className="cl-bucket-link" onClick={onDrop} data-testid="ro-remove">
                  {P.remove}
                </button>
              )}
            </div>
          );
        })}
        {W.reachOutMayAddStep(draft) && (
          <>
            <button type="button" className="pb-chain-add" onClick={onAdd} data-testid="ro-add">
              <Icon name="plus" size={12} /> {S.anotherStep} <span className="dim">{S.anotherStepHint}</span>
            </button>
            <button type="button" className="pb-chain-add" onClick={() => onAddHand("call")} data-testid="ro-add-call">
              <Icon name="plus" size={12} /> {S.anotherCall}
            </button>
            <button type="button" className="pb-chain-add" onClick={() => onAddHand("note")} data-testid="ro-add-note">
              <Icon name="plus" size={12} /> {S.anotherNote}
            </button>
          </>
        )}
      </div>
      <p className="pb-note">{W.REACH_OUT_SHEET_WORDS.stops}</p>
    </section>
  );
}
