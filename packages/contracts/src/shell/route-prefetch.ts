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
  // The reply box's approved templates are the settings read's, the one read of the templates (surfaces/offered-templates.ts).
  // And Sent's runs, whose waiting ones are rows of Needs you (surface-registry ROUTE_DRAWS): their own read, nothing of People.
  inbox: ["conversations", "escalations?state=open", "broadcasts"],
  // A row's standing reads the thread's open escalation, as the Inbox's does (conversations-surface.ts).
  conversations: ["conversations", "calls", "escalations?state=open"],
  // People's list, its lists and the Pipeline are one page over one surface (a person's page reads the person instead).
  clients: ["contacts", "segments", "views"],
  // Get their yes over People's list (`clients/get-yes`, the Campaigns wiring review's lane 7): People's reads, and Sent's,
  // which holds the number and the opt-in its code carries.
  "clients/get-yes": ["contacts", "segments", "views", "broadcasts"],
  segments: ["contacts", "segments", "views"],
  // Leads is a scope of People with a surface of its own: its searches, and the first page of everyone in its order.
  leads: ["lead-searches", "leads?list=all&sort=fit&dir=asc&limit=500"],
  // The weeks around the business's today, by the route's clock (GET calendar `around`), and the campaigns over the same
  // weeks (GET calendar/runs, the board's marks: Show includes campaigns until the member turns them off).
  calendar: ["calendar?around=today", "calendar/runs?around=today"],
  // The report over one period: REPORT_PERIOD_DEFAULT here, the device's own in the head. The Campaigns lens's three reads are its
  // own surface's (reports_campaigns), made where the lens is drawn and not by the head.
  reports: ["reports?period=30d"],
  live: ["calls", "channels"],
  // Sent's sheets: the runs, and the channels read the composers are made of (surfaces/channels/surface.ts), beside Sequences'
  // list (decision 0060, D3), its own read. Who an audience reaches (Send it again's list) is every page of People, read
  // once these are in, never by the head: a run's sheet opened from the Inbox draws without it. The messages a composer offers,
  // the business's name and its links are the settings read's, which the boot's second pass reads.
  broadcasts: ["broadcasts", "channels", "sequences"],
  outbound: ["playbooks", "channels"],
  // Campaigns is Sequences' list (surface-registry ROUTE_SURFACE), where its own address, a group's and a campaign's land,
  // and it opens on what Sequences opens on: the sheets it opens over the list read theirs at their own addresses (below).
  // It opened on all of theirs too, the old pages' surfaces a landing may never draw (the Sequences phone review, 16 Oct 2026).
  campaigns: ["sequences", "settings", "team", "policies", "templates?all=1"],
  // Campaigns › Sequences (decision 0060), its list and a record open beside it: the sequences' own read, and the settings
  // read, which holds the messages a step may send and the business's name its preview is filled with (ROUTE_DRAWS).
  "campaigns/sequences": ["sequences", "settings", "team", "policies", "templates?all=1"],
  // A run at its home under its sequence (the Campaigns wiring review's lane 2): what Sequences opens on, and Sent's runs
  // and the channels read its screen is made of; the run's own read is the screen's, which paints a run the tab has read at
  // once.
  "campaigns/sequences/runs": [
    "sequences",
    "broadcasts",
    "channels",
    "settings",
    "team",
    "policies",
    "templates?all=1",
  ],
  // The one New beside Sequences' list (`campaigns/sequences/new…`, ROUTE_DRAWS; decision 0065, one New for every
  // sequence): what Sequences opens on, and Campaigns' read of the moments, the lists and who each reaches (playbooks, with
  // the channels read the counts are by), whose messages are the settings read's. The searches whose leads are ready are
  // read as New opens. Each surface's first reads.
  "campaigns/sequences/new": ["sequences", "playbooks", "channels", "settings", "team", "policies", "templates?all=1"],
  // Templates and every pane of Settings are drawn from the settings surface; the Library's number notice from the channels read,
  // which Connections draws too and asks for as its pane comes on screen.
  messages: ["settings", "team", "policies", "channels", "templates?all=1"],
  // Messages as the view of Campaigns it is (MESSAGES_ROUTE, 19 Oct 2026): the same reads, at the address it opens at now,
  // and a message open in it (`campaigns/messages/<name>`, its home) is drawn from them.
  "campaigns/messages": ["settings", "team", "policies", "channels", "templates?all=1"],
  admin: ["settings", "team", "policies", "templates?all=1"],
  start: ["setup", "views"],
};
/**
 * What a page draws on its first screen beside its own, from other pages' surfaces (surface-registry ROUTE_DRAWS), for a
 * page that opens through one read (GET open, decision 0053 step 2): its reads that PREFETCH_READS does not already name.
 * They used to leave only once the shell had mounted, as the boot's first pass read them (measured 12 Oct 2026 on a
 * production build: Today's ten drawn surfaces asked from 630 ms, its own reads having come back by 460), and the parts
 * of the page drawn from them, the period line and what is worth a look, were the last to come (production: 2.7 to 4.1 s
 * on a cold load). Read on the server once the page's own are in, as the boot's two passes read them, so they never
 * crowd the page's own. Held to the surfaces' own reads by route-prefetch.test.mjs, which runs each one.
 */
