/**
 * The bell as rows a thumb scans (25 Sep).
 *
 * On the salon's phone the bell was 48 notes at 114 to 182px each, 6,677px of list: every note carried its own 44px
 * row of boxed buttons saying where a press on it would go anyway, nine of them were "… phoned · 12 s" and eight
 * "Your search for … is done", eight more read "A lead_collect job failed" over a job's uuid with a door to the
 * Inbox, and a customer the Inbox knew by name was a phone number. These run the words (contracts), the grouping
 * (contracts bellSections) and the popover itself on the stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bellSections,
  jobNewsWords,
  nameKnownCustomers,
  serverNotificationRows,
  JOB_KINDS,
} from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, textOf, classes, press } from "./_legacy-react.mjs";

const NOW = Date.parse("2026-09-25T15:00:00Z");
const kept = (over) => ({
  id: "n1",
  kind: "alert",
  title: "Something",
  body: "",
  route: null,
  subject_type: null,
  subject_id: null,
  created_at: new Date(NOW - 3_600_000).toISOString(),
  read: false,
  dismissed: false,
  ...over,
});

/* ------------------------------ a job's news ------------------------------ */

test("every job kind has the owner's words and a page of its own, and none of them names the job", () => {
  for (const k of JOB_KINDS) {
    for (const end of ["failed", "unfinished", "unknown_kind"]) {
      const w = jobNewsWords(k, end);
      assert.ok(!w.title.includes(k) && !/\bjob\b/i.test(w.title), `${k} ${end}: "${w.title}"`);
      assert.ok(!w.lead.includes(k) && !/[0-9a-f]{8}-/.test(w.lead), `${k} ${end}: "${w.lead}"`);
      assert.ok(w.to && !w.to.startsWith("#"), k);
    }
  }
  assert.deepEqual(
    jobNewsWords("lead_collect", "failed").to,
    "clients/leads",
    "a search's news is on Leads, not the Inbox",
  );
  assert.match(jobNewsWords("email_ingest", "failed", 5).lead, /^It stopped after 5 tries/);
  assert.match(jobNewsWords("outbound_send", "unfinished").lead, /Check the conversation before sending it again/);
  assert.equal(jobNewsWords("made_up", "failed").title, "Something in the background did not finish");
});

test("a job's row the runner wrote before these words is said in them, on its work's page, and nothing else is touched", () => {
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      kept({
        id: "j1",
        kind: "job_failed",
        title: "A lead_collect job failed",
        body: "Job be879161-31e8-4573-b2dc-90ecdc5f8fa1 (lead_collect) failed and will not retry on its own.\n\nboom",
        route: "inbox",
      }),
      kept({
        id: "j2",
        kind: "job_failed",
        title: "A outbound_send job did not finish",
        body: "Job 3f2eb9ef-e794-4f17-82c1-129977db413a (outbound_send) started and never reported back.",
        route: "inbox",
      }),
      // A job row whose title the runner did not write keeps its own words.
      kept({
        id: "j3",
        kind: "job_failed",
        title: "Setting up stopped",
        body: "Retry picks up where it stopped.",
        route: "start",
      }),
      kept({ id: "r1", kind: "review", title: "1 new rating on Google", body: "Five stars.", route: "reports" }),
    ],
  });
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  assert.equal(by["n:j1"].title, "A search stopped partway");
  assert.equal(by["n:j1"].message, "It stopped and will not start again on its own.", "never the uuid");
  assert.equal(by["n:j1"].to, "clients/leads");
  assert.equal(by["n:j1"].action, "Open Leads", "its button says the page it opens");
  assert.equal(by["n:j2"].title, "A message may not have been sent");
  assert.match(by["n:j2"].message, /may or may not have reached the customer/);
  assert.equal(by["n:j2"].to, "inbox");
  assert.equal(by["n:j3"].title, "Setting up stopped");
  assert.equal(by["n:j3"].to, "start");
  assert.equal(by["n:r1"].title, "1 new rating on Google");
});

/* ------------------------------ names, not numbers ------------------------------ */

