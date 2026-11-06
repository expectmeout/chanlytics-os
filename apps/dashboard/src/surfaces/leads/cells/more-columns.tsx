/**
 * The columns a member turns on from the Columns menu (decision 0103): every fact a lead's row already holds, so showing
 * one is drawn at once and never waits on the network. They say what the row's own words say (contracts leadColumnsOf),
 * each in the kit's two lines, whose tip says what a narrow column cut; a number and an address in Reach's own words and
 * shapes. An empty value is an empty cell. Off until asked for, each under its group's heading in the menu. The five that
 * sort are the read's own sorts (leads_page), and a first press puts first what a member sorts by it for.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import { LEAD_COLUMN_GROUPS, type LeadRowVM, type LeadSlot } from "@chanlytics/contracts";
import type { DataColumn } from "../../kit/table/columns";
import { CellLines } from "../../kit/table/lines";
import type { ColCtx } from "../../people/types";
import { LeadNotChecked, LeadOutLink, leadMailboxLine, leadPhoneLine } from "./shapes";
import type { LeadCellCtx } from "./types";

type LeadColumn = DataColumn<LeadRowVM, LeadCellCtx, ColCtx>;

/** One fact, quiet, as the other columns a member turns on say theirs. `end`: a number, at the column's end. */
const factCell = (key: string, fact: ReactNode, end = false) => (
  <td key={key} className="dim" data-testid={`lead-col-${key}`}>
    {fact ? <CellLines top={fact} end={end} /> : null}
  </td>
);

/** A fact and what qualifies it: the fact in the row's ink, what qualifies it under it. */
const linesCell = (key: string, said: { top: string; sub: string | null } | null) => (
  <td key={key} data-testid={`lead-col-${key}`}>
    {said ? <CellLines top={said.top} sub={said.sub} /> : null}
  </td>
);

/**
 * One way to reach them: Reach's own line for it, how it was checked under it, named apart so that Reach and this can
 * both stand on a row. Left out, nothing was checked, as Reach says; nothing found is an empty cell.
 */
const reachOneCell = (key: string, l: LeadRowVM, slot: LeadSlot, line: (tipOf: string) => ReactNode) => (
  <td key={key} className="ld-reach-cell" data-testid={`lead-col-${key}`}>
    {l.cls === "excluded" ? (
      <LeadNotChecked />
    ) : slot.value ? (
      <CellLines open top={line(`${l.id}-col`)} sub={slot.word} />
    ) : null}
  </td>
);

const socialCell = (l: LeadRowVM) => (
  <td key="social" className="dim" data-testid="lead-col-social">
    {l.cols.social.length ? (
      <CellLines
        open
        top={
          <span className="ld-links">
            {l.cols.social.map((s, at) => (
              <Fragment key={s.key}>
                {at > 0 ? <span aria-hidden="true">·</span> : null}
                <LeadOutLink href={s.href}>{s.word}</LeadOutLink>
              </Fragment>
            ))}
          </span>
        }
      />
    ) : null}
  </td>
);

export const LEAD_MORE_COLUMNS: readonly LeadColumn[] = [
  {
    key: "sequence",
    label: "Sequence",
    group: LEAD_COLUMN_GROUPS.stands,
    on: false,
    width: { base: 170, min: 120, max: 280 },
    cell: (l) => factCell("sequence", l.cols.sequence),
  },
  {
    key: "contacted",
    label: "Last contacted",
    group: LEAD_COLUMN_GROUPS.stands,
    on: false,
    sort: { first: "desc" },
    width: { base: 112, min: 96 },
    cell: (l) =>
      factCell(
        "contacted",
        l.cols.contacted ? <span data-tip={l.cols.contacted.at}>{l.cols.contacted.label}</span> : null,
      ),
  },
  {
    key: "outcome",
    label: "Last outcome",
    group: LEAD_COLUMN_GROUPS.stands,
    on: false,
    width: { base: 190, min: 140, max: 320 },
    cell: (l) => linesCell("outcome", l.cols.outcome ? { top: l.cols.outcome.word, sub: l.cols.outcome.note } : null),
  },
  {
    key: "category",
    label: "Kind",
    group: LEAD_COLUMN_GROUPS.who,
    on: false,
    sort: { first: "asc" },
    width: { base: 150, min: 110, max: 260 },
    cell: (l) => factCell("category", l.category),
  },
  {
    key: "contact",
    label: "Contact",
    group: LEAD_COLUMN_GROUPS.who,
    on: false,
    width: { base: 190, min: 140, max: 300 },
    cell: (l) => linesCell("contact", l.cols.contact ? { top: l.cols.contact.name, sub: l.cols.contact.title } : null),
  },
  {
    key: "size",
    label: "Company size",
    group: LEAD_COLUMN_GROUPS.who,
    on: false,
    width: { base: 110, min: 88 },
    cell: (l) => factCell("size", l.cols.size),
  },
  {
    key: "city",
    label: "City",
    group: LEAD_COLUMN_GROUPS.where,
    on: false,
    sort: { first: "asc" },
    width: { base: 140, min: 100, max: 240 },
    cell: (l) => factCell("city", l.cols.city),
  },
  {
    key: "region",
    label: "State",
    group: LEAD_COLUMN_GROUPS.where,
    on: false,
    sort: { first: "asc" },
    width: { base: 84, min: 64 },
    cell: (l) => factCell("region", l.cols.region),
  },
  {
    key: "phone",
    label: "Phone",
    group: LEAD_COLUMN_GROUPS.reach,
    on: false,
    width: { base: 168, min: 140, max: 240 },
    cell: (l, x) => reachOneCell("phone", l, l.slots.phone, (tipOf) => leadPhoneLine(l, x, tipOf)),
  },
  {
    key: "email",
    label: "Email",
    group: LEAD_COLUMN_GROUPS.reach,
    on: false,
    width: { base: 220, min: 160, max: 340 },
    cell: (l, x) => reachOneCell("email", l, l.slots.mailbox, (tipOf) => leadMailboxLine(l, x, tipOf)),
  },
  {
    key: "social",
    label: "Social",
    group: LEAD_COLUMN_GROUPS.reach,
    on: false,
    // As wide as all four words: most leads hold one or two, and the one that holds four should not read "Link… · Face…".
    width: { base: 256, min: 120, max: 320 },
    cell: socialCell,
  },
  {
    key: "reviews",
    label: "Reviews",
    group: LEAD_COLUMN_GROUPS.good,
    on: false,
    sort: { first: "desc" },
    align: "end",
    width: { base: 96, min: 80 },
    cell: (l) => factCell("reviews", l.cols.reviews, true),
  },
  {
    key: "claimed",
    label: "Claimed listing",
    group: LEAD_COLUMN_GROUPS.good,
    on: false,
    width: { base: 120, min: 104 },
    cell: (l) => factCell("claimed", l.cols.claimed),
  },
  {
    key: "open_now",
    label: "Open now",
    group: LEAD_COLUMN_GROUPS.good,
    on: false,
    width: { base: 150, min: 120, max: 240 },
    cell: (l) => factCell("open_now", l.card.today),
  },
];
