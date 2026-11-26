/**
 * A connected mailbox on Settings › Connections (surfaces/settings/connections/mailboxes-block.tsx EmailCard), drawn on
 * the stub React: Email is a row, and each mailbox a row under it, the shape every connection's row has (Ruben, 21 Nov
 * 2026: the card was five kinds of row in one, its facts always open). A mailbox's row is its address and its state, and
 * says a quiet line only while there is something to say; it opens its settings in a sheet, or says Fix where something
 * needs mending, and its sheet leads with that. Its sending, signature, what it brought in, a test, Pause and Remove are
 * the sheet's. Under the mailboxes: what was left in the mailbox today, and Add a mailbox.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, find, all, byTestId, textOf, press, settle } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

installStubReact();
const SAM = "sam@getharbor.example";
const CONNECTIONS = "../../../apps/dashboard/src/surfaces/settings/connections";
const { EmailCard } = await import(`${CONNECTIONS}/mailboxes-block.tsx`);
const { connectedMailboxes } = await import(`${CONNECTIONS}/connected-mailboxes.ts`);
const { Segmented } = await import("../../../apps/dashboard/src/surfaces/kit/segmented/segmented.tsx");

// Who is acting: the frame's gate asks the role store; here an owner, or a member who may not change the mailboxes.
const role = { owner: true };
// The workspace's zone, as the workspace list publishes it: a day the card says is its, never the suite's own.
const ZONE = "America/Los_Angeles";
bridgeHolds({ who: { workspaces: [{ id: "w1", timezone: ZONE }], activeWorkspaceId: "w1" } });
Object.assign(globalThis.window, {
  canDo: () => role.owner,
  gate: (_perm, doing) => (role.owner ? {} : { "aria-disabled": "true", "data-gated": doing }),
  gateTitle: (_perm, doing) => `Only an owner can ${doing}.`,
});

/** A mailbox the business connected, as the page is told of it (contracts MailboxConnectionDto). */
const mbx = (over = {}) => ({
  id: "m1",
  provider: "google",
  address: "sam@getharbor.example",
  host: "getharbor.example",
  from_name: "Sam at Harbor",
  signature: null,
  state: "connected",
  held_why: null,
  held_at: null,
  resting_until: null,
  daily_cap: 40,
  customer_domain: false,
  sent_days: 9,
  dns: { spf: "found", dkim: "found", dmarc: "found", mx: "found" },
  spf_record: null,
  spf_lookups: null,
  dns_checked_at: null,
  last_error: null,
  connected_at: "2026-09-20T00:00:00.000Z",
  sent_at: null,
  synced_at: null,
  sent_today: null,
  counts: null,
  came_in: null,
  signs: { from: "name", words: "Sam at Harbor", gmail_read_at: null, gmail: null },
  ...over,
});

let props = null;
const flashes = [];
const redraw = () => again(() => globalThis.React.createElement(EmailCard, props));
/** The mailbox row as contracts fold it (connectionRows): titled Email, the hosted address's row in it. */
const ROW = {
  kind: "mailbox",
  icon: "mail",
  title: "Email",
  detail: SAM,
  group: "connected",
  state: "connected",
  stateWords: "On",
  tone: "ok",
  sentence: "",
  verb: null,
  body: "mailboxes",
  notes: [],
};
/** Email for these mailboxes, drawn fresh; `left` is the senders Setup says were left today. */
const open = (mailboxes, left = null, over = {}) => {
  fresh();
  flashes.length = 0;
  props = {
    r: ROW,
    email: {
      ready: true,
      domain: "mail.example.com",
      mailbox: null,
      sending: { providers: ["google"], mailboxes, left_today: left },
    },
    imports: null,
    businessName: "Harbor Moving",
    flash: (f) => flashes.push(f),
    note: null,
    onNote() {},
    ...over,
  };
  return redraw();
};
const said = (n) => textOf(n).replace(/\s+/g, " ").trim();
/** Email's own row. */
const emailOf = (tree) => byTestId(tree, "connection-mailbox");
/** A mailbox's row under it. */
const rowOf = (tree, address) => byTestId(tree, `mailbox-${address}`);
/** Its settings sheet, opened by the row's press (Settings), or by Fix where it needs mending; the block drawn again. */
const openSettings = (tree, address) => {
  press(byTestId(tree, `mailbox-settings-${address}`) ?? byTestId(tree, `mailbox-fix-${address}`));
  return redraw();
};
/** The sheet's Save (the record kit's foot, kit/record/sheet.tsx). */
const saveOf = (tree) => byTestId(tree, "rec-sheet-save-mailbox");
/** What its sheet says it brought in, each "label: value". */
const broughtOf = (tree) => {
  const dl = byTestId(tree, "mailbox-brought");
  if (!dl) return [];
  const parts = all(dl, (n) => n.type === "dt" || n.type === "dd").map((n) => said(n));
  return parts.flatMap((part, i) => (i % 2 ? [] : [`${part}: ${parts[i + 1]}`]));
};

