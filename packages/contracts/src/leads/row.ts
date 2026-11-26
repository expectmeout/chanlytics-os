/**
 * One lead as a row: its slots, its band, and the card the page draws. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import { clockDate, clockDateYear, clockTime } from "../shared/clock";
import type { SequencePlaceOfDto } from "../campaigns/sequences/place";
import type { LeadCounts, LeadRowDto, LeadSearchDto } from "./dtos";
import { leadSlots, leadTileSrc, leadTodayLine, leadUndoable, leadWhere } from "./facts";
import { clockIn, milesLabel } from "./labels";
import { leadReviewGroups } from "./review";
import { isLeadList } from "./import";
import { LEAD_DIRECTORY_WORDS, leadAddresseeOf } from "./kind";
import { leadColumnsOf, type LeadColumnsVM } from "./sheet/lead-row-columns";
import type { LEAD_CLOSED_REASONS, LeadEmailState } from "./search/sets";
import { siteHost } from "./search/clean";
import { LEAD_CLASS_WORDS, LEAD_LEFT_OUT_WORD, LEAD_REVIEW_WORD, LEAD_SOURCE_WORD } from "./words/refusals";
import {
  LEAD_CLOSED_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LIST_WORDS,
  LEAD_STAGE_WORDS,
  type LeadClass,
  type LeadList,
  type LeadStage,
} from "./words/lists";
import { agoShort, agoWords } from "../shared/time";
import { publicObjectSrc } from "../shared/link";
import { plural, reviewsPhrase } from "../shared/words";
import { initialsOf } from "../conversations/thread-contact";

/* ------------------------------------------------ what the page is given -- */

/**
 * One row as the table draws it (§6.2). Every field is a word or a shape, and not one of them is a stored value:
 * `stage` rides along only so the row's dot has a class. Task 2's `LEAD_COLUMNS` reads exactly these and nothing else.
 */
/* ------------------------------------------------ the row, as the redesign reads it (D5) */

export type LeadSlotState = "ok" | "part" | "none" | "bad" | "checking";

/** One reach slot: the shape carries the meaning (state), the word repeats it, the tip gives the value back. */
export interface LeadSlot {
  state: LeadSlotState;
  value: string | null;
  word: string;
  tip: string;
  copy: boolean;
}

/** The name card's facts (D5): the same derivations the peek draws from, so a hover decides without opening it. */
export interface LeadRowCard {
  about: string | null;
  today: string | null;
  where: { line: string; href: string | null } | null;
  site: { label: string; href: string } | null;
  maps: { label: string; href: string } | null;
  found: { at: string; what: string }[];
}

/** The band over the table (D5): the search's whole shape in one line, which is also the class tabs, and the qualified split by fit. */
export interface LeadBand {
  classes: { id: LeadClass; label: string; count: number }[];
  fits: { id: "strong" | "look" | "long"; label: string; count: number }[];
  /** Worth drawing the split only when the fits differ: a search whose every row is strong says nothing by it. */
  mixed: boolean;
}

/** The band's tabs, in the order the search's shape reads: what met the plan, what needs a person, what was left out. */
const LEAD_BAND_ORDER = ["qualified", "review", "excluded"] as const satisfies readonly LeadClass[];

export function leadBand(search: LeadSearchDto | null): LeadBand | null {
  const round = search?.round;
  if (!round) return null;
  const result = round.fits ?? { strong: 0, look: 0, long: 0 };
  const fits = (["strong", "look", "long"] as const).map((id) => ({
    id,
    label: LEAD_FIT_WORDS[id],
    count: result[id],
  }));
  // A search the finder ran shows its finished leads alone (decision 0133): its band is the one count, Qualified. A list
  // of the owner's own keeps Needs review and Left out (D4): its own data to sort.
  const order = isLeadList(search) ? LEAD_BAND_ORDER : (["qualified"] as const);
  return {
    // The tabs say the pills' words (LEAD_CLASS_WORDS: Qualified, Needs review, Left out) with the count in front, and the
    // page draws them in the pills' tones (stateOf("lead_class")): a tab and a pill for one state read one map.
    classes: order.map((id) => ({ id, label: `${round[id]} ${LEAD_CLASS_WORDS[id]}`, count: round[id] })),
    fits,
    mixed: fits.filter((x) => x.count > 0).length > 1,
  };
}

