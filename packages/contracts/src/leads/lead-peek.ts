/**
 * A lead's peek: its reach, today's line, its hours and its week. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import type { LeadCheck, LeadRowDto, LeadSearchDto } from "./lead-dtos";
import {
  leadCheckWord,
  leadExclusionWord,
  leadHoursShort,
  leadSlots,
  leadTileSrc,
  leadTintOf,
  leadTodayLine,
  leadWhere,
} from "./lead-facts";
import { CLOCK, clockIn, hourOf, milesLabel } from "./lead-helpers";
import type { LeadSlot } from "./lead-row";
import type { LeadEmailState, LeadSearchPlan } from "./lead-search";
import { roleAtLeast } from "../config/roles";
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
  type LeadClass,
  leadLowShare,
  type LeadStage,
} from "./lead-words";
import { formatPhoneDisplay } from "../shared/phone";
import { initialsOf } from "../conversations/thread-contact";
import { DAY_MS } from "../shared/time";

/* ---------------------------------------------------------------- the peek */

export interface LeadPeekReach {
  /** `tip` is what the phone's mark says when pointed at, focused or tapped: the note, as a sentence. */
  phone: { value: string; note: string; tip: string; tel: string | null; wrong: boolean } | null;
  /** `standard` is null beside an address that checks out: there it would be a line saying nothing (D5). */
  /** `tip` is everything the mailbox's mark says: the state where the note does not restate it, the note, the standard. */
  email: {
    value: string;
    note: string;
    tip: string;
    standard: string | null;
    state: LeadEmailState;
    word: string;
    address: string | null;
    canDraft: boolean;
  };
  locked: { title: string; line: string };
}

export interface LeadPeekVM {
  id: string;
  searchId: string | null;
  mark: string;
  name: string;
  /** The first two words of the name, for "Back to Zilker Strength". */
  short: string;
  sub: string;
  /** Who they are, from what the listing shows (D2): each null when the listing did not say. */
  about: string | null;
  where: { line: string; href: string | null } | null;
  today: string | null;
  claimedNote: string | null;
  /* ---- D5: the peek re-cut ---- */
  /**
   * The business's face, in the same shape the row's tile wears it: the mark over the listing's photo over initials
   * on a tint the kind decides. The photograph has ONE home, here -- the band paints it under the mark and the
   * lightbox opens it on its own. While it rode beside the tile the two surfaces drifted over which one wins (D6).
   */
  tile: {
    initials: string;
    tint: number;
    /** The listing's photo as the row's tile draws it (leadTileSrc): already in the browser from the list, so the
     *  band shows it at once, softened, while its own size arrives. */
    image: string | null;
    /** The whole photograph at the listing's own size: the band and the photo expanded draw it. */
    band: string | null;
    logo: string | null;
  };
  /**
   * "4.7" and "1,284", apart; null where the source does not rate. `low` is the one thing five bars said that an
   * average cannot, and it is null unless it is worth saying: see `leadLowShare`.
   */
  rated: { score: string; count: string; low: string | null } | null;
  /** The two reach slots, as the row wears them. */
  slots: { phone: LeadSlot; mailbox: LeadSlot };
  /** The week's hours as bars, in the listing's own order, today marked; [] when the listing showed no hours. */
  week: LeadWeekRow[];
  /** "From the listing": the facts about the place the expanded photo lists beside it. */
  facts: { k: string; v: string }[];
  /** "Open every day · 11 AM to 10 PM": the head the week folds under; "" when the listing published no hours. */
  weekSummary: string;
  /** "5 checks passed · 2 couldn't tell": the name of the verdict's evidence bar. */
  checksSummary: string;
  /** One segment per check, in the order they were made: the verdict's evidence bar, so the shape of the evidence reads at a glance. */
  checkDots: ("yes" | "unknown" | "no")[];
  /** "#19 on Google Maps · Sep 20": the line the trace folds under. */
  foundSummary: string;
  /** "1.2 mi", from the search's centre; "" when the search has none. */
  distance: string;
  cls: LeadClass;
  stage: LeadStage;
  stages: { id: "ready" | "nurture" | "converted"; label: string; on: boolean }[];
  canStage: boolean;
  notFitWord: string;
  fit: { word: string; cls: string; sentence: string };
  reach: LeadPeekReach;
  /** What was seen, then what Claude read (P2, §0.1), told apart by a hairline and by their marks: nothing read wears a plain check. */
  groups: {
    how: "seen" | "read";
    checks: {
      key: LeadCheck["key"];
      label: string;
      answer: "yes" | "no" | "unknown";
      source: string;
      reason: string | null;
    }[];
  }[];
  others: { summary: string; picked: string | null; items: { email: string; why: string }[] } | null;
  found: { at: string; what: string }[];
  links: {
    website: { label: string; href: string } | null;
    instagram: { label: string; href: string } | null;
    facebook: { label: string; href: string } | null;
    linkedin: { label: string; href: string } | null;
    tiktok: { label: string; href: string } | null;
    maps: { label: string; href: string } | null;
  };
  version: number;
}

