/**
 * A connected mailbox's row on Settings › Connections (surfaces/settings/connections/mailboxes-block.tsx), drawn on the
 * stub React: it says what came in through the mailbox (when it was read, who wrote today), never its sending ramp,
 * which is its Sending lines, a press away; it offers the one act the mailbox needs most, and the rest on a caret
 * (Ruben, 20 Oct 2026: no three dots); the list under it says how many senders it left today. On production (27 Oct
 * 2026) the row spoke its ramp ("0 of 10 today · New: its ramp starts today…") beside six buttons in a row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, find, byTestId, textOf, press, settle } from "../../_legacy-react.mjs";

installLegacyReact();
const CONNECTIONS = "../../../../../apps/dashboard/src/surfaces/settings/connections";
const { ConnectedMailboxes } = await import(`${CONNECTIONS}/mailboxes-block.tsx`);
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
const redraw = () => again(() => globalThis.React.createElement(ConnectedMailboxes, props));
/** The block for these mailboxes, drawn fresh; `left` is the senders Setup says were left today. */
const open = (mailboxes, left = null) => {
  fresh();
  flashes.length = 0;
  props = {
    email: {
      ready: true,
      domain: "mail.example.com",
      mailbox: null,
      sending: { providers: ["google"], mailboxes, left_today: left },
    },
    flash: (f) => flashes.push(f),
    note: null,
    onNote() {},
  };
  return redraw();
};
const said = (n) => textOf(n).replace(/\s+/g, " ").trim();
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

const SAM = "sam@getharbor.example";

test("the row says what came in through it, and the list under it what it left, never the ramp", () => {
  const read = new Date(Date.now() - 2 * 60_000).toISOString();
  const at = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(read));
  let tree = open([mbx({ synced_at: read, came_in: 3, sent_today: 20 })], 9);
  const row = byTestId(tree, `mailbox-${SAM}`);
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), `Read at ${at} · 3 people wrote today`);
  assert.doesNotMatch(said(row), /a day|ramp|of 20 today/, "its day and its ramp are its Sending lines'");
  assert.match(said(row), /Connected/, "a mailbox at its sending cap still reads");
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox · 9 senders today/);
  tree = open([mbx({ synced_at: read, came_in: 0 })], 1);
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), `Read at ${at} · No one wrote today`);
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox · 1 sender today/);
  tree = open([mbx()]);
  assert.equal(said(byTestId(tree, `mailbox-came-in-${SAM}`)), "Not read yet", "an unread count is left out");
  assert.match(said(byTestId(tree, "mailbox-left")), /^Left in your mailbox(?! ·)/, "an unread count is not said");
});

test("one act and a caret: a sending mailbox's test, the rest on the caret, its Sending lines a press away", async () => {
  const tested = [];
  Object.assign(connectedMailboxes, { test: async (id) => (tested.push(id), { ok: true, data: {} }) });
  let tree = open([
    mbx({ sent_today: 12, counts: { sent: 250, bounced: 1, blocked: 0, complained: 0, unsubscribed: 0, said_no: 2 } }),
  ]);
  const acts = find(tree, (n) => n.props?.className === "set-mbx-acts");
  assert.ok(acts, "the act and its caret are one split pill");
  assert.equal(said(byTestId(tree, `mailbox-test-${SAM}`)), "Send a test");
  for (const gone of ["pause", "check", "settings-open", "remove"])
    assert.equal(byTestId(tree, `mailbox-${gone}-${SAM}`), null, `${gone} is not a button of the row`);
  assert.deepEqual(caretWords(tree, SAM), ["Sending", "Pause sending", "Settings", "Remove…"]);
  assert.match(caretOf(tree, SAM).props.btnClass, /set-mbx-caret/);
  assert.equal(caretOf(tree, SAM).props.icon, "chevron-down", "a caret, never three dots");
  press(byTestId(tree, `mailbox-test-${SAM}`));
  await settle();
  assert.deepEqual(tested, ["m1"]);
  tree = choose(redraw(), SAM, "Sending");
  const lines = said(byTestId(tree, `mailbox-sending-${SAM}`));
  // The ramp reads the days it sent (D15): nine, so its second step's 20 a day, and 30 after five more.
  assert.match(lines, /12 of 20 today/);
  assert.match(lines, /Day 10 of its ramp · 20 a day, 30 after 5 more days of sending/);
  assert.match(lines, /0\.4% bounced · 2 said no · none marked as spam/);
  assert.ok(byTestId(tree, `mailbox-test-${SAM}`), "the row keeps its act while its lines are open");
  press(byTestId(tree, `mailbox-sending-hide-${SAM}`));
  tree = redraw();
  assert.equal(byTestId(tree, `mailbox-sending-${SAM}`), null);
});

