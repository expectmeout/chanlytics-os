import fs from "node:fs";
import path from "node:path";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * What a page costs the database (25 Nov 2026). On the evening of 24 Nov a few browsers' worth of page loads took
 * production's database down: one load was 150 to 550 database calls, a tab left open kept reading, and a read that failed
 * was asked again at once on every part of the page. Nothing held any of it to a number.
 *
 * This counts, on the run's own stack and never on production: the database calls behind one cold load of each main page
 * and behind the same page loaded again in the same browser, behind a minute of a tab left open in front and hidden, and
 * how many requests a tab sends in a minute while every read fails. The server says each request's calls itself: in `Server-Timing` (`db;desc="<calls>"`, server-timing.ts) and, for the
 * two streamed reads (GET open, GET open/rest), in their last line (`o.db_n`, page-open.ts). Each is held to its line in
 * tests/baselines/database-calls.json, which may only fall.
 *
 * A fresh context is a first load: nothing cached, nothing kept on the device, as after a sign-in on a new browser. The
 * load after it, in the same browser, is the usual one: the device holds the workspace's rows from the load before.
 */
interface Lines {
  note: string;
  /** A cold load of a page: the database calls behind it, and the requests it sent. */
  load: Record<string, { calls: number; requests: number }>;
  /** The same page loaded again in the same browser, which holds the workspace's rows by then. */
  again: Record<string, { calls: number; requests: number }>;
  /** A minute of a tab left open once its load is in: the database calls behind it. */
  idle: Record<string, number>;
  /** A minute in which every read fails: the requests a tab sends. */
  failing: Record<string, number>;
}
const LINES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../tests/baselines/database-calls.json"), "utf8"),
) as Lines;

/** One request the page sent to the app's API, as its answer said it. */
interface Asked {
  path: string;
  status: number;
  /** The database calls behind it, as the server said; null where the answer did not say (a refusal). */
  calls: number | null;
  /** The reads a streamed answer carried, by their keys. */
  reads: string[];
}

const API = "/api/v1/";
const STREAMED = new Set(["open", "open/rest"]);
const MIN_MS = 60_000;

/** The database calls a `Server-Timing` header says (`db;dur=95;desc="7"`); none where it names no database share. */
function callsSaid(header: string | undefined): number {
  const said = /(?:^|,\s*)db;dur=[\d.]+;desc="(\d+)"/.exec(header ?? "");
  return said ? Number(said[1]) : 0;
}

/** A streamed answer's reads and what it came to: one JSON object a line, the last naming no read (`o`). */
function streamOf(text: string): { calls: number | null; reads: string[] } {
  let calls: number | null = null;
  const reads: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const said = JSON.parse(line) as { k?: string; o?: { db_n?: number } };
      if (said.o && typeof said.o.db_n === "number") calls = said.o.db_n;
      else if (typeof said.k === "string") reads.push(said.k);
    } catch {
      // A line cut off as the page moved on: it names nothing.
    }
  }
  return { calls, reads };
}

/** Hears every request a page sends to the app's API, and says when it has been quiet. */
function hearApi(page: Page) {
  const asked: Asked[] = [];
  const out = new Set<Request>();
  const reading = new Set<Promise<void>>();
  let lastAt = Date.now();
  const isApi = (url: string) => new URL(url).pathname.startsWith(API);
  const onRequest = (req: Request) => {
    if (!isApi(req.url())) return;
    out.add(req);
    lastAt = Date.now();
  };
  const onDone = (req: Request) => {
    if (out.delete(req)) lastAt = Date.now();
  };
  const onResponse = (res: Response) => {
    if (!isApi(res.url())) return;
    const at = new URL(res.url()).pathname.slice(API.length);
    const work = (async () => {
      const streamed = STREAMED.has(at) && res.ok();
      const stream = streamed ? streamOf(await res.text().catch(() => "")) : null;
      asked.push({
        path: at,
        status: res.status(),
        calls: stream ? stream.calls : res.ok() ? callsSaid(res.headers()["server-timing"]) : null,
        reads: stream?.reads ?? [],
      });
      lastAt = Date.now();
    })();
    reading.add(work);
    void work.finally(() => reading.delete(work));
  };
  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);
  page.on("response", onResponse);
  return {
    asked,
    /** Settles once nothing has been out or answered for `forMs`, or `atMostMs` has passed. */
    async quiet(forMs: number, atMostMs: number): Promise<void> {
      const until = Date.now() + atMostMs;
      for (;;) {
        const still = out.size === 0 && reading.size === 0 && Date.now() - lastAt >= forMs;
        if (still || Date.now() > until) return;
        await page.waitForTimeout(250);
      }
    },
  };
}

