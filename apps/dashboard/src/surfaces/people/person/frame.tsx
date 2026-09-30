/**
 * The frame around a page that has no person to draw yet (moved from legacy/pages/client-profile.jsx, decision 0015, step
 * 5): loading, missing, a failed read. The same hero, with no rail column: the two-column grid drew an empty 320px column
 * and a stray hairline beside "Loading…".
 */
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";

export function PersonProfileFrame({ onBack, children }: { onBack: () => void; children?: ReactNode }) {
  return (
    <div className="cl-profile cl-profile--solo">
      <div className="cl-prof-page">
        <div className="cl-prof-hero">
          <button type="button" className="cl-prof-back" onClick={onBack} aria-label="Back to People">
            <Icon name="chevron" size={11} style={{ transform: "rotate(180deg)" }} />
            <span className="cl-prof-back-word">People</span>
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}
