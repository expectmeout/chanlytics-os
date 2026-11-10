#!/usr/bin/env node
/**
 * docs/inbound-gates.md: the order a customer's message is taken through, written from core's INBOUND_GATES
 * (packages/core/src/inbound/order.ts), the one place it is said.
 *
 * The order is the product, and it was written by hand in docs/system-prd.md and docs/conversation-flow.md, each
 * saying something else and neither what the code did (the inbound review of 3 Nov 2026, D3 and E2): the one-time
 * code, the confirmed yes, the live hold and the turn were missing, "too late" stood after the acknowledgement it
 * comes before, and a STOP still opened a hold. Those pages now link here, and only this writes it (decision 0074):
 * `land` takes main's side of it in a conflict and writes it again.
 *
 *   corepack pnpm gen:inbound-gates            # write it
 *   corepack pnpm gen:inbound-gates -- --check # exit 1 when it is stale
 *
 * tests/inbound/the-gates-run-in-their-order.test.mjs runs the verb against the list, and holds this file to it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INBOUND_GATES } from "@chanlytics/core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT = "docs/inbound-gates.md";

/** A table cell: one line, its pipes escaped. */
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** The page, as the list says it. */
export function gatesPage(gates = INBOUND_GATES) {
  const rows = gates.map(
    (g, i) =>
      `| ${i + 1} | ${g.kind} | ${cell(g.when)} | ${cell(g.then)} | ${g.hold ? `\`${g.hold}\`` : "none"} | ${g.log ? `\`${g.log}\`` : ""} |`,
  );
  return [
    "# The inbound gates",
    "",
    "<!-- Written by `corepack pnpm gen:inbound-gates` from packages/core/src/inbound/order.ts. Do not edit by hand. -->",
    "",
    "Every customer message on WhatsApp, a text or an Instagram DM is taken through this order, the same on every wire",
    "(`answerInbound`, packages/core/src/inbound/answer.ts): recorded at its door, answered by its job (decision 0031).",
    "A **gate** stops the message and says so in its log line; a **step** happens to every message that gets that far.",
    "The hold is the one a gate opens for a person the ordinary way (the Inbox's reason); none means nobody is asked.",
    "Every way out stamps what the message became (`meta.handled`).",
    "",
    "| # | Kind | When | Then | Hold | Log line |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function main() {
  const file = path.join(ROOT, OUT);
  const next = gatesPage();
  if (process.argv.includes("--check")) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\r\n").join("\n") : "";
    if (now !== next) {
      console.error(`${OUT} is stale: corepack pnpm gen:inbound-gates`);
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(file, next);
  console.log(`wrote ${OUT} (${INBOUND_GATES.length} rows)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
