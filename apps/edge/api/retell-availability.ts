/**
 * Retell custom function: check_availability
 *
 * Mid-call, the phone receptionist asks what is open — for a day the caller
 * named, and long enough for the service they want — and speaks the answer.
 * It reads the same calendar feed the WhatsApp receptionist reads, through
 * the same five-minute cache, and it can only ever READ: nothing is booked
 * here, whichever tool sits behind the booking link.
 *
 * Every refusal still answers HTTP 200 with a `result` sentence: the agent
 * SPEAKS this string, so an error status would make it say nothing while the
 * caller waits.
 */
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { resolveChannel } from "../lib/packages/db.js";
import { loadTenantRuntime } from "../lib/tenant-runtime.js";
import { openingsData } from "../lib/availability.js";
import { describeOpenings, filterOpenings, offerFor, offerLead, policyAskClass, type ConsultRules, type ServiceLike, type ServiceOffer } from "../lib/packages/contracts.js";

const CANNOT_SEE =
  "I can't see the calendar right now. Offer to send the booking link to the caller's WhatsApp — it shows the open times — or to have someone call back.";
const NO_CALENDAR =
  "There is no calendar to check. Offer to send the booking link to the caller's WhatsApp — it shows the open times.";
/**
 * The workspace confirms its own bookings (Autonomy -> Booking -> Ask me first).
 *
 * Reading times aloud is the first half of offering a booking, so this tool
 * obeys that row as the other half does. The text receptionist has: under this
 * setting `layerTwo` replaces the whole reply with a person will confirm, times
 * and link and all. The phone agent used to read the openings out regardless,
 * so one workspace's two receptionists answered the same question differently.
 */
const BOOKING_HELD =
  "This business confirms its own bookings, so do not offer times. Tell the caller a member of the team will call or text them to confirm, and take their name.";

/** The prompt block, folded into one spoken paragraph, after what the service is offered as (offerLead). */
export function spoken(text: string, offer: ServiceOffer | null): string {
  const flat = text.replace(/\n- /g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  return `${offerLead(offer)}${flat}`;
}

type Openings = NonNullable<Awaited<ReturnType<typeof openingsData>>>;

/**
 * What the tool says for a day and a service, from the openings it read: the caller's service offered as itself, or as
 * a consultation first -- sized by the consultation, never by the service's own length (C5b).
 */
export function availabilityAnswer(
  data: Openings,
  profile: { services?: readonly ServiceLike[]; booking_rules?: ConsultRules | null } | undefined,
  args: { day?: unknown; service?: unknown },
): { result: string; offer: ServiceOffer | null; day: string | null; days: number } {
  const offer = offerFor(profile?.services, profile?.booking_rules, args.service);
  const day = typeof args.day === "string" ? args.day : null;
  const picked = filterOpenings(data.openings, { day, minMinutes: offer?.minMinutes ?? null });
  const text = describeOpenings(picked, data.tz, { maxDays: 3, daysAhead: data.daysAhead });
  return { result: spoken(text, offer), offer, day, days: picked.length };
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  // The third Retell door, guarded like the other two (retell-fn, retell-inbound)
  // and the webhook: an unset or empty secret matches nothing, so an empty
  // header never opens it because the configured secret is empty too.
  const secret = process.env.RETELL_FN_SECRET;
  if (!secret || request.headers.get("x-fn-secret") !== secret) {
    return json(401, { ok: false, error: "bad_secret" });
  }
  let body: { call?: { call_id?: string; agent_id?: string }; args?: { day?: unknown; service?: unknown } } = {};
  try { body = JSON.parse(raw); } catch { /* fall through with empty body */ }
  const call = body.call ?? {};
  const args = body.args ?? {};
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.log(event, JSON.stringify({ call_id: call.call_id, agent_id: call.agent_id, ...extra }));

  const db = pg();
  const routed = db && call.agent_id ? await resolveChannel(db, "voice", call.agent_id) : null;
  if (!db || !routed) {
    log("retell_availability_unrouted");
    return json(200, { result: CANNOT_SEE });
  }
  const rt = await loadTenantRuntime(db, routed);
  if (policyAskClass(rt.policy, "booking") === "booking") {
    log("retell_availability_booking_held", { tenant: routed.tenantId });
    return json(200, { result: BOOKING_HELD });
  }
  if (!rt.calendar?.ical_url) {
    log("retell_availability_no_calendar", { tenant: routed.tenantId });
    return json(200, { result: NO_CALENDAR });
  }
  const data = await openingsData(rt);
  if (!data) {
    log("retell_availability_unavailable", { tenant: routed.tenantId });
    return json(200, { result: CANNOT_SEE });
  }
  const answer = availabilityAnswer(data, rt.brain?.profile, args);
  log("retell_availability", { tenant: routed.tenantId, day: answer.day, service: answer.offer?.service.name ?? null, consultation: answer.offer?.consultation ?? false, days: answer.days });
  return json(200, { result: answer.result });
}
