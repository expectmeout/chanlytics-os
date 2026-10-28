/**
 * The route's own reads, started from the document head (contracts routePrefetchScript, client/api.ts `prefetched`,
 * legacy-bridge/api.ts takePrefetched; 25 Sep 2026).
 *
 * Nothing was fetched until the shell had mounted: on a cold load of a person's page the first request left 2,033 ms
 * after a document whose first byte came at 26 ms. The head now starts who is looking and, on a person's page, the
 * person, and on every other page what it opens on (PREFETCH_READS; 2 Oct 2026: they left at the mount, 538 ms into a
 * document whose first byte came at 16), spelled as the client spells them, and the client's read takes what the head
 * started in place of its own fetch, once. The script is run here as a browser would run it, against a window and a
 * location the test makes; the client is the real one over a fetch that records; and what each page opens on is held to
 * what its surfaces' own reads ask for, by running them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  routePrefetchScript,
  PREFETCH_SLOT,
  PREFETCH_READS,
  PREFETCH_BESIDE,
  openReads,
  REPORT_PERIOD_DEFAULT,
  REPORT_PERIOD_IDS,
  REPORT_PERIOD_STORAGE,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";

/** The head's script, run over a page at `pathname` + `hash`: what it fetched, and the window it left. */
const headRuns = ({ pathname, hash, window: given = {}, fetch: fetchWith = null, globals = {} }) => {
  const calls = [];
  const win = given;
  const ctx = {
    window: win,
    location: { pathname, hash },
    fetch:
      fetchWith ??
      ((url, init) => {
        calls.push([url, init]);
        return Promise.resolve({ url });
      }),
    encodeURIComponent,
    decodeURIComponent,
    RegExp,
    ...globals,
  };
  vm.runInNewContext(routePrefetchScript(), ctx);
  return { calls, win };
};

/** Who is looking, then what the shell's route `route` opens on, as the client spells each read. */
const opensOn = (ws, route) => [
  `/api/v1/workspaces?workspace=${ws}`,
  ...PREFETCH_READS[route].map((r) => `/api/v1/${r}${r.includes("?") ? "&" : "?"}workspace=${ws}`),
];

test("on a person's page the head starts who is looking and the person, as the client spells them, same-origin", () => {
  const { calls, win } = headRuns({ pathname: "/w/harbor", hash: `#/clients/${ID}` });
  assert.deepEqual(
    calls.map(([u]) => u),
    [`/api/v1/workspaces?workspace=harbor`, `/api/v1/contacts/${ID}?workspace=harbor`],
  );
  assert.ok(
    calls.every(([, init]) => init.credentials === "same-origin"),
    "the session's cookies ride along, as on the client's own fetch",
  );
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]).sort(), calls.map(([u]) => u).sort(), "parked under the URL");
});

test("the route is the path's, else the hash's: a person's page opens the person from either", () => {
  const person = [`/api/v1/workspaces?workspace=harbor`, `/api/v1/contacts/${ID}?workspace=harbor`];
  // Decision 0015: the route is what follows the slug.
  assert.deepEqual(
    headRuns({ pathname: `/w/harbor/clients/${ID}`, hash: "" }).calls.map(([u]) => u),
    person,
  );
  // An address the frame has not moved yet still says it in the hash, and the person is read while the frame moves it.
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor", hash: `#/clients/${ID}` }).calls.map(([u]) => u),
    person,
  );
  // The path wins over a hash left in it, and a path for another page reads no person: it opens that page.
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/inbox", hash: `#/clients/${ID}` }).calls.map(([u]) => u),
    opensOn("harbor", "inbox"),
  );
  // The path says People as the product does (ROUTE_WORDS), and an old link says it as the shell did: both open the person.
  assert.deepEqual(
    headRuns({ pathname: `/w/harbor/people/${ID}`, hash: "" }).calls.map(([u]) => u),
    person,
  );
  // Not a person: the page is People's list, which has its own reads (below).
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/clients/not-a-uuid", hash: "" }).calls.map(([u]) => u),
    PEOPLE_LIST("harbor"),
  );
});

/** Who is looking, then what People's list opens on: the rows, the lists kept, the member's views, in the order it asks. */
const PEOPLE_LIST = (ws) => [
  `/api/v1/workspaces?workspace=${ws}`,
  `/api/v1/contacts?workspace=${ws}`,
  `/api/v1/segments?workspace=${ws}`,
  `/api/v1/views?workspace=${ws}`,
];

test("on People's list the head starts its three reads beside who is looking, as the client spells them; Leads and a person's page do not take them", () => {
  assert.deepEqual(
    headRuns({ pathname: "/w/harbor/people", hash: "" }).calls.map(([u]) => u),
    PEOPLE_LIST("harbor"),
  );
  // A list, a saved list and the Pipeline are the same page over the same rows.
  for (const route of ["people/seg:vip", "people/list:abc", "people/state:needs", "people/pipeline", "clients"])
    assert.deepEqual(
      headRuns({ pathname: `/w/harbor/${route}`, hash: "" }).calls.map(([u]) => u),
      PEOPLE_LIST("harbor"),
      route,
    );
  // Leads is its own surface: the scope alone opens on its own list, never People's rows (a view it names is below).
  for (const route of ["people/leads", "clients/leads"])
    assert.deepEqual(
      headRuns({ pathname: `/w/harbor/${route}`, hash: "" }).calls.map(([u]) => u),
      opensOn("harbor", "leads"),
      route,
    );
  // Parked under the URL the client reads, each once.
  const { win } = headRuns({ pathname: "/w/harbor/people", hash: "" });
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]).sort(), PEOPLE_LIST("harbor").slice().sort());
  const { calls } = headRuns({ pathname: "/w/harbor/people", hash: "", window: win });
  assert.deepEqual(calls, [], "run twice, nothing twice");
});