export interface LeadRowVM {
  /** Where it stands in the queue (00552), where the read asked: needs, in, or null in neither or a read that asked none. */
  statusGroup?: LeadRowDto["status_group"];
  id: string;
  searchId: string;
  searchName: string;
  mark: string;
  name: string;
  places: number;
  category: string;
  area: string;
  cls: LeadClass;
  /** The fit band itself (D5), for the band bar's filter; null for a row that is not qualified. */
  fit: "strong" | "look" | "long" | null;
  fitLabel: string;
  fitTitle: string;
  email: string | null;
  emailState: LeadEmailState;
  emailLabel: string;
  emailWord: string;
  phone: string | null;
  phoneAgrees: boolean;
  phoneWrong: boolean;
  /** The two contacts as one glance (D2's Reach column). */
  reach: {
    email: { address: string; state: LeadEmailState; word: string } | null;
    phone: { number: string; agrees: boolean } | null;
  };
  /** The class rule's reason tokens, for the Needs review queue (D3); [] on a row from before. */
  reasons: string[];
  why: string;
  rating: string;
  /** The spread of reviews, "5★ 30 · 4★ 8 · 3★ 2 · 2★ 0 · 1★ 1", for the Rating cell's title; blank when the listing did not say. */
  reviewsTitle: string;
  stage: LeadStage;
  stageLabel: string;
  /** The person this lead converted into (leads.contact_id), so a page can read People's row for them; null until then. */
  contactId: string | null;
  foundLabel: string;
  /** "Found 2d ago", "Found just now", "Found Aug 29": when it was found, as a phone's row says it (People's row says when
   *  they last wrote the same way). A desktop's Found column says `foundLabel` under its heading. */
  foundLine: string;
  foundAt: string;
  distance: string;
  source: string;
  host: string;
  excludedBy: string | null;
  /** The criterion's own key ("wrong_kind"): what the Excluded view's chip and the read name it by (00500). */
  excludedKey: string | null;
  version: number;
  /* ---- D5: the row as the redesign reads it ---- */
  /**
   * "Book store · Hawthorne · 97214 · 1.2 mi": whatever the source gave, in that order; "" when it gave none. A company's
   * starts with the person its reach-out writes to (00430).
   */
  sub: string;
  /** The two reach slots, phone then mailbox. */
  slots: { phone: LeadSlot; mailbox: LeadSlot };
  /** "4.7" and "1,284", apart, and the count with its noun ("1 review", "1,284 reviews"), or null where the source does not rate. */
  rated: { score: string; count: string; reviews: string } | null;
  /** The spread of reviews, one to five stars, or null when the listing did not say. */
  spread: [number, number, number, number, number] | null;
  /** The tile: the business's own mark, else the listing's photo, else initials. */
  tile: {
    initials: string;
    image: string | null;
    /** The whole photograph the peek's band draws, so the row can ask for it before it is opened. */
    band: string | null;
    logo: string | null;
  };
  /** A review row's line: what would resolve it, in the queue's own words; null for any other row. */
  waitsOn: string | null;
  /** The row's state mark: Ready is silent; the rest wear an edge and a tag. */
  state: "ready" | "contacted" | "talking" | "review" | "out";
  stateTag: string | null;
  /** The name card's facts. */
  card: LeadRowCard;
  /** What the columns a member may turn on say. */
  cols: LeadColumnsVM;
  /** Where it sits, when the door gave coordinates. */
  point: { lat: number; lng: number } | null;
  /** The pile's facts (00426): the reach-out it goes with (lead_chain_of) and when it was put off (Later). */
  chainId?: string | null;
  laterAt?: string | null;
  /**
   * Where it stands in a sequence, as the read said, for its status, its name's tag and its button; null in none, and for a
   * lead the finder left out. Kept with the row, so a row the tab kept draws where it stands as Leads opens: looked up in
   * the page's records, which come with its read, each status came 0.6 s after the rows on a return to Leads (the phone
   * re-measure of 16 Nov 2026).
   */
  place?: SequencePlaceOfDto | null;
  /** When it was contacted, for the line under Contacted; null for never. */
  contactedAt?: string | null;
}

