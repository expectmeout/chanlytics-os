/**
 * The rules of where a page's time goes (decision 0053), pure over a clock, a paint and an `emit`, so node runs them
 * (tooling/scripts/tests/platform/page-speed.test.mjs); page-speed.ts hands them the browser.
 *
 *   createPageSpeed  each visit to a page, and each part of it, from its start to the frame its rows were painted in:
 *                    READY for each, the page's own from its first part (contracts PRIMARY_PART) or, with none, from
 *                    the frame after its gate opened; SETTLED once everything it draws is read.
 *   waitOf           what a wait went on: the read that landed last inside it, its server's and database's share
 *                    (Server-Timing), the chunk of script it waited for, and the drawing left after both.
 */
import { MIN_MS, PRIMARY_PART, type PageVitalDetailDto, type PageVitalReportDto } from "@chanlytics/contracts";

/**
 * A browser no customer is in: one a test drives (navigator.webdriver), or the Claude app's own browser pane, where the
 * walks of the app are taken and which says no test drives it. Its loads were counted as a customer's: the walks of 27-28
 * Oct 2026 put Settings' cold loads at 5.8 s on a desk and 5.3 on a phone, against 1.6 and 0.8 before, on a machine at its
 * memory's limit and a pane often off screen (the Settings load review, 28 Oct 2026). Its user agent names the app.
 */
export const notACustomer = (nav: { webdriver?: boolean; userAgent?: string }): boolean =>
  !!nav.webdriver || /\bClaude\/\d/.test(nav.userAgent ?? "");

/** What one measure says, before the collector gives it its id. */
export type SpeedReport = Omit<PageVitalReportDto, "id">;

/** A person who waits longer than this has gone to do something else: nothing past it is kept. */
const SPEED_CEILING_MS = MIN_MS;
/** A part begun again this soon, on the same thing, was begun once and said twice. */
const REBEGIN_MS = 50;

interface SpeedDeps {
  /** The page's clock (performance.now). */
  now(): number;
  /** Calls back with the time just after the next frame is painted; never in a tab nothing paints. */
  afterPaint(fn: (at: number) => void): void;
  emit(report: SpeedReport): void;
  /** What the page's wait between two times went on: the reads and chunks that landed in it (installPageSpeed's watch). */
  waits(page: string, from: number, to: number): PageVitalDetailDto | undefined;
  /** The same number, said in the browser's timeline (performance.measure), with the report itself. */
  measure?(name: string, start: number, end: number, report: SpeedReport): void;
}

/** A part of the page on screen beginning to show `key` (`""` for a part that shows one thing), with whether its rows
 * were held as it began, and `changed` when it moved on from another thing. */
export interface PartBegun {
  page: string;
  part: string;
  key: string;
  warm: boolean;
  changed: boolean;
}

interface PartRun {
  key: string;
  at: number;
  /** When it was begun, on the page's clock: a begin said again this soon is the same one. */
  begunAt: number;
  /** Timed from its own press: a move inside its page. */
  within: boolean;
  warm: boolean;
  done: boolean;
}

interface Visit {
  page: string;
  /** The page a move left; null for a load. */
  from: string | null;
  at: number;
  /** Whether the page's own rows were held when it began (a page with no first part reads it from the gate). */
  warm: boolean;
  /** Whether a surface it draws had still to be read when it began: only then is SETTLED news. */
  cold: boolean;
  shown: boolean;
  /** The frame drew it with its gate open: its READY, where it has no first part, is the next frame's. */
  gated: boolean;
  settled: boolean;
  /** Hidden before it was drawn: nothing more is said of it. */
  lost: boolean;
  parts: Map<string, PartRun>;
}

export interface PageSpeed {
  /** A page begins: the document's (a load, from 0) or a move's (from the press). The visit before it is let go. */
  begin(page: string, opts: { from: string | null; at: number; warm: boolean; cold: boolean }): void;
  /** A part of the page on screen begins, asked for at `at` (the press, where it was one). */
  partBegins(begun: PartBegun, at: number): void;
  /** That part's rows are drawn; its READY is the next frame's. */
  partReady(page: string, part: string, key: string): void;
  /** The frame drew the page with its gate open: its READY, where it names no first part. */
  gate(page: string): void;
  /** Every surface the page draws has been read: its SETTLED, where one had to be. */
  settle(page: string): void;
  /** The page was hidden: what it had not drawn yet is not a person's wait. */
  lose(): void;
  /** The page on screen, and when it began. */
  visit(): { page: string; at: number } | null;
}

