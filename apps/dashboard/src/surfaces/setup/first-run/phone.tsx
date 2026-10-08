/**
 * Your phone (canvas R3, V4, V5, P3; contracts first-run-phone.ts; moved from legacy/pages/first-run.jsx, decision 0015):
 * how calls reach the receptionist -- keep the number customers know, a new one, or move it here -- and the trial with the
 * plan's own price, then the number on its way. `ph` is the step as contracts say it over Setup and the owner's `choice`,
 * which the page holds and keeps in the tab (memory.ts), or reads from their saved view where the tab holds none.
 *
 * The button, where a card is still to be given, goes to Stripe (checkout returns to the first run); once the workspace
 * may spend, the buy goes on by itself, once (phone-acts.tsx). Every control is the kit's: the three ways and the numbers
 * to pick are its choice of a few, the boxes its field, the plan and the code its panes.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { formatPhoneDisplay, type FirstRunPhoneCodeVM, type FirstRunPhoneVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { RecordField, RecordToggleGroup } from "../../kit/record/field";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import type { LineChoice } from "../surface";
import { markedLabel } from "./find";
import { PHONE_SENT_MS, type KeptPhoneChoice } from "./memory";
import {
  answer,
  buy,
  copyCode,
  findNumbers,
  press,
  putOff,
  withMe,
  PHONE_GATES,
  type PhoneActs,
  type PhoneWords,
} from "./phone-acts";

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

/**
 * The step's foot, drawn here whenever the step's button is this one's (FirstRun draws no other then). On a phone the
 * foot is held at the screen's edge and the plan's pane may be under it, so what the press starts charging is said in
 * the foot too, beside the button: the price is never out of sight of the press that starts it.
 */
