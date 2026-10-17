/**
 * The door into the pile (the lead workbench, 00426), under an open search, and the line that asks for a search where a
 * sequence's Add leads named where the adds go and none is open (page-pile.tsx decides which, and whether). The pile
 * itself is the lead sheet's (sheet/sheet.tsx). Hookless; every word is contracts' (LEAD_PILE_WORDS).
 */
import { LEAD_PILE_WORDS } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";

/**
 * The door into the pile, under an open search: for a search whose leads no sequence of its own writes to, or its
 * Needs review. Where a sequence's Add leads named the target, the door names it.
 */
export const LeadPileDoor = ({ onStart, target }: { onStart: () => void; target?: string | null }) => (
  <div className="ld-pile-door">
    <Button
      size="sm"
      variant={target === undefined ? "secondary" : "primary"}
      onClick={onStart}
      title={LEAD_PILE_WORDS.startTip}
      data-testid="lead-pile-start"
    >
      {target === undefined ? LEAD_PILE_WORDS.start : LEAD_PILE_WORDS.startFor(target)}
    </Button>
  </div>
);

/** With a sequence's Add leads standing and no search open: the line asking for one, and Not now, which lets it go. */
export const LeadPileAsk = ({ name, onLetGo }: { name: string | null; onLetGo: () => void }) => (
  <div className="ld-pile-door" data-testid="lead-pile-ask">
    <p>{LEAD_PILE_WORDS.askSearch(name)}</p>
    <Button size="sm" variant="quiet" onClick={onLetGo} data-testid="lead-pile-ask-let-go">
      {LEAD_PILE_WORDS.askLetGo}
    </Button>
  </div>
);
