/**
 * Ask's schemas: the page context the palette sends, a proposal's outcome and a settings change, read by the Ask
 * routes and the turn, apart from the words and rules of ask.ts, ask-context.ts and ask-settings-change.ts, which
 * the palette reads. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that
 * says these words loads none of it.
 */
import { z } from "zod";
import { ASK_SURFACES, ASK_SCOPE_KINDS } from "./ask";
import { ASK_CONTEXT_ROW_KINDS, ASK_CONTEXT_MAX_ROWS } from "./ask-context";

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
});

export const AskSettingsChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_closure"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
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
  z.object({ op: z.literal("add_note"), title: z.string().min(1).max(80), text: z.string().min(1).max(1200) }),
  z.object({
    op: z.literal("add_service"),
    name: z.string().min(1).max(80),
    duration_min: z.number().int().min(1).max(1440).optional(),
  }),
]);
