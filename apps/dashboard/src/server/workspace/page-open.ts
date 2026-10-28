import "server-only";
import { ok, openReads } from "@chanlytics/contracts";
import { answerOfThrow, shareMembership, type RouteContext } from "@/server/with-route";
import { shareTurn } from "@/server/readers";

/**
 * A page's first reads answered as one (GET open, decision 0053 step 2).
 *
 * The document's head asked for each of a page's first reads apart (contracts routePrefetchScript), and each was a request
 * of its own: its own function, its own check of the session and its own read of the membership, and the readers two of
 * them shared read twice. Today asked for nineteen in its first pass, ten of them only once the shell had mounted
 * (measured 12 Oct 2026). Here they are one request: the session checked once by withRoute, the membership read once for
 * all of them (shareMembership), and the readers sharing one turn (shareTurn). Each read is still answered by its own
 * route, as that route's GET runs it (`run`: its scope, role, rate and query), so its answer is the JSON its own request
 * would have carried, byte for byte, and its refusal the same code, status and sentence (answerOfThrow).
 *
 * In two tiers, as the boot reads them: who is looking and the page's own first, then what it draws beside them once
 * those are in, so the heavy reads of other pages never crowd the page's own (measured 25 Sep 2026: a page's read took
 * 3,236 ms among 26 others and 773 ms alone). Each answer is written as a line the moment it settles, so the head hands a
 * read to the page as soon as it is in, never once the slowest is.
 */

/** A read GET open answers, by its own route: that route's `run`, as its GET runs it, past the session check. */
export interface OpenRead {
  run(req: Request, ctx: RouteContext & { params: Record<string, string | string[] | undefined> }): Promise<unknown>;
}

/**
 * One line of the answer: the read's key as the client spells it before its workspace (`k`), its status (`s`), the
 * envelope its own route answers (`b`) and the header a limit sets (`h`, retry-after), which the client reads.
 */
interface OpenLine {
  k: string;
  s: number;
  b: unknown;
  h?: Record<string, string>;
}

/** The answer's content type: one JSON object a line, each written as its read settles. */
const OPEN_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/**
 * The page's reads, as one streamed answer: the page, the period this device last picked and the thread its address names
 * (contracts openReads). `routeOf` names the route that answers a read by its key; a key no route answers is the page's to
 * ask for itself (route-prefetch.test.mjs holds every key to its route).
 */
export function openPage(
  ctx: RouteContext & { params: Record<string, string | string[] | undefined> },
  req: Request,
  asked: { page: string; period: string | null; thread: string | null },
  routeOf: (key: string) => OpenRead | undefined,
): Response {
  shareMembership(ctx);
  shareTurn(ctx);
  const workspace = new URL(req.url).searchParams.get("workspace") ?? "";
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(out) {
      const write = (line: OpenLine) => out.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      for (const tier of openReads(asked.page, asked.period, asked.thread)) {
        await Promise.all(
          tier.map(async (key) => {
            const route = routeOf(key);
            if (route) write(await partAnswerOf(ctx, req, workspace, key, route));
          }),
        );
      }
      out.close();
    },
  });
  return new Response(body, { headers: { "content-type": OPEN_CONTENT_TYPE } });
}

/** One read's answer, as its own route answers it: the data in its envelope, or its refusal. */
async function partAnswerOf(
  ctx: RouteContext & { params: Record<string, string | string[] | undefined> },
  req: Request,
  workspace: string,
  key: string,
  route: OpenRead,
): Promise<OpenLine> {
  const started = Date.now();
  const url = new URL(`/api/v1/${key}`, req.url);
  if (workspace) url.searchParams.set("workspace", workspace);
  try {
    const data = await route.run(new Request(url, { headers: req.headers }), ctx);
    // In the envelope withRoute writes: the same JSON the read's own request answers.
    return { k: key, s: 200, b: ok(data) };
  } catch (e) {
    const answer = answerOfThrow(e, { route: url.pathname, started, userId: ctx.userId });
    return {
      k: key,
      s: answer.status,
      b: answer.body,
      ...(Object.keys(answer.headers).length ? { h: answer.headers } : {}),
    };
  }
}
