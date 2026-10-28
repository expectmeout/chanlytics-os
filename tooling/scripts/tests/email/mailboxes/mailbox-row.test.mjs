/**
 * A connected mailbox on Settings › Connections, as the Email card (surfaces/settings/connections/mailboxes-block.tsx
 * EmailCard; the mailbox canvas, 27 Oct 2026), drawn on the stub React: it says what came in through the mailbox (when
 * it was read, who wrote today) and four facts, never its sending ramp, which is the sheet's; it offers the one act the
 * mailbox needs most -- its Settings when nothing needs mending -- and the rest on a caret (Ruben, 20 Oct 2026: no three
 * dots); its foot says how many senders it left today. Its settings open in a sheet beside the page, with the end of an
 * email as the preview of what it signs with. On production (27 Oct 2026) the row spoke its ramp beside six buttons in a
 * row, and its settings unfolded inside a box inside the row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, find, all, byTestId, textOf, press, settle } from "../../_legacy-react.mjs";

installLegacyReact();
const SAM = "sam@getharbor.example";
const CONNECTIONS = "../../../../../apps/dashboard/src/surfaces/settings/connections";
const { EmailCard } = await import(`${CONNECTIONS}/mailboxes-block.tsx`);
const { connectedMailboxes } = await import(`${CONNECTIONS}/connected-mailboxes.ts`);
const { MoreMenu } = await import("../../../../../apps/dashboard/src/surfaces/kit/more-menu/more-menu.tsx");
const { Segmented } = await import("../../../../../apps/dashboard/src/surfaces/kit/segmented/segmented.tsx");

// Who is acting: the frame's gate asks the role store; here an owner, or a member who may not change the mailboxes.
const role = { owner: true };
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
/** The card for these mailboxes, drawn fresh; `left` is the senders Setup says were left today. */
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
/** The Email card, whole: its words, state, act, facts and foot. */
const cardOf = (tree) => byTestId(tree, "connection-mailbox");
/** Its facts, each "label: value". */
const factsOf = (tree) =>
  all(byTestId(tree, "mailbox-facts"), (n) => n.props?.className === "set-mbx-fact").map((n) =>
    n.props.children.map((c) => said(c)).join(": "),
  );
/** Its settings sheet, opened by its act (Settings, when nothing needs mending), the card drawn again after. */
const openSettings = (tree, address) => {
  press(byTestId(tree, `mailbox-settings-${address}`));
  return redraw();
};
/** The sheet's Save (the record kit's foot, kit/record/sheet.tsx). */
const saveOf = (tree) => byTestId(tree, "rec-sheet-save-mailbox");
/** A mailbox's caret: the kit's menu beside its one act; null where it has none. */
const caretOf = (tree, address) =>
  find(tree, (n) => n.type === MoreMenu && n.props.testid === `mailbox-more-${address}`);
const caretWords = (tree, address) =>
  (caretOf(tree, address)?.props.items ?? []).flatMap((it) => (it.label ? [it.label] : []));
/** An item on a mailbox's caret, by its words, chosen as the menu chooses it; the block drawn again after. */
const choose = (tree, address, words) => {
  const it = caretOf(tree, address).props.items.find((i) => i.label === words);
  assert.ok(it, `${address}'s caret holds ${words}`);
  it.onClick();
  return redraw();
};

test("the card says what came in through it, its facts, and in its foot what it left, never the ramp", () => {
  const read = new Date(Date.now() - 2 * 60_000).toISOString();
  const at = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(read));
  let tree = open([mbx({ synced_at: read, came_in: 3, sent_today: 20 })], 9);
  const card = cardOf(tree);
  assert.equal(said(byTestId(tree, `mailbox-${SAM}`)), `${SAM} · Google`, "its address and where it lives");
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), `Read at ${at} · 3 people wrote today`);
  assert.doesNotMatch(said(card), /ramp|of 20 today/, "its day and its ramp are its sheet's");
  assert.match(said(card), /Connected/, "a mailbox at its sending cap still reads");
  assert.ok(said(card).startsWith("Email"), "the card is named Email");
  assert.match(
    said(byTestId(tree, "mailbox-left")),
    /^Left in your mailbox · 9 senders today(Show who)?$/,
    "a count, no sentence",
  );
  tree = open([mbx({ synced_at: read, came_in: 0 })], 1);
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), `Read at ${at} · No one wrote today`);
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox · 1 sender today/);
  tree = open([mbx()]);
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), "Not read yet", "an unread count is left out");
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox(?! ·)/, "an unread count is not said");
});

