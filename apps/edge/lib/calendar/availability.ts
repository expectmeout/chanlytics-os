/**
 * The openings a receptionist can state, from the workspace's calendar feed.
 *
 * The feed is the owner's appointments as iCal — the Google calendar Square,
 * Vagaro, Acuity or Fresha write into, read back by its private address, or
 * the feed a tool offers of its own. (Booksy writes no calendar: its bookings
 * arrive by email, 00345.) It is fetched here, on the edge, with a short cache:
 * a busy line asks many times a minute and the calendar does not change that
 * fast. Everything else — parsing, the opening hours, the buffer and lead
 * rules, the words — is the pure contracts module, so it is tested without
 * a network.
 *
 * Never throws and never blocks a reply: a feed that cannot be read means
 * the receptionist says nothing about open times (the link still works),
 * and the failure is logged where the diagnostic can find it.
 *
 * Beside a feed that reads, the record's rows are taken time too (recordBusy,
 * below): the bookings a tool emailed are subtracted from what is offered.
 */
import {
  parseIcs,
  freeWindows,
  describeOpenings,
  describeVisits,
  feedUrlOk,
  fetchPublic,
  feedBodyProblem,
  seasonHorizon,
  offeringHorizon,
  visitsOf,
  ownAddressesOf,
  offersLinkOn,
  bookingHeld,
  takesBookingRequests,
  resolveFacts,
  feedMarksOf,
  feedWithRecord,
  busyOfAppointments,
  type BookingRequestTerms,
  type BusyBlock,
  type FeedItem,
  type Opening,
  type ParsedFeed,
  type PoolRecord,
  BOOKING_DEFAULTS,
  DAY_MS,
  MIN_MS,
} from "../packages/contracts.js";
import { publicFetcher } from "../packages/channels.js";
import { appointmentsBetween, appointmentsForClient, feedWordsOver } from "../packages/db.js";
import { pg } from "../pg.js";
import type { TenantRuntime } from "../tenant-runtime.js";
import { logger, errField } from "../log.js";

const CACHE_MS = 5 * MIN_MS;
const FETCH_TIMEOUT_MS = 6000;

/**
 * `parsed` is the parse of `text` UNDER `tz` and `daysAhead`: both shape it
 * (`seasonHorizon` bounds how far ahead events are kept), so both are held
 * beside it and a caller asking on different terms re-parses instead of being
 * handed the first caller's window. The hourly People sweep asks for the
 * workspace's real `max_days_ahead` and the receptionist asks for the same,
 * but a run where one arrived first used to pin the other to its horizon.
 */
interface Cached {
  text: string | null;
  at: number;
  parsed: ParsedFeed | null;
  tz: string;
  daysAhead: number;
}
const feeds = new Map<string, Cached>();

/**
 * The cache key is the workspace AND the feed it named. Keyed on the workspace
 * alone, changing the iCal address was not a miss: an owner who fixed a wrong
 * link, or moved to a new calendar, kept being answered from the old one for
 * five more minutes -- and a failure is cached too, so a corrected address
 * still read as broken.
 */
const cacheKey = (tenantId: string, url: string) => `${tenantId}\n${url}`;

/** Keyed per tenant AND url, so an owner editing the address leaves entries behind. Expired ones go. */
function prune(now: number): void {
  for (const [k, v] of feeds) if (now - v.at >= CACHE_MS) feeds.delete(k);
}

