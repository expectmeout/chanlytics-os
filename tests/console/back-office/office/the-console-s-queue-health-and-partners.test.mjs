/**
 * The Console: a rehearsal's own act, a role offered only its acts, screens that decide nothing, the ops routes'
 * ceilings, the waitlist queue and its marks, Health's timings, and Partners with their payouts and decisions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  platformQueue,
  QUEUE_SENDS_NOTHING,
  platformPartnerRows,
  platformPartnerStanding,
  CONSOLE_WORDS,
} from "@chanlytics/contracts";
import { importSrc, readCode } from "../../../_source.mjs";
import { fakeDb } from "../../../_fake-db.mjs";
import {
  getPlatformWaitlist,
  getPlatformWaitlistInvited,
} from "../../../../apps/dashboard/src/server/console/platform.ts";
import {
  FOUND,
  ME,
  NOW,
  P1,
  PartnersScreen,
  PlatformLine,
  PlatformPartnerRow,
  PlatformPartnerStandingRow,
  PlatformQueueCard,
  PlatformWaitingRow,
  SETUP_FIXTURE,
  SpeedTab,
  WORDS,
  ago,
  api,
  backOffice,
  balance,
  brought,
  byId,
  consoleSource,
  live,
  mount,
  p75,
  partnerApi,
  textOf,
  waiting,
  walk,
} from "./_office.mjs";

test("a rehearsal offers a different action, at a price, and says it cannot be undone", async () => {
  backOffice.verbs = api([]);
  const mock = { ...SETUP_FIXTURE.lines.rows[0], sms_state: "approved", reg_mock: true };
  const row = mount(PlatformLine, { line: mock, tenantId: "a", role: "owner", onDone: () => {}, flash: () => {} });
  await row.press(byId(row.tree, "platform-act-refile").props.onClick);
  const said = textOf(byId(row.tree, "platform-refile-why"));
  assert.match(said, /\$19\.50/, "a real filing spends, and says how much");
  assert.match(said, /cannot be undone/);
  assert.ok(said.indexOf("$19.50") < said.indexOf("cannot be undone"), "money first");
});

test("a role is offered only the acts it may take: Billing sees a line, and no button on it", () => {
  backOffice.verbs = api([]);
  const row = mount(PlatformLine, {
    line: { ...SETUP_FIXTURE.lines.rows[0] },
    tenantId: "a",
    role: "billing",
    onDone: () => {},
    flash: () => {},
  });
  assert.ok(byId(row.tree, `platform-line-${SETUP_FIXTURE.lines.rows[0].id}`));
  assert.equal(byId(row.tree, "platform-act-refile"), null);
  assert.equal(byId(row.tree, "platform-act-release"), null);
});

test("the screens decide nothing: every verdict, word and row comes from the contract", () => {
  const src = consoleSource();
  for (const call of [
    "P.rows(tenants)",
    "P.summary(rows)",
    "verdictPill(row.verdict)",
    "P.steps({ ...setup, tz, later: [], rests: {} })",
    "P.number(line.e164)",
    "P.actions(line)",
    "P.warning(arm)",
    "consoleGroups(",
  ]) {
    assert.ok(src.includes(call), `the screen reads ${call} rather than deciding`);
  }
  // No thresholds, no state lists, no sorting of its own.
  assert.ok(!/\.sort\(/.test(src), "the contract sorts");
  assert.ok(!/86_?400_?000|14 \* DAY|\bDAY\b/.test(src), "no clocks of its own");
  assert.ok(!/needs_record|past_due|reg_mock === true/.test(src), "no state judgements of its own");
  assert.ok(!/\$\d/.test(src.replace(/\$\{/g, "")), "no money figure lives in a screen");
  // It borrows the row grammar rather than inventing one.
  assert.ok(src.includes("<AttnRow"), "the same row People, Today and Setup draw");
});

test("Settings' Back office is a link to the Console, for the people it is for and for nobody else", () => {
  const settings = readCode(
    "apps/dashboard/src/surfaces/settings/frame/tabs.ts",
    "apps/dashboard/src/surfaces/settings/frame/page.tsx",
  );
  // Not in SET_TABS: a customer who types the route lands on Profile rather than on a locked door they now know about.
  assert.ok(!/id: "platform".*group: "Workspace"/.test(settings));
  assert.match(
    settings,
    /export const SET_TABS_PLATFORM: readonly SetTab\[\] = \[\s*\{ id: "platform", label: "The Console"/,
  );
  assert.match(settings, /export const isPlatformAdmin = \(\): boolean => !!whoIsLooking\(\)\.me\?\.platform_admin;/);
  assert.match(settings, /\.\.\.SET_TABS\.filter\(.*\),\s*\.\.\.\(isPlatformAdmin\(\) \? SET_TABS_PLATFORM : \[\]\)/);
  assert.match(settings, /\(isPlatformAdmin\(\) \? SET_TABS_PLATFORM\.find\(\(t\) => t\.id === id\) : null\) \|\|/);
  // One copy, not two (decision 0066): the row opens the Console, and an old address says where it went.
  assert.match(settings, /t\.id === "platform" \? window\.location\.assign\(CONSOLE_PATH\) : go\(t\.id\)/);
  assert.match(settings, /\{id === "platform" && <PaneConsole \/>\}/);
  assert.ok(!settings.includes("PanePlatform"), "the back office's pane is the Console's now");
});

test("the ops routes have their own ceilings, sized for a support shift and named for what they do", async () => {
  // RATE's own rule is "One rule per bucket. Named by what the route DOES, not by its path." The three platform routes
  // borrowed the OWNER buckets once: an admin's refiles for three customers drew down one owner's three-an-hour, a free
  // correction was capped like an irreversible $19.50 filing, and handing a number BACK was refused in a sentence about
  // buying lines.
  const { RATE } = await import("../../../../apps/dashboard/src/server/shared/rate-limit.ts");
  for (const [bucket, route, min] of [
    ["platform_line_retry", "retry", 10],
    ["platform_line_refile", "refile", 10],
    ["platform_line_release", "release", 1],
  ]) {
    const rule = RATE[bucket];
    assert.ok(rule, `${bucket} exists`);
    assert.ok(rule.limit >= min, `${bucket}: ${rule.limit} is a support shift, not one owner's wallet`);
    assert.match(rule.noun, /workspaces|handed back/, `${bucket}: the noun says whose thing this is`);
    // Each route spends its own bucket, never an owner's: the policy the route declares (route-policy.json holds them).
    const { POST } = await importSrc(`apps/dashboard/app/api/v1/platform/lines/${route}/route.ts`);
    assert.equal(POST.policy.rate, bucket, `${route} spends its own bucket`);
  }
  assert.ok(RATE.platform_line_release.limit < RATE.platform_line_refile.limit, "the irreversible one is the tightest");
});

test("the Console says every act is written down first, and the act helper does write it first", () => {
  // The claim is on screen beside every act (the reason ask), so it has to be true where it runs.
  assert.match(CONSOLE_WORDS.recorded, /Written down against you before it runs/);
  // And the act helper does write it first, refusing an act whose row cannot be written: run through the routes in
  // console/console-routes.test.mjs ("an act whose log row cannot be written does not run", "an act is written down
  // with who, their role, where and why before it runs"). Pinned as acts.ts's text until 25 Nov 2026.
});

test("the queue says how many and how long, and an unreadable queue is not an empty one", () => {
  const empty = platformQueue({ waiting: [], total: 0 }, NOW);
  assert.equal(empty.sentence, "Nobody is waiting.");
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.unreadable, false);
  const blind = platformQueue({ waiting: null, total: null }, NOW);
  assert.equal(blind.unreadable, true);
  assert.match(blind.sentence, /could not be read/);
  assert.doesNotMatch(blind.sentence, /Nobody/, "REGRESSION: a failed read must never read as an empty list");
  const two = platformQueue({ waiting: [waiting(), waiting({ id: "w2", created_at: ago(1) })], total: 2 }, NOW);
  assert.match(two.sentence, /^2 waiting, the first since 3d ago\.$/);
  const many = platformQueue({ waiting: [waiting()], total: 140 }, NOW);
  assert.match(many.sentence, /140 waiting.*showing the first 1\./);
});

test("a row says who they are and where they came from, and never the query string", () => {
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  assert.equal(row.email, "ana@example.com");
  assert.equal(row.detail, "Marisa's Beauty Salon · from chanlytics.com/pricing");
  assert.equal(row.waited, "asked 3d ago");
  assert.equal(
    platformQueue({ waiting: [waiting({ business: null })], total: 1 }, NOW).rows[0].detail,
    "from chanlytics.com/pricing",
  );
  assert.equal(
    platformQueue({ waiting: [waiting({ source: null })], total: 1 }, NOW).rows[0].detail,
    "Marisa's Beauty Salon",
  );
  assert.equal(
    platformQueue({ waiting: [waiting({ business: "  ", source: "" })], total: 1 }, NOW).rows[0].detail,
    null,
  );
  assert.equal(
    platformQueue({ waiting: [waiting({ business: null, source: "an email signature" })], total: 1 }, NOW).rows[0]
      .detail,
    "from an email signature",
  );
});

test("the only action says what it does not do", () => {
  assert.match(QUEUE_SENDS_NOTHING, /sends no invitations/i);
  assert.match(QUEUE_SENDS_NOTHING, /Write to them yourself/);
  assert.equal(platformQueue({ waiting: [waiting()], total: 1 }, NOW).note, QUEUE_SENDS_NOTHING);
});

test("the queue is read through the one door, still-waiting only, oldest first", async () => {
  const rows = [
    { id: "w2", email: "bea@example.com", business: null, source: null, created_at: ago(1), invited_at: null },
    { id: "w3", email: "cass@example.com", business: null, source: null, created_at: ago(9), invited_at: ago(8) },
    { id: "w1", email: "ana@example.com", business: "Salon", source: null, created_at: ago(3), invited_at: null },
  ];
  const q = await getPlatformWaitlist({ db: fakeDb({ waitlist: rows }) });
  assert.deepEqual(
    q.waiting.map((r) => r.email),
    ["ana@example.com", "bea@example.com"],
    "invited is out of the queue; oldest first",
  );
  assert.equal(q.total, 2);
});

test("a queue that could not be read answers null, not empty, and does not throw", async () => {
  const q = await getPlatformWaitlist({
    db: fakeDb({ waitlist: [] }, { "waitlist.select": { message: "permission denied" } }),
  });
  assert.deepEqual(q, { waiting: null, total: null });
});

test("marking somebody invited is conditional on them still waiting, records who, and is written down with why", async () => {
  const rows = [
    {
      id: "w1",
      email: "ana@example.com",
      business: null,
      source: null,
      created_at: ago(3),
      invited_at: null,
      invited_by: null,
    },
  ];
  const tables = { waitlist: rows, platform_acts: [] };
  const db = fakeDb(tables);
  const office = { db, session: db, role: "support", userId: "u-admin", email: "ruben@rjcapital.example" };

  assert.equal(await getPlatformWaitlistInvited(office, "w1", FOUND), "marked");
  assert.ok(rows[0].invited_at, "the stamp that takes them out of the list");
  assert.equal(rows[0].invited_by, "u-admin", "the column the table was given for exactly this");
  // Two admins working down the same list is how this is used. The second one is owed the truth, not a failure and
  // not a second stamp; and the log says that too.
  const firstStamp = rows[0].invited_at;
  assert.equal(await getPlatformWaitlistInvited(office, "w1", FOUND), "already");
  assert.equal(rows[0].invited_at, firstStamp, "the row is somebody else's now and is left exactly as they left it");
  assert.deepEqual(
    tables.platform_acts.map((a) => [a.act, a.target_kind, a.target_id, a.outcome, a.outcome_note]),
    [
      ["waitlist_invited", "waitlist", "w1", "done", null],
      ["waitlist_invited", "waitlist", "w1", "done", "Someone had marked them already."],
    ],
  );
  // Billing does not invite people: refused before anything is written.
  await assert.rejects(
    getPlatformWaitlistInvited({ ...office, role: "billing" }, "w1", FOUND),
    (e) => e.code === "forbidden" && e.status === 403,
  );
  assert.equal(tables.platform_acts.length, 2);
});

test("the queue's card draws who is waiting, and says the product sends nothing", () => {
  backOffice.verbs = api([]);
  const vm = platformQueue(
    {
      waiting: [
        waiting(),
        waiting({ id: "w2", email: "bea@example.com", business: null, source: null, created_at: ago(1) }),
      ],
      total: 2,
    },
    NOW,
  );
  const page = mount(PlatformQueueCard, {
    waiting: vm,
    P: backOffice.verbs,
    role: "owner",
    onDone() {},
    flash() {},
  });
  assert.match(textOf(byId(page.tree, "platform-queue-words")), /2 waiting, the first since 3d ago/);
  assert.match(textOf(byId(page.tree, "platform-queue-note")), /sends no invitations/i);
  const rows = [];
  walk(page.tree, (n) => {
    if (n.props?.["data-testid"] === "platform-queue-row") rows.push(n);
  });
  assert.equal(rows.length, 2);
  assert.match(textOf(rows[0]), /Marisa's Beauty Salon · from chanlytics\.com\/pricing · asked 3d ago/);
  assert.match(textOf(rows[1]), /bea@example\.com asked 1d ago/, "the halves they did not give leave no separator");
  // A queue that could not be read says so, and draws no list.
  const blind = mount(PlatformQueueCard, {
    waiting: platformQueue({ waiting: null, total: null }, NOW),
    P: backOffice.verbs,
    role: "owner",
    onDone() {},
    flash() {},
  });
  assert.match(textOf(byId(blind.tree, "platform-queue-words")), /could not be read/);
  assert.equal(byId(blind.tree, "platform-queue-rows"), null, "nothing is drawn, because nothing is known");
});

test("marking somebody invited is never one click, asks why, and says what it does not do", async () => {
  const calls = [];
  backOffice.verbs = api([], calls);
  let reloaded = 0;
  const said = [];
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  const view = mount(PlatformWaitingRow, {
    row,
    P: backOffice.verbs,
    role: "support",
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });
  assert.match(textOf(view.tree), /ana@example\.com/);
  await view.press(byId(view.tree, "platform-queue-mark").props.onClick);
  assert.deepEqual(calls, [], "arming is not doing");
  const ask = byId(view.tree, "platform-queue-invited-why");
  assert.ok(ask, "it asks");
  assert.match(textOf(ask), /Nothing is sent/, "and the question says what it is not");
  assert.equal(byId(view.tree, "platform-queue-mark"), null, "the button is gone while the question stands");
  await view.press(byId(view.tree, "platform-queue-invited-yes").props.onClick);
  assert.deepEqual(calls, ["invited:w1:found"]);
  assert.equal(reloaded, 1, "the list on screen is a row out of date, so the page reads again");
  assert.equal(said.length, 1, "and the person who pressed it is told what happened");
  // Billing is shown who is waiting, and no button.
  const billing = mount(PlatformWaitingRow, { row, P: backOffice.verbs, role: "billing", onDone() {}, flash() {} });
  assert.equal(byId(billing.tree, "platform-queue-mark"), null);
});

test("a mark that did not go through is said, and changes nothing on the page", async () => {
  let reloaded = 0;
  const said = [];
  const [row] = platformQueue({ waiting: [waiting()], total: 1 }, NOW).rows;
  const view = mount(PlatformWaitingRow, {
    row,
    P: { markInvited: async () => ({ ok: false, message: "That could not be recorded, so it was not done." }) },
    role: "owner",
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });
  await view.press(byId(view.tree, "platform-queue-mark").props.onClick);
  await view.press(byId(view.tree, "platform-queue-invited-yes").props.onClick);
  assert.equal(reloaded, 0, "nothing is re-read, because nothing happened");
  assert.equal(said.length, 1);
  assert.equal(said[0].tone, "danger");
});

test("Health's timings card: the 75th percentile in words, a line for each metric, and the slowest pages by name", async () => {
  // Health's App speed tab draws it from Health's own read (decision 0068), the back office's words beside it.
  const h = {
    vitals: [
      p75("INP", null, 30, 610),
      p75("LCP", null, 40, 2300),
      p75("LCP", "inbox", 25, 3300),
      p75("INP", "inbox", 20, 640),
      p75("LCP", "today", 15, 1900),
    ],
    speed: null,
    day_rows: null,
  };
  const page = mount(SpeedTab, { P: WORDS, h });
  await page.settle();
  assert.equal(
    textOf(byId(page.tree, "platform-vitals-words")),
    "Of 40 page loads in the last 7 days, three in four drew the page within 2.3 s and answered a tap within 610 ms.",
  );
  const lines = byId(page.tree, "platform-vitals-lines");
  assert.match(textOf(lines), /Drawn \(LCP\) 2\.3 s · good · 40 loads/);
  assert.match(textOf(lines), /Answers a tap \(INP\) 610 ms · poor · 30 loads with a tap/);
  assert.match(
    textOf(byId(page.tree, "platform-vitals-pages")),
    /^inbox Drawn within 3\.3 s, a tap answered within 640 ms · 25 loads$/,
  );
});

test("timings that could not be read say so, and none yet says that, never an empty card", async () => {
  const unread = mount(SpeedTab, { P: WORDS, h: { vitals: null, speed: null, day_rows: null } });
  await unread.settle();
  assert.equal(textOf(byId(unread.tree, "platform-vitals-words")), "Page timings couldn't be read just now.");
  assert.equal(byId(unread.tree, "platform-vitals-lines"), null, "nothing is drawn, because nothing is known");
  const none = mount(SpeedTab, { P: WORDS, h: { vitals: [], speed: null, day_rows: [] } });
  await none.settle();
  assert.match(
    textOf(byId(none.tree, "platform-vitals-words")),
    /^No page has sent its timings in the last \d+ days\.$/,
  );
  assert.equal(byId(none.tree, "platform-vitals-lines"), null);
});

test("Partners: what each partner is owed, and the workspaces held for a person", async () => {
  backOffice.verbs = partnerApi(
    [
      live({ tenant_id: "a", slug: "harbor", name: "Harbor Moving" }),
      live({ tenant_id: "b", slug: "bayside", name: "Bayside Salon" }),
    ],
    {
      balances: [balance()],
      workspaces: [
        brought(),
        brought({ tenant_id: "a", standing: "qualified", standing_why: null, decided_by: "sweep" }),
      ],
    },
  );
  const page = mount(PartnersScreen, { me: ME, flash: () => {} });
  await page.settle();
  assert.match(textOf(page.tree), /1 partner · \$125\.00 payable · 1 workspace under review/);
  assert.equal(
    textOf(byId(page.tree, "platform-partner-money-ada-co")),
    "$125.00 payable · $50.00 held · $0.00 paid to date",
    "a zero is said as a zero",
  );
  assert.ok(byId(page.tree, "platform-standing-b"), "the one under review is on the screen");
  assert.equal(byId(page.tree, "platform-standing-a"), null, "a qualified one is not: nothing to decide");
  assert.match(textOf(byId(page.tree, "platform-standing-words-b")), /Under review \(the nightly check\): The card/);
});

test("who brought it and who decided, in the back office's words: a link, a handover or an owner's invitation; the nightly check, a person, or the rule as the partner joined (0020)", () => {
  const WHY = "The card that pays for it also pays for a workspace the partner owns.";
  assert.equal(platformPartnerStanding(brought()).by, "Brought by ada-co", "a database before 00225 says no origin");
  assert.equal(platformPartnerStanding(brought({ origin: "link" })).by, "Brought by ada-co");
  assert.equal(platformPartnerStanding(brought({ origin: "handover" })).by, "Set up and handed over by ada-co");
  assert.equal(platformPartnerStanding(brought({ origin: "invite" })).by, "ada-co, asked in by its owner");
  const joined = platformPartnerStanding(
    brought({
      origin: "invite",
      standing: "disqualified",
      standing_why: "It was already paying for its plan when the partner joined, so it earns no share.",
      decided_by: "joining",
      checks: { already_paying: true },
    }),
  );
  assert.equal(
    joined.standing,
    "Disqualified (as the partner joined): It was already paying for its plan when the partner joined, so it earns no share.",
    "not the nightly check's: it decided nothing",
  );
  assert.equal(platformPartnerStanding(brought()).standing, `Under review (the nightly check): ${WHY}`);
  assert.equal(
    platformPartnerStanding(brought({ decided_by: "person" })).standing,
    `Under review (decided by a person): ${WHY}`,
  );
  assert.equal(
    platformPartnerStanding(brought({ decided_by: "someone-new" })).standing,
    `Under review: ${WHY}`,
    "a decider these words do not know is not named",
  );
});

test("Partners that could not be read say so, and draw no rows", async () => {
  backOffice.verbs = partnerApi([live({ tenant_id: "a", slug: "harbor", name: "Harbor Moving" })], null);
  const page = mount(PartnersScreen, { me: ME, flash: () => {} });
  await page.settle();
  assert.ok(byId(page.tree, "console-partners-failed"));
  assert.equal(byId(page.tree, "platform-partner-rows"), null);
});

test("recording a payout is never one click, sends nothing, and waits for the payment's reference and why", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  let reloaded = 0;
  const said = [];
  const [row] = platformPartnerRows([balance()]);
  const view = mount(PlatformPartnerRow, {
    row,
    P,
    role: "billing",
    onDone: () => {
      reloaded += 1;
    },
    flash: (t) => said.push(t),
  });
  assert.equal(textOf(byId(view.tree, "platform-partner-mark-ada-co")), "Mark $125.00 as paid");
  assert.equal(byId(view.tree, "platform-partner-arm-paused-ada-co"), null, "Billing does not pause a partner");
  await view.press(byId(view.tree, "platform-partner-mark-ada-co").props.onClick);
  assert.equal(calls.filter((c) => c.startsWith("paid:")).length, 0, "arming is not doing");
  assert.match(textOf(byId(view.tree, "platform-partner-pay-ada-co-why")), /Nothing is sent/);
  assert.equal(byId(view.tree, "platform-partner-pay-ada-co-yes").props.disabled, true, "not without a reference");
  view.type(byId(view.tree, "platform-partner-pay-ada-co-typed"), "  bank-ref-1  ");
  assert.equal(byId(view.tree, "platform-partner-pay-ada-co-yes").props.disabled, false);
  await view.press(byId(view.tree, "platform-partner-pay-ada-co-yes").props.onClick);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("paid:")),
    [`paid:${P1}:ada-co:usd:bank-ref-1:12500:found`],
  );
  assert.equal(reloaded, 1);
  assert.equal(said.length, 1);
  // Support is shown what is owed, and no payout button: the money is Billing's and the owner's.
  const support = mount(PlatformPartnerRow, { row, P, role: "support", onDone() {}, flash() {} });
  assert.equal(byId(support.tree, "platform-partner-mark-ada-co"), null);
});

test("a partner owed nothing, or owed less than refunds took, has no payout button", () => {
  const [none, under] = platformPartnerRows([
    balance({ currency: null, held_cents: 0, payable_cents: 0 }),
    balance({ payable_cents: -3000 }),
  ]);
  for (const row of [none, under]) {
    const view = mount(PlatformPartnerRow, { row, P: partnerApi([], null), role: "owner", onDone() {}, flash() {} });
    assert.equal(byId(view.tree, "platform-partner-mark-ada-co"), null);
  }
  assert.equal(none.money, "Nothing earned yet.");
  assert.match(under.money, /^-\$30\.00 to come off the next payout/);
});

test("a person's decision on a brought workspace asks why, for the partner, and disqualifying is the red one", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  let reloaded = 0;
  const view = mount(PlatformPartnerStandingRow, {
    ws: brought(),
    name: "Bayside Salon",
    P,
    role: "owner",
    onDone: () => {
      reloaded += 1;
    },
    flash() {},
  });
  assert.ok(byId(view.tree, "platform-standing-arm-qualified-b"));
  assert.ok(byId(view.tree, "platform-standing-arm-disqualified-b"));
  assert.equal(byId(view.tree, "platform-standing-arm-review-b"), null, "never the standing it already has");
  await view.press(byId(view.tree, "platform-standing-arm-disqualified-b").props.onClick);
  const confirm = byId(view.tree, "platform-standing-disqualified-b-confirm");
  assert.match(confirm.props.className, /confirm-danger/);
  assert.match(textOf(byId(view.tree, "platform-standing-disqualified-b-why")), /What was paid stays paid/);
  assert.equal(byId(view.tree, "platform-standing-disqualified-b-yes").props.disabled, true, "not without why");
  view.type(byId(view.tree, "platform-standing-disqualified-b-why-note"), "Same owner as the partner.");
  await view.press(byId(view.tree, "platform-standing-disqualified-b-yes").props.onClick);
  assert.deepEqual(calls, ["standing:b:disqualified:Same owner as the partner."]);
  assert.equal(reloaded, 1);
  // Support may not rule on money: shown the standing, and no decision.
  const support = mount(PlatformPartnerStandingRow, {
    ws: brought(),
    name: "Bayside Salon",
    P,
    role: "support",
    onDone() {},
    flash() {},
  });
  assert.equal(byId(support.tree, "platform-standing-arm-qualified-b"), null);
});

test("pausing a partner asks why, is the red one, and is offered once per partner, never on a second currency's line", async () => {
  const calls = [];
  const P = partnerApi([], null, calls);
  const [usd, eur] = platformPartnerRows([balance(), balance({ currency: "eur" })]);
  const second = mount(PlatformPartnerRow, { row: eur, P, role: "owner", onDone() {}, flash() {} });
  assert.equal(byId(second.tree, "platform-partner-arm-paused-ada-co"), null);
  let reloaded = 0;
  const view = mount(PlatformPartnerRow, {
    row: usd,
    P,
    role: "support",
    onDone: () => {
      reloaded += 1;
    },
    flash() {},
  });
  assert.ok(byId(view.tree, "platform-partner-arm-closed-ada-co"));
  assert.equal(byId(view.tree, "platform-partner-arm-active-ada-co"), null, "an active partner is not restored");
  await view.press(byId(view.tree, "platform-partner-arm-paused-ada-co").props.onClick);
  const confirm = byId(view.tree, "platform-partner-status-paused-ada-co-confirm");
  assert.match(confirm.props.className, /confirm-danger/);
  assert.match(
    textOf(byId(view.tree, "platform-partner-status-paused-ada-co-why")),
    /become a viewer on every workspace they brought/,
  );
  assert.equal(byId(view.tree, "platform-partner-mark-ada-co"), null, "one question at a time");
  assert.equal(byId(view.tree, "platform-partner-status-paused-ada-co-yes").props.disabled, true, "not without why");
  view.type(byId(view.tree, "platform-partner-status-paused-ada-co-why-note"), "Reported by an owner.");
  await view.press(byId(view.tree, "platform-partner-status-paused-ada-co-yes").props.onClick);
  assert.deepEqual(calls, [`status:${P1}:ada-co:paused:Reported by an owner.`]);
  assert.equal(reloaded, 1);
});
