/**
 * Campaigns' ledger's tool line, its column heads and its one-off footer (spec 2026-10-09 §4.3; decision 15). Past seven
 * rows: the search ("Search 19 campaigns"), the status tabs (a tab for each status above zero, All always; "Needs you"
 * the one in amber, as Sent's band draws its states: broadcasts/ledger.tsx BcBand), how many are shown ("Showing 7 of
 * 19", or "Visit tomorrow · showing 3 of 19" with a card chosen, and Clear), and Sort and Group, each a set to choose
 * one of; and the heads once, in caps, the sorted one in the chosen ink. Under seven rows: a group chosen says so, with
 * its Clear, and nothing else. A read of the numbers that failed is said here, once. Every word is the view model's.
 */
import type { RefObject } from "react";
import { LEDGER_SORTS, LEDGER_STATUSES } from "@chanlytics/contracts";
import type { LedgerSort, LedgerStatus, LifecycleFailedRead, LifecycleLedger } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Menu } from "../../../kit/menu/menu";
import { SubTabs } from "../../../kit/sub-tabs/sub-tabs";
import type { SubTab } from "../../../kit/sub-tabs/sub-tabs";
import { HomeFailed } from "../failed";
import type { LedgerActs } from "./ledger-acts";
import { LEDGER_GROUPINGS } from "./use-ledger-view";
import type { LedgerGrouping, LedgerView } from "./use-ledger-view";

type Words = LifecycleLedger["words"];

/** A tab's id read back as the status it names; one it does not know is All. */
const statusOfTab = (id: string): LedgerStatus => LEDGER_STATUSES.find((s) => s === id) ?? "all";
const sortOf = (id: string): LedgerSort => LEDGER_SORTS.find((s) => s === id) ?? "next";
const groupingOf = (id: string): LedgerGrouping => LEDGER_GROUPINGS.find((s) => s === id) ?? "moment";

/** The status tabs: All always, the others only above zero; Needs you the amber one. */
function statusTabs(ledger: LifecycleLedger): SubTab[] {
  const W = ledger.words.tabs;
  const c = ledger.counts;
  const tab = (id: LedgerStatus, label: string, count: number): SubTab => ({
    id,
    label,
    count,
    // Needs you names its unit (decision 19): "2 campaigns need you", on hover.
    ...(id === "needs" ? { tone: "warn" as const, hint: ledger.words.needsOf(count) } : {}),
    testid: `cmh-status-${id}`,
  });
  return [
    tab("all", W.all, c.all),
    ...(c.needs > 0 ? [tab("needs", W.needs, c.needs)] : []),
    ...(c.paused > 0 ? [tab("paused", W.paused, c.paused)] : []),
  ];
}

/** How many are shown, and Clear where something narrows the list. */
function ToolSay({ view, W }: { view: LedgerView; W: Words }) {
  const say = view.chosen ? W.showingIn(view.chosen.caps, view.shown, view.total) : W.showing(view.shown, view.total);
  return (
    <>
      <span className="cmh-ledger-say" data-testid="cmh-ledger-say">
        {say}
      </span>
      {view.filtered ? (
        <LinkButton onClick={view.clearAll} data-testid="cmh-ledger-clear">
          {W.clear}
        </LinkButton>
      ) : null}
    </>
  );
}

