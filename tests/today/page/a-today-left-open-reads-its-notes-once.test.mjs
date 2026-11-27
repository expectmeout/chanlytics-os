/**
 * A Today left open reads each of its two notes once, Cold email's line and Content's, and again only once Today's own
 * read has landed after it: something the frame heard, a write read again, the heal, the day's turn, the tab come back.
 * The clock makes the day again each minute from what it holds and asks the server nothing, and both cards read
 * themselves again on every move of the day, at most once a minute: a tab left open in front read the notes once or
 * twice in two minutes for nothing, 17 database calls a minute against the nightly's line of 12 (run 45931523493,
 * 27 Nov 2026). Drawn by the real cards on the stub React, over Today's real surface and its real read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, unmount, byTestId } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEARCH = "44444444-4444-4444-8444-444444444444";
/** Every request the page sent, by its path and in order; and each note asked while nobody looked at the page. */
const asked = [];
const askedHidden = [];
/** Whether nobody looks at the page, as the bridge says it once it is in (hearing/front.ts pageHidden). */
let hiddenNow = () => false;
bridgeHolds({
  who: {
    workspaces: [{ id: T, slug: "harbor", name: "Brightline", status: "active", timezone: "America/Chicago" }],
    activeWorkspaceId: T,
  },
});
/** What GET content/note answers: a video the week made, so the card has a line to draw. */
const week = {
  week: [
    {
      file: {
        id: "made-1",
        kind: "video",
        status: "filed",
        source: "made",
        name: "long-layers",
        bytes: 1000,
        width: 1080,
        height: 1920,
        seconds: 11,
        media_status: "ready",
        sound_said: null,
        shows: null,
        who_in_it: "not_asked",
        people: null,
        look_status: "done",
        line: null,
        issues: [],
        looks_like_stock: false,
        looks_like: null,
        created_at: new Date().toISOString(),
      },
      posts: [],
    },
  ],
  making: [],
  ready: null,
  stopped: null,
};
/** What GET today answers: a quiet working day, read in the workspace's zone. */
const metrics = {
  workspace: { name: "Brightline", timezone: "America/Chicago", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+13055550101" }],
  window: {
    days: 1,
    since: "2026-11-27T06:00:00Z",
    since_local: "2026-11-27T00:00:00",
    now_local: "2026-11-27T09:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};
const day = { metrics, conversations: [], escalations: [], calls: [], searches: [{ id: SEARCH, name: "Clinics" }] };
const answerOf = (path) =>
  path.endsWith("/content/note")
    ? { today: week }
    : path.endsWith("/settings/reach-out/note")
      ? { note: { headline: "The mailbox needs reconnecting", act: "Reconnect", to: "admin/integrations" } }
      : { read: day };
installStubReact({
  location: { pathname: "/w/harbor/", hash: "", search: "", origin: "https://app.chanlytics.com" },
  fetch: (url) => {
    const path = new URL(String(url), "https://app.chanlytics.com").pathname;
    asked.push(path);
    if (path.endsWith("/note") && hiddenNow()) askedHidden.push(path);
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, data: answerOf(path) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  },
});
const S = "../../../apps/dashboard/src";
const { createElement } = globalThis.React;
const { TodayContentLine } = await import(`${S}/surfaces/today/content-note.tsx`);
const { ColdEmailLine, useColdEmailNote } = await import(`${S}/surfaces/today/zones/cold-email-note.tsx`);
const { todayOverride } = await import(`${S}/surfaces/today/override.ts`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { pageHidden, setPageBehind } = await import(`${S}/bridge/hearing/front.ts`);
hiddenNow = pageHidden;
const { clearReadCaches } = await import(`${S}/bridge/read-cache.ts`);
const { api } = await import(`${S}/bridge/api.ts`);
const { MIN_MS, PREFETCH_SLOT } = await import("@chanlytics/contracts");

/** The two cards as Today draws them beside the day. */
function Notes() {
  const note = useColdEmailNote();
  return createElement(
    "div",
    null,
    note ? createElement(ColdEmailLine, { note }) : null,
    createElement(TodayContentLine),
  );
}
const draw = () => again(() => createElement(Notes));
const readsOf = (path) => asked.filter((p) => p === `/api/v1/${path}`).length;
const notes = () => ({ content: readsOf("content/note"), coldEmail: readsOf("settings/reach-out/note") });
/** Today's own read, through its surface as the runner asks it: what a notice of the feed, the heal or a return reads. */
const dayRead = () => todayOverride.apply();

/** How far the page's clock is moved on; its timers are the test's, moved on with it (`on`). */
let shift = 0;
const realNow = Date.now;
Date.now = () => realNow() + shift;
const on = (t, ms) => {
  shift += ms;
  t.mock.timers.tick(ms);
};

/** The cards drawn on a Today that holds nothing: each asks its note once, and both lines stand. */
async function drawnOnToday(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  asked.length = 0;
  askedHidden.length = 0;
  clearReadCaches();
  api().forget();
  fresh();
  draw();
  await until(() => byTestId(draw(), "today-cold-email") && byTestId(draw(), "today-content"), "both lines drawn");
  assert.deepEqual(notes(), { content: 1, coldEmail: 1 }, "each note asked once as the cards are drawn");
  t.after(() => {
    unmount();
    setSurfaceValue("today", undefined);
    setPageBehind(false);
  });
}

/** A minute and a hair on, by the page's clock and its timers. */
const aMinuteOn = (t) => on(t, MIN_MS + 50);

/** Both notes asked as often as this, once each has been: what the cards have asked by then, nothing waiting behind it. */
const bothAsked = (n, what) => until(() => notes().content >= n && notes().coldEmail >= n, what);

test("a Today left open reads each note once: the clock making the day again each minute asks neither again", async (t) => {
  await drawnOnToday(t);
  // Today's read is in, and what it holds the clock makes the day again from at each minute's turn (hearing/clock.ts):
  // a new day is published (surface.ts publishToday) and the page that draws it is drawn again, with no read.
  for (let minute = 1; minute <= 3; minute += 1) {
    aMinuteOn(t);
    setSurfaceValue("today", { remade: minute });
    draw();
  }
  assert.equal(readsOf("today"), 0, "the clock asks the server for nothing itself");
  // A minute on, Today's own read lands: the one read of each note since they were drawn.
  aMinuteOn(t);
  await dayRead();
  draw();
  await bothAsked(2, "each note asked again behind Today's own read");
  assert.deepEqual(
    notes(),
    { content: 2, coldEmail: 2 },
    "REGRESSION (27 Nov 2026): the cards read again on every move of the day, the clock's remake among them: 17 database calls a minute from a quiet tab",
  );
});

test("Today's own read landing a minute on asks each note again, once; one landing inside the minute is asked as it ends", async (t) => {
  await drawnOnToday(t);
  aMinuteOn(t);
  await dayRead();
  draw();
  await bothAsked(2, "each note asked again");
  assert.equal(readsOf("today"), 1, "behind the one read of the day");
  // Heard again ten seconds on: what Today heard may be the notes' too (a mailbox, a run), so it waits for the minute.
  on(t, 10_000);
  await dayRead();
  draw();
  on(t, MIN_MS - 10_000);
  await bothAsked(3, "asked as the minute ends, never let go");
  assert.deepEqual(notes(), { content: 3, coldEmail: 3 }, "and never twice in that minute");
  // Three minutes with nothing heard, then Today's own read: one read of each, so the minutes between asked nothing.
  for (let minute = 1; minute <= 3; minute += 1) aMinuteOn(t);
  await dayRead();
  draw();
  await bothAsked(4, "asked behind the next read of the day");
  assert.deepEqual(notes(), { content: 4, coldEmail: 4 }, "nothing asked while nothing was heard");
});

test("the load's own read of the day, which the document's head started beside the notes, asks them nothing more", async (t) => {
  await drawnOnToday(t);
  aMinuteOn(t);
  globalThis[PREFETCH_SLOT] = { "/api/v1/today?workspace=harbor": globalThis.fetch("/api/v1/today?workspace=harbor") };
  try {
    await dayRead();
  } finally {
    delete globalThis[PREFETCH_SLOT];
  }
  draw();
  // A minute on, Today's own read lands: had the load's asked them, this one would be the third read of each.
  aMinuteOn(t);
  await dayRead();
  draw();
  await bothAsked(2, "each note asked behind the read after the load's");
  assert.deepEqual(notes(), { content: 2, coldEmail: 2 }, "the cards read with the load, so its read is theirs");
});

test("a note due while nobody looks at the page is asked as it comes in front", async (t) => {
  await drawnOnToday(t);
  setPageBehind(true);
  aMinuteOn(t);
  await dayRead();
  draw();
  on(t, MIN_MS);
  setPageBehind(false);
  await bothAsked(2, "asked as the page comes in front");
  assert.deepEqual(notes(), { content: 2, coldEmail: 2 });
  assert.deepEqual(askedHidden, [], "a hidden tab reads nothing for nobody");
});