const sumCalls = (asked: readonly Asked[]): number => asked.reduce((sum, a) => sum + (a.calls ?? 0), 0);
const unsaid = (asked: readonly Asked[]): Asked[] => asked.filter((a) => a.calls === null);

/** What a load came to, in one line of the run's log and on the report beside its test. */
function said(kind: string, name: string, words: string): void {
  test.info().annotations.push({ type: "database-calls", description: `${kind} ${name}: ${words}` });
  console.log(`database-calls ${kind} ${name}: ${words}`);
}

/** A signed-in page in a browser that holds nothing: a first load. */
async function freshPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page);
  return { context, page };
}

/** The run's workspace by its address word, and one of its people. */
async function whereToLook(browser: Browser): Promise<{ slug: string; person: string }> {
  const { context, page } = await freshPage(browser);
  await page.goto("/#/today");
  await page.waitForURL((u) => /^\/w\/[^/]+/.test(u.pathname), { timeout: 30_000 });
  const slug = /^\/w\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  const people = (await (await page.request.get(`${API}contacts?workspace=${encodeURIComponent(slug)}`)).json()) as {
    data?: { people?: Array<{ id: string }> };
  };
  await context.close();
  return { slug, person: people.data?.people?.[0]?.id ?? "" };
}

/** A load on its way is in once the reads it begins for the other pages are (GET open/rest), and the page is quiet. */
async function loadIn(page: Page, heard: ReturnType<typeof hearApi>): Promise<void> {
  // The rest of a load's reads leave once the page on screen is drawn: quiet after it, or after a while.
  await page
    .waitForResponse((r) => new URL(r.url()).pathname === `${API}open/rest`, { timeout: 20_000 })
    .catch(() => null);
  await heard.quiet(4_000, 60_000);
}

/** A cold load of an address: every request it sent, once the load and the reads it begins for the other pages are in. */
async function coldLoad(
  browser: Browser,
  address: string,
): Promise<{ asked: Asked[]; context: BrowserContext; page: Page; heard: ReturnType<typeof hearApi> }> {
  const { context, page } = await freshPage(browser);
  const heard = hearApi(page);
  await page.goto(address);
  await loadIn(page, heard);
  return { asked: heard.asked, context, page, heard };
}

/** What a load came to, as its line says it: its calls, its requests and where they went. */
function loadWords(asked: readonly Asked[]): string {
  const open = asked.filter((a) => a.path === "open");
  const rest = asked.filter((a) => a.path === "open/rest");
  const alone = asked.filter((a) => !STREAMED.has(a.path));
  return (
    `${sumCalls(asked)} calls in ${asked.length} requests ` +
    `(the page's one read ${sumCalls(open)} for ${open.flatMap((a) => a.reads).length} reads, ` +
    `the rest ${sumCalls(rest)} for ${rest.flatMap((a) => a.reads).length} reads, ` +
    `${alone.length} alone ${sumCalls(alone)}; ${unsaid(asked).length} did not say)`
  );
}

/** The main pages, by the name their line is kept under, each with its path after the workspace's. */
const PAGES: ReadonlyArray<[string, (at: { person: string }) => string]> = [
  ["today", () => "today"],
  ["inbox", () => "inbox"],
  ["people", () => "people"],
  ["person", ({ person }) => `people/${person}`],
  ["calendar", () => "calendar"],
  ["campaigns", () => "campaigns"],
  ["campaigns-content", () => "campaigns/content"],
  ["campaigns-forms", () => "campaigns/forms"],
  ["reports", () => "reports"],
  ["settings", () => "settings"],
];

