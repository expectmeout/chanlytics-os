/**
 * The columns the Leads table draws, and a lead's row on a phone (moved from legacy/pages/leads-cells.jsx, decision 0015).
 *
 * PRD §6.2's Leads columns as the redesign cuts them (D5), and as the table review of 5 Nov 2026 set their cells: who
 * they are, where they stand, how to reach them, how well they are rated and when they were found, each cell the kit's
 * two lines (kit/table/lines.tsx), the fact and then what qualifies it. Stage says the one status a lead has and takes
 * the room the others leave; Reach says the number and the address themselves, where two circles stood for them. Fit
 * and Why it fits stay in the Columns menu, off: the band bar says the fits, the name's card and the peek say why. So
 * do the rest of what a row holds (more-columns.tsx). In the kit's shape (kit/table/columns.ts DataColumn). The columns
 * that sort are the sorts `leads_page` takes, and the server sorts them (the table runs on the read's order); the filters'
 * columns hold the page's narrowings, which the read applies: the Excluded view's chip, the band's fit, the Filter's reach.
 */
import {
  LEAD_COLUMN_GROUPS,
  LEAD_RATED_HINT,
  LEAD_REVIEW_ACT_WORDS,
  leadRowActOf,
  leadStatusOf,
  type LeadRowActKind,
  type LeadRowVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { canDo, gate, hasTouchSwipe, touchSwipe } from "../../legacy-verbs";
import { plRowCard } from "../../people/cells/row-card";
import { plPhoneNow } from "../../people/words";
import { ROW_ACTS_PX, type DataCard, type DataColumn, type RowPick } from "../../kit/table/columns";
import { CellLines } from "../../kit/table/lines";
import type { View } from "../../kit/table/view";
import type { ColCtx } from "../../people/types";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { leadDtoFor } from "../surface";
import { LeadRowCall } from "./call-menu";
import { LeadHover, LeadTip, ldPlacePop } from "./hover";
import {
  LeadRatedCard,
  ldBusinessCell,
  ldClientOf,
  ldClientPill,
  ldPeopleOf,
  ldPlaceRowOf,
  ldTalkingDoor,
} from "./name-cell";
import { LEAD_MORE_COLUMNS } from "./more-columns";
import { LeadNotChecked, LeadOutLink, leadMailboxLine, leadPhoneLine } from "./shapes";
import type { LeadCellCtx } from "./types";

/* ------------------------------------------------------------------ the row */

// The row's acts, floating over the row's end under a pointer and on the keyboard's cursor (clients.css), in no column
// of their own: first the one press the row offers, in words (contracts leadRowActOf: Keep, Put back, Add to the
// search's pick, Review, Answer), then Exclude beside Keep, then Call and Copy as glyphs. Keep, Exclude and Put back
// count, so they are the owner's permission `find`, and an add is `approve`: anyone else sees them, in the tab order,
// saying why when pressed (the role gate), never disabled and never silent. Call's ways are the one menu the rows share
// (call-menu.tsx), which the scope draws once: a row holds only its control, and a row whose one press is a call says
// it with that control.
const ROW_ACT_TESTID: Record<LeadRowActKind, string> = {
  keep: "lead-keep",
  put_back: "lead-put-back",
  add: "lead-add",
  pick: "lead-add",
  open: "lead-open",
  call: "lead-call",
};

/** What a press of the row's one act does, by its kind: the review's own doors, the add, or the lead's sheet. */
const pressRowAct = (kind: LeadRowActKind, id: string, x: LeadCellCtx): void => {
  if (kind === "keep") x.onKeep(id);
  else if (kind === "put_back") x.onPutBack(id);
  else if (kind === "add") x.onAdd(id);
  else x.onOpen(id);
};

/**
 * Whether the row's one act is this member's to do from the keyboard: the roles its button's gate asks (gateRowAct),
 * so A on the cursor is no way round one. Opening the lead and calling it ask none.
 */
export const mayRowAct = (kind: LeadRowActKind, canFind: boolean): boolean =>
  kind === "keep" || kind === "put_back" ? canFind : kind === "add" ? canDo("approve") : true;

/** The role gate of the row's one act: a member who may not press it is told why at the press. */
const gateRowAct = (kind: LeadRowActKind, canFind: boolean) =>
  kind === "keep"
    ? canFind
      ? {}
      : gate("find", "keep this lead")
    : kind === "put_back"
      ? canFind
        ? {}
        : gate("find", "put this lead back")
      : kind === "add"
        ? gate("approve", "add this lead to a sequence")
        : {};

const LeadRowActions = ({ l, x }: { l: LeadRowVM; x: LeadCellCtx }) => {
  const place = l.cls === "excluded" ? null : (leadDtoFor(l.id)?.place ?? null);
  const act = leadRowActOf(l, place, x.pickName ? { name: x.pickName } : null);
  return (
    <span className="cl-row-actions ld-row-actions">
      {act && act.kind !== "call" && (
        <button
          type="button"
          className="btn btn-ghost btn-sm ld-row-act"
          // An add names its sequence, which the row's end may cut: its whole words are its tip.
          data-tip={act.kind === "add" ? act.label : undefined}
          onClick={(e) => {
            e.stopPropagation();
            pressRowAct(act.kind, l.id, x);
          }}
          data-testid={ROW_ACT_TESTID[act.kind]}
          {...gateRowAct(act.kind, x.canFind)}
        >
          <span className="ld-row-act-words">{act.label}</span>
        </button>
      )}
      {l.cls === "review" && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            x.onExclude(l.id);
          }}
          data-testid="lead-exclude"
          {...(x.canFind ? {} : gate("find", "exclude this lead"))}
        >
          {LEAD_REVIEW_ACT_WORDS.exclude}
        </button>
      )}
      {l.phone && !l.phoneWrong && <LeadRowCall l={l} handle={x.callMenu} />}
      {l.email && l.emailState !== "invalid" && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            x.onCopy(l.id);
          }}
          title="Copy the email"
          aria-label={`Copy the email for ${l.name}`}
          data-testid="lead-copy"
        >
          <Icon name="copy" size={11} />
        </button>
      )}
    </span>
  );
};