/**
 * A check's label in the peek: the mailbox says the state it saw; what was seen is said in the check's own words; what
 * Claude read, in the plan's (the judge's keys are its, PR 9).
 */
const peekCheckLabel = (c: LeadCheck, search: LeadSearchDto | null, mailboxLabel: string): string =>
  c.key === "mailbox" ? mailboxLabel : leadCheckWord(c.how === "read" ? search : null, c.key, c.answer);

/**
 * What the peek's ⋯ menu offers the member looking at it (Reach out Part 4, PR 9). Erase is the owner's alone -- the
 * door refuses anyone else (DELETE leads/[id], role owner) -- and a secondary act, so a role that may not press it is
 * offered nothing rather than a gated item (legacy/CLAUDE.md, "Role gates"). A role the page cannot tell is not an
 * owner. An empty list draws no menu at all.
 */
export function leadPeekMenu(role: string | null | undefined): { id: "erase"; label: string; danger: true }[] {
  // The door's own ladder (config.ts roleAtLeast), never a second reading of it: a partner stands below an owner.
  return roleAtLeast(role ?? "", "owner") ? [{ id: "erase", label: LEAD_ERASE_WORDS.act, danger: true }] : [];
}

/**
 * One day of the week's hours as a bar across the day (D5): x and w in percent of 24 hours; null for a day the parser
 * cannot draw. `hours` is the listing's own words; `short` is what a surface shows ("10–6", leadHoursShort).
 */
export interface LeadWeekRow {
  day: string;
  hours: string;
  short: string;
  bar: { x: number; w: number } | null;
  today: boolean;
}

/**
 * The week in one line, so the seven rows can fold away behind it: how many days they open, and the hours they keep
 * on most of them. Nothing is claimed that the listing did not say -- a week with no two days alike says only how
 * many days it opens, because "most days" would then be one day.
 */
export function leadWeekSummary(week: LeadWeekRow[]): string {
  const open = week.filter((d) => d.hours && !/^closed/i.test(d.hours));
  if (!open.length) return "";
  const tally = new Map<string, number>();
  for (const d of open) tally.set(d.short, (tally.get(d.short) ?? 0) + 1);
  let best = "";
  let most = 0;
  for (const [hours, n] of tally)
    if (n > most) {
      best = hours;
      most = n;
    }
  const days = open.length === 7 ? "Open every day" : `Open ${open.length} day${open.length === 1 ? "" : "s"}`;
  if (most === open.length) return `${days} · ${best}`;
  if (most * 2 >= open.length) return `${days} · ${best} most days`;
  return days;
}

/**
 * The week's hours as bars (D5): "9 AM to 6 PM" is a bar from 37.5% to 75% of the day, "Open 24 hours" the whole
 * day, "Closed" no bar, and a line the parser cannot read keeps its words and draws nothing. Overnight hours run to
 * the end of the day. The listing's own order is kept; today is the business's own day (tz).
 */