test("Email is a row, each mailbox a row under it: its address and its state, nothing more while it works, and in the foot what it left", () => {
  const read = new Date(Date.now() - 2 * 60_000).toISOString();
  let tree = open([mbx({ synced_at: read, came_in: 3, sent_today: 20 })], 9);
  assert.ok(said(emailOf(tree)).startsWith("Email"), "the row is named Email");
  const row = rowOf(tree, SAM);
  assert.equal(row.props["data-child"], "true", "a row under Email, where its name starts");
  assert.equal(said(find(row, (n) => n.props?.className === "set-team-name")), SAM);
  assert.match(said(row), /On/, "a mailbox at its sending cap still reads");
  assert.doesNotMatch(said(row), /Read at|wrote today|ramp|of 20 today|Google/, "a row that works says nothing more");
  assert.equal(row.props["data-offers"], "one", "the row is its press");
  assert.equal(said(byTestId(row, `mailbox-settings-${SAM}`)), "Settings");
  assert.match(
    said(byTestId(tree, "mailbox-left")),
    /^Left in your mailbox · 9 senders today(Show who)?$/,
    "a count, no sentence",
  );
  tree = open([mbx({ synced_at: read, came_in: 0 })], 1);
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox · 1 sender today/);
  tree = open([mbx()]);
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox(?! ·)/, "an unread count is not said");
});

test("its row opens its settings: no caret, no act beside Settings; Send a test is the sheet's, and its sending said once", async () => {
  const tested = [];
  Object.assign(connectedMailboxes, { test: async (id) => (tested.push(id), { ok: true, data: {} }) });
  let tree = open([
    mbx({ sent_today: 12, counts: { sent: 250, bounced: 1, blocked: 0, complained: 0, unsubscribed: 0, said_no: 2 } }),
  ]);
  for (const gone of ["pause", "check", "test", "remove", "more"])
    assert.equal(byTestId(tree, `mailbox-${gone}-${SAM}`), null, `${gone} is not a press of the row`);
  tree = openSettings(tree, SAM);
  assert.ok(byTestId(tree, `mailbox-sheet-${SAM}`), "its settings are a sheet, not a box in the row");
  const lines = said(byTestId(tree, `mailbox-sending-${SAM}`));
  // The ramp reads the days it sent (D15): nine, so its second step's 20 a day, and 30 after five more.
  assert.match(lines, /12 sent today · 20 a day for now, 30 after 5 more days of sending/);
  assert.match(lines, /0\.4% bounced · 2 said no · none marked as spam/, "a bounce: its health is said");
  assert.doesNotMatch(lines, /of 20 today|Day 10 of its ramp|A new mailbox starts/, "one limit, said once");
  press(byTestId(tree, `mailbox-test-${SAM}`));
  await settle();
  assert.deepEqual(tested, ["m1"]);
  assert.ok(byTestId(redraw(), `mailbox-sheet-${SAM}`), "a test keeps the sheet open");
});

