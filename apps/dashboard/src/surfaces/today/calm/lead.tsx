/**
 * Today's one card (Today, calm, 19 Nov 2026, D1 and D5): the thing most worth doing, drawn first and whole, the page's
 * only pane and the home of its one coral. Which thing that is the page's arrangement says (today/arrangement.ts `cardOf`:
 * a person waiting, what waits for an OK, To do's first, setting up, what AI found); each part draws its own item in it, with its own presses,
 * through this frame, so the card reads alike whatever it holds: a small line that says what kind of thing it is (who, and
 * how long they have waited; or AI's three and "AI found"), what it is in a sentence, why under it, then its acts or its
 * work.
 */
import type { ReactNode } from "react";
import { Panel } from "../../kit/panel/panel";
import { cardPressed, useCardGone, useCardHandOff } from "./motion";

/**
 * The page's one card, as the arrangement names it (arrangement.ts `cardOf`): which part holds it, and which of that
 * part's items it is. Null where nothing is left to do, and the page ends after its lines.
 */
export type TodayCard = { holder: "queue" | "wait" | "todo" | "setup" | "found"; id: string } | null;

/** Which part's item the card holds. */
type LeadHolder = NonNullable<TodayCard>["holder"];

export function Lead({
  holder,
  id,
  label,
  kind,
  title,
  why = null,
  testid,
  children,
}: {
  holder: LeadHolder;
  /** Which of the part's items it holds: the card hands off when this changes (motion.ts), and never on its first draw. */
  id: string;
  /** What the card is, for a reader: its kind's words. */
  label: string;
  /** The small line over the title: a face and a name with how long, or the kind's mark and its words. */
  kind: ReactNode;
  title: ReactNode;
  why?: ReactNode;
  /** The part's own test id for its item, beside the card's. */
  testid?: string;
  /** Its acts, or its work in place. */
  children: ReactNode;
}) {
  const words = useCardHandOff(`${holder}:${id}`);
  return (
    <Panel as="section" className="calm-lead" aria-label={label} data-testid="today-card" data-holder={holder}>
      {/* A press in the card is remembered: what leaves it right after is what the press finished (motion.ts). */}
      <div
        className="calm-lead-in"
        data-testid={testid}
        ref={words}
        onPointerDownCapture={cardPressed}
        onKeyDownCapture={cardPressed}
      >
        <div className="calm-kind">{kind}</div>
        <h2 className="calm-title">{title}</h2>
        {why ? <p className="calm-why">{why}</p> : null}
        {children}
      </div>
    </Panel>
  );
}

/**
 * Where the card stood, once nothing holds it (the last thing done): its room folds shut, so the lines rise under it
 * instead of jumping. Nothing where no card was drawn on this visit.
 */
export function LeadGone() {
  const { room, gone } = useCardGone();
  return gone ? null : <div ref={room} className="calm-gone" aria-hidden="true" />;
}

/** The card's acts, in a row: its one press first, what is quieter after it. */
export function LeadActs({ children }: { children: ReactNode }) {
  return <div className="calm-acts">{children}</div>;
}
