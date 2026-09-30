/**
 * A row on a phone, the same for a person and a lead (the phone pass, D8): the face, the name and the state; one line of
 * detail; one line of facts (moved whole from legacy/pages/people.jsx, decision 0015). People's cell (plCardCell) and
 * Leads' (ldCardCell, leads-cells.jsx) are drawn by this one function, so the two scopes' lists are one list to the eye,
 * part for part. `face` is initials or a glyph, and a picture over them (a lead's listing photo) that, failing to load,
 * leaves the initials showing. The face is also the row's checkbox (clients.css): a tap there selects, and a tap on the
 * rest opens. `tail`: a line of its own under the facts, where a page has one more thing to say of the row (the
 * Pipeline's next step). `swipe`: a thumb's handlers (data-bits touchSwipe) on the card, which then slides over
 * `grounds`, the words on either side of it (Leads' Keep and Exclude); neither is drawn without the other.
 */
import type { ReactElement, ReactNode, SyntheticEvent } from "react";
import { Icon } from "../../kit/icon/icon";

/** The card's face: initials or a glyph, and pictures over them. */
interface CardFace {
  initials?: string;
  glyph?: string | null;
  image?: string | null;
  mark?: string | null;
}

/** A picture that fails to load leaves what is under it showing. */
const hideOnError = (e: SyntheticEvent<HTMLImageElement>) => {
  const t = e && e.currentTarget;
  if (t && t.style) t.style.display = "none";
};

export function plRowCard({
  face,
  name,
  numeric = false,
  pill,
  lead = null,
  leadTestid = "row-words",
  facts,
  tail = null,
  swipe = null,
  grounds = null,
}: {
  face: CardFace;
  name: ReactNode;
  numeric?: boolean;
  pill: ReactNode;
  lead?: ReactNode;
  leadTestid?: string;
  facts: ReactNode;
  tail?: ReactNode;
  swipe?: object | null;
  grounds?: ReactNode;
}): ReactElement<{ className?: string }> {
  return (
    <td key="card" className="pl-card-cell" data-swipe={grounds ? "" : undefined}>
      {grounds}
      <div className="pl-card" {...(swipe || {})}>
        <div className={`ix-thread-avatar pl-card-face${face.glyph ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">
          {face.glyph ? (
            <Icon name={face.glyph} size={12} className="pl-card-glyph" />
          ) : (
            <span className="pl-card-initials">{face.initials}</span>
          )}
          {face.image ? (
            <img
              className="pl-card-photo"
              src={face.image}
              alt=""
              loading="lazy"
              decoding="async"
              onError={hideOnError}
            />
          ) : null}
          {/* A lead's own mark over its photo, on its plate: one that fails to load uncovers the photo, as the desktop's
              tile does (LeadTile). A person has none. */}
          {face.mark ? (
            <img
              className="pl-card-photo pl-card-mark"
              src={face.mark}
              alt=""
              loading="lazy"
              decoding="async"
              data-testid="row-mark"
              onError={hideOnError}
            />
          ) : null}
          <Icon name="check" size={14} className="pl-card-tick" />
        </div>
        <div className={`pl-card-name${numeric ? " tabular" : ""}`}>{name}</div>
        {pill}
        {lead ? (
          <div className="pl-card-lead" data-testid={leadTestid}>
            {lead}
          </div>
        ) : null}
        <div className="pl-card-facts">{facts}</div>
        {tail ? <div className="pl-card-tail">{tail}</div> : null}
      </div>
    </td>
  );
}
