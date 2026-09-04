/**
 * The truth table for "may the receptionist speak, and in whose voice".
 *
 * The row that matters is `disabled channel on the env-default number`. Before
 * this was extracted, `drFallback` keyed on the env var alone, so a channel set
 * to status='disabled' — the only off switch the schema offers — produced
 * drFallback=true and replyMode='auto'. The receptionist kept answering real
 * customers, with tenantId null, which also meant nothing was written to the
 * database and the historical opt-out check (which reads the ingest result)
 * could not run. The off switch made the bot LESS accountable, not silent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { replyPosture, effectiveReplyMode } from "../../../apps/edge/lib/reply-posture.ts";

/** A routed, healthy tenant with a policy. */
const healthy = {
  isEnvDefault: true,
  routingConsulted: true,
  channelResolved: true,
  runtimeUsable: true,
  policyMode: "auto",
};

test("a healthy routed tenant follows its OWN policy, never the DR profile", () => {
  assert.deepEqual(replyPosture(healthy), { drFallback: false, replyMode: "auto" });
  assert.deepEqual(
    replyPosture({ ...healthy, policyMode: "ask" }),
    { drFallback: false, replyMode: "ask" },
  );
  // A tenant that is not the env default gets no DR profile under any condition.
  assert.deepEqual(
    replyPosture({ ...healthy, isEnvDefault: false, policyMode: "auto" }),
    { drFallback: false, replyMode: "auto" },
  );
});

test("a missing policy mode fails safe to 'ask'", () => {
  assert.deepEqual(
    replyPosture({ ...healthy, policyMode: undefined }),
    { drFallback: false, replyMode: "ask" },
  );
});

test("no database at all is the rollback path — the env default still speaks", () => {
  // Pre-Postgres operation, and the env flip we can roll back to. Silencing the
  // live line here would turn a rollback into an outage.
  assert.deepEqual(
    replyPosture({ isEnvDefault: true, routingConsulted: false, channelResolved: false, runtimeUsable: false }),
    { drFallback: true, replyMode: "auto" },
  );
  // ...but only for the tenant that HAS a baked profile.
  assert.deepEqual(
    replyPosture({ isEnvDefault: false, routingConsulted: false, channelResolved: false, runtimeUsable: false }),
    { drFallback: false, replyMode: "ask" },
  );
});

test("a control-plane READ FAILURE falls back — that is what DR is for", () => {
  // The channel resolved, so the configuration exists; we just could not read
  // the runtime. An infra blip must not take the live line down.
  assert.deepEqual(
    replyPosture({ isEnvDefault: true, routingConsulted: true, channelResolved: true, runtimeUsable: false }),
    { drFallback: true, replyMode: "auto" },
  );
  assert.deepEqual(
    replyPosture({ isEnvDefault: false, routingConsulted: true, channelResolved: true, runtimeUsable: false }),
    { drFallback: false, replyMode: "ask" },
  );
});

test("a DISABLED channel silences the receptionist, even on the env-default number", () => {
  // THE REGRESSION. The database answered and said this channel is not active.
  // That is a deliberate state, not a failure, so there is nothing to fall back
  // to. drFallback must be false or the bot answers off the books.
  const disabled = {
    isEnvDefault: true,
    routingConsulted: true,
    channelResolved: false,
    runtimeUsable: false,
  };
  assert.deepEqual(
    replyPosture(disabled),
    { drFallback: false, replyMode: "ask" },
    "a disabled channel fell back to the DR persona and kept replying",
  );
});

test("a routing LOOKUP FAILURE falls back — it is not a decision", () => {
  // The database did not answer. Treating that the same as "the database said
  // this channel is off" turned a Postgres blip on a cold lambda into silence
  // on the live line — strictly worse than the behaviour it replaced, which is
  // the kind of regression a hardening change is most likely to introduce.
  assert.deepEqual(
    replyPosture({
      isEnvDefault: true, routingConsulted: true, routingFailed: true,
      channelResolved: false, runtimeUsable: false,
    }),
    { drFallback: true, replyMode: "auto" },
    "a database error silenced the receptionist instead of falling back",
  );
  // Still only for the tenant that HAS a baked profile.
  assert.deepEqual(
    replyPosture({
      isEnvDefault: false, routingConsulted: true, routingFailed: true,
      channelResolved: false, runtimeUsable: false,
    }),
    { drFallback: false, replyMode: "ask" },
  );
});

test("a lookup failure and a disabled channel are NOT the same state", () => {
  const shared = { isEnvDefault: true, routingConsulted: true, channelResolved: false, runtimeUsable: false };
  const failed = replyPosture({ ...shared, routingFailed: true });
  const disabled = replyPosture({ ...shared, routingFailed: false });
  assert.notDeepEqual(failed, disabled, "the two must diverge — conflating them is the bug");
  assert.equal(failed.drFallback, true, "infra blip -> ride it out");
  assert.equal(disabled.drFallback, false, "deliberate off switch -> stay silent");
});

test("an unknown phone number id is never answered", () => {
  // Traffic for a number that is not ours at all.
  assert.deepEqual(
    replyPosture({ isEnvDefault: false, routingConsulted: true, channelResolved: false, runtimeUsable: false }),
    { drFallback: false, replyMode: "ask" },
  );
});

test("DR is never granted without an active channel when routing WAS consulted", () => {
  // Exhaustive over the four booleans: assert the invariant directly rather
  // than trusting the six cases above to be complete.
  for (const isEnvDefault of [true, false]) {
    for (const routingConsulted of [true, false]) {
      for (const routingFailed of [true, false]) {
        for (const channelResolved of [true, false]) {
          for (const runtimeUsable of [true, false]) {
            const p = replyPosture({
              isEnvDefault, routingConsulted, routingFailed, channelResolved, runtimeUsable,
              policyMode: "auto",
            });
            if (p.drFallback) {
              assert.ok(isEnvDefault, "DR granted to a tenant with no baked profile");
              assert.ok(
                !routingConsulted || routingFailed || channelResolved,
                "DR granted while the database ANSWERED that the channel is not active",
              );
            }
            if (p.replyMode === "auto" && !runtimeUsable) {
              assert.ok(p.drFallback, "'auto' without a usable runtime must mean DR");
            }
          }
        }
      }
    }
  }
});

/* ---------------------- the person's own setting wins -------------------- */

test("a person's own receptionist mode overrides the workspace policy on the routed path", () => {
  const routed = { drFallback: false, replyMode: "auto" };
  assert.equal(effectiveReplyMode(routed, "never"), "never", "Never for a difficult customer silences the bot for them");
  assert.equal(effectiveReplyMode(routed, "ask"), "ask");
  assert.equal(effectiveReplyMode({ drFallback: false, replyMode: "ask" }, "auto"), "auto", "and can unmute one person in a timid workspace");
});

test("no person setting changes nothing, and the DR profile ignores person settings entirely", () => {
  assert.equal(effectiveReplyMode({ drFallback: false, replyMode: "veto" }, null), "veto");
  assert.equal(effectiveReplyMode({ drFallback: false, replyMode: "auto" }, undefined), "auto");
  // No control plane was consulted on this path, so nothing person-specific
  // can be trusted — the DR profile keeps answering as it always has.
  assert.equal(effectiveReplyMode({ drFallback: true, replyMode: "auto" }, "never"), "auto");
});
