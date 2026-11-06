/**
 * The rows a phone last showed, drawn before the app's code has run (the load speed review of 6 Nov 2026). A phone opening the
 * Inbox or People had the page's reads back at about 0.8 s and the app's code running only at 1.5 to 2.1 s, at a phone's pace,
 * with the rows already on the device or not: the outline stood all that while. So the frame keeps a copy of the screen as a
 * person leaves it, a page's chrome and the rows on it (surfaces/frame/first-rows.ts), and the document draws that copy with
 * its first paint, before any of the app's code (`firstRowsScript`). The page takes its place in one frame when its own rows
 * are drawn. It is a picture and nothing else: inert, and a press made on it is kept and made again on the page.
 *
 * Kept as the surface cache's rows are (surface-cache.ts): one slot per workspace and page on this device, cleared with them at
 * every sign-in, sign-out and switch, and never drawn once a day old; the proxy sends a visitor with no session to sign in
 * before the document's script can run. A copy says what it was kept under and is drawn only under the same: this phone's
 * width, and the very stylesheets it was drawn with, so what was kept stands where it stood whatever a deploy changed in the
 * code. A copy older than a few minutes draws no times, since "2h" may be 22 by now: they are left as their room until the page
 * says them. Only a browser a person drives: a suite's reloads would find two of everything (FIRST_ROWS_TEST lets its own spec
 * in).
 */
import { DAY_MS, MIN_MS, SECOND_MS } from "../shared/time";

/** The picture's element, and its class (surfaces/frame/outline.css). */
export const FIRST_ROWS_ID = "first-rows";
/** On `<html>` while the picture stands: the address's word for its page. */
export const FIRST_ROWS_ATTR = "data-first-rows";
/** On `<html>`, always: the stylesheets this document was drawn with, in a word. */
export const FIRST_ROWS_SHEETS_ATTR = "data-sheets";
/** On a part of the screen a copy says a time or a day in: not drawn once the copy has aged (outline.css). */
export const FIRST_ROWS_WHEN_ATTR = "data-when";
/** Where each page's copy is kept: this, then the workspace and the page, as the address writes them. */
export const FIRST_ROWS_SLOT = "chanlytics.rows.v1:";
/** In a tab's storage, what lets a browser driven by a suite keep and draw copies: its own spec's word alone. */
export const FIRST_ROWS_TEST = "chanlytics.rows.test";
/** The widest screen a copy is kept for: a phone's, as the pages' own phone layout starts (mobile.css). */
export const FIRST_ROWS_WIDEST_PX = 720;
/** The longest copy kept, in characters: a screen of rows is 20 to 40 KB, and it is read before the first paint. */
export const FIRST_ROWS_MOST_CHARS = 64_000;
/** The oldest copy drawn, as the surface cache's oldest snapshot. */
export const FIRST_ROWS_OLDEST_MS = DAY_MS;
/** How old a copy may be and still draw its times. */
const AGED_MS = 5 * MIN_MS;
/** How long the document holds the picture with no frame to take it away: past this, the app's code did not come. */
const HELD_MS = 20 * SECOND_MS;

/**
 * The pages that keep their first screen, by the address's word for each: the shell's route; the page and the part whose
 * draw takes the picture's place (the page's measures' names, contracts PRIMARY_PART: its first part where that is the whole
 * screen, Today's last where its first would leave the rest of the picture's page yet to come); what the screen's blocks are in
 * the document, those below the screen being no part of a copy; and how old a copy of it may be drawn. Today says the day's
 * hours and who has waited how long in its sentences, with no element of their own to leave out, so a copy of it is an hour's.
 */
export const FIRST_ROWS_PAGES: Readonly<
  Record<string, { route: string; page: string; part: string; rows: string; oldestMs: number }>
