/**
 * The page context: what the page a person is on sends with a question, and with the palette's warm (the spec, 5.2;
 * the Phase 2 plan, docs/superpowers/plans/2026-09-26-ask-rewired-2-page-context.md). Identities and words, never
 * facts: the surface, the route, the view the page is set to, the row open or the row the words name, and the rows on
 * screen in the order shown. The server re-reads every id under the person's RLS, so a row another workspace holds is
 * a miss, and nothing the tab says about a row is believed.
 */
import { z } from "zod";
import { ASK_SCOPE_KINDS, ASK_SURFACES, type AskScope, type AskSurface } from "./ask";

/** The rows a context may carry: what one screen shows, and what one turn's context can afford (the plan, D11). */
export const ASK_CONTEXT_MAX_ROWS = 40;

/**
 * The kinds of row a page shows, each a kind a citation names (ASK_CITATION_KINDS) but the run, a Broadcasts row, which
 * its address spells so and a citation names a broadcast (the server's context gives each row its RowRef).
 */
export const ASK_CONTEXT_ROW_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "lead",
  "search",
  "run",
  "playbook",
  "template",
] as const;
export type AskContextRowKind = (typeof ASK_CONTEXT_ROW_KINDS)[number];

export interface PageContextRow {
  kind: AskContextRowKind;
  id: string;
}

export interface PageContext {
  v: 1;
  surface: AskSurface;
  /** The hash route as the palette reads it: the page, then the rest joined. */
  route: string;
  /** A list token, a period ("30"), a calendar span ("2026-09-21/7"), a bucket, a Campaigns tab, a Settings pane. */
  view?: string | null;
  /** The row that is open, or the row the words name on screen. */
  focus?: AskScope | null;
  /** What is on screen, in the order shown. */
  rows: PageContextRow[];
  /** When the tab built it, in its own clock: a measure, never a fact the server believes. */
  askedAt: number;
}

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
