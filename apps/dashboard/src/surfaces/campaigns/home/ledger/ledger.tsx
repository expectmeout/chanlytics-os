/**
 * Campaigns' ledger on a desk (spec 2026-10-09 §4.3; option A of the canvas of 9 October): every campaign in one place, in
 * the rail's pane under the moments, grouped by moment in the journey's order, then Lists & offers, Reach-outs and
 * one-off sends. Past seven rows a sticky tool line and the column heads, the groups' heads sticking under it; under
 * seven, the rows alone and one-off sends a footer. One grid, each group, row and line a subgrid of it, as Sent's runs
 * are (campaigns.css .bc-runs). A filter is answered with the kit's swap (useSwapMotion on the groups); typing moves
 * nothing; a row decided in place settles once; an arrival is drawn anew, so the kit's wash plays once. A read that
 * failed keeps its place: the templates' in First contact, the chains' in Reach-outs, the numbers' in the tool line.
 */
import type { ReactNode, RefObject } from "react";
import type { LifecycleFailed, LifecycleGroup, LifecycleLedger, LifecycleRow } from "@chanlytics/contracts";
import { EmptyState } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { useSwapMotion } from "../../../kit/motion/use-swap-motion";
import { HomeFailed } from "../failed";
import { AddAct } from "./ledger-acts";
import type { LedgerActs } from "./ledger-acts";
import type { RowMark } from "./ledger-keys";
import { LedgerRow } from "./ledger-row";
import { LedgerHeads, LedgerTools, SentOnce } from "./ledger-tools";
import type { LedgerView } from "./use-ledger-view";

/** The reads the ledger says it could not make, where their data would be. */
type LedgerFailed = Pick<LifecycleFailed, "templates" | "chains" | "report">;

/** A failed read said inside its group: the call's text's templates in First contact, the chains in Reach-outs. */
function failedIn(id: LifecycleGroup["id"], failed: LedgerFailed): ReactNode {
  if (id === "first_contact" && failed.templates) {
    return <HomeFailed failed={failed.templates} testid="cmh-templates-failed" />;
  }
  if (id === "reach_out" && failed.chains) return <HomeFailed failed={failed.chains} testid="pb-chains-failed" />;
  return null;
}

interface GroupProps {
  g: LifecycleGroup;
  acts: LedgerActs;
  children: ReactNode;
  failed: ReactNode;
}

/** A group: its head (its glyph in a ring, its caps, what it says of itself, its add), its rows, a read that failed. */
function LedgerGroup({ g, acts, children, failed }: GroupProps) {
  return (
    <section className="cmh-group" data-group={g.id} aria-label={g.caps} data-testid="cmh-group">
      <div className="cmh-group-head" data-testid="cmh-group-head">
        <span className="cmh-group-ring" aria-hidden="true">
          <Icon name={g.glyph} size={12} />
        </span>
        <h3 className="cmh-group-caps">{g.caps}</h3>
        <span className="cmh-dim cmh-group-meta">{g.meta}</span>
        {g.add ? <AddAct act={g.add} acts={acts} testid="cmh-group-add" /> : <span />}
      </div>
      {children}
      {failed}
    </section>
  );
}

interface LedgerProps {
  ledger: LifecycleLedger;
  failed: LedgerFailed;
  view: LedgerView;
  acts: LedgerActs;
  cursor: string | null;
  mark: RowMark;
  searchRef: RefObject<HTMLInputElement | null>;
}

/** The desk's ledger: the tool line, the heads, the groups and their rows, the one-off footer. */
export function Ledger(p: LedgerProps) {
  const { ledger, view, acts, failed } = p;
  const list = useSwapMotion<HTMLElement>(`${view.status}|${view.group ?? ""}`, ".cmh-group");
  const markOf = (id: string) => (p.mark && p.mark.id === id ? p.mark.kind : null);
  // An arrival is keyed anew, so its row is a new element and the wash's starting style plays once (kit.css's rule for a
  // changed line, which campaigns.css's row copies).
  const drawRow = (r: LifecycleRow) => (
    <LedgerRow
      key={markOf(r.id) === "arrived" ? `${r.id}:arrived` : r.id}
      r={r}
      W={ledger.words}
      acts={acts}
      cursor={p.cursor === r.id}
      mark={markOf(r.id)}
    />
  );
  // The chains' failed read where no Reach-outs group stands to hold it (a list grouped by nothing): said after the rows.
  const chainsAlone = !view.filtered && !view.visibleGroups.some((g) => g.id === "reach_out") ? failed.chains : null;
  return (
    <section
      ref={list}
      className="cmh-ledger"
      aria-label={ledger.words.label}
      data-tools={ledger.tools ? "true" : undefined}
      data-testid="cmh-ledger"
    >
      <LedgerTools ledger={ledger} view={view} failed={failed.report} searchRef={p.searchRef} />
      {ledger.tools ? <LedgerHeads W={ledger.words} sort={view.sort} /> : null}
      {view.rows.length === 0 && view.filtered ? (
        <div className="cmh-ledger-none">
          <EmptyState
            kind="line"
            title={ledger.words.empty}
            action={{ label: ledger.words.clear, onClick: view.clearAll }}
            testid="cmh-ledger-none"
          />
        </div>
      ) : null}
      {view.grouped ? (
        view.visibleGroups.map((g) => (
          <LedgerGroup key={g.id} g={g} acts={acts} failed={failedIn(g.id, failed)}>
            {g.rows.map(drawRow)}
          </LedgerGroup>
        ))
      ) : view.visibleRows.length > 0 ? (
        <div className="cmh-group" data-testid="cmh-group">
          {view.visibleRows.map(drawRow)}
        </div>
      ) : null}
      {chainsAlone ? <HomeFailed failed={chainsAlone} testid="pb-chains-failed" /> : null}
      <SentOnce ledger={ledger} acts={acts} />
    </section>
  );
}
