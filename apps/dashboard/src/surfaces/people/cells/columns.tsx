/**
 * The table, drawn from its columns (moved whole from legacy/pages/people.jsx, decision 0015). Each column is defined
 * once: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn from a row and what the
 * page knows (`x`: bookingLink, attention, onOpen, drop, listsOf, shows). Person is pinned and always shown; on a desktop
 * a member shows or hides any other with the Columns menu, and the choice rides with their view (views.people.columns); a
 * phone's cards draw what they draw by default whatever the choice (plDrawnColumns). With a calendar connected the
 * outcome takes the column the receptionist's state held; the receptionist stays a column a member can show, and while
 * it is hidden its word sits beside the state (and it is hidden by default: Ruben, 8 Oct 2026). Offers is the fact
 * that gates every campaign. The next step is a column after State (0007). First contact waits in the Columns menu; the
 * last column is the row's own actions, the kit's quiet buttons, shown on hover and on the keyboard's row. Every cell is
 * one of the kit's shapes: a state is the pill's dot and word, a fact two quiet lines, an act a button.
 */
import { rowReachWords, type PersonRowVM, type SeenReading } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { unreadHere } from "../../seen";
import { Button } from "../../kit/button/button";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import type { PeopleCellCtx, RowPick, TableColumn } from "../types";
import {
  PL_RECEPT_MARK,
  offersOf,
  plFace,
  plIsAddress,
  plIsNumber,
  plReceptSaysTheState,
  plVisitStart,
  plWhen,
} from "../words";
import { plRowCard } from "./row-card";

/** The person's state as the one pill draws it (contracts/tone.ts). */
function PeopleStatePill({ state, label }: { state: string; label: string }) {
  return <StatePill kind="person" value={state} label={label} />;
}

/**
 * The row's own next steps, on hover: the thread, and the booking link when there is one -- a reply carried in inside the
 * 24-hour window, the template outside it. Nothing is sent from the row. With a list kept by hand open, the row also takes
 * the person off it (`drop`): the one thing the Lists page could do that this table could not.
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
    if (p.bookingLinkAction.ready) {
      try {
        sessionStorage.setItem(
          "chanlytics-compose",
          JSON.stringify({ threadId: p.threadId, text: `Here's the link to book your appointment: ${bookingLink}` }),
        );
      } catch {
        /* nothing to carry */
      }
    }
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
      {/* The link goes into the thread's composer: the send glyph says so; the calendar's is the visit's own door. */}
      {p.threadId && bookingLink && (
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
  { attention, onOpen, unread = false }: Pick<PeopleCellCtx, "attention" | "onOpen"> & { unread?: boolean },
  said?: string | null,
  /** The row it is drawn on, where that is not the person's own id (the Pipeline's further deal, 0029). */
  rowId?: string,
) => {
  // Named by an identifier, a number or an address: nobody has named them yet.
  const byNumber = plIsNumber(p.name);
  const numbered = byNumber || plIsAddress(p);
  // Their words, or what they said on the phone, as the attention strip says them: a row in Needs you said neither, and
  // gave no reason for the state either. A table that has its own line for the row (the Pipeline's deal, in Glass) says it.
  const words = said === undefined ? attentionWordsOf(p, attention) : said;
  return (
    <td key="name" className="cl-name-cell pl-pin">
      <div className={unread ? "cl-row-name unread" : "cl-row-name"}>
        {numbered ? (
          <Face size="sm" glyph={<Icon name={byNumber ? "phone" : "mail"} size={12} />} title="No name yet" />
        ) : (
          <Face size="sm" initials={p.initials} />
        )}
        <div className="cl-row-name-block">
          <div className="cl-row-fullname">
            {/* Their own name on WhatsApp, where it differs, is the name's tip rather than a third thing on the row. */}
            <span
              className={byNumber ? "tabular" : ""}
              title={!numbered && p.waName && p.waName !== p.name ? `${p.waName} on WhatsApp` : undefined}
            >
              {p.name}
            </span>
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

/** What a row says under the name: their words, or what they said on the phone, as the attention strip says them. */
function attentionWordsOf(p: PersonRowVM, attention: PeopleCellCtx["attention"]): string | null {
  const said = attention && attention[p.id];
  return said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
}

/**
 * The Offers cell reads the OFFERS answer as the consent pill (contracts tone.ts: a yes the quiet green dot, a no amber,
 * not asked plain), its tooltip that answer's own history. A yes nobody can be sent (reach-any.ts canReceive: no channel
 * the workspace sends on carries an offer to them now) keeps its word and loses its green, and the tip says why.
 */
const plOffersCell = (p: PersonRowVM) => {
  const offers = offersOf(p.consent.marketing);
  const unsent = p.consent.marketing === "opted_in" && !p.canReceive.offers;
  return (
    <td
      key="offers"
      className="shrink cl-offers-cell"
      title={unsent ? `${p.consent.marketingSub} · no channel can carry an offer to them now` : p.consent.marketingSub}
      data-testid="row-offers"
    >
      <StatePill
        kind="consent"
        value={unsent ? "unknown" : p.consent.marketing}
        label={offers[0]}
        className={`cl-row-offers ${offers[1]}${unsent ? " unsent" : ""}`}
      />
    </td>
  );
};

/** The next visit's hours, as the row's own words give them after the day. */
const visitHours = (p: PersonRowVM): string => (p.nextVisit || "").split(" · ")[1] || "";

/** The Visits cell: the day of the next visit (else the last), which opens its day on the Calendar. */
const plVisitsCell = (p: PersonRowVM) => (
  <td
    key="visits"
    className="shrink cl-visits-cell"
    title={p.nextVisit || p.lastVisit || "Never on the calendar"}
    data-testid="row-next-visit"
  >
    {p.nextVisitDate || p.lastVisitDate ? (
      // The visit opens its day on the Calendar; the row around it opens the person.
      <button
        type="button"
        className="cl-row-visit"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`calendar/${p.nextVisitDate || p.lastVisitDate}`);
        }}
        title={`Open ${p.nextVisitDay || p.lastVisitDay} on the Calendar`}
        data-testid="row-visit-open"
      >
        {p.nextVisitDay ? (
          <>
            <span className="cl-row-next">{p.nextVisitDay}</span>
            <span className="dim"> · {plVisitStart(visitHours(p))}</span>
          </>
        ) : (
          <span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>
        )}
      </button>
    ) : (
      <span className="dim">—</span>
    )}
  </td>
);