/** A key from a plan ("chain", "wrong_kind") as a person would read it: a row's left-out reason, and its chip. */
export const leadCriterionWords = (key: string): string => {
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
};

/** "5.0 · 16": the stars and how many said so, together, because one without the other says nothing. */
const ratingLabel = (rating: number | null, reviews: number | null): string =>
  rating === null || rating === undefined ? "" : `${rating.toFixed(1)} · ${reviews ?? 0}`;

/** A closed lead says WHY it closed; "archived" is a stored value and never reaches a screen. */
const stageLabelOf = (stage: LeadStage, closedReason: string | null): string =>
  stage === "archived"
    ? (LEAD_CLOSED_WORDS[closedReason as (typeof LEAD_CLOSED_REASONS)[number]] ?? LEAD_STAGE_WORDS.archived)
    : LEAD_STAGE_WORDS[stage];

/** 00161's public bucket: the copies of leads' marks we keep, each named by its own hash. */
export const LEAD_MARKS_BUCKET = "lead-marks";

/** The only names the bucket holds, and the only ones 00161's CHECK lets a lead keep. */
export const LEAD_MARK_PATH = /^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$/;

/**
 * Where a kept mark is served: the project's own storage, on the Supabase origin the dashboard's content policy
 * already lets images in from (csp.ts reads the same variable). Null for no copy, for anything that is not a name we
 * wrote, and without an https origin to serve it from.
 */
export function leadMarkSrc(supabaseUrl: string | null | undefined, path: string | null | undefined): string | null {
  if (!path || !LEAD_MARK_PATH.test(path)) return null;
  return publicObjectSrc(supabaseUrl, LEAD_MARKS_BUCKET, path);
}

/**
 * A rated lead's rating as the row, the peek and Ask say it: "4.7" and "1,284" apart, and the count with its noun ("1 review",
 * "1,284 reviews"); null where the source does not rate.
 */
export function leadRatingOf(lead: Pick<LeadRowDto, "rating" | "reviews">): LeadRowVM["rated"] {
  if (lead.rating === null || lead.rating === undefined) return null;
  const n = lead.reviews ?? 0;
  return { score: lead.rating.toFixed(1), count: n.toLocaleString("en-US"), reviews: reviewsPhrase(n) };
}
/** A row's membership of its search, as the DTO carries it. */
type LeadMember = LeadRowDto["member"];

/**
 * The fit the row wears and what its tip says: Qualified its fit band, Needs review the judge's reason, what it waits on,
 * Excluded the criterion that left it out.
 */
function rowFitWords(
  member: LeadMember,
  excludedBy: string | null,
  rated: LeadRowVM["rated"],
): Pick<LeadRowVM, "fitLabel" | "fitTitle"> {
  if (member.class === "excluded")
    return { fitLabel: excludedBy ?? member.reason, fitTitle: `${LEAD_LEFT_OUT_WORD}: ${excludedBy ?? member.reason}` };
  if (member.class === "review") return { fitLabel: member.reason, fitTitle: member.reason };
  // Qualified: its band, and its rating beside its reason in the tip.
  return {
    fitLabel: member.fit ? LEAD_FIT_WORDS[member.fit] : member.reason,
    fitTitle: rated ? `${member.reason} · ${rated.score} from ${rated.reviews}` : member.reason,
  };
}

