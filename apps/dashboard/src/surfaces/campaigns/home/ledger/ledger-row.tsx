/**
 * One row of Campaigns' ledger on a desk (spec 2026-10-09 §4.3), Sent's run row part for part (broadcasts/ledger.tsx
 * BcRunCard): one subgrid line of the ledger's grid, a press anywhere on it that is not one of its controls pressing its
 * opener (parts/head.tsx cmRowPress), its name the door, a link with its address, so a middle-click opens a tab. A dot in
 * its state's tone, its name and hint; the channels it goes by; who is at its moment now; what came back in the last 30
 * days ("212 sent · 48 replied", a chain's "40 written · 6 wrote back", "Nothing sent", or "—" where it was not counted);
 * when it goes next, warn where it waits and plain where paused; and its one act. 44px, a hairline between rows, no
 * zebra. Under 1000px of page the channels and the people fold under the name. Every word is the view model's.
 */
import { ledgerPeopleWords } from "@chanlytics/contracts";
import type { LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ChannelMarks } from "../../parts/channels-line";
import { cmRowPress } from "../../parts/head";
import { AddAct, ResumeAct, WaitingActs } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";

/** The ledger's words, as the view model hands them. */
type Words = LifecycleLedger["words"];

/** What came back of a row in the last 30 days, in the ledger's words, and whether it is said dim (nothing, or not counted). */
export function resultsWords(r: LifecycleRow, W: Words): { words: string; dim: boolean } {
  return { words: W.results(r.results), dim: typeof r.results !== "object" };
}

/**
 * Who is at a row's moment now, or a dash where it was not counted: never a zero nobody counted. A row that says more than
 * one number (a reach-out's waiting and writing) says its words.
 */
const peopleWords = (r: LifecycleRow, W: Words): string =>
  r.people.words ?? (r.people.n === null ? W.dash : String(r.people.n));

/**
 * A row's name: its door where it opens something (a drawer, the call's text's message in its own, a run, the
 * receptionist's settings), else its words. `plain` draws no chevron of its own, where the row carries one at its end
 * (the phone's list, every row's).
 */
export function RowName({ r, acts, plain = false }: { r: LifecycleRow; acts: LedgerActs; plain?: boolean }) {
  const door = r.open ? acts.door(r.open) : null;
  if (!door) return <span className="cmh-row-name">{r.name}</span>;
  return (
    <LinkButton {...door} size="inherit" className="cmh-row-name" data-row-open data-testid="cmh-row-open">
      {r.name}
      {r.kind === "call_text" && !plain ? <Icon name="chevron" size={12} /> : null}
    </LinkButton>
  );
}

/**
 * A row's one act: Approve and Skip where its run waits, Resume (asked) where it is paused, Turn on where it is off,
 * and a door where its act opens a page (a chain's waiting run, decided on its own page: lane 2's "Open the run").
 */
function RowAct({ r, W, acts }: { r: LifecycleRow; W: Words; acts: LedgerActs }) {
  if (r.waiting)
    return <WaitingActs r={r} w={r.waiting} approve={W.approve(r.waiting.people)} approval={acts.approval} />;
  const act = r.act;
  if (act && act.kind === "resume") return <ResumeAct act={act} onAct={acts.onAct} gated={acts.gated} />;
  if (act && act.kind === "turn_on") return <AddAct act={act} acts={acts} testid="cmh-row-turn-on" />;
  if (act && act.kind === "route") return <AddAct act={act} acts={acts} testid="cmh-row-run" />;
  return null;
}

interface LedgerRowProps {
  r: LifecycleRow;
  W: Words;
  acts: LedgerActs;
  /** The keys' cursor is on it: it shows its acts as a hovered row does. */
  cursor: boolean;
  /** Decided here a moment ago (it settles once), or just arrived (washed once). */
  mark: "settled" | "arrived" | null;
}

/** Whether a row's press opens something (its drawer, the Library, a run): the receptionist's opens nothing. */
export const rowOpens = (r: LifecycleRow, acts: LedgerActs): boolean => !!r.open && acts.door(r.open) !== null;

/** One row of the ledger, on a desk. */
export function LedgerRow({ r, W, acts, cursor, mark }: LedgerRowProps) {
  const results = resultsWords(r, W);
  const people = peopleWords(r, W);
  const counted = ledgerPeopleWords(r.people);
  return (
    <div
      className="cmh-row"
      data-row={r.id}
      data-kind={r.kind}
      data-state={r.status}
      // A row that opens something wears a pointer and a hover (campaigns.css); one that opens nothing, neither.
      data-opens={rowOpens(r, acts) ? "true" : undefined}
      data-cursor={cursor ? "true" : undefined}
      data-settled={mark === "settled" ? "true" : undefined}
      data-arrived={mark === "arrived" ? "true" : undefined}
      data-testid="cmh-row"
    >
      {/* A press anywhere on the line that is not one of its controls opens the row, as Sent's runs and People's rows. */}
      <div className="cmh-row-line" role="presentation" onClick={cmRowPress}>
        <div className="cmh-row-what">
          {/* Its state, in the one word the rail and the phone say (the view model's stateWords): the dot is that word's tone, so
              it is named, never a bare colour. */}
          <span
            className="cmh-row-dot"
            data-tone={r.tone}
            {...(r.stateWords ? { role: "img", "aria-label": r.stateWords } : { "aria-hidden": true })}
          />
          <RowName r={r} acts={acts} />
          {r.hint ? <span className="cmh-dim cmh-row-hint">{r.hint}</span> : null}
          {/* Under 1000px of page the two columns that leave stand here, under the name (campaigns.css): the people with
              what they count, since no head says it there, and nothing where they were not counted. Above it the
              stylesheet does not draw it, which keeps it from a screen reader too, so the columns are said once. */}
          <span className="cmh-row-fold">
            <ChannelMarks marks={r.channels} />
            {counted === null ? null : <span className="tabular">{counted}</span>}
          </span>
        </div>
        <div className="cmh-row-by">
          <ChannelMarks marks={r.channels} testid="cmh-row-chans" />
        </div>
        <div className="cmh-row-people tabular" data-testid="cmh-row-people">
          {people}
        </div>
        <div
          className="cmh-row-results tabular"
          data-dim={results.dim ? "true" : undefined}
          data-testid="cmh-row-results"
        >
          {results.words}
        </div>
        <div className="cmh-row-next" data-testid="cmh-row-next">
          {r.next.words}
        </div>
        {/* A question asked here is answered here: a press on its words is not the row's. */}
        <div className="cmh-row-acts" role="presentation" onClick={(e) => e.stopPropagation()}>
          <RowAct r={r} W={W} acts={acts} />
        </div>
      </div>
    </div>
  );
}