export function leadWeekBars(hours: { day: string; hours: string }[], tz: string, now: Date): LeadWeekRow[] {
  const today = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now).toLowerCase();
  return hours.map((h) => {
    const text = h.hours.trim();
    let bar: LeadWeekRow["bar"] = null;
    if (/^open 24 hours$/i.test(text)) bar = { x: 0, w: 100 };
    else if (!/^closed/i.test(text)) {
      const m = text.match(CLOCK);
      if (m) {
        const a = hourOf(m[1], m[2], m[3]);
        let b = hourOf(m[4], m[5], m[6]);
        if (b <= a) b = 24;
        bar = { x: Math.round((a / 24) * 1000) / 10, w: Math.round(((b - a) / 24) * 1000) / 10 };
      }
    }
    return { day: h.day, hours: text, short: leadHoursShort(text), bar, today: h.day.toLowerCase() === today };
  });
}

/** The day something happened, as briefly as it can be said: "today", "yesterday", "Sep 20". "" when there is none. */
function dayIn(tz: string, iso: string | null, now: Date): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (key(at) === key(now)) return "today";
  if (key(at) === key(new Date(now.getTime() - DAY_MS))) return "yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(at);
}

/**
 * The peek (§9.2, P2, S12): the sub-line, the fit sentence, how to reach them, the checks in two groups (what was
 * seen, and what Claude read), the other addresses, Found, the site. Every sentence here, so the page says nothing
 * of its own. The mark is `initialsOf`, the same derivation the row wears, never a second one.
 */
