/**
 * A `Promise.all` over a list runs everything in it at once, so its size is the load it puts on the database or a provider
 * (layer 10, decision 0115). Each one in the backend says here what bounds that list, read by hand on 9 November 2026. A new
 * one arrives with its answer. A list a customer's volume can grow goes a few at a time, as receipts.ts and the mailbox sweep do.
 *
 * Keyed `<file>|<what it maps>`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../../_ast.mjs";

const FAN_OUTS = {
  "apps/dashboard/src/server/ask/companion/findings.ts|found": "ASK_MORNING_CARDS_MAX",
  "apps/dashboard/src/server/ask/companion/remembered.ts|proposals": "what one model turn proposed",
  "apps/dashboard/src/server/ask/loop/loop.ts|calls": "one model turn's tool calls",
  "apps/dashboard/src/server/ask/notice/sweep.ts|waiting.slice(at, at + AT_ONCE)":
    "AT_ONCE, a few businesses at a time",
  "apps/dashboard/src/server/ask/tools/read/files.ts|shown": "VIEW_MAX, the tool's own input",
  "apps/dashboard/src/server/campaigns/reach-out-replies.ts|candidates": "one page of replies",
  "apps/dashboard/src/server/campaigns/sequences/doors.ts|input.then": "a sequence's steps, in the door's input",
  "apps/dashboard/src/server/connections/email.ts|conversations": "one page of threads",
  "apps/dashboard/src/server/content/storyboard.ts|timeline.cuts": "a video's cuts: PIECE_LIMITS.cutsMax, five",
  "apps/dashboard/src/server/connections/mailbox-connections.ts|rows": "a workspace's mailboxes",
  "apps/dashboard/src/server/console/support.ts|askers .slice(0, ASKER_LOOKUPS)": "ASKER_LOOKUPS",
  "apps/dashboard/src/server/leads/send.ts|rows": "a workspace's mailboxes",
  "apps/dashboard/src/server/posts/compose.ts|FONT_FILES": "a fixed list",
  "apps/dashboard/src/server/workspace/billing.ts|list": "the workspaces one person's deletion emptied",
  "apps/dashboard/src/server/workspace/page-open.ts|tier": "a page's fixed first reads",
  "apps/dashboard/src/server/workspace/team.ts|seated": "one person's open invitations",
  "apps/edge/lib/files/copies.ts|ids": "COPIES_AT_ONCE: the door refuses more",
  "apps/edge/lib/imports/website-read.ts|reads": "a site's linked pages, already capped",
  "apps/edge/lib/leads/sources.ts|actors": "our own pinned actors",
  "apps/edge/lib/leads/sources.ts|leadPins()": "our own pinned actors",
  "packages/core/src/campaigns/run-hand-step.ts|leads": "no network: a hash per lead (sendIdFor)",
  "packages/core/src/campaigns/run-playbook.ts|handed": "no network: a hash per person (sendIdFor)",
  "packages/core/src/campaigns/run-reach-out.ts|placed": "no network: a hash per lead (sendIdFor)",
  "packages/core/src/campaigns/run-reach-out.ts|skips": "no network: a hash per lead (sendIdFor)",
  "packages/core/src/leads/judge.ts|calls": "one batch's calls: judgeBatchPlaces over judgeCallPlaces",
  "packages/core/src/leads/runner/collect/batches.ts|rest": "no network: sites read before, kept in `sites`",
  "packages/core/src/leads/runner/rejudge.ts|batch": "no network: sites read before, kept in `sites`",
  "packages/db/src/repositories/campaigns/sequence-waiting.ts|ids": "the waiting reach-out batches of one page",
  "packages/db/src/repositories/campaigns/occasions.ts|ids":
    "a workspace's sequences on an occasion's three moments, one running a moment",
  "apps/edge/lib/ops/web-push.ts|subscriptions": "BROWSERS_TOLD_MAX, in the job that reads them",
};

const TREES = [
  "apps/edge",
  "apps/dashboard/src/server",
  "apps/dashboard/app",
  "packages/core/src",
  "packages/db/src",
  "packages/jobs/src",
  "packages/channels/src",
];

function fanOuts() {
  const found = new Set();
  for (const file of repoFiles(TREES, { keep: /\.(ts|tsx)$/ })) {
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isCallExpression(n) && /^Promise\.all(Settled)?$/.test(n.expression.getText(sf))) {
        const map = n.arguments[0];
        if (
          map &&
          ts.isCallExpression(map) &&
          ts.isPropertyAccessExpression(map.expression) &&
          map.expression.name.text === "map"
        ) {
          const fn = map.arguments[0];
          const isAsync =
            fn &&
            (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
            fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
          if (isAsync) found.add(`${file}|${map.expression.expression.getText(sf).replace(/\s+/g, " ")}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

test("every Promise.all over a list says what bounds it, and every row is one", () => {
  const found = fanOuts();
  assert.ok(found.size >= 20, `read ${found.size}; the backend holds more than that`);
  assert.deepEqual(
    [...found].filter((f) => !Object.hasOwn(FAN_OUTS, f)).sort(),
    [],
    "say here what bounds this list; one a customer's volume can grow goes a few at a time",
  );
  assert.deepEqual(
    Object.keys(FAN_OUTS)
      .filter((f) => !found.has(f))
      .sort(),
    [],
    "a row with no fan-out: delete it",
  );
});
