/**
 * Where an entry came from, in one shape (the Ads tracking plan's T4 and its call 3; the Forms plan, 3.9): the code of
 * the link it came through, the page, the site the visitor came from, and the campaign labels a link named. A website's
 * own form and a hosted form keep the same shape, so a link Chanlytics hands out and a label an owner typed are counted
 * by one rule.
 *
 * Never a click id: only the five labels are read, whatever else the address carried. The site is kept as its name,
 * never the whole address, which can hold what a person typed. A label with odd characters is dropped alone, and costs
 * the entry nothing. Pure.
 */
import { z } from "zod";

/** The campaign labels a link may name. */
export const SOURCE_LABELS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type SourceLabel = (typeof SOURCE_LABELS)[number];

const LABEL_LENGTH = 100;

/** A label as it may be kept: letters, digits, spaces and the few marks a campaign's name carries. */
const LABEL_SHAPE = /^[\p{L}\p{N} ._+:|/-]+$/u;

/** A link's code, as the database makes it (link_code_new). */
const LINK_CODE = /^[a-hjkmnp-z2-9]{6}$/;

export const Source = z.strictObject({
  code: z.optional(z.string().regex(LINK_CODE)),
  page: z.optional(z.string().min(1).max(200)),
  site: z.optional(z.string().min(1).max(120)),
  labels: z.optional(z.partialRecord(z.enum(SOURCE_LABELS), z.string().min(1).max(LABEL_LENGTH))),
});
export type Source = z.infer<typeof Source>;

/** What was seen of where a visitor came from, as it arrived. */
export interface SourceSeen {
  code?: string | null;
  page?: string | null;
  /** The address the visitor came from, whole, as the browser said it. */
  referrer?: string | null;
  /** Whatever the address carried, by name: only the five labels are read. */
  labels?: Record<string, unknown> | null;
  /** The page's own site: coming from it is a move inside it, and no source. */
  own?: string | null;
}

/** The name of the site an address is on, without its "www.", or null for what is no address. */
function siteOf(address: string | null | undefined, own: string | null | undefined): string | null {
  if (!address) return null;
  let host: string;
  try {
    host = new URL(address).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Not an address: no site.
    return null;
  }
  if (!host || host.length > 120) return null;
  return own && host === own.toLowerCase().replace(/^www\./, "") ? null : host;
}

/** The labels worth keeping: each trimmed, short, and of ordinary characters; any other is dropped alone. */
function labelsOf(carried: Record<string, unknown> | null | undefined): Partial<Record<SourceLabel, string>> | null {
  const kept: Partial<Record<SourceLabel, string>> = {};
  for (const name of SOURCE_LABELS) {
    const typed = carried?.[name];
    const label = typeof typed === "string" ? typed.trim() : "";
    if (label && label.length <= LABEL_LENGTH && LABEL_SHAPE.test(label)) kept[name] = label;
  }
  return Object.keys(kept).length > 0 ? kept : null;
}

/** Where an entry came from, cleaned into the one shape; null when nothing was seen. */
export function sourceFromSeen(seen: SourceSeen): Source | null {
  const code = seen.code && LINK_CODE.test(seen.code) ? seen.code : null;
  const page = seen.page ? seen.page.trim().slice(0, 200) : "";
  const site = siteOf(seen.referrer, seen.own);
  const labels = labelsOf(seen.labels);
  if (!code && !site && !labels) return null;
  return {
    ...(code ? { code } : {}),
    ...(page ? { page } : {}),
    ...(site ? { site } : {}),
    ...(labels ? { labels } : {}),
  };
}

/** The sites people most come from, by a part of their name, as an owner would say them. */
const SITE_NAMES: ReadonlyArray<[part: string, name: string]> = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["fb.", "Facebook"],
  ["google", "Google"],
  ["tiktok", "TikTok"],
  ["youtube", "YouTube"],
  ["whatsapp", "WhatsApp"],
];

/**
 * Who sent them, as an owner reads it: the source a link named, else the site by its name ("Instagram" for
 * l.instagram.com), with the campaign beside it where one was named. Null where neither is known: a link's code alone
 * names no site, and its place says it.
 */
export function sourceInWords(source: Pick<Source, "site" | "labels"> | null | undefined): string | null {
  const named = source?.labels?.utm_source;
  const site = source?.site;
  const sender = named
    ? named.charAt(0).toUpperCase() + named.slice(1)
    : site
      ? (SITE_NAMES.find(([part]) => site.includes(part))?.[1] ?? site)
      : null;
  if (!sender) return null;
  const campaign = source?.labels?.utm_campaign;
  return campaign ? `${sender} (${campaign})` : sender;
}
