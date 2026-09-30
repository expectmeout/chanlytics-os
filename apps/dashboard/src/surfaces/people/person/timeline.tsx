/**
 * The person's History (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): every message, call, escalation
 * and operator decision for this contact, mapped in contracts where the rule is tested, and the timeline that narrows by
 * kind (contracts TIMELINE_FILTERS: All, then only the kinds this person's record holds). The choice is the page's, so this
 * stays a plain function of its props. A filter holds still (`holdStill`): on a phone, where History ends the page, a shorter
 * list made the page shorter and the strip jumped from under the thumb, 439px for Visits. A row that has somewhere to go IS
 * the door: the whole row, as a link, with the time as plain text.
 */
import { Fragment } from "react";
import type { MouseEvent, MouseEventHandler, ReactNode } from "react";
import { TIMELINE_FILTERS, filterTimeline } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { holdStill, routeDoor } from "../../legacy-verbs";

type Item = PersonVM["timeline"][number];

/** Newer than this many rows waits behind one press. The Inbox is the whole thread; a profile that drew a year of messages ran to five screens on a phone. */
const TL_CAP = 20;

/** What a mark is drawn with: the customer's initials, a glyph for the kind, or "You". */
function markOf(e: Item, initials: string): ReactNode {
  if (e.kind === "customer") return initials;
  if (e.kind === "receptionist") return <Icon name="sparkle" size={12} />;
  if (e.kind === "you") return "You";
  if (e.kind === "call") return <Icon name="phone" size={12} />;
  if (e.kind === "visit") return <Icon name="calendar" size={12} />;
  if (e.kind === "deal") return <Icon name="deal" size={12} />;
  if (e.kind === "escalation") return <Icon name="alert" size={11} />;
  if (e.kind === "consent") return <Icon name="shield" size={11} />;
  return <Icon name="dot" size={10} />;
}

/** The class a mark's colour follows. */
function markClassOf(e: Item): string {
  if (e.kind === "customer") return "client";
  if (e.kind === "receptionist" || e.kind === "you") return "agent";
  if (e.kind === "call" || e.kind === "visit") return "session";
  return "event";
}

/** A row's mark, who and when, what was said, its second line, and the arrow where it has somewhere to go. */
function rowBody(e: Item, initials: string) {
  return (
    <>
      <div className={`cl-tl-mark ${markClassOf(e)}`}>{markOf(e, initials)}</div>
      <div className="cl-tl-body">
        <div className="cl-tl-head">
          <span className="cl-tl-who">{e.who}</span>
          <span className="cl-tl-time">{e.time}</span>
        </div>
        <div className={`cl-tl-text ${e.kind === "customer" ? "" : "muted"}`}>{e.text}</div>
        {e.sub && <div className="cl-tl-sub">{e.sub}</div>}
      </div>
      {e.link && (
        <span className="cl-tl-go" aria-hidden="true">
          <Icon name="arrow-right" size={11} />
        </span>
      )}
    </>
  );
}

/** The filters offered: All, then only the kinds this person's record holds. */
function filterStrip(items: Item[], filter: string, onFilter: (id: string) => void): ReactNode {
  const offered = TIMELINE_FILTERS.filter((f) => f.id === "all" || items.some((i) => (f.kinds || []).includes(i.kind)));
  if (offered.length <= 2) return null;
  return (
    <div className="cl-tabs cl-tl-filters" role="group" aria-label="Show on the timeline">
      {offered.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`cl-tab ${filter === f.id ? "active" : ""}`}
          aria-pressed={filter === f.id}
          onClick={(e?: MouseEvent<HTMLButtonElement>) => holdStill(e?.currentTarget, () => onFilter(f.id))}
          data-testid={`timeline-filter-${f.id}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** The record as rows: each day's head above the rows that belong to it, and Show N older after the twentieth. */
function rows(visible: Item[], older: number, initials: string, onShowAll: (() => void) | null) {
  let lastDay: string | null = null;
  return (
    <div className="cl-prof-timeline">
      {visible.map((e) => {
        // The day sits above the rail line, on the page's own ground: the line ran through "TODAY".
        const dayHead = e.day !== lastDay ? <div className="cl-tl-day">{e.day}</div> : null;
        lastDay = e.day;
        const body = rowBody(e, initials);
        return (
          <Fragment key={e.id}>
            {dayHead}
            {e.link ? (
              // A row's door is the app's one link (routeDoor): its hash route in the href, so a new tab or a long press
              // opens it, and the app's own way there on a plain press.
              <a
                className="cl-tl-row cl-tl-row-door"
                {...routeDoor(e.link.to)}
                title={e.link.label}
                data-testid="timeline-open"
              >
                {body}
              </a>
            ) : (
              <div className="cl-tl-row">{body}</div>
            )}
          </Fragment>
        );
      })}
      {older > 0 && (
        <button
          type="button"
          className="cl-bucket-link cl-tl-older"
          onClick={onShowAll as MouseEventHandler<HTMLButtonElement>}
          data-testid="timeline-older"
        >
          Show {older} older <Icon name="chevron-down" size={10} />
        </button>
      )}
    </div>
  );
}

/** The History: the filters (where the page gave a way to choose), then the rows, or a line saying there are none. */
export function PersonTimeline({
  items,
  initials,
  filter = "all",
  onFilter = null,
  showAll = false,
  onShowAll = null,
}: {
  items: Item[];
  initials: string;
  filter?: string;
  onFilter?: ((id: string) => void) | null;
  showAll?: boolean;
  onShowAll?: (() => void) | null;
}) {
  const shown = filterTimeline(items, filter);
  // A fold of three rows is not worth a press.
  const visible = showAll || shown.length <= TL_CAP + 3 ? shown : shown.slice(0, TL_CAP);
  const older = shown.length - visible.length;
  return (
    <>
      {onFilter ? filterStrip(items, filter, onFilter) : null}
      {items.length === 0 ? (
        <EmptyState kind="line" className="empty-center" title="Nothing recorded yet." />
      ) : (
        rows(visible, older, initials, onShowAll)
      )}
    </>
  );
}
