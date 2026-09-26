import "server-only";
import {
  citationRoute,
  type AskContextRowKind,
  type AskSurface,
  type PageContext,
  type PageContextRow,
} from "@chanlytics/contracts";
import type { ReaderContext, RowRef } from "../../readers";

/**
 * What every context provider shares (server/ask/context.ts builds the blocks from what they return): the row a
 * provider writes, the line it writes it in, and the caps the plan sets (D11). A provider reads the ids the page sent
 * through the page's own readers, keeps only the rows a reader returned, and writes each in the page's own words.
 */

/** One row on screen, as a provider wrote it: where it came from, what the page calls it, the line, and its ref. */
export interface ContextRow {
  /** `thread://<id>`, `call://<id>`, `person://<id>`, `lead://<id>`, ...: one per row, stable across builds. */
  source: string;
  /** The name the page shows for it. */
  title: string;
  /** who · state · last activity · `route: <where it opens>`, 160 characters at most. */
  text: string;
  /** The row a citation may name, for the kinds a citation names (thread, conversation, call, person); else null. */
  ref: RowRef | null;
}

/** What a provider returns: the rows it found, in the page's order, and the page's aggregate in one line. */
export interface Provided {
  rows: ContextRow[];
  aggregate: string;
}

export type Provider = (rc: ReaderContext, ctx: PageContext) => Promise<Provided>;

/** The caps (the plan, D11): rows, a row's line, a title, the aggregate, and every block together, in characters. */
export const CONTEXT_CAPS = { rows: 40, text: 160, title: 80, aggregate: 1_200, total: 8_000 } as const;

/** Cut to `n` characters, the cut said with an ellipsis. */
export const clip = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`);

/** One line: runs of white space, new lines among them, are one space. */
export const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

type Part = string | null | undefined | false;
const parts = (xs: Part[]): string[] =>
  xs.filter((p): p is string => typeof p === "string" && oneLine(p) !== "").map(oneLine);

/**
 * A row's line: its parts between dots, then where it opens. The route is never the part cut: the parts are cut to
 * leave room for it, so a long quote costs its own end and never the address.
 */
export function line(xs: Part[], route: string | null): string {
  const tail = route ? ` · route: ${route}` : "";
  return clip(parts(xs).join(" · "), CONTEXT_CAPS.text - tail.length) + tail;
}

/** The page's aggregate: its parts between dots. */
export const aggregateOf = (xs: Part[]): string => parts(xs).join(" · ");

/** The ids of these kinds the page sent, in its order, each once. */
/** A row's id as the database keeps it. An id read by id in SQL must be one, or the read fails for the whole page. */
export const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idsOf(ctx: PageContext, ...kinds: AskContextRowKind[]): PageContextRow[] {
  const seen = new Set<string>();
  return ctx.rows.filter((r) => {
    if (!kinds.includes(r.kind) || seen.has(`${r.kind}:${r.id}`)) return false;
    seen.add(`${r.kind}:${r.id}`);
    return true;
  });
}

/** A row a citation may name, opened where the answer opens it (contracts citationRoute). */
export function refOf(kind: "thread" | "conversation" | "call" | "person", id: string, label: string): RowRef {
  return { kind, id, route: citationRoute({ kind, id, label }), label };
}

/** A row's source: its kind and its id. */
export const sourceOf = (kind: AskContextRowKind, id: string): string => `${kind}://${id}`;

/** The pages by the name they go by, for the aggregate's title. */
export const PAGE_TITLES: Record<AskSurface, string> = {
  today: "Today",
  inbox: "Inbox",
  conversations: "Conversations",
  live: "Live",
  people: "People",
  leads: "Leads",
  pipeline: "Pipeline",
  calendar: "Calendar",
  reports: "Reports",
  campaigns: "Campaigns",
  settings: "Settings",
  start: "Start",
  other: "This page",
};

/** The page's name with its view, as the aggregate opens: "Inbox, needs_you". */
export const pageWithView = (ctx: PageContext, title: string = PAGE_TITLES[ctx.surface] ?? "This page"): string =>
  ctx.view ? `${title}, ${ctx.view}` : title;
