import { clockDate, clockDateYear, clockTime } from "../shared/clock.js";
import { leadSlots, leadTileSrc, leadTintOf, leadTodayLine, leadUndoable, leadWhere } from "./lead-facts.js";
import { clockIn, milesLabel } from "./lead-helpers.js";
import { leadReviewGroups } from "./lead-review.js";
import { isLeadList } from "./lead-import.js";
import { LEAD_DIRECTORY_WORDS, leadAddresseeOf } from "./lead-kind.js";
import { siteHost } from "./search/clean.js";
import {
  LEAD_CLASS_WORDS,
  LEAD_CLOSED_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_LIST_WORDS,
  LEAD_REVIEW_WORD,
  LEAD_SOURCE_WORD,
  LEAD_STAGE_WORDS
} from "./lead-words.js";
import { agoShort, agoWords } from "../shared/time.js";
import { publicObjectSrc } from "../shared/link.js";
import { reviewsPhrase } from "../shared/words.js";
import { initialsOf } from "../conversations/thread-contact.js";
const LEAD_BAND_ORDER = ["qualified", "review", "excluded"];
export function leadBand(search) {
  const r = search?.round;
  if (!r) return null;
  const f = r.fits ?? { strong: 0, look: 0, long: 0 };
  const fits = ["strong", "look", "long"].map((id) => ({ id, label: LEAD_FIT_WORDS[id], count: f[id] }));
  return {
    // The tabs say the pills' words (LEAD_CLASS_WORDS: Qualified, Needs review, Left out) with the count in front, and the
    // page draws them in the pills' tones (stateOf("lead_class")): a tab and a pill for one state read one map.
    classes: LEAD_BAND_ORDER.map((id) => ({ id, label: `${r[id]} ${LEAD_CLASS_WORDS[id]}`, count: r[id] })),
    fits,
    mixed: fits.filter((x) => x.count > 0).length > 1
  };
}
const keyInWords = (key) => {
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
};
const ratingLabel = (rating, reviews) => rating === null || rating === void 0 ? "" : `${rating.toFixed(1)} \xB7 ${reviews ?? 0}`;
const stageLabelOf = (stage, closedReason) => stage === "archived" ? LEAD_CLOSED_WORDS[closedReason] ?? LEAD_STAGE_WORDS.archived : LEAD_STAGE_WORDS[stage];
export const LEAD_MARKS_BUCKET = "lead-marks";
export const LEAD_MARK_PATH = /^[0-9a-f]{64}\.(png|jpg|webp|gif|ico)$/;
export function leadMarkSrc(supabaseUrl, path) {
  if (!path || !LEAD_MARK_PATH.test(path)) return null;
  return publicObjectSrc(supabaseUrl, LEAD_MARKS_BUCKET, path);
}
export function leadRatingOf(r) {
  if (r.rating === null || r.rating === void 0) return null;
  const n = r.reviews ?? 0;
  return { score: r.rating.toFixed(1), count: n.toLocaleString("en-US"), reviews: reviewsPhrase(n) };
}
export function toLeadRowVM(r, tz, now, search = null) {
  const nowMs = now.getTime();
  const foundMs = Date.parse(r.found_at);
  const m = r.member;
  const excludedBy = m.excluded_by ? keyInWords(m.excluded_by) : null;
  const rating = ratingLabel(r.rating, r.reviews);
  const rated = leadRatingOf(r);
  const fitLabel = m.class === "excluded" ? excludedBy ?? m.reason : m.class === "review" ? m.reason : m.fit ? LEAD_FIT_WORDS[m.fit] : m.reason;
  const fitTitle = m.class === "excluded" ? `Left out: ${excludedBy ?? m.reason}` : m.class === "qualified" && rated ? `${m.reason} \xB7 ${rated.score} from ${rated.reviews}` : m.reason;
  const area = [r.postal_code ?? "", [r.city, r.state].filter(Boolean).join(", ")].filter(Boolean).join(" \xB7 ");
  const sub = subLineOf(r, m.distance_m);
  const spread = r.reviews_dist ? [r.reviews_dist.one, r.reviews_dist.two, r.reviews_dist.three, r.reviews_dist.four, r.reviews_dist.five] : null;
  const waitsOn = m.class === "review" ? leadReviewGroups([{ id: r.id, cls: "review", reasons: m.reasons ?? [] }], search)[0]?.label ?? m.reason : null;
  const state = m.class === "excluded" ? "out" : m.class === "review" ? "review" : r.stage === "nurture" ? "contacted" : r.stage === "converted" ? "talking" : r.stage === "archived" ? "out" : "ready";
  const stateTag = state === "contacted" ? `${LEAD_STAGE_WORDS.nurture}${r.contacted_at ? ` \xB7 ${agoShort(Date.parse(r.contacted_at), nowMs)}` : ""}` : state === "talking" ? LEAD_STAGE_WORDS.converted : state === "review" ? LEAD_REVIEW_WORD : state === "out" ? m.class === "excluded" ? LEAD_LEFT_OUT_WORD : stageLabelOf(r.stage, r.closed_reason) : null;
  const term = search?.plan?.terms[0] ?? null;
  const card = {
    about: r.about ?? null,
    today: leadTodayLine(r.hours ?? [], tz, now),
    where: leadWhere(r),
    site: r.website ? { label: siteHost(r.website) ?? r.website, href: `https://${r.website}` } : null,
    maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null,
    found: [
      {
        at: clockIn(tz, r.found_at, now),
        what: foundLine(r, term)
      }
    ]
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
      phone: r.phone ? { number: r.phone, agrees: r.phone_agrees } : null
    },
    reasons: m.reasons ?? [],
    why: m.reason,
    rating,
    reviewsTitle: r.reviews_dist ? `5\u2605 ${r.reviews_dist.five} \xB7 4\u2605 ${r.reviews_dist.four} \xB7 3\u2605 ${r.reviews_dist.three} \xB7 2\u2605 ${r.reviews_dist.two} \xB7 1\u2605 ${r.reviews_dist.one}` : "",
    stage: r.stage,
    stageLabel: stageLabelOf(r.stage, r.closed_reason),
    contactId: r.contact_id ?? null,
    foundLabel: agoShort(foundMs, nowMs),
    foundLine: Number.isFinite(foundMs) ? `Found ${agoWords(foundMs, nowMs, { date: (at) => clockDate(at, tz, nowMs) })}` : "",
    foundAt: `${clockDateYear(foundMs, tz)} \xB7 ${clockTime(foundMs, tz)}`,
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
      logo: r.mark_url ?? null
    },
    waitsOn,
    state,
    stateTag,
    card,
    point: typeof r.lat === "number" && typeof r.lng === "number" ? { lat: r.lat, lng: r.lng } : null
  };
}
export function leadRowOf(r, tz, now, search = null) {
  return { ...toLeadRowVM(r, tz, now, search), chainId: r.chain_id ?? null, laterAt: r.member.later_at ?? null };
}
function subLineOf(r, distanceM) {
  const who = leadAddresseeOf(r);
  return [
    who ? [who.name, who.title].filter(Boolean).join(", ") : null,
    r.category,
    r.neighborhood ?? null,
    r.postal_code ?? null,
    milesLabel(distanceM) || null
  ].filter((x) => !!x).join(" \xB7 ");
}
const roundIsLive = (state) => state !== "ended" && state !== "waiting_on_owner";
function foundLine(r, term) {
  if (r.kind === "company") return LEAD_DIRECTORY_WORDS.found;
  if (!r.place_id) return "From your list";
  if (!term) return "On a Google Maps listing";
  return r.rank ? `On Google Maps, #${r.rank} for \u201C${term}\u201D` : `On Google Maps, searching \u201C${term}\u201D`;
}
export function leadRail(counts, searches, now = /* @__PURE__ */ new Date()) {
  const ids = [
    "all",
    "ready",
    "nurture",
    "converted",
    ...counts.said_no > 0 ? ["said_no"] : [],
    "not_a_fit"
  ];
  return {
    lists: ids.map((id) => ({ id, label: LEAD_LIST_WORDS[id], count: counts[id === "all" ? "all" : id] })),
    searches: searches.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.round?.counted ?? 0,
      undoable: leadUndoable(s, now),
      list: isLeadList(s),
      people: !!s.people,
      mark: !s.round ? null : s.round.state === "waiting_on_owner" ? "question" : roundIsLive(s.round.state) ? "live" : null
    }))
  };
}
export function leadsStanding(counts, searches) {
  const waiting = searches.filter((s) => s.round?.state === "waiting_on_owner");
  return {
    total: `${counts.all} leads`,
    parts: [`${counts.ready} ready`, `${searches.length} ${searches.length === 1 ? "search" : "searches"}`],
    needsYou: waiting.length ? { count: waiting.length, searchId: waiting[0].id } : null
  };
}