/** Where the row stands: left out, waiting on review, written to, talking, or ready. */
function rowStateOf(member: LeadMember, stage: LeadRowDto["stage"]): LeadRowVM["state"] {
  if (member.class === "excluded") return "out";
  if (member.class === "review") return "review";
  if (stage === "nurture") return "contacted";
  if (stage === "converted") return "talking";
  if (stage === "archived") return "out";
  return "ready";
}

/**
 * The state's tag. Ready is the silent default and wears nothing; every other state says which one it is. Review said
 * nothing for its whole life, which left `.ld-state-tag.review` in the stylesheet matching no row ever drawn -- and on a
 * mixed list a lead that is waiting on something looked exactly like a lead that is ready to call.
 */
function rowStateTag(state: LeadRowVM["state"], lead: LeadRowDto, nowMs: number): string | null {
  if (state === "contacted")
    return `${LEAD_STAGE_WORDS.nurture}${lead.contacted_at ? ` · ${agoShort(Date.parse(lead.contacted_at), nowMs)}` : ""}`;
  if (state === "talking") return LEAD_STAGE_WORDS.converted;
  if (state === "review") return LEAD_REVIEW_WORD;
  if (state === "out")
    return lead.member.class === "excluded" ? LEAD_LEFT_OUT_WORD : stageLabelOf(lead.stage, lead.closed_reason);
  return null;
}

/** The name card: what it is, today's hours, where, its site and its map, and the term it was found for. */
function rowCardOf(lead: LeadRowDto, tz: string, now: Date, search: LeadSearchDto | null): LeadRowCard {
  const term = search?.plan?.terms[0] ?? null;
  return {
    about: lead.about ?? null,
    today: leadTodayLine(lead.hours ?? [], tz, now),
    where: leadWhere(lead),
    site: lead.website ? { label: siteHost(lead.website) ?? lead.website, href: `https://${lead.website}` } : null,
    maps: lead.maps_url ? { label: "Google Maps", href: lead.maps_url } : null,
    found: [
      {
        at: clockIn(tz, lead.found_at, now),
        what: foundLine(lead, term),
      },
    ],
  };
}

/** The reviews by star, one to five, and the tip that says them five to one; none where the source does not say. */
function rowReviewsOf(lead: LeadRowDto): Pick<LeadRowVM, "spread" | "reviewsTitle"> {
  const dist = lead.reviews_dist;
  if (!dist) return { spread: null, reviewsTitle: "" };
  return {
    spread: [dist.one, dist.two, dist.three, dist.four, dist.five],
    reviewsTitle: `5★ ${dist.five} · 4★ ${dist.four} · 3★ ${dist.three} · 2★ ${dist.two} · 1★ ${dist.one}`,
  };
}

/**
 * One row's words and shapes (§6.2). Nothing here is a stored value. The search is the row's own (D5): a review
 * row names what it waits on in the queue's words, and the name card names the term it was found for.
 */
