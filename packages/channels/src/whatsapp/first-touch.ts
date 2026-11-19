/**
 * The ad or post a customer clicked to write: Meta names it in a WhatsApp message's `referral`, and the person that
 * message made keeps its id as `contacts.acquired_ref` (00306; the Reports lenses spec, K3), beside `acquired_via = 'ad'`,
 * when the referral's kind (`source_type`) is `ad`. A post is kept in the message's meta and the person is stamped by the
 * wire, as one whose message had no referral is.
 *
 * From decision 0049's first step the referral is read for what the ad said too: its headline, its words, its kind of
 * media and its link. Those never ride in the message's meta. They are kept beside the message, in an entry of their own
 * (`ad_entries`, 00644), after the message has landed, so nothing an advertiser typed can cost a customer's
 * message its place. The click id is not read: it waits for the step that tells a platform who booked (0049, amended
 * 18 November 2026).
 */
import { isObjectRecord } from "@chanlytics/contracts";

/**
 * The longest id that is kept. It is contacts_acquired_ref_check's own 200 (1 to 200 characters), said here once for the
 * webhook, which turns an id longer than this into no referral rather than cut it (a cut id would name another ad), and
 * held against the column by a-person-keeps-how-they-first-reached-us.db.test.mjs, which writes one of this length and
 * one more and reads what the database does with each.
 */
export const REFERRAL_ID_MAX = 200;

/**
 * How much of what an ad said is kept, in characters: a headline, the ad's own words, and its link. Words longer than
 * their bound are cut to it (the start of an ad's words is still the ad's words); a link longer than its bound is not
 * kept at all, since a cut link is another link. The database's own door holds the same three (00644), tied to these by
 * tests/ads/an-ad-tap-keeps-what-the-ad-said.db.test.mjs.
 */
export const AD_SAID_MAX = { headline: 300, body: 2000, link: 2000 } as const;

/**
 * What an ad said where the person tapped it, as its referral carries it: each part null where the referral did not say
 * it, or said it in a shape that is not kept.
 */
export interface AdSaid {
  headline: string | null;
  body: string | null;
  /** Meta's word for the ad's media: `image` or `video`. */
  mediaType: string | null;
  /** The ad's own address at Meta, as the referral gives it. Never the click id. */
  link: string | null;
}

/** The ad, post or link a message came from: its id, its kind, and what it said where it was an ad that said anything. */
export type Referral = { sourceId: string; sourceType: string | null; said: AdSaid | null };

/**
 * What a referral's id may not hold: a control character (a NUL among them) or a lone surrogate. Postgres refuses both
 * inside the `p_meta` the id travels in (jsonb has no \u0000, and no lone surrogate is valid JSON), which would fail
 * `ingest_inbound`, make `pgIngest` throw IngestFailed and the door answer 503, and Meta would redeliver the same payload
 * for ever: the customer's message would never land. A whitespace control at either end is padding, trimmed before this
 * is asked; one inside the id is refused.
 */
const UNSTORABLE_IN_ID = /[\p{Cc}\p{Cs}]/u;

/**
 * What a referral's kind may be: Meta's own are the words `ad` and `post`, so a word of letters, digits, `_` and `-`, at
 * most 32 long. Anything else (a control character, a lone surrogate, a sentence, megabytes) is not a kind Meta sent and
 * is kept as none; the kind has no column to agree with, so the 32 is said here and nowhere else. An ad's kind of media
 * (`image`, `video`) is read by the same rule.
 */
const PLAIN_WORD = /^[\p{L}\p{N}_-]{1,32}$/u;

/** What an ad's words may not hold: a control character other than a line's end, or a lone surrogate (as an id's rule). */
const UNSTORABLE_IN_WORDS = /[^\P{Cc}\n]|\p{Cs}/gu;

/**
 * An ad's words as they can always be written: a string, its line ends made one kind, what `UNSTORABLE_IN_WORDS` names
 * made a space, trimmed, and cut to `max` characters (never through a pair). Null for anything that is not a string, or
 * that holds nothing once cleaned. Megabytes cost what their first few thousand characters cost: the rest is never read.
 */
