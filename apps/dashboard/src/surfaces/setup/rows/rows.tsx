/**
 * Setup's rows, as attention rows, with everything a row does (moved from legacy/pages/setup.jsx, decision 0015): a
 * route, a dial, or one of the rows' own acts (asking a person, the line chooser, forwarding, activation, billing), each
 * behind its door's role (`setupGate`). `rows` are Setup's (contracts setupSteps), in the order to draw them; `primary`
 * names the row whose button is the one coral action; `later` is what a row's second button says, the caller's
 * (contracts): the first run's Later keeps the row drawn with its undo, Today's Skip takes it off the card and says so in
 * a toast with Undo (`said`). Holds the panels' state and the one verb on its way, so a second press waits for the first
 * (S23). The list only: the caller draws the card it sits in, and may lend the toast (`flash`) where the card can go while
 * one is up -- Today's, when its last row is skipped. `look` is how a row is drawn: `row`, the attention row the first run
 * draws; `card`, Today's compact row (SetupCardRow), whose first carries `left`, the card's count.
 */
import { useState, type ReactNode } from "react";
import { stateOf, type SetupRowVM, type SetupVerb } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { refusalToast, useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { setupVerbs, type SetupSurface } from "../surface";
import { pressVerb, type RowActs } from "./acts";
import { SetupCardRow, type SetupCardAct } from "./card-row";
import { ForwardingCard } from "./forwarding";
import { setupGate, setupGated } from "./gates";
import { LineChooser } from "./line-chooser";

/** What a row's second button says: put it off, take it back, and the toast's words for a row taken off the card. */
interface SetupLaterWords {
  put: string;
  undo?: string;
  said?: string;
}

interface SetupRowsProps {
  S: SetupSurface;
  rows: readonly SetupRowVM[];
  later: SetupLaterWords;
  look?: "row" | "card";
  primary?: string | null;
  left?: ReactNode;
  flash?: ((f: LegacyFlash) => void) | null;
  testid?: string;
}

const setupTone = (state: string): string => stateOf("setup", state).tone;

/** A row's two acts: its verb, and its undo or its Later (none for a required row, or one that is ready). */
function rowActs(
  r: SetupRowVM,
  o: {
    primary: string | null;
    pending: string | null;
    act: (v: SetupVerb | null | undefined) => void;
    putOff: (r: SetupRowVM) => void;
    later: SetupLaterWords;
  },
): { cta: SetupCardAct | null; also: SetupCardAct | null } {
  const { primary, pending, act, putOff, later } = o;
  const cta = r.verb
    ? {
        label: r.verb.label,
        kind: primary === r.id ? "primary" : "ghost",
        onClick: () => act(r.verb),
        gate: setupGate(r.verb),
        busy: pending === r.verb.to,
      }
    : null;
  const laterLabel = r.later ? later.undo : later.put;
  const also = r.undo
    ? {
        label: r.undo.label,
        onClick: () => act(r.undo),
        gate: setupGate(r.undo),
        busy: pending === r.undo.to,
        testid: `setup-undo-${r.id}`,
      }
    : !r.required && r.state !== "ready" && laterLabel
      ? {
          label: laterLabel,
          onClick: () => putOff(r),
          busy: pending === `later:${r.id}`,
          testid: `setup-later-${r.id}`,
        }
      : null;
  return { cta, also };
}

export const SetupRows = ({
  S,
  rows,
  later,
  look,
  primary = null,
  left = null,
  flash: lent = null,
  testid = "setup-rows",
}: SetupRowsProps) => {
  const [toastNode, own] = useLegacyToast();
  const flash = lent || own;
  const [chooser, setChooser] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  // The verb on its way, if any. Its button shows busy, and a second press -- the same row's or another row's --
  // waits for it to land instead of sending again (S23).
  const [pending, setPending] = useState<string | null>(null);
  const once = async (to: string, run: () => Promise<void>) => {
    if (pending) return;
    setPending(to);
    try {
      await run();
    } finally {
      setPending(null);
    }
  };
  const k: RowActs = {
    flash,
    once,
    toggleChooser: () => setChooser((v) => !v),
    toggleForwarding: () => setForwarding((v) => !v),
    openForwarding: () => setForwarding(true),
  };
  const act = (verb: SetupVerb | null | undefined) => void pressVerb(verb, k);
  // Put off, or taken back: this member's, saved to their view (surface.ts later), and said when it was not.
  const takeBack = (id: string) =>
    setupVerbs.later(id, false).then((res) => {
      if (!res.ok) flash(refusalToast(res, "Not saved"));
    });
  const putOff = (r: SetupRowVM) =>
    void once(`later:${r.id}`, async () => {
      const res = await setupVerbs.later(r.id, !r.later);
      if (!res.ok) flash(refusalToast(res, "Not saved"));
      else if (!r.later && later.said) flash({ msg: <>{later.said}</>, undo: () => takeBack(r.id) });
    });
  return (
    <div className="setup-rows" data-testid={testid}>
      <div className="tq-list">
        {rows.map((r, i) => {
          const { cta, also } = rowActs(r, { primary, pending, act, putOff, later });
          return (
            <div key={r.id} className={r.later ? "setup-later" : undefined}>
              {look === "card" ? (
                // The next row wears amber, as the one to do now; the rest their own state.
                <SetupCardRow
                  tone={primary === r.id ? "warn" : setupTone(r.state)}
                  stateWords={r.stateWords}
                  name={r.title}
                  sentence={r.sentence}
                  left={i === 0 ? left : null}
                  cta={cta}
                  also={also}
                  testid={`setup-row-${r.id}`}
                />
              ) : (
                <AttnRow
                  glyph={r.icon}
                  name={r.title}
                  sentence={r.sentence}
                  quoted={false}
                  status={[r.stateWords]}
                  note={r.details.join(" · ")}
                  tone={setupTone(r.state)}
                  cta={cta}
                  also={also}
                  // The row is a click target for a navigation, never for a dial: a mis-click on the receptionist row
                  // must not ring the shop. Nor is it a way around its own gated button.
                  onOpen={
                    r.verb && !r.verb.to.startsWith("tel:") && !setupGated(r.verb) ? () => act(r.verb) : undefined
                  }
                  testid={`setup-row-${r.id}`}
                  ctaTestid="setup-verb"
                />
              )}
              {r.id === "line" && chooser && (
                <LineChooser S={S} flash={flash} onDone={() => setChooser(false)} onKeep={() => setForwarding(true)} />
              )}
              {r.id === "keep" && forwarding && (
                <ForwardingCard S={S} flash={flash} onDone={() => setForwarding(false)} />
              )}
            </div>
          );
        })}
      </div>
      {toastNode}
    </div>
  );
};
