/**
 * The frame's half of the rows a phone last showed (contracts shell/first-rows.ts, which draws them from the document): the copy
 * of the screen kept as a person leaves it, and the picture let go in the very draw that puts the page's own rows on the screen.
 *
 * A copy is the frame's own elements as they stand, cloned and cut down to the screen: no second way of drawing a row, so a row
 * kept looks as a row looks. It holds what is on the screen and no more: nothing a list holds further down, nothing kept hidden
 * (People's other scopes, under React's Activity), no id, which the app looks its own elements up by (the place a page's act is
 * drawn into), and no sidebar, which a phone's drawer draws again. Its test ids stay: the stylesheets draw by them (Today's setup
 * card, dashboard-a-v2.css), and no suite sees a copy but its own spec. It is only made of a page at rest: at its top, on its own
 * bare address, with nothing typed, picked or opened over it. A screen left any other way keeps why in the copy's place, so the
 * next load can say what it missed for (contracts FirstRowsUnkept).
 */
import { useEffect } from "react";
import {
  dropFirstRows,
  FIRST_ROWS_AT_ATTR,
  FIRST_ROWS_ATTR,
  FIRST_ROWS_END_ATTR,
  FIRST_ROWS_ID,
  FIRST_ROWS_MISS_ATTR,
  FIRST_ROWS_MISSES,
  FIRST_ROWS_MOST_CHARS,
  FIRST_ROWS_PAGES,
  FIRST_ROWS_PART,
  FIRST_ROWS_SHEETS_ATTR,
  FIRST_ROWS_TEST,
  FIRST_ROWS_WIDEST_PX,
  firstRowsEndPart,
  firstRowsMissPart,
  firstRowsOfPath,
  firstRowsSlot,
  firstRowsStand,
  movedAddress,
  SECOND_MS,
  type FirstRowsEnd,
  type FirstRowsMiss,
  type FirstRowsUnkept,
  type KeptFirstRows,
} from "@chanlytics/contracts";
import { deviceSealed } from "@/client/kept-on-device";
import { hearPartReady, speedHost } from "@/client/page-speed";
import { isHtmlElement } from "../dom-reads";

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
/**
 * A screen that is not at rest, in its two kinds, each said as its own word where it keeps no copy. One still reading: a press
 * or a read under way. And one with something over the page or picked on it, or a reply counting down to going out, whose
 * seconds standing still would be untrue at any age (Today's row, the Inbox's). The copy from before it stays.
 */
const STILL_READING = [".route-reading", '[aria-busy="true"]'].join(",");
const SOMETHING_OPEN = [
  '[aria-modal="true"]',
  ".side-wrap.open",
  ".selected",
  "[data-dock]",
  ".ny-going",
  ".ix-sending",
].join(",");
/** How long after a page's rows are drawn its copy is made: it costs a few milliseconds, never under a first press. */
const KEPT_AFTER_MS = 2 * SECOND_MS;
/** How long after the app's code has run the picture may stand: a page that never says it is drawn must still be seen. */
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

/** The fields a person types words into, by their tag or their type: a switch or a choice holds a value of the page's. */
const WORDS_FIELDS = /^(textarea|text|search|email|tel|url|number|password)$/;

/** Whether the field that has the keys is in the frame with words in it: a person in the middle of typing. */
const keysHoldWords = (root: Element): boolean => {
  const keys = document.activeElement;
  if (!keys || !("value" in keys) || !root.contains(keys)) return false;
  const kind = keys.tagName === "TEXTAREA" ? "textarea" : "type" in keys ? String(keys.type) : "";
  return WORDS_FIELDS.test(kind) && !!keys.value;
};

/**
 * Whether the frame holds words a person typed: a list narrowed by a search's words is no first screen, nor one with words
 * still being typed. Words the page itself wrote in a box are its own first screen: AI's draft on Today's card, a reply that
 * never left kept for Try again. Counted as typed, they kept Today from ever keeping a copy wherever its card offered a draft
 * (Today, calm, 20 Nov 2026: the nightly's phone copy of Today, red from that night).
 */
const somethingTyped = (root: Element): boolean =>
  Array.from(root.querySelectorAll<HTMLInputElement>('input[type="search"]')).some((f) => !!f.value) ||
  keysHoldWords(root);

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
  if (getComputedStyle(root).animationName !== "none" && isHtmlElement(copy))
    copy.style.setProperty("animation", "none");
}

