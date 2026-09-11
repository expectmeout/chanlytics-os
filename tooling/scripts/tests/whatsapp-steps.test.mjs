/**
 * The WhatsApp handler's named steps, run as truth tables: how late a
 * message is, whether the thread may be answered, how long a reply waits and
 * why, what layer two does to the words, and what a held thread says.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const steps = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/steps.ts")).href);
const { ageVerdict, threadVerdict, holdPlan, layerTwo, holdCopy, STALE_MS, STALE_REPLY_MS } = steps;

const brainCfg = { phone_display: "(305) 555-0100", booking_link: "https://book.example/melany", fallbacks: {} };
const NOW = 1_800_000_000_000;

test("age: fresh inside ten minutes, late inside two hours, stale beyond — and no timestamp is now", () => {
  const at = (msAgo) => String(Math.floor((NOW - msAgo) / 1000));
  assert.equal(ageVerdict(at(0), NOW).verdict, "fresh");
  assert.equal(ageVerdict(at(STALE_MS - 1), NOW).verdict, "fresh");
  assert.equal(ageVerdict(at(STALE_MS + 1000), NOW).verdict, "late");
  assert.equal(ageVerdict(at(STALE_REPLY_MS - 1000), NOW).verdict, "late");
  assert.equal(ageVerdict(at(STALE_REPLY_MS + 1000), NOW).verdict, "stale");
  assert.deepEqual(ageVerdict(undefined, NOW), { ageMs: 0, verdict: "fresh" });
  assert.ok(ageVerdict(at(STALE_MS + 1000), NOW).ageMs > STALE_MS, "the age travels with the verdict for the log");
});

test("thread: a human has it, the day is spent, or the receptionist may answer", () => {
  assert.equal(threadVerdict({ pausedUntil: NOW + 1, replies: [] }, 20, NOW), "paused");
  assert.equal(threadVerdict({ pausedUntil: NOW, replies: [] }, 20, NOW), "ok", "the pause has ended at the very moment");
  assert.equal(threadVerdict({ pausedUntil: 0, replies: new Array(20).fill(NOW) }, 20, NOW), "ratecap");
  assert.equal(threadVerdict({ pausedUntil: 0, replies: new Array(19).fill(NOW) }, 20, NOW), "ok");
  assert.equal(threadVerdict({ pausedUntil: NOW + 1, replies: new Array(30).fill(NOW) }, 20, NOW), "paused", "the pause is decided first");
});

test("the hold: veto always waits in its window; auto waits only below the dial; the dial off means no wait", () => {
  const limits = { reply_delay_ms: 90_000, min_confidence: 0.7 };
  const veto = holdPlan("veto", limits, { confidence: 0.99 });
  assert.equal(veto.delayMs, 90_000);
  assert.deepEqual([veto.heldForConfidence, veto.source], [false, "veto_window"]);
  const sure = holdPlan("auto", limits, { confidence: 0.9 });
  assert.deepEqual([sure.delayMs, sure.heldForConfidence, sure.source], [0, false, "veto_window"]);
  const unsure = holdPlan("auto", limits, { confidence: 0.4 });
  assert.deepEqual([unsure.delayMs, unsure.heldForConfidence, unsure.source, unsure.minConfidence], [90_000, true, "low_confidence", 0.7]);
  const noMeta = holdPlan("auto", limits, undefined);
  assert.equal(noMeta.heldForConfidence, false, "no confidence on record is not low confidence");
  const dialOff = holdPlan("auto", { reply_delay_ms: 90_000 }, { confidence: 0.1 });
  assert.deepEqual([dialOff.delayMs, dialOff.heldForConfidence], [0, false]);
});

test("layer two: a price blocks the send; under ask a link is taken back and an answer is replaced; compliance keeps its words; nothing else is touched", () => {
  const base = { escalate: false, escalationReason: "human_token", brainCfg, policy: { booking: { mode: "ask" }, faq: { mode: "ask" } } };
  const price = layerTwo({ ...base, replyText: "A blowout is $45 today.", intent: "pricing" });
  assert.equal(price.priceBlocked, true);
  assert.match(price.replyText, /Pricing is quoted at your consult/);
  assert.equal(price.escalationReason, "policy_ask", "the ask class still applies after the price block; the words are the price block's");
  assert.equal(price.escalate, true);
  const link = layerTwo({ ...base, replyText: `Book here: ${brainCfg.booking_link}`, intent: "booking" });
  assert.deepEqual([link.askClass, link.complied, link.escalate, link.escalationReason], ["booking", false, true, "policy_ask"]);
  assert.match(link.replyText, /confirm your booking with you shortly/);
  const complied = layerTwo({ ...base, replyText: "A member of our team will confirm your booking shortly.", escalate: true, intent: "booking" });
  assert.deepEqual([complied.complied, complied.replyText], [true, "A member of our team will confirm your booking shortly."]);
  const answered = layerTwo({ ...base, replyText: "We open at 9 and do balayage.", intent: "services" });
  assert.deepEqual([answered.askClass, answered.complied, answered.escalationReason], ["faq", false, "policy_ask"]);
  assert.match(answered.replyText, /get back to you with the details shortly/);
  const handedOff = layerTwo({ ...base, replyText: "Let me get a colleague to answer that.", escalate: true, intent: "pricing" });
  assert.deepEqual([handedOff.complied, handedOff.replyText], [true, "Let me get a colleague to answer that."]);
  const plain = layerTwo({ ...base, policy: { booking: { mode: "auto" }, faq: { mode: "auto" } }, replyText: `Book here: ${brainCfg.booking_link}`, intent: "booking" });
  assert.deepEqual([plain.askClass, plain.complied, plain.escalate, plain.escalationReason, plain.priceBlocked], [null, null, false, "human_token", false]);
  assert.equal(plain.replyText, `Book here: ${brainCfg.booking_link}`);
});

test("a held thread says why, to the Inbox and to the alert, and a broken config is named as a mistake", () => {
  const person = holdCopy({ brainCfg, personMode: "never", replyMode: "never", configBroken: false });
  assert.deepEqual([person.personHold, person.reason, person.botText, person.why], [true, "person_hold", "(held — you handle this person yourself)", "this person is set to never"]);
  assert.match(person.details, /You set the receptionist to 'never' for this person/);
  const policy = holdCopy({ brainCfg, personMode: null, replyMode: "ask", configBroken: false });
  assert.deepEqual([policy.personHold, policy.reason, policy.why], [false, "policy_block", "reply mode ask"]);
  assert.match(policy.details, /Reply mode is 'ask'/);
  const broken = holdCopy({ brainCfg: null, personMode: null, replyMode: "auto", configBroken: true });
  assert.deepEqual([broken.reason, broken.why], ["policy_block", "settings could not be read"]);
  assert.match(broken.details, /invalid field/);
  const none = holdCopy({ brainCfg: null, personMode: "never", replyMode: "auto", configBroken: false });
  assert.deepEqual([none.personHold, none.why], [false, "no persona configured"], "no persona is never a person hold");
  assert.match(none.details, /No brain profile configured/);
});

test("the shape: the webhook, the message path, the bookkeeping, the alerts, the steps — each in its file, the path using the steps", () => {
  const api = readCode("apps/edge/api/whatsapp.ts");
  assert.ok(api.includes("export async function GET(") && api.includes("export async function POST(") && !api.includes("async function handleInbound("), "the webhook file is the webhook");
  const inbound = readCode("apps/edge/lib/whatsapp/inbound.ts");
  for (const s of ["export async function handleInbound(", "const { ageMs, verdict: age } = ageVerdict(m.timestamp);", "const gate = threadVerdict(thread, maxRepliesDay);", "const plan = holdPlan(replyMode, replyLimits, brainMeta);", "const two = layerTwo({", "const hold = holdCopy({"]) assert.ok(inbound.includes(s), s);
  assert.ok(!inbound.includes("violatesNoPrices(") && !inbound.includes("policyAskClass("), "the words are checked in one place");
  const persist = readCode("apps/edge/lib/whatsapp/persist.ts");
  for (const s of ["export async function pgIngest(", "export async function pgSafe<T>(", "export function pgSink(", "export async function queueReply(", "export async function pgThread("]) assert.ok(persist.includes(s), s);
  const alerts = readCode("apps/edge/lib/whatsapp/alerts.ts");
  for (const s of ["export async function sendText(", "export async function alertStaff(", "export async function alertUnroutable("]) assert.ok(alerts.includes(s), s);
  // The tenant's credentials or none: waCfgFor answers null for a tenant with
  // nothing in the vault, and the send is refused rather than made on the
  // environment's pair (per-tenant-credentials.test.mjs runs the resolver).
  assert.ok(alerts.includes("const cfg = waCfgFor(rt, arrivedOnEnvNumber);") && alerts.includes("waSendText(cfg, to, body)"), "the customer is texted on the tenant's credentials, or not at all");
});
