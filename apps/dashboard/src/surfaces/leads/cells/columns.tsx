/**
 * The columns the Leads table draws, and a lead's row on a phone (moved from legacy/pages/leads-cells.jsx, decision 0015).
 *
 * PRD §6.2's Leads columns as the redesign cuts them (D5): three that differ row to row -- who they are, whether you can
 * reach them, how well they are rated -- and when they were found, whose cell holds the row's acts on hover. Fit, Why it
 * fits and Stage stay in the Columns menu, off: the band bar says the fits, the name's card and the peek say why, and the
 * row wears its stage as a tag. In the kit's shape (kit/table/columns.ts DataColumn). The six that sort are the six
 * `leads_page` takes, and the server sorts them (the table runs on the read's order); the filters' columns hold the
 * page's narrowings over the rows a view loaded: the Excluded view's chip, the band's fit, the Filter's reach.
 */
import {
  LEAD_REVIEW_ACT_WORDS,
  leadReaches,
  placeWordOf,
  type LeadReachFilter,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { gate, hasTouchSwipe, touchSwipe } from "../../legacy-verbs";
import { plRowCard } from "../../people/cells/row-card";
import { plPhoneNow } from "../../people/words";
import type { DataCard, DataColumn, RowPick } from "../../kit/table/columns";
import type { ColCtx } from "../../people/types";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { PlaceWord } from "../../campaigns/sequences/place/parts";
import { leadDtoFor } from "../surface";
import { LeadRowCall } from "./call-menu";
import { LeadHover, LeadTip, ldPlacePop } from "./hover";
import { LeadRatedCard, ldBusinessCell, ldClientOf, ldPeopleOf, ldTalkingDoor } from "./name-cell";
import { LeadSlot, LeadSlotShape } from "./shapes";
import type { LeadCellCtx } from "./types";

/* ------------------------------------------------------------------ the row */

// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three (§8.7, S9):
// Keep and Exclude move a place out of Needs review, Put back is the owner's override of an exclusion. All three count, so
// all three are the owner's permission `find`; anyone else sees them on the page, in the tab order, saying why when pressed
// (the role gate), never disabled and never silent. They are the system's small buttons, 26px like People's row acts: Call
// and Copy square (`btn-icon btn-sm`), the words `btn-sm`. On a phone's card, leads.css draws Call at 44px. Call's ways are
// the one menu the rows share (call-menu.tsx), which the scope draws once: a row holds only its control.
const LeadRowActions = ({
  l,
  callMenu,
  onCopy,
  onKeep,
  onExclude,
  onPutBack,
  canFind,
}: { l: LeadRowVM } & Pick<LeadCellCtx, "callMenu" | "onCopy" | "onKeep" | "onExclude" | "onPutBack" | "canFind">) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <LeadRowCall l={l} handle={callMenu} />}
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

/**
 * Where this business stands in a sequence (00459 sequence_places_of, read with the page's rows), in the words and tone
 * the lead sheet and the record use: Held, Waits for your OK, Yours to send, Wrote back in amber; In and the sequence's
 * name with when, in green; Done or Left with why. Nothing for a lead in no sequence.
 */
/** The place as a phone's card says it under the name, in words: "In Bookstore intro · Step 1 Tue 9:00 AM". */
const ldPlaceWords = (l: LeadRowVM): string | null => {
  const place = l.cls === "excluded" ? null : (leadDtoFor(l.id)?.place ?? null);
  if (!place) return null;
  const w = placeWordOf(place, { name: place.name, state: place.state }, { tz: reachOuts.zone(), nowMs: Date.now() });
  return w.line ? `${w.word} · ${w.line}` : w.word;
};
const ldReachOutLine = (l: LeadRowVM) => {
  const place = l.cls === "excluded" ? null : (leadDtoFor(l.id)?.place ?? null);
  return place ? (
    <div className="cl-row-meta" data-testid="lead-reach-out-line">
      <PlaceWord
        place={place}
        sequence={{ name: place.name, state: place.state }}
        tz={reachOuts.zone()}
        testid="lead-place"
      />
    </div>
  ) : null;
};

