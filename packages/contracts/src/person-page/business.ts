/**
 * The business a person works at, as their page says it (decision 0052): the head (their face and name, or the
 * business's tile and name while they are a stand-in, and the one line under it), the Works at row, and the business
 * sheet, the one home of the business's details. The sheet is Leads' own peek view model (toLeadPeekVM) cut to what a
 * person's page needs, so the two never say a business two ways.
 */
import { initialsOf, shortName } from "../conversations/thread-contact";
import { leadTileSrc, leadTintOf } from "../leads/lead-facts";
import { leadsRoute } from "../leads/lead-plan";
import { toLeadPeekVM } from "../leads/lead-peek";
import { LEAD_STAGE_WORDS } from "../leads/lead-words";
import { clockDate } from "../shared/clock";
import { formatPhoneDisplay } from "../shared/phone";
import { MIN_MS } from "../shared/time";
import { personName } from "../people/person-name";
import type { PersonBusinessDto, PersonSignerDto } from "../people/person-dto";
import type { PersonRowVM } from "../people/person-row";
import { reachOutStandingOf, type ReachOutLeadTimelineDto } from "../reach-out/reach-out-leads";
import { BUSINESS_DOOR_LABEL, PERSON_NAME_WORDS, WORKS_AT_WORDS, type NameSource } from "./words";

/** A face as the page draws it: a person's initials, or a business's tile (its tint and the listing's photo). */
export interface PersonFaceVM {
  kind: "face" | "tile";
  initials: string;
  /** The tile's tint (leadTintOf, 1 to 6); null on a face. */
  tint: number | null;
  /** The listing's photo for a tile; null on a face or where the listing has none. */
  image: string | null;
}

/** The line under the name: the business (a door to its sheet), a stand-in's story so far, or a business removed. */
export type PersonHeadLine =
  { kind: "business"; text: string; label: string } | { kind: "origin"; text: string } | { kind: "gone"; text: string };

/** The head of a person's page, the Inbox's thread header and the peek: who they are, and the line under it. */
export interface PersonHeadVM {
  face: PersonFaceVM;
  name: string;
  /** Named for the business they work at (name_source lead): never greeted by a first name. */
  standIn: boolean;
  line: PersonHeadLine | null;
  /**
   * A reply's signer offered as their name (the notice, in the line's place): its words, the reply it was read from and
   * the day. Null when none waits.
   */
  signer: { name: string; title: string | null; messageId: string; fact: string; day: string } | null;
  /** "Add their name" beside a stand-in nobody has named, but never after their no. */
  addName: boolean;
  /** Their name came from a signer: the reply it came from and its day, and what Undo puts back (the business, or none). */
  namedBy: { messageId: string; day: string; putBack: string | null } | null;
  /** Ask's capsule: "Ask about Priya", or "Ask about this person" for a stand-in. */
  ask: string;
}

/** What the head is made of: the person as People holds them, what they work at, and the signers of their replies. */
export interface PersonHeadInput {
  name: string;
  initials: string;
  /** The name a member or a door set, or null: what decides whether a signer may name them. */
  givenName: string | null;
  nameSource: NameSource | null;
  worksAt: { leadId: string; name: string | null; gone: boolean } | null;
  business: PersonBusinessDto | null;
  signers: readonly PersonSignerDto[];
  /** When they were added: for a stand-in, the first cold email (contact.added). */
  addedMs: number | null;
  /** When they were first called: a stand-in an Interested call made. */
  calledMs: number | null;
  /** When their reply was read as a no, if it was. */
  saidNoMs: number | null;
}

/** The business's tile: its initials on the tint its kind decides, with the listing's photo where there is one. */
function tileOf(name: string, b: PersonBusinessDto | null): PersonFaceVM {
  return {
    kind: "tile",
    initials: initialsOf(b?.lead.business_name ?? name),
    tint: leadTintOf(b?.lead.category ?? null),
    image: leadTileSrc(b?.lead.image_url ?? null),
  };
}

