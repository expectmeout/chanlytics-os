/**
 * The pile's card (the lead workbench, canvas B v2's decide card): the lead that is up, in the order a decision wants it.
 * Who they are; the reason to write now, in large type, and the marks it rests on (seen, read by Claude, couldn't tell);
 * whether they can be reached; and the first email they would get from the sequence the adds go to, filled with their
 * values by the send's own fill, the opening drawn as still to come. Where Add would come to nothing the card says why
 * before it is pressed. A desk draws it in the pile's place, a phone in the pile's sheet at half height.
 *
 * Hookless: `leadCardFor` reads the lead's peek view model and its record from the page's surface once a draw. Every word
 * is contracts' (lead-card.ts); a mark's source is its tip (the house's `data-tip`), and written out on Why.
 */
import {
  LEAD_CARD_WORDS,
  leadCardEmailOf,
  leadCardMarksOf,
  leadCardReasonOf,
  leadCardSlotsOf,
  leadCardStepsOf,
  type LeadCardCheck,
  type LeadCardEmailVM,
  type LeadCardLead,
  type LeadCardMarkVM,
  type LeadCardPart,
  type LeadCardReasonVM,
  type LeadCardSlotVM,
  type LeadCardStepVM,
  type LeadPeekVM,
  type LeadRowVM,
  type ReachOutChainDto,
} from "@chanlytics/contracts";
import { tplOwn } from "../../campaigns/templates/words";
import { LeadSlotShape } from "../cells/shapes";
import { LeadTile } from "../cells/tile";
import { ldCheckMark } from "../peek/hint";
import { leadDtoFor, peekVMFor } from "../surface";

/** What the card draws for the lead that is up, and what its tabs read. */
export interface LeadCardFacts {
  peek: LeadPeekVM | null;
  reason: LeadCardReasonVM | null;
  marks: LeadCardMarkVM[];
  /** Email 1 of the sequence the adds go to; null on a first pile (none yet) or before the lead's record is in. */
  email: LeadCardEmailVM | null;
  steps: LeadCardStepVM[];
  /** What fills their words, each with where it came from: the Emails tab's list. */
  slots: LeadCardSlotVM[];
  /** The adds go to a list of the pile's own, written to at the end: its email is written then. */
  firstPile: boolean;
}

/** The workspace's slots, as Templates holds them. */
export const leadCardWorkspace = () => {
  const own = tplOwn();
  return { businessName: own.business_name, bookingLink: own.booking_link };
};

/** What the card knows of a lead for its emails: its record's slots, its address, and the other ways to them. */
function leadCardLeadOf(leadId: string): LeadCardLead | null {
  const peek = peekVMFor(leadId);
  const dto = leadDtoFor(leadId);
  if (!dto) return null;
  return {
    business_name: dto.business_name,
    city: dto.city,
    kind: dto.kind ?? null,
    facts: dto.facts ?? null,
    to: peek ? peek.reach.email.address : dto.email,
    emailState: dto.email_state,
    canCall: !!(peek && peek.reach.phone && peek.reach.phone.tel),
    canChoose: !!(peek && peek.company && peek.company.people.length > 1),
  };
}

/**
 * The card's facts for the lead that is up: its peek view model and record (surface.ts), the target's emails, and the
 * add door's answer for it (use-pile.ts checkOf: absent until it has answered).
 */
export function leadCardFor(
  up: LeadRowVM,
  chain: ReachOutChainDto | null,
  tz: string,
  check: LeadCardCheck | undefined,
): LeadCardFacts {
  const peek = peekVMFor(up.id);
  const lead = leadCardLeadOf(up.id);
  const workspace = leadCardWorkspace();
  return {
    peek,
    reason: peek ? leadCardReasonOf(peek) : null,
    marks: peek ? leadCardMarksOf(peek) : [],
    email: chain && lead ? leadCardEmailOf({ chain, lead, workspace, nowMs: Date.now(), tz, check }) : null,
    steps: chain && lead ? leadCardStepsOf({ chain, lead, workspace }) : [],
    slots: chain && lead ? leadCardSlotsOf({ chain, lead, workspace }) : [],
    firstPile: !chain,
  };
}

/** The bulk Add's leads (contracts leadCardBulkOf): each open lead as the card knows it, with the door's answer. */
export const leadCardBulkLeadsOf = (rows: readonly LeadRowVM[], checkOf: (id: string) => LeadCardCheck | undefined) =>
  rows.flatMap((r) => {
    const lead = leadCardLeadOf(r.id);
    return lead ? [{ id: r.id, lead, check: checkOf(r.id) }] : [];
  });

/** An email's words in parts: words, the opening still to come (a dashed line saying so), a slot with no value. */
export const LeadCardParts = ({ parts }: { parts: LeadCardPart[] }) => (
  <>
    {parts.map((p, i) =>
      p.kind === "text" ? (
        <span key={i}>{p.text}</span>
      ) : p.kind === "opening" ? (
        <span key={i} className="ld-now-opening" data-testid="lead-card-opening">
          {LEAD_CARD_WORDS.opening}
        </span>
      ) : (
        <mark key={i} className="ld-now-gap" data-testid="lead-card-gap">
          {p.label}
        </mark>
      ),
    )}
  </>
);

