/**
 * What the peek, the row and the review all read of one lead: where it is, today's line, whether an act can be
 * undone, its tint, its tile and its slots. Moved whole from leads.ts (Reach out Part 2.5), which re-exports it.
 */
import type { LeadRowDto, LeadSearchDto } from "./lead-dtos";
import { CLOCK, hourOf } from "./lead-helpers";
import type { LeadSlot, LeadSlotState } from "./lead-row";
import { LEAD_KIND_KEY, LEAD_UNREACHABLE_KEY, leadKindWord } from "./lead-search";
import { LEAD_CHECK_WORDS, LEAD_LEFT_OUT_WORD, LEAD_MAILBOX_WORDS, LEAD_UNREACHABLE_WORD } from "./lead-words";

/**
 * Today, as an owner about to call needs it: whether they are open NOW. "Open today · 11 AM to 5 PM" made them work
 * it out; "Open until 5 PM" is the answer. Before opening it says when they open, after closing that they are closed,
 * and a day the listing marks closed says so. Hours the parser cannot read keep their words, shortened. null when the
 * listing showed no hours. The day and the clock are the business's own (tz).
 */
export function leadTodayLine(hours: { day: string; hours: string }[], tz: string, now: Date): string | null {
  if (!hours.length) return null;
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(d).toLowerCase();
  const hoursOn = (d: Date) => hours.find((x) => x.day.toLowerCase() === dayOf(d))?.hours.trim() ?? null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const at =
    Number(parts.find((p) => p.type === "hour")?.value ?? 0) +
    Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  const clock = (hh: string, mm: string | undefined, ap: string) =>
    `${hh}${mm && mm !== "00" ? `:${mm}` : ""} ${ap.toUpperCase()}`;
  // A night that runs past midnight belongs to the day it began: at 1 AM, a bar that opened at 5 PM "to 2 AM" is open.
  const last = hoursOn(new Date(now.getTime() - 86_400_000))?.match(CLOCK);
  if (
    last &&
    hourOf(last[4], last[5], last[6]) <= hourOf(last[1], last[2], last[3]) &&
    at < hourOf(last[4], last[5], last[6])
  ) {
    return `Open until ${clock(last[4], last[5], last[6])}`;
  }
  const text = hoursOn(now);
  if (text === null) return null;
  if (/^closed/i.test(text)) return "Closed today";
  if (/^open 24 hours$/i.test(text)) return "Open 24 hours";
  const m = text.match(CLOCK);
  if (!m) return `Open today · ${leadHoursShort(text)}`;
  const open = hourOf(m[1], m[2], m[3]);
  let close = hourOf(m[4], m[5], m[6]);
  if (close <= open) close += 24;
  if (at < open) return `Opens ${clock(m[1], m[2], m[3])}`;
  if (at < close) return `Open until ${clock(m[4], m[5], m[6])}`;
  return "Closed now";
}

/**
 * Hours as few characters as say them. "10 AM to 6 PM" is "10–6": a range that runs from morning into afternoon needs
 * neither half said. One inside a single half says it once ("5–10 PM"), and one that runs into the night keeps both
 * ("5 PM–2 AM"). "Open 24 hours" is "24 hours". A line the parser cannot read keeps its words.
 */
export function leadHoursShort(text: string): string {
  const t = text.trim();
  if (/^open 24 hours$/i.test(t)) return "24 hours";
  if (/^closed/i.test(t)) return "Closed";
  const at = (h: string, mm: string | undefined) => (mm && mm !== "00" ? `${h}:${mm}` : h);
  const ranges = t.split(/\s*,\s*/).map((part) => {
    const m = part.match(CLOCK);
    if (!m) return null;
    const a1 = m[3].toUpperCase();
    const a2 = m[6].toUpperCase();
    const wraps = hourOf(m[4], m[5], m[6]) <= hourOf(m[1], m[2], m[3]);
    if (!wraps && a1 === "AM" && a2 === "PM") return `${at(m[1], m[2])}–${at(m[4], m[5])}`;
    if (!wraps && a1 === a2) return `${at(m[1], m[2])}–${at(m[4], m[5])} ${a2}`;
    return `${at(m[1], m[2])} ${a1}–${at(m[4], m[5])} ${a2}`;
  });
  return ranges.every(Boolean) ? ranges.join(", ") : t;
}

