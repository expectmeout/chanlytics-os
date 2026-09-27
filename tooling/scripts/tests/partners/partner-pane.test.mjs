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
await import("../../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
/** The workspaces read, answered by the test. */
let workspacesSay = { ok: true, vm: { rows: [], summary: "No workspace has come through your link yet." } };
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
  assert.equal(textOf(byTestId(tree, "partner-brought")), "2 workspaces came through your link.");
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

const EMPTY = { summary: "No workspace has come through your link yet.", rows: [] };
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
