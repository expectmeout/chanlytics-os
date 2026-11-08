/** The edge's doors for email and the mailboxes it goes through, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import type { MailboxConnectionDto } from "./mailbox-connections/states";
import { DOOR_ID, answerFields, edgeDoor, PLAIN_ANSWER, shaped } from "../shared/edge/door";

/** POST /api/admin/email/wire: whether this deployment can send, and which domains campaigns may send from. */
export const EMAIL_WIRE_DOOR = edgeDoor("/api/admin/email/wire", z.object({ op: z.string() }), PLAIN_ANSWER);

/** POST /api/admin/email/alert-test: a test of the workspace's alert email. */
export const ALERT_TEST_DOOR = edgeDoor(
  "/api/admin/email/alert-test",
  z.object({ tenant_id: DOOR_ID.optional() }),
  answerFields({ sent: z.boolean(), to: z.number(), why: z.string() }),
);

/** POST /api/admin/email/signup-confirm: the website form's confirmation, asked for again. */
export const SIGNUP_CONFIRM_DOOR = edgeDoor(
  "/api/admin/email/signup-confirm",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional(), contact_id: DOOR_ID.optional() }),
  answerFields({ asked: z.boolean(), why: z.string() }),
);

/** POST /api/admin/email/test-to-self: a sequence's email, sent to the member who asked. */
export const TEST_TO_SELF_DOOR = edgeDoor(
  "/api/admin/email/test-to-self",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    subject: z.string().optional(),
    text: z.string().optional(),
  }),
  answerFields({ sent: z.boolean(), to: z.string(), why: z.string() }),
);

/** POST /api/admin/mailboxes: a mailbox connected, set, paused, checked, removed, and its history brought in. */
export const MAILBOXES_DOOR = edgeDoor(
  "/api/admin/mailboxes",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    mailbox_id: DOOR_ID.optional(),
    provider: z.string().optional(),
    code: z.string().optional(),
    /** PKCE's verifier, where the consent was asked with its challenge (Google's). */
    code_verifier: z.string().optional(),
    from_name: z.string().optional(),
    signature: z.string().nullable().optional(),
    signature_off: z.boolean().optional(),
    daily_cap: z.number().optional(),
    address: z.string().optional(),
    /** What its owner chose under Connect (0086). */
    history: z.unknown().optional(),
  }),
  answerFields({
    providers: z.array(z.string()),
    oauth: z.record(z.string(), z.object({ client_id: z.string(), redirect_uri: z.string() }).partial()),
    audience: z.string().nullable(),
    pkce: z.boolean(),
    mailbox: shaped<MailboxConnectionDto>(),
    reason: z.string(),
    made: z.boolean(),
  }),
);