test("one act and a caret: its Settings, the rest on the caret, its Sending lines in its sheet", async () => {
  const tested = [];
  Object.assign(connectedMailboxes, { test: async (id) => (tested.push(id), { ok: true, data: {} }) });
  let tree = open([
    mbx({ sent_today: 12, counts: { sent: 250, bounced: 1, blocked: 0, complained: 0, unsubscribed: 0, said_no: 2 } }),
  ]);
  const acts = find(tree, (n) => n.props?.className === "set-mbx-acts");
  assert.ok(acts, "the act and its caret are one split pill");
  assert.equal(said(byTestId(tree, `mailbox-settings-${SAM}`)), "Settings");
  for (const gone of ["pause", "check", "test", "remove"])
    assert.equal(byTestId(tree, `mailbox-${gone}-${SAM}`), null, `${gone} is not a button of the row`);
  assert.deepEqual(caretWords(tree, SAM), ["Send a test", "Pause sending", "Remove…"], "acts alone, no state");
  assert.match(caretOf(tree, SAM).props.btnClass, /set-mbx-caret/);
  assert.equal(caretOf(tree, SAM).props.icon, "chevron-down", "a caret, never three dots");
  choose(tree, SAM, "Send a test");
  await settle();
  assert.deepEqual(tested, ["m1"]);
  tree = openSettings(redraw(), SAM);
  assert.ok(byTestId(tree, `mailbox-sheet-${SAM}`), "its settings are a sheet, not a box in the row");
  const lines = said(byTestId(tree, `mailbox-sending-${SAM}`));
  // The ramp reads the days it sent (D15): nine, so its second step's 20 a day, and 30 after five more.
  assert.match(lines, /12 of 20 today/);
  assert.match(lines, /Day 10 of its ramp · 20 a day, 30 after 5 more days of sending/);
  assert.match(lines, /0\.4% bounced · 2 said no · none marked as spam/);
});

test("its facts: what came in, as the ledger says it, then what it sends and signs as", async () => {
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
  assert.deepEqual(
    factsOf(tree),
    [`Inbox: ${importLineOf(imports[0]).says}`, "Sends: Up to 40 a day", "Signs as: Sam at Harbor"],
    "the ledger's own line; no Contacts with nothing to say; with no signature in Gmail, its name ends its emails",
  );
  tree = open([mbx({ signs: { from: "none", words: null, gmail_read_at: null, gmail: null } })]);
  assert.deepEqual(factsOf(tree), ["Sends: Up to 40 a day", "Signs as: No signature"]);
  tree = open([mbx({ signs: { from: "own", words: "Sam Reyes\nHarbor Moving", gmail_read_at: null, gmail: null } })]);
  assert.equal(factsOf(tree).at(-1), "Signs as: Sam Reyes", "its first line");
});

test("a stopped six months says so on the card, with Try again, the first run's own door (the live walk's TODAY-3, 27 Oct 2026)", async () => {
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
    assert.match(
      factsOf(tree)[0],
      /^Inbox: Stopped part way · 130 emails kept/,
      "it says it stopped, and what it kept",
    );
    assert.doesNotMatch(factsOf(tree)[0], /· Stopped/, "and says Stopped once");
    const again = byTestId(tree, "mailbox-import-again-mailbox");
    assert.equal(said(again), "Try again");
    press(again);
    await settle();
    tree = redraw();
    assert.deepEqual(asked, ["mailbox"], "the run starts again where it stopped");
    assert.equal(said(byTestId(tree, "mailbox-import-again-mailbox")), "Starting");
    // Done, the card says what came in, and offers nothing to press.
    tree = open([mbx()], null, { imports: [{ ...imports[0], state: "done", last_error: null }] });
    assert.equal(byTestId(tree, "mailbox-import-again-mailbox"), null);
  } finally {
    setupVerbs.importAgain = was;
  }
});

