/**
 * Settings › Partner (decision 0012), drawn: pages/partner-real.jsx on the stub React, over data-bits and the real
 * bridge (legacy-bridge/partner.ts). Reading, a failed read, the offer and its one press, and a partner's link, share,
 * earnings and count, every sentence contracts'. And the rail: the tab is on the account, beside Profile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTNER_WORDS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId, textOf, press, settle } from "./_legacy-react.mjs";

installLegacyReact();
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { installPartner } = await import("../../../apps/dashboard/src/legacy-bridge/partner.ts");
await import("../../../apps/dashboard/src/legacy/pages/partner-real.jsx");

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
await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
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

test("the offer: the share every new account starts with, the terms, and a press that waits for the agreement", async () => {
  globalThis.window.__PARTNER = { dto: null, balance: [], fetchedAt: 0 };
  const asked = [];
  globalThis.window.__partner.become = async (code) => {
    asked.push(code);
    if (code === "taken") return { ok: false, message: "That code is taken. Try another." };
    globalThis.window.__PARTNER = { dto: { ...ROW, code }, balance: [], fetchedAt: 1 };
    return { ok: true, message: "" };
  };
  let tree = draw();
  assert.match(textOf(byTestId(tree, "partner-offer")), /The share is 25% of what it pays for its plan\.$/);
  assert.equal(textOf(byTestId(tree, "partner-terms")), PARTNER_WORDS.terms);
  assert.equal(byTestId(tree, "partner-become").props.disabled, true, "nothing to send before a code and a yes");

  byTestId(tree, "partner-code").props.onChange({ target: { value: "taken" } });
  byTestId(redraw(), "partner-agree").props.onChange({ target: { checked: true } });
  tree = redraw();
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
      { currency: "usd", state: "held", earned_cents: 10000, next_payable_at: "2026-10-26T00:00:00Z" },
      { currency: "usd", state: "payable", earned_cents: 5000, next_payable_at: null },
    ],
    fetchedAt: 1,
  };
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "partner-link")), "https://app.chanlytics.com/p/ada");
  assert.equal(textOf(byTestId(tree, "partner-share")), "20% of what it pays for its plan, for as long as it pays.");
  assert.equal(textOf(byTestId(tree, "partner-held")), "$100.00 held, the first of it payable from Oct 26.");
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