export function toLeadRowVM(lead: LeadRowDto, tz: string, now: Date, search: LeadSearchDto | null = null): LeadRowVM {
  const nowMs = now.getTime();
  const foundMs = Date.parse(lead.found_at);
  const member = lead.member;
  const excludedBy = member.excluded_by ? leadCriterionWords(member.excluded_by) : null;
  const rating = ratingLabel(lead.rating, lead.reviews);
  const rated = leadRatingOf(lead);
  const { fitLabel, fitTitle } = rowFitWords(member, excludedBy, rated);
  const area = [lead.postal_code ?? "", [lead.city, lead.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  // D5: the row as the redesign reads it -- one line about where, two reach slots, the tile, its state, the card.
  const sub = subLineOf(lead, member.distance_m);
  const { spread, reviewsTitle } = rowReviewsOf(lead);
  const waitsOn =
    member.class === "review"
      ? (leadReviewGroups([{ id: lead.id, cls: "review", reasons: member.reasons ?? [] }], search)[0]?.label ??
        member.reason)
      : null;
  const state = rowStateOf(member, lead.stage);
  const stateTag = rowStateTag(state, lead, nowMs);
  const card = rowCardOf(lead, tz, now, search);
  return {
    id: lead.id,
    searchId: lead.search_id,
    searchName: lead.search_name ?? "",
    mark: initialsOf(leadNameShown(lead.business_name)),
    name: leadNameShown(lead.business_name),
    places: lead.places,
    category: lead.category ?? "",
    area,
    cls: member.class,
    fit: member.class === "qualified" ? member.fit : null,
    fitLabel,
    fitTitle,
    email: lead.email,
    emailState: lead.email_state,
    // The cell draws the address itself; an address nobody has is blank, not "none".
    emailLabel: lead.email ?? "",
    emailWord: LEAD_EMAIL_WORDS[lead.email_state],
    // E.164, because the row dials it (plDial's tel:); the double tick says Maps and their own site agree.
    phone: lead.phone,
    phoneAgrees: lead.phone_agrees,
    phoneWrong: lead.phone_wrong,
    reach: {
      email: lead.email
        ? { address: lead.email, state: lead.email_state, word: LEAD_EMAIL_WORDS[lead.email_state] }
        : null,
      phone: lead.phone ? { number: lead.phone, agrees: lead.phone_agrees } : null,
    },
    reasons: member.reasons ?? [],
    why: member.reason,
    rating,
    reviewsTitle,
    stage: lead.stage,
    stageLabel: stageLabelOf(lead.stage, lead.closed_reason),
    contactId: lead.contact_id ?? null,
    foundLabel: agoShort(foundMs, nowMs),
    foundLine: Number.isFinite(foundMs)
      ? `Found ${agoWords(foundMs, nowMs, { date: (at) => clockDate(at, tz, nowMs) })}`
      : "",
    foundAt: `${clockDateYear(foundMs, tz)} · ${clockTime(foundMs, tz)}`,
    distance: milesLabel(member.distance_m),
    source: leadSourceWord(lead),
    host: siteHost(lead.website) ?? "",
    excludedBy,
    excludedKey: member.excluded_by,
    version: lead.version,
    sub,
    slots: leadSlots(lead),
    rated,
    spread,
    tile: {
      initials: initialsOf(leadNameShown(lead.business_name)),
      image: leadTileSrc(lead.image_url),
      band: lead.image_url ?? null,
      logo: lead.mark_url ?? null,
    },
    waitsOn,
    state,
    stateTag,
    card,
    cols: leadColumnsOf(lead, tz, now),
    point: typeof lead.lat === "number" && typeof lead.lng === "number" ? { lat: lead.lat, lng: lead.lng } : null,
  };
}

/** A row as Leads publishes it: its words (toLeadRowVM), the pile's facts (00426), the reach-out it goes with and when it
 * was put off in this pass, where it stands in the queue, where the read asked (00552), and in a sequence. */
export function leadRowOf(lead: LeadRowDto, tz: string, now: Date, search: LeadSearchDto | null = null): LeadRowVM {
  return {
    ...toLeadRowVM(lead, tz, now, search),
    chainId: lead.chain_id ?? null,
    laterAt: lead.member.later_at ?? null,
    statusGroup: lead.status_group ?? null,
    place: lead.member.class === "excluded" ? null : (lead.place ?? null),
    contactedAt: lead.contacted_at ?? null,
  };
}

/**
 * The row's line about where: "Book store · Hawthorne · 97214 · 1.2 mi", whatever the source gave, in that order. A
 * company's (00430) leads with the person its reach-out writes to: "Dana Reyes, Owner · Marketing & Advertising".
 */
function subLineOf(lead: LeadRowDto, distanceM: number | null): string {
  const leadAddressee = leadAddresseeOf(lead);
  return [
    leadAddressee ? [leadAddressee.name, leadAddressee.title].filter(Boolean).join(", ") : null,
    lead.category,
    lead.neighborhood ?? null,
    lead.postal_code ?? null,
    milesLabel(distanceM) || null,
  ]
    .filter((x): x is string => !!x)
    .join(" · ");
}

/** Where a lead's facts came from, as foundLine says it: a directory, its Maps listing, else the owner's own list. */
export function leadSourceWord(lead: Pick<LeadRowDto, "kind" | "place_id">): string {
  if (lead.kind === "company") return LEAD_DIRECTORY_WORDS.source;
  return lead.place_id ? LEAD_SOURCE_WORD : "Your list";
}

/** A round that is still going; one waiting on the owner is its own mark. */
const roundIsLive = (state: string): boolean => state !== "ended" && state !== "waiting_on_owner";

/**
 * Where a row's lead was found. A company the people card found (00430) came from a business directory; a lead a list
 * of the owner's own brought (00242) has no place: found on no listing.
 */
function foundLine(r: Pick<LeadRowDto, "place_id" | "rank" | "kind">, term: string | null): string {
  if (r.kind === "company") return LEAD_DIRECTORY_WORDS.found;
  if (!r.place_id) return "From your list";
  if (!term) return "On a Google Maps listing";
  return r.rank ? `On Google Maps, #${r.rank} for “${term}”` : `On Google Maps, searching “${term}”`;
}

/** One search's row in the rail: its name, what its last round counted, its mark, and what its menu offers. */
export interface LeadRailRow {
  id: string;
  name: string;
  /** What its last round counted; null for a search with no round (one imported, or made from a list), never a 0. */
  count: number | null;
  mark: "live" | "question" | null;
  undoable: boolean;
  /** A list of the owner's own (00242): its menu offers nothing that searches again. */
  list: boolean;
  /** A people search (00430): its menu's way back is Find people, filled in, never the places card. */
  people: boolean;
}

/**
 * The rows the rail lists under Searches: every search but a sequence's own list (00496 sequence_list), which it files
 * under Sequences. The standing line counts these too, so the head never says a search more than the rail lists.
 */
function searchesListed(rows: LeadSearchDto[]): LeadSearchDto[] {
  return rows.filter((s) => !s.sequence_list);
}

/**
 * The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks, then the sequences'
 * own lists (00496 sequence_list), apart: a sequence's list is named for it and holds the leads added to it by hand, so
 * among the searches it read as the search its leads came from, twice (the walk of 30 Oct 2026). One with nobody on it
 * is drawn only while it is open (`open`): its leads joined from its search, never by hand, and a 0 there said nobody.
 */
export function leadRail(
  counts: LeadCounts,
  searches: LeadSearchDto[],
  now: Date = new Date(),
  open: string | null = null,
): { lists: { id: LeadList; label: string; count: number }[]; searches: LeadRailRow[]; sequences: LeadRailRow[] } {
  // Said no is a list only when somebody said no: an empty row in the rail
  // teaches the owner nothing and costs them a line every day.
  const ids: LeadList[] = [
    "all",
    "ready",
    "nurture",
    "converted",
    ...(counts.said_no > 0 ? (["said_no"] satisfies LeadList[]) : []),
    "not_a_fit",
  ];
  // Among the searches listed: a sequence's own list, apart below, shares its search's name and is not confused with it.
  const named = leadSearchNamesOf(searchesListed(searches));
  const rowOf = (leadSearch: LeadSearchDto): LeadRailRow => ({
    id: leadSearch.id,
    name: named.get(leadSearch.id) ?? leadSearch.name,
    count: leadSearch.round ? leadSearch.round.counted : null,
    undoable: leadUndoable(leadSearch, now),
    list: isLeadList(leadSearch),
    people: !!leadSearch.people,
    mark: !leadSearch.round
      ? null
      : leadSearch.round.state === "waiting_on_owner"
        ? "question"
        : roundIsLive(leadSearch.round.state)
          ? "live"
          : null,
  });
  return {
    lists: ids.map((id) => ({ id, label: LEAD_LIST_WORDS[id], count: counts[id === "all" ? "all" : id] })),
    searches: searchesListed(searches).map(rowOf),
    sequences: searches.filter((s) => s.sequence_list && ((s.round?.counted ?? 0) > 0 || s.id === open)).map(rowOf),
  };
}

/**
 * What a search's own view says while it shows nobody. A list of the owner's own (D4) says the leads AI could not decide
 * on, with the way to them: its own data to sort. A search the finder ran shows its finished leads alone (decision 0133),
 * so it reads nothing of what it set aside: still looking, or, ended with none counted, what it counts, as its card
 * said. An email search whose places all came back catch-all ended with 0 counted, and its empty view counted the pile
 * and opened it (15 Nov 2026). Null where none of these holds, for the page's own words.
 */
export function leadSearchEmptyWords(
  search: Pick<LeadSearchDto, "via" | "round" | "plan"> | null | undefined,
): { title: string; body: string; review: boolean } | null {
  const round = search?.round;
  if (!round) return null;
  const list = isLeadList(search);
  if (list && round.review > 0)
    return {
      title: `${plural(round.review, "lead needs", "leads need")} a look.`,
      body: roundIsLive(round.state)
        ? "AI is still checking them, and couldn't decide on these yet."
        : "AI couldn't decide on these by itself.",
      review: true,
    };
  if (roundIsLive(round.state))
    return { title: "Still looking.", body: "Leads come in here as AI checks them.", review: false };
  if (list || round.state !== "ended" || round.counted > 0) return null;
  // What counts, as the card's facts said it (leadPlanFacts): a people search counts a checked address alone.
  const reach = search.plan?.contact === "phone" ? "a valid phone number or a checked email" : "a checked email";
  return { title: "No leads from this search.", body: `Only matches with ${reach} show here.`, review: false };
}

/**
 * The name each search is listed by: its own, and where two share one, its place after it ("med spas · Brooklyn, NY"):
 * Ruben's two searches were both "med spas" in one list (14 Nov 2026). A search with no place keeps its name.
 */
function leadSearchNamesOf(searches: readonly LeadSearchDto[]): Map<string, string> {
  const seen = new Map<string, number>();
  for (const s of searches) seen.set(s.name, (seen.get(s.name) ?? 0) + 1);
  return new Map(
    searches.map((s) => {
      const where = isLeadList(s) ? null : s.plan?.area.label;
      return [s.id, (seen.get(s.name) ?? 0) > 1 && where ? `${s.name} · ${where}` : s.name];
    }),
  );
}

/**
 * A business's name as a row says it: its listing's name up to the first " | ", where a listing strings search words after
 * it ("Unique Clinique Aesthetics | Med Spa Brooklyn", Ruben's phone, 14 Nov 2026). The stored name is untouched, and a
 * name that is nothing but such a tail is said whole.
 */
function leadNameShown(name: string): string {
  const head = name.split(" | ")[0]?.trim() ?? "";
  return head.length >= 2 ? head : name;
}

/**
 * "322 leads · 272 not contacted", and "1 search needs you" when one waits. How many searches there are is the Lists sheet's
 * to show, as every search is a row of it: said here too, "searches" stood twice in one line (Ruben, 12 Nov 2026). Over
 * one search (`inSearch`) the count is still the workspace's, and says so: "120 leads in all" stood over a search that had
 * found 0, and "177" over one of 137 (Ruben, 14 Nov 2026).
 */
export function leadsStanding(
  counts: LeadCounts,
  searches: LeadSearchDto[],
  inSearch = false,
): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null } {
  const waiting = searches.filter((s) => s.round?.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads${inSearch ? " in all" : ""}`,
    parts: [`${counts.ready} ${LEAD_STAGE_WORDS.ready.toLowerCase()}`],
    needsYou: waiting.length ? { count: waiting.length, searchId: waiting[0]?.id ?? "" } : null,
  };
}
