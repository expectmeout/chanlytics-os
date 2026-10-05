/**
 * The columns the Leads table draws, and a lead's row on a phone (moved from legacy/pages/leads-cells.jsx, decision 0015).
 *
 * PRD §6.2's Leads columns as the redesign cuts them (D5): three that differ row to row -- who they are, whether you can
 * reach them, how well they are rated -- and when they were found, whose cell holds the row's acts on hover. Fit, Why it
 * fits and Stage stay in the Columns menu, off: the band bar says the fits, the name's card and the peek say why, and the
 * row wears its stage as a tag. In the shape the table takes (surfaces/people/table/table.tsx): { key, label, sortable,
 * pinned, fixed, on, needs, cell(l, x) }. The six that sort are the six `leads_page` takes.
 */
import { LEAD_REVIEW_ACT_WORDS, type LeadRowVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { gate, hasTouchSwipe, touchSwipe } from "../../legacy-verbs";
import { plRowCard } from "../../people/cells/row-card";
import { plPhoneNow } from "../../people/words";
import type { RowPick, TableColumn } from "../../people/types";
import { LeadCallMenu, ldCallProps } from "./call-menu";
import { LeadTip, ldPlacePop } from "./hover";
import { LeadRatedCard, ldBusinessCell, ldClientOf } from "./name-cell";
import { LeadSlot, LeadSlotShape } from "./shapes";
import type { LeadCellCtx } from "./types";

/* ------------------------------------------------------------------ the row */

// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three (§8.7, S9):
// Keep and Exclude move a place out of Needs review, Put back is the owner's override of an exclusion. All three count, so
// all three are the owner's permission `find`; anyone else sees them on the page, in the tab order, saying why when pressed
// (the role gate), never disabled and never silent. They are the system's small buttons, 26px like People's row acts: Call
// and Copy square (`btn-icon btn-sm`), the words `btn-sm`. On a phone's card, leads.css draws Call at 44px.
const LeadRowActions = ({
  l,
  onCall,
  onCopy,
  onCopyPhone,
  onLogCall,
  onKeep,
  onExclude,
  onPutBack,
  canFind,
}: { l: LeadRowVM } & Pick<
  LeadCellCtx,
  "onCall" | "onCopy" | "onCopyPhone" | "onLogCall" | "onKeep" | "onExclude" | "onPutBack" | "canFind"
>) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && (
      <LeadCallMenu
        {...ldCallProps(l, { onCall, onCopyPhone, onLogCall })}
        look={{ variant: "quiet", size: "sm", iconOnly: true, className: "ld-call" }}
      />
    )}
    {l.email && l.emailState !== "invalid" && (
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          onCopy(l.id);
        }}
        title="Copy the email"
        aria-label={`Copy the email for ${l.name}`}
        data-testid="lead-copy"
      >
        <Icon name="copy" size={11} />
      </button>
    )}
    {l.cls === "review" && (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          onKeep(l.id);
        }}
        data-testid="lead-keep"
        {...(canFind ? {} : gate("find", "keep this lead"))}
      >
        Keep
      </button>
    )}
    {l.cls === "review" && (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          onExclude(l.id);
        }}
        data-testid="lead-exclude"
        {...(canFind ? {} : gate("find", "exclude this lead"))}
      >
        Exclude
      </button>
    )}
    {l.cls === "excluded" && (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => {
          e.stopPropagation();
          onPutBack(l.id);
        }}
        data-testid="lead-put-back"
        {...(canFind ? {} : gate("find", "put this lead back"))}
      >
        Put back
      </button>
    )}
  </span>
);

/** Where this business stands in the reach-out writing to the open search (Part 6, H8), or nothing. */
const ldReachOutLine = (l: LeadRowVM, x: LeadCellCtx | null | undefined) => {
  const line = x && x.reachOut && l.cls !== "excluded" ? x.reachOut.lineOf(l.id) : null;
  return line ? (
    <div className="cl-row-meta" data-testid="lead-reach-out-line">
      {line}
    </div>
  ) : null;
};

