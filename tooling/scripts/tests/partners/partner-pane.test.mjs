/**
 * Settings › Partner (decision 0012), drawn: pages/partner-real.jsx on the stub React, over data-bits and the real
 * bridge (legacy-bridge/partner.ts). Reading, a failed read, the offer and its one press, and a partner's link, share,
 * earnings and count, every sentence contracts'. And the rail: the tab is on the account, beside Profile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDOVER_WORDS, PARTNER_WORDS, SECOND_FACTOR_WORDS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact();
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { installPartner } = await import("../../../../apps/dashboard/src/legacy-bridge/partner.ts");
await import("../../../../apps/dashboard/src/legacy/pages/partner-real.jsx");

const flashes = [];
const flash = (f) => flashes.push(f);
const draw = () => {
  fresh();
  return again(() => globalThis.React.createElement(globalThis.window.PanePartner, { flash }));
};
const redraw = () => again(() => globalThis.React.createElement(globalThis.window.PanePartner, { flash }));

const ROW = {
  id: "p1",
  code: "ada",
  status: "active",
  share_bp: 2500,
  terms_accepted_at: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T12:00:00Z",
};

installPartner(globalThis.window);
/** The workspaces read, answered by the test. */
let workspacesSay = { ok: true, vm: { rows: [], summary: "No workspace has you as its partner yet." } };
const opened = [];
globalThis.window.__partner.workspaces = async () => workspacesSay;
globalThis.window.__partner.open = (id) => opened.push(id);

test("while it reads, it says so; a read that failed says so with a retry, never an empty offer", () => {
  delete globalThis.window.__PARTNER;
  assert.equal(textOf(byTestId(draw(), "partner-loading")).includes(PARTNER_WORDS.reading), true);
  globalThis.window.__PARTNER = null;
  assert.ok(byTestId(draw(), "partner-failed"));
});

test("the offer: the share every new account starts with, the terms, and a press that waits for the agreement and the second factor", async () => {
  globalThis.window.__PARTNER = { dto: null, balance: [], fetchedAt: 0 };
  const factor = factorStub();
  globalThis.window.__partner.secondFactor = factor.api;
  const asked = [];
  globalThis.window.__partner.become = async (code) => {
    asked.push(code);
    if (code === "taken") return { ok: false, message: "That code is taken. Try another." };
    globalThis.window.__PARTNER = { dto: { ...ROW, code }, balance: [], fetchedAt: 1 };
    return { ok: true, message: "" };
  };
  draw();
  await settle();
  let tree = redraw();
  assert.match(textOf(byTestId(tree, "partner-offer")), /The share is 25% of what it pays for its plan\.$/);
  assert.equal(textOf(byTestId(tree, "partner-terms")), PARTNER_WORDS.terms);
  assert.equal(byTestId(tree, "partner-become").props.disabled, true, "nothing to send before a code and a yes");

  byTestId(tree, "partner-code").props.onChange({ target: { value: "taken" } });
  byTestId(redraw(), "partner-agree").props.onChange({ target: { checked: true } });
  tree = redraw();
  // Two-step sign-in first (0013, M3): partner_become asks for a session that showed a code.
  assert.equal(textOf(byTestId(tree, "partner-factor-first")), SECOND_FACTOR_WORDS.becomeFirst);
  assert.equal(byTestId(tree, "partner-become").props.disabled, true, "not before the second factor is on");
  await byTestId(tree, "partner-become-form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(asked, [], "a press before it sends nothing");
  press(byTestId(redraw(), "partner-second-factor-start"));
  await settle();
  byTestId(redraw(), "partner-second-factor-code").props.onChange({ target: { value: "123456" } });
  await byTestId(redraw(), "partner-second-factor-setup").props.onSubmit({ preventDefault() {} });
  await settle();
  redraw(); // the row says it is on, and tells the offer
  tree = redraw();
  assert.equal(byTestId(tree, "partner-factor-first"), null);
  assert.equal(byTestId(tree, "partner-become").props.disabled, false);
  await byTestId(tree, "partner-become-form").props.onSubmit({ preventDefault() {} });
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-error")), "That code is taken. Try another.", "the door's own words");

  byTestId(tree, "partner-code").props.onChange({ target: { value: "ada" } });
  await byTestId(redraw(), "partner-become-form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(asked, ["taken", "ada"]);
  assert.equal(flashes.at(-1).tone, "ok");
});

test("a partner: the link on this origin, the row's share, the ledger's sums, and how many came through the link", () => {
  globalThis.window.__WORKSPACES = [
    { id: "a", slug: "a", name: "Mine", role: "owner" },
    { id: "b", slug: "b", name: "Bayside", role: "partner" },
    { id: "c", slug: "c", name: "Harbor", role: "partner" },
  ];
  globalThis.window.__PARTNER = {
    dto: { ...ROW, share_bp: 2000 },
    balance: [
      { currency: "usd", state: "held", earned_cents: 10000, next_payable_at: "2036-10-26T00:00:00Z" },
      { currency: "usd", state: "payable", earned_cents: 5000, next_payable_at: null },
    ],
    fetchedAt: 1,
  };
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "partner-link")), "https://app.chanlytics.com/p/ada");
  assert.equal(textOf(byTestId(tree, "partner-share")), "20% of what it pays for its plan, for as long as it pays.");
  assert.equal(
    textOf(byTestId(tree, "partner-held")),
    "$100.00 held, the first of it payable from Oct 26 at the earliest.",
  );
  assert.equal(textOf(byTestId(tree, "partner-payable")), "$50.00 payable.");
  assert.equal(textOf(byTestId(tree, "partner-paid")), "$0.00 paid to date.", "a zero is said as a zero");
  assert.equal(textOf(byTestId(tree, "partner-brought")), "2 workspaces have you as their partner.");
  assert.equal(byTestId(tree, "partner-standing"), null);
});

