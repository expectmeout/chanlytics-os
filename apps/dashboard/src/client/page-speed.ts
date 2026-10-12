/**
 * Where a page's time goes, measured where it is spent (decision 0053).
 *
 * The browser's five say how fast a document was; a person waits for something else: the page they asked for drawn
 * with its rows, and its parts as each one's rows arrive. So the shell measures two numbers of its own and sends them
 * with the five (field-data.ts):
 *
 *   READY    a page, or a part of it, drawn with its rows: from the press that asked for it (a move), or from the
 *            document's start (a load), to the frame it was painted in. A page's READY is its first part's
 *            (contracts PRIMARY_PART); a page that names none is READY when the frame's gate opens on it and it is
 *            painted. A part that shows one thing at a time (a thread, a call) is timed again for each from the press
 *            that opened it, as a move inside its page.
 *   SETTLED  every surface the page draws read, when one had to be: the shell's badge, the bell and the page's own,
 *            painted.
 *
 * Each says whether what it drew was already held (`warm`: the tab's cache, a view held) and, where it waited, what on
 * (`detail`): the read that landed last before it was drawn, its route, how much of it the server said was its own
 * (Server-Timing: `app`, `auth`, `db` and its calls), a script chunk it waited for, and what was left for drawing. A
 * page hidden before it was drawn says nothing: a background tab's frames are not a person waiting.
 *
 * Every number is also a measure in the browser's own timeline (performance.measure), on a track of its own in Chrome's
 * Performance panel, so a browser test or a person with DevTools reads the same numbers the field data keeps.
 *
 * Two halves: the rules, pure over a clock and an `emit` (page-speed-rules.ts, tested in node), and `installPageSpeed`
 * here, which hands them the window's events, the shell's address and surfaces, and the field data's collector. The
 * parts of a page say when they are drawn through `partBegins` and `partReady` (surfaces/use-surface.ts usePartShown).
 */
import { PAGE_PHONE_QUERY, PREFETCH_READS, vitalsPageOf } from "@chanlytics/contracts";
import { beaconTo, createFieldData, flushWhenHidden, type FieldData } from "./field-data";
import {
  createPageSpeed,
  readKeyOf,
  waitOf,
  type Landed,
  type PageSpeed,
  type PartBegun,
  type SpeedReport,
} from "./page-speed-rules";

/** A move is timed from the press that asked for it when the press came this soon before the ask; else from the ask. */
const INPUT_WINDOW_MS = 1000;
/** A move the shell asked for, landing this long after the ask, is still that ask's (a router fetching the page). */
const ASK_WINDOW_MS = 10_000;

/** How many landed resources are held to say what a wait went on: the latest, which are the ones a wait can be. */
const LANDED_HELD = 300;

/* --------------------------------- the browser's side --------------------------------- */

/** What the shell hands the measures: its address, its surfaces, and its gate (LegacyApp). */
export interface SpeedShell {
  /** The route on screen (workspace.ts routeOnScreen). */
  route(): string;
  /** Hear the route on screen change (workspace.ts hearAddress); answers the stop. */
  hearRoute(fn: () => void): () => void;
  /** Hear the shell ask for a route, before its page is drawn (workspace.ts onRouteAsked). */
  hearAsked(fn: ((route: string) => void) | null): void;
  /** The surfaces the route's page is drawn from (surface-registry.ts routeSurfaces). */
  surfacesOf(route: string): readonly string[];
  /** The route's own surface (surface-registry.ts routeSurfaceFor). */
  ownSurface(route: string): string | undefined;
  /** Whether a read of the surface has come back in this document, with rows or with none. */
  isRead(key: string): boolean;
  /** Whether the surface holds real rows (read, or restored by the tab's cache). */
  isReady(key: string): boolean;
  /** Whether the frame's gate is open on the route (surface-registry.ts installRouteGate). */
  gateOpen(route: string): boolean;
  /** Hear a surface's status change (surface-status.ts onSurfaceStatusChange); answers the stop. */
  hearSurfaces(fn: () => void): () => void;
}

export interface SpeedHost {
  /** The collector the browser's five go to as well (field-data-reporter.ts). */
  fieldData: FieldData;
  /** The page a load landed on. */
  landing: string;
  /** The page on screen at a time on the page's clock: what a tap or a shift reported later was on. */
  pageAt(t: number): { page: string; from: string | null };
}

interface Installed {
  speed: PageSpeed;
  inputAt(now: number): number;
  frameDrawn(): void;
  host: SpeedHost;
}

let installed: Installed | null = null;

