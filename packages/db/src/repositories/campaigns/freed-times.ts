/**
 * A freed time, as the database holds what it is decided over and what it made (decision 0081, 00497), read with the
 * service role: the appointment an event is about and the calendar the receptionist reads over it (its hours, closures
 * and booking rules from the workspace's profile, its zone, and every time that stands on the record over the days it
 * may offer: a booking's row, a request still held, the owner's calendar as the feed's last read left it), for the
 * subscriber `freed_time_offer` and a batch's first send; the workspace's step on `slot_opened`; and whether a batch
 * already offers an appointment's freed time (sequence_batches_offered_once holds one per step and appointment); and how
 * many cancellations came, for Ask's signals. A read that fails throws, so whatever asked tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_DEFAULTS,
  DEFAULT_TIMEZONE,
  offeringHorizon,
  parseTenantConfig,
  type FreedTimeCalendar,
  type FreedTimeRow,
  type SequenceMode,
} from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { sequenceModesOf } from "./sequences";

type Db = SupabaseClient<Database>;
type StepRow = Database["public"]["Tables"]["sequence_steps"]["Row"];

/** The moment a freed time's step runs on (contracts PLAYBOOK_TRIGGERS). */
const FREED_MOMENT = "slot_opened";

/** The statuses that take a time: a request held and a booking (appointments.ts LIVE_STATUSES). */
const TAKES_TIME = ["proposed", "booked"] as const;
/** The most rows the days ahead carry: a salon's quarter, not a shared calendar's (appointments.ts SPAN_MAX). */
const SPAN_MAX = 2000;

/**
 * The appointment and the calendar a freed time is decided over, or null when the record no longer holds the row. The
 * zone is the workspace's, as every run reads it (DEFAULT_TIMEZONE where it keeps none); the hours, closures and rules
 * its profile's, none where it keeps none (the rule then offers nothing: no_hours).
 */
export async function freedTimeFactsOf(
  db: Db,
  tenantId: string,
  appointmentId: string,
  nowMs: number,
): Promise<{ row: FreedTimeRow; calendar: FreedTimeCalendar } | null> {
  const [appt, tenant, cfg] = await Promise.all([
    db
      .from("appointments")
      .select("id, contact_id, starts_at, ends_at, all_day")
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId)
      .maybeSingle(),
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (appt.error) throw new Error(`freed_time_facts: the appointment: ${appt.error.message}`);
  if (tenant.error) throw new Error(`freed_time_facts: the workspace: ${tenant.error.message}`);
  if (cfg.error) throw new Error(`freed_time_facts: the config: ${cfg.error.message}`);
  if (!appt.data) return null;
  const profile = parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile;
  const rules = profile?.booking_rules ?? null;
  const now = new Date(nowMs);
  const span = offeringHorizon(now, rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead);
  const standing = await db
    .from("appointments")
    .select("id, contact_id, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .in("status", [...TAKES_TIME])
    .is("vanished_at", null)
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .gt("ends_at", new Date(span.from).toISOString())
    .lt("starts_at", new Date(span.to).toISOString())
    .order("starts_at", { ascending: true })
    .limit(SPAN_MAX);
  if (standing.error) throw new Error(`freed_time_facts: what stands: ${standing.error.message}`);
  return {
    row: {
      id: appt.data.id,
      contactId: appt.data.contact_id,
      startsAt: appt.data.starts_at,
      endsAt: appt.data.ends_at,
      allDay: appt.data.all_day,
    },
    calendar: {
      tz: tenant.data?.timezone || DEFAULT_TIMEZONE,
      hours: profile?.hours,
      closures: profile?.closures,
      standing: (standing.data ?? []).map((r) => ({
        id: r.id,
        contactId: r.contact_id,
        start: Date.parse(r.starts_at),
        end: Date.parse(r.ends_at),
      })),
      rules,
    },
  };
}

/**
 * The workspace's step on `slot_opened`: the running one, with its sequence's mode as a run reads it (the oldest,
 * should two sequences hold one: a freed time is offered once), else whether one stands paused, else none.
 */
export async function freedTimeStepOf(
  db: Db,
  tenantId: string,
): Promise<{ state: "running"; step: StepRow & { mode: SequenceMode | undefined } } | { state: "paused" | "none" }> {
  const { data, error } = await db
    .from("sequence_steps")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("trigger", FREED_MOMENT)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`cannot read the step that offers a freed time: ${error.message}`);
  const steps = data ?? [];
  const running = steps.find((s) => s.state === "running");
  if (!running) return { state: steps.length ? "paused" : "none" };
  const modes = await sequenceModesOf(db, tenantId, [running.sequence_id]);
  return { state: "running", step: { ...running, mode: modes.get(running.sequence_id) } };
}

/**
 * The batch a step made for an appointment's freed time: how many people it offers the time to, and whether it waits
 * for the owner's OK; null when it made none.
 */
export async function freedTimeBatchOf(
  db: Db,
  tenantId: string,
  stepId: string,
  appointmentId: string,
): Promise<{ id: string; people: number; waits: boolean } | null> {
  const { data, error } = await db
    .from("sequence_batches")
    .select("id, recipient_count, state")
    .eq("tenant_id", tenantId)
    .eq("step_id", stepId)
    .eq("offered_from", appointmentId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the batch a freed time made: ${error.message}`);
  return data ? { id: data.id, people: data.recipient_count, waits: data.state === "pending_approval" } : null;
}

/** The most events one count reads: a busy calendar's month of cancellations, many times over. */
const EVENTS_MAX = 2000;

/**
 * How many appointments with a person the service cancelled, or the owner's calendar dropped, since `sinceIso`: the times
 * a freed time's step would have been handed (decision 0081), read off their events (appointment.changed: cancelled by
 * the service, 00436, or vanished from the feed). Ask's signals count them where nothing offers them. Under the caller's
 * row security; a read that fails throws.
 */
export async function cancellationsSince(db: Db, tenantId: string, sinceIso: string): Promise<number> {
  const { data, error } = await db
    .from("events")
    .select("subject_id, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "appointment.changed")
    .eq("subject_type", "appointment")
    .in("data->>change", ["cancelled", "vanished"])
    .gte("created_at", sinceIso)
    .limit(EVENTS_MAX);
  if (error) throw new Error(`cannot read the cancellations: ${error.message}`);
  const said = (e: { data: unknown }, k: string): unknown =>
    e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>)[k] : undefined;
  const ids = [
    ...new Set(
      (data ?? [])
        .filter((e) => said(e, "by") === "service" || said(e, "source") === "calendar_feed")
        .flatMap((e) => (e.subject_id ? [e.subject_id] : [])),
    ),
  ];
  if (ids.length === 0) return 0;
  const { count, error: cErr } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .in("id", ids)
    .not("contact_id", "is", null);
  if (cErr) throw new Error(`cannot count the cancellations' people: ${cErr.message}`);
  return count ?? 0;
}