test("a kept row naming its customer by number takes the name the Inbox or the calls here know, and only then", () => {
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      kept({
        id: "h1",
        kind: "handoff",
        title: "WhatsApp handoff needed: +19175550101",
        subject_type: "conversation",
        subject_id: "cv-1",
      }),
      kept({
        id: "c1",
        kind: "call",
        title: "+1 (917) 555-0102 phoned · 12 s",
        subject_type: "call",
        subject_id: "k2",
      }),
      kept({
        id: "c2",
        kind: "call",
        title: "+1 (917) 555-0103 phoned · 3 min",
        subject_type: "call",
        subject_id: "k3",
      }),
      kept({ id: "h2", kind: "handoff", title: "WhatsApp handoff needed: +19175550104" }),
      // The runner's older call title: the number, then the words about the call in brackets.
      kept({
        id: "c3",
        kind: "call",
        title: "Voice call: +15550100105 (12s, Neutral)",
        subject_type: "call",
        subject_id: "k2",
      }),
    ],
  });
  const named = nameKnownCustomers(
    rows,
    [{ id: "th-cv-1", who: "Dana Ortiz" }],
    [
      { callId: "k2", cvId: "cv-2", who: "Ana Ruiz", missed: false, live: false, startedAtMs: NOW },
      // A caller the calls know only by number stays a number.
      { callId: "k3", cvId: "cv-3", who: "+1 (917) 555-0103", missed: false, live: false, startedAtMs: NOW },
    ],
  );
  const by = Object.fromEntries(named.map((r) => [r.key, r.title]));
  assert.equal(by["n:h1"], "WhatsApp handoff needed: Dana Ortiz");
  assert.equal(by["n:c1"], "Ana Ruiz phoned · 12 s");
  assert.equal(by["n:c2"], "+1 (917) 555-0103 phoned · 3 min");
  assert.equal(by["n:h2"], "WhatsApp handoff needed: +19175550104", "a row about nothing is left as written");
  assert.equal(
    by["n:c3"],
    "Voice call: Ana Ruiz (12s, Neutral)",
    "REGRESSION: the number, and only the number: it ran on into the words after it",
  );
});

/* ------------------------------ the grouping ------------------------------ */

const bellRow = (id, kind, title, unread = true, tone = "") => ({
  id,
  kind,
  title,
  message: "",
  tone,
  icon: "bell",
  unread,
  time: "1d",
  about: null,
  actions: [{ label: "Open", to: "today", primary: true }],
});