test("every page opens on its own reads, named by the path's word or the hash's; an address naming no route is Today's", () => {
  // The path says the product's word (ROUTE_WORDS); an old link, or a hash the frame has not moved yet, says the shell's.
  const pages = [
    ["today", "today"],
    ["inbox/c-1", "inbox"],
    ["conversations/calls", "conversations"],
    ["live", "live"],
    ["lists", "segments"],
    ["segments", "segments"],
    // Leads' own scope of People, by the product's word and the shell's.
    ["people/leads", "leads"],
    ["clients/leads", "leads"],
    ["calendar", "calendar"],
    // Every lens of Reports draws from the one report.
    ["reports", "reports"],
    ["reports/bookings", "reports"],
    // Campaigns lands on Sequences' list, its own address, a group's and a campaign's alike, and opens on what Sequences does.
    ["campaigns", "campaigns"],
    ["campaigns/in:winback", "campaigns"],
    ["campaigns/moment:3f6c1a52-0d1e-4b8a-9c2f-5e7d8a9b0c1d", "campaigns"],
    // A message is a sheet over that list, opening on its own reads too; the composer's old addresses land on the one New
    // (the Campaigns wiring review's lane 6), and open on what New opens on.
    ["campaigns/new", "campaigns/sequences/new"],
    ["campaigns/new:leads", "campaigns/sequences/new"],
    ["campaigns/new:to:list-1", "campaigns/sequences/new"],
    // A message at its home opens on what Messages opens on; its old drawer's address lands there.
    ["campaigns/messages/hello", "campaigns/messages"],
    ["campaigns/message:hello", "campaigns/messages"],
    // Sequences, its list: its own read (decision 0060). A record reads itself beside it (below). New, on each who, opens on
    // what Send once is made of beside the list, and a run at its home on what its screen is (lanes 2 and 6).
    ["campaigns/sequences", "campaigns/sequences"],
    ["campaigns/sequences/new", "campaigns/sequences/new"],
    ["campaigns/sequences/new:once:to:list-1", "campaigns/sequences/new"],
    ["campaigns/sequences/new:leads", "campaigns/sequences/new"],
    ["campaigns/sequences/sq-1/runs/b-1", "campaigns/sequences/runs"],
    // Get their yes, a sheet over People's list (lane 7), opens on People's reads and Sent's.
    ["people/get-yes", "clients/get-yes"],
    ["clients/get-yes", "clients/get-yes"],
    ["broadcasts", "broadcasts"],
    ["playbooks", "outbound"],
    ["outbound", "outbound"],
    ["templates", "messages"],
    // Messages as the view of Campaigns it is (19 Oct 2026), opening on what the Library did.
    ["campaigns/messages", "campaigns/messages"],
    ["admin/team", "admin"],
    ["start", "start"],
  ];
  for (const [path, route] of pages) {
    assert.deepEqual(
      headRuns({ pathname: `/w/acme/${path}`, hash: "" }).calls.map(([u]) => u),
      opensOn("acme", route),
      path,
    );
    assert.deepEqual(
      headRuns({ pathname: "/w/acme", hash: `#/${path}` }).calls.map(([u]) => u),
      opensOn("acme", route),
      path,
    );
  }
  for (const pathname of ["/w/acme", "/w/acme/"])
    assert.deepEqual(
      headRuns({ pathname, hash: "" }).calls.map(([u]) => u),
      opensOn("acme", "today"),
      pathname,
    );
  // People's own address, before the frame has moved it, still starts People's reads.
  for (const hash of ["#/clients", "#/clients/c-ana", "#/clients/not-a-uuid"])
    assert.deepEqual(
      headRuns({ pathname: "/w/acme", hash }).calls.map(([u]) => u),
      PEOPLE_LIST("acme"),
      hash,
    );
});

test("a sequence's record reads itself beside Sequences' list, and the tab its address opens on where that tab reads its own; New, a run and a word that is no id read none", () => {
  const SEQ = "3f6c1a52-0d1e-4b8a-9c2f-5e7d8a9b0c1d";
  const record = `/api/v1/sequences/${SEQ}?workspace=acme`;
  const reads = (path) => headRuns({ pathname: `/w/acme/${path}`, hash: "" }).calls.map(([u]) => u);
  const list = opensOn("acme", "campaigns/sequences");
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}`), [...list, record], "Steps reads the record alone");
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}/people`), [
    ...list,
    record,
    `/api/v1/sequences/${SEQ}/people?workspace=acme`,
  ]);
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}/history`), [
    ...list,
    record,
    `/api/v1/sequences/${SEQ}/history?workspace=acme`,
  ]);
  // A day of History is its run, at its home (the Campaigns wiring review's lane 2): the older address opens on what the
  // run's home does, where it lands, and reads no record it will not draw. A way back to Leads is no tab.
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}/history/${ID}`), opensOn("acme", "campaigns/sequences/runs"));
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}/runs/${ID}`), opensOn("acme", "campaigns/sequences/runs"));
  assert.deepEqual(reads(`campaigns/sequences/${SEQ}/back:s-1`), [...list, record]);
  // An address the frame has not moved yet says it in the hash, and reads the same.
  assert.deepEqual(
    headRuns({ pathname: "/w/acme", hash: `#/campaigns/sequences/${SEQ}` }).calls.map(([u]) => u),
    [...list, record],
  );
  assert.deepEqual(reads("campaigns/sequences/new"), opensOn("acme", "campaigns/sequences/new"));
  assert.deepEqual(reads("campaigns/sequences/not-an-id"), list);
});

