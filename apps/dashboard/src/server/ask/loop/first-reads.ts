import "server-only";
import { noteRows } from "@chanlytics/contracts";
import { log } from "@/server/log";
import { load, type ReaderContext } from "../../readers";
import { shape as shapeReader } from "../../readers/shape";
import { shapeBlock, type BuiltContext } from "../context";
import { remembered, rememberedBlock } from "../companion/remembered";
import { crossPagePlan, scopedRead } from "../cross-page";
import type { ToolContext, ToolRun } from "../tools";
import type { AskPorts, TurnInput } from "../loop";

/** The workspace's shape and, after it, what Ask remembers: the port's own (loop.ts AskPorts shape). */
export const shapeOf = async (rc: ReaderContext): Promise<string> => {
  const [shape, kept] = await Promise.all([
    load(rc, shapeReader, undefined).then((r) => shapeBlock(r.data)),
    load(rc, remembered, undefined).then(
      (r) => rememberedBlock(r.data),
      (e: unknown) => {
        log.error("ask_remembered_failed", { error: e, tenant_id: rc.tenantId });
        return "";
      },
    ),
  ]);
  return kept ? `${shape}\n\n${kept}` : shape;
};

/**
 * What a turn reads before the model is asked, in parallel (the Phase 2 plan, PR 2.4): the page the person is on
 * (context.ts: the warm's build if it is kept, else a build now), the shape of the workspace, the reads the question
 * names of another page (cross-page.ts), and the row the scope names, read whole as its tool reads it. Each rides into
 * the first round as data, so its rows enter the read set and the answer can cite them. A failure costs that block,
 * never the turn.
 */
export async function firstReads(input: TurnInput, ports: AskPorts, tc: ToolContext) {
  const tCtx = Date.now();
  const plan = crossPagePlan(input.text, input.surface, input.context?.view ?? null);
  const scoped = scopedRead(input.scope, input.context?.route);
  const runRead = async (run: ToolRun) => {
    try {
      return { run, out: await ports.tool(tc, run) };
    } catch (e) {
      log.error("ask_cross_page_failed", { error: e, tenant_id: input.tenantId });
      return { run, out: { result: "", isError: true } };
    }
  };
  const [built, shape, preOuts, scopedOut] = await Promise.all([
    input.context
      ? ports.context(tc.rc, input.context).catch((e: unknown): BuiltContext | null => {
          log.error("ask_context_failed", { error: e, tenant_id: input.tenantId });
          return null;
        })
      : null,
    ports.shape(tc.rc).catch((e: unknown) => {
      log.error("ask_shape_failed", { error: e, tenant_id: input.tenantId });
      return "";
    }),
    Promise.all(plan.map(runRead)),
    scoped ? runRead(scoped) : null,
  ]);
  // The page's rows a citation may name enter the read set; the page counts as one read, so a figure answered from it
  // is grounded (isUngrounded) -- when something on it was read: not a page whose read failed, nor one that is its
  // address alone (other) and shows no row.
  if (built) noteRows(tc.read, built.refs);
  const pageRead =
    !!built && built.blocks.length > 0 && (built.rows > 0 || (!built.failed && input.context?.surface !== "other"));
  const prefetched = preOuts.filter((p) => !p.out.isError);
  const scopedRow = scopedOut && !scopedOut.out.isError ? scopedOut : null;
  return { plan, built, shape, pageRead, prefetched, scopedRow, contextMs: Date.now() - tCtx };
}

export type FirstReads = Awaited<ReturnType<typeof firstReads>>;

/**
 * The reads a turn's first reads count: the page, when something on it was read; each read made for another page; and
 * the scope's row, read for the model, not by it, so it counts as a read and stays off the turn's tools, as the
 * snapshot's scoped row did.
 */
export const readsIn = (first: FirstReads): number =>
  (first.pageRead ? 1 : 0) + first.prefetched.length + (first.scopedRow ? 1 : 0);