/** webcal:// is https:// in a hat. */
function httpsUrl(u: string): string {
  return u.replace(/^webcal:\/\//i, "https://");
}

async function fetchFeed(tenantId: string, url: string, tz: string, daysAhead: number): Promise<string | null> {
  const L = logger({ tenant_id: tenantId });
  const key = cacheKey(tenantId, url);
  const hit = feeds.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  let text: string | null = null;
  try {
    // The same address rule the dashboard's preview and save keep: never a
    // private address, however it reached the config.
    const safe = feedUrlOk(url);
    if (!safe) throw new Error("address refused: not a public https/webcal address");
    // Every hop judged by the address rule (fetchPublic), not only the first.
    const r = await fetchPublic(publicFetcher(), httpsUrl(safe), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "text/calendar, text/plain;q=0.5, */*;q=0.1" },
    });
    if (!r) {
      L.error("availability_feed_redirect_refused", {});
    } else if (!r.ok) {
      L.error("availability_feed_http", { status: r.status });
    } else {
      const body = await r.text();
      // One ceiling, one judgement, shared with the dashboard's loader: this
      // inlined 2 * 1024 * 1024 while the dashboard refused at FEED_MAX_BYTES,
      // so a feed between the two was read by one reader and refused by the
      // other, and the receptionist and the board would then disagree about a
      // business's own week with nothing on any page to say why.
      const problem = feedBodyProblem(body);
      if (problem === "too_large") L.error("availability_feed_too_large", { bytes: body.length });
      else if (problem === "not_ical") L.error("availability_feed_not_ical", { head: body.slice(0, 40) });
      else text = body;
    }
  } catch (e) {
    L.error("availability_feed_failed", { error: errField(e) });
  }
  // A failure is cached too, briefly: one broken feed must not add a six
  // second wait to every message for as long as it stays broken.
  const at = Date.now();
  prune(at);
  feeds.set(key, { text, at, parsed: null, tz, daysAhead });
  return text;
}

/**
 * The feed parsed once per fetch. The openings, a caller's visits and the
 * hourly sweep all read it, and parsing a season of appointments each time
 * is the work the five-minute cache exists to avoid.
 */
async function parsedFeedOf(
  tenantId: string,
  url: string,
  tz: string,
  daysAhead: number,
  now: Date,
): Promise<ParsedFeed | null> {
  const text = await fetchFeed(tenantId, url, tz, daysAhead);
  if (text === null || !tz) return null;
  const hit = feeds.get(cacheKey(tenantId, url));
  const sameTerms = (c: Cached) => c.text === text && c.tz === tz && c.daysAhead === daysAhead;
  if (hit?.parsed && sameTerms(hit)) return hit.parsed;
  const parsed = parseIcs(text, tz, { horizon: seasonHorizon(now, daysAhead) });
  if (hit && hit.text === text) {
    hit.parsed = parsed;
    hit.tz = tz;
    hit.daysAhead = daysAhead;
  }
  return parsed;
}

/** How far ahead the workspace books: what its feed is parsed to (seasonHorizon), and the record read beside it. */
const daysAheadOf = (rt: TenantRuntime): number =>
  rt.brain?.profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;

async function parsedFeed(rt: TenantRuntime, url: string, now: Date): Promise<ParsedFeed | null> {
  return parsedFeedOf(rt.tenantId, url, rt.timezone ?? "", daysAheadOf(rt), now);
}

/** The feed's appointments for one workspace, for the sweep that puts the people they name in People. Null when the feed cannot be read. */
export async function feedItemsFor(
  tenantId: string,
  url: string,
  tz: string,
  now = new Date(),
  daysAhead = 14,
): Promise<FeedItem[] | null> {
  const parsed = await parsedFeedOf(tenantId, url, tz, daysAhead, now);
  return parsed ? parsed.items : null;
}

/** The openings as data, for the phone tool that answers about one day. */
interface OpeningsData {
  openings: Opening[];
  tz: string;
  daysAhead: number;
}

/**
 * The openings, or null when there is nothing to say — no feed configured,
 * or a feed that could not be read.
 */