test("nothing on the ledger yet is said once, and a paused account leads with why", () => {
  globalThis.window.__PARTNER = { dto: { ...ROW, status: "paused" }, balance: [], fetchedAt: 1 };
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "partner-earnings-none")), PARTNER_WORDS.noneYet);
  assert.equal(byTestId(tree, "partner-held"), null);
  assert.equal(textOf(byTestId(tree, "partner-standing")), PARTNER_WORDS.paused);
});

test("the link copies, and a copy the browser refuses says what to do instead", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  const copied = [];
  // Node's own navigator is a getter: the page's is set the way a browser would have it.
  const clip = (writeText) =>
    Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText } }, configurable: true });
  clip(async (t) => copied.push(t));
  await press(byTestId(draw(), "partner-copy"));
  assert.deepEqual(copied, ["https://app.chanlytics.com/p/ada"]);
  assert.equal(textOf(byTestId(redraw(), "partner-copy")).trim(), PARTNER_WORDS.copied);
  clip(async () => {
    throw new Error("denied");
  });
  await press(byTestId(draw(), "partner-copy"));
  assert.equal(flashes.at(-1).tone, "warn");
});

test("under the account, the workspaces brought: reading, then the back office's rows, and Open goes into one the way the switcher does", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = {
    ok: true,
    vm: {
      summary: "2 workspaces · 1 live",
      rows: [
        {
          tenantId: "t1",
          slug: "harbor",
          name: "Harbor Moving",
          verdict: "live",
          label: "Live",
          tone: "ok",
          sentence: "Answering.",
          facts: "paying · answering",
          standing: null,
          money: "$100.00 to date",
          onTeam: true,
        },
        {
          tenantId: "t2",
          slug: null,
          name: "Old Client",
          verdict: null,
          label: "Off the team",
          tone: "plain",
          sentence: "Its owner took you off its team.",
          facts: null,
          standing: "Under review.",
          money: "$0.00",
          onTeam: false,
        },
      ],
    },
  };
  assert.ok(byTestId(draw(), "partner-workspaces-reading"), "reading, while it reads");
  await settle();
  const tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-workspaces-summary")), "2 workspaces · 1 live");
  assert.match(
    textOf(byTestId(tree, "partner-spend")),
    /waits until its owner pays for a plan/,
    "what waits on the owner is said where the workspaces are",
  );
  const live = byTestId(tree, "partner-workspace-t1");
  assert.ok(textOf(live).includes("Harbor Moving") && textOf(live).includes("$100.00 to date"));
  press(byTestId(tree, "partner-open-t1"));
  assert.deepEqual(opened, ["t1"]);
  const off = byTestId(tree, "partner-workspace-t2");
  assert.ok(
    textOf(off).includes("Its owner took you off its team. Under review."),
    "the standing rides with the sentence",
  );
  assert.equal(byTestId(tree, "partner-open-t2"), null, "no way into a business that removed you");
});