test("on an address that says days Reports is read over them, by their first and last day, whatever period the device keeps; anything else after a lens is the period's", () => {
  const DAYS = "2026-09-01~2026-09-20";
  const over = (route, saved = "7d") =>
    headRuns({
      pathname: `/w/acme/${route}`,
      hash: "",
      globals: { localStorage: { getItem: (k) => (k === REPORT_PERIOD_STORAGE ? saved : null) } },
    }).calls.map(([u]) => u);
  const days = ["/api/v1/workspaces?workspace=acme", "/api/v1/reports?from=2026-09-01&to=2026-09-20&workspace=acme"];
  // A link someone sent: the Overview over the days, a lens over them, and with nothing kept on the device at all.
  assert.deepEqual(
    over(`reports/${DAYS}`),
    days,
    "REGRESSION: the head read the device's period, and the page read the days after it",
  );
  assert.deepEqual(over(`reports/people:${DAYS}`), days);
  assert.deepEqual(over(`reports/reviews:${DAYS}`, null), days);
  // The address the frame has not moved yet says them in the hash.
  assert.deepEqual(
    headRuns({
      pathname: "/w/acme",
      hash: `#/reports/people:${DAYS}`,
      globals: { localStorage: { getItem: () => "90d" } },
    }).calls.map(([u]) => u),
    days,
  );
  // A lens alone, and words that are not days, are read over the period kept.
  const kept = days.map((u) => u.replace("from=2026-09-01&to=2026-09-20", "period=7d"));
  for (const route of ["reports/people", "reports/people:30d", "reports/2026-09-01", "reports/people:2026-09-01~x"])
    assert.deepEqual(over(route), kept, route);
});

test("Reports is read over the period this device last picked, as the page reads it; a period nobody offers is the default's", () => {
  const over = (saved) =>
    headRuns({
      pathname: "/w/acme/reports",
      hash: "",
      globals: { localStorage: { getItem: (k) => (k === REPORT_PERIOD_STORAGE ? saved : null) } },
    }).calls.map(([u]) => u);
  for (const period of REPORT_PERIOD_IDS)
    assert.deepEqual(
      over(period),
      ["/api/v1/workspaces?workspace=acme", `/api/v1/reports?period=${period}&workspace=acme`],
      period,
    );
  assert.ok(REPORT_PERIOD_IDS.length > 1 && REPORT_PERIOD_IDS.includes(REPORT_PERIOD_DEFAULT));
  // Nothing kept, something another build kept, storage that throws: thirty days, which is what the page falls back to.
  for (const saved of [null, "", "1y", "constructor"]) assert.deepEqual(over(saved), opensOn("acme", "reports"), saved);
  assert.deepEqual(
    headRuns({
      pathname: "/w/acme/reports",
      hash: "",
      globals: {
        localStorage: {
          getItem: () => {
            throw new Error("storage is off");
          },
        },
      },
    }).calls.map(([u]) => u),
    opensOn("acme", "reports"),
  );
  // The device's period is Reports' alone: the Campaigns' sends are counted over their own thirty days whatever it is.
  const other = REPORT_PERIOD_IDS.find((p) => p !== REPORT_PERIOD_DEFAULT);
  assert.deepEqual(
    headRuns({
      pathname: "/w/acme/broadcasts",
      hash: "",
      globals: { localStorage: { getItem: () => other } },
    }).calls.map(([u]) => u),
    opensOn("acme", "broadcasts"),
  );
});

test("a page that opens on what only the page can work out, or one nobody named, starts who is looking alone; off a workspace page nothing is", () => {
  // A day the Calendar's address names is read by the weeks around that day, and a view of Leads the address names
  // (a search, a list, a class) by that view: each is the page's own arithmetic, and the head guesses at neither.
  for (const route of [
    "calendar/2026-10-02",
    "people/leads:s-abc",
    "clients/leads:s-1",
    "clients/leads:l-kept",
    "nowhere",
    "constructor",
  ])
    assert.deepEqual(
      headRuns({ pathname: `/w/acme/${route}`, hash: "" }).calls.map(([u]) => u),
      ["/api/v1/workspaces?workspace=acme"],
      route,
    );
  for (const pathname of ["/", "/login", "/w", "/w/", "/yes/acme"])
    assert.deepEqual(headRuns({ pathname, hash: `#/clients/${ID}` }).calls, [], pathname);
});

test("a Calendar address that names a view or a visit with no day opens on the weeks around today, as the route alone does", () => {
  for (const route of [
    "calendar/week",
    "calendar/month",
    "calendar/agenda",
    "calendar/a-priya",
    "calendar/week:a-priya",
  ])
    assert.deepEqual(
      headRuns({ pathname: `/w/acme/${route}`, hash: "" }).calls.map(([u]) => u),
      opensOn("acme", "calendar"),
      route,
    );
  // A view on a day is that day's weeks: the page's own read.
  assert.deepEqual(
    headRuns({ pathname: "/w/acme/calendar/week:2026-10-02:a-priya", hash: "" }).calls.map(([u]) => u),
    ["/api/v1/workspaces?workspace=acme"],
  );
});

