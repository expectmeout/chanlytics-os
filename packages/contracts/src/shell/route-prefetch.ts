/**
 * The reads a page opens on, started from the document's head: what each page asks for first (PREFETCH_READS), and the
 * script the document inlines to start them before anything has loaded (routePrefetchScript). Its own module, apart
 * from the chrome's words (chrome.ts): the phone app reads those through its own entry (mobile/phone-app.ts), and
 * what a page opens on reaches into the pages' own rules (Reports' periods), which the phone app has no part in.
 */
import { REPORT_PERIOD_DEFAULT, REPORT_PERIOD_IDS, REPORT_PERIOD_STORAGE } from "../reports/report-periods";
import { ROUTE_WORDS } from "./address";

/** A person's id in the address, as the route reads it (surface-registry personRouteId): a uuid, nothing else. */
const PREFETCH_UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
/** Where the head parks what it started, for the client to take (client/api.ts `prefetched`). */
export const PREFETCH_SLOT = "__prefetched";
/**
 * What each page opens on, by the shell's route: its own surface's first reads, in the order it asks for them, and on
 * Today the band its first draw waits for (surface-registry ROUTE_WAITS: Setup's). Each is spelled as the client spells
 * it (client/api.ts urlFor: the path, the read's own query in its order, then the workspace), so the client's read
 * takes what the head started. Every page is here (route-prefetch.test.mjs holds the list to the pages there are, so a
 * new page says what it opens on, or the test says why it cannot). Three used to open on who is looking alone, and
 * their reads left only once the shell had mounted (9 Oct 2026, on production: the Inbox had its rows 350 ms into a load, the
 * Calendar its weeks at 900 and Reports its numbers at 1,160): the Calendar's weeks are the business's, which the route
 * now works out (`around`), so the read names no day of the browser's; Reports' period is the one this device last
 * picked, which the head reads where the page does (REPORT_PERIOD_STORAGE); Leads opens on the list everyone starts
 * from, and an address that names a view of its own still waits for the page. Held to the surfaces' own reads by
 * route-prefetch.test.mjs, which runs each one.
 */
export const PREFETCH_READS: Readonly<Record<string, readonly string[]>> = {
  // Today's strip (the next visit, the next opening) is drawn from the calendar's weeks, the read the Calendar opens on.
  today: [
    "metrics?days=1",
    "conversations",
    "escalations?state=open",
    "calls",
    "lead-searches",
    "setup",
    "views",
    "calendar?around=today",
  ],
  inbox: ["conversations", "escalations?state=open", "templates"],
  // A row's standing reads the thread's open escalation, as the Inbox's does (conversations-surface.ts).
  conversations: ["conversations", "calls", "escalations?state=open"],
  // People's list, its lists and the Pipeline are one page over one surface (a person's page reads the person instead).
  clients: ["contacts", "segments", "views"],
  segments: ["contacts", "segments", "views"],
  // Leads is a scope of People with a surface of its own: its searches, and the first page of everyone in its order.
  leads: ["lead-searches", "leads?list=all&sort=fit&dir=asc&limit=500"],
  // The weeks around the business's today, by the route's clock (GET calendar `around`).
  calendar: ["calendar?around=today"],
  // The report, the offers' and the reach-outs' over one period: REPORT_PERIOD_DEFAULT here, the device's own in the head.
  reports: ["reports?period=30d", "reports/campaigns?period=30d", "reports/reach-outs?period=30d"],
  live: ["calls", "channels"],
  // The Campaigns home reads what the offers earned over its 30 days (broadcasts/surface.ts HOME_REPORT_PERIOD).
  broadcasts: [
    "broadcasts",
    "contacts",
    "segments",
    "templates",
    "channels",
    "settings",
    "reports/campaigns?period=30d",
  ],
  outbound: ["playbooks", "templates", "channels", "settings"],
  // Campaigns' home is the playbooks' moments first (surface-registry ROUTE_SURFACE), and beside them who can hear you,
  // what is coming and what came back, which it draws from the broadcasts (ROUTE_DRAWS): both surfaces' first reads. It
  // had no entry under its own word, so its reads left after the mount while the old Playbooks address's left from the head.
  campaigns: [
    "playbooks",
    "templates",
    "channels",
    "settings",
    "broadcasts",
    "contacts",
    "segments",
    "reports/campaigns?period=30d",
  ],
  // Templates and every pane of Settings are drawn from the settings surface.
  messages: ["settings", "team", "policies", "channels", "templates?all=1"],
  admin: ["settings", "team", "policies", "channels", "templates?all=1"],
  start: ["setup", "views"],
};
/** The shell's route for the word an address opens with: the product's word (ROUTE_WORDS) or the route's own. */
const PREFETCH_ROUTE_OF_WORD: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ROUTE_WORDS).map(([route, word]) => [word, route]),
);
/**
 * How long a read the head started may wait for its headers, as long as the client's own read would (client/api.ts
 * READ_TIMEOUT_MS): a hung one used to hold the page for ever, since the client waits on it in place of its own; timed
 * out, the client asks again itself. The bound ends when the headers arrive, so a body the client reads later is never
 * cut off by it.
 */
