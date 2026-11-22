/**
 * A time a customer asked for has a clock (decision 0061, as amended 22 Nov 2026). Until now nothing read a request's
 * end: its owner was told once when it was asked and warned once two hours on, and a request nobody answered ran out in
 * silence, with the customer never told.
 *
 * The watchdog's tick runs this last and on its own (every ten minutes, receptionist/deadman-sweep.ts), so a failure
 * here (booking_request_clock_failed) never costs the watchdog its tick, and nothing here starts past the step's line.
 * One read says what is due (00679 booking_requests_due), and the step does two things with it:
 *
 *   - A request that ran out is handed to the ledger, one booking_lapse job a request (its once-only key holds a second).
 *     The job asks AI for the words and closes the request (packages/jobs handlers/booking-lapse.ts): a model is never
 *     asked inside the watchdog's minute.
 *   - A request two hours from running out nudges its owner once more: the bell, the phones and the mail, told once per
 *     request (notifyOnce) and stamped on its row only once the nudge was delivered, as the watchdog stamps its own. A
 *     workspace with nobody on file is left unstamped, and the watchdog's own page says it cannot be told.
 *
 * And what the job needs of the edge beside the writer: the reply setting in force for the person it would tell.
 */
import { replyDelayMs, requestNudgeNews, slotShort, type ContactId, type TenantId } from "@chanlytics/contracts";
import { effectiveReplyMode, replyPosture } from "@chanlytics/core";
import { listBookingRequestsDue, markBookingRequestNudged, type DueRequest } from "@chanlytics/db/calendar";
import { findPersonReplyMode } from "@chanlytics/db/workspace";
import { scheduleJobOnce, type BookingLapseEdge } from "@chanlytics/jobs";
import { loadDraftRuntime } from "../drafts/writer.js";
import type { SweepTick } from "../ops/sweep-door.js";
import type { notifyOnce as notifyOnceFn, reachesTenant as reachesFn } from "../shared/alerts/notify.js";
import { errField } from "../shared/log.js";
import type { loadTenantNotifications as loadFn } from "../shared/tenant-runtime.js";

/** How many requests of each kind one tick takes: past them, the next tick's ten minutes. */
const REQUESTS_A_TICK = 50;
/** How long into the tick a request may still be started on: a nudge's mail has its time after it. */
const REQUEST_CLOCK_BUDGET_MS = 45_000;

interface RequestClock {
  db: SweepTick["db"];
  L: SweepTick["L"];
  /** When the tick began (the door's clock): the step's line is measured from it. */
  started: number;
  notifyOnce: typeof notifyOnceFn;
  loadTenantNotifications: typeof loadFn;
  reachesTenant: typeof reachesFn;
  /** One booking_lapse job a request: scheduled, or already waiting. */
  handToTheLedger(tenantId: TenantId, appointmentId: string): Promise<"scheduled" | "already_scheduled">;
  now?: () => number;
}

/** The ledger's door for a request that ran out, over this database. */
export const lapseJobFor =
  (db: SweepTick["db"]): RequestClock["handToTheLedger"] =>
  (tenantId, appointmentId) =>
    scheduleJobOnce(db, {
      tenantId,
      kind: "booking_lapse",
      dueAt: new Date(),
      payload: { appointment_id: appointmentId },
    });

/** A request's owner nudged once: true when the nudge was delivered and its row stamped. */
async function nudge(
  clock: RequestClock,
  request: DueRequest,
  addressing: Map<string, Awaited<ReturnType<typeof loadFn>>>,
): Promise<boolean> {
  const { db, L } = clock;
  const about = { tenant_id: request.tenantId, appointment: request.appointmentId };
  if (!addressing.has(request.tenantId))
    addressing.set(request.tenantId, await clock.loadTenantNotifications(db, request.tenantId));
  const address = addressing.get(request.tenantId);
  if (!address) return false;
  const target = { tenantId: request.tenantId, ...address };
  // Nobody to tell: left unstamped, so it is nudged the moment somebody is on file while it still waits.
  if (!clock.reachesTenant(target)) return false;
  const delivered = await clock.notifyOnce(
    target,
    requestNudgeNews(
      {
        appointmentId: request.appointmentId,
        conversationId: request.conversationId,
        who: request.who,
        when: slotShort(Date.parse(request.startsAt), request.timezone),
        service: request.service,
      },
      Date.parse(request.expiresAt),
      request.timezone,
    ),
  );
  if (!delivered) {
    // The watchdog's own word for an alert its owner did not get: the stamp is withheld, and the next tick tries again.
    L.warn("deadman_alert_undelivered", about);
    return false;
  }
  await markBookingRequestNudged(db, request.appointmentId);
  return true;
}

/**
 * The step: what ran out handed to the ledger first (a customer is waiting to hear), then the nudges. How many of each,
 * for the tick's line and a test to read. Never throws.
 */
export async function keepRequestsOnTheClock(clock: RequestClock): Promise<{ nudged: number; handed: number }> {
  const { db, L } = clock;
  const now = clock.now ?? Date.now;
  const counts = { nudged: 0, handed: 0 };
  let due: DueRequest[];
  try {
    due = await listBookingRequestsDue(db, REQUESTS_A_TICK);
  } catch (e) {
    // A database the migration has not reached answers that it knows no such function: nothing is due there yet.
    L.error("booking_request_clock_failed", { error: errField(e) });
    return counts;
  }
  const addressing = new Map<string, Awaited<ReturnType<typeof loadFn>>>();
  const inOrder = [...due.filter((r) => r.what === "lapse"), ...due.filter((r) => r.what === "nudge")];
  for (const request of inOrder) {
    // Out of time: the rest are found again next tick, since nothing of theirs was stamped.
    if (now() > clock.started + REQUEST_CLOCK_BUDGET_MS) break;
    try {
      if (request.what === "lapse") {
        if ((await clock.handToTheLedger(request.tenantId, request.appointmentId)) === "scheduled") counts.handed += 1;
      } else if (await nudge(clock, request, addressing)) counts.nudged += 1;
    } catch (e) {
      L.error("booking_request_clock_failed", {
        tenant_id: request.tenantId,
        appointment: request.appointmentId,
        what: request.what,
        error: errField(e),
      });
    }
  }
  return counts;
}

/**
 * What a request that ran out needs of the edge beside the writer (jobs BookingLapseEdge): the reply setting in force
 * for the person it would tell, read as the receptionist reads it. A runtime that cannot be read holds for a person
 * (core replyPosture), the person's own setting wins over the workspace's, and no mode speaks while everything is
 * stopped (effectiveReplyMode, decision 0139).
 */
export function lapseEdge(db: SweepTick["db"]): BookingLapseEdge {
  return {
    posture: async (tenantId: TenantId, contactId: ContactId | null) => {
      const rt = await loadDraftRuntime(db, tenantId, "whatsapp");
      const usable = !!rt && !rt.loadFailed && !rt.configBroken;
      const posture = replyPosture({ runtimeUsable: usable, policyMode: rt?.policy.reply?.mode });
      const personMode = usable && contactId ? await findPersonReplyMode(db, tenantId, contactId) : null;
      const mode = effectiveReplyMode(posture, personMode, rt?.stopped === true);
      return { mode, delayMs: replyDelayMs(mode, rt?.policy.reply?.limits), paused: rt?.paused === true };
    },
  };
}
