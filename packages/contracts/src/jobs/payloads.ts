/**
 * What a job of each kind carries (layer 10, decision 0115), declared once: a Record over JOB_KINDS, so a kind added without
 * its shape does not build, and scheduleJob takes its payload by kind.
 *
 * A row reaches the ledger from TypeScript and from twenty-six SQL inserts, and the types see only the first, so the claim
 * reads each payload through its shape as well. For now it only says so: a line naming the kind and the fields, never the
 * values (`payloadFieldsOff`, packages/jobs dispatchJob). Once a clean week stands, that read refuses, as an edge door's body
 * did (decision 0109), and this replaces KIND_POLICY's `ids`.
 *
 * A shape is strict, so a field nobody declared is said. What a job carries is ids, never people (KIND_POLICY `never`):
 * `body` is here because a writer may hand it over, and schedule.ts leaves it off the row.
 */
import { z } from "zod";
import type { JobKind } from "../shared/enums";

/** What the ledger itself may add to any payload: the request it was scheduled in, and the failed job a copy runs again. */
const stamped = { request_id: z.string().optional(), requeue_of: z.string().optional() };

const carrying = <S extends z.ZodRawShape>(fields: S) => z.strictObject({ ...stamped, ...fields });

const CARRIES_NOTHING = carrying({});

export const JOB_PAYLOADS = {
  outbound_send: carrying({
    message_id: z.string(),
    conversation_id: z.string(),
    to_phone: z.string().optional(),
    to_email: z.string().optional(),
    to_instagram: z.string().optional(),
    body: z.string().optional(),
    template: z.strictObject({ name: z.string(), language: z.string(), params: z.array(z.string()) }).optional(),
    purpose: z.string().optional(),
    proactive: z.boolean().optional(),
    starts: z.boolean().optional(),
    resumes: z.number().optional(),
    stale_after: z.string().optional(),
  }),
  broadcast_send: carrying({
    broadcast_id: z.string(),
    waits: z.number().optional(),
    stalls: z.number().optional(),
    resumes: z.number().optional(),
  }),
  line_provision: carrying({ line_id: z.string(), by: z.enum(["owner", "support", "sweep"]) }),
  email_ingest: carrying({
    received_id: z.string(),
    source: z.literal("mailbox").optional(),
    mailbox_id: z.string().optional(),
  }),
  lead_round_start: carrying({ round_id: z.string(), resume: z.boolean().optional() }),
  lead_collect: carrying({ run_id: z.string(), seq: z.string() }),
  lead_check: carrying({
    round_id: z.string(),
    batch: z.number(),
    again: z.string().optional(),
    lead_ids: z.array(z.string()).optional(),
  }),
  push_send: carrying({ notification_id: z.string() }),
  push_receipts: carrying({ tickets: z.array(z.strictObject({ id: z.string(), to: z.string() })) }),
  reply_read: carrying({ message_id: z.string(), stage: z.string().optional() }),
  booking_read: carrying({
    received_id: z.string(),
    mailbox_id: z.string().optional(),
    tool: z.string().nullable().optional(),
  }),
  event_deliver: carrying({
    event_id: z.string(),
    subscriber: z.string(),
    kind: z.string(),
    lane: z.string().optional(),
  }),
  inbound_answer: carrying({
    message_id: z.string(),
    conversation_id: z.string(),
    contact_id: z.string(),
    wa: z.unknown().optional(),
    ig: z.unknown().optional(),
    text: z.unknown().optional(),
    received_at: z.number().optional(),
    /** The wire its door kept it on (whatsapp, sms, instagram): which door's job answers it (edge intake/answer-job.ts). */
    wire: z.string().optional(),
  }),
  history_import: carrying({ source: z.string(), seq: z.string(), connection_id: z.string().optional() }),
  website_read: carrying({ url: z.string() }),
  preview_build: carrying({ preview_id: z.string() }),
  erasure_finish: carrying({ contact_id: z.string(), by: z.string().nullable().optional() }),
  reply_draft: carrying({
    conversation_id: z.string(),
    draft_kind: z.string(),
    rules: z.string(),
    message_id: z.string().optional(),
  }),
  file_look: carrying({ file_id: z.string(), edition: z.string() }),
  file_fetch: carrying({
    source: z.string(),
    batch: z.string(),
    items: z.array(z.strictObject({ url: z.string(), ref: z.string() })),
    rang: z.boolean().optional(),
  }),
  file_purge: carrying({ file_id: z.string(), why: z.string() }),
  video_digest: carrying({ file_id: z.string(), step: z.string(), edition: z.string() }),
  campaign_moments: CARRIES_NOTHING,
  reach_out_steps: CARRIES_NOTHING,
  calendar_read: CARRIES_NOTHING,
  google_read: CARRIES_NOTHING,
  sequence_occasions: CARRIES_NOTHING,
  canary: CARRIES_NOTHING,
} satisfies Record<JobKind, z.ZodType>;

/** What a writer hands a kind. */
export type JobPayload<K extends JobKind> = z.input<(typeof JOB_PAYLOADS)[K]>;

/**
 * The fields of a payload that are not what its kind says: their names, never what they hold (a job's words are not for a log
 * line). Empty when it is what its kind says, and for a kind this build does not know, which the ledger keeps for the build
 * that does.
 */
export function payloadFieldsOff(kind: string, payload: unknown): string[] {
  const schema = Object.entries(JOB_PAYLOADS).find(([name]) => name === kind)?.[1];
  if (!schema) return [];
  const read = schema.safeParse(payload);
  if (read.success) return [];
  return read.error.issues.flatMap((issue) => {
    const at = issue.path.join(".");
    if (issue.code === "unrecognized_keys") return issue.keys.map((key) => (at ? `${at}.${key}` : key));
    return [at || "(the payload)"];
  });
}