export const PREFETCH_BESIDE: Readonly<Record<string, readonly string[]>> = {
  // Sent's runs, People's book and its lists (Worth a look's people, the day card's flags), the playbooks' moments, the bell
  // (notifications), the reach-outs' replies, Google's reviews, the channels read Live's strip and the runs are made of, and
  // the period line: Reports' headline over the period
  // this device last picked, as Reports reads it. Not the settings read: nothing on Today draws it, and the composers that
  // asked for it here follow it now (surfaces/offered-templates.ts), so it comes in the boot's second pass.
  today: [
    "broadcasts",
    "contacts",
    "segments",
    "channels",
    `reports/headline?period=${REPORT_PERIOD_DEFAULT}`,
    "playbooks",
    "notifications",
    "google",
    "reach-out-replies",
    // Ask's ideas in Need you: the member's morning as it stands (decision 0070). Only read here; the page asks for one to be written.
    "ask/morning",
  ],
};

/**
 * The pages whose first reads leave as one streamed read (GET open), rather than one request each: GET open's `route`.
 * The pages PREFETCH_BESIDE names (route-prefetch.test.mjs holds the two to one list).
 */
export const PREFETCH_OPEN = ["today"] as const;

/** The period a read is spelled over by default, as the client spells it: replaced by the one the device last picked. */
const DEFAULT_PERIOD = `period=${REPORT_PERIOD_DEFAULT}`;

/**
 * What GET open answers for a page, in its two tiers, each a read as the client spells it before its workspace: who is
 * looking and the page's own first, then what it draws beside them. `period` is the one this device last picked, which
 * the head read where the page reads it (REPORT_PERIOD_STORAGE); the default's otherwise. The head parks one answer for
 * each, under the same key (routePrefetchScript).
 */
