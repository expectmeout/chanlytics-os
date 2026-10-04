/**
 * Your phone (canvas R3, V4, V5, P3; contracts first-run-phone.ts; moved from legacy/pages/first-run.jsx, decision 0015):
 * how calls reach the receptionist -- keep the number customers know, a new one, or move it here -- and the trial with the
 * plan's own price, then the number on its way. `ph` is the step as contracts say it over Setup and the owner's `choice`,
 * which the page holds and keeps in the tab (memory.ts).
 *
 * The button, where a card is still to be given, goes to Stripe (checkout returns to the first run); once the workspace
 * may spend, the buy goes on by itself, once (phone-acts.tsx).
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { formatPhoneDisplay, type FirstRunPhoneCodeVM, type FirstRunPhoneVM } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordToggleGroup } from "../../kit/record/field";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import type { LineChoice } from "../surface";
import { PHONE_SENT_MS, type KeptPhoneChoice } from "./memory";
import { answer, buy, findNumbers, press, withMe, PHONE_GATES, type PhoneActs, type PhoneWords } from "./phone-acts";

interface PhoneProps {
  ph: FirstRunPhoneVM;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  W: PhoneWords;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  back: string | null;
  backLabel: string;
  ownFoot: boolean;
}

/** The step's foot, drawn here whenever the step's button is this one's (FirstRun draws no other then). */
function phoneFoot(o: { ph: FirstRunPhoneVM; k: PhoneActs; back: string | null; backLabel: string }): ReactNode {
  const { ph, k, back, backLabel } = o;
  const cta = ph.cta;
  if (!cta) return null;
  const g = PHONE_GATES[cta.act];
  const gated = g ? gate(g[0], g[1]) : {};
  return (
    <div className="fr-foot">
      {back ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => k.go(back)} data-testid="fr-back">
          {backLabel}
        </button>
      ) : (
        <span />
      )}
      {cta.held ? (
        <span className="fr-held" id="fr-phone-held" data-testid="fr-phone-held">
          {cta.held}
        </span>
      ) : null}
      <button
        type="button"
        className="fr-onward"
        onClick={() => void press(k)}
        aria-disabled={cta.held ? true : undefined}
        aria-describedby={cta.held ? "fr-phone-held" : undefined}
        aria-busy={k.busy || undefined}
        data-testid="fr-phone-go"
        {...gated}
      >
        {cta.label}
      </button>
    </div>
  );
}

/** The two questions (canvas R4), each the record kit's radiogroup, kept with the owner's choice as they are answered. */
function phoneQuestions(ph: FirstRunPhoneVM, k: PhoneActs): ReactNode {
  const q = ph.questions;
  if (!q) return null;
  const asked: Array<
    ["rings" | "company", { label: string; options: { key: string; label: string }[]; value: string | null }]
  > = [];
  if (q.rings) asked.push(["rings", q.rings]);
  if (q.company) asked.push(["company", q.company]);
  if (!asked.length) return null;
  return (
    <div className="fr-line-questions" data-testid="fr-phone-questions">
      {asked.map(([key, one]) => (
        <div key={key} className="fr-line-question" data-testid={`fr-q-${key}`}>
          <span className="fr-line-label" id={`fr-q-${key}-label`}>
            {one.label}
          </span>
          <RecordToggleGroup<string>
            labelledBy={`fr-q-${key}-label`}
            value={one.value}
            options={one.options.map((o) => ({ value: o.key, label: o.label }))}
            onChange={(v) =>
              answer(
                k,
                key === "rings"
                  ? { rings: v as KeptPhoneChoice["rings"] }
                  : { company: v as KeptPhoneChoice["company"] },
              )
            }
          />
        </div>
      ))}
      {ph.keepCode ? (
        <button
          type="button"
          className="fr-find-link fr-line-keep"
          onClick={() => answer(k, { redo: false })}
          data-testid="fr-phone-keep"
        >
          {ph.keepCode}
        </button>
      ) : null}
    </div>
  );
}

