/**
 * One message re-reads the surfaces that draw messages, and draws the shell once.
 *
 * Measured on main at 1388f2cc6 (29 Sep 2026): a message INSERT re-read seven surfaces (conversations, inbox, today,
 * people, reports, broadcasts, playbooks), People and Broadcasts each reading every page of contacts, on whatever page
 * the owner had open; and each read told every status listener, so LegacyApp drew the whole shell seven times.
 *
 * Run on the real overrides' routing through the real runner, with each read recorded instead of made: a message
 * re-reads the Inbox, Conversations and Today, and the page on screen; a surface that let one pass is read once as its
 * page comes on screen. And the shell (app-shell.jsx on a stub React, over the real signal): the reads of a message
 * move nothing for a page that draws none of them, and one redraw for Today.
 *
 * A message's UPDATE (00327: a send's ticks, a failure written late) is told for each receipt, so it is heard by
 * status and by three surfaces alone: the Inbox and Conversations for a tick, Today for a failure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { hookFrames } from "../../_hook-frames.mjs";
import { changesOf, toldFor } from "../../_live-feed.mjs";
import { historyOf, legacyAddress } from "../address/_address.mjs";
import { registeredSurfaces } from "../hearing/_reads.mjs";

const heard = new Map();
const win = {
  __ACTIVE_WORKSPACE: "ws-1",
  location: { pathname: "/w/acme", search: "", hash: "#/today", assign() {}, replace() {}, reload() {} },
  addEventListener(type, fn) {
    if (!heard.has(type)) heard.set(type, new Set());
    heard.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    heard.get(type)?.delete(fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(heard.get(ev.type) ?? [])]) fn(ev);
    return true;
  },
};
globalThis.window = win;
historyOf(win);
// On screen: a hidden page reads, of what the feed tells, only what says itself in the tab's title and badge, and holds the
// rest until it is in front (shell/feed/the-runner-heals.test.mjs).
globalThis.document = { visibilityState: "visible", title: "", addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await tick();
};

// The address the bridge gives the pages, and the pages' way to it: a route moves with popstate, as Back does.
win.__shell = (await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts")).addressApi(win);
win.CHANLY = { nav() {}, address: await legacyAddress() };
const runner = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const status = await importSrc("apps/dashboard/src/legacy-bridge/surface-status.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
/** Every surface the shell registers (LegacyApp.tsx), from the module it imports each from: the shell's own list, no copy. */
const REAL = [];
for (const { name, file } of registeredSurfaces()) REAL.push((await importSrc(file))[name]);

/**
 * The real overrides' routing, each read recorded rather than made, through a runner whose live feed this holds. A read recorded
 * holds nothing, so a surface that asks whether what it holds has aged always says it has; `fresh` names the ones that say it has not.
 */
async function running({ debounceMs = 1, fresh = [], realReceipts = false } = {}) {
  const asked = [];
  const overrides = REAL.map((o) => ({
    ...o,
    debounceMs,
    // A count made of receipts waits for them to quieten (receiptsQuietMs, S3-5): as short as the rest here, unless the case
    // is that wait's own.
    ...(o.receiptsQuietMs !== undefined && !realReceipts ? { receiptsQuietMs: debounceMs } : {}),
    ...(fresh.includes(o.key) ? { isStale: () => false } : {}),
    apply: async () => {
      asked.push(o.key);
    },
  }));
  let feed = null;
  const stop = runner.startSurfaces(overrides, (onChange) => {
    feed = onChange;
    return () => {};
  });
  const offMissed = registry.readWhatWasMissed(
    overrides,
    (keys) => void runner.refreshSurfaces(overrides.filter((o) => keys.includes(o.key))),
    win,
  );
  await settle(20);
  assert.ok(feed, "the feed is joined once the boot is in");
  asked.length = 0;
  const change = async (table, event, status) => {
    feed({ tenant_id: "ws-1", ...(status ? { status } : {}) }, table, event);
    await settle(10);
  };
  /** A notice as the database sends it, decoded by the live feed's own wrapper, each change it makes handed on. */
  const notice = async (payload) => {
    for (const c of await changesOf({ event: payload.op, payload }, "ws-1")) feed(c.row, c.table, c.event);
    await settle(10);
  };
  return {
    asked,
    change,
    notice,
    message: () => change("messages", "INSERT"),
    stop: () => {
      stop();
      offMissed();
    },
  };
}

test("a message re-reads the Inbox, Conversations and Today, and the headline Today owns, not the surfaces nobody is looking at", async () => {
  win.location.hash = "#/today";
  const r = await running();
  try {
    await r.message();
    // And the counts of the lists pinned here (R10), which ask the server nothing where nothing is pinned, and People's whole book
    // never: the pins are counted on the server.
    assert.deepEqual(
      [...r.asked].sort(),
      ["conversations", "inbox", "reports_headline", "today", "today_pins"],
      "REGRESSION: seven surfaces per message (People, Reports, Broadcasts and Playbooks are not Today's to read)",
    );
  } finally {
    r.stop();
  }
});

const THREADS = ["conversations", "inbox"];

test("a message's update is heard by status: the threads' two surfaces for a tick, Today for a failure, none for an arrival's stamp (00327)", async () => {
  assert.deepEqual(toldFor("messages"), ["INSERT", "UPDATE"], "the database tells a workspace of a message's update");
  win.location.hash = "#/today";
  const r = await running();
  try {
    for (const [status, heard] of [
      ["sent", THREADS],
      ["delivered", THREADS],
      ["read", THREADS],
      ["canceled", THREADS],
      ["failed", [...THREADS, "today"]],
      ["received", []],
      ["queued", []],
      [undefined, []],
    ]) {
      r.asked.length = 0;
      await r.change("messages", "UPDATE", status);
      assert.deepEqual([...r.asked].sort(), heard, `an update leaving ${status ?? "no status"}`);
    }
  } finally {
    r.stop();
  }
});