test("what it brought in is its sheet's, as the ledger says it, never a fact on the rows", async () => {
  const imports = [
    {
      source: "mailbox",
      state: "done",
      counts: { done: 414, total: 414 },
      parts_done: 1,
      parts_total: 1,
      oldest: "2026-06-07T00:00:00Z",
      started_at: null,
      finished_at: null,
      last_error: null,
      via: "google",
    },
  ];
  const { importLineOf } = await import("@chanlytics/contracts");
  let tree = open([mbx({ daily_cap: 40 })], null, { imports });
  assert.doesNotMatch(said(emailOf(tree)), /414|Inbox/, "a run that is in says nothing on Email's row");
  assert.equal(byTestId(tree, "mailbox-facts"), null, "no box of facts");
  tree = openSettings(tree, SAM);
  assert.deepEqual(broughtOf(tree), [`Inbox: ${importLineOf(imports[0], ZONE).says}`], "the ledger's own line");
  // Midnight on 7 June in UTC is the evening of the 6th in Los Angeles: the sheet says the workspace's day.
  assert.match(broughtOf(tree)[0], / · since Jun 6$/, "REGRESSION: the day it reached back to was the machine's");
  tree = openSettings(open([mbx()]), SAM);
  assert.deepEqual(broughtOf(tree), [], "nothing brought: nothing said");
});

test("a stopped six months says so on Email's row, with Try again, the first run's own door (the live walk's TODAY-3, 27 Oct 2026)", async () => {
  const { setupVerbs } = await import(`${CONNECTIONS}/../../setup/surface.ts`);
  const { IMPORT_STOPPED_WORDS } = await import("@chanlytics/contracts");
  const asked = [];
  const was = setupVerbs.importAgain;
  setupVerbs.importAgain = async (source) => (asked.push(source), { ok: true, message: "" });
  try {
    const imports = [
      {
        source: "mailbox",
        state: "failed",
        counts: { messages: 130 },
        parts_done: 4,
        parts_total: null,
        oldest: "2026-06-07T00:00:00Z",
        started_at: null,
        finished_at: null,
        // What a run that stopped says on its row (history-import.ts): never the provider's error.
        last_error: IMPORT_STOPPED_WORDS.failed,
        via: "google",
      },
    ];
    let tree = open([mbx()], null, { imports });
    const line = said(byTestId(tree, "mailbox-import-mailbox"));
    assert.match(line, /^Inbox: Stopped part way · 130 emails kept/, "it says it stopped, and what it kept");
    assert.doesNotMatch(line, /· Stopped/, "and says Stopped once");
    const again = byTestId(tree, "mailbox-import-again-mailbox");
    assert.equal(said(again), "Try again");
    press(again);
    await settle();
    tree = redraw();
    assert.deepEqual(asked, ["mailbox"], "the run starts again where it stopped");
    assert.equal(said(byTestId(tree, "mailbox-import-again-mailbox")), "Starting");
    // Done, the row says nothing of it, and offers nothing to press.
    tree = open([mbx()], null, { imports: [{ ...imports[0], state: "done", last_error: null }] });
    assert.equal(byTestId(tree, "mailbox-import-mailbox"), null);
    assert.equal(byTestId(tree, "mailbox-import-again-mailbox"), null);
  } finally {
    setupVerbs.importAgain = was;
  }
});