/** The measures, once installed; null in the mockup and in a test that installs none. */
export function speedHost(): SpeedHost | null {
  return installed?.host ?? null;
}

/** A part of the page on screen begins (usePartShown), from the press that asked for it where one just came. */
export function partBegins(begun: PartBegun): void {
  if (!installed) return;
  installed.speed.partBegins(begun, installed.inputAt(performance.now()));
}

/** A part's rows are drawn (usePartShown). */
export function partReady(page: string, part: string, key: string): void {
  installed?.speed.partReady(page, part, key);
}

/**
 * The frame committed a draw (LegacyApp, after each of its renders): where its gate is open on the page on screen, the
 * page is drawn, and its READY, if it names no first part, is the next frame. Said from a draw, never from a status
 * change, so a load is never READY at a frame before the page was put on it.
 */
export function frameDrawn(): void {
  installed?.frameDrawn();
}

/** After the next frame is painted: the frame's callback, then a task, which runs once the frame is on the screen. */
function afterPaint(fn: (at: number) => void): void {
  requestAnimationFrame(() => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => fn(performance.now());
    ch.port2.postMessage(0);
  });
}

/** The names this tab has measured, so the timeline is trimmed of the shell's own and nobody else's. */
const MEASURES_HELD = 400;

function measureIn(perf: Performance) {
  const names = new Set<string>();
  let count = 0;
  return (name: string, start: number, end: number, report: SpeedReport) => {
    const { warm, detail } = report;
    const said = [
      warm === undefined ? null : warm ? "held rows" : "read",
      detail?.wait ? `waits on ${detail.wait}` : null,
    ];
    try {
      perf.measure(name, {
        start,
        end,
        detail: {
          // What the field data keeps of it, for a browser test to read as the table would.
          speed: report,
          // Chrome's Performance panel draws these on a track of their own (its extensibility API); other browsers keep
          // the measure and ignore the words.
          devtools: {
            dataType: "track-entry",
            track: "Pages",
            trackGroup: "Chanlytics",
            color: warm ? "secondary" : "primary",
            tooltipText: [`${name}: ${Math.round(end - start)} ms`, ...said.filter(Boolean)].join(", "),
            properties: Object.entries(detail ?? {}).map(([k, v]) => [k, String(v)]),
          },
        },
      });
      names.add(name);
      count += 1;
      if (count > MEASURES_HELD) {
        for (const n of names) perf.clearMeasures(n);
        names.clear();
        count = 0;
      }
    } catch {
      /* a browser without measure options: the field data still has the number */
    }
  };
}

/** The shell's route a page is drawn on, by the field data's name for it: what PREFETCH_READS keys it by. */
const SHELL_ROUTE_OF: Readonly<Record<string, string>> = {
  people: "clients",
  person: "clients",
  pipeline: "clients",
  leads: "leads",
  lists: "segments",
  settings: "admin",
  playbooks: "outbound",
  templates: "messages",
};

/**
 * The reads a page opens on, by their keys (contracts PREFETCH_READS, spelled as the client asks for them), the
 * router's fetch of the page, and who is looking: the reads its wait can be its own. A person's page reads its person.
 */
function ownReads(page: string): ReadonlySet<string> {
  const reads = PREFETCH_READS[SHELL_ROUTE_OF[page] ?? page] ?? [];
  const keys = reads.map((r) => readKeyOf(`/api/v1/${r}`)).filter((k): k is string => k !== null);
  return new Set(["page", "workspaces", ...(page === "person" ? ["contacts"] : []), ...keys]);
}

/** The resources a wait can be, watched as they land, the latest few hundred. */
function watchLanded(): Landed[] {
  const landed: Landed[] = [];
  const take = (e: PerformanceEntry) => {
    const r = e as PerformanceResourceTiming;
    // A read the page waits on: one of its own (/api/v1/), or the router fetching a page it was asked to move to.
    const read = r.name.includes("/api/v1/") || r.name.includes("_rsc=");
    const chunk = !read && r.initiatorType === "script";
    if (!read && !chunk) return;
    landed.push({
      kind: read ? "read" : "chunk",
      name: r.name,
      end: r.responseEnd,
      duration: r.duration,
      server: (r.serverTiming ?? []).map((s) => ({ name: s.name, duration: s.duration, description: s.description })),
    });
    if (landed.length > LANDED_HELD) landed.splice(0, landed.length - LANDED_HELD);
  };
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(take)).observe({ type: "resource", buffered: true });
  } catch {
    /* no observer: a wait says nothing of what it went on */
  }
  return landed;
}