/** Email 1 as they would read it: where it leaves from, to whom, its subject and words, when it goes, and Add's truth. */
export const LeadCardEmail = ({ email }: { email: LeadCardEmailVM }) => (
  <section className="ld-now-mail" aria-label={email.head} data-testid="lead-card-email">
    <p className="ld-now-mail-head">{email.head}</p>
    <dl className="ld-now-mail-meta">
      {email.to ? (
        <div>
          <dt>{LEAD_CARD_WORDS.to}</dt>
          <dd data-testid="lead-card-to">{email.to}</dd>
        </div>
      ) : null}
      {email.subject ? (
        <div>
          <dt>{LEAD_CARD_WORDS.subject}</dt>
          <dd data-testid="lead-card-subject">
            <LeadCardParts parts={email.subject} />
          </dd>
        </div>
      ) : null}
    </dl>
    <div className="ld-now-mail-body" data-testid="lead-card-body">
      <LeadCardParts parts={email.body} />
    </div>
    {email.when ? (
      <p className="ld-now-when" data-testid="lead-card-when">
        {email.when}
      </p>
    ) : null}
    {email.note ? <p className="ld-now-note">{email.note}</p> : null}
    {email.blocked ? (
      <p className="ld-now-note ld-now-blocked" data-testid="lead-card-blocked">
        {email.blocked}
        {email.instead === "choose" ? ` ${LEAD_CARD_WORDS.choose}` : null}
      </p>
    ) : null}
  </section>
);

/** One mark the reason rests on: a check's own mark (a dashed ring where Claude read it), its words, its source as the tip. */
const cardSignOf = (m: LeadCardMarkVM) => (
  <li
    key={m.key}
    className={`ld-now-sign ${m.how}${m.answer === "unknown" ? " ask" : ""}`}
    data-tip={m.from}
    data-testid={`lead-card-mark-${m.key}`}
  >
    {ldCheckMark(m.how, m.answer)}
    {m.label}
  </li>
);

/** Whether they can be reached: the two slots as the row wears them, a word only where one is not as it should be. */
const cardReachOf = (up: LeadRowVM) => (
  <ul className="ld-now-reach" data-testid="lead-card-reach">
    {(["phone", "mailbox"] as const).map((k) => {
      const s = up.slots[k];
      return (
        <li key={k} data-tip={s.tip} data-testid={`lead-card-reach-${k}`}>
          <LeadSlotShape state={s.state} />
          <span>{s.value ?? s.word}</span>
          {s.state === "ok" || !s.value ? null : <span className="ld-now-reach-word">{s.word}</span>}
        </li>
      );
    })}
  </ul>
);

/**
 * What fills their words: each slot the sequence's emails name, what it says for them, and where that came from, a
 * fallback or a hole said as one (contracts leadCardSlotsOf). The phone's Emails tab lists it; a desk's card folds it
 * under email 1.
 */
export const LeadCardSlots = ({ slots }: { slots: LeadCardSlotVM[] }) => (
  <dl className="ld-now-fills-list" data-testid="lead-card-slots">
    {slots.map((s) => (
      <div key={s.key} className={s.look} data-testid={`lead-card-slot-${s.key.replace(/ /g, "-")}`}>
        <dt>{s.label}</dt>
        <dd>
          {s.value ?? null}
          <span className="ld-now-note">{s.from}</span>
        </dd>
      </div>
    ))}
  </dl>
);

/** Who they are: the face, the name and the line about where. */
export const LeadCardWho = ({ up }: { up: LeadRowVM }) => (
  <div className="ld-pile-who">
    <LeadTile l={up} size={48} />
    <div className="ld-pile-name">
      <h3>{up.name}</h3>
      {up.sub ? <p>{up.sub}</p> : null}
    </div>
  </div>
);

/** The card's top: who, the reason up front, what it rests on, and how they can be reached. */
export const LeadCardHead = ({ up, card }: { up: LeadRowVM; card: LeadCardFacts }) => (
  <>
    <LeadCardWho up={up} />
    {card.reason ? (
      <p className={`ld-now-why ${card.reason.how}`} data-tip={card.reason.from} data-testid="lead-pile-why">
        {card.reason.text}
      </p>
    ) : up.why ? (
      <p className="ld-now-why read" data-testid="lead-pile-why">
        {up.why}
      </p>
    ) : null}
    {card.marks.length ? (
      <ul className="ld-now-signs" data-testid="lead-card-marks">
        {card.marks.map(cardSignOf)}
      </ul>
    ) : null}
    {cardReachOf(up)}
  </>
);

/**
 * The email part of the card: email 1, or on a first pile the line saying it is written at the end. On a desk (`fills`)
 * what fills its words is folded under it; a phone lists it on its Emails tab.
 */
export const LeadCardMail = ({ card, fills = false }: { card: LeadCardFacts; fills?: boolean }) =>
  card.email ? (
    <>
      <LeadCardEmail email={card.email} />
      {fills && card.slots.length ? (
        <details className="ld-now-fills" data-testid="lead-card-fills">
          <summary className="ld-now-mail-head">{LEAD_CARD_WORDS.slotsTitle}</summary>
          <LeadCardSlots slots={card.slots} />
        </details>
      ) : null}
    </>
  ) : card.firstPile ? (
    <p className="ld-now-note" data-testid="lead-card-first-pile">
      {LEAD_CARD_WORDS.firstPile}
    </p>
  ) : null;