/** "101 Biscayne Blvd, Miami, FL 33132", with the Maps page when the listing has one. */
export function leadWhere(
  r: Pick<LeadRowDto, "street" | "city" | "state" | "postal_code" | "maps_url">,
): { line: string; href: string | null } | null {
  const town = [r.city, r.state].filter(Boolean).join(", ") + (r.postal_code ? ` ${r.postal_code}` : "");
  const line = [r.street, town].filter(Boolean).join(", ");
  return line ? { line, href: r.maps_url ?? null } : null;
}

/** The owner's own word for the criterion a place was left out by; the plan holds it. */
/** A day, from the round's end, in which the untouched leads may be removed and the month credited (§8.6). */
export const LEAD_UNDO_MS = 24 * 60 * 60_000;

/**
 * Whether a search's latest round may still be undone: ended within the day,
 * and not undone already. Read by the rail's menu, which is where the removal
 * lives -- not the strip, where "Undo" beside "yours" read as deleting what was
 * just paid for.
 */
export function leadUndoable(
  s: { round: { undo_op_id: string | null; ended_at: string | null } | null } | null,
  now: Date,
): boolean {
  const r = s?.round;
  return !!r && !r.undo_op_id && !!r.ended_at && now.getTime() - Date.parse(r.ended_at) < LEAD_UNDO_MS;
}

export function leadExclusionWord(search: LeadSearchDto | null, key: string | null): string {
  if (!key) return LEAD_LEFT_OUT_WORD;
  const plan = search?.plan;
  if (key === LEAD_KIND_KEY) return plan ? leadKindWord(plan.name) : LEAD_LEFT_OUT_WORD;
  if (key === LEAD_UNREACHABLE_KEY) return LEAD_UNREACHABLE_WORD;
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return ex.text;
  const cr = plan?.criteria.find((c) => c.key === key);
  return cr ? cr.text : LEAD_LEFT_OUT_WORD;
}

const LEAD_CHECK_UNSURE_WORD = "couldn't tell";

/**
 * A check in words, under whatever key it was answered (Reach out Part 4, PR 9). The judge keys its answers by the
 * plan's own names, so a read check is the plan's criterion (its text), or an exclusion (the place is NOT what is
 * left out: that is what a pass means), or the engine's kind (the plan's name). A key the plan does not name -- a
 * seen check, or a criterion a changed plan dropped -- is the fixed words where there are some, else the key said
 * plainly ("open_weekends" -> "Open weekends"): shown, never dropped. An unknown says what could not be told.
 */
