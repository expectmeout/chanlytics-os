/**
 * The frame around a page that has no person to draw yet (moved from legacy/pages/client-profile.jsx, decision 0015, step
 * 5): loading, missing, a failed read. The same hero, with no rail column: the two-column grid drew an empty 320px column
 * and a stray hairline beside "Loading…".
 */
import type { ReactNode } from "react";
import { PERSON_WALK_WORDS } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { PersonWalk } from "../walk";

export function PersonProfileFrame({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="cl-profile cl-profile--solo" data-takeover>
      <div className="cl-prof-page">
        <div className="cl-prof-hero">
          <Button variant="quiet" size="sm" className="cl-prof-back" onClick={onBack} aria-label="Back to People">
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
            <span className="cl-prof-back-word">People</span>
          </Button>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Stepping to the person before or after them in the People view they were opened from (0052, canvas A): "‹ 4 of 24 ›" in
 * the top bar's row, beside the frame's ‹ People on a desk and a capsule of the control layer's glass in the bell's place
 * on a phone (the page's standing, person-real.tsx; components.css). J and K step too, on a desk. The page turns toward
 * the side it steps (walk.ts noteStep). Part of the page's frame, as its way back is (moved here from hero.tsx).
 */
export function PersonWalkNav({
  walk: w,
  step,
  words = PERSON_WALK_WORDS,
}: {
  walk: PersonWalk;
  step: (to: string) => void;
  /** What it walks, where it is not people: the Pipeline's deal sheet walks deals. */
  words?: { label: string; at: (at: number, of: number) => string; next: string; previous: string };
}) {
  const W = words;
  const go = (to: string | null) => () => {
    if (to) step(to);
  };
  return (
    <nav className="cl-prof-walk" aria-label={W.label} data-testid="person-walk">
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={W.previous}
        title={W.previous}
        disabled={!w.prev}
        onClick={go(w.prev)}
        data-testid="person-walk-prev"
      >
        <Icon name="chevron" size={12} className="icon-turned" />
      </Button>
      <span className="cl-prof-walk-at tabular">{W.at(w.at, w.of)}</span>
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={W.next}
        title={W.next}
        disabled={!w.next}
        onClick={go(w.next)}
        data-testid="person-walk-next"
      >
        <Icon name="chevron" size={12} />
      </Button>
    </nav>
  );
}