/** The head (decision 0052): a stand-in's tile and story, or a person's face and their business as a door. */
export function personHeadOf(h: PersonHeadInput, tz: string, nowMs: number): PersonHeadVM {
  const standIn = h.nameSource === "lead";
  const day = (ms: number) => clockDate(ms, tz, nowMs);
  // A signer is offered to a stand-in, or to someone nobody has named: never over a name of their own.
  const offered = h.signers.find((s) => s.state === "offered" && s.intent !== "no" && s.claim === "person");
  const signer =
    offered && (standIn || !h.givenName)
      ? {
          name: offered.name,
          title: offered.title,
          messageId: offered.message_id,
          fact: PERSON_NAME_WORDS.signed(offered.name),
          day: day(Date.parse(offered.read_at)),
        }
      : null;
  const gone = !!h.worksAt?.gone;
  const business = h.worksAt && !gone ? (h.worksAt.name ?? h.business?.lead.business_name ?? null) : null;
  let line: PersonHeadLine | null = null;
  if (gone) line = { kind: "gone", text: WORKS_AT_WORDS.gone };
  else if (signer) line = null;
  else if (standIn) {
    const story =
      h.saidNoMs !== null
        ? WORKS_AT_WORDS.saidNo(day(h.saidNoMs))
        : h.calledMs !== null && (h.addedMs === null || h.calledMs <= h.addedMs + MIN_MS)
          ? WORKS_AT_WORDS.youCalled(day(h.calledMs))
          : h.addedMs !== null
            ? WORKS_AT_WORDS.weWroteFirst(day(h.addedMs))
            : null;
    line = story ? { kind: "origin", text: story } : null;
  } else if (business) line = { kind: "business", text: business, label: BUSINESS_DOOR_LABEL(business) };
  const adopted = h.nameSource === "signature" ? h.signers.find((s) => s.state === "adopted") : undefined;
  return {
    face: standIn ? tileOf(h.name, h.business) : { kind: "face", initials: h.initials, tint: null, image: null },
    name: h.name,
    standIn,
    line,
    signer,
    addName: standIn && h.saidNoMs === null && !signer,
    namedBy: adopted
      ? {
          messageId: adopted.message_id,
          day: day(Date.parse(adopted.read_at)),
          putBack: business ?? h.business?.lead.business_name ?? null,
        }
      : null,
    ask: standIn ? PERSON_NAME_WORDS.askAboutThisPerson : PERSON_NAME_WORDS.askAbout(shortName(h.name)),
  };
}

/** The Works at row: one row, no open state, the door to the sheet; or, the business erased, the line that says so. */
export type WorksAtVM =
  | {
      gone: false;
      leadId: string;
      /** The business's name: the row's first line on a phone, where the head's line may have scrolled away. */
      name: string;
      tile: PersonFaceVM;
      /** "Bridal shop · ★ 4.8 (312) · 2 people" */
      kind: string;
      /** "From the listing, read Sep 18" */
      read: string;
      label: string;
    }
  | { gone: true; text: string };

/** "★ 4.8 (312)", or null where the listing does not rate. */
function ratingOf(rating: number | null, reviews: number | null): string | null {
  if (rating === null || !Number.isFinite(rating)) return null;
  return `★ ${rating.toFixed(1)}${reviews ? ` (${reviews.toLocaleString("en-US")})` : ""}`;
}

