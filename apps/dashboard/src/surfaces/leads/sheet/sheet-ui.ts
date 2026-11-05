/**
 * The lead sheet's own state (sheet.tsx): which step is open, what the dock asks in its place, how much of the card's
 * email shows, and a rewrite's: its opening being written now, and the Undo a landed one keeps beside the email (00505).
 * Kept for the lead on screen and none other: the next lead comes up fresh.
 */
import { useState } from "react";
import type { RewriteUndo } from "../../campaigns/reach-out/rewrite-ask";

/** Which step of the sheet is open, and what the dock asks in its place. */
export type SheetStep = "card" | "picker" | "new";
type DockAsk = null | "said" | "stop" | "rewrite" | "approve" | "leave";

/** What the sheet holds for the lead on screen, as it was left for that lead and none other. */
export interface SheetUiState {
  lead: string | null;
  step: SheetStep;
  full: boolean;
  ask: DockAsk;
  /** Take out asked because you said you sent an email of your own: said for why. */
  wrote: boolean;
  /** A step of the Sequence line opened: the email as they get it. */
  openStep: number | null;
  /** The card's email asked for whole. */
  whole: boolean;
  /** Its opening is being written now. */
  writing: boolean;
  /** What a landed rewrite keeps for its Undo, beside that email while it is on the card. */
  undo: { sendId: string; kept: RewriteUndo } | null;
}

const FRESH = {
  step: "card" as SheetStep,
  full: false,
  ask: null as DockAsk,
  wrote: false,
  openStep: null,
  whole: false,
  writing: false,
  undo: null,
};

/** The sheet's own state: a decision turns the card, and the next lead comes up at half, its email cut short. */
export function useSheetUi(leadId: string | null) {
  const [held, setHeld] = useState<SheetUiState>({ lead: leadId, ...FRESH });
  const ui = held.lead === leadId ? held : { lead: leadId, ...FRESH };
  // From the state as it stands: a press that lands after an await keeps what changed meanwhile.
  const put = (next: Partial<SheetUiState>) =>
    setHeld((h) => ({ ...(h.lead === leadId ? h : { lead: leadId, ...FRESH }), ...next }));
  return { ui, put };
}
