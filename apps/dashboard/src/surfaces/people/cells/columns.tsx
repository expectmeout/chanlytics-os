/**
 * The table, drawn from its columns (moved whole from legacy/pages/people.jsx, decision 0015). Each column is defined
 * once: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn from a row and what the
 * page knows (`x`: bookingLink, attention, onOpen, drop, listsOf, shows). Person is pinned and always shown; on a desktop
 * a member shows or hides any other with the Columns menu, and the choice rides with their view (views.people.columns); a
 * phone's cards draw what they draw by default whatever the choice (plShownColumns). With a calendar connected the
 * visit is a column; the receptionist's standing is a column a member can show, off by default (Ruben, 8 Oct 2026), and
 * while it is hidden its word sits beside the state. Offers is the fact that gates every campaign. The next step is a
 * column after State (0007). First contact waits in the Columns menu; the last column is the row's own actions, the
 * kit's quiet buttons, shown on hover and on the keyboard's row. Every cell is one of the kit's shapes: a state is the
 * pill's dot and word, a fact two quiet lines, an act a button.
 */
import {
  appointmentWords,
  businessTrailOf,
  heldWords,
  isIdentifierName,
  rowReachWords,
  stopToldBesideState,
  type PersonRowVM,
  type SeenReading,
} from "@chanlytics/contracts";
import { carryReply } from "../../inbox/carried-reply";
import { navigate } from "../../legacy-verbs";
import { unreadHere } from "../../seen";
import { VisitState } from "../../visit-line";
import { visitWordHere } from "../../workspace-word";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import type { PeopleCellCtx, RowPick, TableColumn } from "../types";
import { offersOf, plReceptMark, plReceptSaysTheState, plVisitStart, plWhen } from "../words";
import { plRowCard } from "./row-card";
import { plCallsSort, plLastSort, plNameSort, plNextSort, plOffersSort, plStateSort, plVisitsSort } from "./sorts";

/** The person's state as the one pill draws it (contracts/tone.ts). */
function PeopleStatePill({ state, label }: { state: string; label: string }) {
  return <StatePill kind="person" value={state} label={label} />;
}

/**
 * The row's own next steps, on hover: the thread, and the booking link when there is one -- carried into the thread's
 * composer where free text can go on the wire they last wrote on (a text, an email, WhatsApp inside its 24-hour window),
 * and where it cannot the thread offers the approved message (contracts bookingLinkAction, over the row's reply wire).
 * Nothing is sent from the row. With a list kept by hand open, the row also takes the person off it (`drop`): the one
 * thing the Lists page could do that this table could not.
 */
function PeopleRowActions({
  p,
  bookingLink,
  drop = null,
}: {
  p: PersonRowVM;
  bookingLink: string | null;
  drop?: PeopleCellCtx["drop"];
}) {
  if (!p.threadId && !drop) return null;
  const open = () => navigate(`inbox/${p.threadId}`);
  const link = () => {
    if (p.threadId && p.bookingLinkAction.ready && bookingLink)
      carryReply(p.threadId, appointmentWords(visitWordHere()).bookingLink(bookingLink));
    open();
  };
  return (
    <span className="cl-row-actions" role="presentation" onClick={(e) => e.stopPropagation()}>
      {p.threadId && (
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label="Open the thread"
          data-tip="Open the thread"
          onClick={open}
          data-testid="row-open-thread"
        >
          <Icon name="chat" size={12} />
        </Button>
      )}
      {/* The link goes into the thread's composer: the send glyph says so; the calendar's is the visit's own door. Not
          drawn for someone who asked to stop: the act is not offered (contracts bookingLinkAction). */}
      {p.threadId && bookingLink && p.bookingLinkAction.offered && (
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={p.bookingLinkAction.label}
          data-tip={p.bookingLinkAction.title}
          onClick={link}
          data-testid="row-booking-link"
        >
          <Icon name="send" size={12} />
        </Button>
      )}
      {drop && (
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label={`Take ${p.name} off ${drop.list.name}`}
          data-tip={`Take ${p.name} off ${drop.list.name}`}
          onClick={() => drop.onDrop(p)}
          data-testid="row-drop-list"
        >
          <Icon name="x" size={11} />
        </Button>
      )}
    </span>
  );
}

