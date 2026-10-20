/**
 * A row on a phone, the same for a person and a lead (the phone pass, D8): the face, the name and the state; one line of
 * detail; one line of facts (moved whole from legacy/pages/people.jsx, decision 0015). People's cell (plCardCell) and
 * Leads' (ldCardCell, leads-cells.jsx) are drawn by this one function, so the two scopes' lists are one list to the eye,
 * part for part, and what it draws them with is the kit's list row (kit/list-row), which is this row lifted out. `face` is
 * initials or a glyph, and a picture over them (a lead's listing photo) and a mark over that (its own logo, on its plate)
 * that, failing to load, leave the initials showing. The face is also the row's checkbox: a tap there selects, and a tap
 * on the rest opens (clients.css lays the box over it); `pick` says where the row stands in a selection, and the kit's
 * face draws it. `tail`: a line of its own under the facts, where a page has one more thing to say of the row (the
 * Pipeline's next step). `swipe`: a thumb's handlers (kit/motion/swipe.ts touchSwipe) on the row, which then slides over
 * `grounds`, the words on either side of it (Leads' Keep and Exclude); neither is drawn without the other. `unread`: the
 * person is new to the reader (surfaces/seen.ts), and the name and what was said wear the page's own marks for it
 * (clients.css .pl-unread), as the Inbox's unread row does.
 */
import type { ReactElement, ReactNode } from "react";
import type { FacePerson } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import type { RowPick } from "../types";

/**
 * The card's face: a person (the kit's Face tells initials from the glyph of a number or an address, by contracts'
 * personFaceOf), or initials or a glyph for what is not one (a lead's tile), and pictures over them.
 */
interface CardFace {
  person?: FacePerson;
  initials?: string;
  glyph?: string | null;
  image?: string | null;
  mark?: string | null;
}

export function plRowCard({
  face,
  pick,
  name,
  unread = false,
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
  pick?: RowPick;
  name: ReactNode;
  unread?: boolean;
  numeric?: boolean;
  pill: ReactNode;
  lead?: ReactNode;
  leadTestid?: string;
  facts: readonly ReactNode[];
  tail?: ReactNode;
  swipe?: object | null;
  grounds?: ReactNode;
}): ReactElement<{ className?: string }> {
  const holds = face.person
    ? { person: face.person }
    : face.glyph
      ? { glyph: <Icon name={face.glyph} size={12} /> }
      : { initials: face.initials ?? "" };
  const who = numeric ? <span className="tabular">{name}</span> : name;
  return (
    // A row that slides takes its own touch: the strip of views over the page is not walked by it (surface-tabs.jsx).
    <td
      key="card"
      className="pl-card-cell"
      data-swipe={grounds ? "" : undefined}
      data-own-drag={grounds ? "" : undefined}
    >
      {grounds}
      <ListRow
        {...(swipe || {})}
        className="pl-card"
        face={{
          ...holds,
          ...(face.image ? { photo: face.image } : {}),
          ...(face.mark ? { mark: face.mark } : {}),
          ...(pick ? { pick } : {}),
        }}
        name={unread ? <span className="pl-unread">{who}</span> : who}
        end={pill ? (place) => <span className={place}>{pill}</span> : undefined}
        said={
          lead
            ? (place) => (
                <div className={unread ? `${place} pl-unread-said` : place} data-testid={leadTestid}>
                  {lead}
                </div>
              )
            : undefined
        }
        facts={facts}
        note={tail}
      />
    </td>
  );
}