/** The code to dial (canvas R5, P5): its steps, what can answer first, how to switch it off, and help or a person. */
function codeStage(o: {
  code: FirstRunPhoneCodeVM;
  k: PhoneActs;
  help: boolean;
  setHelp: (f: (v: boolean) => boolean) => void;
  foot: ReactNode;
}) {
  const { code: c, k, help, setHelp, foot } = o;
  // A code with * or # is a tap only where the phone dials one from a link: Android's dialer takes it; an iPhone's refuses
  // it, and a desk has nothing to dial with, so the code is words to dial there.
  const tapDials = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage="code">
      {c.verified ? (
        <p className="fr-line-started" data-testid="fr-phone-verified">
          <Icon name="check" size={12} />
          {c.verified}
        </p>
      ) : null}
      <div className="fr-code" data-testid="fr-phone-code">
        <span className="fr-line-label">{c.label}</span>
        <span className="fr-code-dial tabular" data-testid="fr-phone-dial">
          {c.dial}
        </span>
        <ol className="fr-code-steps">
          {c.steps.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </div>
      <p className="fr-code-warn" data-testid="fr-phone-warn">
        <span className="fr-code-dot" aria-hidden="true" />
        {c.warn}
      </p>
      <p className="fr-code-off">{c.off}</p>
      {/* Outlined: the step's one coral button is Done, the press after the tap. */}
      {c.tap && tapDials ? (
        <a className="btn fr-code-tap" href={c.tel} data-testid="fr-phone-tap">
          {c.tap}
        </a>
      ) : null}
      {c.withMe ? (
        <div className="fr-code-with" data-testid="fr-phone-with-me">
          {c.withMe.asked ? (
            <p className="fr-code-off" data-testid="fr-phone-with-me-asked">
              {c.withMe.asked}
            </p>
          ) : (
            <>
              <p className="fr-code-off">{c.withMe.sentence}</p>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void withMe(k)}
                aria-busy={k.busy || undefined}
                data-testid="fr-phone-with-me-go"
                {...gate("approve", "ask for help with forwarding")}
              >
                {c.withMe.label}
              </button>
            </>
          )}
        </div>
      ) : null}
      <div className="fr-code-links">
        {c.help.notes.length ? (
          <button
            type="button"
            className="fr-find-link"
            aria-expanded={help}
            onClick={() => setHelp((v) => !v)}
            data-testid="fr-phone-help"
          >
            {c.help.label}
          </button>
        ) : null}
        {c.change ? (
          <button
            type="button"
            className="fr-find-link"
            onClick={() => answer(k, { redo: true })}
            data-testid="fr-phone-change"
            {...gate("disconnect", "set up forwarding")}
          >
            {c.change}
          </button>
        ) : null}
      </div>
      {help ? (
        <ul className="fr-code-notes" data-testid="fr-phone-notes">
          {c.help.notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : null}
      {foot}
    </div>
  );
}

/** While the number is on its way: where it stands, the questions, and the foot. */
function statusStage(ph: FirstRunPhoneVM, questions: ReactNode, foot: ReactNode) {
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage={ph.stage}>
      {ph.status ? (
        <div className="fr-line-status" role="status" data-testid="fr-phone-status">
          <StatePill kind="setup" value={ph.status.state} label={ph.status.words} />
          <span className="fr-line-sentence">{ph.status.sentence}</span>
          <span className="fr-line-detail">{ph.status.detail}</span>
        </div>
      ) : null}
      {questions}
      {foot}
    </div>
  );
}