/**
 * The identity cell: who, on which wires, since when, and their last words. Who they are and what they last said: two
 * lines. The number and the channels are Reach, a column of their own; when they first wrote is First contact, a column of
 * its own; their WhatsApp name is the name's tip; the counts are the profile's.
 */
/**
 * Whether a person is new to the reader now: what the last read said of them (contracts isUnseen), over what this tab
 * did since, or a note about them the bell still holds unread (surfaces/seen.ts). The Inbox's unread, on People's row.
 */
const plUnread = (p: PersonRowVM): boolean =>
  unreadHere({ personId: p.id, conversationId: p.conversationId }, plReading(p));

/** What a person's row said of its reader at its last read: new or not, when they last wrote or called, the mark's stamp. */
export const plReading = (p: PersonRowVM): SeenReading => ({
  unseen: !!p.unseen,
  heardAtMs: p.askedMs ?? 0,
  markAtMs: p.markAtMs ?? 0,
});

export const plNameCell = (
  p: PersonRowVM,
  /**
   * `unread`: the person is new to the reader (plUnread), which People's own list says. The Pipeline draws this cell
   * too, over rows that are not drawn again as the reader's marks move, and says nothing of it.
   */
  {
    attention,
    onOpen,
    unread = false,
    stopMark = false,
  }: Pick<PeopleCellCtx, "attention" | "onOpen"> & { unread?: boolean; stopMark?: boolean },
  said?: string | null,
  /** The row it is drawn on, where that is not the person's own id (the Pipeline's further deal, 0029). */
  rowId?: string,
) => {
  // Named by an identifier, a number or an address (isIdentifierName, the one test): nobody has named them yet.
  const numbered = isIdentifierName(p.name);
  // Their words, or what they said on the phone, as the attention strip says them: a row in Needs you said neither, and
  // gave no reason for the state either. A table that has its own line for the row (the Pipeline's deal, in Glass) says it.
  const words = said === undefined ? attentionWordsOf(p, attention) : said;
  return (
    <td key="name" className="cl-name-cell pl-pin">
      <div className={unread ? "cl-row-name unread" : "cl-row-name"}>
        <Face size="sm" person={{ name: p.name, initials: p.initials }} />
        <div className="cl-row-name-block">
          <div className="cl-row-fullname">
            {/* Their own name on WhatsApp, where it differs, is the name's tip rather than a third thing on the row. */}
            <span
              className={numbered ? "tabular" : ""}
              title={!numbered && p.waName && p.waName !== p.name ? `${p.waName} on WhatsApp` : undefined}
            >
              {p.name}
            </span>
            {businessTrail(p)}
            {/* The Pipeline's person cell says a stop beside the name (People's own row says it in its State pill). */}
            {stopMark && p.stopped && <StoppedMark className="cl-row-stopped" testid="row-stopped" />}
            {numbered && (
              <button
                className="cl-row-name-them"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(rowId ?? p.id);
                }}
                title="Give them a name on their profile"
                data-testid="row-name-them"
              >
                Name them <Icon name="arrow-right" size={9} />
              </button>
            )}
          </div>
          {words && (
            <div className="cl-row-words" title={words} data-testid="row-words">
              {words}
            </div>
          )}
        </div>
      </div>
    </td>
  );
};

/**
 * The business they work at, dim after their name (0052), which gives way before the name does: never after a stand-in,
 * whose name is the business's already, nor where the business's details were removed.
 */
function businessTrail(p: PersonRowVM) {
  const trail = businessTrailOf(p);
  return trail ? (
    <span className="cl-row-trail" data-testid="row-business">
      · {trail}
    </span>
  ) : null;
}

/** What a row says under the name: their words, or what they said on the phone, as the attention strip says them. */
function attentionWordsOf(p: PersonRowVM, attention: PeopleCellCtx["attention"]): string | null {
  const said = attention && attention[p.id];
  return said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
}

/**
 * The Offers cell reads the OFFERS answer as the kit's pill, in the tone words.ts gives it (a yes the quiet green dot;
 * a no and not asked plain), its tooltip that answer's own history. A yes that cannot be sent now (reach-any.ts
 * canReceive: no number, or no channel the workspace sends an offer on) keeps its word and loses its green, and the tip
 * adds why in the send's own words (contracts heldWords), so the column never promises an audience a send would not reach.
 */
