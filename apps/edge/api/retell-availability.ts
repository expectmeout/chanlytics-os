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
import { resolveChannel } from "../lib/workspace/db.js";
import { loadTenantRuntime } from "../lib/tenant-runtime.js";
import { openingsData } from "../lib/availability.js";
import { describeOpenings, filterOpenings } from "../lib/workspace/contracts.js";

const CANNOT_SEE =
  "I can't see the calendar right now. Offer to text the booking link — it shows the open times — or to have someone call back.";
const NO_CALENDAR =
  "There is no calendar to check. Offer to text the booking link — it shows the open times.";

interface ServiceLike { name: string; duration_min?: number }

/**
 * The listed service the caller means. The name as the model passes it is
 * whatever the caller SAID ("a haircut", "the balayage thing"): exact first,
 * then one containing the other, then the service sharing the most words of
 * four letters or more — "haircut" finds "Short haircut".
 */
export function matchService(services: ServiceLike[] | undefined, asked: unknown): ServiceLike | null {
  const q = typeof asked === "string" ? asked.trim().toLowerCase() : "";
  if (!q || !services?.length) return null;
  const exact = services.find((s) => s.name.toLowerCase() === q);
  if (exact) return exact;
  const contains = services.find((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  if (contains) return contains;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  let best: ServiceLike | null = null;
  let bestScore = 0;
  for (const s of services) {
    const own = s.name.toLowerCase().split(/[^a-z0-9]+/);
    const score = words.filter((w) => own.includes(w)).length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

/** The prompt block, folded into one spoken paragraph. */
export function spoken(text: string, service: ServiceLike | null): string {
  const flat = text.replace(/\n- /g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const lead = service?.duration_min ? `For ${service.name} (about ${service.duration_min} minutes): ` : "";
  return `${lead}${flat}`;
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (request.headers.get("x-fn-secret") !== process.env.RETELL_FN_SECRET) {
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
  if (!rt.calendar?.ical_url) {
    log("retell_availability_no_calendar", { tenant: routed.tenantId });
    return json(200, { result: NO_CALENDAR });
  }
  const data = await openingsData(rt);
  if (!data) {
    log("retell_availability_unavailable", { tenant: routed.tenantId });
    return json(200, { result: CANNOT_SEE });
  }
  const service = matchService(rt.brain?.profile?.services, args.service);
  const day = typeof args.day === "string" ? args.day : null;
  const picked = filterOpenings(data.openings, { day, minMinutes: service?.duration_min ?? null });
  const text = describeOpenings(picked, data.tz, { maxDays: 3, daysAhead: data.daysAhead });
  log("retell_availability", { tenant: routed.tenantId, day, service: service?.name ?? null, days: picked.length });
  return json(200, { result: spoken(text, service) });
}
