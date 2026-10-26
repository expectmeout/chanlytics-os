/**
 * Brought in (decision 0073, R23, canvas T-today and T·g): Today's small card of what came in before Chanlytics, from the
 * imports ledger Setup reads: the people, the reviews, how far back email reached, the visits, and the one source still
 * coming in. A press opens the sources one by one (the first run's own lines, setup/first-run/channels/brought.tsx).
 * Drawn while anything is coming in, a source stopped, or for the first week after (contracts broughtInShown).
 */
import { useState } from "react";
import { FIRST_RUN_HELPERS, broughtInCardOf, broughtInShown } from "@chanlytics/contracts";
import { FrBringing } from "../../setup/first-run/channels/brought";
import { useSurface } from "../../use-surface";
import { useToast } from "../shell";

export const TodayBroughtIn = () => {
  const S = useSurface("setup");
  const [open, setOpen] = useState(false);
  const [toastNode, flash] = useToast();
  if (!S || !broughtInShown(S.dto.imports, Date.now())) return null;
  const card = broughtInCardOf(S.dto.imports, S.dto.people ?? null);
  if (!card) return null;
  const lines = FIRST_RUN_HELPERS.imports(S.dto.imports).lines;
  return (
    <section className="tq today-brought" data-testid="today-brought-in">
      <button
        type="button"
        className="today-brought-open"
        onClick={() => setOpen(true)}
        data-testid="today-brought-open"
      >
        <span className="setup-card-title">{card.title}</span>
        {card.lines.map((l) => (
          <span key={l} className="today-brought-line">
            {l}
          </span>
        ))}
        {card.coming ? (
          <span className="today-brought-line" data-testid="today-brought-coming">
            <span className="fr-pulse" aria-hidden="true" />
            {card.coming}
          </span>
        ) : null}
      </button>
      <FrBringing
        open={open}
        onClose={() => setOpen(false)}
        lines={lines}
        flash={flash}
        title={FIRST_RUN_HELPERS.importWords.broughtHeading}
        foot={FIRST_RUN_HELPERS.importWords.broughtFoot}
      />
      {toastNode}
    </section>
  );
};