/** The Works at row of a person who works somewhere; null for someone who works nowhere. */
export function worksAtOf(
  worksAt: { leadId: string; name: string | null; gone: boolean } | null,
  b: PersonBusinessDto | null,
  tz: string,
  nowMs: number,
): WorksAtVM | null {
  if (!worksAt) return null;
  if (worksAt.gone) return { gone: true, text: WORKS_AT_WORDS.gone };
  const name = worksAt.name ?? b?.lead.business_name ?? null;
  if (!name) return null;
  const lead = b?.lead ?? null;
  const people = b?.people.length ?? 0;
  const kind = [
    lead?.category ?? null,
    lead ? ratingOf(lead.rating, lead.reviews) : null,
    people > 1 ? WORKS_AT_WORDS.people(people) : null,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");
  const found = lead ? Date.parse(lead.found_at) : NaN;
  return {
    gone: false,
    leadId: worksAt.leadId,
    name,
    tile: tileOf(name, b),
    kind: kind || name,
    read: Number.isFinite(found) ? WORKS_AT_WORDS.read(clockDate(found, tz, nowMs)) : "",
    label: BUSINESS_DOOR_LABEL(name),
  };
}

/** One person at the business, as its sheet lists them: this page says "this page", the rest say when last in touch. */
export interface BusinessPersonVM {
  id: string;
  name: string;
  initials: string;
  here: boolean;
  line: string;
  needsYou: boolean;
  /** Their page; null for the person whose page this is. */
  to: string | null;
}

/** The business sheet (decision 0052): the one home of a business's details on a person's page. */
export interface BusinessRecordVM {
  leadId: string;
  name: string;
  tile: PersonFaceVM;
  /** "Bridal shop · $$ · Austin, TX" */
  kind: string;
  rating: string | null;
  address: { line: string; href: string | null } | null;
  /** "From the listing · read Sep 18" */
  read: string;
  stage: { word: string; note: string };
  /**
   * Still worked (not closed), with its own person (leads.contact_id): a call logged on one of its people moves it too
   * (person_call_logged, which moves no lead without its person, whose Interested would make a second one).
   */
  open: boolean;
  people: BusinessPersonVM[];
  peopleTitle: string;
  fit: { word: string; checks: string } | null;
  reachOut: { chain: string; line: string; to: string | null } | null;
  phone: { value: string; tel: string | null; hours: string | null } | null;
  links: { label: string; href: string }[];
  /** Open in Leads: the lead over the Leads page. */
  to: string;
}

/**
 * The business sheet of a person who works somewhere (whose page it is, and the reach-out that wrote to it), built on
 * Leads' own peek view model.
 */
export function businessRecordOf(
  b: PersonBusinessDto,
  of: { personId: string; reachOut: ReachOutLeadTimelineDto | null },
  tz: string,
  now: Date,
): BusinessRecordVM {
  const { personId, reachOut } = of;
  const nowMs = now.getTime();
  const peek = toLeadPeekVM(b.lead, null, tz, now);
  const found = Date.parse(b.lead.found_at);
  const people: BusinessPersonVM[] = b.people.map((p) => {
    const name = personName(p);
    const touched = p.in_touch_at ? Date.parse(p.in_touch_at) : NaN;
    return {
      id: p.id,
      name,
      initials: initialsOf(name),
      here: p.id === personId,
      line:
        p.id === personId
          ? WORKS_AT_WORDS.thisPage
          : Number.isFinite(touched)
            ? WORKS_AT_WORDS.inTouch(clockDate(touched, tz, nowMs))
            : WORKS_AT_WORDS.neverInTouch,
      needsYou: p.needs_you,
      to: p.id === personId ? null : `clients/${p.id}`,
    };
  });
  const links = Object.values(peek.links).filter((l): l is { label: string; href: string } => !!l && !!l.href);
  return {
    leadId: b.lead.id,
    name: b.lead.business_name,
    tile: tileOf(b.lead.business_name, b),
    kind: peek.sub,
    rating: ratingOf(b.lead.rating, b.lead.reviews),
    address: peek.where ? { line: peek.where.line, href: peek.where.href } : null,
    read: Number.isFinite(found) ? WORKS_AT_WORDS.readOnSheet(clockDate(found, tz, nowMs)) : "",
    stage: { word: LEAD_STAGE_WORDS[b.lead.stage] ?? b.lead.stage, note: WORKS_AT_WORDS.stageNote },
    open: b.lead.stage !== "archived" && !!b.lead.contact_id,
    people,
    peopleTitle: WORKS_AT_WORDS.peopleHere(people.length),
    fit: peek.checkDots.length ? { word: peek.fit.word, checks: WORKS_AT_WORDS.checks(peek.checkDots.length) } : null,
    reachOut: reachOut?.chain
      ? {
          chain: reachOut.chain.name,
          // Where the business stands in it, said once for every page (00426): never "still writing" after an answer.
          line: reachOutStandingOf(reachOut, nowMs, tz)?.line ?? "",
          to: reachOut.conversation_id ? `inbox/th-${reachOut.conversation_id}` : null,
        }
      : null,
    phone: peek.reach.phone
      ? {
          value: peek.reach.phone.value ?? formatPhoneDisplay(b.lead.phone) ?? "",
          tel: peek.reach.phone.tel,
          hours: peek.today ? WORKS_AT_WORDS.listingHours(peek.today) : null,
        }
      : null,
    links,
    to: leadsRoute({ peek: b.lead.id }),
  };
}

/** A row of People as Leads reads a business's people from it (0052). */
type AtLeadRow = Pick<PersonRowVM, "id" | "name" | "standIn" | "worksAt" | "deal" | "state">;

/** People's rows by the business each works at, and by id: made once for a page of leads, never for each row. */
export interface LeadPeopleIndex {
  byLead: ReadonlyMap<string, readonly AtLeadRow[]>;
  byId: ReadonlyMap<string, AtLeadRow>;
}

export function leadPeopleIndex(rows: readonly AtLeadRow[]): LeadPeopleIndex {
  const byLead = new Map<string, AtLeadRow[]>();
  const byId = new Map<string, AtLeadRow>();
  for (const r of rows) {
    byId.set(r.id, r);
    const lead = r.worksAt && !r.worksAt.gone ? r.worksAt.leadId : null;
    if (!lead) continue;
    const at = byLead.get(lead);
    if (at) at.push(r);
    else byLead.set(lead, [r]);
  }
  return { byLead, byId };
}

/** The people at a business as Leads' row says them (0052, canvas A): the Stage's door, the row's line, the card's line, the client. */
export interface LeadPeopleVM {
  /**
   * Who a Talking lead's Stage opens, its face: the person at it with a name of their own most recently in touch, else its
   * own person (leads.contact_id); with their name where they have one, never a stand-in's (it is the business's own).
   */
  door: { id: string; name: string | null } | null;
  /**
   * The row's line under the business's name, "2 people · Priya Nair, Leah Brooks", once someone at it has a name of their
   * own; null before then (a stand-in alone is the business we wrote to, and where it is says more).
   */
  line: string | null;
  /** The name card's line, "In People · Priya Nair, Leah Brooks"; null as `line` is. */
  card: string | null;
  /** The person at the business whose deal is won (0004, any of them since 0052): the Client pill opens them. */
  client: string | null;
  /** Everyone at the business, by id, in the order every list of them takes: the face, whoever waits on you, the rest. */
  order: string[];
}

/**
 * Who works at this lead, as People holds them. Its face is the person a member knows it by: the one with a name of their
 * own most recently in touch, else the lead's own person (leads.contact_id), so a stand-in the finder made never stands
 * for the business once someone there has a name. The face first, then whoever waits on you, then People's own order (the
 * latest in touch first). Nothing before People is read, and nobody for a business whose details were removed.
 */
export function leadPeopleOf(lead: { id: string; contactId: string | null }, index: LeadPeopleIndex): LeadPeopleVM {
  const own = lead.contactId ? (index.byId.get(lead.contactId) ?? null) : null;
  const at = index.byLead.get(lead.id) ?? [];
  const face = at.find((r) => !r.standIn) ?? own ?? at[0] ?? null;
  const others = at.filter((r) => r !== face);
  const people = [
    ...(face && at.includes(face) ? [face] : []),
    ...others.filter((r) => r.state === "needs_you"),
    ...others.filter((r) => r.state !== "needs_you"),
  ];
  const names = WORKS_AT_WORDS.someNames(people.filter((r) => !r.standIn).map((r) => r.name));
  const n = people.length;
  return {
    door: face ? { id: face.id, name: face.standIn ? null : face.name } : null,
    line: names ? WORKS_AT_WORDS.peopleLine(n, names) : null,
    card: n ? (names ? WORKS_AT_WORDS.inPeopleNamed(names) : WORKS_AT_WORDS.inPeople(n)) : null,
    client: [...(own ? [own] : []), ...people].find((r) => r.deal?.stage === "won")?.id ?? null,
    order: people.map((r) => r.id),
  };
}

/** The dim trail a row draws after a person's name: " · Bloom & Vow Bridal", or null for a stand-in or nobody's. */
export function businessTrailOf(row: {
  nameSource?: NameSource | null;
  worksAt?: { name: string | null; gone: boolean } | null;
}): string | null {
  if (row.nameSource === "lead" || !row.worksAt || row.worksAt.gone || !row.worksAt.name) return null;
  return row.worksAt.name;
}