test("a workspaces read that failed says so with a retry, and the account above it stands", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: false, message: "Could not reach the server." };
  draw();
  await settle();
  const tree = redraw();
  assert.ok(byTestId(tree, "partner-workspaces-failed"));
  assert.ok(byTestId(tree, "partner-link"), "the link is still there");
});

test("the daily letter (0014): a switch showing what is kept, pressed through the bridge; none on an older server", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  assert.equal(byTestId(draw(), "partner-letters-row"), null, "no letters on the row: no switch");
  globalThis.window.__PARTNER = { dto: { ...ROW, letters: true }, balance: [], fetchedAt: 1 };
  const asked = [];
  let answer = { ok: true, message: "" };
  globalThis.window.__partner.setLetters = async (on) => (asked.push(on), answer);
  let tree = draw();
  const box = byTestId(tree, "partner-letters");
  assert.equal(box.props.checked, true);
  assert.equal(textOf(byTestId(tree, "partner-letters-row")), PARTNER_WORDS.letters);
  await box.props.onChange({ target: { checked: false } });
  assert.deepEqual(asked, [false]);
  flashes.length = 0;
  answer = { ok: false, message: "Too many email settings changed. Try again in a while." };
  await byTestId(redraw(), "partner-letters").props.onChange({ target: { checked: false } });
  assert.equal(flashes.length, 1);
  assert.equal(flashes[0].tone, "warn", "a refusal is said, and the switch stays what the server kept");
});

/* ------------------------------------------------------------ a workspace set up for a business (0016) */

const EMPTY = { summary: "No workspace has you as its partner yet.", rows: [] };
const waitingRow = (over = {}) => ({
  tenantId: "t9",
  name: "Luna Studio",
  email: "owner@luna.example",
  state: "waiting",
  sentence: "Waiting for its owner: sent to o…@luna.example, open until Oct 11.",
  canResend: true,
  ...over,
});

test("set up a workspace for a business: said before it starts, one form, the database's words on a refusal, and a send that failed said", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  const asked = [];
  globalThis.window.__partner.setUp = async (input) => {
    asked.push(input);
    if (input.email === "ada@example.com")
      return { ok: false, message: "That is your own address. Enter the business owner's." };
    return { ok: true, sent: false };
  };
  draw();
  await settle();
  let tree = redraw();
  assert.equal(
    textOf(byTestId(tree, "partner-setup-intro")),
    HANDOVER_WORDS.intro,
    "what happens, before anything is made",
  );
  assert.equal(byTestId(tree, "partner-setup-form"), null, "a press opens the form");
  press(byTestId(tree, "partner-setup-open"));
  tree = redraw();
  assert.equal(
    byTestId(tree, "partner-setup-make").props.disabled,
    true,
    "nothing to send before a name and an address",
  );
  byTestId(tree, "partner-setup-name").props.onChange({ target: { value: "Luna Studio" } });
  byTestId(redraw(), "partner-setup-email").props.onChange({ target: { value: "ada@example.com" } });
  tree = redraw();
  await byTestId(tree, "partner-setup-form").props.onSubmit({ preventDefault() {} });
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-setup-error")), "That is your own address. Enter the business owner's.");
  byTestId(tree, "partner-setup-email").props.onChange({ target: { value: "owner@luna.example" } });
  await byTestId(redraw(), "partner-setup-form").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(asked.at(-1), { name: "Luna Studio", email: "owner@luna.example" });
  assert.equal(flashes.at(-1).tone, "warn");
  assert.match(textOf(flashes.at(-1).msg), /its invitation did not go/);
});