test("what needs mending says Fix, and its sheet leads with what is wrong and the act: Reconnect, Resume, Set up DNS; Paused is its own word", async () => {
  const went = [];
  Object.assign(connectedMailboxes, {
    connect: async (p, id) => (went.push([p, id ?? null]), { ok: true, data: { url: "https://provider.example/" } }),
  });
  let tree = open([mbx({ state: "reconnect", synced_at: new Date().toISOString(), came_in: 4 })]);
  assert.match(said(rowOf(tree, SAM)), /Google signed it out: nothing is read from it or sent/);
  const fix = byTestId(tree, `mailbox-fix-${SAM}`);
  assert.equal(said(fix), "Fix");
  assert.equal(fix.props.variant, "primary", "the coral one");
  assert.equal(rowOf(tree, SAM).props["data-offers"], "primary");
  tree = openSettings(tree, SAM);
  assert.match(said(byTestId(tree, `mailbox-problem-${SAM}`)), /Google signed it out/, "the sheet leads with it");
  press(byTestId(tree, `mailbox-reconnect-${SAM}`));
  await settle();
  assert.deepEqual(went, [["google", "m1"]], "Reconnect goes back to its own provider, for its own mailbox");

  tree = open([mbx({ state: "held", held_why: "bounces", held_at: "2026-10-01T12:00:00Z" })]);
  assert.match(
    said(rowOf(tree, SAM)),
    /Its sending is held since Oct 1: .*bounced/,
    "noon UTC is Oct 1 in Los Angeles",
  );
  tree = openSettings(tree, SAM);
  press(byTestId(tree, `mailbox-resume-${SAM}`));
  tree = redraw();
  assert.match(
    said(byTestId(tree, `mailbox-sheet-${SAM}`)),
    /Resume sam@getharbor\.example\?/,
    "asked first, in the sheet",
  );
  tree = openSettings(open([mbx({ state: "held" })]), SAM);
  assert.equal(byTestId(tree, `mailbox-test-${SAM}`), null, "a held mailbox sends no test");

  tree = open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]);
  assert.match(said(rowOf(tree, SAM)), /2 DNS records to add · 1 of 3 found/, "one line where the records stood");
  assert.equal(byTestId(tree, "mailbox-dns-spf"), null, "its records are its DNS sheet's, not the row's");
  tree = openSettings(tree, SAM);
  assert.equal(said(byTestId(tree, `mailbox-dns-${SAM}`)), "Set up DNS");
  assert.ok(byTestId(tree, `mailbox-test-${SAM}`), "and the test waits in the sheet");

  tree = open([mbx({ state: "paused" })]);
  assert.match(said(rowOf(tree, SAM)), /You paused its sending: what people write still comes in/);
  assert.match(said(rowOf(tree, SAM)), /Paused/);
  assert.equal(byTestId(tree, `mailbox-fix-${SAM}`), null, "paused is the owner's choice, not a fault");
  tree = openSettings(tree, SAM);
  assert.equal(byTestId(tree, "mailbox-sending-switch").props.checked, false, "its switch turns it back on");
});

