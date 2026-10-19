import { REPORT_PERIOD_DEFAULT, REPORT_PERIOD_IDS, REPORT_PERIOD_STORAGE } from "../reports/report-periods.js";
import { ROUTE_WORDS } from "./address.js";
const PREFETCH_UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
export const PREFETCH_SLOT = "__prefetched";
export const PREFETCH_READS = {
  // Today's strip (the next visit, the next opening) is drawn from the calendar's weeks, the read the Calendar opens on.
  today: [
    "metrics?days=1",
    "conversations",
    "escalations?state=open",
    "calls",
    "lead-searches",
    "setup",
    "views",
    "calendar?around=today"
  ],
  // The reply box's approved templates are the settings read's, the one read of the templates (surfaces/offered-templates.ts).
  // And Sent's runs, whose waiting ones are rows of Needs you (surface-registry ROUTE_DRAWS): their own read, nothing of People.
  inbox: ["conversations", "escalations?state=open", "broadcasts"],
  // A row's standing reads the thread's open escalation, as the Inbox's does (conversations-surface.ts).
  conversations: ["conversations", "calls", "escalations?state=open"],
  // People's list, its lists and the Pipeline are one page over one surface (a person's page reads the person instead).
  clients: ["contacts", "segments", "views"],
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
  // The composer over Sequences' list (`campaigns/new…`, ROUTE_DRAWS): Send once, made of Sent's runs and who each audience
  // reaches (People's book, its lists and the runs' touches), the channels read and the settings read, which holds the messages
  // it offers; and the reach-outs' chains a change to one opens on. Write to leads reads its searches as it is chosen. Each
  // surface's first reads.
  "campaigns/new": [
    "sequences",
    "channels",
    "settings",
    "broadcasts",
    "contacts",
    "segments",
    "reach-outs",
    "team",
    "policies",
    "templates?all=1"
  ],
  // A message in its drawer over Sequences' list (`campaigns/message:<name>`): the playbooks' read the sheets wait for, the
  // settings read its pane is drawn from and the channels read's numbers.
  "campaigns/message": ["sequences", "playbooks", "channels", "settings", "team", "policies", "templates?all=1"],
  // Templates and every pane of Settings are drawn from the settings surface; the Library's number notice from the channels read,
  // which Connections draws too and asks for as its pane comes on screen.
  messages: ["settings", "team", "policies", "channels", "templates?all=1"],
  admin: ["settings", "team", "policies", "templates?all=1"],
  start: ["setup", "views"]
};
export const PREFETCH_BESIDE = {
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
    "reach-out-replies"
  ]
};
export const PREFETCH_OPEN = ["today"];
const DEFAULT_PERIOD = `period=${REPORT_PERIOD_DEFAULT}`;
export function openReads(route, period) {
  const at = (x) => period ? x.replace(DEFAULT_PERIOD, `period=${period}`) : x;
  return [["workspaces", ...(PREFETCH_READS[route] ?? []).map(at)], (PREFETCH_BESIDE[route] ?? []).map(at)];
}
const PREFETCH_ROUTE_OF_WORD = Object.fromEntries(
  Object.entries(ROUTE_WORDS).map(([route, word]) => [word, route])
);
const PREFETCH_TIMEOUT_MS = 15e3;
export function routePrefetchScript() {
  return [
    "try{",
    'var p=/^\\/w\\/([^\\/?#]+)(?:\\/([^?#]*))?/.exec(location.pathname||"");',
    "if(p){",
    "var w=encodeURIComponent(decodeURIComponent(p[1]));",
    'var u=["/api/v1/workspaces?workspace="+w];',
    'var r=p[2]||((location.hash||"").indexOf("#/")===0?location.hash.slice(2):"");',
    'var h=r.split("/"),l=h[1]||"";',
    `var s=${JSON.stringify(PREFETCH_ROUTE_OF_WORD)}[h[0]]||h[0]||"today",t=${JSON.stringify(PREFETCH_READS)},B=${JSON.stringify(PREFETCH_BESIDE)},O=Object.prototype.hasOwnProperty;`,
    // Leads is People's scope with a surface of its own: the scope alone opens on its own list.
    'if(s==="clients"&&l==="leads")s="leads";',
    // Sequences is Campaigns' view with a surface of its own: its list, a record and a new one all open on its read. The
    // composer and a message are sheets over its list that open on theirs too (`campaigns/new`, `message:<name>`).
    'if(s==="campaigns"&&l==="sequences")s="campaigns/sequences";',
    'if(s==="campaigns"&&/^(new|message)(:|$)/.test(l))s="campaigns/"+l.split(":")[0];',
    // A day the Calendar's address names is read by the weeks around that day, which the page works out: no read here. A
    // view's word or a visit with no day (`calendar/month`, `calendar/a-<id>`) opens on the weeks around today, as the
    // route alone does (contracts calendarParamParts).
    'if(s==="calendar"&&/\\d{4}-\\d{2}-\\d{2}/.test(l))s="";',
    // Reports is read over the days its address says, where it says them (`reports/people:2026-09-01~2026-09-20`,
    // lenses.ts lensRoute: a link someone sent), else over the period this device last picked, as the page reads it; one
    // it does not know is the default's. The days are spelled as the page's own read spells them, first then last.
    // A page that opens through one read and draws the period line reads the same stored period (PREFETCH_BESIDE).
    `var P=null,d=s==="reports"&&/(?:^|:)(\\d{4}-\\d{2}-\\d{2})~(\\d{4}-\\d{2}-\\d{2})$/.exec(l);if(d)P="from="+d[1]+"&to="+d[2];else if(s==="reports"||O.call(B,s))try{var o=localStorage.getItem(${JSON.stringify(REPORT_PERIOD_STORAGE)});if(${JSON.stringify(REPORT_PERIOD_IDS)}.indexOf(o)>=0)P="period="+o}catch(e){}`,
    `if(s==="clients"&&new RegExp(${JSON.stringify(PREFETCH_UUID)},"i").test(l))u.push("/api/v1/contacts/"+l+"?workspace="+w);`,
    // A view of Leads the address names (a search, a list) is the page's to read: it opens on who is looking alone.
    'else if(!(s==="clients"&&/^leads(:|$)/.test(l))&&Object.prototype.hasOwnProperty.call(t,s))',
    `for(var j=0;j<t[s].length;j++){var x=P?t[s][j].replace(${JSON.stringify(`period=${REPORT_PERIOD_DEFAULT}`)},P):t[s][j];u.push("/api/v1/"+x+(x.indexOf("?")<0?"?":"&")+"workspace="+w)}`,
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
    'var L=function(z){if(!z)return;var m=JSON.parse(z),c=R[m.k];if(!c)return;R[m.k]=0;var H={"content-type":"application/json"};for(var e in m.h||{})H[e]=m.h[e];c[0](new Response(JSON.stringify(m.b),{status:m.s,headers:H}))};',
    'g("/api/v1/open?route="+s+(P?"&"+P:"")+"&workspace="+w).then(function(r){if(!r.ok)throw 0;if(!r.body||!r.body.getReader)return r.text().then(function(T){T.split("\\n").forEach(L)});var D=r.body.getReader(),C=new TextDecoder(),Q="";var N=function(){return D.read().then(function(c){if(c.done){L(Q);return}Q+=C.decode(c.value,{stream:true});var n;while((n=Q.indexOf("\\n"))>=0){L(Q.slice(0,n));Q=Q.slice(n+1)}return N()})};return N()}).then(E,E)}',
    "else for(var i=0;i<u.length;i++)if(!f[u[i]])f[u[i]]=g(u[i]);",
    "}}catch(e){}"
  ].join("");
}
