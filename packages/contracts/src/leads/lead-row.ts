/**
 * One lead as a row: its slots, its tint, its band, and the card the page draws. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import { clockDate, clockDateYear, clockTime } from "../shared/clock";
import type { LeadCounts, LeadRowDto, LeadSearchDto } from "./lead-dtos";
import { leadSlots, leadTileSrc, leadTintOf, leadTodayLine, leadUndoable, leadWhere } from "./lead-facts";
import { clockIn, milesLabel } from "./lead-helpers";
import { leadReviewGroups } from "./lead-review";
import { LEAD_CLOSED_REASONS, type LeadEmailState } from "./search/sets";
import { siteHost } from "./search/clean";
import {
  LEAD_CLOSED_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_LIST_WORDS,
  LEAD_REVIEW_WORD,
  LEAD_SOURCE_WORD,
  LEAD_STAGE_WORDS,
  type LeadClass,
  type LeadList,
  type LeadStage,
} from "./lead-words";
import { agoShort, agoWords } from "../shared/time";
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

export function leadBand(search: LeadSearchDto | null): LeadBand | null {
  const r = search?.round;
  if (!r) return null;
  const f = r.fits ?? { strong: 0, look: 0, long: 0 };
  const fits = (["strong", "look", "long"] as const).map((id) => ({ id, label: LEAD_FIT_WORDS[id], count: f[id] }));
  return {
    classes: [
      { id: "qualified", label: `${r.qualified} qualified`, count: r.qualified },
      { id: "review", label: `${r.review} need${r.review === 1 ? "s" : ""} a look`, count: r.review },
      { id: "excluded", label: `${r.excluded} left out`, count: r.excluded },
    ],
    fits,
    mixed: fits.filter((x) => x.count > 0).length > 1,
  };
}

export interface LeadRowVM {
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
  version: number;
  /* ---- D5: the row as the redesign reads it ---- */
  /** "Book store · Hawthorne · 97214 · 1.2 mi": whatever the source gave, in that order; "" when it gave none. */
  sub: string;
  /** The two reach slots, phone then mailbox. */
  slots: { phone: LeadSlot; mailbox: LeadSlot };
  /** "4.7" and "1,284", apart, or null where the source does not rate. */
  rated: { score: string; count: string } | null;
  /** The spread of reviews, one to five stars, or null when the listing did not say. */
  spread: [number, number, number, number, number] | null;
  /** The tile: the business's own mark, else the listing's photo, else initials on a tint the kind decides. */
  tile: {
    initials: string;
    tint: number;
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
  /** Where it sits, when the door gave coordinates. */
  point: { lat: number; lng: number } | null;
}

