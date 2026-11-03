/**
 * Rewrite the opening, asked where it is pressed (00505): what should change, in the owner's own words or none; the
 * decide verb's rewrite with them; and the check that writes it now, each step said as it takes it (verbs/openings.ts,
 * POST reach-out-sends/check as a stream), then the new opening's receipt with Undo. The one ask of every place that answers
 * one email: the lead sheet's dock, a run's held row, a sequence's Needs you and its Leads tab. Every word is contracts'.
 */
import { useEffect, useRef, useState } from "react";
import { LEAD_REWRITE_CHANGE_MAX, REWRITE_WORDS as W, rewroteWords, type RewriteStep } from "@chanlytics/contracts";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { checkOpeningNow } from "@/legacy-bridge/verbs/openings";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { focusAsDrawn, gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";

/** What a landed rewrite keeps for its Undo: the verb's own record (contracts sequenceSendDecideSpec.undo). */
export type RewriteUndo = Record<string, unknown>;

interface RewriteAskProps {
  /** The email, its run, and the business it is to. */
  sendId: string;
  runId: string | null;
  name: string;
  /** The page's toast; none where the place draws no toast, and then the ask says what came back itself. */
  flash: ((f: LegacyFlash) => void) | null;
  /** Said once the decision landed and again once the opening did: the place reads its rows again. */
  moved: () => void;
  onBack: () => void;
  /** Said as the check begins and ends, so the email the place draws can say it is being written. */
  onWriting?: (on: boolean) => void;
  /** Said once a rewrite landed, with what its Undo needs: a place that keeps an Undo beside the email holds it. */
  onLanded?: (undo: RewriteUndo | null) => void;
  testid?: string;
}

/** The undo of a landed rewrite: the opening it replaced, back, said in the place's toast. */
export async function undoRewrite(kept: RewriteUndo, flash: ((f: LegacyFlash) => void) | null): Promise<void> {
  const u = await undoVerb("sequence_send_decide", kept);
  if (flash) flash(u.ok ? { tone: "ok", msg: u.receipt } : refusalToast(u));
}

/** What should change, then Rewrite: the steps said while it writes; the ask closes once the opening has landed. */
export function RewriteAsk(p: RewriteAskProps) {
  const [change, setChange] = useState("");
  const [step, setStep] = useState<RewriteStep | "deciding" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const writing = step !== null;
  const rewrite = async () => {
    if (writing) return;
    setSaid(null);
    setStep("deciding");
    p.onWriting?.(true);
    const r = await commitVerb("sequence_send_decide", {
      send_id: p.sendId,
      decision: "rewrite",
      change: change.trim(),
      // This ask writes it itself, its steps said as they come.
      check: false,
      name: p.name,
      run_id: p.runId,
    });
    if (!r.ok) {
      p.onWriting?.(false);
      if (live.current) setStep(null);
      if (p.flash) p.flash(refusalToast(r));
      else if (live.current) setSaid(r.message);
      return;
    }
    p.moved();
    const after = await checkOpeningNow(p.sendId, (s) => {
      if (live.current) setStep(s);
    });
    p.onWriting?.(false);
    const words = rewroteWords(p.name, after);
    const kept = r.undo;
    if (p.flash)
      p.flash({
        tone: "ok",
        msg: words,
        undo: kept
          ? async () => {
              await undoRewrite(kept, p.flash);
              p.moved();
            }
          : null,
      });
    p.onLanded?.(kept);
    p.moved();
    if (!live.current) return;
    setStep(null);
    if (p.flash) p.onBack();
    else setSaid(words);
  };
  const id = p.testid ?? "rewrite";
  return (
    <div className="lw-dock-ask" data-testid={`${id}-ask`}>
      <Field
        label={W.change}
        hint={writing ? (W.steps[step as RewriteStep] ?? W.steps.writing) : (said ?? W.changeHint)}
        value={change}
        onValueChange={setChange}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !writing) {
            e.preventDefault();
            e.stopPropagation();
            p.onBack();
          }
          if (e.key !== "Enter") return;
          e.preventDefault();
          void rewrite();
        }}
        maxLength={LEAD_REWRITE_CHANGE_MAX}
        readOnly={writing}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- Rewrite the opening opened it to say what should change
        autoFocus={focusAsDrawn()}
        enterKeyHint="go"
        data-testid={`${id}-change`}
      />
      <div className="ro-send-acts">
        <Button
          size="sm"
          variant="primary"
          aria-busy={writing}
          disabled={writing}
          onClick={() => void rewrite()}
          data-testid={`${id}-go`}
          {...gate("approve", "rewrite the opening")}
        >
          {writing ? W.steps.writing : W.go}
        </Button>
        <Button size="sm" variant="quiet" disabled={writing} onClick={p.onBack} data-testid={`${id}-back`}>
          {W.back}
        </Button>
      </div>
    </div>
  );
}