/** A new number: the area code, and the three free in it to pick from. */
function newNumber(o: {
  W: PhoneWords;
  k: PhoneActs;
  setArea: (a: string) => void;
  areaProblem: string | null;
  numbers: LineChoice[] | null;
  change: (patch: Partial<KeptPhoneChoice>) => void;
}) {
  const { W, k, setArea, areaProblem, numbers, change } = o;
  const c = k.c;
  return (
    <div className="fr-line-new">
      <form
        className="fr-find-search"
        onSubmit={(e) => {
          e.preventDefault();
          void findNumbers(k);
        }}
      >
        <label className="fr-line-label" htmlFor="fr-phone-area">
          {W.areaLabel}
        </label>
        <input
          id="fr-phone-area"
          className="fr-find-input fr-line-area"
          inputMode="numeric"
          maxLength={3}
          placeholder={W.areaPlaceholder}
          value={k.area}
          onChange={(e) => {
            setArea(e.target.value.replace(/\D/g, "").slice(0, 3));
            k.setAreaProblem(null);
          }}
          aria-invalid={areaProblem ? true : undefined}
          aria-describedby={areaProblem ? "fr-phone-area-problem" : undefined}
          data-testid="fr-phone-area"
        />
        <button
          type="submit"
          className="btn btn-sm"
          disabled={k.busy}
          data-testid="fr-phone-find"
          {...gate("disconnect", "find a number")}
        >
          {k.busy ? W.finding : W.find}
        </button>
      </form>
      <FieldError id="fr-phone-area-problem" message={areaProblem} testid="fr-phone-area-problem" />
      {numbers && numbers.length ? (
        <div className="fr-find-hits" role="radiogroup" aria-label={W.pickLabel} data-testid="fr-phone-numbers">
          {numbers.map((n) => (
            <label key={n.e164} className="fr-find-hit" data-testid="fr-phone-number">
              <input
                type="radio"
                name="fr-phone-pick"
                value={n.e164}
                checked={!!c.pick && c.pick.e164 === n.e164}
                onChange={() => change({ pick: { e164: n.e164, friendly: n.friendly } })}
              />
              <span className="fr-find-body">
                <span className="fr-find-name tabular">{formatPhoneDisplay(n.e164) || n.friendly}</span>
                <span className="fr-find-where">{[n.locality, n.region].filter(Boolean).join(", ") || W.local}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The number kept or moved, typed: what is wrong with it said once the owner has left the box. */
function keptNumber(o: {
  W: PhoneWords;
  ph: FirstRunPhoneVM;
  c: KeptPhoneChoice;
  change: (p: Partial<KeptPhoneChoice>) => void;
  boxLeft: boolean;
  leftBox: () => void;
}) {
  const { W, ph, c, change, boxLeft, leftBox } = o;
  const shown = c.number !== null ? c.number : ph.box;
  return (
    <label className="fr-line-field">
      <span className="fr-line-label">{W.numberLabel}</span>
      <input
        className="fr-find-input"
        inputMode="tel"
        autoComplete="tel"
        placeholder={W.numberPlaceholder}
        value={shown}
        onChange={(e) => change({ number: e.target.value })}
        onBlur={leftBox}
        aria-invalid={boxLeft && ph.boxProblem ? true : undefined}
        aria-describedby={boxLeft && ph.boxProblem ? "fr-phone-number-problem" : undefined}
        data-testid="fr-phone-number-box"
      />
      <FieldError
        id="fr-phone-number-problem"
        message={boxLeft ? ph.boxProblem : null}
        testid="fr-phone-number-problem"
      />
    </label>
  );
}

/** The ways calls reach the receptionist, as a radiogroup of cards. */
function phoneWays(ph: FirstRunPhoneVM, busy: boolean, change: (p: Partial<KeptPhoneChoice>) => void) {
  return (
    <div className="fr-find-hits" role="radiogroup" aria-label={ph.heading}>
      {ph.ways.map((w) => (
        <label key={w.key} className="fr-find-hit" data-testid={`fr-way-${w.key}`}>
          <input
            type="radio"
            name="fr-way"
            value={w.key}
            checked={ph.way === w.key}
            onChange={() => change({ way: w.key })}
            disabled={busy}
          />
          <span className="fr-find-body">
            <span className="fr-find-name">{w.title}</span>
            <span className="fr-find-where">{w.sentence}</span>
          </span>
          {w.recommended ? <span className="pill pill-ok fr-find-best">{w.recommended}</span> : null}
        </label>
      ))}
    </div>
  );
}

/** A beat past a buy's mark going stale, so the step drawn then finds it stale. */
const RECHECK_AFTER_MS = 50;

/** The buy that goes on by itself once the plan lets it, once; and the choice let go of once the line is here. */
function usePhoneBuy(k: PhoneActs, fresh: boolean, sentAge: number | null) {
  const { ph, c } = k;
  // Draws the step again once a buy's mark goes stale, so a buy that never landed is sent again (PHONE_SENT_MS).
  const [, recheck] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (ph.stage === "buying" && !k.sent.current && !fresh) {
      k.sent.current = true;
      k.setChoice({ ...c, sent: Date.now() });
      void buy(k);
    }
    // The line is here: what is left of the choice is the way, for the steps after.
    if (ph.stage === "getting" && c.pending) k.setChoice({ ...c, pending: false, sent: false, returnedAt: null });
    // Sent from another draw and not landed yet: look again when its mark goes stale.
    if (ph.stage === "buying" && fresh && !k.sent.current && sentAge !== null) {
      const t = setTimeout(recheck, PHONE_SENT_MS - sentAge + RECHECK_AFTER_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [ph.stage, fresh]);
}

export const FrPhone = ({ ph, choice, setChoice, W, flash, go, back, backLabel, ownFoot }: PhoneProps) => {
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<LineChoice[] | null>(null);
  const [area, setArea] = useState(ph.area || "");
  // What is wrong with the area code, said under it once Find is pressed, and gone as it is typed again.
  const [areaProblem, setAreaProblem] = useState<string | null>(null);
  // Whether the owner has left the number box: what is wrong with it is said then, not at the first keystroke.
  const [boxLeft, setBoxLeft] = useState(false);
  const sent = useRef(false);
  const [help, setHelp] = useState(false);
  // A press that moved the step (a forwarding saved) is done once the step it moved to is drawn.
  useEffect(() => {
    setBusy(false);
  }, [ph.stage]);
  const c: KeptPhoneChoice = choice || { way: ph.way, number: null, pick: null, pending: false };
  const change = (patch: Partial<KeptPhoneChoice>) =>
    setChoice({ ...c, ...patch, pending: false, sent: false, returnedAt: null });
  const k: PhoneActs = {
    ph,
    c,
    setChoice,
    W,
    flash,
    go,
    busy,
    setBusy,
    sent,
    area,
    setAreaProblem,
    setNumbers,
    setHelp,
  };
  const sentAge = c.sent ? Date.now() - c.sent : null;
  const fresh = sentAge !== null && sentAge < PHONE_SENT_MS;
  usePhoneBuy(k, fresh, sentAge);
  const foot = ownFoot && ph.cta ? phoneFoot({ ph, k, back, backLabel }) : null;
  const questions = phoneQuestions(ph, k);
  if (ph.stage === "code" && ph.code) return codeStage({ code: ph.code, k, help, setHelp, foot });
  if (ph.stage !== "choose") return statusStage(ph, questions, foot);
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage="choose">
      {phoneWays(ph, busy, change)}
      {ph.way === "new"
        ? newNumber({ W, k, setArea, areaProblem, numbers, change })
        : keptNumber({ W, ph, c, change, boxLeft, leftBox: () => setBoxLeft(true) })}
      {ph.plan ? (
        <div className="fr-trial" data-testid="fr-plan">
          <span className="fr-trial-offer">{ph.plan.offer}</span>
          <span className="fr-trial-note">{ph.plan.note}</span>
        </div>
      ) : null}
      {foot}
    </div>
  );
};