test("run twice, the head starts nothing twice; a fetch that throws leaves the page alone", () => {
  const first = headRuns({ pathname: "/w/acme", hash: `#/clients/${ID}` });
  const again = headRuns({ pathname: "/w/acme", hash: `#/clients/${ID}`, window: first.win });
  assert.deepEqual(again.calls, [], "already parked");
  assert.doesNotThrow(() =>
    headRuns({
      pathname: "/w/acme",
      hash: "#/today",
      fetch: () => {
        throw new Error("no fetch here");
      },
    }),
  );
});

/* ------------------------------ one read for a page (GET open) ------------------------------ */

/** The head over Today in a browser that reads a stream: GET open answered by `answer`, the slot it parked. */
const openedToday = ({ answer, storage = {}, pathname = "/w/harbor" }) => {
  const calls = [];
  const { win } = headRuns({
    pathname,
    hash: "",
    fetch: (url, init) => {
      calls.push([url, init]);
      return Promise.resolve(answer());
    },
    globals: {
      Response,
      TextDecoder,
      localStorage: { getItem: (k) => storage[k] ?? null },
    },
  });
  return { calls, slot: win[PREFETCH_SLOT] };
};
const line = (k, b, s = 200, h) => JSON.stringify({ k, s, b, ...(h ? { h } : {}) });
const ndjson = (lines) => new Response(`${lines.join("\n")}\n`, { status: 200 });
const urlOf = (key) => `/api/v1/${key}${key.includes("?") ? "&" : "?"}workspace=harbor`;
const settled = (p) =>
  p.then(
    async (r) => ({ status: r.status, body: await r.json(), retry: r.headers.get("retry-after") }),
    (e) => ({ rejected: String(e.message ?? e) }),
  );

test("where the browser reads a stream, Today opens through one read: an answer parked for each of its reads, as the client spells it", async () => {
  const [own, beside] = openReads("today");
  const { calls, slot } = openedToday({
    answer: () => ndjson([...own, ...beside].map((k) => line(k, { ok: true, data: { k } }))),
  });
  assert.equal(calls.length, 1, "one request");
  assert.equal(calls[0][0], "/api/v1/open?route=today&workspace=harbor");
  assert.equal(calls[0][1].credentials, "same-origin");
  assert.deepEqual(
    Object.keys(slot).sort(),
    [...own, ...beside].map(urlOf).sort(),
    "who is looking, the page's own, what it draws beside",
  );
  for (const k of [...own, ...beside])
    assert.deepEqual(await settled(slot[urlOf(k)]), { status: 200, body: { ok: true, data: { k } }, retry: null }, k);
});

test("each answer is the line its read's own route wrote, its status and wait included; one the stream did not carry is the page's to ask for", async () => {
  const { slot } = openedToday({
    answer: () =>
      ndjson([
        line("metrics?days=1", { ok: false, error: { code: "rate_limited", message: "Slow down." } }, 429, {
          "retry-after": "13",
        }),
        line("calls", { ok: true, data: { calls: [] } }),
      ]),
  });
  assert.deepEqual(await settled(slot[urlOf("metrics?days=1")]), {
    status: 429,
    body: { ok: false, error: { code: "rate_limited", message: "Slow down." } },
    retry: "13",
  });
  assert.equal((await settled(slot[urlOf("calls")])).status, 200);
  assert.deepEqual(
    await settled(slot[urlOf("setup")]),
    { rejected: "open" },
    "not carried: the page's read asks itself",
  );
});

test("a refusal of the whole, or a stream that cannot be read, hands every read back to the page", async () => {
  for (const answer of [
    () => new Response(JSON.stringify({ ok: false, error: { code: "unauthorized" } }), { status: 401 }),
    () => new Response("{not json\n", { status: 200 }),
  ]) {
    const { slot } = openedToday({ answer });
    for (const url of Object.keys(slot)) assert.deepEqual(await settled(slot[url]), { rejected: "open" }, url);
  }
});

test("the period line is read over the period this device last picked, as Reports reads it, and the head asks over it", async () => {
  const { calls, slot } = openedToday({
    storage: { [REPORT_PERIOD_STORAGE]: "7d" },
    answer: () => ndjson([line("reports/headline?period=7d", { ok: true, data: { headline: 1 } })]),
  });
  assert.equal(calls[0][0], "/api/v1/open?route=today&period=7d&workspace=harbor");
  assert.equal((await settled(slot[urlOf("reports/headline?period=7d")])).status, 200);
  assert.ok(!(urlOf("reports/headline?period=30d") in slot), "never the default's beside it");
});

test("the Inbox opens through one read too, and a thread its address names has its person read in the first tier", async () => {
  const [own, beside] = openReads("inbox", null, ID);
  assert.equal(own.at(-1), `contacts?thread=${ID}`, "the thread's person, beside the page's own");
  const { calls, slot } = openedToday({
    pathname: `/w/harbor/inbox/th-${ID}`,
    answer: () => ndjson([...own, ...beside].map((k) => line(k, { ok: true, data: { k } }))),
  });
  assert.equal(calls.length, 1, "one request");
  assert.equal(calls[0][0], `/api/v1/open?route=inbox&thread=${ID}&workspace=harbor`);
  assert.deepEqual(Object.keys(slot).sort(), [...own, ...beside].map(urlOf).sort());
  for (const k of [...own, ...beside])
    assert.deepEqual(await settled(slot[urlOf(k)]), { status: 200, body: { ok: true, data: { k } }, retry: null }, k);
  // The list alone, or a thread of the mockup's: no person to read.
  for (const pathname of ["/w/harbor/inbox", "/w/harbor/inbox/th-1", "/w/harbor/inbox/to-send"]) {
    const opened = openedToday({ pathname, answer: () => ndjson([]) });
    assert.equal(opened.calls[0][0], "/api/v1/open?route=inbox&workspace=harbor", pathname);
    assert.ok(!Object.keys(opened.slot).some((u) => u.includes("thread=")), pathname);
  }
  // Where the browser cannot read a stream, one request each, the thread's person among them, as the client spells it.
  assert.deepEqual(
    headRuns({ pathname: `/w/harbor/inbox/th-${ID}`, hash: "" }).calls.map(([u]) => u),
    [...opensOn("harbor", "inbox"), `/api/v1/contacts?thread=${ID}&workspace=harbor`],
  );
});