/** A key from a plan ("chain", "wrong_kind") as a person would read it. */
const keyInWords = (key: string): string => {
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
  if (!path || !LEAD_MARK_PATH.test(path) || !supabaseUrl) return null;
  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
  if (!/^https:\/\//.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return null;
  return `${origin}/storage/v1/object/public/${LEAD_MARKS_BUCKET}/${path}`;
}

/**
 * One row's words and shapes (§6.2). Nothing here is a stored value. The search is the row's own (D5): a review
 * row names what it waits on in the queue's words, and the name card names the term it was found for.
 */
export function toLeadRowVM(r: LeadRowDto, tz: string, now: Date, search: LeadSearchDto | null = null): LeadRowVM {
  const nowMs = now.getTime();
  const foundMs = Date.parse(r.found_at);
  const m = r.member;
  const excludedBy = m.excluded_by ? keyInWords(m.excluded_by) : null;
  const rating = ratingLabel(r.rating, r.reviews);
  // Qualified wears its fit band; Needs review wears the judge's reason, which
  // is what it is waiting on; Excluded wears the criterion that left it out.
  const fitLabel =
    m.class === "excluded"
      ? (excludedBy ?? m.reason)
      : m.class === "review"
        ? m.reason
        : m.fit
          ? LEAD_FIT_WORDS[m.fit]
          : m.reason;
  const fitTitle =
    m.class === "excluded"
      ? `Left out: ${excludedBy ?? m.reason}`
      : m.class === "qualified" && rating
        ? `${m.reason} · ${rating.replace(" · ", " from ")} reviews`
        : m.reason;
  const area = [r.postal_code ?? "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  // D5: the row as the redesign reads it -- one line about where, two reach slots, the tile, its state, the card.
  const sub = [r.category, r.neighborhood ?? null, r.postal_code ?? null, milesLabel(m.distance_m) || null]
    .filter((x): x is string => !!x)
    .join(" · ");
  const rated =
    r.rating === null || r.rating === undefined
      ? null
      : { score: r.rating.toFixed(1), count: (r.reviews ?? 0).toLocaleString("en-US") };
  const spread: LeadRowVM["spread"] = r.reviews_dist
    ? [r.reviews_dist.one, r.reviews_dist.two, r.reviews_dist.three, r.reviews_dist.four, r.reviews_dist.five]
    : null;
  const waitsOn =
    m.class === "review"
      ? (leadReviewGroups([{ id: r.id, cls: "review", reasons: m.reasons ?? [] }], search)[0]?.label ?? m.reason)
      : null;
  const state: LeadRowVM["state"] =
    m.class === "excluded"
      ? "out"
      : m.class === "review"
        ? "review"
        : r.stage === "nurture"
          ? "contacted"
          : r.stage === "converted"
            ? "talking"
            : r.stage === "archived"
              ? "out"
              : "ready";
  // Ready is the silent default and wears nothing; every other state says which one it is. Review said nothing for
  // its whole life, which left `.ld-state-tag.review` in the stylesheet matching no row ever drawn -- and on a mixed
  // list a lead that is waiting on something looked exactly like a lead that is ready to call.
  const stateTag =
    state === "contacted"
      ? `${LEAD_STAGE_WORDS.nurture}${r.contacted_at ? ` · ${agoShort(Date.parse(r.contacted_at), nowMs)}` : ""}`
      : state === "talking"
        ? LEAD_STAGE_WORDS.converted
        : state === "review"
          ? LEAD_REVIEW_WORD
          : state === "out"
            ? m.class === "excluded"
              ? LEAD_LEFT_OUT_WORD
              : stageLabelOf(r.stage, r.closed_reason)
            : null;
  const term = search?.plan.terms[0] ?? null;
  const card: LeadRowCard = {
    about: r.about ?? null,
    today: leadTodayLine(r.hours ?? [], tz, now),
    where: leadWhere(r),
    site: r.website ? { label: siteHost(r.website) ?? r.website, href: `https://${r.website}` } : null,
    maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null,
    found: [
      {
        at: clockIn(tz, r.found_at, now),
        what: term
          ? r.rank
            ? `On Google Maps, #${r.rank} for “${term}”`
            : `On Google Maps, searching “${term}”`
          : "On a Google Maps listing",
      },
    ],
  };
  return {
    id: r.id,
    searchId: r.search_id,
    searchName: r.search_name ?? "",
    mark: initialsOf(r.business_name),
    name: r.business_name,
    places: r.places,
    category: r.category ?? "",
    area,
    cls: m.class,
    fit: m.class === "qualified" ? m.fit : null,
    fitLabel,
    fitTitle,
    email: r.email,
    emailState: r.email_state,
    // The cell draws the address itself; an address nobody has is blank, not "none".
    emailLabel: r.email ?? "",
    emailWord: LEAD_EMAIL_WORDS[r.email_state],
    // E.164, because the row dials it (plDial's tel:); the double tick says Maps and their own site agree.
    phone: r.phone,
    phoneAgrees: r.phone_agrees,
    phoneWrong: r.phone_wrong,
    reach: {
      email: r.email ? { address: r.email, state: r.email_state, word: LEAD_EMAIL_WORDS[r.email_state] } : null,
      phone: r.phone ? { number: r.phone, agrees: r.phone_agrees } : null,
    },
    reasons: m.reasons ?? [],
    why: m.reason,
    rating,
    reviewsTitle: r.reviews_dist
      ? `5★ ${r.reviews_dist.five} · 4★ ${r.reviews_dist.four} · 3★ ${r.reviews_dist.three} · 2★ ${r.reviews_dist.two} · 1★ ${r.reviews_dist.one}`
      : "",
    stage: r.stage,
    stageLabel: stageLabelOf(r.stage, r.closed_reason),
    contactId: r.contact_id ?? null,
    foundLabel: agoShort(foundMs, nowMs),
    foundLine: Number.isFinite(foundMs)
      ? `Found ${agoWords(foundMs, nowMs, { date: (at) => clockDate(at, tz, nowMs) })}`
      : "",
    foundAt: `${clockDateYear(foundMs, tz)} · ${clockTime(foundMs, tz)}`,
    distance: milesLabel(m.distance_m),
    source: LEAD_SOURCE_WORD,
    host: siteHost(r.website) ?? "",
    excludedBy,
    version: r.version,
    sub,
    slots: leadSlots(r),
    rated,
    spread,
    tile: {
      initials: initialsOf(r.business_name),
      tint: leadTintOf(r.category),
      image: leadTileSrc(r.image_url),
      band: r.image_url ?? null,
      logo: r.mark_url ?? null,
    },
    waitsOn,
    state,
    stateTag,
    card,
    point: typeof r.lat === "number" && typeof r.lng === "number" ? { lat: r.lat, lng: r.lng } : null,
  };
}

/** A round that is still going; one waiting on the owner is its own mark. */
const roundIsLive = (state: string): boolean => state !== "ended" && state !== "waiting_on_owner";

/** The rail's rows under Leads (§6.1): the six lists with counts, then the searches with their marks. */
export function leadRail(
  counts: LeadCounts,
  searches: LeadSearchDto[],
  now: Date = new Date(),
): {
  lists: { id: LeadList; label: string; count: number }[];
  searches: { id: string; name: string; count: number; mark: "live" | "question" | null; undoable: boolean }[];
} {
  // Said no is a list only when somebody said no: an empty row in the rail
  // teaches the owner nothing and costs them a line every day.
  const ids: LeadList[] = [
    "all",
    "ready",
    "nurture",
    "converted",
    ...(counts.said_no > 0 ? (["said_no"] as LeadList[]) : []),
    "not_a_fit",
  ];
  return {
    lists: ids.map((id) => ({ id, label: LEAD_LIST_WORDS[id], count: counts[id === "all" ? "all" : id] })),
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.round?.counted ?? 0,
      undoable: leadUndoable(s, now),
      mark: !s.round
        ? null
        : s.round.state === "waiting_on_owner"
          ? "question"
          : roundIsLive(s.round.state)
            ? "live"
            : null,
    })),
  };
}

/** "322 leads · 272 ready · 3 searches", and "1 search needs you" when one waits. */
export function leadsStanding(
  counts: LeadCounts,
  searches: LeadSearchDto[],
): { total: string; parts: string[]; needsYou: { count: number; searchId: string } | null } {
  const waiting = searches.filter((s) => s.round?.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads`,
    parts: [`${counts.ready} ready`, `${searches.length} ${searches.length === 1 ? "search" : "searches"}`],
    needsYou: waiting.length ? { count: waiting.length, searchId: waiting[0]!.id } : null,
  };
}