const reachCell = (l: LeadRowVM, x: LeadCellCtx) => (
  <td key="reach" className="ld-reach-cell" data-testid="lead-reach">
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

/** Every one of Leads' sorts is the server's (leads_page): a first press goes the most first, as it always went. */
const BY_SERVER = { first: "desc" } as const;

export const LEAD_COLUMNS: readonly DataColumn<LeadRowVM, LeadCellCtx, ColCtx>[] = [
  {
    key: "business",
    label: "Business",
    sort: BY_SERVER,
    fill: true,
    width: { base: 300, min: 240, max: 640 },
    cell: ldBusinessCell,
  },
  // Beside the name (Reach out Part 6, H8: "Columns puts the Stage beside the name"), with where this business stands in
  // its sequence, in Sequences' words (the row's place, the one reader: 00459 sequence_places_of).
  {
    key: "stage",
    label: "Stage",
    sort: BY_SERVER,
    width: { base: 148, min: 124, max: 260 },
    on: false,
    cell: (l, x) => (
      <td key="stage" className="ld-stage-cell" data-testid="lead-stage">
        {l.cls !== "excluded" &&
          ldTalkingDoor(l, x, { kind: "lead_stage", value: l.stage, label: l.stageLabel, named: true })}
        {ldReachOutLine(l)}
      </td>
    ),
  },
  { key: "reach", label: "Reach", width: { base: 150, min: 120, max: 240 }, cell: reachCell },
  {
    key: "rating",
    label: "Rated",
    sort: BY_SERVER,
    width: { base: 96, min: 84 },
    cell: (l) => (
      <LeadHover
        as="td"
        key="rating"
        className="ld-rated-cell ld-hover"
        data-testid="lead-rated"
        card={l.rated && l.spread ? <LeadRatedCard l={l} /> : null}
      >
        {l.rated ? (
          <>
            <span className="ld-rated-score">{l.rated.score}</span>
            <span className="ld-rated-count">{l.rated.count}</span>
          </>
        ) : null}
      </LeadHover>
    ),
  },
  {
    key: "found",
    label: "Found",
    sort: BY_SERVER,
    width: { base: 120, min: 104 },
    cell: (l) => (
      <td
        key="found"
        className="dim ld-found-cell ld-hover"
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
    sort: BY_SERVER,
    // The band's fit (D5): one of the search's fits, the strong ones, the ones worth a look, the long shots.
    filter: (l, fit) => l.fit === fit,
    width: { base: 100, min: 84 },
    on: false,
    cell: (l) => (
      <td key="fit" className={`ld-fit-cell ${l.cls}`} title={l.fitTitle} data-testid="lead-fit">
        {l.fitLabel}
      </td>
    ),
  },
  {
    key: "why",
    label: "Why it fits",
    width: { base: 280, min: 160, max: 520 },
    on: false,
    cell: (l) => (
      <td key="why" className="dim cl-cut ld-why-cell" title={l.why}>
        {l.why}
      </td>
    ),
  },
  {
    key: "distance",
    label: "Distance",
    sort: BY_SERVER,
    width: { base: 104, min: 88 },
    needs: (x) => !!x.hasCenter,
    on: false,
    cell: (l) => (
      <td key="distance" className="dim cl-cut ld-distance-cell">
        {l.distance}
      </td>
    ),
  },
  {
    key: "source",
    label: "Source",
    width: { base: 128, min: 96, max: 220 },
    on: false,
    cell: (l) => (
      <td key="source" className="dim cl-cut ld-source-cell">
        {l.source}
      </td>
    ),
  },
  {
    key: "website",
    label: "Website",
    width: { base: 170, min: 120, max: 280 },
    on: false,
    cell: (l) => (
      <td key="website" className="dim cl-cut ld-website-cell">
        {l.host}
      </td>
    ),
  },
  {
    key: "search",
    label: "Search",
    width: { base: 150, min: 108, max: 260 },
    on: false,
    cell: (l) => (
      <td key="search" className="dim cl-cut ld-search-cell">
        {l.searchName}
      </td>
    ),
  },
  // The row's acts, where the eye ends: on hover and on the keyboard's cursor (clients.css shows .cl-row-actions then).
  {
    key: "actions",
    label: "",
    width: { base: 84 },
    fixed: true,
    cell: (l, x) => (
      <td key="actions" className="cl-actions-cell">
        <LeadRowActions
          l={l}
          callMenu={x.callMenu}
          onCopy={x.onCopy}
          onKeep={x.onKeep}
          onExclude={x.onExclude}
          onPutBack={x.onPutBack}
          canFind={x.canFind}
        />
      </td>
    ),
  },
  // The Excluded view's chip: one criterion that left a lead out, in the words the row holds (contracts excludedBy).
  { key: "f_excluded", label: "", hidden: true, filter: (l, why) => l.excludedBy === why },
  // The Filter (contracts leadReaches): only the leads with a checked email, a checked phone, or both.
  { key: "f_reach", label: "", hidden: true, filter: (l, reach) => leadReaches(l.slots, reach as LeadReachFilter[]) },
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
    // reach-out writes to the open search, its line says where this business stands (Part 6, H8); once anyone at it is in
    // People, who they are (0052). The Stage stays words on a phone: the row opens the peek, whose In People rows are doors.
    lead:
      l.cls === "excluded"
        ? l.fitLabel
        : l.cls === "review" && x && x.sectioned
          ? l.sub
          : ldPlaceWords(l) || l.waitsOn || ldPeopleOf(l, x)?.line || l.sub,
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

/** A phone's one cell for Leads, and the class its rows wear: People's (clients.css draws both from it). */
export const LEAD_CARD: DataCard<LeadRowVM, LeadCellCtx> = {
  label: "Business",
  cell: ldCardCell,
  rowClass: "pl-card-row",
};