export function toLeadPeekVM(r: LeadRowDto, search: LeadSearchDto | null, tz: string, now: Date): LeadPeekVM {
  const m = r.member;
  const area = [r.city, r.state].filter(Boolean).join(", ");
  const sub =
    [r.category, r.price ?? null, area].filter(Boolean).join(" · ") + (r.places > 1 ? ` · ${r.places} locations` : "");
  const fitWord =
    m.class === "qualified"
      ? m.fit
        ? LEAD_FIT_WORDS[m.fit]
        : LEAD_FIT_WORDS.look
      : // "venues. Venue brand on 828venues host." glued the chip to the reason; say what happened first.
        m.class === "review"
        ? LEAD_REVIEW_WORD
        : `${LEAD_LEFT_OUT_WORD} — ${leadExclusionWord(search, m.excluded_by)}`;
  const fitCls = m.class === "qualified" ? (m.fit ?? "look") : m.class === "review" ? "review" : "out";
  const standard = LEAD_CONTACT_STANDARD_WORDS[search?.plan.contact === "email" ? "email" : "phone"];
  const emailNote = r.email
    ? r.email_state === "ok"
      ? `${LEAD_MAILBOX_WORDS.ok} · checked ${dayIn(tz, r.email_checked_at, now) || "on finding it"}`
      : r.email_state === "checking"
        ? LEAD_MAILBOX_WORDS.checking
        : r.email_state === "invalid"
          ? `${LEAD_MAILBOX_WORDS.invalid}. Call instead.`
          : LEAD_MAILBOX_WORDS[r.email_state]
    : LEAD_NO_EMAIL_LINE;
  const mailboxLabel = LEAD_MAILBOX_WORDS[r.email_state];
  // Each note ends as a sentence, so two of them read as two. A state leads its tip only where the note does not say
  // it already: "Unconfirmed." before "Their server accepts every address", never "Checked." before "Mailbox exists".
  const stop = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  const emailTip = [
    ...(r.email && (r.email_state === "catch_all" || r.email_state === "unknown" || r.email_state === "invalid")
      ? [LEAD_EMAIL_WORDS[r.email_state]]
      : []),
    emailNote,
    ...(r.email_state === "ok" ? [] : [standard]),
  ]
    .map(stop)
    .join(" ");
  const seen: LeadPeekVM["groups"][number]["checks"] = [];
  const read: LeadPeekVM["groups"][number]["checks"] = [];
  for (const c of m.checks) {
    const label = peekCheckLabel(c, search, mailboxLabel);
    (c.how === "seen" ? seen : read).push({ key: c.key, label, answer: c.answer, source: c.source, reason: c.reason });
  }
  const others = m.other_emails.length
    ? {
        summary: `${m.other_emails.length} other address${m.other_emails.length === 1 ? "" : "es"} on their site`,
        picked: m.checks.find((c) => c.key === "own_address")?.reason ?? null,
        items: m.other_emails,
      }
    : null;
  const host = r.website;
  const siteLine = host
    ? r.email_state === "none"
      ? `${host} · no email on the home, contact or about pages`
      : `${host} · an email on the contact page`
    : "No website to check";
  const term = search?.plan.terms[0] ?? null;
  // D5: the peek re-cut -- the tile, the rating apart, the checks' head, the week, and the listing's facts.
  const passed = m.checks.filter((c) => c.answer === "yes").length;
  const unsure = m.checks.filter((c) => c.answer === "unknown").length;
  const failed = m.checks.filter((c) => c.answer === "no").length;
  const checksSummary =
    m.checks.length === 0
      ? ""
      : [
          `${passed} check${passed === 1 ? "" : "s"} passed`,
          ...(unsure ? [`${unsure} couldn't tell`] : []),
          ...(failed ? [`${failed} failed`] : []),
        ].join(" · ");
  const week = leadWeekBars(r.hours ?? [], tz, now);
  const rated =
    r.rating === null || r.rating === undefined
      ? null
      : {
          score: r.rating.toFixed(1),
          count: (r.reviews ?? 0).toLocaleString("en-US"),
          low: leadLowShare(r.reviews_dist ?? null),
        };
  const facts: LeadPeekVM["facts"] = [
    ...(r.category ? [{ k: "Kind", v: r.category }] : []),
    ...(r.price ? [{ k: "Price", v: r.price }] : []),
    ...(rated ? [{ k: "Rated", v: `${rated.score} from ${rated.count} review${r.reviews === 1 ? "" : "s"}` }] : []),
    ...(r.claimed === true
      ? [{ k: "Listing", v: "Claimed by the owner" }]
      : r.claimed === false
        ? [{ k: "Listing", v: "Not claimed by the owner" }]
        : []),
    ...(term && r.rank ? [{ k: "Found at", v: `#${r.rank} for “${term}”` }] : []),
    ...(r.places > 1 ? [{ k: "Other listings", v: `${r.places} listings for this business` }] : []),
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
      logo: r.mark_url ?? null,
    },
    rated,
    slots: leadSlots(r),
    week,
    weekSummary: leadWeekSummary(week),
    facts,
    checksSummary,
    checkDots: m.checks.map((c) => c.answer),
    distance: milesLabel(m.distance_m),
    name: r.business_name,
    about: r.about ?? null,
    where: leadWhere(r),
    today: leadTodayLine(r.hours ?? [], tz, now),
    claimedNote: r.claimed === false ? LEAD_UNCLAIMED_NOTE : null,
    short: r.business_name.split(/\s+/).slice(0, 2).join(" "),
    sub,
    cls: m.class,
    stage: r.stage,
    stages: (["ready", "nurture", "converted"] as const).map((id) => ({
      id,
      label: LEAD_STAGE_WORDS[id],
      on: r.stage === id,
    })),
    canStage: m.class !== "excluded",
    notFitWord: LEAD_CLOSED_WORDS.not_a_fit,
    fit: { word: fitWord, cls: fitCls, sentence: m.reason },
    reach: {
      phone: r.phone
        ? {
            value: formatPhoneDisplay(r.phone) ?? r.phone,
            note: r.phone_wrong
              ? "You marked this number wrong."
              : r.phone_agrees
                ? "The same number on Google Maps and their website"
                : "From their Google Maps listing",
            tip: r.phone_wrong
              ? "You marked this number wrong."
              : r.phone_agrees
                ? "The same number on Google Maps and their website."
                : "From their Google Maps listing.",
            tel: r.phone_wrong ? null : `tel:${r.phone}`,
            wrong: r.phone_wrong,
          }
        : null,
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
        canDraft: !!r.email && r.email_state !== "invalid" && r.email_state !== "none",
      },
      locked: { title: "Texts and WhatsApp", line: LEAD_LOCKED_LINE },
    },
    groups: [
      { how: "seen", checks: seen },
      { how: "read", checks: read },
    ].filter((g) => g.checks.length > 0) as LeadPeekVM["groups"],
    others,
    // Where it was found and when, in one short line: "#19 on Google Maps · Sep 20". The three steps behind it are a
    // few words each, and the minute each happened lives in its own hover: they happen within a minute or two of each
    // other, so four copies of "Sep 20, 2:02 PM" said nothing the head had not.
    foundSummary: [term && r.rank ? `#${r.rank} on Google Maps` : "On Google Maps", dayIn(tz, r.found_at, now)]
      .filter(Boolean)
      .join(" · "),
    found: [
      {
        at: clockIn(tz, r.found_at, now),
        what: term
          ? r.rank
            ? `Google Maps · #${r.rank} for “${term}”`
            : `Google Maps · searching “${term}”`
          : "A Google Maps listing",
      },
      { at: clockIn(tz, r.found_at, now), what: siteLine },
      // The mailbox's long sentence is the email row's to say; here it is the state's one word.
      { at: clockIn(tz, r.email_checked_at ?? r.found_at, now), what: `Mailbox · ${LEAD_EMAIL_WORDS[r.email_state]}` },
    ],
    links: {
      website: host ? { label: host, href: `https://${host}` } : null,
      instagram: r.instagram ? { label: "Instagram", href: r.instagram } : null,
      facebook: r.facebook_url ? { label: "Facebook", href: r.facebook_url } : null,
      linkedin: r.linkedin_url ? { label: "LinkedIn", href: r.linkedin_url } : null,
      tiktok: r.tiktok_url ? { label: "TikTok", href: r.tiktok_url } : null,
      maps: r.maps_url ? { label: "Google Maps", href: r.maps_url } : null,
    },
    version: r.version,
  };
}