/**
 * Where the lead stands, said once (contracts leadStatusOf): one word in its tone, and the line under it. It stood as
 * its stage, its place in a sequence and that place's line on one row with nothing between them, "Not contacted" run
 * into "Not planned", past the column's edge (5 Nov 2026). A client is the door to that person, and Talking the door
 * to whom it is talking with, as the name's tag was. Not contacted, the default, is said quietly, so the rows a tone
 * marks are the ones that need you.
 */
const stageCell = (l: LeadRowVM, x: LeadCellCtx) => {
  // What the read holds of the lead beside its row: its place in a sequence, and when it was contacted.
  const read = l.cls === "excluded" ? null : leadDtoFor(l.id);
  const said = leadStatusOf(
    { ...l, contactedAt: read?.contacted_at ?? null },
    read?.place ?? null,
    { tz: reachOuts.zone(), nowMs: Date.now() },
    x.grouped,
  );
  const client = ldClientOf(l, x);
  const word = client ? (
    ldClientPill(l, x)
  ) : said.by === "stage" && l.state === "talking" ? (
    ldTalkingDoor(l, x, { kind: "lead_stage", value: l.stage, label: l.stageLabel, testid: "lead-status", named: true })
  ) : said.tone === "quiet" ? (
    <span className="dim" data-testid="lead-status">
      {said.word}
    </span>
  ) : (
    <StatePill kind="tone" value={said.tone} label={said.word} testid="lead-status" />
  );
  return (
    <td key="stage" className="ld-stage-cell" data-testid="lead-stage">
      <CellLines top={word} sub={client ? null : said.line} />
    </td>
  );
};

/**
 * How to reach them, read without a press: the number over the address (shapes.tsx LeadReachLine). Two circles stood
 * here, and a Values button drew what they stood for, in a column they then ran out of. Each line is left open: its
 * control cuts its own words, and its ring and its tip are not clipped with them.
 */
const reachCell = (l: LeadRowVM, x: LeadCellCtx) => (
  <td key="reach" className="ld-reach-cell" data-testid="lead-reach">
    {l.cls === "excluded" ? (
      <LeadNotChecked />
    ) : (
      <CellLines open top={leadPhoneLine(l, x)} sub={leadMailboxLine(l, x)} />
    )}
  </td>
);

/**
 * How many rated, under the score: the count, then its noun apart (contracts' words open on the count: "1,284
 * reviews"), so a table at its compact height keeps the number whole and lets the noun go, the heading being Rated.
 * Words that do not open on the count are said as they are.
 */