test("the act is the one its mailbox needs most: Reconnect, Resume, Check, Unpause", async () => {
  const went = [];
  const set = [];
  Object.assign(connectedMailboxes, {
    connect: async (p, id) => (went.push([p, id ?? null]), { ok: true, data: { url: "https://provider.example/" } }),
    set: async (id, s) => (set.push([id, s]), { ok: true, data: { mailbox: null } }),
  });
  let tree = open([mbx({ state: "reconnect", synced_at: new Date().toISOString(), came_in: 4 })]);
  assert.match(said(byTestId(tree, `mailbox-${SAM}`)), /Google signed it out: nothing is read from it or sent/);
  assert.equal(byTestId(tree, `mailbox-came-in-${SAM}`), null, "signed out: nothing is read");
  const reconnect = byTestId(tree, `mailbox-reconnect-${SAM}`);
  assert.equal(reconnect.props.variant, "primary");
  assert.match(caretOf(tree, SAM).props.btnClass, /btn-primary/, "its caret wears the act's fill");
  assert.deepEqual(caretWords(tree, SAM), ["Settings", "Remove…"]);
  press(reconnect);
  await settle();
  assert.deepEqual(went, [["google", "m1"]], "Reconnect goes back to its own provider, for its own mailbox");

  tree = open([mbx({ state: "held", held_why: "bounces", held_at: "2026-10-01T12:00:00Z" })]);
  assert.match(said(byTestId(tree, `mailbox-${SAM}`)), /Its sending is held since Oct 1: .*bounced/);
  press(byTestId(tree, `mailbox-resume-${SAM}`));
  tree = redraw();
  assert.match(said(tree), /Resume sam@getharbor\.example\?/, "asked first");
  assert.ok(!caretWords(open([mbx({ state: "held" })]), SAM).includes("Send a test"), "a held mailbox sends no test");

  tree = open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]);
  assert.equal(said(byTestId(tree, `mailbox-check-${SAM}`)), "Check", "a record missing: Check is its act");
  assert.ok(caretWords(tree, SAM).includes("Send a test"), "and the test waits on its caret");
  assert.match(said(byTestId(tree, `mailbox-${SAM}`)), /Add its DKIM and DMARC record below/);

  tree = open([mbx({ state: "paused" })]);
  assert.match(said(byTestId(tree, `mailbox-${SAM}`)), /You paused its sending: what people write still comes in/);
  assert.equal(said(byTestId(tree, `mailbox-pause-${SAM}`)), "Unpause");
  press(byTestId(tree, `mailbox-pause-${SAM}`));
  await settle();
  assert.deepEqual(set, [["m1", { paused: false }]]);
});

