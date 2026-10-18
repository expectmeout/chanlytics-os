/**
 * Ask's schemas: the page context the palette sends, a proposal's outcome and a settings change, read by the Ask
 * routes and the turn, apart from the words and rules of ask.ts, ask-context.ts and ask-settings-change.ts, which
 * the palette reads. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that
 * says these words loads none of it.
 */
import { z } from "zod";
import { ASK_SURFACES, ASK_SCOPE_KINDS } from "./ask";
import { ASK_CONTEXT_ROW_KINDS, ASK_CONTEXT_MAX_ROWS } from "./ask-context";
import { ASK_GOAL_MAX } from "../config/workspace-config/config-rules";

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
  }),
  // The owner's goal for Ask (the operator, 15 Oct 2026): one line, or empty to clear it.
  z.object({ op: z.literal("set_goal"), goal: z.string().max(ASK_GOAL_MAX) }),
]);
