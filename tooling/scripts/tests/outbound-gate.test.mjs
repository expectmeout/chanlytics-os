/**
 * The voice path's send door.
 *
 * The WhatsApp receptionist enforces consent, pause, reply-mode and a rate cap
 * as statement order across one long handler, which holds because every inbound
 * message walks that path. The VOICE path is a second sender — a caller asks the
 * phone agent to text them a booking link — and it was assembled by hand: it
 * checked consent and stopped.
 *
 * So a booking link would land in a thread a human had taken over, which is the
 * precise interruption pause exists to prevent and which the customer cannot
 * tell apart from the person they are already talking to; it kept sending after
 * a workspace switched its receptionist to 'ask'; and nothing capped it, so a
 * caller who phoned repeatedly got one billable template per attempt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { outboundGate, refusalScript } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/outbound-gate.ts")).href
);

const NOW = 1_800_000_000_000;
/** A caller asking for their link, on an ordinary thread. */
const base = {
  optedOut: false,
  pausedUntilMs: null,
  replyMode: "auto",
  sentToday: 0,
  dailyCap: 3,
  nowMs: NOW,
};
const gate = (over) => outboundGate({ ...base, ...over });

test("the ordinary case sends", () => {
  const d = gate({});
  assert.equal(d.allowed, true);
  assert.equal(d.refusal, null);
});

test("consent outranks a caller asking out loud", () => {
  // Someone who said stop said stop, whatever channel they said it on — asking
  // on the phone is not a fresh opt-in.
  const d = gate({ optedOut: true });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "opted_out");
});

test("REGRESSION: a thread a human has taken over is not texted over", () => {
  const d = gate({ pausedUntilMs: NOW + 60_000 });
  assert.equal(d.allowed, false);
  assert.equal(d.refusal, "human_has_it");
});

test("an EXPIRED pause does not block — the human is done", () => {
  const d = gate({ pausedUntilMs: NOW - 1 });
  assert.equal(d.allowed, true);
});

test("REGRESSION: 'ask' mode silences this sender too", () => {
  // A send triggered from a phone call is no less automatic for having been
  // requested out loud. The workspace turned automation off.
  for (const mode of ["ask", "off", "never", ""]) {
    assert.equal(gate({ replyMode: mode }).refusal, "policy_hold", `mode ${mode}`);
  }
});

test("REGRESSION: repeated calls cannot send unlimited templates", () => {
  assert.equal(gate({ sentToday: 2 }).allowed, true, "under the cap");
  assert.equal(gate({ sentToday: 3 }).refusal, "daily_cap", "at the cap");
  assert.equal(gate({ sentToday: 9 }).refusal, "daily_cap", "past it");
});

test("consent is reported before every other refusal", () => {
  // All four conditions at once. The reason is logged and shapes what the agent
  // says, so the ordering has to be the one an operator would expect.
  const d = gate({ optedOut: true, pausedUntilMs: NOW + 1, replyMode: "ask", sentToday: 99 });
  assert.equal(d.refusal, "opted_out");
});

/* --------------------------- what the caller hears ------------------------ */

test("no refusal leaks our internal state to the caller", () => {
  // The agent SPEAKS these. A caller must not be told a colleague is mid-thread
  // with them, nor hear the words for our policy machinery.
  for (const r of ["opted_out", "human_has_it", "policy_hold", "daily_cap"]) {
    const said = refusalScript(r, "(646) 932-5775");
    assert.ok(said.length > 20, `${r} must say something useful`);
    assert.doesNotMatch(said, /paused|policy_hold|opted_out|daily_cap|rate cap|tenant/i, r);
  }
});

test("every refusal offers the caller a way forward", () => {
  for (const r of ["opted_out", "human_has_it", "policy_hold", "daily_cap"]) {
    assert.match(
      refusalScript(r, "(646) 932-5775"),
      /offer|tell the caller|book/i,
      `${r} must name an alternative — the caller is waiting on the line`,
    );
  }
});

test("veto is not off: the booking link a caller just asked for goes out", () => {
  // Veto holds a reply the receptionist COMPOSED so a person can redirect it.
  // A template the caller requested has nothing to redirect, and refusing it
  // silently punished the workspaces that chose the middle setting.
  assert.equal(gate({ replyMode: "veto" }).allowed, true);
  assert.equal(gate({ replyMode: "auto" }).allowed, true);
  assert.equal(gate({ replyMode: "never" }).refusal, "policy_hold", "a person set to Never is still refused");
});
