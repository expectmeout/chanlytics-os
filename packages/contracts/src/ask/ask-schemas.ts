/**
 * Ask's schemas: the page context the palette sends, a proposal's outcome and a settings change, read by the Ask
 * routes and the turn, apart from the words and rules of ask.ts, ask-context.ts and ask-settings-change.ts, which
 * the palette reads. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that
 * says these words loads none of it.
 */
import { z } from "zod";
import { ASK_SURFACES, ASK_SCOPE_KINDS } from "./ask";
import { ASK_CONTEXT_ROW_KINDS, ASK_CONTEXT_MAX_ROWS } from "./ask-context";
import { ASK_GOAL_MAX, PROFILE_LIMITS } from "../config/workspace-config/config-rules";
import { whyNotAHandoff } from "../shared/phone";
import { phoneVoiceOf } from "../voice/phone-voices";
import { PHONE_PACES } from "../voice/phone-pace";
import { WALK_INS_CHOICES } from "../config/business-tab/choices";
import { GUARDRAIL_RULES } from "./ask-settings-change";

const Id = z.string().min(1).max(120);

/** The one reading of a context: a field it does not know, a row with more than its kind and id, is refused. */
export const PageContextSchema = z
  .object({
    v: z.literal(1),
    surface: z.enum(ASK_SURFACES),
    route: z.string().max(200),
    view: z.string().max(80).nullish(),
    focus: z
      .object({ kind: z.enum(ASK_SCOPE_KINDS), id: Id, label: z.string().max(80) })
      .strict()
      .nullish(),
    rows: z.array(z.object({ kind: z.enum(ASK_CONTEXT_ROW_KINDS), id: Id }).strict()).max(ASK_CONTEXT_MAX_ROWS),
    askedAt: z.number().int().nonnegative(),
  })
  .strict();

export const AskProposalOutcomeSchema = z.object({
  state: z.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z.string().max(300).catch(""),
  atMs: z.number().catch(0),
  undo: z.record(z.string(), z.unknown()).nullable().optional(),
  // What the commit made that a plan's later step names (AskProposalOutcome.made): kept, never stripped, so a plan's
  // made survives a reload; absent (every outcome saved before) or unreadable, it made nothing a token names.
  made: z
    .object({ kind: z.string().min(1).max(40), id: z.string().min(1).max(120) })
    .nullable()
    .catch(null),
});

/** A calendar day, YYYY-MM-DD: a closure's first and last, and a note's last. Its shape alone; the save judges the rest. */
const CalendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const AskSettingsChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_closure"),
    date: CalendarDay,
    until: CalendarDay.optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    op: z.literal("set_hours"),
    day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    open: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    close: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
  }),
  z.object({
    op: z.literal("add_note"),
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(1200),
    until: CalendarDay.optional(),
  }),
  z.object({
    op: z.literal("add_service"),
    name: z.string().min(1).max(80),
    duration_min: z.number().int().min(1).max(1440).optional(),
    price_note: z.string().trim().min(1).max(PROFILE_LIMITS.servicePrice).optional(),
  }),
  // The owner's goal for Ask (the operator, 15 Oct 2026): one line, or empty to clear it.
  z.object({ op: z.literal("set_goal"), goal: z.string().max(ASK_GOAL_MAX) }),
  // How it answers, a row each (the Settings wiring review, item 14, 18 Oct 2026), within the profile's own limits; an
  // empty value empties the row. The settings save judges the whole config again.
  z.object({ op: z.literal("set_tone"), tone: z.string().max(PROFILE_LIMITS.tone) }),
  z.object({
    op: z.literal("set_languages"),
    languages: z
      .array(z.string().trim().min(PROFILE_LIMITS.languageMin).max(PROFILE_LIMITS.languageMax))
      .max(PROFILE_LIMITS.languages),
  }),
  z.object({ op: z.literal("set_phone_greeting"), greeting: z.string().max(PROFILE_LIMITS.message) }),
  z.object({
    op: z.literal("set_phone_voice"),
    voice: z.string().refine((v) => phoneVoiceOf(v) !== null, "not one of the phone voices"),
  }),
  z.object({
    op: z.literal("set_transfer_number"),
    // Its shape here, in the owner's words; the line it may not be (the receptionist's own, or one forwarding to it)
    // is the settings save's to judge, which reads the lines.
    number: z
      .string()
      .max(40)
      .superRefine((v, ctx) => {
        const why = whyNotAHandoff(v);
        if (why) ctx.addIssue({ code: "custom", message: why });
      }),
  }),
  z.object({ op: z.literal("add_own_words"), text: z.string().trim().min(1).max(PROFILE_LIMITS.instructions) }),
  z.object({
    op: z.literal("set_message"),
    which: z.enum(["error", "non_text", "greeting"]),
    text: z.string().max(PROFILE_LIMITS.message),
  }),
  z.object({ op: z.literal("set_photos"), on: z.boolean() }),
  // The first run's three (decision 0073, R7): its name (empty for none), its pace on calls, and walk-ins.
  z.object({ op: z.literal("set_assistant_name"), name: z.string().max(PROFILE_LIMITS.assistantName) }),
  z.object({ op: z.literal("set_phone_pace"), pace: z.enum(PHONE_PACES) }),
  z.object({ op: z.literal("set_walk_ins"), walk_ins: z.enum(WALK_INS_CHOICES) }),
  // The booking link a sequence to leads' step names (the lead-to-sequence canvas): a web address, or empty to clear it.
  z.object({
    op: z.literal("set_booking_link"),
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "A web address, starting https://"),
  }),
]);

/**
 * A change a rehearsal's fix keeps (decision 0069, R4: rehearsal/fix-router.ts): any of the cards' changes, and the fix's
 * own three -- a service already listed given its minutes or its price, a reason a customer must reach a person, and
 * one of the owner's switches. The settings save judges the whole config again.
 */
export const FixChangeSchema = z.union([
  AskSettingsChangeSchema,
  z.discriminatedUnion("op", [
    z.object({
      op: z.literal("set_service"),
      name: z.string().min(1).max(PROFILE_LIMITS.serviceName),
      duration_min: z.number().int().min(1).max(PROFILE_LIMITS.serviceMinutes).optional(),
      price_note: z.string().trim().min(1).max(PROFILE_LIMITS.servicePrice).optional(),
    }),
    z.object({ op: z.literal("add_escalate_when"), reason: z.string().trim().min(1).max(PROFILE_LIMITS.reason) }),
    z.object({ op: z.literal("set_guardrail"), rule: z.enum(GUARDRAIL_RULES), on: z.boolean() }),
  ]),
]);
/** A change a fix keeps, as FixChangeSchema reads it: what the edge's router answers and what Keep takes. */
export type FixChange = z.infer<typeof FixChangeSchema>;