function phoneFoot(o: { ph: FirstRunPhoneVM; k: PhoneActs; back: string | null; backLabel: string }): ReactNode {
  const { ph, k, back, backLabel } = o;
  const cta = ph.cta;
  if (!cta) return null;
  const g = PHONE_GATES[cta.act];
  const gated = g ? gate(g[0], g[1]) : {};
  return (
    <div className="fr-foot">
      {back ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => k.go(back)} data-testid="fr-back">
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
      {ph.plan && !cta.held ? (
        <span className="fr-price" data-testid="fr-phone-price">
          {ph.plan.offer}
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-lg btn-primary fr-go"

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
    <div className="panel fr-pane" data-testid="fr-phone-questions">
      {asked.map(([key, one]) => (
        <div key={key} className="fr-question" data-testid={`fr-q-${key}`}>
          <span className="fr-label" id={`fr-q-${key}-label`}>
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
      {ph.keepCode || ph.putOff ? (
        <div className="fr-links">
          {ph.keepCode ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => answer(k, { redo: false })}
              data-testid="fr-phone-keep"
            >
              {ph.keepCode}
            </button>
          ) : null}
          {ph.putOff ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => void putOff(k)}
              data-testid="fr-phone-put-off"
              {...gate("settings", "put the forwarding off")}
            >
              {ph.putOff}
            </button>
          ) : null}
        </div>
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
  // it, and a desk has nothing to dial with, so there the code is words to dial, and a press to copy them.
  const tapDials = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage="code">
      {c.verified ? (
        <p className="fr-proof" data-testid="fr-phone-verified">
          <Icon name="check" size={12} />
          {c.verified}
        </p>
      ) : null}
      <div className="panel fr-pane" data-testid="fr-phone-code">
        <span className="fr-label">{c.label}</span>
        <div className="fr-dial-row">
          <span className="fr-dial tabular" data-testid="fr-phone-dial">
            {c.dial}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void copyCode(k, c.dial)}
            data-testid="fr-phone-copy"
          >
            <Icon name="copy" size={12} />
            {k.W.copy}
          </button>
          {c.tap && tapDials ? (
            <a className="btn btn-sm fr-tap" href={c.tel} data-testid="fr-phone-tap">
              <Icon name="phone" size={12} />
              {c.tap}
            </a>
          ) : null}
        </div>
        <ol className="fr-steps">
          {c.steps.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </div>
      <p className="fr-warn" data-testid="fr-phone-warn">
        <span className="fr-warn-dot" aria-hidden="true" />
        {c.warn}
      </p>
      <p className="fr-quiet">{c.off}</p>
      {c.withMe ? (
        <div className="fr-with" data-testid="fr-phone-with-me">
          {c.withMe.asked ? (
            <p className="fr-quiet" data-testid="fr-phone-with-me-asked">
              {c.withMe.asked}
            </p>
          ) : (
            <>
              <p className="fr-quiet">{c.withMe.sentence}</p>
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
      <div className="fr-links">
        {c.help.notes.length ? (
          <button
            type="button"
            className="link-btn"
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
            className="link-btn"
            onClick={() => answer(k, { redo: true })}
            data-testid="fr-phone-change"
            {...gate("disconnect", "set up forwarding")}
          >
            {c.change}
          </button>
        ) : null}
      </div>
      {help ? (
        <ul className="fr-notes" data-testid="fr-phone-notes">
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
        <div className="panel fr-pane fr-status" role="status" data-testid="fr-phone-status">
          <StatePill kind="setup" value={ph.status.state} label={ph.status.words} />
          <span className="fr-sentence">{ph.status.sentence}</span>
          <span className="fr-detail">{ph.status.detail}</span>
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
    <div className="fr-new">
      <form
        className="fr-find-form fr-area"
        onSubmit={(e) => {
          e.preventDefault();
          void findNumbers(k);
        }}
      >
        <RecordField
          id="fr-phone-area"
          label={W.areaLabel}
          inputMode="numeric"
          maxLength={3}
          placeholder={W.areaPlaceholder}
          value={k.area}
          onChange={(words) => {
            setArea(words.replace(/\D/g, "").slice(0, 3));
            k.setAreaProblem(null);
          }}
          problem={areaProblem}
          testid="fr-phone-area"
        />
        <button
          className="btn"
          type="submit"
          disabled={k.busy}
          data-testid="fr-phone-find"
          {...gate("disconnect", "find a number")}
        >
          {k.busy ? W.finding : W.find}
        </button>
      </form>
      {numbers && numbers.length ? (
        <RecordToggleGroup<string>
          id="fr-phone-pick"
          label={W.pickLabel}
          value={c.pick ? c.pick.e164 : null}
          options={numbers.map((n) => ({
            value: n.e164,
            label: formatPhoneDisplay(n.e164) || n.friendly,
            hint: [n.locality, n.region].filter(Boolean).join(", ") || W.local,
          }))}
          onChange={(e164) => {
            const n = numbers.find((x) => x.e164 === e164);
            if (n) change({ pick: { e164: n.e164, friendly: n.friendly } });
          }}
          testid="fr-phone-numbers"
        />
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
    <RecordField
      id="fr-phone-number"
      label={W.numberLabel}
      inputMode="tel"
      autoComplete="tel"
      placeholder={W.numberPlaceholder}
      value={shown}
      onChange={(words) => change({ number: words })}
      onBlur={leftBox}
      problem={boxLeft ? ph.boxProblem : null}
      testid="fr-phone-number-box"
    />
  );
}

/** The ways calls reach the receptionist, as one choice: each way and what it means, the one most take marked. */
function phoneWays(ph: FirstRunPhoneVM, busy: boolean, change: (p: Partial<KeptPhoneChoice>) => void) {
  return (
    <div className="fr-stack">
      <RecordToggleGroup<FirstRunPhoneVM["way"]>
        id="fr-way"
        label={ph.heading}
        value={ph.way}
        options={ph.ways.map((w) => ({
          value: w.key,
          label: markedLabel(w.title, w.recommended),
          hint: w.sentence,
        }))}
        onChange={(way) => change({ way })}
        readOnly={busy}
        testid="fr-ways"
      />
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
      <div className="panel fr-pane">
        {phoneWays(ph, busy, change)}
        {ph.way === "new"
          ? newNumber({ W, k, setArea, areaProblem, numbers, change })
          : keptNumber({ W, ph, c, change, boxLeft, leftBox: () => setBoxLeft(true) })}
      </div>
      {ph.plan ? (
        <div className="panel fr-plan" data-testid="fr-plan">
          <span className="fr-plan-offer">{ph.plan.offer}</span>
          <span className="fr-detail">{ph.plan.note}</span>
        </div>
      ) : null}
      {foot}
    </div>
  );
};
