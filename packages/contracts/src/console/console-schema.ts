/**
 * What the Console's routes take, as each reads it (decision 0066), apart from console.ts's words: zod is not built into
 * the browser's contracts (decision 0024, the browser's entry), so a page that says these words loads none of it.
 *
 * Every write takes `why`: the reason's kind, the ticket when the kind is one, and a note. A partner reads the note of a
 * decision about them, so on those three it is asked for.
 */
import { z } from "zod";
import { REASON_KINDS, REASON_LIMITS } from "./console";
import { REQUEST_KINDS, REQUEST_STEP_KEYS } from "./requests";
import { FIND_LIMITS, SUPPORT_TOPICS } from "./support";
import { SUPPORT_KIND_FILTERS, SUPPORT_VIEWS } from "./support-queue";
import { WORKSPACE } from "../shell/client-error";
import { REPORT_KINDS } from "../shell/report-problem";
import { PARTNER_STANDINGS, PARTNER_STATUSES } from "../workspace/partner";

const uuid = (what: string) => z.uuid({ error: `That ${what} does not exist.` });

const wordsUpTo = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters.`)
    .transform((s) => (s ? s : null))
    .nullable()
    .optional()
    .transform((s) => s ?? null);

/** Why an act is taken. A ticket is asked for when that is the reason. */
export const ConsoleWhySchema = z
  .object({
    kind: z.enum(REASON_KINDS, { error: "Say why." }),
    ticket: wordsUpTo(REASON_LIMITS.ticket),
    note: wordsUpTo(REASON_LIMITS.note),
  })
  .strict()
  .refine((w) => w.kind !== "ticket" || !!w.ticket, {
    message: "Name the ticket, or choose another reason.",
    path: ["ticket"],
  });

/** A reason whose note a partner will read: the note is asked for. */
const PartnerWhySchema = ConsoleWhySchema.refine((w) => !!w.note, {
  message: "Say why in a sentence: the partner reads it.",
  path: ["note"],
});

/** `POST platform/lines/{retry,refile,replace,release}`. */
export const LineActSchema = z
  .object({ tenant_id: uuid("workspace"), line_id: uuid("line"), why: ConsoleWhySchema })
  .strict();

/** `POST platform/jobs/requeue`. */
export const JobRequeueSchema = z
  .object({ tenant_id: uuid("workspace"), job_id: uuid("job"), why: ConsoleWhySchema })
  .strict();

/** `POST platform/waitlist/invited`. */
export const WaitlistInvitedSchema = z.object({ id: uuid("place"), why: ConsoleWhySchema }).strict();

/** `POST platform/partners/standing`. */
export const PartnerStandingSchema = z
  .object({
    tenant_id: uuid("workspace"),
    standing: z.enum(PARTNER_STANDINGS, { error: "Choose qualified, review or disqualified." }),
    why: PartnerWhySchema,
  })
  .strict();

/** `POST platform/partners/status`. */
export const PartnerStatusSchema = z
  .object({
    partner_id: uuid("partner"),
    status: z.enum(PARTNER_STATUSES, { error: "Choose active, paused or closed." }),
    why: PartnerWhySchema,
  })
  .strict();

/** `POST platform/partners/payout`: what was sent, by hand, and the reference to find it by. */
export const PartnerPayoutSchema = z
  .object({
    partner_id: uuid("partner"),
    currency: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{3}$/, "Name the currency the payout was sent in."),
    reference: z
      .string()
      .trim()
      .min(1, "Give the payment's reference, so it can be found again.")
      .max(200, "At most 200 characters."),
    /** The total the card showed: a total that moved since is refused, not recorded. */
    expected_cents: z
      .number({ error: "The expected amount must be a whole number of cents." })
      .int("The expected amount must be a whole number of cents.")
      .optional(),
    why: ConsoleWhySchema,
  })
  .strict();

/** `POST platform/partners/second-factor`: whose, and why, and how it was checked it is them. */
export const PartnerSecondFactorSchema = z.object({ partner_id: uuid("partner"), why: PartnerWhySchema }).strict();

/** `POST platform/requests`: a request as it came in. */
export const RequestFileSchema = z
  .object({
    kind: z.enum(REQUEST_KINDS, { error: "Say what they asked for." }),
    /** The workspace it is about, by its address: a request is kept by its name after the workspace is gone. */
    workspace: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Give the workspace's address, as /w/ says it."),
    asked_by: z
      .string()
      .trim()
      .min(3, "Say who asked: their email, as it came in.")
      .max(200, "At most 200 characters."),
    asked_at: z.iso.datetime({ offset: true, error: "Say when they asked." }),
    why: ConsoleWhySchema,
  })
  .strict();

/** `POST platform/requests/step`: one step done or undone, or the request closed. */
export const RequestStepSchema = z
  .object({
    id: uuid("request"),
    step: z.union([z.enum(REQUEST_STEP_KEYS), z.literal("close")], { error: "Say which step." }),
    done: z.boolean(),
    why: ConsoleWhySchema,
  })
  .strict();

/** `POST platform/claims`: take a workspace for CLAIM_HOURS, or let it go. Not an act on the business: no reason. */
export const ClaimSchema = z.object({ tenant_id: uuid("workspace"), take: z.boolean() }).strict();

/** `GET platform/find?q=`. */
export const FindQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(FIND_LIMITS.min, `At least ${FIND_LIMITS.min} characters.`)
      .max(FIND_LIMITS.max, `At most ${FIND_LIMITS.max} characters.`),
  })
  .strict();

/**
 * `GET platform/support`: one view of the queue, narrowed by a kind, a topic, a workspace and words, `page` pages of
 * SUPPORT_PAGE rows.
 */
export const SupportQuerySchema = z
  .object({
    view: z.enum(SUPPORT_VIEWS).default("needs"),
    kind: z.enum(SUPPORT_KIND_FILTERS).default("all"),
    topic: z.enum(SUPPORT_TOPICS).optional(),
    workspace: z.string().regex(WORKSPACE).optional(),
    q: z.string().trim().max(FIND_LIMITS.max).default(""),
    page: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();

/**
 * `POST platform/support/mark`: a question answered or open again; an ask answered, done by hand, or open again. One
 * press: the act's reason is the row's own code, a ticket, so it asks no why.
 */
export const SupportMarkSchema = z
  .object({
    target: z.enum(["report", "ask"]),
    id: uuid("row"),
    mark: z.enum(["answered", "done", "reopened"]),
  })
  .strict()
  .refine((m) => m.target === "ask" || m.mark !== "done", {
    message: "A question is done once it is answered.",
    path: ["mark"],
  });

/** `POST platform/support/resend`: a report the inbox did not get, sent to it again. */
export const SupportResendSchema = z.object({ id: uuid("report") }).strict();

/** `POST platform/support/kind`: a report moved between Support and Health, as what the member needed. */
export const SupportKindSchema = z.object({ id: uuid("report"), kind: z.enum(REPORT_KINDS) }).strict();

/** `GET platform/acts`: a page of the log, older than `before`, one person's or everyone's, as rows or a CSV. */
export const ActsQuerySchema = z
  .object({
    who: z.uuid().optional(),
    before: z.iso.datetime({ offset: true }).optional(),
    format: z.enum(["rows", "csv"]).default("rows"),
  })
  .strict();

export type ConsoleWhyInput = z.infer<typeof ConsoleWhySchema>;
