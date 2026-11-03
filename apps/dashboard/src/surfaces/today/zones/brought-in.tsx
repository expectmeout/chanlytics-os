/**
 * Your history (decision 0073, R23, canvas T-today and T·g; "Brought in" until the refined canvas, 31 Oct 2026): Today's
 * small card of what came in before Chanlytics, from the imports ledger Setup reads. Closed, where it all stands in its
 * head ("Bringing it in · 2 of 3", "All in", "1 stopped") and a fact or three under it: the people and the reviews, how
 * far back email reached, the calendar. A press opens it in place, the facts folding into the sources one by one (the
 * first run's own lines, setup/first-run/channels/brought.tsx), each with how far it has come and Try again where one
 * stopped (Ruben, 27 Oct 2026: the sheet was a near-empty pane and too wordy). Drawn while anything is coming in, a source
 * stopped, or for the day it finished (contracts broughtInShown): a week of All in was a card with nothing to press.
 */
import { useId, useState } from "react";
import { FIRST_RUN_HELPERS, broughtInCardOf, broughtInShown, type BroughtInFactVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Icon } from "../../kit/icon/icon";
import { ImportFoot, ImportLines } from "../../setup/first-run/channels/brought";
import { useSurface } from "../../use-surface";
import { useToast } from "../shell";

/** Each fact's glyph, before its words. */
const FACT_GLYPH: Record<BroughtInFactVM["key"], string> = { people: "users", mail: "mail", calendar: "calendar" };
/** The head's glyph for where it stands; still coming is the live dot instead. */
const STATE_GLYPH = { ok: "check", stopped: "alert" } as const;

export const TodayBroughtIn = () => {
  const S = useSurface("setup");
  const [open, setOpen] = useState(false);
  const [toastNode, flash] = useToast();
  const sources = useId();
  if (!S || !broughtInShown(S.dto.imports, Date.now())) return null;
  const tz = pageClock().zone();
  const card = broughtInCardOf(S.dto.imports, S.dto.people ?? null, tz);
  if (!card) return null;
  const { lines, running } = FIRST_RUN_HELPERS.imports(S.dto.imports, tz);
  const { tone, words } = card.state;
  return (
    <section className={`tq today-brought${open ? " open" : ""}`} data-testid="today-brought-in">
      <button
        type="button"
        className="today-brought-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={sources}
        data-testid="today-brought-open"
      >
        <span className="setup-card-title">{card.title}</span>
        <span className="today-brought-state" data-tone={tone} data-testid="today-brought-state">
          {tone === "live" ? (
            <span className="fr-pulse" aria-hidden="true" />
          ) : (
            <Icon name={STATE_GLYPH[tone]} size={14} />
          )}
          {words}
        </span>
        <Icon name="chevron-down" size={14} className="today-brought-chevron" />
      </button>
      <div className="today-brought-fold today-brought-closed" aria-hidden={open} inert={open}>
        <div>
          <p className="today-brought-facts" data-testid="today-brought-facts">
            {card.facts.map((f) => (
              <span key={f.key}>
                <Icon name={FACT_GLYPH[f.key]} size={14} />
                {f.text}
              </span>
            ))}
          </p>
        </div>
      </div>
      <div className="today-brought-fold today-brought-sources" id={sources} aria-hidden={!open} inert={!open}>
        <div>
          <ImportLines lines={lines} flash={flash} doors />
          <ImportFoot running={running} className="today-brought-foot" />
        </div>
      </div>
      {toastNode}
    </section>
  );
};