test("the act is the one its mailbox needs most: Reconnect, Resume, Set up DNS, Unpause", async () => {
  const went = [];
  const set = [];
  Object.assign(connectedMailboxes, {
    connect: async (p, id) => (went.push([p, id ?? null]), { ok: true, data: { url: "https://provider.example/" } }),
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
  });
  let tree = open([mbx({ state: "reconnect", synced_at: new Date().toISOString(), came_in: 4 })]);
  assert.match(said(cardOf(tree)), /Google signed it out: nothing is read from it or sent/);
  assert.equal(byTestId(tree, `mailbox-came-in-${SAM}`), null, "signed out: nothing is read");
  const reconnect = byTestId(tree, `mailbox-reconnect-${SAM}`);
  assert.equal(reconnect.props.variant, "primary");
  assert.match(caretOf(tree, SAM).props.btnClass, /btn-primary/, "its caret wears the act's fill");
  assert.deepEqual(caretWords(tree, SAM), ["Settings", "Remove…"]);
  press(reconnect);
  await settle();
  assert.deepEqual(went, [["google", "m1"]], "Reconnect goes back to its own provider, for its own mailbox");

  tree = open([mbx({ state: "held", held_why: "bounces", held_at: "2026-10-01T12:00:00Z" })]);
  assert.match(said(cardOf(tree)), /Its sending is held since Oct 1: .*bounced/);
  press(byTestId(tree, `mailbox-resume-${SAM}`));
  tree = redraw();
  assert.match(said(tree), /Resume sam@getharbor\.example\?/, "asked first");
  assert.ok(!caretWords(open([mbx({ state: "held" })]), SAM).includes("Send a test"), "a held mailbox sends no test");

  tree = open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]);
  assert.equal(said(byTestId(tree, `mailbox-dns-${SAM}`)), "Set up DNS", "a record missing: Set up DNS is its act");
  assert.ok(caretWords(tree, SAM).includes("Send a test"), "and the test waits on its caret");
  assert.equal(
    said(byTestId(tree, `mailbox-need-${SAM}`)),
    "2 DNS records to add · 1 of 3 found",
    "one line where the records stood",
  );
  assert.equal(byTestId(tree, "mailbox-dns-spf"), null, "its records are its DNS sheet's, not the card's");

  tree = open([mbx({ state: "paused" })]);
  assert.match(said(cardOf(tree)), /You paused its sending: what people write still comes in/);
  assert.equal(said(byTestId(tree, `mailbox-pause-${SAM}`)), "Unpause");
  press(byTestId(tree, `mailbox-pause-${SAM}`));
  await settle();
  assert.deepEqual(set, [["m1", { paused: false }]]);
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
  try {
    let tree = open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]);
    press(byTestId(tree, `mailbox-dns-${SAM}`));
    tree = redraw();
    const sheet = byTestId(tree, `mailbox-dns-sheet-${SAM}`);
    assert.ok(sheet, "Set up DNS opens its records in a sheet");
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
  let changed = open([
    mbx({
      dns: { spf: "missing", dkim: "found", dmarc: "found" },
      spf_record: "v=spf1 include:mailgun.org ~all",
      spf_lookups: 2,
    }),
  ]);
  assert.equal(said(byTestId(changed, `mailbox-need-${SAM}`)), "1 DNS record to add · 2 of 3 found");
  press(byTestId(changed, `mailbox-dns-${SAM}`));
  changed = redraw();
  assert.match(said(byTestId(changed, "mailbox-dns-spf")), /^Sender \(SPF\)TXTChange this/);
  assert.match(
    said(byTestId(changed, "mailbox-dns-spf")),
    /v=spf1 include:mailgun\.org include:_spf\.google\.com ~all/,
  );
  assert.match(said(byTestId(changed, "mailbox-record-note-spf")), /may have only one/);
});