export async function openingsData(
  rt: TenantRuntime,
  now = new Date(),
  /** A person whose own open request takes no slot from them (decision 0061): picking it again is the same request. */
  mine: string | null = null,
): Promise<OpeningsData | null> {
  const L = logger({ tenant_id: rt.tenantId });
  const url = rt.calendar?.ical_url;
  const profile = rt.brain?.profile;
  if (!url || !profile || !rt.timezone) return null;
  try {
    const feed = await parsedFeed(rt, url, now);
    if (!feed) return null;
    const rules = profile.booking_rules ?? null;
    const daysAhead = rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
    const openings = freeWindows({
      hours: profile.hours,
      closures: profile.closures,
      tz: rt.timezone,
      // The feed's taken time, and the record's beside it (00345): a booking that arrived by email took its slot too.
      busy: [...feed.busy, ...(await recordBusy(rt.tenantId, now, daysAhead, mine))],
      rules,
      now,
    });
    if (feed.skippedRecurring) L.info("availability_recurring_skipped", { count: feed.skippedRecurring });
    return { openings, tz: rt.timezone, daysAhead };
  } catch (e) {
    L.error("availability_compute_failed", { error: errField(e) });
    return null;
  }
}

/**
 * The record's taken time over the days the receptionist may offer (00345): a booking that arrived by email took its
 * slot even where the tool writes no calendar, so it is subtracted beside the feed's, as the board, Ask and the
 * prompt's preview subtract it (the dashboard's server/calendar/record-busy.ts; one rule, contracts
 * busyOfAppointments, over one span, offeringHorizon). A runtime with no database has no record. A read that fails is
 * none, logged where the diagnostic finds it: the feed's openings are still said, as they were before the record, and
 * a reply is never held for it.
 */
async function recordBusy(
  tenantId: string,
  now: Date,
  daysAhead: number,
  mine: string | null = null,
): Promise<BusyBlock[]> {
  const db = pg();
  if (!db) return [];
  const span = offeringHorizon(now, daysAhead);
  try {
    const rows = await appointmentsBetween(
      db,
      tenantId,
      new Date(span.from).toISOString(),
      new Date(span.to).toISOString(),
    );
    return busyOfAppointments(
      mine
        ? rows.filter((r) => !(r.source === "receptionist" && r.status === "proposed" && r.contact_id === mine))
        : rows,
    );
  } catch (e) {
    logger({ tenant_id: tenantId }).error("availability_record_failed", { error: errField(e) });
    return [];
  }
}

/**
 * Whether what follows an opening or a visit may offer the booking link, where it is said: in chat any link, on a call
 * only one WhatsApp can carry (contracts offersLinkOn).
 */
export function linkOfferedOn(on: "call" | "chat", rt: Pick<TenantRuntime, "brain" | "known">): boolean {
  return offersLinkOn(on, rt.brain, resolveFacts(rt.brain, rt.known).whatsapp_line.value);
}

/**
 * Whether this workspace takes booking requests on a text turn (decision 0061): its switch, and the team confirming its
 * own bookings (contracts takesBookingRequests).
 */
export function takesRequests(rt: Pick<TenantRuntime, "brain" | "known" | "policy" | "features">): boolean {
  return takesBookingRequests({
    switchOn: rt.features?.booking_requests === true,
    linkInChat: linkOfferedOn("chat", rt),
    bookingHeld: bookingHeld(rt.policy),
  });
}

/**
 * What a time the customer picked is checked against, read when they picked it (decision 0061, point 3): the openings as
 * they stand, the person's own open request aside, the services the business lists and its slot length. Null when the
 * openings cannot be read, and no request is then taken.
 */
export async function requestTermsFor(
  rt: TenantRuntime,
  who: string | null,
  now = new Date(),
): Promise<BookingRequestTerms | null> {
  const data = await openingsData(rt, now, who);
  if (!data) return null;
  const profile = rt.brain?.profile;
  return {
    openings: data.openings,
    tz: data.tz,
    services: profile?.services ?? [],
    slotMin: profile?.booking_rules?.slot_min ?? BOOKING_DEFAULTS.slot_min,
  };
}

