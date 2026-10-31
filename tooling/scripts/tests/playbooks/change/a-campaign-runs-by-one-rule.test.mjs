/**
 * Whether a campaign runs is one rule (contracts playbook-schedule.ts campaignRunsOn; the wiring's second audit, S1-3).
 *
 * A campaign past its last day (00416 `until`) was "Ended" on Campaigns' home and "On · daily 10:00 AM" with a run tomorrow to
 * Ask, drew its daily runs on Sent's week ahead, was listed as sending in the Library, offered Run now (which the server
 * refuses), was a reminder on Today's day strip and People's follow-up. Each page tested the campaign's `state` alone: its last
 * day, and whether its moment runs here, were the home's to know.
 *
 *  1. The rule: on, and not past its last day by the business's day (a proposal's follow-up in every workspace, 0008
 *     amended 18 Oct 2026). Its next run says none once that day is past the last. The home's reading carries its answer on
 *     each card (`runs`), which every page reads.
 *  2. No page, Ask or server file of the dashboard, and nothing in contracts, compares a `.state` with "running" outside the
 *     rule's module and the lifecycle module that reads it, except the files below, each with what its comparison is for and
 *     how many it makes. Measured on the syntax tree. The list may only fall: a comparison the code no longer makes fails until
 *     it is taken off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";
import { importSrc } from "../../_source.mjs";

const { campaignRunsOn, nextRunLabel } = await importSrc("packages/contracts/src/playbooks/playbook-schedule.ts");
const { lifecyclePlaybooksOf } = await importSrc("packages/contracts/src/playbooks/lifecycle/lifecycle-inputs.ts");

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 1. The rule                                                                                                              *
 * ------------------------------------------------------------------------------------------------------------------------ */

const NY = "America/New_York";
/** 3 October 2026, 2 PM in New York. */
const NOW = new Date("2026-10-03T18:00:00.000Z");
const at = { tz: NY, now: NOW };
const campaign = (over = {}) => ({ state: "running", trigger: "quiet_30", until: null, ...over });

test("a campaign runs while it is on, until its last day by the business's day, whatever its moment", () => {
  assert.equal(campaignRunsOn(campaign(), at), true, "on, with no last day");
  assert.equal(campaignRunsOn(campaign({ state: "paused" }), at), false, "paused");
  assert.equal(campaignRunsOn(campaign({ until: "2026-10-03" }), at), true, "its last day is today: it still runs");
  assert.equal(campaignRunsOn(campaign({ until: "2026-10-02" }), at), false, "past its last day");
  // The business's day, not the browser's or the server's: at 11 PM in New York it is still the 2nd there and the 3rd in UTC.
  const lateEvening = { ...at, now: new Date("2026-10-03T03:00:00.000Z") };
  assert.equal(
    campaignRunsOn(campaign({ until: "2026-10-02" }), lateEvening),
    true,
    "the 2nd is still its day in New York",
  );
  // A proposal's follow-up runs as any campaign does (0006; 0008, amended 18 Oct 2026: every workspace has deals).
  assert.equal(campaignRunsOn(campaign({ trigger: "proposal_waiting" }), at), true, "a proposal's follow-up");
});

test("a campaign's next run is none once the day it would fall on is past its last day", () => {
  const ranToday = { state: "running", run_hour: 10, last_run_for: "2026-10-03" };
  assert.equal(nextRunLabel(ranToday, NY, NOW, false), "tomorrow 10:00 AM");
  assert.equal(
    nextRunLabel({ ...ranToday, until: "2026-10-03" }, NY, NOW, false),
    "none: its last day has passed",
    "today was its last day and its run is made",
  );
  assert.equal(
    nextRunLabel({ ...ranToday, last_run_for: null, run_hour: 16, until: "2026-10-03" }, NY, NOW, false),
    "today 4:00 PM",
    "its last day's run is still to come",
  );
});