const reachCell = (l: LeadRowVM, x: LeadCellCtx) => (
  <td key="reach" className="shrink ld-reach-cell" data-testid="lead-reach">
    {l.cls === "excluded" ? (
      <span className="dim">Not checked</span>
    ) : (
      <span className={`ld-slots${x.values ? " values" : ""}`}>
        <LeadSlot
          id={l.id}
          kind="phone"
          slot={l.slots.phone}
          values={x.values}
          onPress={l.slots.phone.value && l.slots.phone.state !== "bad" ? () => x.onCall(l.id) : null}
          pressLabel="press to call"
        />
        <LeadSlot
          id={l.id}
          kind="mailbox"
          slot={l.slots.mailbox}
          values={x.values}
          onPress={l.slots.mailbox.copy ? () => x.onCopy(l.id) : null}
          pressLabel="press to copy"
        />
      </span>
    )}
  </td>
);

export const LEAD_COLUMNS: readonly TableColumn<LeadRowVM, LeadCellCtx>[] = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },
  // Beside the name (Reach out Part 6, H8: "Columns puts the Stage beside the name"), with, while a reach-out writes to the
  // open search, the line that says where this business stands in it (contracts reachOutLineOf, x.reachOut).
  {
    key: "stage",
    label: "Stage",
    sortable: true,
    on: false,
    cell: (l, x) => (
      <td key="stage" className="shrink ld-stage-cell" data-testid="lead-stage">
        {l.cls !== "excluded" && <StatePill kind="lead_stage" value={l.stage} label={l.stageLabel} />}
        {ldReachOutLine(l, x)}
      </td>
    ),
  },
  { key: "reach", label: "Reach", sortable: false, cell: reachCell },
  {
    key: "rating",
    label: "Rated",
    sortable: true,
    cell: (l) => (
      <td
        key="rating"
        className="shrink ld-rated-cell ld-hover"
        data-testid="lead-rated"
        onMouseEnter={ldPlacePop}
        onFocus={ldPlacePop}
      >
        {l.rated ? (
          <>
            <span className="ld-rated-score">{l.rated.score}</span>
            <span className="ld-rated-count">{l.rated.count}</span>
            {l.spread ? <LeadRatedCard l={l} /> : null}
          </>
        ) : null}
      </td>
    ),
  },
  {
    key: "found",
    label: "Found",
    sortable: true,
    cell: (l) => (
      <td
        key="found"
        className="shrink dim ld-found-cell ld-hover"
        data-testid="lead-found"
        onMouseEnter={ldPlacePop}
        onFocus={ldPlacePop}
      >
        <span tabIndex={0} aria-describedby={`${l.id}-found-tip`}>
          {l.foundLabel}
        </span>
        <LeadTip id={`${l.id}-found-tip`} testid="lead-tip-found">
          {l.foundAt}
          {l.card.found[0] ? ` · ${l.card.found[0].what}` : ""}
        </LeadTip>
      </td>
    ),
  },
  {
    key: "fit",
    label: "Fit",
    sortable: true,
    on: false,
    cell: (l) => (
      <td key="fit" className={`shrink ld-fit-cell ${l.cls}`} title={l.fitTitle} data-testid="lead-fit">
        {l.fitLabel}
      </td>
    ),
  },
  {
    key: "why",
    label: "Why it fits",
    sortable: false,
    on: false,
    cell: (l) => (
      <td key="why" className="dim ld-why-cell" title={l.why}>
        {l.why}
      </td>
    ),
  },
  {
    key: "distance",
    label: "Distance",
    sortable: true,
    needs: (x) => !!x.hasCenter,
    on: false,
    cell: (l) => (
      <td key="distance" className="shrink dim ld-distance-cell">
        {l.distance}
      </td>
    ),
  },
  {
    key: "source",
    label: "Source",
    sortable: false,
    on: false,
    cell: (l) => (
      <td key="source" className="shrink dim ld-source-cell">
        {l.source}
      </td>
    ),
  },
  {
    key: "website",
    label: "Website",
    sortable: false,
    on: false,
    cell: (l) => (
      <td key="website" className="shrink dim ld-website-cell">
        {l.host}
      </td>
    ),
  },
  {
    key: "search",
    label: "Search",
    sortable: false,
    on: false,
    cell: (l) => (
      <td key="search" className="shrink dim ld-search-cell">
        {l.searchName}
      </td>
    ),
  },
  // The row's acts, where the eye ends: on hover and on the keyboard's cursor (clients.css shows .cl-row-actions then).
  {
    key: "actions",
    label: "",
    sortable: false,
    fixed: true,
    cell: (l, x) => (
      <td key="actions" className="shrink cl-actions-cell">
        <LeadRowActions
          l={l}
          onCall={x.onCall}
          onCopy={x.onCopy}
          onCopyPhone={x.onCopyPhone}
          onLogCall={x.onLogCall}
          onKeep={x.onKeep}
          onExclude={x.onExclude}
          onPutBack={x.onPutBack}
          canFind={x.canFind}
        />
      </td>
    ),
  },
];

