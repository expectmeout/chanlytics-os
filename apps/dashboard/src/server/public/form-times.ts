import "server-only";

/**
 * A form's "when" question, as its business takes a time (the Forms plan, F3; Ruben's call 8 of 22 November 2026):
 * the workspace's own booking setting, read as AI reads it in a chat (contracts formTimeWayOf), decides it, and the form
 * keeps no setting of its own.
 *
 * - A business that confirms its own bookings: the question shows its real open times, computed the one way every
 *   reader computes them (calendar/openings.ts readFreeOpenings), and a time picked is a request it confirms. A time
 *   someone else has asked for is not offered, as AI never offers it (decision 0061: a request takes its time). When it
 *   is sent it is checked again against the calendar as it stands then, where another person's request takes nothing:
 *   a request holds no time against anyone else, so two people who ask for one time are two requests.
 * - A business that offers its own booking page: the question is a way there, and an open of it is counted.
 * - Any other, a calendar that cannot be read, or nothing open in the days ahead: the question asks as the form wrote it.
 *
 * Read on the service role, as everything a stranger's page reads is (link-page.ts): only the workspace the address
 * names, and only what the form needs. Never throws: what cannot be read is asked as the form's own question.
 */
import {
  bookingHeld,
  dateFormat,
  fillWords,
  formPageWords,
  formTimesOf,
  formTimeWayOf,
  parseTenantConfig,
  isFormSlot,
  requestedBookingOf,
  formSlotWords,
  takesBookingRequests,
  type BookingRequestTerms,
  type FormDescription,
  type FormPageWords,
  type FormTimeDay,
  type FormTimeWay,
  type TenantId,
} from "@chanlytics/contracts";
import {
  takeFormRequest,
  takeFormTimeRequest,
  type FormRequestTaken,
  type FormRequestToTake,
} from "@chanlytics/db/forms";
import type { Database } from "@chanlytics/db/types";
import { listPolicies } from "@chanlytics/db/workspace";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFreeOpenings } from "../calendar/openings";
import { recordBusyLeaving } from "../calendar/record-busy";

/** What a form's time is read from: the workspace its address names, read on the service role, and the form's address. */
interface FormTimePlace {
  db: SupabaseClient<Database>;
  tenantId: TenantId;
  workspace: { config: unknown; timezone: string };
  /** The form's own address, without its site. */
  path: string;
}

/** How the form asks for a time this time: its business's open times, its own booking page, or its own question. */
export type FormTimesShown =
  { way: "requests"; days: FormTimeDay[] } | { way: "their_page"; href: string } | { way: "ask" };

const ASK: FormTimesShown = { way: "ask" };

/** The workspace's way of taking a time: its booking requests switch, its booking page, and whether bookings are held. */
async function wayOf(place: FormTimePlace): Promise<{ way: FormTimeWay; link: string | null }> {
  const cfg = parseTenantConfig(place.workspace.config);
  const link = cfg?.brain?.booking_link?.trim() || null;
  const policies = await listPolicies(place.db, place.tenantId).catch(logAndGoOn("a form's booking setting", []));
  const policy = Object.fromEntries(policies.map((row) => [row.class, { mode: row.mode }]));
  const held = bookingHeld(policy);
  const way = formTimeWayOf({
    takesRequests: takesBookingRequests({
      switchOn: cfg?.features?.booking_requests === true,
      linkInChat: !!link,
      bookingHeld: held,
    }),
    bookingLink: link,
    held,
  });
  return { way, link };
}

/**
 * The calendar's open times now, with the record's taken time beside them. `drawn`: the page is being drawn, so every
 * request held takes its time, as in a chat; else it is being sent, and no request takes any: another person's holds
 * nothing against them, and their own is let go for this one.
 */
async function openTermsOf(place: FormTimePlace, now: Date, drawn: boolean): Promise<BookingRequestTerms | null> {
  const read = await readFreeOpenings(place.tenantId, now, {
    timezone: place.workspace.timezone,
    config: place.workspace.config,
    taken: (daysAhead) =>
      recordBusyLeaving({ supabase: place.db }, place.tenantId, { now, daysAhead }, (row) =>
        drawn ? false : row.source === "receptionist" && row.status === "proposed",
      ),
  });
  if (read.state !== "ok") return null;
  const services = parseTenantConfig(place.workspace.config)?.brain?.profile?.services ?? [];
  return { openings: read.openings, tz: read.tz, services, slotMin: read.slotMin };
}

/** The address "Book on their page" opens: the form's own counter, which sends them on (form-book.ts). */
const bookPathOf = (place: FormTimePlace): string => `${place.path}/book`;

