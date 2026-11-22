/**
 * A time a customer asked for that nobody answered (decision 0061, as amended 22 Nov 2026), as the database keeps it:
 * the clock's two lists, the nudge's stamp, the request as its job reads it, and the one door that closes it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DbFailure, heldTenantId, type ContactId, type TenantId } from "@chanlytics/contracts";
import { readAnswer } from "../../../shared/read-json";
import type { Database, Json } from "../../../types";

type Db = SupabaseClient<Database>;

/** A request the clock names: one whose owner is nudged now, or one that ran out. */
export interface DueRequest {
  what: "nudge" | "lapse";
  tenantId: TenantId;
  appointmentId: string;
  conversationId: string;
  /** Who asked, as the request's row names them; null for nobody named. */
  who: string | null;
  /** ISO instants. */
  startsAt: string;
  expiresAt: string;
  service: string | null;
  timezone: string;
}

/** One row of booking_requests_due, as the database answers it: a name and a service may be null. */
const DueRows = z.array(
  z.object({
    what: z.string(),
    appointment_id: z.string(),
    tenant_id: z.string(),
    conversation_id: z.string().nullable(),
    client_name: z.string().nullable(),
    starts_at: z.string(),
    service: z.string().nullable(),
    timezone: z.string(),
    expires_at: z.string(),
  }),
);

/**
 * The requests the clock is due to act on (booking_requests_due): the ones to nudge, two hours before they run out, and
 * the ones that ran out, oldest first, at most `limit` of each. A failed read throws.
 */
export async function listBookingRequestsDue(db: Db, limit: number): Promise<DueRequest[]> {
  const { data, error } = await db.rpc("booking_requests_due", { p_limit: limit });
  if (error) throw new DbFailure(error, "booking_requests_due");
  return readAnswer("booking_requests_due", DueRows, data).flatMap((row) =>
    (row.what === "nudge" || row.what === "lapse") && row.conversation_id
      ? [
          {
            what: row.what,
            tenantId: heldTenantId(row.tenant_id),
            appointmentId: row.appointment_id,
            conversationId: row.conversation_id,
            who: row.client_name?.trim() || null,
            startsAt: row.starts_at,
            expiresAt: row.expires_at,
            service: row.service?.trim() || null,
            timezone: row.timezone,
          },
        ]
      : [],
  );
}

/** A request's nudge stamped as told (booking_request_nudged): true when this call stamped it, false when one had. */
export async function markBookingRequestNudged(db: Db, appointmentId: string): Promise<boolean> {
  const { data, error } = await db.rpc("booking_request_nudged", { p_appointment_id: appointmentId });
  if (error) throw new DbFailure(error, "booking_request_nudged");
  return data === true;
}

/** A request as its job reads it (core LapsedRequest), and what its notice says of it. */
export interface BookingRequestFacts {
  id: string;
  source: string;
  status: string;
  conversationId: string | null;
  contactId: ContactId | null;
  startsAt: string;
  endsAt: string;
  service: string | null;
  timezone: string;
  expiresAt: string | null;
  askedAt: string;
  phone: string | null;
  who: string | null;
  /** Whether AI told the customer when it ran out; null for a request that never ran out. */
  told: boolean | null;
}

/** One appointment of a workspace as a request's job and its notice read it, or null where the record has none. */
export async function findBookingRequest(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
): Promise<BookingRequestFacts | null> {
  const { data, error } = await db
    .from("appointments")
    .select(
      "id, source, status, conversation_id, contact_id, starts_at, ends_at, service, timezone, expires_at, created_at, client_phone, client_name, lapse_told",
    )
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "find_booking_request");
  if (!data) return null;
  return {
    id: data.id,
    source: data.source,
    status: data.status,
    conversationId: data.conversation_id,
    contactId: data.contact_id,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    service: data.service?.trim() || null,
    timezone: data.timezone,
    expiresAt: data.expires_at,
    askedAt: data.created_at,
    phone: data.client_phone,
    who: data.client_name?.trim() || null,
    told: data.lapse_told,
  };
}

/** What booking_request_lapse answers. */
const BookingRequestLapsed = z.object({
  outcome: z.enum(["told", "reply", "closed", "answered", "early"]),
  message_id: z.string().nullable().optional(),
});

/** The message a run-out queues, as the door takes it. */
export interface LapseMessage {
  conversationId: string;
  contactId: ContactId | null;
  channel: "whatsapp" | "sms";
  /** The number it goes to. */
  to: string;
  body: string;
  dueAt: Date;
  staleAfter: Date;
}

/**
 * A request that ran out, closed (booking_request_lapse, the service role's), in one transaction. With a message: it is
 * queued with its send job (as 00527 queue_send writes one), the request closes as told, its hold is resolved and the
 * conversation goes back to AI. Without one: the request closes and its hold takes `replyWords` as a reply a person
 * owes. A request no longer waiting answers `answered` and nothing moves.
 */
export async function closeLapsedRequest(
  db: Db,
  cmd: { tenantId: TenantId; appointmentId: string; replyWords: string; told: LapseMessage | null },
): Promise<{ outcome: "told"; messageId: string | null } | { outcome: "reply" | "closed" | "answered" | "early" }> {
  const send = cmd.told;
  // The address is frozen on the row (meta.to, last), where the send reads it; the payload's copy is for an older edge.
  const to = send ? `+${send.to.replace(/^\+/, "")}` : "";
  const message: Json | null = send
    ? {
        tenant_id: cmd.tenantId,
        conversation_id: send.conversationId,
        contact_id: send.contactId,
        channel: send.channel,
        sender: "ai",
        type: "text",
        body: send.body,
        meta: { source: "booking_lapse", appointment_id: cmd.appointmentId, to },
      }
    : null;
  const { data, error } = await db.rpc("booking_request_lapse", {
    p_appointment_id: cmd.appointmentId,
    p_reply_words: cmd.replyWords,
    ...(send && message
      ? {
          p_message: message,
          p_due_at: send.dueAt.toISOString(),
          p_payload: { to_phone: to, stale_after: send.staleAfter.toISOString() },
        }
      : {}),
  });
  if (error) throw new DbFailure(error, "booking_request_lapse");
  const answer = readAnswer("booking_request_lapse", BookingRequestLapsed, data ?? {});
  if (answer.outcome === "told") return { outcome: "told", messageId: answer.message_id ?? null };
  return { outcome: answer.outcome };
}
