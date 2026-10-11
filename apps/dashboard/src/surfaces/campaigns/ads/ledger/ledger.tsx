/**
 * The Ads ledger on a desk (MOCKUP; spec C8): the Messages ledger's markup and classes, with six tracks: AD · SPENT · IN TOUCH ·
 * BOOKED · EACH · STATE. Rows are grouped by what the ad asks people to do, or by the platform it runs on (from seven ads, a
 * quiet "Group" choice above the ledger), under slim hairline captions (a 12px ring glyph, mono caps, the dim meta). A row is
 * one 44px line: a dot in its state's tone, the ad's name (the door to its drawer, a link with its address), one quiet hint; its
 * numbers right-aligned in sans, tabular, no colour; a short unit line under a number only where the unit is not obvious
 * ("wrote", "calls · Google's count", "only 3", "as of Sat 6 PM", "reading"); and its state as one word with a dim second line,
 * which for a running ad with something to say to the owner says that. Below 1000px of page "In touch" folds under the name. A
 * press anywhere on a row that is not a control opens it, and the keys' cursor (J and K, the arrows) wears the hover's grey.
 */
import { useId } from "react";
import { ADS_WORDS } from "@chanlytics/contracts";
import { LEDGER } from "@chanlytics/contracts/ads-page";
import type { AdRowVM, AdsGroupBy, CellVM, GroupByVM, GroupVM } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Panel } from "../../../kit/panel/panel";
import { Segmented } from "../../../kit/segmented/segmented";
import { Tooltip } from "../../../kit/tooltip/tooltip";
import { cx } from "../../../kit/variants";
import { routeDoor } from "../../../legacy-verbs";
import { cmRowPress } from "../../parts/head";

/** A ledger number: the value, and under it the short unit where the unit is not obvious. A dash says why on hover or focus. */
function AdsNum({ cell, className }: { cell: CellVM; className?: string }) {
  const value = cell.why ? (
    <Tooltip tip={cell.why}>
      <span
        className="ads-num-value"
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focus stop for its tip, the one way a keyboard reads why a number is a dash
        tabIndex={0}
        aria-description={cell.why}
      >
        {cell.value}
      </span>
    </Tooltip>
  ) : (
    <span className="ads-num-value">{cell.value}</span>
  );
  return (
    <div className={cx("ads-num tabular", className)} data-dash={cell.value === LEDGER.none ? "true" : undefined}>
      {value}
      {cell.unit ? <span className="ads-num-unit">{cell.unit}</span> : null}
    </div>
  );
}

interface RowProps {
  row: AdRowVM;
  onOpen: (route: string) => void;
  /** The ad just turned on: its row is new, and washes once. */
  arrived: boolean;
  /** The keys' cursor is on it: it wears the hover's grey. */
  cursor: boolean;
}

/** One ad: a subgrid line of the ledger's grid. */
function AdRow({ row, onOpen, arrived, cursor }: RowProps) {
  return (
    <div
      className="cmh-row"
      data-row={row.id}
      data-state={row.state.tone}
      data-opens="true"
      data-cursor={cursor ? "true" : undefined}
      data-arrived={arrived ? "true" : undefined}
      data-testid="ads-row"
    >
      {/* A press anywhere on the line that is not one of its controls opens the row, as Messages' rows do. */}
      <div className="cmh-row-line" role="presentation" onClick={cmRowPress}>
        <div className="cmh-row-what">
          <span className="cmh-row-dot" data-tone={row.tone} aria-hidden="true" />
          <LinkButton
            {...routeDoor(row.open, onOpen)}
            size="inherit"
            className="cmh-row-name"
            data-row-open
            data-testid="ads-row-open"
          >
            {row.name}
          </LinkButton>
          <span className="cmh-dim cmh-row-hint">{row.hint}</span>
          {/* Under 1000px of page "In touch" stands here, under the name (the stylesheet draws it there alone). */}
          {row.fold ? <span className="cmh-row-fold">{`${row.fold.value} ${row.fold.unit}`}</span> : null}
        </div>
        <AdsNum cell={row.spent} />
        <AdsNum cell={row.inTouch} className="cmh-row-people" />
        <AdsNum cell={row.booked} />
        <AdsNum cell={row.each} />
        <div
          className="ads-status"
          data-tone={row.state.tone}
          data-alert={row.alert ? "true" : undefined}
          data-testid="ads-row-state"
        >
          <span className="ads-status-word">{row.state.word}</span>
          {row.state.second ? <span className="ads-status-second">{row.state.second}</span> : null}
        </div>
      </div>
    </div>
  );
}

