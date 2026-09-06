/**
 * Every log line from the message path must be joinable to a tenant.
 *
 * There were 75 console call sites across the edge and the packages it bundles,
 * and five of them mentioned a tenant. The shapes were ad hoc too — a JSON
 * string here, bare values there, an Error's message elsewhere — so the log was
 * not queryable even in principle, and "what happened to this business's line
 * yesterday?" had no answer. That is the question every incident opens with.
 *
 * The rule this pins is narrow and load-bearing: EVENT NAMES DO NOT CHANGE.
 * They are the stable identifier anything downstream greps for, and a logger
 * that tidies them up breaks the one part that already worked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const EDGE = path.join(here, "../../../apps/edge");
const { logger, errField } = await import(pathToFileURL(path.join(EDGE, "lib/log.ts")).href);

/** Capture what a logger writes, without touching the real console. */
function capture(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  console.log = (l) => lines.push({ stream: "log", ...JSON.parse(l) });
  console.warn = (l) => lines.push({ stream: "warn", ...JSON.parse(l) });
  console.error = (l) => lines.push({ stream: "error", ...JSON.parse(l) });
  try { fn(); } finally { Object.assign(console, real); }
  return lines;
}

test("bound context rides on every line", () => {
  const [a, b] = capture(() => {
    const L = logger({ tenant_id: "t-1", wamid: "wamid.9" });
    L.info("wa_replied", { sent: true });
    L.error("brain_failed", { error: "boom" });
  });
  for (const line of [a, b]) {
    assert.equal(line.tenant_id, "t-1", "a line without a tenant cannot be joined to a business");
    assert.equal(line.wamid, "wamid.9");
  }
  assert.equal(a.event, "wa_replied");
  assert.equal(a.sent, true);
  assert.equal(b.level, "error");
});

test("a child logger narrows without losing the parent's context", () => {
  const [line] = capture(() => logger({ tenant_id: "t-1" }).child({ job: "outbound_send" }).info("job_fired"));
  assert.equal(line.tenant_id, "t-1");
  assert.equal(line.job, "outbound_send");
});

test("levels route to the stream an operator's tooling expects", () => {
  const lines = capture(() => {
    const L = logger();
    L.info("a"); L.warn("b"); L.error("c");
  });
  assert.deepEqual(lines.map((l) => l.stream), ["log", "warn", "error"]);
});

test("absent fields are omitted, not serialised as null", () => {
  // A field missing because it does not apply must not read as one known to be
  // empty — that distinction is the whole value of a structured log.
  const [line] = capture(() => logger({ tenant_id: undefined }).info("wa_skip_dupe", { memory: undefined }));
  assert.equal("tenant_id" in line, false);
  assert.equal("memory" in line, false);
  assert.equal(line.event, "wa_skip_dupe");
});

test("every line is one parseable JSON object", () => {
  // Vercel captures stdout per invocation; a line that is not valid JSON is a
  // line no query will ever return.
  const lines = capture(() => logger({ tenant_id: "t" }).info("wa_replied", { note: 'has "quotes" and \n newline' }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].note, 'has "quotes" and \n newline');
});

test("errField renders an error without dumping a stack", () => {
  assert.equal(errField(new TypeError("bad")), "TypeError: bad");
  assert.equal(errField("plain"), "plain");
});

/* ------------------------- the names are the contract ---------------------- */

test("the message path's event names are unchanged by the conversion", () => {
  // These are the identifiers greps and any future alerting depend on. The
  // logger changed the ENVELOPE; renaming the events would break the part that
  // already worked.
  //
  // `wa_skip_stale` is deliberately NOT in this list any more, and that is the
  // one kind of removal this guard should allow: the behaviour it named is
  // gone, not merely renamed. It marked a late message processed and returned
  // — no reply, no escalation, nobody told — which meant any outage longer
  // than the guard turned Meta's whole redelivery backlog into unanswered
  // customers. A late message is now answered (`wa_late_but_answering`) or
  // escalated (`wa_stale_escalated`), so an event meaning "silently dropped"
  // would have nothing to describe.
  // The message path and the webhook: the names span both files now.
  const src = fs.readFileSync(path.join(EDGE, "lib/whatsapp/inbound.ts"), "utf8") + fs.readFileSync(path.join(EDGE, "api/whatsapp.ts"), "utf8");
  const required = [
    "wa_replied", "wa_skip_dupe", "wa_skip_pg_dupe", "wa_skip_paused",
    "wa_skip_ratecap", "wa_skip_opt_out", "wa_held_by_policy", "wa_state_unavailable",
    "policy_block_price", "brain_failed", "wa_unroutable", "wa_skip_unroutable",
    "wa_stale_escalated", "wa_late_but_answering",
  ];
  for (const name of required) {
    assert.ok(src.includes(`"${name}"`), `event name ${name} disappeared from the message path`);
  }
});

test("the converted message-path lines carry the tenant", () => {
  // The logger is bound once in handleInbound; if that binding is removed or
  // the calls revert to bare console, the tenant silently stops appearing.
  const src = fs.readFileSync(path.join(EDGE, "lib/whatsapp/inbound.ts"), "utf8");
  assert.match(
    src,
    /const L = logger\(\{ tenant_id: tenantId, wamid: m\.id, from, type: m\.type \}\)/,
    "handleInbound must bind the tenant into its logger",
  );
  for (const call of ["L.info(\"wa_replied\"", "L.info(\"wa_skip_opt_out\"", "L.error(\"wa_state_unavailable\""]) {
    assert.ok(src.includes(call), `${call} reverted to an unbound console call`);
  }
});