const PREFETCH_TIMEOUT_MS = 15_000;

/**
 * The route's own reads, started from the document head.
 *
 * Nothing was fetched until the shell had mounted: the HTML, the framework's chunks, hydration, the legacy chunk,
 * the mount, and only then the first request -- 2,033 ms into a cold load of a person's page, on a document whose
 * first byte came at 26 ms (measured on production, 25 Sep 2026). This script runs as the head arrives and starts
 * the read every workspace page opens on -- who is looking (GET workspaces) -- and the page's own: on a person's page
 * the person, on any other page what it opens on (PREFETCH_READS), which waited for the mount: on a production build
 * at a phone's pace (2 Oct 2026), Today's metrics left at 602 ms and came back at 1,504, behind fourteen other reads,
 * and People's rows left at 538 on a document whose first byte came at 16. They are spelled exactly as the client
 * spells them, and the promises are parked on the window for the client to take once, in place of its own fetch. The
 * route is the path's, else the hash's: an address the frame has not moved yet (address.ts) opens the same page, and
 * an address naming no route is Today's. Off a workspace page nothing is read. A refusal here is the client's to hear,
 * as it would have been, and a read whose headers do not come in PREFETCH_TIMEOUT_MS gives way to the client's own.
 */
export function routePrefetchScript(): string {
  return [
    "try{",
    'var p=/^\\/w\\/([^\\/?#]+)(?:\\/([^?#]*))?/.exec(location.pathname||"");',
    "if(p){",
    "var w=encodeURIComponent(decodeURIComponent(p[1]));",
    'var u=["/api/v1/workspaces?workspace="+w];',
    'var r=p[2]||((location.hash||"").indexOf("#/")===0?location.hash.slice(2):"");',
    'var h=r.split("/"),l=h[1]||"";',
    `var s=${JSON.stringify(PREFETCH_ROUTE_OF_WORD)}[h[0]]||h[0]||"today",t=${JSON.stringify(PREFETCH_READS)};`,
    // Leads is People's scope with a surface of its own: the scope alone opens on its own list.
    'if(s==="clients"&&l==="leads")s="leads";',
    // A day the Calendar's address names is read by the weeks around that day, which the page works out: no read here.
    'if(s==="calendar"&&l)s="";',
    // Reports is read over the period this device last picked, as the page reads it; one it does not know is the default's.
    `var P=null;if(s==="reports")try{var o=localStorage.getItem(${JSON.stringify(REPORT_PERIOD_STORAGE)});` +
      `if(${JSON.stringify(REPORT_PERIOD_IDS)}.indexOf(o)>=0)P=o}catch(e){}`,
    `if(s==="clients"&&new RegExp(${JSON.stringify(PREFETCH_UUID)},"i").test(l))u.push("/api/v1/contacts/"+l+"?workspace="+w);`,
    // A view of Leads the address names (a search, a list) is the page's to read: it opens on who is looking alone.
    'else if(!(s==="clients"&&/^leads(:|$)/.test(l))&&Object.prototype.hasOwnProperty.call(t,s))',
    `for(var j=0;j<t[s].length;j++){var x=P?t[s][j].replace(${JSON.stringify(`period=${REPORT_PERIOD_DEFAULT}`)},"period="+P):t[s][j];` +
      'u.push("/api/v1/"+x+(x.indexOf("?")<0?"?":"&")+"workspace="+w)}',
    `var f=window[${JSON.stringify(PREFETCH_SLOT)}]=window[${JSON.stringify(PREFETCH_SLOT)}]||{};`,
    "var M=window.AbortController;",
    "var g=function(x){",
    `var a=M?new M():null,k=a?setTimeout(function(){a.abort()},${PREFETCH_TIMEOUT_MS}):0;`,
    'var q=fetch(x,{credentials:"same-origin",signal:a?a.signal:undefined});',
    "return a?q.then(function(r){clearTimeout(k);return r},function(e){clearTimeout(k);throw e}):q};",
    "for(var i=0;i<u.length;i++)if(!f[u[i]])f[u[i]]=g(u[i]);",
    "}}catch(e){}",
  ].join("");
}