const plOffersCell = (p: PersonRowVM) => {
  const [word, tone] = offersOf(p.consent.marketing);
  const held = p.consent.marketing === "opted_in" && !p.canReceive.offers ? p.whyNot.offers : null;
  return (
    <td
      key="offers"
      className="cl-offers-cell"
      title={held ? `${p.consent.marketingSub} · ${heldWords(held, "marketing")}` : p.consent.marketingSub}
      data-testid="row-offers"
    >
      <StatePill
        kind="tone"
        value={held ? "plain" : tone}
        label={word}
        className={held ? "cl-row-offers cl-row-offers-held" : "cl-row-offers"}
      />
    </td>
  );
};

/**
 * The Visits cell: the next visit (else the last) as the one visit line says it (contracts visitLineOf): its day, its hours,
 * and how it stands beside them when a word has been said or it has ended and nobody has (Kept, Missed, Past). It opens that
 * visit on the Calendar (its panel, where the record has its row; else its day).
 */
const plVisitsCell = (p: PersonRowVM) => {
  const line = p.nextVisitLine ?? p.lastVisitLine;
  return (
    <td
      key="visits"
      className="cl-visits-cell"
      title={p.nextVisit || p.lastVisit || "Never on the calendar"}
      data-testid="row-next-visit"
    >
      {line ? (
        // The visit opens on the Calendar; the row around it opens the person.
        <button
          type="button"
          className="cl-row-visit"
          onClick={(e) => {
            e.stopPropagation();
            if (line.to) navigate(line.to);
          }}
          title={`Open ${line.day} on the Calendar`}
          data-testid="row-visit-open"
        >
          {p.nextVisitLine ? (
            <>
              <span className="cl-row-next">{line.day}</span>
              <span className="dim"> · {plVisitStart(line.time)}</span>
            </>
          ) : (
            <span className="cl-row-last-visit">Last · {line.day}</span>
          )}
          <VisitState
            state={line.state}
            unmarked={line.unmarked}
            className="cl-row-visit-state"
            testid="row-visit-state"
          />
        </button>
      ) : (
        <span className="dim">—</span>
      )}
    </td>
  );
};

/** The State cell: the pill, the receptionist's word beside it (said once), and the reason behind it. */
const plStateCell = (p: PersonRowVM, x: PeopleCellCtx) => (
  <td key="state" className="cl-cut cl-state-cell">
    <PeopleStatePill state={p.state} label={p.stateLabel} />
    {/* A stop the pill does not say: "Needs you" outranks "Opted out", so the pill alone read as a person who can be
        answered (contracts stopToldBesideState). */}
    {stopToldBesideState(p) && <StoppedMark className="cl-row-stopped" testid="row-stopped" />}
    {/* The receptionist's word beside the state, said once. On a desktop the stylesheet hides this one while its own
        column shows (is-in-column); a card draws that column's cell whatever the member chose, so a card hides this
        one wherever Visits does not take the cell's place. */}
    {p.receptionist.tone !== "answering" && !plReceptSaysTheState(p) && (
      <span className={`cl-row-recept-mark${x.shows.receptionist ? " is-in-column" : ""}`} title={p.receptionist.label}>
        {plReceptMark(p)}
      </span>
    )}
    {p.stateDetail && (
      <span className="cl-row-state-detail" title={p.stateDetail} data-testid="row-state-detail">
        {p.stateDetail}
      </span>
    )}
  </td>
);

/**
 * How to reach them (contracts rowReachWords): the wire they last wrote on over the one identifier on it, and under them
 * a line only for an address that stopped accepting mail; every wire and what a reply may be are the tip. Someone named
 * by their number or address says it as their name already, so their cell says the wire alone.
 */
const plReachCell = (p: PersonRowVM) => {
  const words = rowReachWords(p, !isIdentifierName(p.name));
  // A long address is cut with an ellipsis so the column stays narrow (a number never is): its whole rides in the tip.
  const tip = [words.tip, words.id !== null && words.id === p.email ? words.id : null].filter(Boolean).join(" · ");
  return (
    <td key="reach" className="cl-reach-cell" title={tip || undefined} data-testid="row-reach">
      {words.wire || words.id ? (
        <span className="cl-row-reach">
          {words.wire && <span className="cl-row-reach-wire">{words.wire}</span>}
          {words.id && (
            <span className={words.id === p.phone ? "cl-row-reach-id tabular" : "cl-row-reach-id"}>{words.id}</span>
          )}
          {words.may && <span className="cl-row-reach-may">{words.may}</span>}
        </span>
      ) : (
        <span className="dim">—</span>
      )}
    </td>
  );
};

