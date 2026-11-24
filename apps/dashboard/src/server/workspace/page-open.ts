import "server-only";
import { ok, openReads } from "@chanlytics/contracts";
import { requestTimings, shareReads } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import { answerOfThrow, shareMembership, type RouteContext } from "@/server/shared/with-route";
import { shareTurn } from "@/server/shared/reader";

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
 * And the database is asked each question once (shareReads; packages/db read-once.ts). The readers a turn shares are
 * shared by name, but most of what the reads ask is asked beneath them: of the 115 reads of a table Today's opening made,
 * eighteen asked exactly what another read had asked a moment before (23 Nov 2026: the channels' state three times, the
 * mailboxes three). Every read here is a GET's, so an answer the request has is the answer the same question would get.
 *
 * In two tiers, as the boot reads them: who is looking and the page's own first, then what it draws beside them once
 * those are in, so the heavy reads of other pages never crowd the page's own (measured 25 Sep 2026: a page's read took
 * 3,236 ms among 26 others and 773 ms alone). Each answer is written as a line the moment it settles, so the head hands a
 * read to the page as soon as it is in, never once the slowest is.
 *
 * And what the opening came to, said twice once its last read is in. The route's own line in the log is written as the
 * answer's head leaves, before any read here has run, so an opening of three seconds read as one of 230 ms and no read
 * inside it was timed (production, 22 Nov 2026: the plan "Pages that open at once", piece 1). The log says how long each
 * read took, by its route's words; the answer's last line says the whole and its database calls, for the page's own
 * measures (contracts OPENING_MARK).
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

/**
 * The answer's last line: how long the opening took from its first read to its last, and the database calls its reads made
 * with the time they took together, as the request counted them (packages/log noteTiming, `db`). It names no read, so the
 * head parks nothing for it.
 */
interface OpenSum {
  o: { ms: number; db_ms: number; db_n: number };
}

/** A read's route in words alone, as the log says it: its query, which may name a thread, left off. */
const routeWordsOf = (key: string): string => key.replace(/\?.*$/, "");

/** The answer's content type: one JSON object a line, each written as its read settles. */
const OPEN_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

/** A request's context as a route hands it on, its params with it. */
type OpenContext = RouteContext & { params: Record<string, string | string[] | undefined> };

/** What a streamed answer came to: its time from its first read to its last, and the database calls its reads made. */
type OpenWhole = OpenSum["o"];

/**
 * Reads answered as one streamed request, past the one session check its route made: the membership read once for all of
 * them, the readers sharing one turn and the database asked each question once. `each` answers the reads in the order it
 * chooses (`answer` writes a read's line as it settles); `said` is told what the answer came to, as its last line is.
 */
function streamed(
  ctx: OpenContext,
  req: Request,
  routeOf: (key: string) => OpenRead | undefined,
  each: (answer: (key: string) => Promise<void>) => Promise<void>,
  said: (whole: OpenWhole, reads: Record<string, number>) => void,
): Response {
  shareMembership(ctx);
  shareTurn(ctx);
  shareReads();
  const workspace = new URL(req.url).searchParams.get("workspace") ?? "";
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(out) {
      const write = (line: OpenLine | OpenSum) => out.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const began = Date.now();
      const reads: Record<string, number> = {};
      await each(async (key) => {
        const route = routeOf(key);
        if (!route) return;
        const from = Date.now();
        write(await partAnswerOf(ctx, req, workspace, key, route));
        reads[routeWordsOf(key)] = Date.now() - from;
      });
      const calls = requestTimings().get("db");
      const whole = { ms: Date.now() - began, db_ms: Math.round(calls?.ms ?? 0), db_n: calls?.n ?? 0 };
      write({ o: whole });
      said(whole, reads);
      out.close();
    },
  });
  return new Response(body, { headers: { "content-type": OPEN_CONTENT_TYPE } });
}

/**
 * The page's reads, as one streamed answer: the page, the period this device last picked and the thread its address names
 * (contracts openReads). `routeOf` names the route that answers a read by its key; a key no route answers is the page's to
 * ask for itself (route-prefetch.test.mjs holds every key to its route).
 */
export function openPage(
  ctx: OpenContext,
  req: Request,
  input: { page: string; period: string | null; thread: string | null },
  routeOf: (key: string) => OpenRead | undefined,
): Response {
  return streamed(
    ctx,
    req,
    routeOf,
    async (answer) => {
      for (const tier of openReads(input.page, input.period, input.thread))
        await Promise.all(tier.map(async (key) => answer(key)));
    },
    (whole, reads) => log.info("page_opened", { page: input.page, ...whole, reads }),
  );
}

/**
 * How many of the rest's reads are worked on at once: as many as the boot's lanes in the browser were (surface-runner.ts
 * BOOT_LANES, four), and two more, since one function answers all of them where four requests each started their own.
 * Every read at once is what took 7.8 s for 23 reads on the salon's workspace (24 Sep 2026); a few at a time, each read's
 * line still leaves the moment it settles.
 */
const REST_LANES = 6;

/**
 * The most reads one GET open/rest answers: every path it answers (contracts OPEN_READ_PATHS, 36), and room for a few asked
 * twice over, as Leads' list in two orders. More are let go, and the client asks for each of those alone.
 */
const REST_READS_MAX = 48;

/** The longest `reads` GET open/rest takes: its most reads, each a key of a path and its query, URI-encoded. */
export const REST_READS_TEXT_MAX = 8_000;

/**
 * The reads a GET open/rest asks for, from its `reads`: each key URI-decoded, the ones a route answers (`routeOf`), each
 * once, in the order asked, at most REST_READS_MAX. A key that does not decode is passed over, as one no route answers is.
 */
export function restKeysOf(reads: string, routeOf: (key: string) => OpenRead | undefined): string[] {
  const keys: string[] = [];
  for (const part of reads.split(",")) {
    let key: string;
    try {
      key = decodeURIComponent(part);
    } catch {
      // Not a key the client spells (a stray `%`): passed over, as one no route answers is.
      continue;
    }
    if (routeOf(key) && !keys.includes(key)) keys.push(key);
    if (keys.length === REST_READS_MAX) break;
  }
  return keys;
}

/**
 * The rest of a load's reads, as one streamed answer (GET open/rest, "Pages that open at once" piece 8): the reads of the
 * pages not on screen, which the boot asks for once the page on screen is drawn, each answered by its own route as GET open
 * answers a page's, in the order the boot asked for them (the page a move went to first), a few at a time. Where the boot
 * asked each in a request of its own, every one was a function started, a session checked and a membership read (36
 * requests a load, 23 Nov 2026); and the database was asked again what a read beside it had just asked (the workspace's
 * settings 363 times over 52 loads). A key no route answers has no line, and the client asks for it alone.
 */
export function openRest(
  ctx: OpenContext,
  req: Request,
  keys: readonly string[],
  routeOf: (key: string) => OpenRead | undefined,
): Response {
  return streamed(
    ctx,
    req,
    routeOf,
    async (answer) => {
      const queue = [...keys];
      const lane = async (): Promise<void> => {
        for (let key = queue.shift(); key !== undefined; key = queue.shift()) await answer(key);
      };
      await Promise.all(Array.from({ length: Math.min(REST_LANES, queue.length) }, lane));
    },
    (whole, reads) => log.info("page_rest_opened", { asked: keys.length, ...whole, reads }),
  );
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
