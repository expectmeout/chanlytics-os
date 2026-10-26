/**
 * Go live, switch it on (decision 0073, canvas 5B, 5B·a–5B·j): paid, now one list that fills itself in. Its number on its
 * way (the buy goes on by itself, the phone's number part: FrPhone), the code that sends the calls nobody picks up to it
 * (saved by itself where what rings was looked up at Where it answers, else the two questions: its forward part), the
 * owner's own call through the number kept that proves it ("Check my line", once the number is bought: the test window
 * and the Live page's calls, FrTry), WhatsApp's approval on the phone (Meta's steps for keeping the app said first, R12,
 * R21), the booking-link message with Meta, and what came in, the kept app's chats in Meta's three parts (5B·i). Two rows
 * need the owner's hands; either can wait, and Today keeps the same list. What the list cannot do (a line stopped
 * part-way, a card that did not pay) is Setup's own rows, drawn above it with their verbs.
 */
import { useState, type ReactNode } from "react";
import {
  FIRST_RUN_HELPERS,
  IMPORT_WORDS,
  KEEP_ROW,
  WHATSAPP_PART_WORDS,
  type FirstRunGoLiveVM,
  type FirstRunPhoneVM,
  type FirstRunTryVM,
  type GoLiveItemVM,
  type WhatsappChoice,
  type WhatsappPartVM,
} from "@chanlytics/contracts";
import { WhatsappSteps } from "./whatsapp";
import { Icon } from "../../../kit/icon/icon";
import { refusalToast, type LegacyFlash } from "../../../legacy-verbs";
import { setupVerbs } from "../../surface";
import type { KeptPhoneChoice } from "../memory";
import { FrPhone } from "../phone";
import { FrTry } from "../try";
import { W } from "../words";

const GW = FIRST_RUN_HELPERS.goLiveWords;
const SO = GW.switchOn;

/** A row's mark: done, needs you, waiting on someone else, stopped with nothing to press, or put off. */
function mark(state: GoLiveItemVM["state"]): ReactNode {
  if (state === "done") return <Icon name="check" size={12} />;
  if (state === "needs") return <span className="fr-needs">{SO.needsYou}</span>;
  if (state === "waiting") return <span className="fr-pulse" aria-hidden="true" />;
  if (state === "stopped") return <span className="fr-detail">{IMPORT_WORDS.stopped}</span>;
  return <span className="fr-detail">{SO.later}</span>;
}

/** The kept app's chats in Meta's three parts (canvas 5B·i), each with where it stands, and what they are once in. */
function ChatParts({ parts, assistant }: { parts: WhatsappPartVM[]; assistant: string | null }) {
  return (
    <div className="fr-chat-parts" data-testid="fr-wa-parts">
      <ul className="fr-imports">
        {parts.map((p) => (
          <li key={p.key} className="fr-import" data-state={p.state} data-testid={`fr-wa-part-${p.key}`}>
            <span className="fr-import-words">
              <b>{p.label}</b>
              {p.says ? <span className="fr-detail">{p.says}</span> : null}
            </span>
            <span className="fr-import-stand">{p.stand}</span>
          </li>
        ))}
      </ul>
      <p className="fr-detail">{WHATSAPP_PART_WORDS.note(assistant)}</p>
    </div>
  );
}

