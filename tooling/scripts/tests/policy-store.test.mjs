/**
 * The policy store adapter, EXECUTED.
 *
 * The mockup's three policy readers (Settings matrix, the approval chip, Fleet)
 * all go through `window.POLICY`. This pins that the adapter answers from the
 * workspace's real rows when they exist, falls back to the seeded store when
 * they do not, never invents a mode for a missing row, keeps money locked,
 * and only ever writes through the courier for a class that is enforced.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");
const { uiRows, modeLabel, dbMode, installPolicyStore, UI_ROWS, UI_MODES } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/legacy-bridge/policy-store.ts")).href
);

const REAL = {
  role: "owner",
  // A workspace whose customers book: the follow-ups' row is not drawn (0006).
  dealsOn: false,
  rows: [
    { class: "reply", mode: "veto", limits: { reply_delay_ms: 30000, max_replies_day: 20 } },
    { class: "booking", mode: "auto", limits: {} },
    { class: "money", mode: "never", limits: {} },
    // faq / reengage / campaign deliberately absent
  ],
};

test("modes round-trip between the database's spelling and the mockup's, and unknowns are null", () => {
  for (const m of ["auto", "veto", "ask", "never"]) assert.equal(dbMode(modeLabel(m)), m);
  assert.equal(modeLabel("sometimes"), null);
  assert.equal(dbMode("Maybe"), null);
  assert.deepEqual([...UI_MODES], ["Auto", "Veto", "Ask", "Never"]);
});

test("every class offered is one the runtime consults, and each offers only the modes its enforcer honours", () => {
  // The rows used to carry an enforced flag, back when the receptionist read
  // one class. Every class has an enforcer now, so the flag and the pane text
  // that hung on it are gone: the list itself is the claim.
  assert.deepEqual(
    UI_ROWS.map((r) => r.id).sort(),
    ["book", "campaign", "faq", "follow_up", "money", "reengage", "reply", "reviews"],
    "reply by the handlers; booking and faq in both prompts and after generation; reengage, campaign and follow_up by the playbooks sweep; reviews by the profile sync and the draft route; money is locked in the database",
  );
  assert.deepEqual(
    UI_ROWS.find((r) => r.id === "follow_up").modes,
    ["Auto", "Ask", "Never"],
    "the follow-up sends, waits on Today, or does not run: no countdown to hold (0006)",
  );
  assert.ok(
    UI_ROWS.every((r) => !("enforced" in r)),
    "no row is stored-but-unenforced, so no row says so",
  );
  assert.deepEqual(
    UI_ROWS.find((r) => r.id === "reviews").modes,
    ["Auto", "Ask", "Never"],
    "answered, drafted for a person, or left alone — no countdown to hold",
  );
  assert.deepEqual(
    UI_ROWS.find((r) => r.id === "book").modes,
    ["Auto", "Ask"],
    "no never for a salon that takes bookings, no draft to hold for review",
  );
  assert.deepEqual(UI_ROWS.find((r) => r.id === "faq").modes, ["Auto", "Ask"]);
  assert.equal(UI_ROWS.find((r) => r.id === "money").locked, true);
  assert.equal(UI_ROWS.find((r) => r.id === "book").cls, "booking", "the mockup says 'book', the table says 'booking'");
});

test("uiRows maps stored rows onto the mockup's ids, never invents a mode, and keeps money at Never", () => {
  const rows = uiRows(REAL);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.reply.mode, "Veto");
  assert.deepEqual(by.reply.limits, { reply_delay_ms: 30000, max_replies_day: 20 });
  assert.equal(by.book.mode, "Auto");
  assert.equal(by.faq.mode, null, "no row, no mode — the pane shows nothing rather than a default");
  assert.equal(by.money.mode, "Never");
  assert.deepEqual(
    rows.map((r) => r.id),
    ["reply", "faq", "book", "reengage", "campaign", "reviews", "money"],
    "a salon's pane: seven rows",
  );
  const deals = uiRows({ ...REAL, dealsOn: true, rows: [...REAL.rows, { class: "follow_up", mode: "ask" }] });
  assert.deepEqual(
    deals.map((r) => r.id),
    ["reply", "faq", "book", "reengage", "follow_up", "campaign", "reviews", "money"],
    "where deals are on, eight: the follow-ups' beside Win-back",
  );
  assert.equal(deals.find((r) => r.id === "follow_up").mode, "Ask");
  assert.equal(
    uiRows({ role: null, rows: [{ class: "money", mode: "auto" }] }).find((r) => r.id === "money").mode,
    "Never",
    "a corrupted money row still reads Never",
  );
});

test("the installed store answers from real rows, and writes only through the courier for an enforced class", async () => {
  const calls = [];
  const seed = {
    MODES: ["Auto", "Veto", "Ask", "Never"],
    ROWS: [{ id: "reply", def: "Auto" }],
    modeOf: () => "SEED",
    set: () => calls.push("seed-set"),
  };
  const win = {
    POLICY: seed,
    __POLICIES: REAL,
    __setPolicy: async (cls, mode) => {
      calls.push([cls, mode]);
    },
  };
  installPolicyStore(win);
  const S = win.POLICY;
  assert.equal(S.real(), true);
  assert.equal(S.modeOf("reply"), "Veto");
  assert.equal(S.modeOf("book"), "Auto");
  assert.equal(S.modeOf("faq"), null);
  assert.equal(S.row("money").locked, true);
  assert.equal(S.ROWS.length, UI_ROWS.length - 1, "a salon's pane: the follow-ups' row only where deals are on");

  S.set("reply", "Ask");
  S.set("money", "Auto"); // locked: no write
  S.set("book", "Ask"); // enforced now: a write
  S.set("book", "Never"); // a mode booking cannot honour: no write, the pane shows a dash there
  S.set("reply", "Maybe"); // not a mode
  await Promise.resolve();
  assert.deepEqual(calls, [
    ["reply", "ask"],
    ["booking", "ask"],
  ]);
});

test("without real rows the store is the seeded one, untouched", () => {
  const calls = [];
  const seed = {
    MODES: ["Auto", "Veto", "Ask", "Never"],
    ROWS: [{ id: "reply", def: "Auto" }],
    modeOf: (id) => `seed:${id}`,
    set: (id, m) => calls.push([id, m]),
  };
  const win = { POLICY: seed };
  installPolicyStore(win);
  assert.equal(win.POLICY.real(), false);
  assert.equal(win.POLICY.modeOf("reply"), "seed:reply");
  assert.deepEqual(win.POLICY.ROWS, seed.ROWS);
  win.POLICY.set("reply", "Ask");
  assert.deepEqual(calls, [["reply", "Ask"]]);
});

test("a failed policies read is its own state, not the seeds", () => {
  const seed = { MODES: [], ROWS: [{ id: "reply" }], modeOf: () => "SEED", set: () => {} };
  const win = { POLICY: seed, __POLICIES: null };
  installPolicyStore(win);
  // null = the bridge ran and the read FAILED. The pane renders "could not
  // load"; the store must not quietly serve the mockup's charter meanwhile.
  assert.equal(win.POLICY.real(), false);
  assert.equal(win.POLICY.modeOf("reply"), null, "no modes at all — never the mockup's charter beside a real approval");
  assert.equal(win.POLICY.row("money").mode, "Never", "except money, which the database locks whatever we can read");
  win.POLICY.set("reply", "Ask");
  assert.equal(win.POLICY.modeOf("reply"), null, "nothing to write against");
});