test("a browser that cannot read a stream opens Today as it always did, one request for each of its own reads", () => {
  const { calls } = headRuns({ pathname: "/w/harbor", hash: "" });
  assert.deepEqual(
    calls.map(([u]) => u),
    opensOn("harbor", "today"),
    "who is looking and the page's own: what it draws beside them waits for the page",
  );
});

test("a read the head started is bounded until its headers come, never after: a hung one gives way, an answered one's body is never cut off", async () => {
  const timers = new Map();
  let next = 1;
  const globals = {
    setTimeout: (fn, ms) => {
      timers.set(next, { fn, ms });
      return next++;
    },
    clearTimeout: (k) => timers.delete(k),
  };
  const signals = {};
  const { win } = headRuns({
    pathname: "/w/acme",
    hash: `#/clients/${ID}`,
    window: { AbortController },
    globals,
    fetch: (url, init) => {
      signals[url] = init.signal;
      // Who is looking answers at once; the person never does.
      return url.startsWith("/api/v1/workspaces") ? Promise.resolve({ url }) : new Promise(() => {});
    },
  });
  const who = "/api/v1/workspaces?workspace=acme";
  const person = `/api/v1/contacts/${ID}?workspace=acme`;
  assert.equal(timers.size, 2, "one bound per read");
  assert.ok(
    [...timers.values()].every((t) => t.ms === 15_000),
    "as long as the client's own read would wait",
  );
  assert.deepEqual(await win[PREFETCH_SLOT][who], { url: who }, "the client takes the answer itself");
  assert.equal(timers.size, 1, "an answered read's bound ends with its headers");
  for (const t of timers.values()) t.fn();
  assert.equal(signals[person].aborted, true, "the hung read gives way to the client's own");
  assert.equal(signals[who].aborted, false, "the answered read's body is never cut off");
});

/* ------------------------------ the client takes it ------------------------------ */

const { createApi } = await importSrc("apps/dashboard/src/client/api.ts");
const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const client = ({ prefetched, fetched }) =>
  createApi({
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    workspace: () => "acme",
    onSignedOut() {},
    refresh: async () => {},
    prefetched,
  });