export function openReads(route: string, period?: string | null): readonly [readonly string[], readonly string[]] {
  const at = (x: string) => (period ? x.replace(DEFAULT_PERIOD, `period=${period}`) : x);
  return [["workspaces", ...(PREFETCH_READS[route] ?? []).map(at)], (PREFETCH_BESIDE[route] ?? []).map(at)];
}

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
    `var s=${JSON.stringify(PREFETCH_ROUTE_OF_WORD)}[h[0]]||h[0]||"today",t=${JSON.stringify(PREFETCH_READS)},` +
      `B=${JSON.stringify(PREFETCH_BESIDE)},O=Object.prototype.hasOwnProperty;`,
    // Leads is People's scope with a surface of its own: the scope alone opens on its own list.
    'if(s==="clients"&&l==="leads")s="leads";',
    // Get their yes is a sheet over People's list, which opens on Sent's read too.
    'if(s==="clients"&&l==="get-yes")s="clients/get-yes";',
    // Sequences is Campaigns' view with a surface of its own: its list and a record open on its read, a run at its home and
    // the one New on what their screens are made of too; a day of History's older address is its run, where it lands
    // (retiredRouteOf). A message is a sheet over its list that opens on its own (`message:<name>`).
    'if(s==="campaigns"&&l==="sequences")s=(h[3]==="runs"||h[3]==="history")&&h[4]?"campaigns/sequences/runs":/^new(:|$)/.test(h[2]||"")?"campaigns/sequences/new":"campaigns/sequences";',
    // The composer's old address (`campaigns/new…`) lands on the one New, and opens on what New opens on (lane 6).
    'if(s==="campaigns"&&/^new(:|$)/.test(l))s="campaigns/sequences/new";',
    // Messages is a view of Campaigns beside Sequences (`campaigns/messages`), a message open in it among its addresses,
    // and opens on its own reads; a message's drawer over Sequences (`message:<name>`) went into it, and lands there.
    'if(s==="campaigns"&&/^messages?(\\/|:|$)/.test(l))s="campaigns/messages";',
    // A day the Calendar's address names is read by the weeks around that day, which the page works out: no read here. A
    // view's word or a visit with no day (`calendar/month`, `calendar/a-<id>`) opens on the weeks around today, as the
    // route alone does (contracts calendarParamParts).
    'if(s==="calendar"&&/\\d{4}-\\d{2}-\\d{2}/.test(l))s="";',
    // Reports is read over the days its address says, where it says them (`reports/people:2026-09-01~2026-09-20`,
    // lenses.ts lensRoute: a link someone sent), else over the period this device last picked, as the page reads it; one
    // it does not know is the default's. The days are spelled as the page's own read spells them, first then last.
    // A page that opens through one read and draws the period line reads the same stored period (PREFETCH_BESIDE).
    `var P=null,d=s==="reports"&&/(?:^|:)(\\d{4}-\\d{2}-\\d{2})~(\\d{4}-\\d{2}-\\d{2})$/.exec(l);` +
      `if(d)P="from="+d[1]+"&to="+d[2];else if(s==="reports"||O.call(B,s))try{` +
      `var o=localStorage.getItem(${JSON.stringify(REPORT_PERIOD_STORAGE)});` +
      `if(${JSON.stringify(REPORT_PERIOD_IDS)}.indexOf(o)>=0)P="period="+o}catch(e){}`,
    `if(s==="clients"&&new RegExp(${JSON.stringify(PREFETCH_UUID)},"i").test(l))u.push("/api/v1/contacts/"+l+"?workspace="+w);`,
    // A view of Leads the address names (a search, a list) is the page's to read: it opens on who is looking alone.
    'else if(!(s==="clients"&&/^leads(:|$)/.test(l))&&Object.prototype.hasOwnProperty.call(t,s))',
    `for(var j=0;j<t[s].length;j++){var x=P?t[s][j].replace(${JSON.stringify(`period=${REPORT_PERIOD_DEFAULT}`)},P):t[s][j];` +
      'u.push("/api/v1/"+x+(x.indexOf("?")<0?"?":"&")+"workspace="+w)}',
    // A sequence's record the address opens (`campaigns/sequences/<id>`, a tab after it) is read beside the list it opens over,
    // as a person's page reads the person, and so is the tab's own read where it has one (People, History): it waited for the
    // page's code and its mount (the load review of 18 Oct 2026). New (`campaigns/sequences/new`) names no id and reads none.
    `if(s==="campaigns/sequences"&&new RegExp(${JSON.stringify(PREFETCH_UUID)},"i").test(h[2]||"")){` +
      'var q="/api/v1/sequences/"+h[2];u.push(q+"?workspace="+w);' +
      'if(h[3]==="people"||h[3]==="history")u.push(q+"/"+h[3]+"?workspace="+w)}',
    `var f=window[${JSON.stringify(PREFETCH_SLOT)}]=window[${JSON.stringify(PREFETCH_SLOT)}]||{};`,
    "var M=window.AbortController;",
    "var g=function(x){",
    `var a=M?new M():null,k=a?setTimeout(function(){a.abort()},${PREFETCH_TIMEOUT_MS}):0;`,
    'var q=fetch(x,{credentials:"same-origin",signal:a?a.signal:undefined});',
    "return a?q.then(function(r){clearTimeout(k);return r},function(e){clearTimeout(k);throw e}):q};",
    // One read for a page in PREFETCH_BESIDE, where the browser can read its stream: an answer parked for each read, who is
    // looking and the page's own, then what it draws beside them, each resolved as its line arrives, with the JSON its
    // own route answers. One it did not carry (a refusal of the whole, a stream cut short) is the page's to ask for itself,
    // as a prefetch that failed always was. Elsewhere, and in a browser that cannot read a stream, one request each.
    'var Y=typeof Response!=="undefined"&&typeof TextDecoder!=="undefined"&&O.call(B,s)&&!f[u[0]];',
    'if(Y){var k=["workspaces"],R={},Z=function(x){return P?x.replace(' + JSON.stringify(DEFAULT_PERIOD) + ",P):x};",
    "for(var j=0;j<t[s].length;j++)k.push(Z(t[s][j]));",
    'for(var j=0;j<B[s].length;j++){var x=Z(B[s][j]);k.push(x);u.push("/api/v1/"+x+(x.indexOf("?")<0?"?":"&")+"workspace="+w)}',
    // Each parked answer is handled where it is made: one the page never takes, refused with the whole, is nobody's
    // unhandled rejection, and the page's own read that takes one still hears the refusal.
    "for(var i=0;i<u.length;i++)(function(x,y){var q=new Promise(function(a,b){R[y]=[a,b]});q.catch(function(){});f[x]=q})(u[i],k[i]);",
    'var E=function(){for(var y in R)if(R[y]){R[y][1](new Error("open"));R[y]=0}};',
    'var L=function(z){if(!z)return;var m=JSON.parse(z),c=R[m.k];if(!c)return;R[m.k]=0;var H={"content-type":"application/json"};' +
      "for(var e in m.h||{})H[e]=m.h[e];c[0](new Response(JSON.stringify(m.b),{status:m.s,headers:H}))};",
    'g("/api/v1/open?route="+s+(P?"&"+P:"")+"&workspace="+w).then(function(r){if(!r.ok)throw 0;' +
      'if(!r.body||!r.body.getReader)return r.text().then(function(T){T.split("\\n").forEach(L)});' +
      'var D=r.body.getReader(),C=new TextDecoder(),Q="";' +
      "var N=function(){return D.read().then(function(c){if(c.done){L(Q);return}Q+=C.decode(c.value,{stream:true});" +
      'var n;while((n=Q.indexOf("\\n"))>=0){L(Q.slice(0,n));Q=Q.slice(n+1)}return N()})};return N()}).then(E,E)}',
    "else for(var i=0;i<u.length;i++)if(!f[u[i]])f[u[i]]=g(u[i]);",
    "}}catch(e){}",
  ].join("");
}
