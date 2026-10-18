/**
 * A bell row's news is heard where it is drawn (decision 0058; the wiring's second audit, S10-8, which retired task 1.2 of the wiring
 * plan, docs/decisions/0047).
 *
 * The server rings the bell for the changes it most wants an owner to see, and each row's button opens the page that is about it. Some
 * of those changes were written to tables the live feed did not tell (a held booking email, the people a calendar read made, a stop by
 * the unsubscribe link, the gates pausing offers by email), so a new row of those kinds read the surfaces it was about itself
 * (notice-re-reads.ts). Every one of those tables is told now (00408) and heard by the pages that draw it, so the row read them a second
 * time, after the feed (S10-8: the Inbox twice, People three times, Campaigns three, the Calendar once). The bell reads its rows and
 * nothing else.
 *
 * Run on the real bell surface and the real runner, over the real overrides of the pages a row opens (their reads recorded), and each
 * page's own rule for what it hears where (wantsRefresh), and for what it reads as it comes on screen (readWhatWasMissed).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { SERVER_NOTIFICATION_KINDS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** What the bell's read answers. */
let served = [];
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const route = u.pathname.replace("/api/v1/", "");
  if (route === "notifications") return json(200, { ok: true, data: { notifications: served, seen_at: null } });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { startSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { readWhatWasMissed } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { notificationsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/notifications.ts");
const { settingsOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surfaces/settings.ts");
const { inboxOverride } = await importSrc("apps/dashboard/src/surfaces/inbox/surface.ts");
const { calendarOverride } = await importSrc("apps/dashboard/src/surfaces/calendar/surface.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
const { broadcastsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/surface.ts");
const { audiencesOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/broadcasts/audiences-surface.ts");
const { personOverride } = await importSrc("apps/dashboard/src/surfaces/people/people-detail.ts");
const { channelsOverride } = await importSrc("apps/dashboard/src/surfaces/channels/surface.ts");

/** The surfaces the pages a row opens draw it from. */
const DRAWN = [
  settingsOverride,
  inboxOverride,
  calendarOverride,
  peopleOverride,
  playbooksOverride,
  broadcastsOverride,
  audiencesOverride,
];
const byKey = Object.fromEntries([...DRAWN, personOverride, channelsOverride].map((o) => [o.key, o]));

/** Turns of the loop for a read fired and not waited for to be made and answered. */
const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const at = (hash) => {
  globalThis.location.hash = hash;
};

/** The runner, with a surface of no interest so it reads nothing of the bell's until the test does. */
const stop = startSurfaces([{ key: "nothing-in-particular", apply: async () => {} }], () => () => {});
await flush();
after(() => stop());

let seq = 0;
const NOW = Date.parse("2026-10-11T12:00:00Z");
/** One kept row, as GET notifications answers it. */
const row = (kind, route = null) => ({
  id: `n-${(seq += 1)}`,
  kind,
  title: `A ${kind} row`,
  body: "",
  route,
  subject_type: null,
  subject_id: null,
  created_at: new Date(NOW + seq * 1000).toISOString(),
  read: false,
  dismissed: false,
});

/** The pages' surfaces, each read recorded in place of the read, until the test ends. Answers the list of keys read since. */
function recording(t) {
  const read = [];
  for (const o of DRAWN) {
    o.apply.mock?.restore();
    t.mock.method(o, "apply", async () => void read.push(o.key));
  }
  return read;
}

/** What each of these pages reads as it comes on screen, from what was kept for it: each move is news. */
function owedOnArrival(routes) {
  const win = {
    location: globalThis.location,
    addEventListener(_t, fn) {
      this.on = fn;
    },
    removeEventListener() {},
  };
  const read = [];
  at("#/__nowhere");
  const stopHearing = readWhatWasMissed(DRAWN, (keys) => read.push(...keys), win);
  const owed = {};
  try {
    for (const hash of routes) {
      at(hash);
      read.length = 0;
      win.on?.();
      owed[hash] = [...read];
    }
  } finally {
    stopHearing();
    at("#/today");
  }
  return owed;
}
/** Every page these surfaces own, so what was kept for one is read and the next test starts owing nothing. */
const drain = () =>
  owedOnArrival([
    "#/messages",
    "#/inbox",
    "#/calendar",
    "#/clients",
    "#/campaigns",
    "#/campaigns/new",
    "#/outbound",
    "#/broadcasts",
  ]);

/**
 * What each kind the edge keeps announces, and who hears it. For the kinds whose table the trace followed: the change the row is about,
 * and the pages that draw it, each with the surface that hears it there. For the rest: why nothing more is said. A kind the edge adds
 * without a line here is a red build.
 */
const ANNOUNCES = {
  // A template's verdict: the settings read, the one read of the templates, hears it on every page; the Library, the Inbox's reply box
  // and both composers are made of that read.
  template_ready: {
    change: ["templates", "UPDATE"],
    heard: [["settings", ["#/messages", "#/inbox", "#/campaigns", "#/today"]]],
  },
  template_blocked: {
    change: ["templates", "UPDATE"],
    heard: [["settings", ["#/messages", "#/inbox", "#/campaigns", "#/today"]]],
  },
  // A booking email held for a look: the board, and Settings > Business, which lists the held emails from the board's read.
  booking_notice: {
    change: ["appointment_notices", "INSERT"],
    heard: [["calendar", ["#/calendar", "#/admin/workspace", "#/today"]]],
  },
  // The people the hourly calendar read made: People's list, on its page.
  calendar_people: { change: ["contacts", "INSERT"], heard: [["people", ["#/clients"]]] },
  // A stop by the unsubscribe link, a complaint or a carrier: the Inbox's composer, People's Offers column, the composers' audiences,
  // and the board's "Text the link".
  opted_out: {
    change: ["contacts", "UPDATE"],
    heard: [
      ["inbox", ["#/inbox", "#/today"]],
      ["people", ["#/clients"]],
      ["audiences", ["#/broadcasts", "#/campaigns/new"]],
      ["playbooks", ["#/outbound"]],
      ["calendar", ["#/calendar", "#/today"]],
      // The person's own page, where the row's button may open: their surface hears them changed there.
      ["person", ["#/clients/0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f"]],
    ],
  },
  // Offers by email paused by the gates: the composers' head line and Send by tick. A sweep row that opens Connections is a
  // connected mailbox held or signed out, which Connections hears (mailbox_connections, Setup's `always` channel kind).
  sweep: {
    change: ["mailboxes", "UPDATE"],
    heard: [
      ["broadcasts", ["#/broadcasts", "#/campaigns/new"]],
      ["playbooks", ["#/outbound"]],
    ],
  },
  handoff: "The Inbox, which the row opens, hears the escalation and the message.",
  deadman: "The Inbox, which the row opens, hears the hold it raised.",
  // A number flagged, restricted or failing (Meta's word on the channel row): Connections' WhatsApp and phone rows, the Library's
  // and the composers', all made of the channels read, which hears the row wherever the tab is (R6).
  number: {
    change: ["tenant_channels", "UPDATE"],
    heard: [["channels", ["#/admin/integrations", "#/messages", "#/broadcasts", "#/today"]]],
  },
  billing: "Billing, which the row opens, hears billing_accounts.",
  review: "The Reviews lens, which the row opens, hears google_reviews.",
  broadcast_sent: "Sent, which the row opens, hears broadcasts.",
  broadcast_stopped: "Sent, which the row opens, hears broadcasts.",
  playbook: "Campaigns, which the row opens, hears playbooks and broadcasts.",
  leads_ready: "Leads, which the row opens, hears leads and lead_rounds.",
  leads_question: "Leads, which the row opens, hears leads and lead_rounds.",
  reach_out_replied:
    "The thread the row opens hears reach_out_replies and the message, and People hears the reply's signer.",
  note_for_you: "People hears person_notes on every page, and the person's page reads again with it.",
  booking: "The Calendar, which the row opens at the appointment, hears appointments.",
  member_joined: "Settings, which the row opens at Team, hears memberships and invitations (00408).",
  member_left:
    "Settings, which the row opens at Team, hears memberships: the one who left is gone from the roster (00437).",
  note_to_keep:
    "Settings, which the row opens at Autonomy, reads the notes waiting with its read; the feed does not tell of fact_suggestions, and a Keep or a Dismiss reads it again behind its verb (decision 0063).",
  // Not traced to the depth the others were (N2 says so): no read is owed until one is found to be.
  call: "Its page, the calls, is not traced to the depth the others were; the call's note lands in the thread.",
  job_failed:
    "Its door is the page the failed job's work lives on (JOB_WORK); not traced to the depth the others were.",
  alert: "It opens Today, which hears messages, escalations, calls and lead rounds; not traced further.",
  reach_out_day: "Campaigns' Reach-outs read their own numbers where they are on screen; not traced further.",
};

test("every kind the edge keeps says what it announces and who hears it", () => {
  assert.deepEqual(
    Object.keys(ANNOUNCES).sort(),
    [...SERVER_NOTIFICATION_KINDS].sort(),
    "a kind added to the edge's list without a line here is a red build",
  );
  for (const [kind, said] of Object.entries(ANNOUNCES))
    if (typeof said === "string") assert.ok(said.trim().length > 20, `${kind}: say who hears it`);
});

test("a new row of any kind reads no surface and keeps none for a page, wherever the owner is: the bell reads its own rows", async (t) => {
  for (const hash of ["#/today", "#/inbox", "#/calendar", "#/clients", "#/campaigns", "#/broadcasts", "#/messages"]) {
    drain();
    at(hash);
    const read = recording(t);
    // A first read, then every kind arriving as new rows beside it.
    served = [row("booking_notice", "admin/workspace")];
    await notificationsOverride.apply();
    served = [
      ...served,
      ...SERVER_NOTIFICATION_KINDS.map((kind) => row(kind, kind === "sweep" ? "outbound" : "today")),
    ];
    await notificationsOverride.apply();
    await flush();
    assert.deepEqual(read, [], `${hash}: no surface is read for a row`);
    assert.deepEqual(Object.values(drain()).flat(), [], `${hash}: and none is kept for a page`);
  }
  at("#/today");
});

test("what a row announces is a change its pages hear on the feed: on each page that draws it, the surface it is drawn from asks to be read", () => {
  for (const [kind, said] of Object.entries(ANNOUNCES)) {
    if (typeof said === "string") continue;
    const [table, event] = said.change;
    const change = { table, event, row: {} };
    for (const [key, routes] of said.heard)
      for (const hash of routes) {
        at(hash);
        assert.equal(
          wantsRefresh(byKey[key], table, change),
          true,
          `${kind}: ${key} hears ${table} ${event} on ${hash}`,
        );
      }
  }
  at("#/today");
});

test("heard while the owner is elsewhere, it is kept for the page that draws it and read once as that page comes on screen", () => {
  // People's list hears a person made, and a stop, on its page alone: elsewhere it is kept, and read as People comes back.
  for (const event of ["INSERT", "UPDATE"]) {
    drain();
    at("#/inbox");
    const change = { table: "contacts", event, row: {} };
    assert.equal(wantsRefresh(peopleOverride, "contacts", change), false, `${event}: People is not read on the Inbox`);
    assert.deepEqual(owedOnArrival(["#/clients", "#/broadcasts"]), { "#/clients": ["people"], "#/broadcasts": [] });
  }
  // The gates' pause heard on Today: the composer is read as a page that draws it comes on screen, once, and the
  // playbooks where their page is.
  drain();
  at("#/today");
  const pause = { table: "mailboxes", event: "UPDATE", row: {} };
  for (const o of [playbooksOverride, broadcastsOverride])
    assert.equal(wantsRefresh(o, "mailboxes", pause), false, o.key);
  assert.deepEqual(owedOnArrival(["#/campaigns/new", "#/broadcasts", "#/outbound"]), {
    "#/campaigns/new": ["broadcasts"],
    "#/broadcasts": [],
    "#/outbound": ["playbooks"],
  });
});