test("the home's reading carries the rule's answer on each card, which Sent's week, the Library, Run now and Today read", () => {
  const playbook = (id, over) => ({
    id,
    trigger: "quiet_30",
    state: "running",
    run_hour: 10,
    last_run_for: null,
    list_id: null,
    list_key: null,
    until: null,
    ...over,
  });
  const read = lifecyclePlaybooksOf(
    {
      timezone: NY,
      playbooks: [
        playbook("on"),
        playbook("ended", { until: "2026-10-01" }),
        playbook("paused", { state: "paused" }),
        playbook("deal", { trigger: "proposal_waiting" }),
      ],
    },
    NOW,
  );
  const runs = Object.fromEntries(read.cards.map((c) => [c.playbook.id, c.read.runs]));
  assert.deepEqual(runs, { on: true, ended: false, paused: false, deal: true });
  for (const c of read.cards)
    assert.equal(c.read.runs, campaignRunsOn(c.playbook, { tz: NY, now: NOW }), c.playbook.id);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 2. Nobody asks `state` instead                                                                                           *
 * ------------------------------------------------------------------------------------------------------------------------ */

/** Where a `.state` compared with "running" is looked for: contracts, and the dashboard's pages, bridge, Ask and server. */
const SCOPE = ["packages/contracts/src", "apps/dashboard/src"];
/** The rule's own module, and the lifecycle module that reads it for the home (its cards, ledger, tiles and words). */
const RULE_HOMES = [
  "packages/contracts/src/playbooks/playbook-schedule.ts",
  "packages/contracts/src/playbooks/lifecycle/",
];

/**
 * The files that compare a `.state` with "running" for something other than whether a campaign runs on the day, each with
 * how many comparisons it makes and why. May only fall.
 */
const OTHER_STATES = {
  "packages/contracts/src/ask-proposals/campaigns.ts": {
    n: 2,
    why: "A pause or a resume a card asks for: the state it writes, and the toast that says which, not whether the campaign runs.",
  },
  "packages/contracts/src/playbooks/playbook-patch.ts": {
    n: 1,
    why: "The words of a change asked for (Pause, Resume): the state a patch writes, not whether the campaign runs.",
  },
  "apps/dashboard/src/server/ask/tools/act/playbook-change.ts": {
    n: 2,
    why: "Ask's change of a campaign: the resume it asks for and the mode it needs read first, the state written, not run.",
  },
  "apps/dashboard/src/server/campaigns/playbook-row.ts": {
    n: 2,
    why: "The event a pause or a resume records (start_playbook, pause_playbook), and whether a change turns a step on (a twin on its visit moment is refused there): the state written, not whether it runs.",
  },
  "apps/dashboard/src/server/people/list-write.ts": {
    n: 1,
    why: "A list archived pauses the campaigns on it that are on (00169): the state written, whatever their last day.",
  },
  "packages/contracts/src/calendar/calendar-runs.ts": {
    n: 2,
    why: "The Calendar's marks forecast each day apart, and judge each against the campaign's last day themselves (campaignEnded per day drawn), which the day's rule cannot.",
  },
  "packages/contracts/src/playbooks/playbook-reach.ts": {
    n: 1,
    why: "Who a card reaches says Paused for a campaign that is off; one past its last day says so by its state on the card (lifecycleStateOf, Ended), which wins.",
  },
  "packages/contracts/src/reach-out/reach-out-leads.ts": {
    n: 2,
    why: "A reach-out's chain, whose steps have no last day: on or paused is all there is to it.",
  },
  "packages/contracts/src/reach-out/reach-out-sheet.ts": {
    n: 1,
    why: "A reach-out's chain, whose steps have no last day: on or paused is all there is to it.",
  },
  "packages/contracts/src/reports/campaigns/reach-out-lens.ts": {
    n: 1,
    why: "A reach-out's chain on the Campaigns lens, whose steps have no last day: on or paused is all there is to it.",
  },
  "apps/dashboard/src/server/campaigns/reach-outs.ts": {
    n: 2,
    why: "A reach-out's chain as its reader answers it: on where its first step and the step are, which has no last day.",
  },
  "apps/dashboard/src/surfaces/leads/finder/strip-view.tsx": {
    n: 1,
    why: "A lead search's round running, not a campaign.",
  },
  "apps/dashboard/src/surfaces/console/health/background.tsx": {
    n: 1,
    why: "A Health clock's sweep (sweep_status), running or idle as it should be on the Console, not a campaign.",
  },
  "packages/contracts/src/imports/ledger.ts": {
    n: 3,
    why: "The imports ledger's own run (decision 0073, R23): a connection's history coming in, and Meta's parts of it.",
  },
  "packages/contracts/src/email/mailbox-connect.ts": {
    n: 1,
    why: "A mailbox's own history on its row in Connections (decision 0086): the imports ledger's run coming in, with Stop, not a campaign.",
  },
  "packages/contracts/src/setup/setup-rows.ts": {
    n: 3,
    why: "Setup's clients' file row: the imports ledger's run of the file, not a campaign.",
  },
  "apps/dashboard/src/surfaces/setup/first-run/channels/brought.tsx": {
    n: 3,
    why: "Brought in's lines (#1854): each source's run in the imports ledger, coming in or queued, not a campaign.",
  },
};

/** Whether a node is the string "running". */
const isRunning = (n) => ts.isStringLiteral(n) && n.text === "running";
/** Whether a node reads a `.state` (or `?.state`). */
const readsState = (n) => ts.isPropertyAccessExpression(n) && n.name.text === "state";
const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** How many `.state` comparisons with "running" a file makes, either way round. */
function stateComparisons(file) {
  let n = 0;
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      EQUALITY.has(node.operatorToken.kind) &&
      ((readsState(node.left) && isRunning(node.right)) || (isRunning(node.left) && readsState(node.right)))
    )
      n += 1;
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return n;
}

const found = new Map();
for (const file of repoFiles(SCOPE, { keep: /\.(ts|tsx)$/ })) {
  if (RULE_HOMES.some((home) => file === home || (home.endsWith("/") && file.startsWith(home)))) continue;
  if (/\.type-test\.ts$/.test(file)) continue;
  const n = stateComparisons(file);
  if (n) found.set(file, n);
}

test("nothing outside the rule's module and the lifecycle module asks a campaign's state for whether it runs", () => {
  const fresh = [...found].filter(([file, n]) => !OTHER_STATES[file] || n > OTHER_STATES[file].n);
  assert.deepEqual(
    fresh.map(([file, n]) => `${file}: ${n}`),
    [],
    "ask the rule (contracts campaignRunsOn, or a card's `runs`), or list the file in OTHER_STATES with what its comparison is for",
  );
});

test("each file listed still makes the comparisons it is listed for, and says why", () => {
  for (const [file, { n, why }] of Object.entries(OTHER_STATES)) {
    assert.equal(
      found.get(file) ?? 0,
      n,
      `${file}: makes ${found.get(file) ?? 0} now; lower its count, or take it off`,
    );
    assert.ok(why.trim().length >= 40, `${file}: say why in a sentence`);
  }
});