> = {
  inbox: { route: "inbox", page: "inbox", part: "list", rows: ".ix-thread", oldestMs: FIRST_ROWS_OLDEST_MS },
  people: { route: "clients", page: "people", part: "table", rows: ".pl-card-row", oldestMs: FIRST_ROWS_OLDEST_MS },
  today: {
    route: "today",
    page: "today",
    part: "look",
    rows: ".dash-a-v2-phone > *, .dash-a-v2-phone section",
    oldestMs: 60 * MIN_MS,
  },
};

/** A workspace's address names no page where it opens on Today, which is that page's bare address too. */
const BARE_WORD = "today";
const ADDRESS = `^\\/w\\/([^\\/?#]+)(?:\\/(${Object.keys(FIRST_ROWS_PAGES).join("|")}))?\\/?$`;

/** The workspace and the page's word where a path is a page's own bare address, the only one a copy is of; else null. */
export function firstRowsOfPath(pathname: string): { workspace: string; word: string } | null {
  const m = new RegExp(ADDRESS).exec(pathname);
  return m ? { workspace: m[1] ?? "", word: m[2] ?? BARE_WORD } : null;
}

/** Where a page's copy is kept. */
export const firstRowsSlot = (workspace: string, word: string): string => `${FIRST_ROWS_SLOT}${workspace}:${word}`;

/** What a slot holds. `at` is written first, so a slot's age is read from its head (surface-cache.ts dropExpiredSlots). */
export interface KeptFirstRows {
  at: number;
  width: number;
  /** The document's FIRST_ROWS_SHEETS_ATTR when it was kept. */
  sheets: string;
  /** The custom properties the root held, which the frame measures (`--frame-top`), laid on the picture alone. */
  vars: string;
  html: string;
}

/** Where this browser keeps the workspace it last used (legacy-bridge/workspace.ts), which the home sends a tab on to. */
export const LAST_WORKSPACE_STORAGE = "chanlytics.workspace";

/**
 * The home sends a tab on to the workspace this browser last used before anything of the app has run. A phone's installed app
 * opens at the home (app/manifest.ts `start_url`), and this waited for the frame's whole code to come and run, only to leave it
 * as a new document that loaded it again: Today drawn at 3.8 s from the home against 2.4 s from its own address, at a phone's
 * pace (production, 6 Nov 2026), which no page's measure counts, since each starts with its own document. A browser that remembers none (a first
 * sign-in, a cleared browser), and an address with anything after it, are still the home's to work out (LegacyHost).
 * first-rows.test.mjs holds it to `homeHref`'s own answer.
 */
export function homeBootScript(): string {
  return [
    'try{if(location.pathname==="/"&&!location.search&&!location.hash){',
    `var l=localStorage.getItem(${JSON.stringify(LAST_WORKSPACE_STORAGE)});`,
    'if(l)location.replace("/w/"+encodeURIComponent(l))}}catch(e){}',
  ].join("");
}

/** Whether the picture stands over the page. A document a test draws a page in, with no root to ask, holds none. */
export const firstRowsStand = (doc: Document): boolean => !!doc.documentElement?.hasAttribute?.(FIRST_ROWS_ATTR);

/** The picture gone, and the document let go: by the frame's code, or by a boundary that must import as little as it can. */
export function dropFirstRows(doc: Document): void {
  if (!firstRowsStand(doc)) return;
  doc.getElementById(FIRST_ROWS_ID)?.remove();
  doc.documentElement.removeAttribute(FIRST_ROWS_ATTR);
}

/**
 * The document's script, last in its body and after everything the frame's outline is: a plain inline script, as the head's
 * are, so the stylesheets are in by the time it runs, nothing has been painted, and the copy is in the first paint
 * (app/layout.tsx). Says in a word which stylesheets this document has, and draws the copy kept for
 * its address where it may be drawn. Over the picture a press is the picture's, on its way to the page: a finger on a row lights
 * it, and what a press was on is said on the element, for the frame to make it again once the page is there. Any other
 * press, and a drag, does nothing yet. A throw of any kind leaves the outline as it stood, as a first visit's.
 */