test("a paused partner is offered no set-up; ten waiting says why, instead of the form", async () => {
  globalThis.window.__PARTNER = { dto: { ...ROW, status: "paused" }, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  draw();
  await settle();
  assert.equal(byTestId(redraw(), "partner-setup"), null);
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: "10 workspaces are waiting for their owners." };
  draw();
  await settle();
  const tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-setup-full")), "10 workspaces are waiting for their owners.");
  assert.equal(byTestId(tree, "partner-setup-open"), null);
});

test("handed over: each waiting or declined one says where it stands, and Send again goes to the address typed", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = {
    ok: true,
    vm: EMPTY,
    handovers: {
      t9: waitingRow(),
      t8: waitingRow({
        tenantId: "t8",
        name: "Sol",
        state: "accepted",
        sentence: "Its owner accepted it on Sep 30.",
        canResend: false,
      }),
    },
    full: null,
  };
  const sent = [];
  globalThis.window.__partner.resend = async (id, email) => {
    sent.push([id, email]);
    return { ok: true, sent: true };
  };
  draw();
  await settle();
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-handover-sentence-t9")), waitingRow().sentence);
  assert.equal(byTestId(tree, "partner-handover-t8"), null, "an accepted one is a workspace brought, listed below");
  press(byTestId(tree, "partner-resend-open-t9"));
  tree = redraw();
  assert.equal(
    byTestId(tree, "partner-resend-email-t9").props.value,
    "owner@luna.example",
    "from the address it went to",
  );
  byTestId(tree, "partner-resend-email-t9").props.onChange({ target: { value: "boss@luna.example" } });
  await byTestId(redraw(), "partner-resend-t9").props.onSubmit({ preventDefault() {} });
  await settle();
  assert.deepEqual(sent, [["t9", "boss@luna.example"]]);
  assert.equal(textOf(flashes.at(-1).msg), HANDOVER_WORDS.sentAgain);
});

test("an older server sends no handovers: the pane draws as before", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY };
  draw();
  await settle();
  const tree = redraw();
  assert.ok(byTestId(tree, "partner-workspaces"));
  assert.equal(byTestId(tree, "partner-handovers"), null);
});

/* ------------------------------------------------------------ two-step sign-in (0013) */

const factorStub = (over = {}) => {
  const asked = [];
  return {
    asked,
    api: {
      words: SECOND_FACTOR_WORDS,
      state: async () => ({ ok: true, on: false }),
      start: async () => {
        asked.push("start");
        return { ok: true, enrolment: { factorId: "f-new", qr: "data:image/svg+xml;utf-8,x", secret: "JBSWY3DP" } };
      },
      confirm: async (id, code) => {
        asked.push(["confirm", id, code]);
        return code === "123456" ? null : "That code didn't match. Open the app and type the code it shows now.";
      },
      ...over,
    },
  };
};

