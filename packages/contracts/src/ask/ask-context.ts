/**
 * The page context: what the page a person is on sends with a question, and with the palette's warm (the spec, 5.2;
 * the Phase 2 plan, docs/superpowers/plans/2026-09-26-ask-rewired-2-page-context.md). Identities and words, never
 * facts: the surface, the route, the view the page is set to, the row open or the row the words name, and the rows on
 * screen in the order shown. The server re-reads every id under the person's RLS, so a row another workspace holds is
 * a miss, and nothing the tab says about a row is believed.
 */
import { ASK_SCOPE_KINDS, type AskMessageVM, type AskScope, type AskScopeKind, type AskSurface } from "./ask";
import { answerFromV1 } from "./ask-answer";

/** The rows a context may carry: what one screen shows, and what one turn's context can afford (the plan, D11). */
export const ASK_CONTEXT_MAX_ROWS = 40;

/**
 * The kinds of row a page shows, each a kind a citation names (ASK_CITATION_KINDS) but two the page spells its own way:
 * the run, a Broadcasts row, which a citation names a broadcast, and the reach-out, a chain on Campaigns' ledger, which no
 * campaigns read holds and a citation names as the playbook its first step is (the server's context gives each row its
 * RowRef).
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
  "reach_out",
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

/** A kind of row a focus may be: a scope's, the page aside. */
const isRowFocus = (k: string): k is AskScopeKind => k !== "page" && (ASK_SCOPE_KINDS as readonly string[]).includes(k);

/**
 * The row an answer's n-th item names, as a focus (the Phase 5 plan, D7): "open the second", asked in an open thread,
 * is its last answer's second item, in the answer's order -- an answer made before the Line has the rows it cited
 * (answerFromV1). A broadcast is the run its page spells; a thread, a conversation, a call, a person, a lead, a search
 * and a playbook are as they are. Null for an item of any other kind (a deal, a list, a template, a domain, a page):
 * the words point at no row a focus may be, and never at the page's row at that place. Undefined when the answer has
 * fewer items: then the page's rows are asked. The tab's context and the eval's both read the words by it.
 */
export function itemFocus(
  m: Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups" | "language" | "answer">,
  n: number,
): AskScope | null | undefined {
  const item = (m.answer ?? answerFromV1(m)).show.items[n - 1];
  if (!item) return undefined;
  const { kind: cited, id, label } = item.source;
  const kind = cited === "broadcast" ? "run" : cited;
  return isRowFocus(kind) ? { kind, id, label: label.slice(0, 80) || `this ${kind}` } : null;
}