/** Sort and Group: each a menu of one set to choose from, its control saying what is chosen. */
function ChooseMenus({ view, W }: { view: LedgerView; W: Words }) {
  const tick = <Icon name="check" size={13} />;
  return (
    <>
      <Menu
        label={W.sort.label}
        trigger={
          <Button variant="quiet" size="sm" data-testid="cmh-ledger-sort">
            {W.sort.label} <span className="cmh-dim">{W.sort[view.sort]}</span>
          </Button>
        }
        groups={[
          {
            choose: {
              value: view.sort,
              onChoose: (v) => view.setSort(sortOf(v)),
              tick,
              options: LEDGER_SORTS.map((id) => ({ value: id, label: W.sort[id] })),
            },
          },
        ]}
      />
      <Menu
        label={W.group.label}
        trigger={
          <Button variant="quiet" size="sm" data-testid="cmh-ledger-group">
            {W.group.label} <span className="cmh-dim">{W.group[view.grouping]}</span>
          </Button>
        }
        groups={[
          {
            choose: {
              value: view.grouping,
              onChoose: (v) => view.setGrouping(groupingOf(v)),
              tick,
              options: LEDGER_GROUPINGS.map((id) => ({ value: id, label: W.group[id] })),
            },
          },
        ]}
      />
    </>
  );
}

interface ToolsProps {
  ledger: LifecycleLedger;
  view: LedgerView;
  /** The numbers' read that failed, said once here; null where it was read. */
  failed: LifecycleFailedRead | null;
  searchRef: RefObject<HTMLInputElement | null>;
}

/** The ledger's tool line: everything past seven rows, the chosen group and its Clear under them, nothing else. */
export function LedgerTools({ ledger, view, failed, searchRef }: ToolsProps) {
  const W = ledger.words;
  const said = failed ? <HomeFailed failed={failed} testid="cmh-ledger-failed" /> : null;
  if (!ledger.tools) {
    if (!view.chosen && !said) return null;
    return (
      <div className="cmh-ledger-line" data-testid="cmh-ledger-tools">
        {view.chosen ? <ToolSay view={view} W={W} /> : null}
        {said}
      </div>
    );
  }
  return (
    <div className="cmh-ledger-line" data-testid="cmh-ledger-tools">
      <Field
        type="search"
        aria-label={W.search(ledger.counts.all)}
        placeholder={W.search(ledger.counts.all)}
        value={view.query}
        onValueChange={view.setQuery}
        ref={searchRef}
        className="cmh-ledger-find"
        data-testid="cmh-ledger-search"
      />
      <SubTabs
        label={W.tabs.label}
        value={view.status}
        tabs={statusTabs(ledger)}
        onSelect={(id) => view.setStatus(statusOfTab(id))}
        quietCounts
        dense
        className="cmh-ledger-states"
      />
      <ToolSay view={view} W={W} />
      <ChooseMenus view={view} W={W} />
      {said}
    </div>
  );
}

/** Which column a sort is read in: the head that wears the chosen ink. */
const SORTED_HEAD: Record<LedgerSort, keyof Words["heads"]> = {
  name: "campaign",
  people: "people",
  replied: "results",
  next: "next",
};

/** The column heads, once, in caps: Campaign · Goes by · People now · Last 30 days · Next, the sorted one in the ink. */
export function LedgerHeads({ W, sort }: { W: Words; sort: LedgerSort }) {
  const head = (col: keyof Words["heads"]) => (
    <span className="cmh-ledger-head" data-col={col} data-sorted={SORTED_HEAD[sort] === col ? "true" : undefined}>
      {W.heads[col]}
    </span>
  );
  return (
    <div className="cmh-ledger-heads" aria-hidden="true" data-testid="cmh-ledger-heads">
      {head("campaign")}
      {head("goesBy")}
      {head("people")}
      {head("results")}
      {head("next")}
      <span />
    </div>
  );
}

/** One-off sends under seven rows: one line, how many went in the last 30 days, and the door to Sent. */
export function SentOnce({ ledger, acts }: { ledger: LifecycleLedger; acts: LedgerActs }) {
  const once = ledger.sentOnce;
  if (!once) return null;
  const door = acts.door(once.open);
  return (
    <p className="cmh-once" data-testid="cmh-sent-once">
      <span>{ledger.words.sentOnce.footer(once.n)}</span>
      {door ? (
        <LinkButton {...door} data-testid="cmh-sent-once-open">
          {ledger.words.sentOnce.open}
        </LinkButton>
      ) : null}
    </p>
  );
}