type PeopleColumn = TableColumn<PersonRowVM, PeopleCellCtx>;

/**
 * People's columns, each declared once (types.ts TableColumn): the heading, how it sorts and which way a first press
 * goes, what it asks of the table's room (table/layout.ts: where it starts, the least it is squeezed to, and the share of
 * spare room it takes, if any), and what it says in a file of the people shown. The cell is its own `<td>`; nothing about a
 * column's width is a class on it. Four are on until a member turns them off (Person, State, the next step, the last
 * contact), and the visit joins them where a calendar is connected; the rest wait in the Columns menu.
 */
export const PL_COLUMNS: PeopleColumn[] = [
  {
    key: "name",
    label: "Person",
    sortable: true,
    sortFirst: "asc",
    sortValue: plNameSort,
    pinned: true,
    width: { base: 300, min: 240, max: 560, grow: 3 },
    csv: { head: "Name", cell: (p) => p.name },
    cell: (p, x) => plNameCell(p, plUnread(p) ? { ...x, unread: true } : x),
  },
  {
    key: "state",
    label: "State",
    sortable: true,
    sortValue: plStateSort,
    width: { base: 128, min: 118, max: 240, grow: 1 },
    csv: { head: "State", cell: (p) => p.stateLabel },
    cell: plStateCell,
  },
  // Their next step (0007, amended): the words over its day ("Due today", "Overdue since Mon"), the day in the warn ink
  // once it has come and said in words, never by the colour alone. The Pipeline's row said it; People's did not, and
  // it is the one fact on the row that is the owner's to do. The whole of a step cut short is its tip.
  {
    key: "next",
    label: "Next step",
    sortable: true,
    sortFirst: "asc",
    sortValue: plNextSort,
    hint: "Their next step, and the day it is due",
    width: { base: 140, min: 112, max: 240, grow: 1 },
    csv: { head: "Next step", cell: (p) => (p.nextStep ? [p.nextStep.words, p.nextStep.day.words].join(" · ") : "") },
    cell: (p) => (
      <td
        key="next"
        className="cl-step-cell"
        data-due={p.nextStep ? p.nextStep.due : undefined}
        title={
          p.nextStep
            ? [p.nextStep.words, p.nextStep.day.words, p.nextStep.forWho].filter(Boolean).join(" · ")
            : undefined
        }
        data-testid="row-next-step"
      >
        {p.nextStep ? (
          <span className="cl-row-step">
            <span className="cl-row-step-words">{p.nextStep.words}</span>
            <span className="cl-row-step-when">{p.nextStep.day.words}</span>
          </span>
        ) : null}
      </td>
    ),
  },
  // The wire they last wrote on and the one way to reach them there; off until asked for, since the State cell and the
  // thread's own reply box say what a reply may be (Ruben, 9 Oct 2026).
  {
    key: "reach",
    label: "Reach",
    sortable: false,
    on: false,
    hint: "The wire they last wrote on, and how to reach them there",
    width: { base: 150, min: 124, max: 260, grow: 1 },
    csv: { head: "Reach", cell: (p) => rowReachWords(p, !isIdentifierName(p.name)).wire ?? "" },
    cell: plReachCell,
  },
  // When over who: the column the table is sorted by reads by its time, and the speaker sits under it.
  {
    key: "last",
    label: "Last contact",
    sortable: true,
    sortValue: plLastSort,
    hint: "When you last spoke, and who spoke",
    width: { base: 124, min: 112, max: 240, grow: 1 },
    csv: { head: "Last contact", cell: (p) => p.lastContact.label },
    cell: (p) => (
      <td key="last" className="dim cl-last-cell" title={plWhen(p.lastContact.at)}>
        <span className="cl-row-last">
          <span className="cl-row-last-when">{p.lastContact.when || p.lastContact.by}</span>
          {p.lastContact.when && <span className="cl-row-last-by">{p.lastContact.by}</span>}
        </span>
      </td>
    ),
  },
  {
    key: "visits",
    label: "Appointments",
    // The workspace's word for an appointment, as Campaigns says it (decision 0041): "Meetings", "Sessions",
    // "Appointments".
    labelOf: (x) => appointmentWords(x.word ?? "appointment").Many,
    sortable: true,
    sortFirst: "asc",
    sortValue: plVisitsSort,
    needs: (x) => !!x.withCalendar,
    width: { base: 144, min: 120, max: 240, grow: 1 },
    csv: {
      head: "Next appointment",
      headOf: (x) => appointmentWords(x.word ?? "appointment").next,
      cell: (p) => p.nextVisit || "",
    },
    cell: plVisitsCell,
  },
  // The receptionist's standing as the one pill (tone.ts, standing), off until asked for: "Answering" on every row said
  // nothing, and the State cell says the exception beside its pill while this column is hidden.
  {
    key: "receptionist",
    label: "Receptionist",
    sortable: false,
    on: false,
    hint: "Whether the receptionist is answering them",
    width: { base: 124, min: 108, max: 200, grow: 0.5 },
    csv: { head: "Receptionist", cell: (p) => p.receptionist.label },
    cell: (p) => (
      <td key="receptionist" className="cl-recept-cell">
        <StatePill kind="standing" value={p.receptionist.tone} label={p.receptionist.label} testid="row-receptionist" />
      </td>
    ),
  },
  // Whether they said yes to offers and news: the fact that gates every campaign, and so a column a member asks for (an
  // export carries the consent whether it shows or not).
  {
    key: "offers",
    label: "Offers",
    sortable: true,
    sortFirst: "asc",
    sortValue: plOffersSort,
    on: false,
    hint: "Whether they said yes to offers and news",
    width: { base: 108, min: 96, max: 180, grow: 0.5 },
    csv: { head: "Offers", cell: (p) => offersOf(p.consent.marketing)[0] },
    cell: plOffersCell,
  },
  // Where they first came from: people_list's came_from, in contracts' words; nothing when nothing says. It is
  // the Columns menu's to show (canvas P1 keeps it there): with it the table was wider than the pane at 1440.
  {
    key: "came_from",
    label: "Came from",
    sortable: false,
    on: false,
    hint: "Where they first came from",
    width: { base: 120, min: 88, max: 220, grow: 1 },
    csv: { head: "Came from", cell: (p) => (p.cameFrom ? p.cameFrom.label : "") },
    cell: (p) => (
      <td key="came_from" className="dim cl-cut cl-came-cell" data-testid="row-came-from">
        {p.cameFrom ? p.cameFrom.label : ""}
      </td>
    ),
  },
  // When they first wrote, off until asked for: it was "since Aug 26" on every row, true and seldom why anyone opens People.
  {
    key: "since",
    label: "First contact",
    sortable: false,
    on: false,
    hint: "When they first wrote or phoned",
    width: { base: 124, min: 108, max: 200, grow: 0.5 },
    csv: { head: "First contact", cell: (p) => (p.firstContact.label !== "—" ? p.firstContact.label : "") },
    cell: (p) => (
      <td
        key="since"
        className="dim cl-cut cl-since-cell"
        data-testid="row-since"
        title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : undefined}
      >
        {p.firstContact.label !== "—" ? p.firstContact.label : ""}
      </td>
    ),
  },
  // Their number on its own: Reach says it only beside the wire they last wrote on, and a number is the fact an owner
  // copies. A long address is cut with an ellipsis in its own cell, its whole in the tip.
  {
    key: "phone",
    label: "Phone",
    sortable: false,
    on: false,
    width: { base: 152, min: 136, max: 220, grow: 0.5 },
    csv: { head: "Phone", cell: (p) => p.phone || "" },
    cell: (p) => (
      <td key="phone" className="dim cl-cut tabular cl-phone-cell" title={p.phone || undefined} data-testid="row-phone">
        {p.phone || ""}
      </td>
    ),
  },
  {
    key: "email",
    label: "Email",
    sortable: false,
    on: false,
    width: { base: 220, min: 140, max: 360, grow: 1 },
    csv: { head: "Email", cell: (p) => p.email || "" },
    cell: (p) => (
      <td key="email" className="dim cl-cut cl-email-cell" title={p.email || undefined} data-testid="row-email">
        {p.email || ""}
      </td>
    ),
  },
  // How many times they have called, as a number against the column's right edge with its heading.
  {
    key: "calls",
    label: "Calls",
    sortable: true,
    sortValue: plCallsSort,
    on: false,
    align: "end",
    hint: "How many calls you have had with them",
    width: { base: 84, min: 72 },
    csv: { head: "Calls", cell: (p) => String(p.calls) },
    cell: (p) => (
      <td key="calls" className="dim num cl-calls-cell" data-testid="row-calls">
        {p.calls > 0 ? p.calls : ""}
      </td>
    ),
  },
  {
    key: "lists",
    label: "Lists",
    sortable: false,
    on: false,
    width: { base: 180, min: 108, max: 320, grow: 1 },
    cell: (p, x) => {
      const names = (x.listsOf[p.id] || []).join(", ");
      return (
        <td key="lists" className="dim cl-cut cl-lists-cell" title={names || undefined} data-testid="row-lists">
          {names}
        </td>
      );
    },
  },
  // The deal's stage as the one pill (0004), off until asked for: every workspace has deals (0008, amended 18 Oct
  // 2026). The row's second line already says a proposal waiting.
  {
    key: "deal",
    label: "Deal",
    sortable: false,
    on: false,
    width: { base: 130, min: 96 },
    csv: { head: "Deal", cell: (p) => (p.deal ? p.deal.stage : "") },
    cell: (p) => (
      <td key="deal" className="cl-deal-cell" data-testid="row-deal">
        {/* A pill per stage their open deals stand at (0029): a client with a proposal out for another service is both. */}
        {(p.openDeals.length ? [...new Set(p.openDeals.map((d) => d.stage))] : p.deal ? [p.deal.stage] : []).map(
          (s) => (
            <StatePill key={s} kind="deal" value={s} />
          ),
        )}
      </td>
    ),
  },
  {
    key: "actions",
    label: "",
    sortable: false,
    fixed: true,
    width: { base: 84 },
    cell: (p, x) => (
      <td key="actions" className="cl-actions-cell">
        <PeopleRowActions p={p} bookingLink={x.bookingLink} drop={x.drop} />
      </td>
    ),
  },
];