function boundedWords(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw
    .slice(0, max * 4)
    .replace(/\r\n?/g, "\n")
    .replace(UNSTORABLE_IN_WORDS, " ")
    .trim();
  const cut = Array.from(clean).slice(0, max).join("").trimEnd();
  return cut.length > 0 ? cut : null;
}

/** A plain word of Meta's (an ad's kind of media), trimmed; null for anything else. */
function plainWordOf(raw: unknown): string | null {
  const word = typeof raw === "string" ? raw.trim() : "";
  return PLAIN_WORD.test(word) ? word : null;
}

/**
 * A link as it can always be written: a web address (http or https) of at most `AD_SAID_MAX.link` characters with no
 * space, control character or lone surrogate in it, as it was given and never cut. Null for anything else.
 */
function linkOf(raw: unknown): string | null {
  const link = typeof raw === "string" ? raw.trim() : "";
  if (link.length < 1 || link.length > AD_SAID_MAX.link || /[\s\p{Cc}\p{Cs}]/u.test(link)) return null;
  try {
    const { protocol } = new URL(link);
    return protocol === "https:" || protocol === "http:" ? link : null;
  } catch {
    return null;
  }
}

/** The four parts as one reading, or null when none of them said anything that is kept. */
function partsOrNothing(parts: AdSaid): AdSaid | null {
  return parts.headline === null && parts.body === null && parts.mediaType === null && parts.link === null
    ? null
    : parts;
}

/**
 * The ad or post a message came from (K3), read defensively. A click-to-WhatsApp referral's shape is Meta's to change
 * and unverified here, so nothing is assumed of `r`: it may be absent, not an object, or hold an id that is not a string.
 * The id and the kind are kept only when what they hold can always be written. The id is trimmed (padding is not part of
 * an id, and the trigger trims the same), then it is none when blank, longer than `REFERRAL_ID_MAX` (the one length the
 * column keeps; never cut, a cut id would name another ad) or holding what `UNSTORABLE_IN_ID` names: the stamp the
 * database would refuse for it is the person's wire instead. The kind that is not a plain word is null, and the id
 * stands. What the ad said (`headline`, `body`, `media_type`, `source_url`, as Meta's reference for a message from a
 * Click to WhatsApp ad names them) is read part by part, each kept or dropped alone. Never throws, so a referral can
 * cost a message nothing.
 */
export function adReferralOf(r: unknown): Referral | null {
  if (!isObjectRecord(r)) return null;
  return storableReferral(
    r.source_id,
    r.source_type,
    partsOrNothing({
      headline: boundedWords(r.headline, AD_SAID_MAX.headline),
      body: boundedWords(r.body, AD_SAID_MAX.body),
      mediaType: plainWordOf(r.media_type),
      link: linkOf(r.source_url),
    }),
  );
}

/**
 * What a click-to-Instagram ad said, from the referral's `ads_context_data` as Meta's webhook reference shows it
 * (`ad_title`, and a `photo_url` or a `video_url` for its media; read on Meta's page on 18 November 2026, not yet seen
 * on a real delivery): its title as the headline, and its kind of media by which address it carries. Meta sends no words
 * and no link for it. Anything else is nothing said.
 */
export function instagramAdSaidOf(context: unknown): AdSaid | null {
  if (!isObjectRecord(context)) return null;
  return partsOrNothing({
    headline: boundedWords(context.ad_title, AD_SAID_MAX.headline),
    body: null,
    mediaType: linkOf(context.video_url) ? "video" : linkOf(context.photo_url) ? "image" : null,
    link: null,
  });
}

/**
 * A referral's id and kind as a message may carry them, by the rules above: the id trimmed and kept only when it can
 * always be written, the kind only when it is a plain word. Every wire's adapter reads its own referral through this
 * one rule (an Instagram DM's ad or link too, instagram/events.ts), and hands in what the ad said, already read by the
 * rules of this module, or null. Never throws.
 */
export function storableReferral(rawId: unknown, rawKind: unknown, adSaid: AdSaid | null): Referral | null {
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (id.length < 1 || id.length > REFERRAL_ID_MAX || UNSTORABLE_IN_ID.test(id)) return null;
  return { sourceId: id, sourceType: plainWordOf(rawKind), said: adSaid };
}