export function leadCheckWord(search: LeadSearchDto | null, key: string, answer: "yes" | "no" | "unknown"): string {
  const plan = search?.plan;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // "Chain gyms" -> "chain gyms"; an acronym ("YMCA branches") keeps its capitals.
  const low = (s: string) => (s[1] && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const said = (yes: string, no: string) =>
    answer === "yes" ? yes : answer === "no" ? no : `${yes}: ${LEAD_CHECK_UNSURE_WORD}`;
  if (key === LEAD_KIND_KEY && plan) return said(`One of the ${plan.name}`, leadKindWord(plan.name));
  const cr = plan?.criteria.find((c) => c.key === key);
  if (cr) return said(cap(cr.text), `${cap(cr.text)}: no`);
  const ex = plan?.exclusions.find((e) => e.key === key);
  if (ex) return said(`Not ${low(ex.text)}`, `One of the ${low(ex.text)}`);
  const fixed = (LEAD_CHECK_WORDS as Record<string, Record<"yes" | "no" | "unknown", string>>)[key];
  if (fixed) return fixed[answer];
  const plain = cap(key.replace(/_+/g, " ").trim()) || key;
  return said(plain, `${plain}: no`);
}
export const LEAD_SLOT_WORDS: Record<LeadSlotState, string> = {
  ok: "Checked",
  part: "Unconfirmed",
  none: "Nothing found",
  bad: "Bad",
  checking: "Still checking",
};

/**
 * The two reach slots, phone then mailbox (D5): five states a shape can carry, so the column survives greyscale.
 * A mail server that would not answer wears Unconfirmed's shape with its own sentence; a number the owner marked
 * wrong is Bad; a source that gave nothing is Nothing found, never a failure.
 */
export function leadSlots(r: Pick<LeadRowDto, "phone" | "phone_agrees" | "phone_wrong" | "email" | "email_state">): {
  phone: LeadSlot;
  mailbox: LeadSlot;
} {
  const phone: LeadSlot = !r.phone
    ? { state: "none", value: null, word: LEAD_SLOT_WORDS.none, tip: "No phone on the listing", copy: false }
    : r.phone_wrong
      ? {
          state: "bad",
          value: r.phone,
          word: LEAD_SLOT_WORDS.bad,
          tip: `${r.phone} — you marked this number wrong`,
          copy: false,
        }
      : r.phone_agrees
        ? {
            state: "ok",
            value: r.phone,
            word: LEAD_SLOT_WORDS.ok,
            tip: `${r.phone} — the same number on Google Maps and on their website`,
            copy: true,
          }
        : {
            state: "part",
            value: r.phone,
            word: LEAD_SLOT_WORDS.part,
            tip: `${r.phone} — one source, their Google Maps listing`,
            copy: true,
          };
  const s = r.email_state;
  const mailbox: LeadSlot =
    !r.email || s === "none"
      ? {
          state: "none",
          value: null,
          word: LEAD_SLOT_WORDS.none,
          tip: `${LEAD_MAILBOX_WORDS.none} — home, contact and about pages checked`,
          copy: false,
        }
      : s === "ok"
        ? {
            state: "ok",
            value: r.email,
            word: LEAD_SLOT_WORDS.ok,
            tip: `${r.email} — ${LEAD_MAILBOX_WORDS.ok}`,
            copy: true,
          }
        : s === "invalid"
          ? {
              state: "bad",
              value: r.email,
              word: LEAD_SLOT_WORDS.bad,
              tip: `${r.email} — ${LEAD_MAILBOX_WORDS.invalid}`,
              copy: false,
            }
          : s === "checking"
            ? {
                state: "checking",
                value: r.email,
                word: LEAD_SLOT_WORDS.checking,
                tip: `${r.email} — ${LEAD_MAILBOX_WORDS.checking}. It resolves itself`,
                copy: true,
              }
            : {
                state: "part",
                value: r.email,
                word: LEAD_SLOT_WORDS.part,
                tip: `${r.email} — ${LEAD_MAILBOX_WORDS[s]}`,
                copy: true,
              };
  return { phone, mailbox };
}

/** The tile's tint, one of six, from the kind of business: the same kind wears the same tint on every row and in the peek. */
export function leadTintOf(kind: string | null | undefined): number {
  let h = 7;
  for (const ch of kind ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}

/**
 * The listing's photo at the size a row's tile draws it: Google's photo service takes a size after `=`, and the
 * scraper's URL asks for 408 wide, which every row downloaded for a 48px box. `s96-c` is a 96px square crop, which
 * the tile draws with object-fit anyway, and enough for a 2x screen. Any other host, or a URL with no size to
 * replace, is left as it is. The peek's band and the photo expanded keep the whole photograph at the listing's own
 * size (`tile.band`), untouched: Google's place-photo service answered other sizes and WebP (`-rw`) unevenly when
 * probed on 23 Sep, the same photo refusing one variant and serving the next, so no variant is asked of it.
 */
export const LEAD_TILE_PX = 96;

export function leadTileSrc(url: string | null | undefined, px: number = LEAD_TILE_PX): string | null {
  if (!url) return null;
  if (!/^https:\/\/lh3\.googleusercontent\.com\//.test(url)) return url;
  return url.replace(/=w\d+-h\d+(?:-[a-z0-9-]+)?$/i, `=s${px}-c`);
}