test("its domain's records draw while one is missing: SPF and DMARC to copy, DKIM where to turn it on", () => {
  const tree = open([mbx({ dns: { spf: "found", dkim: "missing", dmarc: "missing" } })]);
  const text = said(byTestId(tree, `mailbox-records-${SAM}`));
  assert.match(text, /Sender \(SPF\)/);
  assert.match(text, /include:_spf\.google\.com/);
  assert.match(text, /Google Admin console/);
  assert.match(text, /v=DMARC1; p=none;/);
  assert.ok(byTestId(tree, "mailbox-copy-spf"), "SPF has its Copy");
  assert.ok(byTestId(tree, "mailbox-copy-dmarc"), "and DMARC");
  assert.equal(byTestId(tree, "mailbox-copy-dkim"), null, "DKIM is made where the mailbox lives: nothing to paste");
  const changed = open([
    mbx({
      dns: { spf: "missing", dkim: "found", dmarc: "found" },
      spf_record: "v=spf1 include:mailgun.org ~all",
      spf_lookups: 2,
    }),
  ]);
  assert.match(said(byTestId(changed, `mailbox-${SAM}`)), /Change its SPF record below/);
  assert.match(
    said(byTestId(changed, `mailbox-records-${SAM}`)),
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
  tree = choose(redraw(), SAM, "Settings");
  assert.equal(caretOf(tree, SAM), null, "no acts while its settings are open");
  const field = (id) => find(byTestId(tree, id), (n) => n.type === "input" || n.type === "textarea");
  field("mailbox-cap").props.onChange({ target: { value: "80" } });
  tree = redraw();
  press(byTestId(tree, "mailbox-save"));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-cap")), /Between 1 and 40 a day/, "judged under its box");
  assert.equal(set.length, 1, "nothing is sent that the rules already refuse");
  field("mailbox-cap").props.onChange({ target: { value: "25" } });
  tree = redraw();
  press(byTestId(tree, "mailbox-save"));
  await settle();
  // With nothing of its own written, it stands on Gmail's (00487): a save keeps it there, and the edge reads it again.
  assert.deepEqual(set[1], [
    "m1",
    { from_name: "Sam at Harbor", signature: null, signature_off: false, daily_cap: 25 },
  ]);
  tree = choose(redraw(), SAM, "Remove…");
  assert.deepEqual(removed, [], "asked first");
  assert.match(said(tree), /Remove sam@getharbor\.example\?/);
});

test("a member who may not change the mailboxes reads them, is told once why, and finds no Settings or Remove", () => {
  role.owner = false;
  try {
    const tree = open([mbx()]);
    assert.match(
      said(byTestId(tree, "connected-mailboxes")),
      /Only an owner can connect, pause, resume or remove a mailbox/,
    );
    assert.deepEqual(caretWords(tree, SAM), ["Sending", "Pause sending"]);
    const pause = caretOf(tree, SAM).props.items.find((i) => i.label === "Pause sending");
    assert.equal(pause.gate["data-gated"], "pause a mailbox", "Pause says why it can't");
    assert.equal(byTestId(tree, `mailbox-test-${SAM}`).props["data-gated"], "send a test");
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
  let tree = choose(open([mbx({ signs })]), SAM, "Settings");
  const choice = () => find(tree, (n) => n.type === Segmented);
  assert.equal(choice().props.value, "gmail", "it stands on Gmail's");
  assert.deepEqual(
    choice().props.options.map((o) => o.label),
    ["From Gmail", "Write one", "None"],
  );
  const shown = said(byTestId(tree, "mailbox-signs-said"));
  assert.match(shown, /^Sam Reyes Harbor Moving/, "Gmail's signature, as words");
  assert.match(shown, /Read from Gmail at .+\. Saving reads it again\./);
  assert.equal(byTestId(tree, "mailbox-signature"), null, "their own words' box is for Write one");

  choice().props.onValueChange("own");
  tree = redraw();
  press(byTestId(tree, "mailbox-save"));
  await settle();
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-signature")), /Write the signature, or choose another\./);
  assert.equal(set.length, 0, "an empty signature of their own is not sent");
  find(byTestId(tree, "mailbox-signature"), (n) => n.type === "textarea").props.onChange({
    target: { value: "Sam · Harbor" },
  });
  tree = redraw();
  press(byTestId(tree, "mailbox-save"));
  await settle();
  assert.deepEqual(set[0][1], {
    from_name: "Sam at Harbor",
    signature: "Sam · Harbor",
    signature_off: false,
    daily_cap: 40,
  });

  const own = { ...signs, from: "own", words: "Sam · Harbor" };
  tree = choose(open([mbx({ signs: own, signature: "Sam · Harbor" })]), SAM, "Settings");
  assert.equal(choice().props.value, "own", "the page's row says what it signs with now");
  choice().props.onValueChange("none");
  tree = redraw();
  assert.match(said(byTestId(tree, "mailbox-signs-said")), /Nothing goes under its emails, not even its name\./);
  press(byTestId(tree, "mailbox-save"));
  await settle();
  assert.deepEqual(
    set[1][1],
    { from_name: "Sam at Harbor", signature_off: true, daily_cap: 40 },
    "their words are kept",
  );
});

test("a mailbox whose Gmail has no signature ends its emails with its name, and says so", () => {
  const tree = choose(open([mbx()]), SAM, "Settings");
  const shown = said(byTestId(tree, "mailbox-signs-said"));
  assert.match(shown, /^Sam at Harbor/);
  assert.match(
    shown,
    /Gmail has none for this address, so its emails end with its name\. Saving reads it from Gmail now\./,
  );
});