test("its domain's records, in a sheet: how many found, each to add with its host and value to copy, DKIM where to turn it on, Check again", async () => {
  const checked = [];
  Object.assign(connectedMailboxes, { check: async (id) => (checked.push(id), { ok: true, data: {} }) });
  const copied = [];
  const was = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async (v) => void copied.push(v) } },
    configurable: true,
  });
  /** Fix, then Set up DNS at the head of its sheet. */
  const dnsOf = (tree) => {
    press(byTestId(openSettings(tree, SAM), `mailbox-dns-${SAM}`));
    return redraw();
  };
  try {
    let tree = dnsOf(open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]));
    const sheet = byTestId(tree, `mailbox-dns-sheet-${SAM}`);
    assert.ok(sheet, "Set up DNS opens its records in a sheet");
    assert.equal(byTestId(tree, `mailbox-sheet-${SAM}`), null, "in place of its settings");
    assert.equal(said(byTestId(sheet, "mailbox-dns-found")), "1 of 3 found");
    const spf = said(byTestId(sheet, "mailbox-dns-spf"));
    assert.match(
      spf,
      /^Sender \(SPF\)TXT@ · v=spf1 include:_spf\.google\.com ~allFound$/,
      "a record DNS has: one line",
    );
    const dkim = said(byTestId(sheet, "mailbox-dns-dkim"));
    assert.match(dkim, /^Signing \(DKIM\)TXTTurn on/);
    assert.match(dkim, /Google Admin console: Apps › Google Workspace › Gmail › Authenticate email/);
    const go = find(byTestId(sheet, "mailbox-dns-dkim"), (n) => typeof n.props?.href === "string");
    assert.equal(
      go.props.href,
      "https://admin.google.com/ac/appsettings/740348119625",
      "Gmail's settings, as Google's help links them",
    );
    assert.equal(go.props.target, "_blank");
    assert.equal(byTestId(sheet, "mailbox-copy-dkim"), null, "DKIM is made where the mailbox lives: nothing to paste");
    assert.match(said(byTestId(sheet, "mailbox-dns-dmarc")), /^Policy \(DMARC\)TXTAdd this/);
    // Copy says it went, on its own button.
    press(byTestId(sheet, "mailbox-copy-dmarc"));
    await settle();
    tree = redraw();
    assert.deepEqual(copied, ["v=DMARC1; p=none;"]);
    assert.equal(said(byTestId(tree, "mailbox-copy-dmarc")), "Copied");
    assert.equal(said(byTestId(tree, "mailbox-copy-dmarc-host")), "Copy", "the other part has not been copied");
    // Check again reads them now; the sheet stays, and Setup's re-read brings what it found.
    press(byTestId(tree, `mailbox-check-${SAM}`));
    await settle();
    tree = redraw();
    assert.deepEqual(checked, ["m1"]);
    assert.ok(byTestId(tree, `mailbox-dns-sheet-${SAM}`), "it stays open");
    assert.match(String(flashes.at(-1)?.msg?.props?.children ?? ""), /getharbor\.example's records were read again/);
  } finally {
    Object.defineProperty(globalThis, "navigator", { value: was, configurable: true });
  }
  // An SPF record the domain has already is changed, never added beside.
  const spfOne = mbx({
    dns: { spf: "missing", dkim: "found", dmarc: "found" },
    spf_record: "v=spf1 include:mailgun.org ~all",
    spf_lookups: 2,
  });
  assert.match(said(rowOf(open([spfOne]), SAM)), /1 DNS record to add · 2 of 3 found/);
  const changed = dnsOf(open([spfOne]));
  assert.match(said(byTestId(changed, "mailbox-dns-spf")), /^Sender \(SPF\)TXTChange this/);
  assert.match(
    said(byTestId(changed, "mailbox-dns-spf")),
    /v=spf1 include:mailgun\.org include:_spf\.google\.com ~all/,
  );
  assert.match(said(byTestId(changed, "mailbox-record-note-spf")), /may have one SPF record only/);
});

test("the owner's acts in the sheet: settings judged before they are sent, Sending a switch saved with them, Remove asked first", async () => {
  const set = [];
  const removed = [];
  Object.assign(connectedMailboxes, {
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
    remove: async (id) => (removed.push(id), { ok: true, data: { removed: true } }),
  });
  let tree = openSettings(open([mbx()]), SAM);
  assert.match(said(byTestId(tree, "mailbox-name")), /^Sender name/, "the name it sends as, said plainly");
  assert.match(said(byTestId(tree, "mailbox-cap")), /^Daily limit/);
  const field = (id) => find(byTestId(tree, id), (n) => n.type === "input" || n.type === "textarea");
  field("mailbox-cap").props.onChange({ target: { value: "80" } });
  tree = redraw();
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-cap")), /Between 1 and 40 a day/, "judged under its box");
  assert.equal(set.length, 0, "nothing is sent that the rules already refuse");
  field("mailbox-cap").props.onChange({ target: { value: "25" } });
  tree = redraw();
  press(saveOf(tree));
  await settle();
  // With nothing of its own written, it stands on Gmail's (00487): a save keeps it there, and the edge reads it again.
  assert.deepEqual(set[0], [
    "m1",
    { from_name: "Sam at Harbor", signature: null, signature_off: false, daily_cap: 25 },
  ]);
  assert.equal(byTestId(redraw(), `mailbox-sheet-${SAM}`), null, "a save closes the sheet");
  // Sending is a switch in the sheet: it pauses with the save, the rest as they were.
  tree = openSettings(open([mbx()]), SAM);
  byTestId(tree, "mailbox-sending-switch").props.onCheckedChange(false);
  tree = redraw();
  assert.match(said(byTestId(tree, `mailbox-sending-${SAM}`)), /^Paused: nothing leaves from sam@getharbor\.example\./);
  press(saveOf(tree));
  await settle();
  assert.deepEqual(set[1][1], {
    from_name: "Sam at Harbor",
    signature: null,
    signature_off: false,
    daily_cap: 40,
    paused: true,
  });
  // Remove, from the sheet, is asked first.
  tree = openSettings(open([mbx()]), SAM);
  press(byTestId(tree, "mailbox-remove-ask"));
  tree = redraw();
  assert.match(said(byTestId(tree, `mailbox-sheet-${SAM}`)), /Remove sam@getharbor\.example\?/, "the sheet asks first");
  assert.deepEqual(removed, []);
});

