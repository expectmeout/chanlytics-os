import "server-only";
import type { AskSurface, PageContext } from "@chanlytics/contracts";
import { stableJson, type ReaderContext, type RowRef } from "../readers";
import type { WorkspaceShape } from "../readers/shape";
import {
  CONTEXT_CAPS,
  PAGE_TITLES,
  clip,
  oneLine,
  type ContextRow,
  type Provided,
  type Provider,
} from "./context/rows";
import { conversations, inbox, live, today } from "./context/day";
import { calendar, leads, people, pipeline } from "./context/people";
import { campaigns, other, reports, settings, start } from "./context/pages";

/**
 * The page a question is asked on, as the model will read it (the spec, 5.2; the Phase 2 plan, PR 2.2): one
 * `search_result` block for the page's aggregate, then one for each row on screen, in the page's order. The tab sends
 * identities only (contracts PageContext); the surface's provider (context/day.ts, people.ts, pages.ts) reads every id
 * again through the page's own readers under the person's RLS, keeps the rows a reader returned -- a row another
 * workspace holds is simply absent, and no block or log names it -- and writes each with the page's own view model.
 *
 * The aggregate always comes FIRST, as `page://<surface>`: what the page says about itself before the rows it shows,
 * and the one block a cut never takes. The caps are the plan's (D11): forty rows, a row's line at 160 characters, the
 * aggregate at 1,200, every block together at 8,000; the rows are cut in the page's order, and the aggregate says how
 * many were left out. A provider whose reads fail costs its blocks, never the build: the page's aggregate says so.
 *
 * Kept per instance (D7): 60 s per workspace, person and what is on screen (the surface, the route, the view and the
 * rows -- never the focus, never when the tab asked), first in first out at 200, so the palette's warm builds the
 * blocks and the question asked a moment later takes them. A build a read failed in is not kept. Nothing here reaches
 * the model yet: PR 2.4's turn reads it.
 */

export interface SearchResultBlock {
  type: "search_result";
  source: string;
  title: string;
  content: [{ type: "text"; text: string }];
  citations: { enabled: false };
}

export interface BuiltContext {
  /** The aggregate first, then the rows in the page's order. */
  blocks: SearchResultBlock[];
  /** The page, and every row kept as its reader gave it (any of the twelve kinds), for the turn's read set. */
  refs: RowRef[];
  /** The rows kept, the aggregate not counted. */
  rows: number;
  /** Every block's source, title and text, counted. */
  chars: number;
  /** When it was built. A kept build keeps its stamp. */
  stamp: number;
  /** Whether a read failed in it: the aggregate then says the page could not be read, and nothing on it was read. */
  failed: boolean;
  /** Whether this answer was a build kept on this instance. */
  warm: "hit" | "miss";
}

const PROVIDERS: Record<AskSurface, Provider> = {
  today,
  inbox,
  conversations,
  live,
  people,
  pipeline,
  calendar,
  leads,
  reports,
  campaigns,
  settings,
  start,
  other,
};

/** How long a build is kept, and how many at most (D7). */
export const CONTEXT_TTL_MS = 60_000;
export const CONTEXT_CACHE_CAP = 200;
/** Room kept in the aggregate for the sentence that says the cut. */
const CUT_ROOM = 64;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Built = Omit<BuiltContext, "warm">;
const kept = new Map<string, { at: number; built: Promise<Built> }>();

/** Forget every kept build: for tests. */
export function clearContextCache(): void {
  kept.clear();
}

const block = (source: string, title: string, text: string): SearchResultBlock => ({
  type: "search_result",
  source,
  title,
  content: [{ type: "text", text }],
  citations: { enabled: false },
});
const size = (b: SearchResultBlock): number => b.source.length + b.title.length + b.content[0].text.length;

/** The page as a citation names it: its route, where the route names no row; else the page the route is on. */
function pageRef(ctx: PageContext, label: string): RowRef {
  const route = ctx.route && !UUID.test(ctx.route) ? ctx.route : ctx.route.split("/")[0] || ctx.surface;
  return { kind: "page", id: route, route, label };
}