/** How this form asks for a time as its page is drawn now, in its own language. */
export async function findFormTimes(place: FormTimePlace, now: Date, lang: string): Promise<FormTimesShown> {
  try {
    const { way, link } = await wayOf(place);
    if (way === "their_page" && link) return { way, href: bookPathOf(place) };
    if (way !== "requests") return ASK;
    const terms = await openTermsOf(place, now, true);
    if (!terms) return ASK;
    const days = formTimesOf(terms.openings, { tz: terms.tz, slotMin: terms.slotMin, nowMs: now.getTime(), lang });
    return days.length ? { way, days } : ASK;
  } catch (e) {
    logAndGoOn("a form's open times", null)(e);
    return ASK;
  }
}

/**
 * Where a time sent stands: open still (its start, its end, the service it is for), or why not: `taken` since the page
 * was drawn, `too_short` for the service picked (it is open, but not for as long), `unreadable` (no time the page offers).
 */
type FormTimeChecked =
  | { ok: true; startMs: number; endMs: number; service: string | null; tz: string }
  | { ok: false; why: "taken" | "too_short" | "unreadable"; tz: string };

/**
 * A time sent, checked against the calendar as it stands now (contracts requestedBookingOf, the chat's own check), for
 * the service the visitor picked where the business still lists it: a removed one is asked for with no service named.
 * Null where the business takes no requests now, or the calendar cannot be read: then the time is not held, and the
 * request is still sent with it in its answers.
 */
export async function checkFormTime(
  place: FormTimePlace,
  picked: { slot: string; service: string | null },
  now: Date,
): Promise<FormTimeChecked | null> {
  try {
    if ((await wayOf(place)).way !== "requests") return null;
    const terms = await openTermsOf(place, now, false);
    if (!terms) return null;
    const listed = (name: string | null) =>
      !!name && terms.services.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    const service = listed(picked.service) ? picked.service : null;
    const checked = requestedBookingOf({ slot: picked.slot, service, ...terms });
    if (checked.ok) return { ...checked, tz: terms.tz };
    if (checked.why !== "not_open" || !service)
      return { ok: false, why: checked.why === "not_open" ? "taken" : "unreadable", tz: terms.tz };
    // Open for a slot, not for as long as the service takes: the time is there, the length is not.
    const bare = requestedBookingOf({ slot: picked.slot, service: null, ...terms });
    return { ok: false, why: bare.ok ? "too_short" : "taken", tz: terms.tz };
  } catch (e) {
    logAndGoOn("a form's time check", null)(e);
    return null;
  }
}

/**
 * A time asked for as the visitor's page says it, in the form's language on the business's clock: "Saturday, November
 * 28 at 11:00 AM" (the page's own day_at_time line puts the two together, so a language says it its own way).
 */
function timeAskedWords(at: { startMs: number; tz: string }, words: FormPageWords, lang: string): string {
  const when = new Date(at.startMs);
  const day = dateFormat(lang, { timeZone: at.tz, weekday: "long", month: "long", day: "numeric" }).format(when);
  const time = dateFormat(lang, { timeZone: at.tz, hour: "numeric", minute: "2-digit" }).format(when);
  return fillWords(words.day_at_time, { day, time });
}

/** The time a send asked for: the page showed open times (`shown`) and one was picked, with the service picked. */
export function askedTimeOf(
  described: FormDescription,
  answers: Record<string, unknown>,
  shown: boolean,
): { slot: string; service: string | null } | null {
  const when = described.fields.find((field) => field.kind === "when");
  const slot = when ? answers[when.id] : undefined;
  if (!shown || !isFormSlot(slot)) return null;
  // The service as the version named it, which is the business's own name for it (copied in from Services).
  const service = described.fields.find((field) => field.kind === "service");
  const picked = service ? answers[service.id] : undefined;
  const named = service?.choices?.find((choice) => choice.id === picked)?.label ?? null;
  return { slot, service: named };
}

/**
 * The one write: with the time held for the business beside the entry where one was asked for and is still open
 * (form_time_request_take), else the request alone (form_request_take). A time the calendar could not be checked
 * against is not held: it stays in the request's answers, for the business to answer.
 */
export async function keepFormEntry(
  db: SupabaseClient<Database>,
  entry: FormRequestToTake,
  open: FormTimeChecked | null,
): Promise<{ taken: FormRequestTaken; held: boolean }> {
  if (!open?.ok) return { taken: await takeFormRequest(db, entry), held: false };
  const kept = await takeFormTimeRequest(db, entry, {
    startsAt: new Date(open.startMs).toISOString(),
    endsAt: new Date(open.endMs).toISOString(),
    service: open.service,
    timezone: open.tz,
  });
  return { taken: kept.taken, held: kept.time !== null && "appointmentId" in kept.time };
}

/** The time they asked for, as the thank-you says it: on the business's clock where it was checked, else as picked. */
export function askedTimeWords(
  described: FormDescription,
  picked: { slot: string } | null,
  open: FormTimeChecked | null,
): string | null {
  if (!picked) return null;
  return open?.ok
    ? timeAskedWords({ startMs: open.startMs, tz: open.tz }, formPageWords(described), described.lang)
    : formSlotWords(picked.slot, described.lang);
}
