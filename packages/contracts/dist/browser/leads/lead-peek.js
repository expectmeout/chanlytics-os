import {
  leadCheckWord,
  leadExclusionWord,
  leadHoursShort,
  leadSlots,
  leadTileSrc,
  leadTintOf,
  leadTodayLine,
  leadWhere
} from "./lead-facts.js";
import { CLOCK, clockIn, hourOf, milesLabel } from "./lead-helpers.js";
import { leadRatingOf } from "./lead-row.js";
import { LEAD_DIRECTORY_WORDS, leadCompanyOf } from "./lead-kind.js";
import { roleAtLeast } from "../config/roles.js";
import {
  LEAD_CLOSED_WORDS,
  LEAD_CONTACT_STANDARD_WORDS,
  LEAD_EMAIL_WORDS,
  LEAD_ERASE_WORDS,
  LEAD_FIT_WORDS,
  LEAD_LEFT_OUT_WORD,
  LEAD_LOCKED_LINE,
  LEAD_MAILBOX_WORDS,
  LEAD_NO_EMAIL_LINE,
  LEAD_REVIEW_WORD,
  LEAD_STAGE_WORDS,
  LEAD_UNCLAIMED_NOTE,
  leadLowShare,
  leadRatingSpread
} from "./lead-words.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { initialsOf } from "../conversations/thread-contact.js";
import { dateFormat, DAY_MS } from "../shared/time.js";
const peekCheckLabel = (c, search, mailboxLabel) => c.key === "mailbox" ? mailboxLabel : leadCheckWord(search, c.key, c.answer);
export function leadPeekMenu(role) {
  return roleAtLeast(role ?? "", "owner") ? [{ id: "erase", label: LEAD_ERASE_WORDS.act, danger: true }] : [];
}
export function leadWeekSummary(week) {
  const open = week.filter((d) => d.hours && !/^closed/i.test(d.hours));
  if (!open.length) return "";
  const tally = /* @__PURE__ */ new Map();
  for (const d of open) tally.set(d.short, (tally.get(d.short) ?? 0) + 1);
  let best = "";
  let most = 0;
  for (const [hours, n] of tally)
    if (n > most) {
      best = hours;
      most = n;
    }
  const days = open.length === 7 ? "Open every day" : `Open ${open.length} day${open.length === 1 ? "" : "s"}`;
  if (most === open.length) return `${days} \xB7 ${best}`;
  if (most * 2 >= open.length) return `${days} \xB7 ${best} most days`;
  return days;
}
export function leadWeekBars(hours, tz, now) {
  const today = dateFormat("en-US", { timeZone: tz, weekday: "long" }).format(now).toLowerCase();
  return hours.map((h) => {
    const text = h.hours.trim();
    let bar = null;
    if (/^open 24 hours$/i.test(text)) bar = { x: 0, w: 100 };
    else if (!/^closed/i.test(text)) {
      const m = text.match(CLOCK);
      if (m) {
        const a = hourOf(m[1], m[2], m[3]);
        let b = hourOf(m[4], m[5], m[6]);
        if (b <= a) b = 24;
        bar = { x: Math.round(a / 24 * 1e3) / 10, w: Math.round((b - a) / 24 * 1e3) / 10 };
      }
    }
    return { day: h.day, hours: text, short: leadHoursShort(text), bar, today: h.day.toLowerCase() === today };
  });
}
function dayIn(tz, iso, now) {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const key = (d) => dateFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (key(at) === key(now)) return "today";
  if (key(at) === key(new Date(now.getTime() - DAY_MS))) return "yesterday";
  return dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at);
}
const peekPlanOf = (search) => ({
  standard: LEAD_CONTACT_STANDARD_WORDS[(search?.plan ?? search?.people)?.contact === "email" ? "email" : "phone"],
  term: search?.plan?.terms[0] ?? null
});
function foundWords(r, term) {
  const host = r.website;
  if (r.kind === "company")
    return {
      summary: LEAD_DIRECTORY_WORDS.found,
      what: LEAD_DIRECTORY_WORDS.found,
      site: host ? `${host} \xB7 ${LEAD_DIRECTORY_WORDS.address}` : LEAD_DIRECTORY_WORDS.addressAlone
    };
  if (!r.place_id)
    return {
      summary: "From your list",
      what: "From your list",
      site: host ? `${host} \xB7 the address came with your list` : "The address came with your list"
    };
  return {
    summary: term && r.rank ? `#${r.rank} on Google Maps` : "On Google Maps",
    what: term ? r.rank ? `Google Maps \xB7 #${r.rank} for \u201C${term}\u201D` : `Google Maps \xB7 searching \u201C${term}\u201D` : "A Google Maps listing",
    site: host ? r.email_state === "none" ? `${host} \xB7 no email on the home, contact or about pages` : `${host} \xB7 an email on the contact page` : "No website to check"
  };
}
function leadRated(r) {
  const base = leadRatingOf(r);
  if (!base) return null;
  return {
    ...base,
    low: leadLowShare(r.reviews_dist ?? null),
    ...r.reviews_dist ? { spread: leadRatingSpread(r.reviews_dist) } : {}
  };
}
const claimOf = (r) => ({
  claimedNote: r.claimed === false ? LEAD_UNCLAIMED_NOTE : null,
  claimed: r.claimed ?? null
});
function checksSummaryOf(checks) {
  if (checks.length === 0) return "";
  const passed = checks.filter((c) => c.answer === "yes").length;
  const unsure = checks.filter((c) => c.answer === "unknown").length;
  const failed = checks.filter((c) => c.answer === "no").length;
  return [
    `${passed} check${passed === 1 ? "" : "s"} passed`,
    ...unsure ? [`${unsure} couldn't tell`] : [],
    ...failed ? [`${failed} failed`] : []
  ].join(" \xB7 ");
}
export function toLeadPeekVM(r, search, tz, now) {
  const m = r.member;
  const area = [r.city, r.state].filter(Boolean).join(", ");
  const sub = [r.category, r.price ?? null, area].filter(Boolean).join(" \xB7 ") + (r.places > 1 ? ` \xB7 ${r.places} locations` : "");
  const fitWord = m.class === "qualified" ? m.fit ? LEAD_FIT_WORDS[m.fit] : LEAD_FIT_WORDS.look : (
    // "venues. Venue brand on 828venues host." glued the chip to the reason; say what happened first.
    m.class === "review" ? LEAD_REVIEW_WORD : `${LEAD_LEFT_OUT_WORD} \u2014 ${leadExclusionWord(search, m.excluded_by)}`
  );
  const fitCls = m.class === "qualified" ? m.fit ?? "look" : m.class === "review" ? "review" : "out";
  const { standard, term } = peekPlanOf(search);
  const emailNote = r.email ? r.email_state === "ok" ? `${LEAD_MAILBOX_WORDS.ok} \xB7 checked ${dayIn(tz, r.email_checked_at, now) || "on finding it"}` : r.email_state === "checking" ? LEAD_MAILBOX_WORDS.checking : r.email_state === "invalid" ? `${LEAD_MAILBOX_WORDS.invalid}. Call instead.` : LEAD_MAILBOX_WORDS[r.email_state] : LEAD_NO_EMAIL_LINE;
  const mailboxLabel = LEAD_MAILBOX_WORDS[r.email_state];
  const stop = (s) => /[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
  const emailTip = [
    ...r.email && (r.email_state === "catch_all" || r.email_state === "unknown" || r.email_state === "invalid") ? [LEAD_EMAIL_WORDS[r.email_state]] : [],
    emailNote,
    ...r.email_state === "ok" ? [] : [standard]
  ].map(stop).join(" ");
  const seen = [];
  const read = [];
  for (const c of m.checks) {
    const label = peekCheckLabel(c, search, mailboxLabel);
    (c.how === "seen" ? seen : read).push({ key: c.key, label, answer: c.answer, source: c.source, reason: c.reason });
  }
  const others = m.other_emails.length ? {
    summary: `${m.other_emails.length} other address${m.other_emails.length === 1 ? "" : "es"} on their site`,
    picked: m.checks.find((c) => c.key === "own_address")?.reason ?? null,
    items: m.other_emails
  } : null;
  const host = r.website;
  const where = foundWords(r, term);
  const checksSummary = checksSummaryOf(m.checks);
  const week = leadWeekBars(r.hours ?? [], tz, now);
  const rated = leadRated(r);
  const facts = [
    ...r.category ? [{ k: "Kind", v: r.category }] : [],
    ...r.price ? [{ k: "Price", v: r.price }] : [],
    ...rated ? [{ k: "Rated", v: `${rated.score} from ${rated.reviews}` }] : [],
    ...r.claimed === true ? [{ k: "Listing", v: "Claimed by the owner" }] : r.claimed === false ? [{ k: "Listing", v: "Not claimed by the owner" }] : [],
    ...term && r.rank ? [{ k: "Found at", v: `#${r.rank} for \u201C${term}\u201D` }] : [],
    ...r.places > 1 ? [{ k: "Other listings", v: `${r.places} listings for this business` }] : []
  ];
  return {
    id: r.id,
    searchId: r.search_id ?? null,
    mark: initialsOf(r.business_name),
    tile: {
      initials: initialsOf(r.business_name),
      tint: leadTintOf(r.category),
      image: leadTileSrc(r.image_url),
      band: r.image_url ?? null,
      logo: r.mark_url ?? null
    },
    rated,
    slots: leadSlots(r),
    week,
    weekSummary: leadWeekSummary(week),
    facts,
    checksSummary,
    checkDots: m.checks.map((c) => ({ answer: c.answer, how: c.how })),
    distance: milesLabel(m.distance_m),
    name: r.business_name,
    about: r.about ?? null,
    company: leadCompanyOf(r),
    where: leadWhere(r),
    today: leadTodayLine(r.hours ?? [], tz, now),
    ...claimOf(r),
    short: r.business_name.split(/\s+/).slice(0, 2).join(" "),
    sub,
    cls: m.class,
    stage: r.stage,
    contactId: r.contact_id ?? null,
    stages: ["ready", "nurture", "converted"].map((id) => ({
      id,
      label: LEAD_STAGE_WORDS[id],
      on: r.stage === id
    })),
    canStage: m.class !== "excluded",
    notFitWord: LEAD_CLOSED_WORDS.not_a_fit,
    fit: { word: fitWord, cls: fitCls, sentence: m.reason },
    reach: {
      phone: r.phone ? {
        value: formatPhoneDisplay(r.phone) ?? r.phone,
        note: r.phone_wrong ? "You marked this number wrong." : r.phone_agrees ? "The same number on Google Maps and their website" : "On their Google Maps listing only, so not confirmed",
        tip: r.phone_wrong ? "You marked this number wrong." : r.phone_agrees ? "The same number on Google Maps and their website." : "On their Google Maps listing only; their website doesn't show it, so it isn't confirmed.",
        tel: r.phone_wrong ? null : `tel:${r.phone}`,
        wrong: r.phone_wrong
      } : null,
      email: {
        value: r.email ?? "No email on their site",
        note: emailNote,
        tip: emailTip,
        // The standard explains a lead the mailbox did not settle. Beside an address that checks out it is a line
        // saying nothing, on every good lead: null there, so the peek reads shorter where there is nothing to say.
        standard: r.email_state === "ok" ? null : standard,
        state: r.email_state,
        word: LEAD_EMAIL_WORDS[r.email_state],
        address: r.email,
        canDraft: !!r.email && r.email_state !== "invalid" && r.email_state !== "none"
      },
      locked: { title: "Texts and WhatsApp", line: LEAD_LOCKED_LINE }
    },
    groups: [
      { how: "seen", checks: seen },
      { how: "read", checks: read }
    ].filter((g) => g.checks.length > 0),
    others,
    // Where it was found and when, in one short line: "#19 on Google Maps · Sep 20". The three steps behind it are a
    // few words each, and the minute each happened lives in its own hover: they happen within a minute or two of each
    // other, so four copies of "Sep 20, 2:02 PM" said nothing the head had not.
    foundSummary: [where.summary, dayIn(tz, r.found_at, now)].filter(Boolean).join(" \xB7 "),
    found: [
      { at: clockIn(tz, r.found_at, now), what: where.what },
      { at: clockIn(tz, r.found_at, now), what: where.site },
      // The mailbox's long sentence is the email row's to say; here it is the state's one word.
      { at: clockIn(tz, r.email_checked_at ?? r.found_at, now), what: `Mailbox \xB7 ${LEAD_EMAIL_WORDS[r.email_state]}` }
    ],
    links: {
      website: host ? { label: host, href: `https://${host}` } : null,
      instagram: r.instagram ? { label: "Instagram", href: r.instagram } : null,
      facebook: r.facebook_url ? { label: "Facebook", href: r.facebook_url } : null,
      linkedin: r.linkedin_url ? { label: "LinkedIn", href: r.linkedin_url } : null,
      tiktok: r.tiktok_url ? { label: "TikTok", href: r.tiktok_url } : null,
      maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null
    },
    version: r.version
  };
}
export const LEAD_REMOVE_KEEPS = "Keeps the ones you contacted or are talking to.";
export function leadSearchWords(s, tz) {
  if (!s) return { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS };
  const day = dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(s.asked_on));
  if (s.via === "import")
    return { askedLine: `Your list, imported on ${day}: \u201C${s.asked}\u201D.`, keepsLine: LEAD_REMOVE_KEEPS };
  if (s.via === "chosen") return { askedLine: `Leads you chose on ${day}.`, keepsLine: LEAD_REMOVE_KEEPS };
  const asked = s.asked.toLowerCase();
  const left = (s.plan?.exclusions ?? []).map((c) => c.text).filter((t) => t && !asked.includes(t.toLowerCase()));
  const leaving = left.length ? ` Leaving out ${left.join(" and ")}.` : "";
  return { askedLine: `You asked on ${day}: \u201C${s.asked}\u201D.${leaving}`, keepsLine: LEAD_REMOVE_KEEPS };
}
