/**
 * The person's History (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): every message, call, escalation
 * and operator decision for this contact, mapped in contracts where the rule is tested, and the timeline that narrows by
 * kind (contracts TIMELINE_FILTERS: All, then only the kinds this person's record holds). The choice is the page's, so this
 * stays a plain function of its props. A filter holds still (`holdStill`): on a phone, where History ends the page, a shorter
 * list made the page shorter and the strip jumped from under the thumb, 439px for Visits. A row that has somewhere to go IS
 * the door: the whole row, as a link, with the time as plain text.
 */
import { Fragment } from "react";
import type { MouseEventHandler, ReactNode } from "react";
import { TIMELINE_FILTERS, filterTimeline, personFaceOf, timelineFilterLabel } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { EmptyState } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { holdStill, routeDoor } from "../../legacy-verbs";
import { VisitAsk } from "../../visit-line";

type Item = PersonVM["timeline"][number];

/** Newer than this many rows waits behind one press. The Inbox is the whole thread; a profile that drew a year of messages ran to five screens on a phone. */
const TL_CAP = 20;

/**
 * What the customer's mark is drawn with: their initials, or the glyph of what names them while nobody has named them,
 * the face's own (contracts personFaceOf): a number is a phone and an address a mail on the History as on every page.
 */
function customerMark(name: string | undefined, initials: string): ReactNode {
  const face = name === undefined ? null : personFaceOf(name, initials);
  return face?.glyph ? <Icon name={face.glyph} size={12} /> : initials;
}

/** What a mark is drawn with: the customer's (`customer`), or a glyph for the kind. A teammate's reply is the team's glyph, never "You". */
function markOf(e: Item, customer: ReactNode): ReactNode {
  if (e.kind === "customer") return customer;
  if (e.kind === "receptionist") return <Icon name="sparkle" size={12} />;
  if (e.kind === "team") return <Icon name="users" size={12} />;
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
  if (e.kind === "receptionist" || e.kind === "team") return "agent";
  if (e.kind === "call" || e.kind === "visit") return "session";
  return "event";
}

/** Whether a row asks the owner something: a visit that has begun and nobody has said whether they came (contracts visitLineOf's `asks`). */
const asksOf = (e: Item): boolean => !!e.visit && e.visit.mark !== null && e.visit.asks.length > 0;

/**
 * A visit that asks "Did they come?": its presses, and the door to the visit beside them. The row is not a link then (a press
 * inside a link is the link's), so the door is words of its own, as every door is a link (routeDoor).
 */
function askLine(e: Item) {
  if (!e.visit) return null;
  return (
    <div className="cl-tl-ask">
      <VisitAsk line={e.visit} testid="timeline-visit-ask" />
      {e.link && (
        <LinkButton {...routeDoor(e.link.to)} data-testid="timeline-open">
          {e.link.label}
        </LinkButton>
      )}
    </div>
  );
}

/** A row's mark, who and when, what was said, its second line, and the arrow where it has somewhere to go. */
function rowBody(e: Item, customer: ReactNode, ask: ReactNode = null) {
  return (
    <>
      <div className={`cl-tl-mark ${markClassOf(e)}`}>{markOf(e, customer)}</div>
      <div className="cl-tl-body">
        <div className="cl-tl-head">
          <span className="cl-tl-who">{e.who}</span>
          <span className="cl-tl-time">{e.time}</span>
        </div>
        <div className={`cl-tl-text ${e.kind === "customer" ? "" : "muted"}`}>{e.text}</div>
        {/* What the call's analysis left (its to-do, what the caller gave), a line each under what they wanted. */}
        {e.notes?.map((n) => (
          <div key={n} className="cl-tl-sub" data-testid="timeline-note">
            {n}
          </div>
        ))}
        {e.sub && <div className="cl-tl-sub">{e.sub}</div>}
        {ask}
      </div>
      {e.link && !ask && (
        <span className="cl-tl-go" aria-hidden="true">
          <Icon name="arrow-right" size={11} />
        </span>
      )}
    </>
  );
}

/** The tab a press landed on, which `holdStill` keeps where it was (a page with no document to ask keeps none). */
const tabPressed = (testid: string): HTMLElement | null =>
  "querySelector" in document ? document.querySelector<HTMLElement>(`[data-testid="${testid}"]`) : null;

/** The filters offered: All, then only the kinds this person's record holds. */
function filterStrip(items: Item[], filter: string, onFilter: (id: string) => void, dealsOn: boolean): ReactNode {
  const offered = TIMELINE_FILTERS.filter((f) => f.id === "all" || items.some((i) => (f.kinds || []).includes(i.kind)));
  if (offered.length <= 2) return null;
  const testid = (id: string) => `timeline-filter-${id}`;
  return (
    <SubTabs
      label="Show on the timeline"
      value={filter}
      className="cl-tl-filters"
      // The appointments' filter is headed in the workspace's word for one (decision 0041), the rest in their own.
      tabs={offered.map((f) => ({ id: f.id, label: timelineFilterLabel(f, dealsOn), testid: testid(f.id) }))}
      // Held still from the tab pressed: the strip does not jump from under the thumb as the list gets shorter.
      onSelect={(id) => holdStill(tabPressed(testid(id)), () => onFilter(id))}
    />
  );
}

/** The record as rows: each day's head above the rows that belong to it, and Show N older after the twentieth. */
function rows(visible: Item[], older: number, customer: ReactNode, onShowAll: (() => void) | null) {
  let lastDay: string | null = null;
  return (
    <div className="cl-prof-timeline">
      {visible.map((e) => {
        // The day sits above the rail line, on the page's own ground: the line ran through "TODAY".
        const dayHead = e.day !== lastDay ? <div className="cl-tl-day">{e.day}</div> : null;
        lastDay = e.day;
        const asking = asksOf(e);
        const body = rowBody(e, customer, asking ? askLine(e) : null);
        return (
          <Fragment key={e.id}>
            {dayHead}
            {asking ? (
              <div className="cl-tl-row" data-testid="timeline-visit-asking">
                {body}
              </div>
            ) : e.link ? (
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
  name,
  filter = "all",
  onFilter = null,
  showAll = false,
  onShowAll = null,
  dealsOn = false,
}: {
  items: Item[];
  initials: string;
  /** Who the customer is by name: a number or an address nobody has named wears the one glyph its face wears. Without it, their initials. */
  name?: string;
  filter?: string;
  onFilter?: ((id: string) => void) | null;
  showAll?: boolean;
  onShowAll?: (() => void) | null;
  /** Whether deals are on here: the workspace's word for an appointment follows (appointmentWordWhere). */
  dealsOn?: boolean;
}) {
  const shown = filterTimeline(items, filter);
  // A fold of three rows is not worth a press.
  const visible = showAll || shown.length <= TL_CAP + 3 ? shown : shown.slice(0, TL_CAP);
  const older = shown.length - visible.length;
  return (
    <>
      {onFilter ? filterStrip(items, filter, onFilter, dealsOn) : null}
      {items.length === 0 ? (
        <EmptyState kind="line" className="empty-center" title="Nothing recorded yet." />
      ) : (
        rows(visible, older, customerMark(name, initials), onShowAll)
      )}
    </>
  );
}