interface GroupProps {
  g: GroupVM;
  onOpen: RowProps["onOpen"];
  arrived: string | null;
  cursor: string | null;
}

/** A group: its glyph in a ring, its caps and what it says of itself, then its rows. */
function AdGroup({ g, onOpen, arrived, cursor }: GroupProps) {
  return (
    <section className="cmh-group" data-group={g.key} aria-label={g.caps} data-testid="ads-group">
      <div className="cmh-group-head" data-testid="ads-group-head">
        <span className="cmh-group-ring" aria-hidden="true">
          <Icon name={g.glyph} size={12} />
        </span>
        <h3 className="cmh-group-caps">{g.caps}</h3>
        <span className="cmh-dim cmh-group-meta">{g.meta}</span>
        <span />
      </div>
      {g.rows.map((row) => {
        const lit = arrived === row.id;
        // An ad just turned on is a new element, so the wash's starting style plays once.
        return (
          <AdRow
            key={lit ? `${row.id}:arrived` : row.id}
            row={row}
            onOpen={onOpen}
            arrived={lit}
            cursor={cursor === row.id}
          />
        );
      })}
    </section>
  );
}

/** The column heads, once, in caps: the number columns right-aligned, "In touch" the one that folds under the name. */
function AdsHeads() {
  const H = LEDGER.heads;
  return (
    <div className="cmh-ledger-heads" aria-hidden="true" data-testid="ads-ledger-heads">
      <span className="cmh-ledger-head" data-col="ad">
        {H.ad}
      </span>
      <span className="cmh-ledger-head ads-head-num" data-col="spent">
        {H.spent}
      </span>
      <span className="cmh-ledger-head ads-head-num" data-col="people">
        {H.touch}
      </span>
      <span className="cmh-ledger-head ads-head-num" data-col="booked">
        {H.booked}
      </span>
      <span className="cmh-ledger-head ads-head-num" data-col="each">
        {H.each}
      </span>
      <span className="cmh-ledger-head" data-col="state">
        {H.state}
      </span>
    </div>
  );
}

interface GroupToolProps {
  groupBy: GroupByVM;
  onGroupBy: (next: AdsGroupBy) => void;
}

/** The quiet choice of how the ads are grouped, from seven ads: it changes what the page shows, in place. */
function GroupTool({ groupBy, onGroupBy }: GroupToolProps) {
  const label = useId();
  return (
    <div className="ads-group-tool" data-testid="ads-group-tool">
      <span id={label} className="ads-group-said">
        {groupBy.label}
      </span>
      <Segmented<AdsGroupBy>
        labelledBy={label}
        value={groupBy.value}
        onValueChange={onGroupBy}
        options={groupBy.options.map((o) => ({ ...o, testid: `ads-group-by-${o.value}` }))}
      />
    </div>
  );
}

interface AdsLedgerProps {
  groups: readonly GroupVM[];
  /** Open an ad in its drawer, pushed so Back closes it. */
  onOpen: (route: string) => void;
  /** The ad just turned on, if any. */
  arrived: string | null;
  /** The row the keys' cursor is on, if any. */
  cursor: string | null;
  /** The choice of how to group, once there are ads enough to need one. */
  groupBy: GroupByVM | null;
  onGroupBy: (next: AdsGroupBy) => void;
}

/** The desk's ledger: the grouping choice (from seven ads), the heads, then the groups and their rows, in the pane. */
export function AdsLedger({ groups, onOpen, arrived, cursor, groupBy, onGroupBy }: AdsLedgerProps) {
  return (
    <>
      {groupBy ? <GroupTool groupBy={groupBy} onGroupBy={onGroupBy} /> : null}
      <Panel as="section" size="flush" className="cmh-block ads-ledger-block" data-testid="ads-ledger-block">
        <section className="cmh-ledger" aria-label={ADS_WORDS.adsTab} data-testid="ads-ledger">
          <AdsHeads />
          {groups.map((g) => (
            <AdGroup key={g.key} g={g} onOpen={onOpen} arrived={arrived} cursor={cursor} />
          ))}
        </section>
      </Panel>
    </>
  );
}