export function firstRowsScript(): string {
  return [
    "(function(){try{",
    'var D=document,H=D.documentElement,L=D.querySelectorAll(\'link[rel="stylesheet"]\'),s="",i=0,n=0;',
    'for(;i<L.length;i++)s+=L[i].getAttribute("href")+"|";',
    "for(i=0;i<s.length;i++)n=(n*31+s.charCodeAt(i))|0;",
    `H.setAttribute(${JSON.stringify(FIRST_ROWS_SHEETS_ATTR)},String(n));`,
    `var m=new RegExp(${JSON.stringify(ADDRESS)}).exec(location.pathname);`,
    `if(!m||location.search||location.hash||innerWidth>${FIRST_ROWS_WIDEST_PX})return;`,
    `if(navigator.webdriver&&!sessionStorage.getItem(${JSON.stringify(FIRST_ROWS_TEST)}))return;`,
    `var P=m[2]||${JSON.stringify(BARE_WORD)},O=${JSON.stringify(Object.fromEntries(Object.entries(FIRST_ROWS_PAGES).map(([w, p]) => [w, p.oldestMs])))};`,
    `var r=localStorage.getItem(${JSON.stringify(FIRST_ROWS_SLOT)}+m[1]+":"+P);if(!r)return;`,
    "var k=JSON.parse(r),g=Date.now()-k.at;",
    "if(k.width!==innerWidth||k.sheets!==String(n)||!(g>=0&&g<O[P]))return;",
    `var d=D.createElement("div");d.id=d.className=${JSON.stringify(FIRST_ROWS_ID)};`,
    'd.setAttribute("inert","");d.setAttribute("aria-hidden","true");d.setAttribute("style",k.vars);',
    `if(g>=${AGED_MS})d.setAttribute("data-aged","");`,
    "d.innerHTML=k.html;D.body.appendChild(d);",
    // What the frame stamps as it mounts, and the page's rules read: the same now, under the picture.
    `H.setAttribute(${JSON.stringify(FIRST_ROWS_ATTR)},P);H.classList.add("legacy-on");H.setAttribute("data-page-top","");`,
    'requestAnimationFrame(function(){d.setAttribute("data-at",String(Math.round(performance.now())))});',
    "var W=function(x,y,l){for(var j=0;j<l.length;j++){var b=l[j].getBoundingClientRect();" +
      "if(x>=b.left&&x<b.right&&y>=b.top&&y<b.bottom)return j}return -1};",
    "var F=function(e){",
    `var o=D.getElementById(${JSON.stringify(FIRST_ROWS_ID)});`,
    'if(!o){removeEventListener("pointerdown",F,true);removeEventListener("click",F,true);return}',
    "e.stopPropagation();e.preventDefault();",
    'var T=o.querySelectorAll(".phone-places .tab-bar-tab"),R=o.querySelectorAll("[data-thread-id],[data-row-id]"),' +
      'c=W(e.clientX,e.clientY,T),w="",h=null;',
    'if(c>=0)w="tab:"+c;else{c=W(e.clientX,e.clientY,R);if(c>=0){h=R[c];var t=h.getAttribute("data-thread-id");' +
      'w=t?"thread:"+t:"row:"+h.getAttribute("data-row-id")}}',
    'if(e.type==="click"){if(w)o.setAttribute("data-press",w);return}',
    'for(var j=0;j<R.length;j++)R[j].removeAttribute("data-hover");if(h)h.setAttribute("data-hover","")};',
    'addEventListener("pointerdown",F,true);addEventListener("click",F,true);',
    "setTimeout(function(){var o=D.getElementById(" +
      JSON.stringify(FIRST_ROWS_ID) +
      ");if(o){o.remove();H.removeAttribute(" +
      JSON.stringify(FIRST_ROWS_ATTR) +
      `)}},${HELD_MS});`,
    "}catch(e){}})();",
  ].join("");
}