/** The screen as a copy holds it; or why it holds none, where it is not at rest or is too long to read before a first paint. */
function copyOfScreen(root: Element, rows: string): { html: string } | { why: FirstRowsUnkept } {
  if (root.querySelector(STILL_READING)) return { why: "reading" };
  if (root.querySelector(SOMETHING_OPEN)) return { why: "open" };
  if (somethingTyped(root)) return { why: "typed" };
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
  for (const n of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    n.removeAttribute("id");
    n.removeAttribute("data-hover");
  }
  const html = copy.outerHTML;
  return html.length <= FIRST_ROWS_MOST_CHARS ? { html } : { why: "long" };
}

/** How much of a slot says what it holds: a copy writes when, its width and its stylesheets first (contracts KeptFirstRows). */
const SLOT_HEAD = 160;

/**
 * Whether what stands in a slot may still be drawn by a load here: a copy kept at this width, under these stylesheets, inside
 * its page's age. Nothing, a word in a copy's place, and a copy no load here could draw, may not. A slot whose head says none
 * of it is not this code's to judge, and stands.
 */
function standsDrawable(had: string | null, sheets: string, oldestMs: number): boolean {
  if (had === null) return false;
  const head = had.slice(0, SLOT_HEAD);
  if (head.includes('"why":')) return false;
  const at = /"at":(\d+)/.exec(head)?.[1];
  const width = /"width":(\d+)/.exec(head)?.[1];
  const under = /"sheets":"([^"]*)"/.exec(head)?.[1];
  if (at === undefined || width === undefined || under === undefined) return true;
  const age = Date.now() - Number(at);
  return Number(width) === innerWidth && under === sheets && age >= 0 && age < oldestMs;
}

/**
 * No copy could be kept of the screen as it was left: why is kept in the copy's place, for the next load to say as its miss
 * (contracts firstRowsScript). A copy that may still be drawn is never given up for it; one the next load could not draw is,
 * or that load would say the old reason again (a deploy's, an age's) for a screen that was kept none for another.
 */
function keepWhy(slot: string, word: FirstRowsUnkept, sheets: string, oldestMs: number): void {
  if (standsDrawable(localStorage.getItem(slot), sheets, oldestMs)) return;
  // When first, as a copy says it: a slot's age is read from its head (client/kept-on-device.ts).
  const unkept: { at: number; why: FirstRowsUnkept } = { at: Date.now(), why: word };
  localStorage.setItem(slot, JSON.stringify(unkept));
}