test("two-step sign-in: off says why and offers it; set up shows the code to scan and the key; the first code turns it on", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  const f = factorStub();
  globalThis.window.__partner.secondFactor = f.api;
  draw();
  await settle();
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-second-factor-intro")), SECOND_FACTOR_WORDS.intro);
  press(byTestId(tree, "partner-second-factor-start"));
  await settle();
  tree = redraw();
  assert.equal(byTestId(tree, "partner-second-factor-qr").props.src, "data:image/svg+xml;utf-8,x");
  assert.equal(textOf(byTestId(tree, "partner-second-factor-key")), "JBSWY3DP");
  assert.match(textOf(byTestId(tree, "partner-second-factor-lost")), /Lost your phone/);
  byTestId(tree, "partner-second-factor-code").props.onChange({ target: { value: "000000" } });
  await byTestId(redraw(), "partner-second-factor-setup").props.onSubmit({ preventDefault() {} });
  await settle();
  tree = redraw();
  assert.match(textOf(byTestId(tree, "partner-second-factor-error")), /didn't match/, "a wrong code says so");
  assert.ok(byTestId(tree, "partner-second-factor-setup"), "and the setup stays");
  byTestId(tree, "partner-second-factor-code").props.onChange({ target: { value: "123456" } });
  await byTestId(redraw(), "partner-second-factor-setup").props.onSubmit({ preventDefault() {} });
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-second-factor-on")), SECOND_FACTOR_WORDS.on);
  assert.deepEqual(f.asked, ["start", ["confirm", "f-new", "000000"], ["confirm", "f-new", "123456"]]);
});

test("two-step sign-in: on says so; a project without it switched on says that; a read that failed is not 'off'", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  globalThis.window.__partner.secondFactor = factorStub({ state: async () => ({ ok: true, on: true }) }).api;
  draw();
  await settle();
  let tree = redraw();
  assert.ok(byTestId(tree, "partner-second-factor-on"));
  assert.equal(byTestId(tree, "partner-second-factor-start"), null);

  globalThis.window.__partner.secondFactor = factorStub({
    start: async () => ({ ok: false, unavailable: true, message: SECOND_FACTOR_WORDS.unavailable }),
  }).api;
  draw();
  await settle();
  press(byTestId(redraw(), "partner-second-factor-start"));
  await settle();
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "partner-second-factor-unavailable")), SECOND_FACTOR_WORDS.unavailable);

  globalThis.window.__partner.secondFactor = factorStub({ state: async () => ({ ok: false, message: "offline" }) }).api;
  draw();
  await settle();
  tree = redraw();
  assert.match(textOf(byTestId(tree, "partner-second-factor-failed")), /offline/);
  assert.equal(byTestId(tree, "partner-second-factor-start"), null, "never offered on a guess");
});

/* ------------------------------------------------------------ a workspace asks a partner (0020) */

/** An answer, then the card's own read again: two turns of the stub React before the tree says what was read. */
const reread = async (paint) => {
  await settle();
  paint();
  await settle();
  return paint();
};

test("the partner's pane: the workspaces asking for them, Join goes in and says what it earns, Decline takes it away", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  globalThis.window.__partner.secondFactor = factorStub({ state: async () => ({ ok: true, on: true }) }).api;
  let rows = [
    { workspaceId: "t1", sentence: "Harbor asks you to be its partner. Open until Oct 11." },
    { workspaceId: "t2", sentence: "Bayside asks you to be its partner. Open until Oct 12." },
  ];
  const answered = [];
  globalThis.window.__partner.invitations = async () => ({ ok: true, rows });
  globalThis.window.__partner.answer = async (id, join) => {
    answered.push([id, join]);
    rows = rows.filter((r) => r.workspaceId !== id);
    return { ok: true, message: join ? "You're Harbor's partner." : "" };
  };
  draw();
  await settle();
  let tree = redraw();
  assert.ok(byTestId(tree, "partner-invitations"));
  assert.match(textOf(byTestId(tree, "partner-invitation-t1")), /Harbor asks you to be its partner/);
  press(byTestId(tree, "partner-invitation-join-t1"));
  tree = await reread(redraw);
  assert.equal(flashes.at(-1).tone, "ok");
  assert.equal(byTestId(tree, "partner-invitation-t1"), null, "read again: gone once answered");
  press(byTestId(tree, "partner-invitation-decline-t2"));
  tree = await reread(redraw);
  assert.deepEqual(answered, [
    ["t1", true],
    ["t2", false],
  ]);
  assert.equal(byTestId(tree, "partner-invitations"), null, "none asking: no card");
});