test("the bell says notes of one kind once, where the newest stood, new above earlier; a thread that needs you never folds", () => {
  const rows = [
    bellRow("a", "needs_you", "Dana needs you"),
    bellRow("c1", "call", "Ana phoned · 12 s"),
    bellRow("s1", "leads_ready", "Your search for florists is done"),
    bellRow("c2", "call", "Bo phoned · 3 min"),
    bellRow("s2", "leads_ready", "Your search for bakers is done"),
    bellRow("b", "needs_you", "Eli needs you"),
    bellRow("r1", "review", "1 new rating on Google", false),
    bellRow("c3", "call", "Cy phoned · 1 min", false),
  ];
  const s = bellSections(rows);
  assert.deepEqual(
    s.map((x) => x.label),
    ["New", "Earlier"],
  );
  assert.deepEqual(
    s[0].lines.map((l) => [l.title ?? l.row.title, l.count]),
    [
      ["Dana needs you", 1],
      ["2 calls", 2],
      ["2 searches finished", 2],
      ["Eli needs you", 1],
    ],
  );
  assert.equal(s[0].lines[1].row.id, "c1", "the group's line under it is its newest");
  assert.deepEqual(
    s[0].lines[1].members.map((m) => m.id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    s[1].lines.map((l) => [l.row.title, l.count]),
    [
      ["1 new rating on Google", 1],
      ["Cy phoned · 1 min", 1],
    ],
    "one of a kind is a note, not a group",
  );
  assert.deepEqual(bellSections([]), [], "an empty bell has no sections");
});

/* ------------------------------ the popover ------------------------------ */

installLegacyReact();
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../apps/dashboard/src/legacy/components/topbar.jsx");
const W = globalThis.window;

const popover = (items, acts = {}) =>
  W.NotifPopover({
    items,
    onAction: (id, to) => (acts.acted = [id, to]),
    onReadAll: () => (acts.readAll = true),
    onDismiss: (id) => (acts.dismissed = id),
    onClose: () => {},
    alerts: null,
  });

test("a note is one press that does what it says, named by where it goes; nothing on it is a row of buttons", () => {
  fresh();
  const acts = {};
  const rows = [
    {
      ...bellRow("n1", "leads_ready", "Your search for florists is done"),
      message: "31 found.",
      actions: [{ label: "Open Leads", to: "clients/leads", primary: true }],
    },
  ];
  W.__notifs = { sections: bellSections };
  const tree = again(() => popover(rows, acts));
  const notes = all(tree, (n) => classes(n).includes("tbn-item"));
  assert.equal(notes.length, 1);
  const presses = all(notes[0], (n) => n.type === "button");
  assert.deepEqual(
    presses.map((b) => b.props["aria-label"]),
    ["Open Leads: Your search for florists is done", "Dismiss “Your search for florists is done”"],
    "the note's press, and its ×: no other button",
  );
  assert.equal(
    find(tree, (n) => classes(n).includes("tbn-actions")),
    null,
  );
  press(presses[0]);
  assert.deepEqual(acts.acted, ["n1", "clients/leads"]);
  assert.match(textOf(notes[0]), /31 found\./);
  assert.ok(
    !/\bnew\b/.test(textOf(find(tree, (n) => classes(n).includes("tbn-head")))),
    "no count beside the head: the sections say it",
  );
});

test("a group is one line saying how many; a press opens its notes under it, each its own press", () => {
  fresh();
  const acts = {};
  const rows = [
    {
      ...bellRow("c1", "call", "Ana phoned · 12 s"),
      actions: [{ label: "Open the calls", to: "conversations/phone", primary: true }],
    },
    {
      ...bellRow("c2", "call", "Bo phoned · 3 min"),
      actions: [{ label: "Open the calls", to: "conversations/phone", primary: true }],
    },
  ];
  W.__notifs = { sections: bellSections };
  let tree = again(() => popover(rows, acts));
  const head = find(tree, (n) => classes(n).includes("tbn-item-group"));
  assert.ok(head, "one line for the two");
  assert.match(textOf(head), /2 calls/);
  assert.match(textOf(head), /Ana phoned · 12 s/, "the newest said under it");
  assert.equal(all(tree, (n) => classes(n).includes("in-group")).length, 0, "closed until pressed");
  const open = find(head, (n) => classes(n).includes("tbn-open"));
  assert.equal(open.props["aria-expanded"], false);
  press(open);
  tree = again(() => popover(rows, acts));
  const members = all(tree, (n) => classes(n).includes("in-group"));
  assert.equal(members.length, 2);
  press(find(members[1], (n) => classes(n).includes("tbn-open")));
  assert.deepEqual(acts.acted, ["c2", "conversations/phone"]);
});

test("the mockup's bell, with no sections of its own, still stands new above earlier", () => {
  fresh();
  W.__notifs = undefined;
  const tree = again(() => popover([bellRow("a", "call", "A"), bellRow("b", "call", "B", false)]));
  assert.deepEqual(all(tree, (n) => classes(n).includes("tbn-sec")).map(textOf), ["New", "Earlier"]);
  assert.equal(all(tree, (n) => classes(n).includes("tbn-item")).length, 2, "not folded");
});

/* ------------------------------ a thumb on a note ------------------------------ */
// On a phone a thumb slides a note (data-bits touchSwipe): left over Dismiss, where it leaves, folds shut so the notes
// under it glide up, then goes (Undo finds it open again); right over Mark read while it is unread, where it comes back
// read and keeps its place under New rather than jumping down to Earlier. A read note does not move right. The × folds
// a note the same way, on a desk too. Under reduced motion a dismissed note goes at once. The gesture runs on an element
// that answers what it asks of it, under a window that says it is a phone.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let phone = false;
let reduced = false;
const desktopMedia = globalThis.matchMedia;
const onPhone = async (fn) => {
  globalThis.matchMedia = (q) => ({
    matches: q.includes("720") ? phone : q.includes("reduce") ? reduced : false,
    addEventListener() {},
    removeEventListener() {},
  });
  phone = true;
  try {
    await fn();
  } finally {
    phone = false;
    reduced = false;
    globalThis.matchMedia = desktopMedia;
  }
};
const thumbed = (items, h) =>
  W.NotifPopover({
    items,
    onAction: (id, to) => h.acts.push([id, to]),
    onReadAll() {},
    onDismiss: (id) => h.gone.push(id),
    onRead: (id) => h.reads.push(id),
    onClose() {},
    alerts: null,
  });
const heard = () => ({ acts: [], reads: [], gone: [] });
const notes = (tree) => all(tree, (n) => classes(n).includes("tbn-item"));
const slots = (tree) => all(tree, (n) => classes(n).includes("tbn-slot"));
/** The list's order: each section's word and each note's title, as drawn. */
const order = (tree) =>
  all(tree, (n) => classes(n).includes("tbn-sec") || classes(n).includes("tbn-item")).map((n) =>
    classes(n).includes("tbn-sec") ? textOf(n) : textOf(find(n, (k) => classes(k).includes("tbn-item-title"))),
  );
/** A note's element for the gesture: the browser's, with a style, a width, still on screen. */
const box = () => ({
  style: {},
  offsetWidth: 343,
  offsetHeight: 64,
  scrollHeight: 64,
  clientHeight: 64,
  scrollWidth: 343,
  clientWidth: 343,
  scrollTop: 0,
  parentElement: null,
  isConnected: true,
  getClientRects: () => [1],
  matches: () => false,
});
const slide = (item, el, from, ...steps) => {
  item.props.onTouchStart({ touches: [{ clientX: from[0], clientY: from[1] }], currentTarget: el, target: el });
  for (const [x, y] of steps) item.props.onTouchMove({ touches: [{ clientX: x, clientY: y }], currentTarget: el });
  const [x, y] = steps.at(-1);
  item.props.onTouchEnd({ changedTouches: [{ clientX: x, clientY: y }], currentTarget: el });
};
const three = () => [
  bellRow("a", "needs_you", "Note a"),
  bellRow("b", "leads_ready", "Note b"),
  bellRow("c", "review", "Note c", false),
];

test("slid left past a third, a note leaves, folds shut, then goes; Undo finds it open again", () =>
  onPhone(async () => {
    fresh();
    W.__notifs = { sections: bellSections };
    const h = heard();
    let items = three();
    let tree = again(() => thumbed(items, h));
    assert.equal(textOf(find(tree, (n) => classes(n).includes("tbn-ground-dismiss"))), "Dismiss");
    assert.equal(textOf(find(tree, (n) => classes(n).includes("tbn-ground-read"))), "Mark read");
    const el = box();
    slide(notes(tree)[0], el, [200, 300], [150, 302], [60, 304]);
    assert.equal(el.style.transform, "translate3d(-100%, 0, 0)", "140px of 343: away");
    await wait(200);
    tree = again(() => thumbed(items, h));
    assert.equal(slots(tree)[0].props["data-going"], "true", "folding");
    assert.deepEqual(h.gone, [], "not gone until the fold has played");
    await wait(230);
    assert.deepEqual(h.gone, ["a"]);
    items = items.filter((n) => n.id !== "a");
    tree = again(() => thumbed(items, h));
    assert.equal(slots(tree).length, 2);
    items = three();
    tree = again(() => thumbed(items, h));
    assert.equal(slots(tree)[0].props["data-going"], undefined, "brought back by Undo, it stands open");
  }));

test("slid right, an unread note is marked read where it stands and comes back; a read note does not move", () =>
  onPhone(async () => {
    fresh();
    W.__notifs = { sections: bellSections };
    const h = heard();
    let items = three();
    let tree = again(() => thumbed(items, h));
    const el = box();
    slide(notes(tree)[0], el, [100, 300], [180, 302], [260, 304]);
    assert.equal(el.style.transform, "translate3d(100%, 0, 0)", "160px of 343: over Mark read");
    await wait(200);
    assert.deepEqual(h.reads, ["a"]);
    await wait(80);
    assert.equal(el.style.transform, "translate3d(0, 0, 0)", "still on screen, read: back where it was");
    items = items.map((n) => (n.id === "a" ? { ...n, unread: false } : n));
    tree = again(() => thumbed(items, h));
    assert.deepEqual(
      order(tree),
      ["New", "Note a", "Note b", "Earlier", "Note c"],
      "read, it keeps its place under New",
    );
    assert.ok(!classes(notes(tree)[0]).includes("unread"), "and is drawn read");
    assert.equal(
      textOf(find(notes(tree)[0], (n) => classes(n).includes("tbn-ground-read"))),
      "",
      "nothing to its right now",
    );
    const read = box();
    slide(notes(tree)[2], read, [100, 300], [180, 302], [260, 304]);
    assert.equal(read.style.transform, undefined, "a read note has nothing to the right");
    await wait(300);
    assert.deepEqual(h.reads, ["a"]);
  }));

test("the × folds a note the same way, and under reduced motion a dismissed note goes at once", () =>
  onPhone(async () => {
    fresh();
    W.__notifs = { sections: bellSections };
    const h = heard();
    const tree = again(() => thumbed(three(), h));
    press(find(notes(tree)[1], (n) => classes(n).includes("tbn-x")));
    assert.deepEqual(h.gone, []);
    await wait(230);
    assert.deepEqual(h.gone, ["b"]);
    reduced = true;
    const el = box();
    slide(notes(tree)[0], el, [200, 300], [150, 302], [60, 304]);
    await wait(10);
    assert.deepEqual(h.gone, ["b", "a"], "no leaving and no fold to wait for");
  }));

test("on a desk nothing slides: a mouse has the × and the note's own press", () => {
  fresh();
  W.__notifs = { sections: bellSections };
  const h = heard();
  const tree = again(() => thumbed(three(), h));
  const el = box();
  slide(notes(tree)[0], el, [200, 300], [150, 302], [60, 304]);
  assert.equal(el.style.transform, undefined);
  assert.deepEqual(h.gone, []);
});