/** The pages this load has been on, and when each began: what a report that arrives later was on. */
const PAGES_HELD = 200;

/**
 * Hand the measures the browser and the shell, once, on a workspace's page: the document's visit begins at its start,
 * each move of the address begins another from the press that asked for it, the shell's gate and surfaces say when a
 * page with no first part is drawn and when everything it draws is in, and a hidden page loses what it had not drawn.
 * The collector sends with the browser's five; a browser a test drives (navigator.webdriver) sends nothing, and still
 * measures.
 */
export function installPageSpeed(shell: SpeedShell, facts: { build: string; report: boolean }): SpeedHost | null {
  if (installed) return installed.host;
  if (typeof window === "undefined" || typeof performance === "undefined") return null;
  const landing = vitalsPageOf(shell.route());
  const device = window.matchMedia?.(PAGE_PHONE_QUERY).matches ? "phone" : "desk";
  const build = /^[0-9a-z]{3,40}$/.test(facts.build) ? facts.build.slice(0, 12) : undefined;
  // A development build measures and keeps its numbers to itself: it talks to the production database, and a page
  // compiled on its first request is no person's wait. So does a browser a test drives.
  const send = !facts.report || navigator.webdriver ? () => {} : beaconTo(navigator);
  const fieldData = createFieldData(landing, send, { device, ...(build ? { build } : {}) });
  flushWhenHidden(window, fieldData);

  // The shell's own reports, each under an id of this load's.
  const loadKey = `s${Math.round(performance.timeOrigin)}-${Math.floor(Math.random() * 1e9)}`;
  let said = 0;
  const landed = watchLanded();
  const speed = createPageSpeed({
    now: () => performance.now(),
    afterPaint,
    emit: (r) => fieldData.note({ id: `${loadKey}-${(said += 1)}`, ...r }),
    waits: (page, from, to) => waitOf(landed, from, to, ownReads(page)),
    measure: measureIn(performance),
  });

  // The press a move was asked by: the last pointer or key down, when it came just before the ask.
  let lastInput: number | null = null;
  const pressed = (e: Event) => (lastInput = e.timeStamp);
  window.addEventListener("pointerdown", pressed, { capture: true, passive: true });
  window.addEventListener("keydown", pressed, { capture: true, passive: true });
  const inputAt = (now: number) => (lastInput !== null && now - lastInput <= INPUT_WINDOW_MS ? lastInput : now);
  let asked: { page: string; at: number } | null = null;
  shell.hearAsked((route) => {
    const now = performance.now();
    asked = { page: vitalsPageOf(route), at: inputAt(now) };
  });

  const pages: Array<{ at: number; page: string; from: string | null }> = [];
  // Everything the page on screen draws read: its SETTLED.
  const check = () => {
    const v = speed.visit();
    const route = shell.route();
    if (v && vitalsPageOf(route) === v.page && shell.surfacesOf(route).every((k) => shell.isRead(k)))
      speed.settle(v.page);
  };
  const frameDrawn = () => {
    const v = speed.visit();
    const route = shell.route();
    if (v && vitalsPageOf(route) === v.page && shell.gateOpen(route)) speed.gate(v.page);
  };
  const begin = (from: string | null, at: number) => {
    const route = shell.route();
    const page = vitalsPageOf(route);
    const own = shell.ownSurface(route);
    speed.begin(page, {
      from,
      at,
      warm: own ? shell.isReady(own) : true,
      cold: shell.surfacesOf(route).some((k) => !shell.isRead(k)),
    });
    pages.push({ at, page, from });
    if (pages.length > PAGES_HELD) pages.splice(0, pages.length - PAGES_HELD);
    check();
  };
  begin(null, 0);
  shell.hearRoute(() => {
    const v = speed.visit();
    const page = vitalsPageOf(shell.route());
    if (v && v.page === page) return;
    const now = performance.now();
    const ask = asked && asked.page === page && now - asked.at <= ASK_WINDOW_MS ? asked.at : inputAt(now);
    asked = null;
    begin(v ? v.page : null, ask);
  });
  shell.hearSurfaces(check);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") speed.lose();
  });

  const host: SpeedHost = {
    fieldData,
    landing,
    pageAt(t) {
      let at: (typeof pages)[number] | undefined;
      for (const p of pages) if (p.at <= t) at = p;
      return at ? { page: at.page, from: at.from } : { page: landing, from: null };
    },
  };
  installed = { speed, inputAt, frameDrawn, host };
  return host;
}