/** The screen kept, where it is a page that keeps one and stands at rest. Never throws: a copy is an optimisation. */
function keepNow(): void {
  try {
    if (deviceSealed() || document.getElementById(FIRST_ROWS_ID) || !mayKeep()) return;
    const at = firstRowsOfPath(location.pathname);
    const page = at && FIRST_ROWS_PAGES[at.word];
    const sheets = document.documentElement.getAttribute(FIRST_ROWS_SHEETS_ATTR);
    if (!at || !page || !sheets || location.search || location.hash) return;
    if (innerWidth > FIRST_ROWS_WIDEST_PX) return;
    const root = document.querySelector(FRAME);
    if (!root) return;
    const slot = firstRowsSlot(at.workspace, at.word);
    const screen = scrollY > 2 ? { why: "scrolled" as const } : copyOfScreen(root, page.rows);
    if ("why" in screen) return keepWhy(slot, screen.why, sheets, page.oldestMs);
    const kept: KeptFirstRows = {
      at: Date.now(),
      width: innerWidth,
      sheets,
      vars: document.documentElement.style.cssText,
      html: screen.html,
    };
    localStorage.setItem(slot, JSON.stringify(kept));
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

/** A report of the copy, once a load by its part (contracts FIRST_ROWS_PART): a READY of the page it is of. */
function say(page: string, part: string, value: number, drawn: boolean): void {
  speedHost()?.fieldData.note({
    id: `${part}-${Math.round(performance.timeOrigin)}`,
    name: "READY",
    page,
    part,
    value,
    ...(drawn ? { warm: true } : {}),
  });
}

/** A copy that was drawn, said to the field data: when it was painted, and how it ended and after how long. None unpainted. */
function sayDrawn(word: string, how: FirstRowsEnd): void {
  const page = FIRST_ROWS_PAGES[word];
  const painted = Number(document.documentElement.getAttribute(FIRST_ROWS_AT_ATTR));
  if (!page || !(painted > 0)) return;
  say(page.page, FIRST_ROWS_PART, painted, true);
  say(page.page, firstRowsEndPart(how), Math.round(Math.max(0, performance.now() - painted)), true);
}

/** The picture gone in this draw, what became of it said, and the press made on it made on the page once that is painted. */
function letGoFirstRows(how: FirstRowsEnd): void {
  if (typeof document === "undefined" || !firstRowsStand(document)) return;
  const picture = document.getElementById(FIRST_ROWS_ID);
  if (!picture) return;
  const press = picture.getAttribute("data-press");
  const word = document.documentElement.getAttribute(FIRST_ROWS_ATTR);
  dropFirstRows(document);
  if (word) sayDrawn(word, how);
  if (press) requestAnimationFrame(() => pressAgain(press));
}

/**
 * A page's part drawn with its rows, as the measures hear it (client/page-speed.ts hearPartReady, in the draw that puts them on
 * the screen): where it is the first part of a page that keeps its first screen, the picture goes in this draw, and the screen
 * is kept again in a moment.
 */
function firstRowsDrawn(page: string, part: string): void {
  if (typeof document === "undefined") return;
  if (!Object.values(FIRST_ROWS_PAGES).some((p) => p.page === page && p.part === part)) return;
  letGoFirstRows("page");
  keepSoon();
}

/** Whether the picture standing is of the route the frame is on: another route has no rows of its to wait for. */
function firstRowsOfRoute(page: string, param: string | null): boolean {
  if (typeof document === "undefined" || !firstRowsStand(document)) return false;
  const word = document.documentElement.getAttribute(FIRST_ROWS_ATTR);
  const kept = word ? FIRST_ROWS_PAGES[word] : undefined;
  return !!kept && kept.route === page && !param;
}

/**
 * The route the frame is on, as it draws it: the rows a phone last showed wait for that route's own, and a route that is another's,
 * or that cannot be read, says so itself, on the screen.
 */
export function firstRowsMeetRoute(page: string, param: string | null, unavailable: boolean): void {
  if (unavailable) letGoFirstRows("unavailable");
  else if (!firstRowsOfRoute(page, param)) letGoFirstRows("other-route");
}

/** A screen drawn in the frame's place (a handover, the create screen): no page will come to take the picture's place. */
export function useFirstRowsLetGo(): void {
  useEffect(() => letGoFirstRows("no-frame"), []);
}

/**
 * What the document did before the app's code came, said to the field data: a copy it let go itself, or why it drew none, on a phone
 * at a page that keeps one. No stamp there is `none`: nothing kept, or a slot it could not read. Never throws: a report is no one's wait.
 */
function sayWhatTheDocumentDid(): void {
  try {
    // A hash address says its page in the hash, which the frame moves to the path only once it is drawn (`/w/acme#/inbox`).
    const moved = location.hash ? movedAddress(location) : null;
    const at = firstRowsOfPath((moved ?? location.pathname).split(/[?#]/)[0] ?? "");
    const page = at && FIRST_ROWS_PAGES[at.word];
    if (!at || !page || window.innerWidth > FIRST_ROWS_WIDEST_PX || firstRowsStand(document)) return;
    const html = document.documentElement;
    if (html.getAttribute(FIRST_ROWS_END_ATTR)) return sayDrawn(at.word, "held-20s");
    // What the document stamped is a slot's text: held to the misses there are, and anything else is nothing kept.
    const stamped = html.getAttribute(FIRST_ROWS_MISS_ATTR);
    const why: FirstRowsMiss = FIRST_ROWS_MISSES.find((miss) => miss === stamped) ?? "none";
    say(page.page, firstRowsMissPart(why), 0, false);
  } catch {
    /* a document with nothing to say: a test's stand-in */
  }
}

/**
 * The picture let go in the draw that puts its page's rows on the screen, or once the app's code has run for FRAME_HOLDS_MS,
 * whatever the page did; and the screen kept as the page is put away: a phone often closes what it has put away, with no other
 * word. At the frame's module scope, before anything is drawn, once the measures are installed to hear it (FrameApp).
 */
export function installFirstRows(win: Window = window): void {
  hearPartReady(firstRowsDrawn);
  setTimeout(() => letGoFirstRows("held-8s"), FRAME_HOLDS_MS);
  win.addEventListener("pagehide", keepNow);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "hidden") keepNow();
  });
  sayWhatTheDocumentDid();
}