test("the partner's pane: a read of who is asking that failed says so with a retry, never an empty list", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  let fails = true;
  globalThis.window.__partner.invitations = async () =>
    fails ? { ok: false, message: "offline" } : { ok: true, rows: [{ workspaceId: "t3", sentence: "Harbor asks." }] };
  draw();
  await settle();
  let tree = redraw();
  assert.ok(byTestId(tree, "partner-invitations-failed"));
  fails = false;
  press(byTestId(tree, "partner-invitations-failed-retry"));
  tree = await reread(redraw);
  assert.equal(byTestId(tree, "partner-invitations-failed"), null);
  assert.ok(byTestId(tree, "partner-invitation-t3"), "read again: who is asking");
});

test("Team: the owner asks a partner by code and may take it back; anyone else sees no card", async () => {
  globalThis.window.TeamSection = () => null;
  const W = globalThis.window.__partner.inviteWords;
  let card = { state: "none", sentence: null, canInvite: true, canWithdraw: false };
  const asked = [];
  globalThis.window.__partner.team = {
    read: async () => ({ ok: true, vm: card }),
    invite: async (code) => {
      asked.push(code);
      if (code === "nobody") return { ok: false, message: "No active partner has that code." };
      card = { state: "waiting", sentence: "Waiting for ada-co to accept.", canInvite: false, canWithdraw: true };
      return { ok: true, sent: true };
    },
    withdraw: async () => {
      asked.push("withdraw");
      card = { state: "none", sentence: null, canInvite: true, canWithdraw: false };
      return { ok: true, message: "" };
    },
  };
  const drawTeam = () => again(() => globalThis.React.createElement(globalThis.window.PanePartner.Team, { flash }));
  fresh();
  drawTeam();
  await settle();
  let tree = drawTeam();
  assert.equal(textOf(byTestId(tree, "team-partner")).includes(W.intro), true);
  assert.equal(byTestId(tree, "team-partner-ask").props.disabled, true, "nothing to send before a code");
  byTestId(tree, "team-partner-code").props.onChange({ target: { value: "nobody" } });
  await byTestId(drawTeam(), "team-partner-form").props.onSubmit({ preventDefault() {} });
  tree = await reread(drawTeam);
  assert.equal(textOf(byTestId(tree, "team-partner-error")), "No active partner has that code.");
  byTestId(tree, "team-partner-code").props.onChange({ target: { value: "https://app.chanlytics.com/p/ada-co" } });
  await byTestId(drawTeam(), "team-partner-form").props.onSubmit({ preventDefault() {} });
  tree = await reread(drawTeam);
  assert.equal(textOf(byTestId(tree, "team-partner-waiting")), "Waiting for ada-co to accept.");
  assert.equal(byTestId(tree, "team-partner-form"), null, "nobody else asked while one waits");
  press(byTestId(tree, "team-partner-withdraw"));
  tree = await reread(drawTeam);
  assert.ok(byTestId(tree, "team-partner-form"));
  assert.deepEqual(asked, ["nobody", "https://app.chanlytics.com/p/ada-co", "withdraw"]);

  globalThis.window.__partner.team = {
    ...globalThis.window.__partner.team,
    read: async () => ({ ok: false, code: "forbidden", message: "Only an owner can do this." }),
  };
  fresh();
  drawTeam();
  await settle();
  assert.equal(byTestId(drawTeam(), "team-partner"), null, "an operator's Team has no partner card");
});