/* --------------------------------------------------------------- the phone */

// A lead's row on a phone is People's (plRowCard; the phone pass, D8), so the two scopes are one list to the eye: the
// business's mark or the listing's photo on its initials, its name and its state (Ready too, as a person's row always says
// theirs); where it is, or what it waits on, or what left it out; and whether a phone and a mailbox reach it, how it is
// rated and when it was found. Call is the lead's own page's first button -- the row opens it -- and C on a keyboard: a
// 44px Call on every card made Leads' rows a second kind of list.
const ldCardCell = (l: LeadRowVM, x: LeadCellCtx, pick?: RowPick) => {
  // Needs review on a phone (Ruben, 25 Sep): a thumb slides the row -- right to keep, left to exclude, the bell's way (the
  // shell's touchSwipe) -- over the act's word. The doors are the cell context's, the same the bench and the bar press; a
  // member who may not find leads gets no slide.
  const slides = l.cls === "review" && !!(x && x.canFind) && hasTouchSwipe();
  const W = LEAD_REVIEW_ACT_WORDS;
  return plRowCard({
    face: { initials: l.tile.initials, image: l.tile.image, mark: l.tile.logo },
    pick,
    name: l.name,
    pill: ldClientOf(l, x) ? (
      <StatePill kind="deal" value="won" testid="lead-state" />
    ) : (
      <StatePill kind="lead_row_state" value={l.state} label={l.stateTag || l.stageLabel} testid="lead-state" />
    ),
    // Under a group's own heading (x.sectioned, the scope's review sections) the reason is said once, above. While a
    // reach-out writes to the open search, its line says where this business stands (Part 6, H8).
    lead:
      l.cls === "excluded"
        ? l.fitLabel
        : l.cls === "review" && x && x.sectioned
          ? l.sub
          : (x && x.reachOut && x.reachOut.lineOf(l.id)) || l.waitsOn || l.sub,
    leadTestid: "lead-sub",
    swipe: slides
      ? touchSwipe({
          onBack: () => x.onKeep(l.id),
          onAway: () => x.onExclude(l.id),
          when: plPhoneNow,
          // The cell shows its grounds only while a thumb has the card (leads.css `.sliding`).
          onGrab: (el, on) => {
            if (el && el.parentElement && el.parentElement.classList) el.parentElement.classList.toggle("sliding", on);
          },
        })
      : null,
    grounds: slides
      ? [
          <span key="keep" className="pl-card-ground keep" aria-hidden="true">
            {W.keep}
          </span>,
          <span key="exclude" className="pl-card-ground exclude" aria-hidden="true">
            {W.exclude}
          </span>,
        ]
      : null,
    facts: [
      l.cls !== "excluded" ? (
        <span
          key="reach"
          className="pl-card-reach"
          role="img"
          aria-label={`Phone: ${l.slots.phone.word}. Email: ${l.slots.mailbox.word}.`}
          data-testid="lead-reach"
        >
          <LeadSlotShape state={l.slots.phone.state} />
          <LeadSlotShape state={l.slots.mailbox.state} />
        </span>
      ) : null,
      l.rated ? (
        <span key="rated" className="pl-card-rated" data-testid="lead-rated">
          <Icon name="star" size={11} />
          {l.rated.score} · {l.rated.count}
        </span>
      ) : null,
      <span key="found" className="pl-card-last" data-testid="lead-found">
        {l.foundLine}
      </span>,
    ],
  });
};

/** A phone's one column for Leads, and the class its rows wear: People's (clients.css draws both from it). */
export const LEAD_PHONE_COLUMNS: readonly TableColumn<LeadRowVM, LeadCellCtx>[] = [
  { key: "card", label: "Business", sortable: false, pinned: true, cell: ldCardCell },
];

export const ldCardRowClass = () => "pl-card-row";