export function createPageSpeed(deps: SpeedDeps): PageSpeed {
  let visit: Visit | null = null;
  const live = (v: Visit) => visit === v && !v.lost;

  const say = (r: SpeedReport, start: number) => {
    if (!(r.value >= 0) || r.value > SPEED_CEILING_MS) return;
    deps.emit(r);
    deps.measure?.(`${r.page}${r.part ? `.${r.part}` : ""} ${r.name.toLowerCase()}`, start, start + r.value, r);
  };

  /** The page itself drawn: from the visit's start, with what it waited on where it did not draw held rows. */
  const pageReady = (v: Visit, at: number, warm: boolean) => {
    if (v.shown) return;
    v.shown = true;
    // What it waited on, held rows or not: a move whose rows were held can still wait for its page (the router's fetch).
    const detail = deps.waits(v.page, v.at, at);
    say(
      {
        name: "READY",
        value: at - v.at,
        page: v.page,
        ...(v.from ? { from: v.from } : {}),
        warm,
        ...(detail ? { detail } : {}),
      },
      v.at,
    );
  };

  return {
    begin(page, opts) {
      visit = {
        page,
        from: opts.from,
        at: opts.at,
        warm: opts.warm,
        cold: opts.cold,
        shown: false,
        gated: false,
        settled: false,
        lost: false,
        parts: new Map(),
      };
    },
    partBegins({ page, part, key, warm, changed }, at) {
      const v = visit;
      if (!v || v.page !== page) return;
      const now = deps.now();
      const had = v.parts.get(part);
      // The same thing begun again at once is one begin said twice (React's strict mode runs a mount's effects twice).
      if (had && had.key === key && now - had.begunAt < REBEGIN_MS) return;
      // A part's first thing is the page's own wait; a later one, by a new key or the part drawn afresh (a person opened
      // from another, a list picked), is timed from the press that asked for it. So is one first begun once the page itself
      // was drawn: a part nothing opened as the page arrived (a thread tapped on a phone's Conversations, a sequence opened
      // from Campaigns' list) was timed from the page's own start, the whole visit up to the press counted as its wait
      // (production, 18 Oct 2026: Conversations' phone thread at 2.5 to 8.8 s).
      const within = changed || !!had || v.shown;
      // Held: a part the press opened, by what it had as it began; one of the page's own, only if the page's rows were
      // held when the page began, since a part the frame's gate holds back is drawn with its rows whatever it waited.
      const held = within ? warm : warm && v.warm;
      v.parts.set(part, { key, at: within ? at : v.at, begunAt: now, within, warm: held, done: false });
    },
    partReady(page, part, key) {
      const v = visit;
      const run = v?.parts.get(part);
      if (!v || v.page !== page || !run || run.key !== key || run.done) return;
      run.done = true;
      deps.afterPaint((at) => {
        if (!live(v)) return;
        say(
          {
            name: "READY",
            value: at - run.at,
            page,
            part,
            ...(run.within ? { from: page } : v.from ? { from: v.from } : {}),
            warm: run.warm,
          },
          run.at,
        );
        if (!run.within && PRIMARY_PART[page] === part) pageReady(v, at, run.warm);
      });
    },
    gate(page) {
      const v = visit;
      if (!v || v.page !== page || v.shown || v.gated || PRIMARY_PART[page] !== undefined) return;
      v.gated = true;
      deps.afterPaint((at) => {
        if (live(v)) pageReady(v, at, v.warm);
      });
    },
    settle(page) {
      const v = visit;
      if (!v || v.page !== page || v.settled) return;
      v.settled = true;
      if (!v.cold) return;
      deps.afterPaint((at) => {
        if (!live(v)) return;
        const detail = deps.waits(v.page, v.at, at);
        say(
          {
            name: "SETTLED",
            value: at - v.at,
            page,
            ...(v.from ? { from: v.from } : {}),
            warm: v.warm,
            ...(detail ? { detail } : {}),
          },
          v.at,
        );
      });
    },
    lose() {
      if (visit) visit.lost = true;
    },
    visit() {
      return visit ? { page: visit.page, at: visit.at } : null;
    },
  };
}

/* --------------------------------- what the time went on --------------------------------- */

/** A resource the page waited on: one of its reads, or a chunk of its script. */
export interface Landed {
  kind: "read" | "chunk";
  name: string;
  end: number;
  duration: number;
  /** Server-Timing's parts, by name: `app`, `auth`, `db` (with its calls), `read.<reader>`. */
  server: ReadonlyArray<{ name: string; duration: number; description: string }>;
}