test("Team: an owner's View as another role sees no card, as that role would; the ask is the team's gate; an email that did not go says how to send it again; a refusal reads the card again", async () => {
  globalThis.window.TeamSection = () => null;
  const W = globalThis.window.__partner.inviteWords;
  let reads = 0;
  let card = { state: "none", sentence: null, canInvite: true, canWithdraw: false };
  globalThis.window.__partner.team = {
    read: async () => {
      reads += 1;
      return { ok: true, vm: card };
    },
    invite: async (code) => {
      if (code === "late") {
        // The ask was kept, and the answer never came back: the card must show it waiting, not the form again.
        card = { state: "waiting", sentence: "Waiting for late to accept.", canInvite: false, canWithdraw: true };
        return { ok: false, message: "We could not reach Chanlytics." };
      }
      card = { state: "waiting", sentence: "Waiting for ada-co to accept.", canInvite: false, canWithdraw: true };
      return { ok: true, sent: false };
    },
    withdraw: async () => {
      card = { state: "none", sentence: null, canInvite: true, canWithdraw: false };
      return { ok: true, message: "" };
    },
  };
  const drawTeam = () => again(() => globalThis.React.createElement(globalThis.window.PanePartner.Team, { flash }));
  const store = { viewAsRole: "viewer", can: () => false, myRole: () => "viewer" };
  globalThis.window.ST_STORE = store;
  try {
    fresh();
    drawTeam();
    await settle();
    assert.equal(byTestId(drawTeam(), "team-partner"), null, "a viewer sees no card, so View as a viewer does not");
    // Back to the owner: View as says so, and the card is there.
    Object.assign(store, { viewAsRole: null, can: () => true, myRole: () => "owner" });
    globalThis.window.dispatchEvent(new Event("team:changed"));
    let tree = drawTeam();
    assert.ok(byTestId(tree, "team-partner"));
    assert.equal(byTestId(tree, "team-partner-ask").props["data-gated"], undefined, "the owner's ask is not gated");
    // A role without the team's permission is gated at the button, in the shell's own way.
    store.can = () => false;
    assert.equal(byTestId(drawTeam(), "team-partner-ask").props["data-gated"], "");
    store.can = () => true;

    byTestId(tree, "team-partner-code").props.onChange({ target: { value: "ada-co" } });
    await byTestId(drawTeam(), "team-partner-form").props.onSubmit({ preventDefault() {} });
    tree = await reread(drawTeam);
    assert.equal(textOf(flashes.at(-1).msg), W.notSent, "the email that did not go, in contracts' words");
    assert.match(W.notSent, /take it back and ask again/, "and how to send it again");
    press(byTestId(tree, "team-partner-withdraw"));
    tree = await reread(drawTeam);

    const before = reads;
    byTestId(tree, "team-partner-code").props.onChange({ target: { value: "late" } });
    await byTestId(drawTeam(), "team-partner-form").props.onSubmit({ preventDefault() {} });
    tree = await reread(drawTeam);
    assert.equal(reads, before + 1, "a refusal reads the card again");
    assert.equal(textOf(byTestId(tree, "team-partner-waiting")), "Waiting for late to accept.");
    assert.equal(byTestId(tree, "team-partner-form"), null, "an ask that was kept offers no second press");
  } finally {
    delete globalThis.window.ST_STORE;
  }
});

test("the partner's pane: an answered invitation leaves the list at once, so it takes no second press while the list is read again", async () => {
  globalThis.window.__PARTNER = { dto: ROW, balance: [], fetchedAt: 1 };
  workspacesSay = { ok: true, vm: EMPTY, handovers: {}, full: null };
  const rows = [{ workspaceId: "t4", sentence: "Harbor asks you to be its partner. Open until Oct 11." }];
  let first = true;
  let release;
  // The first read answers; the one after the join waits, as a slow network would.
  globalThis.window.__partner.invitations = () => {
    if (first) {
      first = false;
      return Promise.resolve({ ok: true, rows });
    }
    return new Promise((r) => (release = () => r({ ok: true, rows: [] })));
  };
  const answered = [];
  globalThis.window.__partner.answer = async (id, join) => {
    answered.push([id, join]);
    return { ok: true, message: "You're Harbor's partner." };
  };
  draw();
  await settle();
  let tree = redraw();
  press(byTestId(tree, "partner-invitation-join-t4"));
  await settle();
  tree = redraw();
  assert.equal(byTestId(tree, "partner-invitation-t4"), null, "gone before the list is read again");
  assert.deepEqual(answered, [["t4", true]]);
  release();
  await settle();
});