const ratedSub = (rated: NonNullable<LeadRowVM["rated"]>) =>
  rated.reviews.startsWith(rated.count) ? (
    <>
      {rated.count}
      <span className="ld-rated-noun">{rated.reviews.slice(rated.count.length)}</span>
    </>
  ) : (
    rated.reviews
  );

// Every one of Leads' sorts is the server's (leads_page). A first press puts first what a member sorts by that column
// for: A to Z, the queue, the best rated, the newest, the best fit, the nearest. They all went "the most first", so a press
// on Business read Z to A, on Fit the long shots, and on Distance the leads with none (6 Nov 2026). Business and Stage head
// the Columns menu; every other column stands under its group's heading there.
export const LEAD_COLUMNS: readonly DataColumn<LeadRowVM, LeadCellCtx, ColCtx>[] = [
  {
    key: "business",
    label: "Business",
    sort: { first: "asc" },
    fill: true,
    // Its own width while Stage takes the room, and its least before the table scrolls sideways (kit/table/widths.ts).
    width: { base: 344, min: 264, max: 640 },
    cell: ldBusinessCell,
  },
  // Beside the name (Reach out Part 6, H8), on by default since 5 Nov 2026: where the lead stands, by its place in a
  // sequence where it has one (the one reader: 00459 sequence_places_of), else by its own stage. It takes the room the
  // others leave: its line is the one a narrow width cuts.
  {
    key: "stage",
    label: "Stage",
    // The queue (00552): the first press walks what needs you first.
    sort: { first: "asc" },
    takes: true,
    width: { base: 220, min: 180, max: 520 },
    cell: stageCell,
  },
  {
    key: "reach",
    label: "Reach",
    group: LEAD_COLUMN_GROUPS.reach,
    hint: "A half circle is an address not confirmed; a line through is a number marked wrong",
    width: { base: 208, min: 160, max: 280 },
    cell: reachCell,
  },
  {
    key: "rating",
    label: "Rated",
    group: LEAD_COLUMN_GROUPS.good,
    hint: LEAD_RATED_HINT,
    sort: { first: "desc" },
    align: "end",
    width: { base: 92, min: 76 },
    cell: (l) => (
      <LeadHover
        as="td"
        key="rating"
        className="ld-rated-cell ld-hover"
        data-testid="lead-rated"
        card={l.rated && l.spread ? <LeadRatedCard l={l} /> : null}
      >
        {l.rated ? (
          <CellLines end top={<span className="ld-rated-score">{l.rated.score}</span>} sub={ratedSub(l.rated)} />
        ) : null}
      </LeadHover>
    ),
  },
  {
    key: "found",
    label: "Found",
    group: LEAD_COLUMN_GROUPS.from,
    sort: { first: "desc" },
    align: "end",
    width: { base: 72, min: 56 },
    cell: (l) => (
      <td
        key="found"
        className="dim ld-found-cell ld-hover"
        data-testid="lead-found"
        onMouseEnter={ldPlacePop}
        onFocus={ldPlacePop}
      >
        <CellLines
          end
          top={
            <span tabIndex={0} aria-describedby={`${l.id}-found-tip`}>
              {l.foundLabel}
            </span>
          }
        />
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
    group: LEAD_COLUMN_GROUPS.good,
    sort: { first: "asc" },
    // The band's fit (D5) is a filter on this column, which the read narrows by (lead_view_rows).
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
    group: LEAD_COLUMN_GROUPS.good,
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
    group: LEAD_COLUMN_GROUPS.where,
    sort: { first: "asc" },
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
    group: LEAD_COLUMN_GROUPS.from,
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
    group: LEAD_COLUMN_GROUPS.reach,
    width: { base: 170, min: 120, max: 280 },
    on: false,
    cell: (l) => (
      <td key="website" className="dim cl-cut ld-website-cell">
        {l.card.site ? <LeadOutLink href={l.card.site.href}>{l.host}</LeadOutLink> : null}
      </td>
    ),
  },
  {
    key: "search",
    label: "Search",
    group: LEAD_COLUMN_GROUPS.from,
    width: { base: 150, min: 108, max: 260 },
    on: false,
    cell: (l) => (
      <td key="search" className="dim cl-cut ld-search-cell">
        {l.searchName}
      </td>
    ),
  },
  ...LEAD_MORE_COLUMNS,
  // The row's acts, where the eye ends: under a pointer and on the keyboard's cursor (clients.css shows .cl-row-actions
  // then). They take no column: the cell is the row's own right gutter, and the acts float in from it over the row's
  // end, where 84px stood empty at rest and the columns turned off slid under it (5 Nov 2026).
  {
    key: "actions",
    label: "",
    width: { base: ROW_ACTS_PX },
    fixed: true,
    cell: (l, x) => (
      <td key="actions" className="cl-actions-cell">
        <LeadRowActions l={l} x={x} />
      </td>
    ),
  },
  // The page's narrowings the table holds and the read applies (lead_view_rows, the one rule): the Excluded view's
  // chip (a criterion's key), the Filter (a checked email, a checked phone, or both) and the status groups (00552).
  { key: "f_excluded", label: "", hidden: true },
  { key: "f_reach", label: "", hidden: true },
  { key: "f_status", label: "", hidden: true },
];

/* --------------------------------------------------------- a view from before */

/** The cells a saved view of Leads was made for: 2 since each says two lines (5 Nov 2026); one from before has none. */
const LEAD_CELLS = 2;
/** The page's own key in its view (kit/table/state.ts `extraDefaults`): written with the first change a member makes. */
export const LEAD_VIEW_EXTRA: View = { cells: LEAD_CELLS };

/**
 * A view saved before the cells said two lines, read as they are now: its widths go, since they were dragged to fit
 * cells that ran together (a Stage at 432px that still ran past its edge), and Fit and Why it fits go back off, since
 * they were turned on to say what Stage and the name's card say. Its sort, its order, its other columns and its rail
 * row are kept. A view saved since is the member's, whole.
 */
export const leadViewNow = (saved: View): View => {
  if (saved.cells === LEAD_CELLS) return saved;
  const kept: View = { ...saved };
  delete kept.widths;
  const columns = kept.columns;
  if (columns && typeof columns === "object" && !Array.isArray(columns)) {
    const choices: Record<string, unknown> = { ...(columns as Record<string, unknown>) };
    delete choices.fit;
    delete choices.why;
    kept.columns = choices;
  }
  return kept;
};

/* --------------------------------------------------------------- the phone */

// A lead's row on a phone is People's (plRowCard; the phone pass, D8), so the two scopes are one list to the eye: the
// business's mark or the listing's photo on its initials, its name and its state (none for Ready, the silent default);
// where it is, or what it waits on, or what left it out; and how it is rated and when it was found. Call is the lead's
// own page's first button -- the row opens it -- and C on a keyboard: a 44px Call on every card made Leads' rows a second
// kind of list.
const ldCardCell = (l: LeadRowVM, x: LeadCellCtx, pick?: RowPick) => {
  // Needs review on a phone (Ruben, 25 Sep): a thumb slides the row -- right to keep, left to exclude, the bell's way (the
  // shell's touchSwipe) -- over the act's word. The doors are the cell context's, the same the bench and the bar press; a
  // member who may not find leads gets no slide.
  const slides = l.cls === "review" && !!(x && x.canFind) && hasTouchSwipe();
  const W = LEAD_REVIEW_ACT_WORDS;
  // One status (the phone walk of 3 Nov 2026): a lead in a sequence wears its place there, "Waits for your OK" in amber,
  // and its line says the step and the sequence; "New" beside "Waits for your OK" read as two answers to one question.
  const place = ldPlaceRowOf(l);
  return plRowCard({
    face: { initials: l.tile.initials, image: l.tile.image, mark: l.tile.logo },
    pick,
    name: l.name,
    // Ready is the silent default (lead-row.ts stateTag) and wears nothing here either: "Not contacted" on nearly every
    // row took a hundred pixels from the names (the phone pass, 3 Nov 2026).
    pill: ldClientOf(l, x) ? (
      <StatePill kind="deal" value="won" testid="lead-state" />
    ) : place ? (
      <StatePill kind="tone" value={place.tone} label={place.word} testid="lead-state" />
    ) : l.state === "ready" ? null : (
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
          : (place && place.line) || l.waitsOn || ldPeopleOf(l, x)?.line || l.sub,
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
    // How a phone and a mailbox reach it is the lead's own page's to say: two unlabelled circles here read as nothing to
    // a first look (the phone pass, 3 Nov 2026). Its rating and when it was found stay.
    facts: [
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