/** What removing a search keeps: the leads already worked. Said before the press; the number comes after it. */
export const LEAD_REMOVE_KEEPS = "Keeps the ones you contacted or are talking to.";

/**
 * A kept search, in the owner's own words (§8.10): what they asked for, the day they asked, and what the plan
 * leaves out. One derivation, because the rail's menu and the question before Remove both say it.
 */
export function leadSearchWords(
  s: { asked: string; asked_on: string; plan?: LeadSearchPlan } | null,
  tz: string,
): { askedLine: string; keepsLine: string } {
  if (!s) return { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS };
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(
    new Date(s.asked_on),
  );
  // Release A spells an exclusion `exclusions[]: { key, text, origin }` and a criterion
  // `criteria[]: { key, text, standard, required }` (lead-search.ts, LeadSearchPlanSchema):
  // what is left out is the exclusions list, and its words are `text`.
  // Said once: an exclusion the owner's own words already name ("…, leaving out Starbucks and other chains") is not
  // said again after them. One Claude added ("chain stores like Barnes & Noble") still is.
  const asked = s.asked.toLowerCase();
  const left = (s.plan?.exclusions ?? []).map((c) => c.text).filter((t) => t && !asked.includes(t.toLowerCase()));
  const leaving = left.length ? ` Leaving out ${left.join(" and ")}.` : "";
  return { askedLine: `You asked on ${day}: “${s.asked}”.${leaving}`, keepsLine: LEAD_REMOVE_KEEPS };
}