/** The openings block for the prompt, or null when there is nothing to say. */
export async function openingsFor(rt: TenantRuntime, on: "call" | "chat", now = new Date()): Promise<string | null> {
  const data = await openingsData(rt, now);
  return data
    ? describeOpenings(data.openings, data.tz, {
        daysAhead: data.daysAhead,
        hasBookingLink: linkOfferedOn(on, rt),
        // Under a booking hold the times end in a person confirming, never the link: the same rule the availability
        // tool reads (11 Oct 2026: the openings handed to chat and to a call's start still ended in the link).
        bookingHeld: bookingHeld(rt.policy),
        // A time picked by text is written as a request where the workspace takes them (decision 0061); a call takes none.
        ...(on === "chat" && takesRequests(rt) ? { requests: true } : {}),
      })
    : null;
}

/** Tests and the diagnostic: forget every cached feed. */
export function forgetFeeds(): void {
  feeds.clear();
}

/**
 * What the calendar says about the person on the line: their next
 * appointment and their last visit, matched by their number first and
 * their name second — the same match the dashboard's board and profile
 * use. The callers behind this — a phone call, a WhatsApp message — know
 * who they are by their number, so there is no address to match on; the
 * board and the profile, which read People's own row, have one.
 * Null when there is nothing to say; never throws.
 */
export async function visitsFor(
  rt: TenantRuntime,
  who: { phone: string | null; name: string | null },
  on: "call" | "chat",
  now = new Date(),
): Promise<string | null> {
  const L = logger({ tenant_id: rt.tenantId });
  const url = rt.calendar?.ical_url;
  if (!rt.timezone || (!who.phone && !who.name)) return null;
  try {
    // The feed's events, when there is a feed, and the record joined to them as People and the playbooks join it
    // (0002's readers): a booking that arrived by email is theirs by their number, so a workspace with no calendar still
    // knows their next visit (00345), and a visit a member cancelled or said missed is never confirmed to them.
    const [feed, record] = await Promise.all([
      url ? parsedFeed(rt, url, now) : null,
      recordFor(rt.tenantId, who, now, url ? seasonHorizon(now, daysAheadOf(rt)).to : null),
    ]);
    if (record === "failed") return null;
    // The caller is known by their number, so the business's own ADDRESSES
    // cannot be theirs -- but they still come off every event, so an owner's
    // address on an appointment never makes it read as somebody else's.
    const own = ownAddressesOf({ notifications: rt.notifications, calendar: rt.calendar });
    const items = feedWithRecord(feed?.items ?? [], record, own);
    if (!items.length) return null;
    return describeVisits(
      visitsOf(items, { id: "caller", name: who.name ?? "", phone: who.phone, email: null }, now.getTime(), own),
      rt.timezone,
      now.getTime(),
      { hasBookingLink: linkOfferedOn(on, rt) },
    );
  } catch (e) {
    L.error("availability_visits_failed", { error: errField(e) });
    return null;
  }
}

/**
 * The record for one caller, as the visits index joins it to the feed (contracts feedWithRecord): their rows by their
 * number (a name alone names no row), however each stands, and the word members said of the feed's events up to the
 * feed's horizon (`feedTo`; null with no feed). A month back, so a last visit is said too. A runtime with no database
 * is none: the feed alone. A read that fails is "failed", logged where the diagnostic finds it, and the caller's visits
 * go unsaid: one a member cancelled could not be told from one that stands.
 */
async function recordFor(
  tenantId: string,
  who: { phone: string | null },
  now: Date,
  feedTo: number | null,
): Promise<PoolRecord | null | "failed"> {
  const db = pg();
  if (!db) return null;
  const from = new Date(now.getTime() - VISITS_BACK_MS).toISOString();
  try {
    const [noted, words] = await Promise.all([
      who.phone ? appointmentsForClient(db, tenantId, { phone: who.phone, email: null }, from) : [],
      feedTo !== null ? feedWordsOver(db, tenantId, from, new Date(feedTo).toISOString()) : [],
    ]);
    return { noted, marks: feedMarksOf(words) };
  } catch (e) {
    logger({ tenant_id: tenantId }).error("availability_visits_failed", { error: errField(e), source: "record" });
    return "failed";
  }
}

/** How far back a caller's record is read for their last visit. */
const VISITS_BACK_MS = 31 * DAY_MS;
