/**
 * The phone's parts (canvas R3, R4, R5, V6, P5; contracts first-run-phone.ts; moved from legacy/pages/first-run.jsx,
 * decision 0015). Where it answers draws the choosing from them (channels/calls.tsx: the three ways, the number box, a new
 * number's pick); Go live draws the rest in Switch it on's list: the number on its way, which this buys once the workspace
 * may spend (phone-acts.tsx), and the forwarding of the number kept, its two questions and its code. `ph` is the step as
 * contracts say it over Setup and the owner's `choice`, which the page holds and keeps in the tab (memory.ts), or reads
 * from their saved view where the tab holds none. Every control is the kit's: the ways and the numbers to pick are its
 * choice of a few, the boxes its field, the code its pane.
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
import { SteadyLabel } from "./parts";
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
  /**
   * Which row of Switch it on's list draws it (decision 0073). `number`: the number on its way, which it buys, once; the
   * one part that buys, so a list drawing both never sends two. `forward`: the number kept's two questions and its code,
   * the forwarding saved by itself once the line answers where they are already answered (looked up at Where it answers,
   * R11), so the code is shown with no question asked.
   */
  part: "number" | "forward";
}

/** The forwarding's button (Show me what to dial), and why it waits: the line on its way, or a question unanswered. */
function phoneFoot(ph: FirstRunPhoneVM, k: PhoneActs): ReactNode {
  const cta = ph.cta;
  if (!cta || cta.act !== "forward") return null;
  const g = PHONE_GATES[cta.act];
  const gated = g ? gate(g[0], g[1]) : {};
  return (
    <div className="fr-foot">
      <span />
      {cta.held ? (
        <span className="fr-held" id="fr-phone-held" data-testid="fr-phone-held">
          {cta.held}
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

/** The number on its way: where it stands, in the line row's own words. */
function statusStage(ph: FirstRunPhoneVM) {
  return (
    <div className="fr-line-step" data-testid="fr-number" data-stage={ph.stage}>
      {ph.status ? (
        <div className="panel fr-pane fr-status" role="status" data-testid="fr-phone-status">
          <StatePill kind="setup" value={ph.status.state} label={ph.status.words} />
          <span className="fr-sentence">{ph.status.sentence}</span>
          <span className="fr-detail">{ph.status.detail}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A new number: the area code, and the three free in it to pick from. */
export function newNumber(o: {
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
          <SteadyLabel busy={k.busy} idle={W.find} doing={W.finding} />
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
export function keptNumber(o: {
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
export function phoneWays(ph: FirstRunPhoneVM, busy: boolean, change: (p: Partial<KeptPhoneChoice>) => void) {
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

/**
 * The forwarding saved once, by itself, where the questions are already answered (decision 0073): the step's own press,
 * as the owner would make it. A refusal is said by the press and the questions stay, to answer by hand.
 */
function useAutoForward(k: PhoneActs, on: boolean) {
  const tried = useRef(false);
  const { ph } = k;
  // Answered and not saved yet: the press the owner would make, made once, with the acts as they stand then.
  const ready = on && ph.stage === "ask" && !!ph.cta && !ph.cta.held && !ph.saved;
  const acts = useRef(k);
  acts.current = k;
  useEffect(() => {
    if (!ready || tried.current) return;
    tried.current = true;
    void press(acts.current);
  }, [ready]);
}

/** A beat past a buy's mark going stale, so the step drawn then finds it stale. */
const RECHECK_AFTER_MS = 50;

/** The buy that goes on by itself once the plan lets it, once; and the choice let go of once the line is here. */
function usePhoneBuy(k: PhoneActs, fresh: boolean, sentAge: number | null, on: boolean) {
  const { ph, c } = k;
  // Draws the step again once a buy's mark goes stale, so a buy that never landed is sent again (PHONE_SENT_MS).
  const [, recheck] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!on) return undefined;
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
  }, [ph.stage, fresh, on]);
}

export const FrPhone = ({ ph, choice, setChoice, W, flash, go, part }: PhoneProps) => {
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const [help, setHelp] = useState(false);
  // A press that moved the step (a forwarding saved) is done once the step it moved to is drawn.
  useEffect(() => {
    setBusy(false);
  }, [ph.stage]);
  const c: KeptPhoneChoice = choice || { way: ph.way, number: null, pick: null, pending: false };
  // The choosing is Where it answers' (calls.tsx): nothing here searches an area code.
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
    area: ph.area || "",
    setAreaProblem: () => undefined,
    setNumbers: () => undefined,
    setHelp,
  };
  const sentAge = c.sent ? Date.now() - c.sent : null;
  const fresh = sentAge !== null && sentAge < PHONE_SENT_MS;
  usePhoneBuy(k, fresh, sentAge, part === "number");
  useAutoForward(k, part === "forward");
  if (part === "number") return statusStage(ph);
  const foot = phoneFoot(ph, k);
  if (ph.stage === "code" && ph.code) return codeStage({ code: ph.code, k, help, setHelp, foot });
  return (
    <div className="fr-line-step" data-testid="fr-phone" data-stage={ph.stage}>
      {phoneQuestions(ph, k)}
      {foot}
    </div>
  );
};
