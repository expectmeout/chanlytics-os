/**
 * The table, drawn from its columns (moved whole from legacy/pages/people.jsx, decision 0015). Each column is defined
 * once: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn from a row and what the
 * page knows (`x`: bookingLink, attention, onOpen, drop, listsOf, shows). Person is pinned and always shown; on a desktop
 * a member shows or hides any other with the Columns menu, and the choice rides with their view (views.people.columns); a
 * phone's cards draw what they draw by default whatever the choice (plDrawnColumns). With a calendar connected the
 * outcome takes the column the receptionist's state held; the receptionist stays a column a member can show, and while
 * it is hidden its word sits beside the state. Offers is the fact that gates every campaign. First contact lives in the
 * identity cell; the last column is the row's own actions, shown on hover and on the keyboard's row.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import type { PeopleCellCtx, TableColumn } from "../types";
import { PL_RECEPT_MARK, offersOf, plFace, plIsAddress, plIsNumber, plReceptSaysTheState, plWhen } from "../words";
import { ChannelGlyph } from "./channel-glyph";
import { plRowCard } from "./row-card";

/** The person's state as the one pill draws it (contracts/tone.ts). */
function PeopleStatePill({ state, label }: { state: string; label: string }) {
  return <StatePill kind="person" value={state} label={label} />;
}

function PeopleChannels({ channels }: { channels: readonly string[] }) {
  return (
    <span className="cl-row-channels">
      {/* The wire's own glyph. It was voice -> phone and everything else -> chat, so an email-only person wore WhatsApp's bubble. */}
      {channels.map((ch, i) => (
        <ChannelGlyph key={ch} kind={ch === "voice" ? "phone" : ch} primary={i === 0} size={11} />
      ))}
    </span>
  );
}

function PeopleReceptionist({ r }: { r: PersonRowVM["receptionist"] }) {
  return (
    <span className={`cl-row-agent ${r.tone === "escalated" ? "escalated" : r.tone === "queued" ? "approval" : ""}`}>
      <span className="agent-avatar">W</span>
      {r.tone === "queued" && <span className="live-dot" />}
      <span className="cl-row-agent-verb">{r.label}</span>
    </span>
  );
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
        <button
          className="cl-row-act"
          title="Open the thread"
          aria-label="Open the thread"
          onClick={open}
          data-testid="row-open-thread"
        >
          <Icon name="chat" size={12} />
        </button>
      )}
      {p.threadId && bookingLink && (
        <button
          className="cl-row-act"
          title={p.bookingLinkAction.title}
          aria-label={p.bookingLinkAction.label}
          onClick={link}
          data-testid="row-booking-link"
        >
          <Icon name="calendar" size={12} />
        </button>
      )}
      {drop && (
        <button
          className="cl-row-act cl-row-act-drop"
          title={`Take ${p.name} off ${drop.list.name}`}
          aria-label={`Take ${p.name} off ${drop.list.name}`}
          onClick={() => drop.onDrop(p)}
          data-testid="row-drop-list"
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </span>
  );
}

/**
 * The identity cell: who, on which wires, since when, and their last words. Who they are and what they last said: two
 * lines. The number and the channels are Reach, a column of their own; when they first wrote is First contact, a column of
 * its own; their WhatsApp name is the name's tip; the counts are the profile's.
 */
export const plNameCell = (p: PersonRowVM, { attention, onOpen }: Pick<PeopleCellCtx, "attention" | "onOpen">) => {
  // Named by an identifier, a number or an address: nobody has named them yet.
  const byNumber = plIsNumber(p.name);
  const numbered = byNumber || plIsAddress(p);
  // Their words, or what they said on the phone, as the attention strip says them: a row in Needs you said neither, and
  // gave no reason for the state either.
  const words = attentionWordsOf(p, attention);
  return (
    <td key="name" className="cl-name-cell pl-pin">
      <div className="cl-row-name">
        {numbered ? (
          <div className="ix-thread-avatar cl-row-avatar-glyph" title="No name yet">
            <Icon name={byNumber ? "phone" : "mail"} size={12} />
          </div>
        ) : (
          <div className="ix-thread-avatar">{p.initials}</div>
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
                  onOpen(p.id);
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

/** The Offers cell reads the OFFERS answer, and its tooltip is that answer's own history. */
const plOffersCell = (p: PersonRowVM) => {
  const offers = offersOf(p.consent.marketing);
  return (
    <td key="offers" className="shrink cl-offers-cell" title={p.consent.marketingSub} data-testid="row-offers">
      <span className={`cl-row-offers ${offers[1]}`}>{offers[0]}</span>
    </td>
  );
};

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
            <span className="dim"> · {(p.nextVisit || "").split(" · ")[1] || ""}</span>
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
 * How to reach them: the channels they use, and the number -- or the address when there is no number (a row says one
 * identifier). Someone named only by their number or address says it as their name already, so here only the channels.
 */
const plReachCell = (p: PersonRowVM) => {
  const named = !plIsNumber(p.name) && !plIsAddress(p);
  const id = named ? p.phone || p.email || null : null;
  return (
    <td key="reach" className="shrink cl-reach-cell" data-testid="row-reach">
      <span className="cl-row-reach">
        <PeopleChannels channels={p.channels} />
        {id ? <span className={p.phone ? "tabular" : ""}>{id}</span> : null}
      </span>
    </td>
  );
};

type PeopleColumn = TableColumn<PersonRowVM, PeopleCellCtx>;

export const PL_COLUMNS: PeopleColumn[] = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: plNameCell },
  { key: "state", label: "State", sortable: true, cell: plStateCell },
  { key: "reach", label: "Reach", sortable: false, cell: plReachCell },
  {
    key: "last",
    label: "Last contact",
    sortable: true,
    cell: (p) => (
      <td key="last" className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>
        {p.lastContact.label}
      </td>
    ),
  },
  { key: "visits", label: "Visits", sortable: true, needs: (x) => !!x.withCalendar, cell: plVisitsCell },
  {
    key: "receptionist",
    label: "Receptionist",
    sortable: false,
    on: (x) => !x.withCalendar,
    cell: (p) => (
      <td key="receptionist" className="cl-recept-cell">
        <PeopleReceptionist r={p.receptionist} />
      </td>
    ),
  },
  { key: "offers", label: "Offers", sortable: true, cell: plOffersCell },
  // Where they first came from: people_list's came_from, in contracts' words; nothing when nothing says.
  {
    key: "came_from",
    label: "Came from",
    sortable: false,
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
        {p.deal ? <StatePill kind="deal" value={p.deal.stage} /> : ""}
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
const plCardCell = (p: PersonRowVM, { attention }: Pick<PeopleCellCtx, "attention">) => {
  const byNumber = plIsNumber(p.name);
  const words = attentionWordsOf(p, attention);
  const asks = p.state === "needs_you" || p.state === "waiting_on_you";
  const time = p.nextVisitDay ? (p.nextVisit || "").split(" · ")[1] || "" : "";
  return plRowCard({
    face: plFace(p),
    name: p.name,
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