test("a notice reaches the surfaces as the live feed decodes it: each status it carries a change, one read for the lot, and an arrival as it was", async () => {
  win.location.hash = "#/today";
  const r = await running();
  try {
    await r.notice({ table: "messages", op: "UPDATE", statuses: ["delivered", "received"] });
    assert.deepEqual([...r.asked].sort(), THREADS, "a receipt, and an inbound row's stamp beside it");
    r.asked.length = 0;
    await r.notice({ table: "messages", op: "UPDATE", statuses: ["failed", "read"] });
    assert.deepEqual([...r.asked].sort(), [...THREADS, "today"], "a read and a failure: Today reads for the failure");
    r.asked.length = 0;
    await r.notice({ table: "messages", op: "UPDATE", statuses: ["received"] });
    assert.deepEqual(r.asked, [], "an arrival's stamp is nobody's tick");
    await r.notice({ table: "messages", op: "INSERT" });
    assert.deepEqual(
      [...r.asked].sort(),
      ["conversations", "inbox", "reports_headline", "today", "today_pins"],
      "an arrival is read as ever, and Worth a look with it, and the pinned lists' counts (R10)",
    );
  } finally {
    r.stop();
  }
});

test("a receipt reads the threads everywhere, and the counts made of receipts where they are drawn: Sent's runs on Sent, the playbooks and Campaigns' 30 days on its composer, the lens on its page (S3-5); People and Campaigns' landing read none, and the Overview keeps it for the lens", async () => {
  // What an arrival earlier in this file let pass is read as a page comes back: leave and return once, to start clean.
  const away = async (from, to) => {
    for (const hash of [from, to]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
    }
  };
  // Sent's "N delivered" and the funnels' Delivered and Read stood still while a run's receipts came in, the page open.
  const want = {
    "#/clients": { now: THREADS, back: [] },
    "#/reports": { now: THREADS, back: ["reports_campaigns"] },
    // Campaigns lands on Sequences' list, which counts no receipt; its composer draws the counts made of them.
    "#/campaigns": { now: THREADS, back: [] },
    "#/campaigns/new": { now: ["campaign_results", ...THREADS, "playbooks"], back: [] },
    "#/broadcasts": { now: ["broadcasts", ...THREADS], back: [] },
    "#/reports/campaigns": { now: [...THREADS, "reports_campaigns"], back: [] },
  };
  for (const [hash, { now, back }] of Object.entries(want)) {
    win.location.hash = hash;
    // Campaigns' own 30 days are read on demand and again once aged (results-surface.ts, a period surface), and so is the Campaigns
    // lens's, which the Overview draws too, and the Calendar's campaign marks (runs-surface.ts), which the page this leaves for
    // draws: a read recorded holds nothing and would always say it has aged, so each is held fresh here, and what this asks is
    // what was kept.
    const r = await running({ fresh: ["campaign_results", "reports_campaigns", "calendar_runs"] });
    try {
      await away("#/calendar", hash);
      r.asked.length = 0;
      await r.change("messages", "UPDATE", "delivered");
      assert.deepEqual([...new Set(r.asked)].sort(), now, `${hash}: what a receipt reads there`);
      await r.change("messages", "UPDATE", "failed");
      assert.deepEqual(
        [...new Set(r.asked)].sort(),
        [...now, "today"].sort(),
        `${hash}: and Today, for a failure, which no count of receipts hears`,
      );
      r.asked.length = 0;

      await away("#/calendar", hash);
      assert.deepEqual([...new Set(r.asked)].sort(), back, `${hash}: what was kept for the page's return`);
    } finally {
      r.stop();
      win.location.hash = "#/today";
    }
  }
});

test("a surface hears a message's update only by naming its statuses: the threads' two surfaces their ticks, Today a failure, and the counts made of receipts the two they count", () => {
  const update = (status) => ({ table: "messages", event: "UPDATE", row: { status } });
  const statuses = ["received", "queued", "sent", "delivered", "read", "failed", "canceled"];
  // The statuses alone, whatever page is on screen: a surface heard on its page alone keeps the rest for it.
  const hears = (o) => statuses.filter((s) => wantsRefresh({ ...o, refreshWhen: undefined }, "messages", update(s)));
  const heard = Object.fromEntries(REAL.map((o) => [o.key, hears(o)]).filter(([, h]) => h.length));
  assert.deepEqual(heard, {
    broadcasts: ["delivered", "read"],
    campaign_results: ["delivered", "read"],
    conversations: ["sent", "delivered", "read", "failed", "canceled"],
    inbox: ["sent", "delivered", "read", "failed", "canceled"],
    playbooks: ["delivered", "read"],
    reports_campaigns: ["delivered", "read"],
    today: ["failed"],
  });
  // Those that count them wait for a run's receipts to quieten (receiptsQuietMs); the threads draw each tick as it comes.
  const quiet = Object.fromEntries(
    REAL.filter((o) => o.receiptsQuietMs !== undefined).map((o) => [o.key, o.receiptsQuietMs]),
  );
  assert.deepEqual(quiet, { broadcasts: 5_000, campaign_results: 5_000, playbooks: 5_000, reports_campaigns: 5_000 });
  // An arrival is heard as it was.
  const arrival = { table: "messages", event: "INSERT", row: {} };
  for (const key of ["inbox", "conversations", "today"])
    assert.equal(
      wantsRefresh(
        REAL.find((o) => o.key === key),
        "messages",
        arrival,
      ),
      true,
      `${key} hears an arrival`,
    );
});

test("the page on screen hears messages too, and a surface that let one pass is read once when its page comes back", async () => {
  win.location.hash = "#/clients";
  const r = await running();
  try {
    await r.message();
    assert.deepEqual([...r.asked].sort(), ["conversations", "inbox", "people", "today"], "People, on screen, follows");
    r.asked.length = 0;

    win.location.hash = "#/inbox";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(r.asked, [], "nothing was missed");
    await r.message();
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), ["conversations", "inbox", "today"]);
    r.asked.length = 0;

    win.location.hash = "#/reports";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["reports", "reports_campaigns"],
      "Reports let two messages pass, and is read once as it comes on screen, with the Campaigns read its Overview draws for one fact",
    );
    r.asked.length = 0;
    win.location.hash = "#/clients/pipeline";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(r.asked, ["people"], "and People, once, on its Pipeline");
    win.location.hash = "#/today";
    win.dispatchEvent({ type: "popstate" });
    win.location.hash = "#/clients";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["google", "people", "reports_headline", "today_pins"],
      "People once, as nothing passed it since; and what Today draws that a run that opened on People never read (they are on demand): the headline, Google's and the pinned lists' counts, once as Today came on screen",
    );
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("a surface's own tables reach it wherever the page is, and a thread's update reaches only the three", async () => {
  win.location.hash = "#/today";
  const r = await running();
  try {
    // A teammate's deal moves People's rows and the Pipeline: People's own table, heard off its page. And Setup's count of who can
    // receive an offer, which reads the deals, on the page its band is drawn (the wiring's second audit, S4-3).
    await r.change("deals", "UPDATE");
    // And the counts of the lists pinned here (R10): the deal lists are among them. And the reach-outs, live and cheap (they scan
    // no audience): a lead's deal won counts in a reach-out's People cell (00426).
    assert.deepEqual([...r.asked].sort(), ["people", "reach_outs", "setup", "today_pins"]);
    r.asked.length = 0;
    await r.change("conversations", "UPDATE");
    // A snooze or a pause: the three, and the pinned lists' counts (R10): who needs you is among them.
    assert.deepEqual(
      [...r.asked].sort(),
      ["conversations", "inbox", "today", "today_pins"],
      "a snooze or a pause: the three",
    );
  } finally {
    r.stop();
  }
});