test.describe("what a page costs the database", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  // On the run's own stack alone: a count on production is a walk of production (e2e/production says what a night may ask).
  test.skip(!!process.env.E2E_PRODUCTION, "counted on the run's own stack, never on production");
  test.describe.configure({ mode: "serial" });

  let where = { slug: "", person: "" };
  test.beforeAll(async ({ browser }) => {
    where = await whereToLook(browser);
  });

  for (const [name, pathOf] of PAGES) {
    test(`${name}, a cold load: within its database calls`, async ({ browser }) => {
      test.setTimeout(150_000);
      expect(where.slug, "the run's workspace has an address").not.toBe("");
      const cold = await coldLoad(browser, `/w/${where.slug}/${pathOf(where)}`);
      const asked = [...cold.asked];
      said("load", name, loadWords(asked));
      for (const a of asked.filter((x) => !STREAMED.has(x.path)))
        console.log(`database-calls   ${name} alone ${a.path} ${a.status}: ${a.calls ?? "?"}`);
      // The same page loaded again in the same browser: the device holds the workspace's rows, as on every load but a
      // sign-in's first. The page writes what it holds as it is put away, which a reload does.
      await cold.page.reload();
      await loadIn(cold.page, cold.heard);
      const again = cold.asked.slice(asked.length);
      await cold.context.close();
      said("again", name, loadWords(again));
      for (const a of again.filter((x) => !STREAMED.has(x.path)))
        console.log(`database-calls   ${name} again alone ${a.path} ${a.status}: ${a.calls ?? "?"}`);
      const line = LINES.load[name];
      if (line) {
        expect(sumCalls(asked), `${name}: database calls behind a cold load`).toBeLessThanOrEqual(line.calls);
        expect(asked.length, `${name}: requests on a cold load`).toBeLessThanOrEqual(line.requests);
      }
      const second = LINES.again[name];
      if (second) {
        expect(sumCalls(again), `${name}: database calls behind the load after`).toBeLessThanOrEqual(second.calls);
        expect(again.length, `${name}: requests on the load after`).toBeLessThanOrEqual(second.requests);
      }
    });
  }

  test("each read of a load, asked alone: its database calls", async ({ browser }) => {
    test.setTimeout(240_000);
    const keys = new Set<string>();
    for (const at of ["today", "people", "campaigns"]) {
      const { asked, context } = await coldLoad(browser, `/w/${where.slug}/${at}`);
      await context.close();
      for (const a of asked) {
        for (const k of a.reads) keys.add(k);
        if (!STREAMED.has(a.path)) keys.add(a.path);
      }
    }
    const { context, page } = await freshPage(browser);
    const ws = encodeURIComponent(where.slug);
    let sum = 0;
    for (const key of [...keys].sort()) {
      const res = await page.request.get(`${API}${key}${key.includes("?") ? "&" : "?"}workspace=${ws}`);
      const calls = res.ok() ? callsSaid(res.headers()["server-timing"]) : null;
      sum += calls ?? 0;
      console.log(`database-calls read ${key} ${res.status()}: ${calls ?? "?"}`);
    }
    await context.close();
    said("reads", "alone", `${sum} calls for ${keys.size} reads, each asked by itself`);
  });

  for (const name of ["today", "campaigns-content"] as const) {
    test(`${name}, a tab left open: a quiet minute, in front and hidden`, async ({ browser }) => {
      test.setTimeout(300_000);
      const at = PAGES.find(([n]) => n === name)?.[1](where) ?? name;
      const { asked, context, page } = await coldLoad(browser, `/w/${where.slug}/${at}`);
      const loaded = asked.length;
      // Two minutes in front, so the turn of a minute and whatever the page reads by the clock are in it.
      await page.waitForTimeout(2 * MIN_MS);
      const front = asked.slice(loaded);
      // Hidden, as a tab behind another: what the page reads for nobody.
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const hiddenFrom = asked.length;
      await page.waitForTimeout(MIN_MS);
      const hidden = asked.slice(hiddenFrom);
      await context.close();
      const aMinute = Math.ceil(sumCalls(front) / 2);
      said(
        "idle",
        name,
        `${aMinute} calls a minute in front (${front.length} requests in two), ${sumCalls(hidden)} hidden (${hidden.length})`,
      );
      for (const a of [...front, ...hidden])
        console.log(`database-calls   ${name} idle ${a.path} ${a.status}: ${a.calls ?? "?"}`);
      const line = LINES.idle[name];
      if (line === undefined) return;
      expect(aMinute, `${name}: ${aMinute} database calls a minute, left open in front`).toBeLessThanOrEqual(line);
      expect(sumCalls(hidden), `${name}: database calls in a minute hidden`).toBeLessThanOrEqual(line);
    });
  }

  test("while every read fails, a tab sends few requests: a load, and a return to the tab", async ({ browser }) => {
    test.setTimeout(300_000);
    // A load into a server that cannot read: every read answers as the app answers a database it cannot reach.
    const cold = await freshPage(browser);
    let refused = 0;
    const refusedAt = new Map<string, number>();
    /** Each refused read in the order it left, with the seconds since the first: when a tab's rule let it leave. */
    const refusedWhen: string[] = [];
    let firstRefused = 0;
    /** What was asked while failing, by path, most first, then in order with its second: what the tab's rule let leave. */
    const sayRefused = (name: string) => {
      const most = [...refusedAt].sort((a, b) => b[1] - a[1]);
      console.log(`database-calls   failing ${name}: ${most.map(([path, n]) => `${path} ${n}`).join(", ")}`);
      console.log(`database-calls   failing ${name} in order: ${refusedWhen.join(", ")}`);
      refusedAt.clear();
      refusedWhen.length = 0;
      firstRefused = 0;
    };
    // A database that cannot be reached answers nothing that needs it, a write no more than a read: both are refused,
    // and the reads are what is counted. (With writes let through, each one answered told the tab the server answers.)
    const failing = (context: BrowserContext) =>
      context.route(`**${API}**`, (route) => {
        if (route.request().method() === "GET") {
          refused += 1;
          const path = new URL(route.request().url()).pathname.slice(API.length);
          refusedAt.set(path, (refusedAt.get(path) ?? 0) + 1);
          firstRefused ||= Date.now();
          refusedWhen.push(`${path}@${((Date.now() - firstRefused) / 1000).toFixed(1)}`);
        }
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: { code: "unavailable", message: "Couldn't finish that." } }),
        });
      });
    await failing(cold.context);
    await cold.page.goto(`/w/${where.slug}/today`);
    await cold.page.waitForTimeout(MIN_MS);
    const onLoad = refused;
    await cold.context.close();
    said("failing", "load", `${onLoad} requests in the first minute of a load with every read failing`);
    sayRefused("load");

    // A tab that loaded well, then loses its reads, and is come back to after a while away: everything is asked again.
    const warm = await coldLoad(browser, `/w/${where.slug}/today`);
    refused = 0;
    refusedAt.clear();
    refusedWhen.length = 0;
    firstRefused = 0;
    await failing(warm.context);
    const hide = (hidden: boolean) =>
      warm.page.evaluate((isHidden) => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => (isHidden ? "hidden" : "visible"),
        });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => isHidden });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await hide(true);
    await warm.page.waitForTimeout(35_000);
    await hide(false);
    await warm.page.waitForTimeout(MIN_MS);
    const onReturn = refused;
    await warm.context.close();
    said("failing", "return", `${onReturn} requests in the minute after a return to a tab whose reads all fail`);
    sayRefused("return");

    if (LINES.failing.load !== undefined)
      expect(onLoad, `${onLoad} requests in a minute of a load whose reads fail`).toBeLessThanOrEqual(
        LINES.failing.load,
      );
    if (LINES.failing.return !== undefined)
      expect(onReturn, `${onReturn} requests in a minute after a return, reads failing`).toBeLessThanOrEqual(
        LINES.failing.return,
      );
  });
});
