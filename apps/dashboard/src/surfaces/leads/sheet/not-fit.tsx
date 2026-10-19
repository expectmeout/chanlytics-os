/**
 * Not a fit, one tap, the reason after (the canvas's States board, 18 Oct 2026): the toast that follows the press says it
 * was marked and asks why, each reason optional and one press (Chain, Wrong kind, Too far, A customer, the last of which
 * hides it from every future search), beside Undo. The next lead is already up.
 */
import { useState } from "react";
import { LEAD_NOT_A_FIT_ASK as A, type LeadNotAFitWhy } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import type { LegacyFlash } from "../../legacy-verbs";

/** How long the toast stays: long enough to give a reason. */
const NOT_FIT_TOAST_MS = 9000;

const WHYS = Object.keys(A.short) as (keyof typeof A.short)[];

/** The question and its reasons; a reason given says so, and the rest go. */
function NotFitAsk({ name, onWhy }: { name: string; onWhy: (why: LeadNotAFitWhy) => void }) {
  const [given, setGiven] = useState<keyof typeof A.short | null>(null);
  return (
    <span className="lw-notfit" data-testid="lead-not-fit-ask">
      <span>{A.said(name)}</span>
      {given ? (
        <span className="lw-notfit-kept">{A.kept(A.short[given])}</span>
      ) : (
        <>
          <span className="lw-notfit-q">{A.why}</span>
          {WHYS.map((w) => (
            <Button
              key={w}
              size="sm"
              variant="quiet"
              onClick={() => {
                setGiven(w);
                onWhy(w);
              }}
              data-testid={`lead-not-fit-${w}`}
            >
              {A.short[w]}
            </Button>
          ))}
        </>
      )}
    </span>
  );
}

/** The toast after Not a fit: what was done, why (optional), and Undo where there is one. */
export const notFitToast = (
  name: string,
  onWhy: (why: LeadNotAFitWhy) => void,
  undo: (() => void) | null,
): LegacyFlash => ({
  tone: "ok",
  msg: <NotFitAsk name={name} onWhy={onWhy} />,
  undo,
  ms: NOT_FIT_TOAST_MS,
});