test("the owner's acts from the caret: pause at once, settings judged before they are sent, remove asked first", async () => {
  const set = [];
  const removed = [];
  Object.assign(connectedMailboxes, {
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
    remove: async (id) => (removed.push(id), { ok: true, data: { removed: true } }),
  });
  let tree = open([mbx()]);
  choose(tree, SAM, "Pause sending");
  await settle();
  assert.deepEqual(set, [["m1", { paused: true }]]);
  tree = openSettings(redraw(), SAM);
  const field = (id) => find(byTestId(tree, id), (n) => n.type === "input" || n.type === "textarea");
  field("mailbox-cap").props.onChange({ target: { value: "80" } });
  tree = redraw();
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-cap")), /Between 1 and 40 a day/, "judged under its box");
  assert.equal(set.length, 1, "nothing is sent that the rules already refuse");
  field("mailbox-cap").props.onChange({ target: { value: "25" } });
  tree = redraw();
  press(saveOf(tree));
  await settle();
  // With nothing of its own written, it stands on Gmail's (00487): a save keeps it there, and the edge reads it again.
  assert.deepEqual(set[1], [
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
  assert.deepEqual(set[2][1], {
    from_name: "Sam at Harbor",
    signature: null,
    signature_off: false,
    daily_cap: 40,
    paused: true,
  });
  // Remove, from the caret or the sheet, is asked first.
  tree = choose(redraw(), SAM, "Remove…");
  assert.deepEqual(removed, [], "asked first");
  assert.match(said(tree), /Remove sam@getharbor\.example\?/);
  tree = openSettings(open([mbx()]), SAM);
  press(byTestId(tree, "mailbox-remove-ask"));
  tree = redraw();
  assert.match(said(byTestId(tree, `mailbox-sheet-${SAM}`)), /Remove sam@getharbor\.example\?/, "the sheet asks first");
  assert.deepEqual(removed, []);
});

test("a member who may not change the mailboxes reads them and their settings, is told once why, and finds no Remove", () => {
  role.owner = false;
  try {
    const tree = open([mbx()]);
    assert.match(said(byTestId(tree, "mailbox-gate")), /Only an owner can connect, pause, resume or remove a mailbox/);
    assert.deepEqual(caretWords(tree, SAM), ["Send a test", "Pause sending"]);
    const pause = caretOf(tree, SAM).props.items.find((i) => i.label === "Pause sending");
    assert.equal(pause.gate["data-gated"], "pause a mailbox", "Pause says why it can't");
    const test = caretOf(tree, SAM).props.items.find((i) => i.label === "Send a test");
    assert.equal(test.gate["data-gated"], "send a test");
    // Its settings are read, never changed: the sheet opens with no Save, its boxes held.
    const sheet = openSettings(tree, SAM);
    assert.ok(byTestId(sheet, `mailbox-sheet-${SAM}`));
    assert.equal(saveOf(sheet), null, "no Save for a role that may not");
    assert.equal(find(byTestId(sheet, "mailbox-cap"), (n) => n.type === "input").props.disabled, true);
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

test("what it signs with (00487): Gmail's, said as words with when it was read; their own words; or none", async () => {
  const set = [];
  Object.assign(connectedMailboxes, {
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
  });
  const read = "2026-10-27T17:55:00.000Z";
  const gmail = "Sam Reyes\nHarbor Moving";
  const signs = { from: "gmail", words: gmail, gmail_read_at: read, gmail };
  let tree = openSettings(open([mbx({ signs })]), SAM);
  const choice = () => find(tree, (n) => n.type === Segmented);
  const preview = () => said(byTestId(tree, "mailbox-preview"));
  const signedWith = () => said(byTestId(tree, "mailbox-preview-sig"));
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
  assert.match(shown, /Read from Gmail at .+\. Saving reads it again\./);
  assert.equal(byTestId(tree, "mailbox-signature"), null, "their own words' box is for Write one");
  assert.equal(signedWith(), "Sam Reyes Harbor Moving", "the preview ends the email as the send will");

  choice().props.onValueChange("own");
  tree = redraw();
  assert.equal(byTestId(tree, "mailbox-preview-sig"), null, "nothing written yet: nothing to show");
  assert.match(preview(), /Write it above: it goes here\.$/);
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-signature")), /Write the signature, or choose another\./);
  assert.equal(set.length, 0, "an empty signature of their own is not sent");
  find(byTestId(tree, "mailbox-signature"), (n) => n.type === "textarea").props.onChange({
    target: { value: "Sam · Harbor" },
  });
  tree = redraw();
  assert.equal(signedWith(), "Sam · Harbor", "what is typed is what they read");
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
  assert.match(preview(), /Nothing under it, not even its name\.$/);
  assert.equal(byTestId(tree, "mailbox-preview-sig"), null);
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