test("a member who may not change the mailboxes reads them and their settings, is told once why, and finds no Remove", () => {
  role.owner = false;
  try {
    let tree = open([mbx()]);
    assert.match(said(byTestId(tree, "mailbox-gate")), /Only an owner can connect, pause, resume or remove a mailbox/);
    assert.equal(byTestId(tree, "mailbox-add"), null, "no Add a mailbox");
    // Its settings are read, never changed: the sheet opens with no Save, its boxes held, Send a test said gated.
    tree = openSettings(tree, SAM);
    assert.ok(byTestId(tree, `mailbox-sheet-${SAM}`));
    assert.equal(saveOf(tree), null, "no Save for a role that may not");
    assert.equal(find(byTestId(tree, "mailbox-cap"), (n) => n.type === "input").props.disabled, true);
    assert.equal(byTestId(tree, "mailbox-remove-ask"), null);
    assert.equal(byTestId(tree, `mailbox-test-${SAM}`).props["data-gated"], "send a test", "Send a test says why");
  } finally {
    role.owner = true;
  }
});

test("its own address (Today's set-aside line) reads Left in your mailbox at once, as Show would; the page alone does not", async () => {
  const asked = [];
  const was = globalThis.window.fetch;
  globalThis.window.fetch = async (url) => {
    asked.push(new URL(String(url), "https://app.example").pathname);
    const left = [
      {
        address: "dmarc_reports@reports.example.com",
        name: "DMARC Report",
        why: "report",
        count: 2,
        first_at: "2026-10-26T00:00:00Z",
        last_at: "2026-10-27T00:00:00Z",
      },
    ];
    return new Response(JSON.stringify({ ok: true, data: { left, said: [] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    open([mbx()]);
    await settle();
    assert.deepEqual(asked, [], "Connections opened plainly reads the list only on a press");
    open([mbx()]);
    props.openLeft = true;
    redraw();
    await settle();
    await settle();
    assert.deepEqual(asked, ["/api/v1/mailbox-senders"], "read once, as the address opens");
    const tree = redraw();
    assert.match(said(byTestId(tree, "mailbox-left-row")), /DMARC Report · dmarc_reports@reports\.example\.com/);
  } finally {
    globalThis.window.fetch = was;
  }
});

test("Settings reads the address: Connections opens, its row named Left in your mailbox", async () => {
  const { SET_TAB, settingsRowOf } = await import(`${CONNECTIONS}/../frame/tabs.ts`);
  const { MAILBOX_LEFT_ROW } = await import("@chanlytics/contracts");
  assert.equal(SET_TAB(`integrations/${MAILBOX_LEFT_ROW}`).id, "integrations");
  assert.equal(settingsRowOf(`integrations/${MAILBOX_LEFT_ROW}`), MAILBOX_LEFT_ROW);
  assert.equal(settingsRowOf("integrations"), null, "the page alone names no row");
});

test("what it signs with (00487), said once: Gmail's as words with when it was read; their own in the box they write it in; or none", async () => {
  const set = [];
  Object.assign(connectedMailboxes, {
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
  });
  const read = "2026-10-27T17:55:00.000Z";
  const gmail = "Sam Reyes\nHarbor Moving";
  const signs = { from: "gmail", words: gmail, gmail_read_at: read, gmail };
  let tree = openSettings(open([mbx({ signs })]), SAM);
  const choice = () => find(tree, (n) => n.type === Segmented);
  assert.equal(choice().props.value, "gmail", "it stands on Gmail's");
  assert.deepEqual(
    choice().props.options.map((o) => o.label),
    ["From Gmail", "Write one", "None"],
  );
  const group = byTestId(tree, "mailbox-signs");
  const named = find(group, (n) => n.props?.className === "set-mbx-group-title" && !!n.props?.id);
  assert.equal(said(named), "Signature", "the choice is named where it is seen");
  assert.equal(choice().props.labelledBy, named.props.id, "and named by those words");
  assert.ok(byTestId(group, "mailbox-signs-said"), "what it signs with sits under its choice");
  const shown = said(byTestId(tree, "mailbox-signs-said"));
  assert.match(shown, /^Sam Reyes Harbor Moving/, "Gmail's signature, as words");
  assert.match(shown, /Read from Gmail .+\. Saving reads it again\./);
  assert.equal(byTestId(tree, "mailbox-signature"), null, "their own words' box is for Write one");
  assert.equal(byTestId(tree, "mailbox-preview"), null, "said once: no preview says it again (Ruben, 21 Nov 2026)");

  choice().props.onValueChange("own");
  tree = redraw();
  assert.ok(byTestId(tree, "mailbox-signature"), "Write one: the box their words go in");
  assert.equal(byTestId(tree, "mailbox-signs-said"), null);
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-signature")), /Write the signature, or choose another\./);
  assert.equal(set.length, 0, "an empty signature of their own is not sent");
  find(byTestId(tree, "mailbox-signature"), (n) => n.type === "textarea").props.onChange({
    target: { value: "Sam · Harbor" },
  });
  tree = redraw();
  press(saveOf(tree));
  await settle();
  assert.deepEqual(set[0][1], {
    from_name: "Sam at Harbor",
    signature: "Sam · Harbor",
    signature_off: false,
    daily_cap: 40,
  });

  const own = { ...signs, from: "own", words: "Sam · Harbor" };
  tree = openSettings(open([mbx({ signs: own, signature: "Sam · Harbor" })]), SAM);
  assert.equal(choice().props.value, "own", "the page's row says what it signs with now");
  choice().props.onValueChange("none");
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-signs-said")), /Nothing goes under its emails, not even its name\./);
  press(saveOf(tree));
  await settle();
  assert.deepEqual(
    set[1][1],
    { from_name: "Sam at Harbor", signature_off: true, daily_cap: 40 },
    "their words are kept",
  );
});

test("a mailbox whose Gmail has no signature ends its emails with its name, and says so", () => {
  const tree = openSettings(open([mbx()]), SAM);
  const shown = said(byTestId(tree, "mailbox-signs-said"));
  assert.match(shown, /^Sam at Harbor/);
  assert.match(
    shown,
    /Gmail has none for this address, so its emails end with its name\. Saving reads it from Gmail now\./,
  );
});

test("what a mailbox brings is its own (decision 0086): its row says where its history stands while it comes in or stopped, with the act that fits; its sheet offers the six months; Add a mailbox says what connecting brings", async () => {
  const { IMPORT_STOPPED_WORDS, MAILBOX_HISTORY_WORDS } = await import("@chanlytics/contracts");
  const pressed = [];
  const went = [];
  Object.assign(connectedMailboxes, {
    history: async (id, act) => (pressed.push([id, act]), { ok: true, data: { mailbox: null } }),
    connect: async (p, id, _back, history) => (
      went.push([p, id ?? null, history ?? null]),
      { ok: true, data: { url: "https://provider.example/" } }
    ),
  });
  /** The mailbox's own row of the ledger (00499), still coming in unless said. */
  const own = (over = {}) => ({
    source: "mailbox",
    connection_id: "m1",
    state: "running",
    counts: { messages: 130 },
    parts_done: 1,
    parts_total: null,
    oldest: null,
    started_at: null,
    finished_at: null,
    last_error: null,
    via: "google",
    ...over,
  });
  // Coming in: where it stands, on its row, and Stop.
  let tree = open([mbx()], null, { imports: [own()] });
  assert.equal(said(byTestId(tree, `mailbox-history-${SAM}`)), "130 emails so far · … · Stop");
  assert.equal(byTestId(tree, "mailbox-import-mailbox"), null, "its own run is its row's, never Email's too");
  press(byTestId(tree, `mailbox-history-stop-${SAM}`));
  await until(() => pressed.length === 1, "Stop pressed through the door");
  // Stopped by its owner: Resume, through the same door.
  tree = open([mbx()], null, { imports: [own({ state: "failed", last_error: IMPORT_STOPPED_WORDS.byYou })] });
  assert.equal(said(byTestId(tree, `mailbox-history-${SAM}`)), `${IMPORT_STOPPED_WORDS.byYou} · Resume`);
  assert.equal(byTestId(tree, "mailbox-import-again-mailbox"), null, "one act, never Try again beside it");
  press(byTestId(tree, `mailbox-history-resume-${SAM}`));
  await until(() => pressed.length === 2, "Resume pressed through the door");
  // From now on: nothing on its row; its sheet says since when, by the workspace's calendar, and offers the six months.
  tree = open([mbx({ history: "from_now" })]);
  assert.equal(byTestId(tree, `mailbox-history-${SAM}`), null, "an offer is not a row's line");
  tree = openSettings(tree, SAM);
  assert.deepEqual(broughtOf(tree), [`Inbox: ${MAILBOX_HISTORY_WORDS.fromNow("Sep 19")} · Bring in the last 6 months`]);
  press(byTestId(tree, `mailbox-history-bring-${SAM}`));
  await until(() => pressed.length === 3, "Bring in pressed through the door");
  assert.deepEqual(pressed, [
    ["m1", "stop"],
    ["m1", "resume"],
    ["m1", "bring"],
  ]);
  // Several mailboxes: each line its own.
  const ops = "ops@getharbor.example";
  tree = open([mbx(), mbx({ id: "m2", address: ops })], null, {
    imports: [own(), own({ connection_id: "m2", state: "failed", last_error: IMPORT_STOPPED_WORDS.failed })],
  });
  assert.equal(said(byTestId(tree, `mailbox-history-${SAM}`)), "130 emails so far · … · Stop");
  assert.match(said(byTestId(tree, `mailbox-history-${ops}`)), /^Stopped part way · 130 emails kept · Try again$/);
  press(byTestId(tree, `mailbox-history-again-${ops}`));
  await until(() => pressed.length === 4, "Try again pressed through the door");
  assert.deepEqual(pressed.at(-1), ["m2", "resume"], "Try again starts it again where it stopped");
  // One who may not change the mailboxes reads where it stands, and is offered nothing.
  role.owner = false;
  try {
    tree = open([mbx()], null, { imports: [own()] });
    assert.equal(said(byTestId(tree, `mailbox-history-${SAM}`)), "130 emails so far · …");
    assert.equal(byTestId(tree, "mailbox-history-line"), null, "nor a choice of what connecting brings");
  } finally {
    role.owner = true;
  }
  // Add a mailbox, pressed: what connecting brings, and Change opens the two ways in place; the choice rides the connect.
  tree = open([mbx()]);
  assert.equal(byTestId(tree, "mailbox-history-line"), null, "it waits for Add a mailbox");
  press(byTestId(tree, "mailbox-add"));
  tree = redraw();
  assert.equal(said(byTestId(tree, "mailbox-history-line")), `${MAILBOX_HISTORY_WORDS.line.six_months} Change`);
  press(byTestId(tree, "mailbox-history-change"));
  tree = redraw();
  const ways = () => find(tree, (n) => n.type === Segmented && n.props.label === MAILBOX_HISTORY_WORDS.choose);
  assert.deepEqual(
    ways().props.options.map((o) => [o.label, o.hint]),
    [
      ["Last 6 months", MAILBOX_HISTORY_WORDS.ways.six_months.says],
      ["From now on", MAILBOX_HISTORY_WORDS.ways.from_now.says],
    ],
  );
  ways().props.onValueChange("from_now");
  tree = redraw();
  assert.equal(ways().props.value, "from_now");
  press(byTestId(tree, "mailbox-connect-google"));
  await until(() => went.length === 1, "the connect asked");
  assert.deepEqual(went, [["google", null, "from_now"]]);
});