/** The provider's rows and aggregate, cut to the caps (D11) in the page's order, the cut said. */
function assemble(ctx: PageContext, got: Provided): Built {
  const title = PAGE_TITLES[ctx.surface] ?? PAGE_TITLES.other;
  const seen = new Set<string>();
  const rows = got.rows.filter((r) => !seen.has(r.source) && !!seen.add(r.source));
  const base = clip(oneLine(got.aggregate), CONTEXT_CAPS.aggregate - CUT_ROOM);
  let used = size(block(`page://${ctx.surface}`, title, base)) + CUT_ROOM;
  const taken: Array<{ b: SearchResultBlock; r: ContextRow }> = [];
  for (const r of rows.slice(0, CONTEXT_CAPS.rows)) {
    const b = block(r.source, clip(oneLine(r.title), CONTEXT_CAPS.title), clip(oneLine(r.text), CONTEXT_CAPS.text));
    if (used + size(b) > CONTEXT_CAPS.total) break;
    used += size(b);
    taken.push({ b, r });
  }
  const left = rows.length - taken.length;
  const aggregate = left
    ? `${base} · ${left} more ${left === 1 ? "row" : "rows"} on screen left out of this context`
    : base;
  const blocks = [block(`page://${ctx.surface}`, title, aggregate), ...taken.map((t) => t.b)];
  return {
    blocks,
    refs: [pageRef(ctx, title), ...taken.flatMap((t) => (t.r.ref ? [t.r.ref] : []))],
    rows: taken.length,
    chars: blocks.reduce((n, b) => n + size(b), 0),
    stamp: Date.now(),
    failed: false,
  };
}

/** One build: the surface's provider, its failure caught and said in the aggregate, then the caps. */
async function build(rc: ReaderContext, ctx: PageContext): Promise<Built> {
  const provider = PROVIDERS[ctx.surface] ?? other;
  try {
    return assemble(ctx, await provider(rc, ctx));
  } catch (e) {
    console.error(
      "ask_context_read_failed",
      JSON.stringify({ surface: ctx.surface, tenant: rc.tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return {
      ...assemble(ctx, {
        rows: [],
        aggregate: `${PAGE_TITLES[ctx.surface] ?? "The page"}: could not be read just now`,
      }),
      failed: true,
    };
  }
}

/** The context's blocks for this person on this page: a build kept within the minute, or a new one. */
export async function buildContext(rc: ReaderContext, context: PageContext): Promise<BuiltContext> {
  const key = `${rc.tenantId}|${rc.userId}|${stableJson({
    surface: context.surface,
    route: context.route,
    view: context.view ?? null,
    rows: context.rows.map((r) => ({ kind: r.kind, id: r.id })),
  })}`;
  const had = kept.get(key);
  if (had && Date.now() - had.at < CONTEXT_TTL_MS) return { ...(await had.built), warm: "hit" };
  const built = build(rc, context);
  // Deleted first, so a new write goes to the back; past the cap, the oldest write goes.
  kept.delete(key);
  kept.set(key, { at: Date.now(), built });
  if (kept.size > CONTEXT_CACHE_CAP) kept.delete(kept.keys().next().value as string);
  // A build a read failed in is not a page: the next warm or question reads again.
  void built.then(
    (r) => {
      if (r.failed && kept.get(key)?.built === built) kept.delete(key);
    },
    () => {
      if (kept.get(key)?.built === built) kept.delete(key);
    },
  );
  return { ...(await built), warm: "miss" };
}

/* ------------------------------------------------------------------ the shape */

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const yes = (on: boolean, word: string, not = "not ") => (on ? word : `${not}${word}`);
/** The shape block's ceiling (the plan, D9). */
export const SHAPE_MAX = 1_500;

/**
 * The shape of the workspace as one block (the plan, D9): what it is set up with, sorted, the same bytes for the same
 * workspace whatever order its rows were read in, and nothing that ticks -- no count of messages, runs or people, so
 * a new message or a run's send changes none of it. At most 1,500 characters: past it, the end is cut and said.
 */
export function shapeBlock(shape: WorkspaceShape): string {
  const channels = [...shape.channels].sort((a, b) => byText(a.kind, b.kind) || byText(a.status, b.status));
  const lists = [...shape.lists].sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id));
  const playbooks = [...shape.playbooks].sort((a, b) => byText(a.name, b.name) || byText(a.id, b.id));
  const text = [
    `The workspace: ${oneLine(shape.name)} · zone ${shape.timezone}`,
    `Lines: ${channels.length ? channels.map((c) => `${c.kind} ${c.status}`).join(", ") : "none"}`,
    [
      `Deals ${shape.deals_on ? "on" : "off"}`,
      `calendar feed ${yes(shape.calendar_feed, "set")}`,
      `booking link ${yes(shape.booking_link, "set")}`,
      `mailbox ${yes(shape.mailbox, "connected")}`,
      `Google ${yes(shape.google, "connected")}`,
    ].join(" · "),
    `Lists: ${lists.length ? lists.map((l) => `${oneLine(l.name)}${l.archived ? " (archived)" : ""}`).join(", ") : "none"}`,
    `Playbooks: ${
      playbooks.length ? playbooks.map((p) => `${oneLine(p.name)} (${p.trigger}, ${p.state})`).join("; ") : "none"
    }`,
  ].join("\n");
  return clip(text, SHAPE_MAX);
}