test("a read takes what the head started for its URL, once; the next identical read asks the server", async () => {
  const fetched = [];
  let handed = 0;
  const slot = {
    [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
  };
  const api = client({
    fetched,
    prefetched: (url) => {
      const p = slot[url] ?? null;
      if (p) {
        handed += 1;
        delete slot[url];
      }
      return p;
    },
  });
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.ok, true);
  assert.equal(r.data.person.id, "early", "the head's answer");
  assert.deepEqual(fetched, [], "no fetch of its own");
  assert.equal(handed, 1);
  api.forget();
  const r2 = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r2.data.person.id, "fetched", "handed over once: the next read is the server's");
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

test("a sequence's record takes what the head started for it: the head spells its read as the client does", async () => {
  const SEQ = "3f6c1a52-0d1e-4b8a-9c2f-5e7d8a9b0c1d";
  const { win } = headRuns({ pathname: `/w/acme/campaigns/sequences/${SEQ}/people`, hash: "" });
  const parked = Object.keys(win[PREFETCH_SLOT]);
  const fetched = [];
  const taken = [];
  const api = client({
    fetched,
    prefetched: (url) => {
      if (!parked.includes(url)) return null;
      taken.push(url);
      return Promise.resolve(json({ ok: true, data: { early: true } }));
    },
  });
  assert.equal((await api("GET sequences/[id]", { params: { id: SEQ } })).data.early, true);
  assert.equal((await api("GET sequences/[id]/people", { params: { id: SEQ } })).data.early, true);
  assert.deepEqual(fetched, [], "neither read asked the server itself");
  assert.deepEqual(taken, [
    `/api/v1/sequences/${SEQ}?workspace=acme`,
    `/api/v1/sequences/${SEQ}/people?workspace=acme`,
  ]);
});

test("the page's own read, seconds after the head's landed, shares its answer; long after, it asks the server", async () => {
  // Seen on the dev server (25 Sep 2026): the head's read landed, the page mounted 14 s later and read the person
  // again, since a settled read is shared for two seconds. A phone mounts the shell seconds after the head ran.
  const fetched = [];
  let clock = 1_000;
  const slot = {
    [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
  };
  const api = createApi({
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    workspace: () => "acme",
    onSignedOut() {},
    refresh: async () => {},
    now: () => clock,
    prefetched: (url) => {
      const p = slot[url] ?? null;
      delete slot[url];
      return p;
    },
  });
  assert.equal((await api("GET contacts/[id]", { params: { id: ID } })).data.person.id, "early");
  clock += 6_000;
  assert.equal(
    (await api("GET contacts/[id]", { params: { id: ID } })).data.person.id,
    "early",
    "six seconds on: the head's",
  );
  assert.deepEqual(fetched, []);
  clock += 6_000;
  assert.equal(
    (await api("GET contacts/[id]", { params: { id: ID } })).data.person.id,
    "fetched",
    "twelve: the server's",
  );
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

test("a prefetch that failed is asked again by the read itself, and a write never takes one", async () => {
  const fetched = [];
  const api = client({
    fetched,
    prefetched: (url) =>
      url.startsWith("/api/v1/contacts/") ? Promise.reject(new TypeError("Failed to fetch")) : null,
  });
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.ok, true);
  assert.equal(r.data.person.id, "fetched");
  assert.deepEqual(fetched, [`/api/v1/contacts/${ID}?workspace=acme`]);
});

/* ------------------------------ the bridge's slot ------------------------------ */

test("the bridge's client takes the window's slot for a URL and forgets it as it does", async () => {
  const fetched = [];
  const win = {
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { person: { id: "fetched" } } });
    },
    location: { pathname: "/w/acme", hash: "", assign() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    __WORKSPACES: [{ id: "ws-acme", slug: "acme", name: "Acme", status: "active" }],
    __ACTIVE_WORKSPACE: "ws-acme",
    [PREFETCH_SLOT]: {
      [`/api/v1/contacts/${ID}?workspace=acme`]: Promise.resolve(json({ ok: true, data: { person: { id: "early" } } })),
    },
  };
  globalThis.window = win;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.localStorage = win.localStorage;
  const { apiFor } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
  const api = apiFor(win);
  const r = await api("GET contacts/[id]", { params: { id: ID } });
  assert.equal(r.data.person.id, "early");
  assert.deepEqual(fetched, []);
  assert.deepEqual(Object.keys(win[PREFETCH_SLOT]), [], "taken, and gone from the slot");
});

/* ------------------------------ what each page opens on ------------------------------ */

test("what the head starts for a page is what its surfaces ask for first, no more and no less: each one run", async () => {
  const asked = [];
  const win = {
    // Every read is recorded and never answered: a surface asks for its first reads together, then waits.
    fetch: (url) => {
      asked.push(url);
      return new Promise(() => {});
    },
    location: { pathname: "/w/harbor", search: "", hash: "", assign() {}, replace() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  };
  globalThis.window = win;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.localStorage = win.localStorage;
  const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
  const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const S = "apps/dashboard/src";
  const overrides = Object.fromEntries(
    [
      (await importSrc(`${S}/surfaces/today/override.ts`)).todayOverride,
      (await importSrc(`${S}/surfaces/setup/override.ts`)).setupOverride,
      (await importSrc(`${S}/surfaces/inbox/surface.ts`)).inboxOverride,
      (await importSrc(`${S}/surfaces/inbox/conversations-surface.ts`)).conversationsOverride,
      (await importSrc(`${S}/surfaces/people/surface.ts`)).peopleOverride,
      (await importSrc(`${S}/surfaces/live/surface.ts`)).liveOverride,
      (await importSrc(`${S}/surfaces/campaigns/broadcasts/surface.ts`)).broadcastsOverride,
      // Who each audience reaches: the composer's, over everyone in People (audiences-surface.ts).
      (await importSrc(`${S}/surfaces/campaigns/broadcasts/audiences-surface.ts`)).audiencesOverride,
      (await importSrc(`${S}/surfaces/campaigns/playbooks/surface.ts`)).playbooksOverride,
      (await importSrc(`${S}/surfaces/campaigns/reach-out/override.ts`)).reachOutsOverride,
      (await importSrc(`${S}/surfaces/campaigns/sequences/surface.ts`)).sequencesOverride,
      (await importSrc(`${S}/legacy-bridge/surfaces/settings.ts`)).settingsOverride,
      // The channels read every page that draws a number is made of (Live, the composers, the Library, Connections).
      (await importSrc(`${S}/surfaces/channels/surface.ts`)).channelsOverride,
      (await importSrc(`${S}/surfaces/calendar/surface.ts`)).calendarOverride,
      (await importSrc(`${S}/surfaces/calendar/runs-surface.ts`)).calendarRunsOverride,
      (await importSrc(`${S}/surfaces/reports/surface.ts`)).reportsOverride,
      (await importSrc(`${S}/surfaces/leads/override.ts`)).leadsOverride,
      // Who is looking: Reports' strip waits for it (ROUTE_WAITS), and its read is every page's.
      (await importSrc(`${S}/legacy-bridge/surface-data.ts`)).workspaceOverride,
      // What Today draws beside its own: the period line and the bell (PREFETCH_BESIDE), Google's reviews and the reach-outs'
      // replies (which its first draw waits for, PREFETCH_READS).
      (await importSrc(`${S}/surfaces/reports/headline.ts`)).reportsHeadlineOverride,
      (await importSrc(`${S}/legacy-bridge/surfaces/notifications.ts`)).notificationsOverride,
      (await importSrc(`${S}/legacy-bridge/google.ts`)).googleOverride,
      (await importSrc(`${S}/legacy-bridge/reach-out/replies.ts`)).repliesOverride,
      // And the counts of the lists pinned there (R10), which ask nothing where nothing is pinned.
      (await importSrc(`${S}/surfaces/today/pins-surface.ts`)).todayPinsOverride,
      // And Ask for you: the member's morning as it stands (decision 0070).
      (await importSrc(`${S}/surfaces/today/ask-morning-surface.ts`)).askMorningOverride,
      // And the drafts Ask kept for Need you's rows, which Today's first draw waits for (decision 0071).
      (await importSrc(`${S}/surfaces/today/need-you/drafts-surface.ts`)).replyDraftsOverride,
    ].map((o) => [o.key, o]),
  );
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  // Settings is a page of panes, each drawn from the settings surface: asked about one of them.
  const paramOf = { admin: "workspace" };
  // What a page draws on its first screen from another page's surface, started with its own: Today's strip (the next
  // visit, the next opening) is the calendar's weeks, which the frame reads right after Today's own (ROUTE_DRAWS);
  // Campaigns, Sequences' list, draws the settings read beside it as Sequences does, and the screens beside the list draw
  // theirs at their own addresses: the one New the playbooks' moments, lists and counts and the settings read, which holds
  // the templates (the one read of them, task 3.3; decision 0065), a run at its home Sent's runs, a message the playbooks'
  // read and the settings read (the Campaigns wiring review's lanes 2 and 6); and the Calendar's campaign marks are their
  // own span's read, started beside the board's (the Calendar's lane C). And the channels read (surfaces/channels/
  // surface.ts), which Live, New, a run and the Library are made of: the one read of the numbers, started with the page's
  // own. The Inbox draws Sent's runs, waiting ones as rows of Needs you: their own read, nothing of People (the Inbox's
  // run review, 18 Oct 2026), and the thread it opens on its reply box's reads, the kept drafts and the settings read's templates
  // (the Inbox load review, 28 Oct 2026). And Get their yes, over People's list, draws the opt-in Sent's read carries (lane 7).
  const alsoDrawn = {
    today: ["calendar"],
    inbox: ["broadcasts", "reply_drafts", "settings"],
    campaigns: ["settings"],
    "campaigns/sequences/new": ["playbooks", "settings", "channels"],
    "campaigns/sequences/runs": ["broadcasts", "settings", "channels"],
    "campaigns/sequences": ["settings"],
    "clients/get-yes": ["broadcasts"],
    calendar: ["calendar_runs"],
    live: ["channels"],
    broadcasts: ["channels", "sequences"],
    outbound: ["channels"],
    messages: ["channels"],
    "campaigns/messages": ["channels"],
  };
  // What a page reads itself beside its surfaces, started by the head with them: New's searches whose leads are ready, one of
  // its starts, which its first draw waits for where the tab opens on New (reach-out/sources.ts; the Campaigns load review).
  const { readSources } = await importSrc(`${S}/surfaces/campaigns/reach-out/sources.ts`);
  const pageReads = { "campaigns/sequences/new": [readSources] };
  // A key with words after its page (`campaigns/sequences/new`) is that page at that address, as the registry reads one
  // (routePartsOf); a key that names a screen, no address, is asked at one of its addresses (a run at its home).
  const ADDRESS_OF = { "campaigns/sequences/runs": "campaigns/sequences/sq-1/runs/b-1" };
  const addressOf = (route) => ADDRESS_OF[route] ?? route;
  const pageAt = (route) => {
    const { page, param } = registry.routePartsOf(addressOf(route));
    return { page, param: param ?? paramOf[route] ?? null };
  };
  for (const [route, drawn] of Object.entries(alsoDrawn)) {
    const { page, param } = pageAt(route);
    for (const k of drawn)
      assert.ok(registry.routeDrawsFor(page, param).includes(k), `${route} draws ${k} beside its own`);
  }
  // Campaigns' landing draws none of its screens' surfaces: a landing reads Sequences' alone (the phone review's Reads on
  // landing). And New draws no campaign's results nor a chain's: its moments and lists are the playbooks read's (decision 0065).
  for (const k of ["broadcasts", "audiences", "campaign_results", "reach_outs"])
    for (const param of ["sequences/new", "sequences/new:leads", "sequences/new:once:to:list-1"])
      assert.ok(!registry.routeDrawsFor("campaigns", param).includes(k), `campaigns/${param} draws no ${k}`);
  for (const k of ["playbooks", "broadcasts", "reach_outs"])
    for (const param of [null, "in:winback", "moment:p-1", "sequences"])
      assert.ok(!registry.routeDrawsFor("campaigns", param).includes(k), `campaigns/${param ?? ""} draws no ${k}`);
  for (const route of Object.keys(PREFETCH_READS)) {
    const { page, param } = pageAt(route);
    const own = registry.routeSurfaceFor(page, param);
    const keys = [own, ...(registry.ROUTE_WAITS[route] ?? []), ...(alsoDrawn[route] ?? [])];
    assert.ok(
      keys.every((k) => overrides[k]),
      `${route}: every surface it opens on is run here (${keys.join(", ")})`,
    );
    win.location.pathname = `/w/harbor/${addressOf(route)}`;
    api().forget();
    asked.length = 0;
    for (const k of keys) void overrides[k].apply().catch(() => {});
    for (const read of pageReads[route] ?? []) void read();
    await settle();
    // Who is looking is every page's (and a surface's clock reads it when the tab knows no zone yet), and so is the one accept of
    // invitations the shell makes beside it (a POST, not a read the head starts: invitations/accept.ts).
    const theirs = [...new Set(asked)]
      .filter((u) => !u.startsWith("/api/v1/workspaces") && !u.startsWith("/api/v1/me/invitations/accept"))
      .sort();
    const head = opensOn("harbor", route).slice(1).sort();
    assert.deepEqual(head, theirs, `${route}: the head starts what ${keys.join(" and ")} ask for first`);
  }
  // A page that opens through one read (GET open) answers what every surface of its first screen asks for first: its
  // own, what its first draw waits for, and everything it draws beside them (ROUTE_DRAWS), each one run.
  for (const route of Object.keys(PREFETCH_BESIDE)) {
    const keys = [
      registry.routeSurfaceFor(route, null),
      ...(registry.ROUTE_WAITS[route] ?? []),
      ...registry.ROUTE_DRAWS[route],
    ];
    assert.ok(
      keys.every((k) => overrides[k]),
      `${route}: every surface of its first screen is run here (${keys.join(", ")})`,
    );
    win.location.pathname = `/w/harbor/${route}`;
    api().forget();
    asked.length = 0;
    for (const k of keys) void overrides[k].apply().catch(() => {});
    await settle();
    const theirs = [...new Set(asked)]
      .filter((u) => !u.startsWith("/api/v1/workspaces") && !u.startsWith("/api/v1/me/invitations/accept"))
      .sort();
    const [own, beside] = openReads(route);
    const opened = [...own.slice(1), ...beside]
      .map((r) => `/api/v1/${r}${r.includes("?") ? "&" : "?"}workspace=harbor`)
      .sort();
    assert.deepEqual(
      opened,
      theirs,
      `${route}: GET open answers what its first screen's ${keys.length} surfaces ask for first`,
    );
  }
  // Reports over days a member picked, which only its address says: the head reads the address as the page's surface
  // does, so the two spell one read (first day, then last) and the surface's own takes what the head started.
  for (const route of ["reports/2026-09-01~2026-09-20", "reports/people:2026-09-01~2026-09-20"]) {
    win.location.pathname = `/w/harbor/${route}`;
    api().forget();
    asked.length = 0;
    for (const k of ["reports", "workspace"]) void overrides[k].apply().catch(() => {});
    await settle();
    const theirs = [...new Set(asked)]
      .filter((u) => !u.startsWith("/api/v1/workspaces") && !u.startsWith("/api/v1/me/invitations/accept"))
      .sort();
    const head = headRuns({ pathname: win.location.pathname, hash: "" })
      .calls.map(([u]) => u)
      .slice(1)
      .sort();
    assert.equal(head.length, 1, `${route}: the report alone (the Campaigns lens's reads are its own surface's)`);
    assert.deepEqual(head, theirs, `${route}: the head starts what Reports asks for over the days`);
  }
  win.location.pathname = "/w/harbor";
  api().forget();
});

test("every page there is says what it opens on: a page that arrives without its reads is a red build", async () => {
  // The Calendar, Reports, Leads and Campaigns' home had no entry, each for a reason that read well and cost half a
  // second (9 Oct 2026). A page that truly cannot say its first read from the address is named here with why.
  const NONE = {};
  const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  const pages = [...new Set(Object.keys(registry.ROUTE_SURFACE).map((route) => route.split("/")[0]))];
  assert.ok(pages.length > 10, "the pages are read from the registry");
  for (const page of pages)
    assert.ok(
      Object.hasOwn(PREFETCH_READS, page) !== Object.hasOwn(NONE, page),
      `${page}: either what it opens on (contracts PREFETCH_READS) or why it cannot say (here), and never both`,
    );
  for (const page of Object.keys(NONE)) assert.ok(pages.includes(page), `${page} is a page`);
});

/* ------------------------------ what the page did not take ------------------------------ */

test("REGRESSION: what the head started and the page's own reads did not take is let go of once they are in -- Leads' list in Fit order, untaken by a tab that last read another order, answered the owner's pick of Fit minutes later", async () => {
  const LEADS_FIT = "/api/v1/leads?list=all&sort=fit&dir=asc&limit=500&workspace=acme";
  const fetched = [];
  const win = {
    fetch: async (url) => {
      fetched.push(url);
      return json({ ok: true, data: { rows: [{ id: "read now" }] } });
    },
    location: { pathname: "/w/acme/people/leads", search: "", hash: "", assign() {}, replace() {}, reload() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    // What the head started as the document began: the list in Fit order, as every Leads page opens on.
    [PREFETCH_SLOT]: {
      [LEADS_FIT]: Promise.resolve(json({ ok: true, data: { rows: [{ id: "from the first second" }] } })),
    },
  };
  globalThis.window = win;
  globalThis.sessionStorage = win.sessionStorage;
  globalThis.localStorage = win.localStorage;
  globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
  const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
  api().forget();
  // The page's own read is the order this tab last read (leadsBootView): not the head's URL, which it never takes.
  const leads = {
    key: "leads",
    apply: async () =>
      void (await api()("GET leads", { query: { list: "all", sort: "found", dir: "desc", limit: "500" } })),
  };
  const stop = startSurfaces([leads], () => () => {});
  try {
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
    assert.ok(
      fetched.some((u) => u.includes("sort=found")),
      "the page's own read asked the server",
    );
    api().forget();
    // Minutes on, the owner sorts by Fit.
    const r = await api()("GET leads", { query: { list: "all", sort: "fit", dir: "asc", limit: "500" } });
    assert.equal(r.ok, true);
    assert.equal(r.data.rows[0].id, "read now", "REGRESSION: answered from what the document's head read as it began");
    assert.ok(fetched.includes(LEADS_FIT), "the server was asked");
  } finally {
    stop();
    api().forget();
  }
});
