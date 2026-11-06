/**
 * The frame's half of the rows a phone last showed (contracts shell/first-rows.ts, which draws them from the document): the copy
 * of the screen kept as a person leaves it, and the picture let go in the very draw that puts the page's own rows on the screen.
 *
 * A copy is the frame's own elements as they stand, cloned and cut down to the screen: no second way of drawing a row, so a row
 * kept looks as a row looks. It holds what is on the screen and no more: nothing a list holds further down, nothing kept hidden
 * (People's other scopes, under React's Activity), nothing with an id or a test id, and no sidebar, which a phone's drawer draws
 * again. It is only made of a page at rest: at its top, on its own bare address, with nothing typed, picked or opened over it.
 */
import { useEffect } from "react";
import {
  dropFirstRows,
  FIRST_ROWS_ATTR,
  FIRST_ROWS_ID,
  FIRST_ROWS_MOST_CHARS,
  FIRST_ROWS_PAGES,
  FIRST_ROWS_SHEETS_ATTR,
  FIRST_ROWS_TEST,
  FIRST_ROWS_WHEN_ATTR,
  FIRST_ROWS_WIDEST_PX,
  firstRowsOfPath,
  firstRowsSlot,
  firstRowsStand,
  SECOND_MS,
  type KeptFirstRows,
} from "@chanlytics/contracts";
import { speedHost } from "@/client/page-speed";
import { surfaceCacheSealed } from "@/legacy-bridge/surface-cache";
import { isDemoFrame } from "./frame-window";

/** The frame itself, never the outline under it. */
const FRAME = ".app-root:not(.frame-outline)";
/** What a screen held that no copy holds: drawn again by the frame, or gone by the next visit. */
const LEFT_OUT = [
  ".skip-link",
  ".side-wrap",
  "[data-leaving]",
  "[data-held]",
  ".pp-toast-stack",
  "script",
  "style",
  "template",
  '[style*="display: none"]',
].join(",");
/** A screen that is not at rest: a press, a pick or a read under way, or something open over the page. */
const NOT_AT_REST = [
  ".route-reading",
  '[aria-busy="true"]',
  '[aria-modal="true"]',
  ".side-wrap.open",
  ".selected",
  "[data-dock]",
].join(",");
/** Where a screen says a time or a day, which a copy's age may have made untrue (contracts FIRST_ROWS_WHEN_ATTR). */
const SAYS_WHEN = ".ix-thread-time, .pl-card-last, .pg-dateline, .tpd-when";
/** How long after a page's rows are drawn its copy is made: it costs a few milliseconds, never under a first press. */
const KEPT_AFTER_MS = 2 * SECOND_MS;
/** How long after the frame has mounted the picture may stand: a page that never says it is drawn must still be seen. */
const FRAME_HOLDS_MS = 8 * SECOND_MS;

/** A browser a person drives, or a suite's own spec (contracts FIRST_ROWS_TEST). */
function mayKeep(): boolean {
  if (!navigator.webdriver) return true;
  try {
    return !!sessionStorage.getItem(FIRST_ROWS_TEST);
  } catch {
    return false;
  }
}

/** Whether a field in the frame holds words: a list narrowed by them is no first screen. */
const somethingTyped = (root: Element): boolean =>
  Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="checkbox"]), textarea'),
  ).some((f) => !!f.value);

/**
 * A canvas clones blank and says nothing as words: what one on the screen drew (Ask's three, on the phone's circle) is kept as a
 * picture of it in the same place, so they stand there from the first paint and do not pop in as the page takes over.
 */
function keepCanvases(root: Element, copy: Element): void {
  const blank = Array.from(copy.querySelectorAll("canvas"));
  Array.from(root.querySelectorAll("canvas")).forEach((canvas, i) => {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    try {
      const picture = document.createElement("img");
      picture.alt = "";
      picture.className = canvas.className;
      picture.src = canvas.toDataURL();
      picture.style.width = `${box.width}px`;
      picture.style.height = `${box.height}px`;
      blank[i]?.replaceWith(picture);
    } catch {
      /* one that cannot be read stays blank, as it would at the frame's own first draw */
    }
  });
}

/**
 * What an element plays as it arrives, stopped on its copy, which stands whole from its first paint. On each element and by its
 * own style: a rule for every element of a copy would be asked of every element of every page (outline.css). Before anything
 * of the copy is taken out or replaced, while the two lists still say the same elements in the same order.
 */
function stopArrivals(root: Element, copy: Element): void {
  const kept = copy.querySelectorAll<HTMLElement>("*");
  root.querySelectorAll("*").forEach((el, i) => {
    if (getComputedStyle(el).animationName !== "none") kept[i]?.style.setProperty("animation", "none");
  });
  if (getComputedStyle(root).animationName !== "none") (copy as HTMLElement).style.setProperty("animation", "none");
}