/** The State cell: the pill, the receptionist's word beside it (said once), and the reason behind it. */
const plStateCell = (p: PersonRowVM, x: PeopleCellCtx) => (
  <td key="state" className="shrink cl-state-cell">
    <PeopleStatePill state={p.state} label={p.stateLabel} />
    {/* The receptionist's word beside the state, said once. On a desktop the stylesheet hides this one while its own
        column shows (is-in-column); a card draws that column's cell whatever the member chose, so a card hides this
        one wherever Visits does not take the cell's place. */}
    {p.receptionist.tone !== "answering" && !plReceptSaysTheState(p) && (
      <span className={`cl-row-recept-mark${x.shows.receptionist ? " is-in-column" : ""}`} title={p.receptionist.label}>
        {PL_RECEPT_MARK[p.receptionist.tone] || p.receptionist.tone}
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
 * How to reach them (contracts rowReachWords): the wire a reply goes out on over the one identifier on it, and under them
 * what a reply may be only where that is a constraint; every wire and the Replies sentence in the tip. Someone named by
 * their number or address says it as their name already, so their cell says the wire alone.
 */
const plReachCell = (p: PersonRowVM) => {
  const words = rowReachWords(p, !plIsNumber(p.name) && !plIsAddress(p));
  return (
    <td key="reach" className="shrink cl-reach-cell" title={words.tip || undefined} data-testid="row-reach">
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

export const PL_COLUMNS: PeopleColumn[] = [
  {
    key: "name",
    label: "Person",
    sortable: true,
    pinned: true,
    cell: (p, x) => plNameCell(p, plUnread(p) ? { ...x, unread: true } : x),
  },
  { key: "state", label: "State", sortable: true, cell: plStateCell },
  // Their next step (0007, amended): the words, then the day as a chip says it, in the warn ink once it has come. The
  // Pipeline's row said it; People's did not, and it is the one fact on the row that is the owner's to do.
  {
    key: "next",
    label: "Next step",
    sortable: true,
    cell: (p) => (
      <td
        key="next"
        className="shrink cl-next-cell"
        data-due={p.nextStep ? p.nextStep.due : undefined}
        title={
          p.nextStep
            ? [p.nextStep.words, p.nextStep.day.words, p.nextStep.forWho].filter(Boolean).join(" · ")
            : undefined
        }
        data-testid="row-next-step"
      >
        {p.nextStep ? (
          <span className="cl-row-next">
            <span className="cl-row-next-words">{p.nextStep.words}</span>
            <span className="cl-row-next-when">{p.nextStep.day.near}</span>
          </span>
        ) : null}
      </td>
    ),
  },
  { key: "reach", label: "Reach", sortable: false, cell: plReachCell },
  // When over who: the column the table is sorted by reads by its time, and the speaker sits under it.
  {
    key: "last",
    label: "Last contact",
    sortable: true,
    cell: (p) => (
      <td key="last" className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>
        <span className="cl-row-last">
          <span className="cl-row-last-when">{p.lastContact.when || p.lastContact.by}</span>
          {p.lastContact.when && <span className="cl-row-last-by">{p.lastContact.by}</span>}
        </span>
      </td>
    ),
  },
  { key: "visits", label: "Visits", sortable: true, needs: (x) => !!x.withCalendar, cell: plVisitsCell },
  // The receptionist's standing as the one pill (tone.ts, standing), off until asked for: "Answering" on every row said
  // nothing, and the State cell says the exception beside its pill while this column is hidden.
  {
    key: "receptionist",
    label: "Receptionist",
    sortable: false,
    on: false,
    cell: (p) => (
      <td key="receptionist" className="cl-recept-cell">
        <StatePill kind="standing" value={p.receptionist.tone} label={p.receptionist.label} testid="row-receptionist" />
      </td>
    ),
  },
  { key: "offers", label: "Offers", sortable: true, cell: plOffersCell },
  // Where they first came from: people_list's came_from, in contracts' words; nothing when nothing says. It is
  // the Columns menu's to show (canvas P1 keeps it there): with it the table was wider than the pane at 1440.
  {
    key: "came_from",
    label: "Came from",
    sortable: false,
    on: false,
    cell: (p) => (
      <td key="came_from" className="shrink dim cl-came-cell" data-testid="row-came-from">
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
    cell: (p) => (
      <td
        key="since"
        className="shrink dim cl-since-cell"
        data-testid="row-since"
        title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : undefined}
      >
        {p.firstContact.label !== "—" ? p.firstContact.label : ""}
      </td>
    ),
  },
  {
    key: "email",
    label: "Email",
    sortable: false,
    on: false,
    cell: (p) => (
      <td key="email" className="shrink dim cl-email-cell" data-testid="row-email">
        {p.email || ""}
      </td>
    ),
  },
  {
    key: "lists",
    label: "Lists",
    sortable: false,
    on: false,
    cell: (p, x) => (
      <td key="lists" className="dim cl-lists-cell" data-testid="row-lists">
        {(x.listsOf[p.id] || []).join(", ")}
      </td>
    ),
  },
  // The deal's stage as the one pill (0004), off until asked for, and offered only where deals are a thing here: a salon
  // never sees "Deal" in the menu. The row's second line already says a proposal waiting.
  {
    key: "deal",
    label: "Deal",
    sortable: false,
    on: false,
    needs: (x) => !!x.dealsOn,
    cell: (p) => (
      <td key="deal" className="shrink cl-deal-cell" data-testid="row-deal">
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
    cell: (p, x) => (
      <td key="actions" className="shrink cl-actions-cell">
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
  const byNumber = plIsNumber(p.name);
  const words = attentionWordsOf(p, attention);
  const asks = p.state === "needs_you" || p.state === "waiting_on_you";
  const time = p.nextVisitDay ? (p.nextVisit || "").split(" · ")[1] || "" : "";
  return plRowCard({
    face: plFace(p),
    pick,
    name: p.name,
    unread: plUnread(p),
    numeric: byNumber,
    pill: <PeopleStatePill state={p.state} label={p.stateLabel} />,
    lead: asks && p.stateDetail ? p.stateDetail : words,
    leadTestid: asks && p.stateDetail ? "row-state-detail" : "row-words",
    facts: [
      p.nextVisitDay ? (
        <span key="visit" className="pl-card-visit" data-testid="row-next-visit">
          <Icon name="calendar" size={11} />
          {time ? `${p.nextVisitDay} · ${time}` : p.nextVisitDay}
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