/**
 * A read's route, in words alone: `/api/v1/contacts/5f0c…/notes?workspace=acme` is `contacts/notes`. Never an id, a
 * query or a workspace's name: what the table keeps is the code's own words (contracts PageVitalDetail).
 */
export function readKeyOf(url: string): string | null {
  let path: string;
  try {
    path = new URL(url, "http://x").pathname;
  } catch {
    return null;
  }
  const at = path.indexOf("/api/v1/");
  if (at < 0) return null;
  const words = path
    .slice(at + "/api/v1/".length)
    .split("/")
    .filter((w) => /^[a-z][a-z-]{0,39}$/.test(w))
    .slice(0, 2);
  return words.length ? words.join("/") : null;
}

const SHARE_CEILING = 10 * MIN_MS;
/** More database calls than this for one answer is said as this many: the table's word for "a great many". */
const DB_CALLS_CEILING = 10_000;
const shareMs = (v: number) => Math.min(SHARE_CEILING, Math.max(0, Math.round(v)));

const pagePathOf = (url: string): string | null => {
  try {
    return new URL(url, "http://x").pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

/**
 * A read's key as the table says it: one of the app's own is its route's words; the router's fetch of the page the wait
 * is on (`here`, its path) is `page`, and of another page `warm`, a page warmed beside it (workspace.ts warmRoute) that
 * the move never asked for. With no address to hold it to, every router fetch is `page`.
 */
function waitKeyOf(name: string, here: string | undefined): string | null {
  if (!name.includes("_rsc=")) return readKeyOf(name);
  return here === undefined || pagePathOf(name) === here.replace(/\/+$/, "") ? "page" : "warm";
}

/** The page a wait is on: the reads that are its own (their keys), and its path, where the router's fetch of it is one. */
interface WaitPage {
  own?: ReadonlySet<string>;
  here?: string;
}

/** Inside a wait: the page's own read that landed last, else any read's, and the longest chunk of script. */
function landedIn(landed: readonly Landed[], from: number, to: number, { own = new Set(), here }: WaitPage) {
  let read: Landed | null = null;
  let mine: Landed | null = null;
  let chunk: Landed | null = null;
  for (const l of landed) {
    if (l.end <= from || l.end > to) continue;
    if (l.kind === "read") {
      if (!read || l.end > read.end) read = l;
      const key = waitKeyOf(l.name, here);
      if (key && own.has(key) && (!mine || l.end > mine.end)) mine = l;
    } else if (!chunk || l.duration > chunk.duration) chunk = l;
  }
  return { read: mine ?? read, chunk };
}

/** What a read's answer said of its own time (Server-Timing): the server's, the database's, and how many calls. */
function serverShareOf(read: Landed): PageVitalDetailDto {
  const part = (name: string) => read.server.find((s) => s.name === name);
  const app = part("app");
  const auth = part("auth");
  const db = part("db");
  const share: PageVitalDetailDto = {};
  if (app || auth) share.server_ms = shareMs((app?.duration ?? 0) + (auth?.duration ?? 0));
  if (db) {
    share.db_ms = shareMs(db.duration);
    const calls = Number.parseInt(db.description, 10);
    if (Number.isFinite(calls) && calls >= 0) share.db_n = Math.min(DB_CALLS_CEILING, calls);
  }
  return share;
}

/**
 * What a wait from `from` to `to` went on: the read that landed last inside it among the page's own (`page.own`, the reads
 * it opens on and the router's fetch of it, the page at `page.here`), else among any (the one the page could not draw
 * without), the longest chunk of script that had to arrive, and the time left for drawing after both.
 */
export function waitOf(
  landed: readonly Landed[],
  from: number,
  to: number,
  page: WaitPage = {},
): PageVitalDetailDto | undefined {
  const { read, chunk } = landedIn(landed, from, to, page);
  if (!read && !chunk) return undefined;
  const detail: PageVitalDetailDto = {};
  if (read) {
    const key = waitKeyOf(read.name, page.here);
    if (key) detail.wait = key;
    detail.wait_ms = shareMs(read.duration);
    Object.assign(detail, serverShareOf(read));
  }
  if (chunk) detail.chunk_ms = shareMs(chunk.duration);
  detail.render_ms = shareMs(to - Math.max(from, read?.end ?? from, chunk?.end ?? from));
  return detail;
}
