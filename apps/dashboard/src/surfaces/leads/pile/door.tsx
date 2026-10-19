/**
 * The line that asks for a search where a sequence's Add leads named where the adds go and none is open (page-pile.tsx
 * decides whether). There is no door into the pile: To decide is the pile, opened by opening a lead to decide on (the
 * lead-to-sequence canvas's Presses board). Hookless; every word is contracts' (LEAD_PILE_WORDS).
 */
import { LEAD_PILE_WORDS } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";

/** With a sequence's Add leads standing and no search open: the line asking for one, and Not now, which lets it go. */
export const LeadPileAsk = ({ name, onLetGo }: { name: string | null; onLetGo: () => void }) => (
  <div className="ld-pile-door" data-testid="lead-pile-ask">
    <p>{LEAD_PILE_WORDS.askSearch(name)}</p>
    <Button size="sm" variant="quiet" onClick={onLetGo} data-testid="lead-pile-ask-let-go">
      {LEAD_PILE_WORDS.askLetGo}
    </Button>
  </div>
);