/**
 * A person on a phone, in one cell (900px and under): the Inbox's row. Their face, their name and their state on the
 * first line; on the second, why they need a person when they do, else their own last words; on the third, when they are
 * coming and when you last spoke. The desktop's columns say the same things; a phone says them once, in this order, and
 * leaves the answer to offers, the receptionist's word, where they came from and their lists to their page, one tap away.
 */
const plCardCell = (p: PersonRowVM, { attention }: Pick<PeopleCellCtx, "attention">, pick?: RowPick) => {
  const words = attentionWordsOf(p, attention);
  const asks = p.state === "needs_you" || p.state === "waiting_on_you";
  const line = p.nextVisitLine;
  return plRowCard({
    face: { person: { name: p.name, initials: p.initials } },
    pick,
    name: businessTrailOf(p) ? (
      <>
        {p.name} {businessTrail(p)}
      </>
    ) : (
      p.name
    ),
    unread: plUnread(p),
    numeric: isIdentifierName(p.name),
    pill: <PeopleStatePill state={p.state} label={p.stateLabel} />,
    lead: asks && p.stateDetail ? p.stateDetail : words,
    leadTestid: asks && p.stateDetail ? "row-state-detail" : "row-words",
    facts: [
      // A stop the pill does not say (the State cell's, on a desktop): the first of the card's facts.
      stopToldBesideState(p) ? <StoppedMark key="stopped" testid="row-stopped" /> : null,
      line ? (
        <span key="visit" className="pl-card-visit" data-testid="row-next-visit">
          <Icon name="calendar" size={11} />
          {[line.day, line.time, line.state ? line.state.text : ""].filter(Boolean).join(" · ")}
        </span>
      ) : null,
      <span key="last" className="pl-card-last">
        {p.lastContact.label}
      </span>,
    ],
  });
};
/** A phone's one column, and the class its rows wear (clients.css draws the row from it). */
export const PL_PHONE_COLUMNS: PeopleColumn[] = [
  { key: "card", label: "Person", sortable: false, pinned: true, cell: plCardCell },
];
export const plCardRowClass = (): string => "pl-card-row";

/** The columns a file of the people shown follows where the page has no table of its own to follow (the Pipeline's): the ones on by default. */
export const PL_FILE_COLUMNS: readonly PeopleColumn[] = PL_COLUMNS.filter((c) => c.on !== false);