test("Campaigns' landing hears what Sequences hears, and its composer owns what it draws but Sent's runs: a message re-reads Sequences' list there, and at the composer the playbooks and Campaigns' own 30 days too, never the broadcasts and every page of People behind them; what passed is read once as each comes back", async () => {
  win.location.hash = "#/campaigns";
  // Its own 30 days are read on demand and again once aged: held fresh, so what is asked is what a message moved.
  const r = await running({ fresh: ["campaign_results"] });
  try {
    await r.message();
    assert.deepEqual(
      [...r.asked].sort(),
      ["conversations", "inbox", "sequences", "today"],
      "its own list: not its sheets' numbers, the broadcasts, People, Reports or the Calendar (the phone review's Reads on landing)",
    );
    r.asked.length = 0;

    win.location.hash = "#/today";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["google", "reports_headline", "today_pins"],
      "nothing Today owns was missed; the headline, Google's and the pinned lists' counts, which Today draws and a run that opened on Campaigns never read, once",
    );
    r.asked.length = 0;
    await r.message();
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), [
      "conversations",
      "inbox",
      "reports_headline",
      "today",
      "today_pins",
    ]);
    r.asked.length = 0;

    win.location.hash = "#/campaigns";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["sequences"],
      "read once, as the list it draws comes back; nothing of its sheets'",
    );
    r.asked.length = 0;
    win.location.hash = "#/campaigns/new";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.deepEqual(
      [...r.asked].sort(),
      ["campaign_results", "playbooks"],
      "the composer opened reads once what passed it: its 30 days, never read, and the playbooks a message moved",
    );
    r.asked.length = 0;
    await r.message();
    assert.deepEqual(
      [...new Set(r.asked)].sort(),
      ["campaign_results", "conversations", "inbox", "playbooks", "sequences", "today"],
      "and at the composer's address its numbers and the list beneath it hear them",
    );
    // Sent's sheets are the broadcasts' page, beside Sequences' list: what passed them on Campaigns is read once as it comes on
    // screen, and it hears messages.
    r.asked.length = 0;
    win.location.hash = "#/broadcasts";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    assert.ok(r.asked.includes("broadcasts"), "the replies Campaigns let pass are read once on Sent");
    r.asked.length = 0;
    await r.message();
    assert.deepEqual([...new Set(r.asked)].sort(), ["broadcasts", "conversations", "inbox", "sequences", "today"]);
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("the Reviews lens hears the listing's tables only while it is on screen, and is read once as it comes back; no other page of Reports hears them", async () => {
  win.location.hash = "#/reports/reviews";
  // The Campaigns lens's read is a stranger here, held fresh: this asks what the Reviews lens hears and keeps, not what another lens ages.
  const r = await running({ fresh: ["reports_reviews", "reports_campaigns"] });
  try {
    // A review seen for the first time: the lens re-reads its own, and Google's own surface lets it pass, for the lens's read carries
    // Google's and publishes it (no second read of the same listing while the lens is open).
    await r.change("google_reviews", "INSERT");
    assert.deepEqual([...r.asked].sort(), ["reports_reviews"], "the lens on screen follows the listing, alone");
    for (const table of ["google_listings", "google_connections"]) {
      r.asked.length = 0;
      await r.change(table, "UPDATE");
      assert.equal(r.asked.includes("reports_reviews"), true, `${table}: heard on the lens`);
      assert.equal(r.asked.includes("google"), false, `${table}: and not by Google's own`);
    }
    r.asked.length = 0;

    // Elsewhere it is Google's surface alone that hears them, as it always did: the lens's read is left for its lens.
    for (const hash of ["#/reports", "#/reports/pipeline", "#/inbox"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("google_reviews", "INSERT");
      await r.change("google_reviews", "INSERT");
      assert.equal(r.asked.includes("reports_reviews"), false, `${hash}: the lens is not on screen`);
      assert.deepEqual([...new Set(r.asked)].sort(), ["google"], `${hash}: Google's own, as it was`);

      // And what passed is read once, when the lens comes back.
      r.asked.length = 0;
      win.location.hash = "#/reports/reviews";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(r.asked, ["reports_reviews"], `${hash}: read once as the lens came back`);
      r.asked.length = 0;
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      win.location.hash = "#/reports/reviews";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(r.asked, [], `${hash}: and once: the next arrival reads nothing new`);
    }

    // A message moves none of it: the lens counts reviews, not messages.
    await r.message();
    assert.equal(r.asked.includes("reports_reviews"), false, "a message is not a review");
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("the Receptionist lens hears messages, escalations and calls only while it is on screen, and is read once as it comes back; no other page of Reports hears them", async () => {
  win.location.hash = "#/reports/receptionist";
  const r = await running({ fresh: ["reports_receptionist"] });
  const lensReads = () => r.asked.filter((k) => k === "reports_receptionist");
  try {
    // A message, an escalation opened or resolved, a call starting or ending: the lens on screen re-reads its own.
    for (const [table, event] of [
      ["messages", "INSERT"],
      ["escalations", "INSERT"],
      ["escalations", "UPDATE"],
      ["calls", "INSERT"],
      // The people it reached are counted from the book, and "while you were closed" from the hours the settings hold (0047).
      ["contacts", "UPDATE"],
      ["tenant_config", "UPDATE"],
    ]) {
      r.asked.length = 0;
      await r.change(table, event);
      assert.deepEqual(lensReads(), ["reports_receptionist"], `${table} ${event}: heard on the lens`);
    }
    // A call ending is heard (Today repaints with it); a transcript turn of one in progress is not, by the lens or by Today.
    r.asked.length = 0;
    await r.change("calls", "UPDATE", "ended");
    assert.deepEqual(lensReads(), ["reports_receptionist"], "a call ending: heard on the lens");
    assert.equal(r.asked.includes("today"), true, "and by Today, as it was");
    for (let turn = 0; turn < 3; turn += 1) {
      r.asked.length = 0;
      await r.change("calls", "UPDATE", "ongoing");
      assert.deepEqual(
        lensReads(),
        [],
        "REGRESSION: a transcript turn re-read the lens every few seconds of a live call",
      );
      assert.equal(r.asked.includes("today"), false, "nor Today");
    }
    // It is told of no table it does not name: a review is the Reviews lens's, and a conversation's own row moves no figure here.
    for (const table of ["google_reviews", "conversations"]) {
      r.asked.length = 0;
      await r.change(table, "UPDATE");
      assert.deepEqual(lensReads(), [], `${table}: not the lens's`);
    }
    r.asked.length = 0;

    // Elsewhere it hears none of them, and what passed is read once, when the lens comes back.
    for (const hash of ["#/reports", "#/reports/pipeline", "#/reports/reviews", "#/inbox", "#/today"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("escalations", "INSERT");
      await r.change("calls", "UPDATE", "ended");
      await r.message();
      assert.deepEqual(lensReads(), [], `${hash}: the lens is not on screen`);

      r.asked.length = 0;
      win.location.hash = "#/reports/receptionist";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), ["reports_receptionist"], `${hash}: read once as the lens came back`);
      r.asked.length = 0;
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      win.location.hash = "#/reports/receptionist";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: and once: the next arrival reads nothing new`);
    }

    // A transcript turn heard away from the lens keeps nothing for it: the guard comes before the page rule, so it is not "missed".
    for (const hash of ["#/inbox", "#/today"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("calls", "UPDATE", "ongoing");
      await r.change("calls", "UPDATE", "ongoing");
      win.location.hash = "#/reports/receptionist";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: only turns passed, so nothing is read as the lens comes back`);
    }

    // And nothing here moves the Reviews lens's read: a review is the only thing it counts.
    win.location.hash = "#/reports/receptionist";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    r.asked.length = 0;
    await r.message();
    await r.change("escalations", "INSERT");
    assert.equal(r.asked.includes("reports_reviews"), false, "the Reviews lens counts reviews, not these");
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("the People lens hears messages, calls and notes only while it is on screen, and is read once as it comes back; no other page of Reports hears them", async () => {
  win.location.hash = "#/reports/people";
  const r = await running({ fresh: ["reports_people"] });
  const lensReads = () => r.asked.filter((k) => k === "reports_people");
  try {
    // A person writing or ringing, a note or a step written, changed or taken away: the lens on screen re-reads its own.
    for (const [table, event] of [
      ["messages", "INSERT"],
      ["calls", "INSERT"],
      ["person_notes", "INSERT"],
      ["person_notes", "UPDATE"],
      ["person_notes", "DELETE"],
      // The book, counted by what each person said and whether they can be reached (0047): the postal address, and the number, the
      // text line and the mailbox they are reached on.
      ["contacts", "INSERT"],
      ["contacts", "UPDATE"],
      ["tenant_config", "UPDATE"],
      ["tenant_channels", "UPDATE"],
      ["lines", "UPDATE"],
      ["mailboxes", "UPDATE"],
    ]) {
      r.asked.length = 0;
      await r.change(table, event);
      assert.deepEqual(lensReads(), ["reports_people"], `${table} ${event}: heard on the lens`);
    }
    // A call ending is heard; a transcript turn of one in progress is not, by the lens or by Today.
    r.asked.length = 0;
    await r.change("calls", "UPDATE", "ended");
    assert.deepEqual(lensReads(), ["reports_people"], "a call ending: heard on the lens");
    for (let turn = 0; turn < 3; turn += 1) {
      r.asked.length = 0;
      await r.change("calls", "UPDATE", "ongoing");
      assert.deepEqual(
        lensReads(),
        [],
        "REGRESSION: a transcript turn re-read the lens every few seconds of a live call",
      );
    }
    // A send's tick is no one reaching the business: a message's update is not heard.
    for (const status of ["sent", "delivered", "failed"]) {
      r.asked.length = 0;
      await r.change("messages", "UPDATE", status);
      assert.deepEqual(lensReads(), [], `a message ${status}: not the lens's`);
    }
    // It is told of no table it does not name: an escalation, a conversation's own row, a review.
    for (const table of ["escalations", "conversations", "google_reviews"]) {
      r.asked.length = 0;
      await r.change(table, "UPDATE");
      assert.deepEqual(lensReads(), [], `${table}: not the lens's`);
    }
    r.asked.length = 0;

    // Elsewhere it hears none of them, and what passed is read once, when the lens comes back.
    for (const hash of ["#/reports", "#/reports/receptionist", "#/reports/pipeline", "#/inbox", "#/today"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("person_notes", "INSERT");
      await r.change("calls", "UPDATE", "ended");
      await r.message();
      assert.deepEqual(lensReads(), [], `${hash}: the lens is not on screen`);

      r.asked.length = 0;
      win.location.hash = "#/reports/people";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), ["reports_people"], `${hash}: read once as the lens came back`);
      r.asked.length = 0;
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      win.location.hash = "#/reports/people";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: and once: the next arrival reads nothing new`);
    }

    // Over days a member picked it is the same lens, and hears the same.
    win.location.hash = "#/reports/people:2026-09-01~2026-09-20";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    r.asked.length = 0;
    await r.change("person_notes", "INSERT");
    assert.deepEqual(lensReads(), ["reports_people"], "over picked days: heard on the lens");

    // A transcript turn heard away from the lens keeps nothing for it: the guard comes before the page rule, so it is not "missed".
    for (const hash of ["#/inbox", "#/today"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("calls", "UPDATE", "ongoing");
      await r.change("calls", "UPDATE", "ongoing");
      win.location.hash = "#/reports/people";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: only turns passed, so nothing is read as the lens comes back`);
    }

    // And nothing here moves another lens's read: a review is the Reviews lens's, and the Receptionist lens counts escalations and holds.
    r.asked.length = 0;
    await r.message();
    await r.change("person_notes", "INSERT");
    assert.equal(r.asked.includes("reports_reviews"), false, "the Reviews lens counts reviews, not these");
    assert.equal(
      r.asked.includes("reports_receptionist"),
      false,
      "the Receptionist lens's is heard on its own lens alone",
    );
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("the Campaigns lens hears messages, conversations, escalations and runs only while it is on screen, and is read once as it comes back; the Overview, which draws it for one fact, hears none of them and keeps them for the lens; no other page of Reports hears them", async () => {
  win.location.hash = "#/reports/campaigns";
  // A read recorded holds nothing and would always say it has aged: held fresh, so what is asked is what a change moved or kept.
  const r = await running({ fresh: ["reports_campaigns"] });
  const lensReads = () => r.asked.filter((k) => k === "reports_campaigns");
  try {
    // A message, a conversation moved, an escalation opened or resolved, a run made or moved: the lens on screen re-reads its own.
    for (const [table, event] of [
      ["messages", "INSERT"],
      ["conversations", "UPDATE"],
      ["escalations", "INSERT"],
      ["escalations", "UPDATE"],
      ["sequence_batches", "INSERT"],
      ["sequence_batches", "UPDATE"],
      // A reach-out's reply read or undone, the number's standing and a sending domain.
      ["sequence_replies", "INSERT"],
      ["tenant_channels", "UPDATE"],
      ["mailbox_connections", "UPDATE"],
      // A person's answer: the yeses and stops it counts (the wiring's second audit, W-person-list-lead-8).
      ["contacts", "UPDATE"],
    ]) {
      r.asked.length = 0;
      await r.change(table, event);
      assert.deepEqual(lensReads(), ["reports_campaigns"], `${table} ${event}: heard on the lens`);
    }
    // A message delivered or read moves its funnel's Delivered and Read: heard on the lens (the wiring's second audit, S3-5). Sent
    // and a failure written late are the run's own rows, heard as a send: a message's tick of them moves no figure by itself.
    for (const status of ["delivered", "read"]) {
      r.asked.length = 0;
      await r.change("messages", "UPDATE", status);
      assert.deepEqual(lensReads(), ["reports_campaigns"], `a message ${status}: heard on the lens`);
    }
    for (const status of ["sent", "failed"]) {
      r.asked.length = 0;
      await r.change("messages", "UPDATE", status);
      assert.deepEqual(lensReads(), [], `a message ${status}: not the lens's`);
    }
    // A deal won is counted once in the reach-outs' report (00426), and a reach-out may write from the hosted mailbox (0056): both
    // the lens's, on the lens (reads-not-heard's owed, closed).
    for (const table of ["deals", "mailboxes"]) {
      r.asked.length = 0;
      await r.change(table, "UPDATE");
      assert.deepEqual(lensReads(), ["reports_campaigns"], `${table}: heard on the lens`);
    }
    // It is told of no table it does not name: a call (a call is the Receptionist's and the People lens's), a note, a review, a
    // line's saga; and a person made is no answer.
    for (const table of ["calls", "person_notes", "google_reviews", "lines"]) {
      r.asked.length = 0;
      await r.change(table, "UPDATE");
      assert.deepEqual(lensReads(), [], `${table}: not the lens's`);
    }
    r.asked.length = 0;
    await r.change("contacts", "INSERT");
    assert.deepEqual(lensReads(), [], "a person made: not the lens's");
    r.asked.length = 0;

    // Elsewhere it hears none of them, and what passed is read once, when the lens comes back.
    for (const hash of ["#/reports/receptionist", "#/reports/people", "#/reports/pipeline", "#/inbox", "#/today"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("escalations", "INSERT");
      await r.change("sequence_batches", "UPDATE");
      await r.message();
      assert.deepEqual(lensReads(), [], `${hash}: the lens is not on screen`);

      r.asked.length = 0;
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), ["reports_campaigns"], `${hash}: read once as the lens came back`);
      r.asked.length = 0;
      win.location.hash = "#/reports/pipeline";
      win.dispatchEvent({ type: "popstate" });
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: and once: the next arrival reads nothing new`);
    }

    // The Overview draws it for one fact: it reads it as it comes on screen and again when it has aged (on-demand-boot.test.mjs),
    // never for each burst; but the burst it did not read is kept for the lens, which would otherwise show the numbers the
    // Overview read on arrival, minutes old: the lens reads once as it comes on screen, and the next arrival reads nothing.
    for (const hash of ["#/reports", "#/reports/2026-09-01~2026-09-20"]) {
      win.location.hash = hash;
      win.dispatchEvent({ type: "popstate" });
      await settle();
      r.asked.length = 0;
      await r.change("escalations", "INSERT");
      await r.change("sequence_batches", "UPDATE");
      await r.message();
      await r.message();
      assert.deepEqual(lensReads(), [], `${hash}: the Overview does not hear a burst`);
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(
        lensReads(),
        ["reports_campaigns"],
        `${hash}: but the burst is kept for the lens: read once as the lens came on screen`,
      );
      r.asked.length = 0;
      win.location.hash = "#/reports/pipeline";
      win.dispatchEvent({ type: "popstate" });
      win.location.hash = "#/reports/campaigns";
      win.dispatchEvent({ type: "popstate" });
      await settle();
      assert.deepEqual(lensReads(), [], `${hash}: and once: the next arrival reads nothing new`);
    }

    // Over days a member picked it is the same lens, and hears the same.
    win.location.hash = "#/reports/campaigns:2026-09-01~2026-09-20";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    r.asked.length = 0;
    await r.change("escalations", "INSERT");
    assert.deepEqual(lensReads(), ["reports_campaigns"], "over picked days: heard on the lens");

    // And nothing here moves another lens's read: the People lens counts calls and notes, the Receptionist lens escalations and calls.
    win.location.hash = "#/reports/campaigns";
    win.dispatchEvent({ type: "popstate" });
    await settle();
    r.asked.length = 0;
    await r.message();
    await r.change("escalations", "INSERT");
    for (const key of ["reports_reviews", "reports_receptionist", "reports_people"])
      assert.equal(r.asked.includes(key), false, `${key} is heard on its own lens alone`);
  } finally {
    r.stop();
    win.location.hash = "#/today";
  }
});

test("the page that owns what it draws is an explicit one: the surface registry names Campaigns' composer, Today's headline and Reports' Reviews, Receptionist, People and Campaigns lenses, and no other page's draws are owned", async () => {
  const owns = (key, route) => registry.ownsTheScreen(key, route);
  // Reports owns what it names for a lens, and that lens alone: Reviews' read, and no other of its pages or lenses.
  assert.equal(owns("reports_reviews", "reports/reviews"), true);
  for (const route of ["reports", "reports/pipeline", "reports/campaigns", "today", "campaigns"])
    assert.equal(owns("reports_reviews", route), false, `${route} does not own the Reviews lens's read`);
  assert.equal(owns("reports", "reports/reviews"), true, "and the page's own surface is still its own");
  assert.equal(owns("reports_headline", "reports/reviews"), false, "while what Today draws is not drawn there");
  // The Receptionist lens's, the same way, and the two lenses' reads are not each other's.
  assert.equal(owns("reports_receptionist", "reports/receptionist"), true);
  for (const route of ["reports", "reports/pipeline", "reports/campaigns", "reports/reviews", "today", "campaigns"])
    assert.equal(owns("reports_receptionist", route), false, `${route} does not own the Receptionist lens's read`);
  assert.equal(owns("reports_reviews", "reports/receptionist"), false, "the Reviews lens's read is not drawn there");
  assert.equal(owns("reports", "reports/receptionist"), true, "and the page's own surface is still its own");
  assert.equal(owns("reports_headline", "reports/receptionist"), false, "while what Today draws is not drawn there");
  // The People lens's, the same way, and none of the three lenses' reads is another's.
  assert.equal(owns("reports_people", "reports/people"), true);
  assert.equal(owns("reports_people", "reports/people:2026-09-01~2026-09-20"), true, "over picked days it is the lens");
  for (const route of [
    "reports",
    "reports/pipeline",
    "reports/campaigns",
    "reports/reviews",
    "reports/receptionist",
    "today",
    "campaigns",
  ])
    assert.equal(owns("reports_people", route), false, `${route} does not own the People lens's read`);
  for (const key of ["reports_reviews", "reports_receptionist", "reports_headline"])
    assert.equal(owns(key, "reports/people"), false, `${key} is not drawn on the People lens`);
  assert.equal(owns("reports", "reports/people"), true, "and the page's own surface is still its own");
  // The Campaigns lens's, the same way; and the Overview draws it for the one fact it says from it, so it owns the screen for it too.
  assert.equal(owns("reports_campaigns", "reports/campaigns"), true);
  assert.equal(
    owns("reports_campaigns", "reports/campaigns:2026-09-01~2026-09-20"),
    true,
    "over picked days it is the lens",
  );
  for (const route of ["reports", "reports/2026-09-01~2026-09-20"])
    assert.equal(owns("reports_campaigns", route), true, `${route}: the Overview draws it for one fact`);
  for (const route of [
    "reports/pipeline",
    "reports/reviews",
    "reports/receptionist",
    "reports/people",
    "today",
    "campaigns",
  ])
    assert.equal(owns("reports_campaigns", route), false, `${route} does not own the Campaigns lens's read`);
  for (const key of ["reports_reviews", "reports_receptionist", "reports_people", "reports_headline"])
    assert.equal(owns(key, "reports/campaigns"), false, `${key} is not drawn on the Campaigns lens`);
  assert.equal(owns("reports", "reports/campaigns"), true, "and the page's own surface is still its own");
  // The composer owns the playbooks and Campaigns' 30 days it draws; Campaigns' landing, Sequences' list, owns neither.
  for (const key of ["playbooks", "campaign_results"]) {
    assert.equal(owns(key, "campaigns/new:every"), true, key);
    assert.equal(owns(key, "campaigns"), false, `Campaigns' landing does not own ${key}`);
  }
  assert.equal(owns("playbooks", "campaigns/message:hello"), true, "a message's drawer waits for the playbooks");
  // Sent's runs are drawn in the composer for who can hear you, the pause on offers and the send-once composer: owned there for
  // what moves those (a cell of kinds), and left to Sent for a message, which moves a run's replies.
  assert.equal(owns("broadcasts", "campaigns/new"), true, "Sent's runs are drawn in the composer, for some kinds");
  assert.equal(owns("broadcasts", "campaigns"), false, "and not on Campaigns' landing");
  assert.equal(
    registry.ownsTable("broadcasts", "contacts", "campaigns/new"),
    true,
    "a person's answer moves who can hear you",
  );
  assert.equal(registry.ownsTable("broadcasts", "messages", "campaigns/new"), false, "a message is re-read on Sent");
  assert.equal(
    registry.ownsTable("broadcasts", "segments", "campaigns/new"),
    true,
    "a list To offers moves who can hear you",
  );
  // Settings is drawn there whole: a message's drawer is the Library's pane, which says what sends it (the playbooks and runs its
  // read joins: W-campaign-run-template-reachout-2), as the Library itself does; and Sequences' step editor offers its messages.
  for (const route of ["campaigns", "campaigns/message:hello", "messages"])
    assert.equal(
      registry.ownsTable("settings", "sequence_batches", route),
      true,
      `a run moves what sends a message, on ${route}`,
    );
  assert.equal(registry.ownsTable("settings", "sequence_batches", "today"), false, "and is kept for them elsewhere");
  // The reach-outs are drawn on the home too; they have no table of their own to refresh on a message, but a route that
  // draws them owns them for the refreshes that name a page. Settings is drawn there again: the templates a composer offers
  // and the Library counts are the settings read's, the one read of them (surfaces/offered-templates.ts).
  assert.equal(owns("reach_outs", "campaigns/new"), true);
  assert.equal(owns("settings", "campaigns/new"), true);
  for (const key of ["people", "reports", "calendar"]) assert.equal(owns(key, "campaigns"), false, key);
  // Today draws a good many surfaces and owns its own, the headline its period line and Worth a look are printed from (it hears the
  // feed there, a long wait later: reports/headline.ts), the replies to a reach-out its queue draws, and the setup band, which hears
  // what its rows state there (the wiring's second audit, S4-3; a message only while the first WhatsApp message is awaited). And
  // People's person alone: its rows are the steps due and Worth a look's names there (W-visit-deal-5); a message is not People's.
  for (const key of ["broadcasts", "reports", "playbooks", "calendar", "notifications", "live", "google"])
    assert.equal(owns(key, "today"), false, `today does not own ${key}`);
  assert.equal(owns("today", "today"), true);
  for (const key of ["reports_headline", "reach_out_replies", "setup", "people"])
    assert.equal(owns(key, "today"), true, key);
  assert.equal(registry.ownsTable("people", "contacts", "today"), true, "People's person on Today");
  assert.equal(registry.ownsTable("people", "messages", "today"), false, "and none of what a message moves");
  for (const route of ["inbox", "clients", "calendar", "campaigns", "reports"])
    assert.equal(owns("reports_headline", route), false, `${route} does not own the headline`);
  assert.equal(owns("broadcasts", "broadcasts/run:b-1"), true);
});

/* ------------------------------- the shell's draws ------------------------------- */

// app-shell.jsx on a stub React that counts what would make React draw it again: a setter that changed its value, or
// a store the component reads that said it moved.
let cells = {};
let redraws = 0;
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  Component: class {},
  createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        const was = cells[k];
        cells[k] = typeof v === "function" ? v(was) : v;
        if (!Object.is(was, cells[k])) redraws += 1;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        const was = cells[k];
        cells[k] = red(was, a);
        if (!Object.is(was, cells[k])) redraws += 1;
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (prev && deps && prev.deps && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: fn() };
  },
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = frames.key();
    const prev = cells[k];
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = {
      cleanup: subscribe(() => {
        redraws += 1;
      }),
    };
    return snapshot();
  },
};
globalThis.useSurface = status.surfaceHook(globalThis.React, registry.routeSurfaces);
for (const name of ["Sidebar", "Topbar", "LiveCallBar", "ShellStatusBar", "SurfaceTabs", "AskBar", "ShortcutsSheet"])
  globalThis[name] = name;
registry.installRouteGate();
registry.installSurfaceRegistry();
win.drawRoute = (r) => ({
  activeNav: r.page,
  crumbs: [r.page],
  pane: false,
  primaryAction: null,
  content: null,
  mountKey: r.routeKey,
});
await import("../../../../../apps/dashboard/src/legacy/pages/app-shell.jsx");

/** The shell at `hash`, drawn: the redraws it would ask for from here on are counted. */
function shellAt(hash) {
  // The last shell goes, as React unmounts it: what it heard is let go.
  for (const c of Object.values(cells)) if (c && typeof c.cleanup === "function") c.cleanup();
  cells = {};
  win.location.hash = hash;
  frames.begin();
  win.ChanlyticsApp({ theme: "light", themePref: "light", sidebar: "open", onSidebar() {}, onTheme() {} });
  redraws = 0;
}
/** A read of `key` landing, as the seam lands one: its event, then its status (still live). */
function lands(key) {
  const o = REAL.find((x) => x.key === key);
  for (const e of o.events ?? []) win.dispatchEvent({ type: e });
  status.setStatus(key, "live");
}

test("REGRESSION: the three reads of a message draw the shell once on Today and not at all on a page that draws none of them -- it drew seven times", () => {
  const off = status.hearSurfaces(REAL, win);
  for (const o of REAL) status.setStatus(o.key, "live");
  let told = 0;
  const offStatus = status.onSurfaceStatusChange(() => {
    told += 1;
  });
  try {
    shellAt("#/today");
    for (const key of ["conversations", "inbox", "today"]) lands(key);
    assert.equal(redraws, 1, "Today draws from its own surface; the Inbox's and Conversations' reads are not its");
    assert.equal(told, 0, "a live surface read again and still live tells no status listener: LegacyApp drew on each");

    shellAt("#/calendar");
    for (const key of ["conversations", "inbox", "today"]) lands(key);
    assert.equal(redraws, 0, "the Calendar draws none of them");
    lands("calendar");
    assert.equal(redraws, 1, "its own read draws it");
    lands("people");
    assert.equal(
      redraws,
      1,
      "and not People's: a visit's person comes with the board's own read (the Calendar's lane D)",
    );

    shellAt("#/inbox");
    lands("conversations");
    assert.equal(redraws, 1, "the Inbox draws a call from Conversations' read");
    status.setStatus("inbox", "degraded");
    assert.equal(redraws, 2, "a status that changed is news for the route whose surface it is");
    assert.equal(told, 1, "and for the line under the top bar");
    status.setStatus("inbox", "degraded");
    assert.equal(redraws, 2, "the same status again is not");
    status.setStatus("inbox", "live");
  } finally {
    off();
    offStatus();
  }
});

/* ------------------------------- landmarks and where focus goes ------------------------------- */

const nodesOf = (tree, keep, out = []) => {
  if (!tree || typeof tree !== "object") return out;
  if (keep(tree)) out.push(tree);
  for (const k of [tree.props?.children ?? []].flat(Infinity)) nodesOf(k, keep, out);
  return out;
};

test("the page is a main landmark with a way past the bars to it, and a move to another page puts focus on it once it has drawn", () => {
  const off = status.hearSurfaces(REAL, win);
  for (const o of REAL) status.setStatus(o.key, "live");
  const keep = globalThis.document;
  const focused = [];
  const put = (name) => ({
    name,
    attrs: {},
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    focus() {
      focused.push(name);
    },
  });
  const heading = put("its heading");
  const inside = put("a field on the page");
  const region = {
    ...put("the region"),
    contains: (n) => n === region || n === inside || n === heading,
    querySelector: () => heading,
  };
  globalThis.document = {
    ...keep,
    body: {},
    activeElement: null,
    getElementById: (id) => (id === "main" ? region : null),
  };
  const props = { theme: "light", themePref: "light", sidebar: "open", onSidebar() {}, onTheme() {} };
  const draw = () => {
    frames.begin();
    return win.ChanlyticsApp(props);
  };
  const goTo = (hash) => {
    win.location.hash = hash;
    win.dispatchEvent({ type: "popstate" });
    return draw();
  };
  try {
    cells = {};
    win.location.hash = "#/today";
    let tree = draw();
    const mains = nodesOf(tree, (n) => n.type === "main");
    assert.equal(mains.length, 1, "one main landmark");
    assert.equal(mains[0].props.id, "main");
    assert.ok(mains[0].props.className.includes("route-view"), "the page's own region, where it always was");
    assert.deepEqual(focused, [], "the page the tab opened on is where focus starts");
    const [skip] = nodesOf(tree, (n) => n.type === "button" && String(n.props.className).includes("skip-link"));
    assert.ok(skip, "a way past the sidebar and the bars, the first thing in the app");
    assert.equal(
      nodesOf(tree, (n) => n.type === "div" && String(n.props.className).includes("app-root"))[0].props.children.flat(
        Infinity,
      )[0],
      skip,
      "the first stop for Tab",
    );

    tree = goTo("#/calendar");
    assert.deepEqual(focused, ["its heading"], "another page: focus goes to its heading, as a page load would");
    assert.equal(heading.attrs.tabindex, "-1", "made focusable for it");

    focused.length = 0;
    globalThis.document.activeElement = inside;
    tree = goTo("#/inbox");
    assert.deepEqual(focused, [], "never from where the person is already working inside the page");

    globalThis.document.activeElement = null;
    tree = goTo("#/inbox");
    assert.deepEqual(focused, [], "the same page again is not a move");
    tree = goTo("#/today");
    assert.deepEqual(focused, ["its heading"], "from the sidebar, or the address, it is");

    // A move within a page -- a thread opened in the Inbox, which changes the address and not the page -- reads nothing out.
    focused.length = 0;
    globalThis.document.activeElement = null;
    tree = goTo("#/inbox");
    assert.deepEqual(focused, ["its heading"], "another page: its heading");
    focused.length = 0;
    tree = goTo("#/inbox/th-1");
    tree = goTo("#/inbox/th-2");
    assert.deepEqual(focused, [], "a thread opened, and another: the same page, not read out again");

    focused.length = 0;
    globalThis.document.activeElement = inside;
    const [pressed] = nodesOf(draw(), (n) => n.type === "button" && String(n.props.className).includes("skip-link"));
    pressed.props.onClick();
    assert.deepEqual(
      focused,
      ["its heading"],
      "the skip link is asked for, so it takes focus even from inside the page",
    );
  } finally {
    globalThis.document = keep;
    off();
    win.location.hash = "#/today";
  }
});

test("every surface a page names to useSurface is a real one: a key that is no override's (the People's event is 'clients', its key 'people') redraws nothing", async () => {
  const { parse, repoFiles } = await import("../../_ast.mjs");
  const ts = (await import("typescript")).default;
  const real = new Set(REAL.map((o) => o.key));
  const named = [];
  for (const file of repoFiles(["apps/dashboard/src/legacy"], { keep: /.jsx$/ })) {
    if (file.includes("/legacy/demo/")) continue;
    const sf = parse(file);
    const visit = (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === "useSurface" &&
        n.arguments[0]
      ) {
        const arg = n.arguments[0];
        const literals = ts.isStringLiteral(arg) ? [arg] : ts.isArrayLiteralExpression(arg) ? arg.elements : [];
        for (const l of literals) if (ts.isStringLiteral(l)) named.push([file, l.text]);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  // Twelve pages of the shell named a surface until Reports, the Inbox, Today and People left it: a TSX surface names its key
  // through the typed useSurface, which the compiler holds to a real key; what the shell still draws is what this reads.
  assert.ok(named.length >= 1, `the scan found ${named.length} names; it has stopped seeing the pages`);
  assert.deepEqual(
    named.filter(([, key]) => !real.has(key)),
    [],
    "name the surface's key (an override's `key`), not its event",
  );
});

test("a run's receipts are read once they quieten where they are counted, and at most half a minute from the first; a reply among them is read at its own pace (S3-5)", async (t) => {
  win.location.hash = "#/broadcasts";
  const r = await running({ debounceMs: 400, realReceipts: true });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };
  const sent = () => r.asked.filter((k) => k === "broadcasts").length;
  try {
    // A run's receipts, one every 300 ms for six seconds: Sent's runs are not read while they come.
    for (let ms = 0; ms < 6_000; ms += 300) {
      r.change("messages", "UPDATE", "delivered");
      t.mock.timers.tick(300);
      await flush();
    }
    assert.equal(sent(), 0, "not once per receipt, nor every twelve seconds of a stream");
    t.mock.timers.tick(5_000);
    await flush();
    assert.equal(sent(), 1, "once they have quietened for five seconds");
    // A stream that does not stop is read half a minute after its first receipt.
    for (let ms = 0; ms < 31_000; ms += 300) {
      r.change("messages", "UPDATE", "read");
      t.mock.timers.tick(300);
      await flush();
    }
    assert.equal(sent(), 2, "and at most half a minute from the first while they keep coming");
    t.mock.timers.tick(5_000);
    await flush();
    // A reply is no receipt: it is read at Sent's own pace, whatever receipts came before it.
    const before = sent();
    r.change("messages", "UPDATE", "read");
    t.mock.timers.tick(100);
    r.change("messages", "INSERT");
    t.mock.timers.tick(500);
    await flush();
    assert.equal(sent(), before + 1, "a reply among the receipts is read at once");
  } finally {
    t.mock.timers.reset();
    r.stop();
  }
});

test("a steady stream of notices still repaints: a refresh waits for a pause, but never more than a few seconds", async (t) => {
  // Every receipt of a broadcast is its own notice (00327), each a few hundred milliseconds apart. Each one re-armed the
  // Inbox's wait from the start, so while the receipts came, a customer's new message did not reach the open Inbox.
  win.location.hash = "#/inbox";
  const r = await running({ debounceMs: 400 });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };
  for (let ms = 0; ms < 6_000; ms += 300) {
    r.change("messages", "UPDATE", "delivered");
    t.mock.timers.tick(300);
    await flush();
  }
  const inbox = () => r.asked.filter((k) => k === "inbox").length;
  assert.ok(inbox() >= 1, "REGRESSION: six seconds of receipts, and the Inbox was never read again");
  assert.ok(inbox() <= 3, `a read every few seconds, not one per receipt: ${inbox()}`);
  t.mock.timers.reset();
  r.stop();
});