/** The screen as a copy holds it, or null where it is not at rest, or is too long to read before a first paint. */
function copyOfScreen(root: Element, rows: string): string | null {
  if (root.querySelector(NOT_AT_REST) || somethingTyped(root)) return null;
  const copy = root.cloneNode(true) as Element;
  stopArrivals(root, copy);
  keepCanvases(root, copy);
  const below = innerHeight;
  const live = Array.from(root.querySelectorAll(rows));
  const kept = Array.from(copy.querySelectorAll(rows));
  live.forEach((row, i) => {
    if (row.getBoundingClientRect().top >= below) kept[i]?.remove();
  });
  copy.querySelectorAll(LEFT_OUT).forEach((n) => n.remove());
  copy.querySelectorAll(SAYS_WHEN).forEach((n) => n.setAttribute(FIRST_ROWS_WHEN_ATTR, ""));
  for (const n of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
    n.removeAttribute("data-hover");
  }
  const html = copy.outerHTML;
  return html.length <= FIRST_ROWS_MOST_CHARS ? html : null;
}

/** The screen kept, where it is a page that keeps one and stands at rest. Never throws: a copy is an optimisation. */
function keepNow(): void {
  try {
    if (surfaceCacheSealed() || document.getElementById(FIRST_ROWS_ID) || !mayKeep()) return;
    const at = firstRowsOfPath(location.pathname);
    const page = at && FIRST_ROWS_PAGES[at.word];
    const sheets = document.documentElement.getAttribute(FIRST_ROWS_SHEETS_ATTR);
    if (!at || !page || !sheets || location.search || location.hash) return;
    if (innerWidth > FIRST_ROWS_WIDEST_PX || scrollY > 2 || isDemoFrame()) return;
    const root = document.querySelector(FRAME);
    const html = root && copyOfScreen(root, page.rows);
    if (!html) return;
    const kept: KeptFirstRows = {
      at: Date.now(),
      width: innerWidth,
      sheets,
      vars: document.documentElement.style.cssText,
      html,
    };
    localStorage.setItem(firstRowsSlot(at.workspace, at.word), JSON.stringify(kept));
  } catch {
    /* storage refused or full: the next visit stands on its outline */
  }
}

let keptSoon: ReturnType<typeof setTimeout> | null = null;

/** The screen kept in a moment, once this draw and whatever follows it have settled. Nothing is asked of a desk. */
function keepSoon(): void {
  if (!(window.innerWidth <= FIRST_ROWS_WIDEST_PX)) return;
  if (keptSoon) clearTimeout(keptSoon);
  keptSoon = setTimeout(() => {
    keptSoon = null;
    keepNow();
  }, KEPT_AFTER_MS);
}

/** The press made on the picture, made on the page (contracts firstRowsScript writes what it was on). */
function pressAgain(press: string): void {
  const [kind, ...rest] = press.split(":");
  const of = rest.join(":");
  const quoted = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(of) : of;
  const found =
    kind === "tab"
      ? document.querySelectorAll<HTMLElement>(`${FRAME} .phone-places .tab-bar-tab`)[Number(of)]
      : kind === "thread"
        ? document.querySelector<HTMLElement>(`${FRAME} [data-thread-id="${quoted}"]`)
        : document.querySelector<HTMLElement>(`${FRAME} [data-row-id="${quoted}"]`);
  found?.click();
}

/** The picture gone in this draw, its one measure said, and the press made on it made on the page once that is painted. */
export function letGoFirstRows(): void {
  if (typeof document === "undefined" || !firstRowsStand(document)) return;
  const picture = document.getElementById(FIRST_ROWS_ID);
  if (!picture) return;
  const press = picture.getAttribute("data-press");
  const painted = Number(picture.getAttribute("data-at"));
  const word = document.documentElement.getAttribute(FIRST_ROWS_ATTR);
  dropFirstRows(document);
  const page = word ? FIRST_ROWS_PAGES[word] : undefined;
  if (page && painted > 0)
    speedHost()?.fieldData.note({
      id: `first-rows-${Math.round(performance.timeOrigin)}`,
      name: "READY",
      page: page.page,
      part: "first-rows",
      value: painted,
      warm: true,
    });
  if (press) requestAnimationFrame(() => pressAgain(press));
}

/**
 * A page's part drawn with its rows (surfaces/use-surface.ts usePartShown): where it is the first part of a page that keeps its
 * first screen, the picture goes in this draw, and the screen is kept again in a moment.
 */
export function firstRowsDrawn(page: string, part: string): void {
  if (typeof document === "undefined") return;
  if (!Object.values(FIRST_ROWS_PAGES).some((p) => p.page === page && p.part === part)) return;
  letGoFirstRows();
  keepSoon();
}

/** Whether the picture standing is of the route the frame is on: another route has no rows of its to wait for. */
export function firstRowsOfRoute(page: string, param: string | null): boolean {
  if (typeof document === "undefined" || !firstRowsStand(document)) return false;
  const word = document.documentElement.getAttribute(FIRST_ROWS_ATTR);
  const kept = word ? FIRST_ROWS_PAGES[word] : undefined;
  return !!kept && kept.route === page && !param;
}

/** A screen drawn in the frame's place (a handover, the create screen): no page will come to take the picture's place. */
export function useFirstRowsLetGo(): void {
  useEffect(letGoFirstRows, []);
}

/**
 * The screen kept as the page is put away: a phone often closes what it has put away, with no other word. And the picture let
 * go once the app's code has run for FRAME_HOLDS_MS, whatever the page did.
 */
export function installFirstRows(win: Window = window): void {
  setTimeout(letGoFirstRows, FRAME_HOLDS_MS);
  win.addEventListener("pagehide", keepNow);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "hidden") keepNow();
  });
}
