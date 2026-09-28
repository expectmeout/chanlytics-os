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
const ROOT = path.join(here, "../../../..");
const EDGE = path.join(ROOT, "apps/edge");
// The message path moved into packages/core as a verb over ports, answer.ts's
// order and the phase modules beside it; the envelope it logs through did not.
// The lines below are read where they live now, and prove exactly what they
// proved on the edge.
const PATH = ["answer", "context", "ingest", "gates", "unreadable", "reply-gates", "model-turn", "dispatch"].map((m) =>
  path.join(ROOT, `packages/core/src/inbound/${m}.ts`),
);
const pathSrc = () => PATH.map((p) => fs.readFileSync(p, "utf8")).join("\n");
const { logger, errField } = await import(pathToFileURL(path.join(EDGE, "lib/log.ts")).href);

/** Capture what a logger writes, without touching the real console. */
function capture(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  console.log = (l) => lines.push({ stream: "log", ...JSON.parse(l) });
  console.warn = (l) => lines.push({ stream: "warn", ...JSON.parse(l) });
  console.error = (l) => lines.push({ stream: "error", ...JSON.parse(l) });
  try {
    fn();
  } finally {
    Object.assign(console, real);
  }
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
    L.info("a");
    L.warn("b");
    L.error("c");
  });
  assert.deepEqual(
    lines.map((l) => l.stream),
    ["log", "warn", "error"],
  );
});

test("absent fields are omitted, not serialised as null", () => {
  // A field missing because it does not apply must not read as one known to be
  // empty — that distinction is the whole value of a structured log.
  const [line] = capture(() => logger({ tenant_id: undefined }).info("wa_skip_pg_dupe", { reason: undefined }));
  assert.equal("tenant_id" in line, false);
  assert.equal("reason" in line, false);
  assert.equal(line.event, "wa_skip_pg_dupe");
});

test("a field named like the envelope never replaces it", () => {
  // A ledger line once logged `{ event: id }`: the id replaced the line's own
  // name, and nothing could grep for the line. The envelope's two keys are the
  // logger's; a field by either name, bound or passed, rides under `<key>_field`.
  const [a, b] = capture(() => {
    logger({ hook: "stripe" }).warn("stripe_event_reclaimed", { event: "evt_1", level: "loud" });
    logger({ event: "bound" }).info("kept_name");
  });
  assert.equal(a.event, "stripe_event_reclaimed");
  assert.equal(a.level, "warn");
  assert.equal(a.event_field, "evt_1");
  assert.equal(a.level_field, "loud");
  assert.equal(b.event, "kept_name");
  assert.equal(b.event_field, "bound");
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
  //
  // `wa_skip_dupe` went the same way. It named a hit on the `seen` array the
  // Blob thread carried; Postgres carries no such list, and ingest_inbound's
  // atomic is_new claim — `wa_skip_pg_dupe`, still here — is the dedupe. With
  // the store gone there is no second gate left for it to name.
  // The message path and the webhook: the names span both files now.
  const src = pathSrc() + fs.readFileSync(path.join(EDGE, "api/whatsapp.ts"), "utf8");
  const required = [
    "wa_replied",
    "wa_skip_pg_dupe",
    "wa_skip_paused",
    "wa_skip_ratecap",
    "wa_skip_opt_out",
    "wa_held_by_policy",
    "wa_state_unavailable",
    "policy_block_price",
    "brain_failed",
    "wa_unroutable",
    "wa_skip_unroutable",
    "wa_stale_escalated",
    "wa_late_but_answering",
  ];
  for (const name of required) {
    assert.ok(src.includes(`"${name}"`), `event name ${name} disappeared from the message path`);
  }
});

test("the converted message-path lines carry the tenant", () => {
  // The logger is bound once in answerInbound, where the tenant becomes
  // known; if that binding is removed or the calls revert to bare console,
  // the tenant silently stops appearing. The factory is a port now (the verb
  // may not import the edge), and the edge hands in this same logger.
  const src = pathSrc();
  assert.match(
    src,
    /const L = ports\.log\(\{ tenant_id: tenantId, wamid: raw\.id, from_tail: phoneTail\(from\), type: raw\.type \}\)/,
    "answerInbound must bind the tenant into its logger",
  );
  for (const call of ['L.info("wa_replied"', 'L.info("wa_skip_opt_out"', 'L.error("wa_state_unavailable"']) {
    assert.ok(src.includes(call), `${call} reverted to an unbound console call`);
  }
});