/** The forwarding row, opened: the code (or the questions), then the owner's own call, or the call it took. */
function ForwardBody(o: {
  ph: FirstRunPhoneVM;
  tr: FirstRunTryVM | null;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  leave: (to: string) => void;
  kept: boolean;
  /** The receptionist's number is bought: a call to it can be checked. */
  numberReady: boolean;
}) {
  const { ph, tr, choice, setChoice, flash, go, leave, kept, numberReady } = o;
  const [checking, setChecking] = useState(false);
  const callCame = !!tr && (tr.stage === "call" || tr.stage === "done");
  const later = async () => {
    const r = await setupVerbs.later(kept ? KEEP_ROW : FIRST_RUN_HELPERS.trySkipped, {
      on: true,
      why: kept ? "rest" : "answer",
    });
    if (!r.ok) flash(refusalToast(r, W.find.notSaved));
  };
  if (tr && (checking || callCame))
    return (
      <FrTry
        tr={tr}
        W={FIRST_RUN_HELPERS.tryWords}
        flash={flash}
        go={go}
        leave={leave}
        back={null}
        backLabel={W.back}
        onShowCode={() => setChecking(false)}
      />
    );
  const phoneDraws = ["buying", "getting", "ask", "code"].includes(ph.stage);
  return (
    <div className="fr-forward" data-testid="fr-forward">
      {phoneDraws ? (
        <FrPhone
          ph={ph}
          choice={choice}
          setChoice={setChoice}
          W={FIRST_RUN_HELPERS.phoneWords}
          flash={flash}
          go={go}
          part="forward"
        />
      ) : null}
      {tr && numberReady && (ph.stage === "code" || !kept) ? (
        <div className="fr-links">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setChecking(true)}
            data-testid="fr-check-line"
          >
            {SO.checkLine}
          </button>
          <button type="button" className="link-btn" onClick={() => void later()} data-testid="fr-check-later">
            {SO.later}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function FrSwitchOn(o: {
  gl: FirstRunGoLiveVM;
  ph: FirstRunPhoneVM;
  tr: FirstRunTryVM | null;
  choice: KeptPhoneChoice | null;
  setChoice: (c: KeptPhoneChoice | null) => void;
  whatsapp: WhatsappChoice | null;
  waNumber: string | null;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  leave: (to: string) => void;
  assistant: string | null;
  /** Setup's own rows for what the list cannot do (the line row's Retry, Billing's card), or null. */
  rows: ReactNode;
  /** A test call has been on screen since the owner last moved: the forwarding's row stays open on it, though done. */
  tryHeld: boolean;
}) {
  const { gl, ph, tr, choice, setChoice, whatsapp, waNumber, flash, go, leave, assistant, rows, tryHeld } = o;
  const s = gl.switchOn;
  if (!s) return null;
  const kept = !!choice && choice.way !== "new";
  const numberReady = s.items.some((it) => it.key === "number" && it.state === "done");
  return (
    <div className="fr-golive fr-on" data-testid="fr-switch">
      <div className="fr-on-main">
        {s.plan ? (
          <p className="fr-proof" data-testid="fr-switch-plan">
            <Icon name="check" size={12} />
            {s.plan}
          </p>
        ) : null}
        {rows}
        <ol className="fr-on-items" data-testid="fr-on-items">
          {s.items.map((it, i) => (
            <li key={`${it.key}-${i}`} className="fr-on-item" data-state={it.state} data-testid={`fr-switch-${it.key}`}>
              <span className="fr-on-state">{mark(it.state)}</span>
              <span className="fr-on-words">
                <span className="fr-sentence">{it.label}</span>
                {it.sub ? <span className="fr-detail">{it.sub}</span> : null}
              </span>
              {it.key === "number" && it.state === "waiting" && ph.stage !== "rows" ? (
                <FrPhone
                  ph={ph}
                  choice={choice}
                  setChoice={setChoice}
                  W={FIRST_RUN_HELPERS.phoneWords}
                  flash={flash}
                  go={go}
                  part="number"
                />
              ) : null}
              {it.key === "forward" && (it.state === "needs" || tryHeld) ? (
                <ForwardBody
                  ph={ph}
                  tr={tr}
                  choice={choice}
                  setChoice={setChoice}
                  flash={flash}
                  go={go}
                  leave={leave}
                  kept={kept}
                  numberReady={numberReady}
                />
              ) : null}
              {it.key === "whatsapp" && it.state === "needs" ? (
                <WhatsappSteps choice={whatsapp} number={waNumber} flash={flash} />
              ) : null}
              {it.parts ? <ChatParts parts={it.parts} assistant={assistant} /> : null}
            </li>
          ))}
        </ol>
        <div className="fr-foot">
          <span />
          <button
            type="button"
            className="btn btn-lg btn-primary fr-go"
            onClick={() => leave("today")}
            data-testid="fr-switch-today"
          >
            {SO.open}
          </button>
        </div>
      </div>
      <aside className="panel fr-pane fr-on-ask" aria-label={SO.askTitle(assistant)} data-testid="fr-on-ask">
        <span className="fr-label">{SO.askTitle(assistant)}</span>
        <span className="fr-sentence">{SO.askDone(s.done, s.of)}</span>
        <span className="fr-label">{SO.answersTitle(assistant)}</span>
        <dl className="fr-rcp-rows">
          {s.answers.map((a) => (
            <div key={a.key} className="fr-rcp-row">
              <dt className="fr-label">{a.label}</dt>
              <dd>{a.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
