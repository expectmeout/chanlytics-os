/**
 * A person's Visits tab (canvas A, V-01): one pane, its line of how they stand (kept, missed, how often they come, how
 * many wait for a word), then the visits nobody has marked, each asking whether they came with the visit line's two
 * presses; the visits ahead; and the visits past, each a door to its day on the Calendar with the word said on it. Every
 * word is contracts' (person-page/visits.ts); the presses are the visit line's own (VisitActs), which the page re-reads
 * after as it does for Up next.
 */
import type { ReactElement } from "react";
import { VISITS_TAB_WORDS, personTabWord } from "@chanlytics/contracts";
import type { PersonVisitRowVM, PersonVisitsVM } from "@chanlytics/contracts";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { Panel } from "../../../kit/panel/panel";
import { routeDoor } from "../../../legacy-verbs";
import { VisitActs } from "../../../visit-line";
import type { PageCtx } from "../ctx";

/** The leaf a row starts with: the month over the day of the month, as Coming up draws it. */
function leaf(r: PersonVisitRowVM) {
  return (
    <span className="cl-prof-up-leaf" aria-hidden="true">
      <span className="cl-prof-up-month">{r.month}</span>
      <span className="cl-prof-up-date">{r.date}</span>
    </span>
  );
}

/** What a row says: its title over its line. */
function visitRowLine(r: PersonVisitRowVM) {
  return (
    <span className="cl-prof-vwords">
      <span className="cl-prof-vtitle">{r.title}</span>
      <span className="cl-prof-vsub">{r.sub}</span>
    </span>
  );
}

/** One section of rows under its eyebrow, in one inset. */
function section(id: string, title: string, rows: PersonVisitRowVM[], row: (r: PersonVisitRowVM) => ReactElement) {
  return (
    <>
      <h3 className="cl-prof-vsec" id={`person-visits-${id}`}>
        {title}
      </h3>
      <Panel
        as="ol"
        variant="inset"
        size="flush"
        className="cl-prof-vlist"
        aria-labelledby={`person-visits-${id}`}
        data-testid={`person-visits-${id}`}
      >
        {rows.map(row)}
      </Panel>
    </>
  );
}

/** A visit nobody has marked: Kept and Missed, the visit line's own presses, for a member who may record. */
function toMarkRow(c: PageCtx) {
  return (r: PersonVisitRowVM) => (
    <li key={r.id} className="cl-prof-vrow" data-testid="person-visit-to-mark">
      {leaf(r)}
      {visitRowLine(r)}
      {c.canRecord && r.visit.mark ? (
        <VisitActs mark={r.visit.mark} acts={r.visit.asks} testid="person-visit-mark" variant="secondary" />
      ) : null}
    </li>
  );
}

/** A visit ahead or past: a door to its day, with the word said on it. */
function doorRow(r: PersonVisitRowVM) {
  return (
    <li key={r.id}>
      <a className="cl-prof-vrow" data-door {...routeDoor(r.to)} data-testid="person-visit-row">
        {leaf(r)}
        {visitRowLine(r)}
        {r.said && r.saidWord ? (
          <span className="cl-prof-vword" data-said={r.said}>
            <Icon name={r.said === "kept" ? "check" : "x"} size={12} />
            {r.saidWord}
          </span>
        ) : (
          <Icon name="chevron" size={12} />
        )}
      </a>
    </li>
  );
}

/** The line of how they stand: what was kept and missed, how often, what waits for a word, and over how long. */
function head(h: PersonVisitsVM["head"]) {
  return (
    <p className="cl-prof-vhead" data-testid="person-visits-head">
      <span>
        <b>{VISITS_TAB_WORDS.kept(h.kept)}</b>
      </span>
      {h.missed > 0 ? <span>{VISITS_TAB_WORDS.missed(h.missed)}</span> : null}
      {h.lastKept ? <span>{h.lastKept}</span> : null}
      {h.cadence ? <span>{VISITS_TAB_WORDS.cadence(h.cadence)}</span> : null}
      {h.toMark > 0 ? <span data-tone="warn">{VISITS_TAB_WORDS.toMarkN(h.toMark)}</span> : null}
      <span data-over="">{h.over}</span>
    </p>
  );
}

/** The Visits tab, under the workspace's word for them ("Appointments", "Meetings"). */
export function VisitsTab({ c }: { c: PageCtx }) {
  const v = c.p.visitTab;
  return (
    <section className="cl-prof-section cl-prof-visits" aria-labelledby="person-visits-title">
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-visits-title">
          {personTabWord("visits", c.p.word)}
        </h2>
      </div>
      {head(v.head)}
      {v.toMark.length > 0 ? section("to-mark", VISITS_TAB_WORDS.toMark, v.toMark, toMarkRow(c)) : null}
      <h3 className="cl-prof-vsec" id="person-visits-ahead-title">
        {VISITS_TAB_WORDS.ahead}
      </h3>
      {v.ahead.length > 0 ? (
        <Panel
          as="ol"
          variant="inset"
          size="flush"
          className="cl-prof-vlist"
          aria-labelledby="person-visits-ahead-title"
          data-testid="person-visits-ahead"
        >
          {v.ahead.map(doorRow)}
        </Panel>
      ) : (
        <EmptyState kind="line" body={VISITS_TAB_WORDS.none} testid="person-visits-none" />
      )}
      {v.past.length > 0 ? section("past", VISITS_TAB_WORDS.past, v.past, doorRow) : null}
    </section>
  );
}