test("over the real bridge: who is asking, joining and declining, and the owner's card, each at its route and said in contracts' words", async () => {
  // The tests above answer for the bridge; this one runs it, over a network the test answers.
  installPartner(globalThis.window);
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const calls = [];
  let owner = true;
  const realFetch = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${String(url).split("?")[0]}`;
    calls.push(init.body ? `${key} ${init.body}` : key);
    switch (key) {
      case "GET /api/v1/partner/invitations":
        return json(200, {
          ok: true,
          data: {
            invitations: [
              {
                workspaceId: "t9",
                workspace: "Harbor",
                sentAt: "2026-09-27T12:00:00Z",
                expiresAt: "2026-10-11T12:00:00Z",
              },
            ],
          },
        });
      case "POST /api/v1/partner/invitations/t9/accept":
        return json(200, { ok: true, data: { workspace: { id: "t9", slug: "harbor", name: "Harbor" }, earns: false } });
      case "POST /api/v1/partner/invitations/t9/decline":
        return json(200, { ok: true, data: { declined: true } });
      case "GET /api/v1/team/partner":
        return owner
          ? json(200, {
              ok: true,
              data: {
                partner: null,
                invitation: {
                  code: "ada-co",
                  sentAt: "2026-09-27T12:00:00Z",
                  expiresAt: "2099-10-11T12:00:00Z",
                  declinedAt: null,
                },
              },
            })
          : json(403, { ok: false, error: { code: "forbidden", message: "Only an owner can do this." } });
      case "POST /api/v1/team/partner":
        return json(200, { ok: true, data: { code: "ada-co", expiresAt: "2099-10-11T12:00:00Z", sent: false } });
      case "DELETE /api/v1/team/partner":
        return json(200, { ok: true, data: { withdrawn: true } });
      default:
        return json(404, { ok: false, error: { code: "not_found", message: `no ${key}` } });
    }
  };
  try {
    const P = globalThis.window.__partner;
    const asking = await P.invitations();
    assert.equal(asking.ok, true);
    assert.deepEqual(asking.rows, [
      { workspaceId: "t9", sentence: "Harbor asks you to be its partner. Open until Oct 11." },
    ]);
    const joined = await P.answer("t9", true);
    assert.deepEqual(joined, {
      ok: true,
      message:
        "You're Harbor's partner. It was already paying when you joined, so it earns you no share; the owner's team is yours to help run.",
    });
    assert.deepEqual(await P.answer("t9", false), { ok: true, message: "" });

    const card = await P.team.read();
    assert.equal(card.ok, true);
    assert.equal(card.vm.state, "waiting");
    assert.equal(card.vm.canWithdraw, true);
    assert.deepEqual(await P.team.invite("ada-co"), { ok: true, sent: false });
    assert.deepEqual(await P.team.withdraw(), { ok: true, message: "" });
    owner = false;
    const refused = await P.team.read();
    assert.deepEqual([refused.ok, refused.code], [false, "forbidden"], "the refusal's code, which hides the card");
    assert.deepEqual(calls, [
      "GET /api/v1/partner/invitations",
      "POST /api/v1/partner/invitations/t9/accept",
      "POST /api/v1/partner/invitations/t9/decline",
      "GET /api/v1/team/partner",
      'POST /api/v1/team/partner {"code":"ada-co"}',
      "DELETE /api/v1/team/partner",
      "GET /api/v1/team/partner",
    ]);
  } finally {
    globalThis.window.fetch = realFetch;
  }
});
