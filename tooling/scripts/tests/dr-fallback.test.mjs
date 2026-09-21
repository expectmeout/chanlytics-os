/**
 * The disaster-recovery fallback, as the edge actually loads it.
 *
 * `apps/edge/lib/tenant-fallback.ts` is what the receptionist answers with
 * when the control plane cannot be READ, for the env-default tenant alone. It
 * used to be a literal: one live workspace's name, its booking link, its
 * greeting, the number it published and its owner's personal address, checked
 * into the repository so that every contributor and every clone carried them.
 *
 * It is configuration now, read once at module load from DR_FALLBACK_BRAIN_JSON
 * through the SAME parse helper `tenant-runtime.ts` reads a stored row with.
 * What that leaves to prove is here: that a set variable is taken exactly as
 * the database's row would be, that a broken one degrades instead of throwing
 * at import — a throw here refuses every message on the pilot line — and that
 * what stands in for it states no business fact at all.
 *
 * Each case imports the module afresh under a query suffix, because the value
 * is computed ONCE per module instance, which is the behaviour being tested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BrainConfigSchema, fallbackMessages, resolveFacts, unknownDetails } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MODULE = pathToFileURL(path.join(ROOT, "apps/edge/lib/tenant-fallback.ts")).href;

const DR_KEYS = ["DR_FALLBACK_BRAIN_JSON", "DR_FALLBACK_ESCALATION_EMAILS", "DR_FALLBACK_FROM", "LEAD_TO", "LEAD_FROM"];

/**
 * The module as a deployment holding `env` would load it, with whatever it
 * said while loading. A fresh instance per case: the whole point is that the
 * variable is read once, so a second case must not read the first one's answer.
 */
let instance = 0;
async function loadWith(env) {
  const before = Object.fromEntries(DR_KEYS.map((k) => [k, process.env[k]]));
  for (const k of DR_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const said = [];
  const error = console.error;
  console.error = (...args) => said.push(args.join(" "));
  try {
    const mod = await import(`${MODULE}?dr=${++instance}`);
    return { ...mod, said };
  } finally {
    console.error = error;
    for (const k of DR_KEYS) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
}

/** A complete brain config, of a business nobody has: what an operator sets. */
const OPERATOR_BRAIN = {
  business_name: "Riverside Studio",
  booking_link: "https://booking.example/riverside",
  phone_display: "(646) 555-0175",
  system_prompt: "You are the assistant for Riverside Studio, answering inbound customer messages. Be warm, brief and honest.",
  fallbacks: {
    greeting: "Thanks for writing to {business}. Book anytime: {booking link}",
    error: "Thanks for writing to {business}! A member of the team will reply here soon.",
    non_text: "Thanks for your message! For anything urgent, call us at {phone}.",
  },
};

/* ------------------------------------------------- what stands in for it */

test("the built-in default states no business fact, and parses", async () => {
  const { FALLBACK_BRAIN } = await loadWith({});

  // No name, no link, no number, nowhere. Every string it holds, scanned: a
  // fallback that named a business would be the defect this file exists to
  // remove, and it would be a DIFFERENT business from whoever's line it
  // answered on.
  const strings = [FALLBACK_BRAIN.business_name, FALLBACK_BRAIN.booking_link, FALLBACK_BRAIN.system_prompt, ...Object.values(FALLBACK_BRAIN.fallbacks)];
  for (const s of strings) {
    assert.ok(!/https?:\/\/|www\.|\.com\b/i.test(s), `a link in the neutral fallback: ${s}`);
    assert.ok(!/\d[\d\s().-]{6,}\d/.test(s), `a phone number in the neutral fallback: ${s}`);
    assert.ok(!/@/.test(s), `an address in the neutral fallback: ${s}`);
  }
  assert.equal(FALLBACK_BRAIN.business_name, "", "the two fields that could name a business are empty, not invented");
  assert.equal(FALLBACK_BRAIN.booking_link, "");
  assert.equal(FALLBACK_BRAIN.phone_display, undefined, "and it publishes no number at all");

  // What it DOES say: what it is, and that a person takes it from here.
  assert.match(FALLBACK_BRAIN.system_prompt, /automated assistant/i);
  assert.match(FALLBACK_BRAIN.system_prompt, /person will follow up/i);
  for (const message of Object.values(FALLBACK_BRAIN.fallbacks)) assert.match(message, /member of the team|follow up/i);

  // AND PARSES. The prompt and the three messages satisfy the same schema the
  // runtime holds a stored row to, so the default is a brain the receptionist
  // could have been given — with a name and a link supplied, it is one.
  const named = BrainConfigSchema.safeParse({ ...FALLBACK_BRAIN, business_name: "Riverside Studio", booking_link: "https://booking.example/riverside" });
  assert.ok(named.success, named.success ? "" : JSON.stringify(named.error.issues));

  // The two it will not invent are the only two it lacks, and that is the
  // point rather than an oversight: booking_link is `.url()`, so the only
  // values that would parse are a URL a customer could be sent to.
  const bare = BrainConfigSchema.safeParse(FALLBACK_BRAIN);
  assert.deepEqual(
    (bare.success ? [] : bare.error.issues.map((i) => i.path.join("."))).sort(),
    ["booking_link", "business_name"],
    "the neutral fallback states no fact, and refuses no other field",
  );
});

test("the neutral fallback's three messages go out exactly as written", async () => {
  const { FALLBACK_BRAIN } = await loadWith({});
  // fallbackMessages fills {business}, {booking link} and {phone} as a message
  // goes out and drops the sentence naming a detail the workspace does not
  // have. These name none, so there is nothing to fill and nothing to drop —
  // a customer reads the words above, whole.
  assert.deepEqual(fallbackMessages(FALLBACK_BRAIN, null), FALLBACK_BRAIN.fallbacks);
  for (const message of Object.values(FALLBACK_BRAIN.fallbacks)) assert.deepEqual(unknownDetails(message), []);

  // And the empty fields read as ABSENT, the product's own "not set" — not as
  // a business called "" with a link of "".
  const facts = resolveFacts(FALLBACK_BRAIN, null);
  assert.deepEqual(
    [facts.business_name.source, facts.booking_link.source, facts.phone_display.source],
    ["absent", "absent", "absent"],
  );
});

/* --------------------------------------------- what an operator supplies */

test("a configured fallback is taken exactly as the stored row would be", async () => {
  const { FALLBACK_BRAIN } = await loadWith({ DR_FALLBACK_BRAIN_JSON: JSON.stringify(OPERATOR_BRAIN) });
  assert.deepEqual(FALLBACK_BRAIN, OPERATOR_BRAIN, "field for field: this is what the receptionist answers with during a blip");
  // Through the same door, so it speaks the same way: the messages name their
  // details and are filled as each goes out.
  assert.equal(
    fallbackMessages(FALLBACK_BRAIN, null).greeting,
    "Thanks for writing to Riverside Studio. Book anytime: https://booking.example/riverside",
  );
});

test("a variable that is not a config is a degraded state, never a throw", async () => {
  // A lambda that threw at import would refuse every message on the pilot
  // line over a mistyped variable — the opposite of what this path is for.
  for (const [raw, why] of [
    ["{ not json", "not JSON at all"],
    ['"a string"', "JSON, but not an object"],
    [JSON.stringify({ ...OPERATOR_BRAIN, booking_link: "booksy" }), "a link that is not a URL"],
    [JSON.stringify({ ...OPERATOR_BRAIN, system_prompt: "too short" }), "a prompt the schema refuses"],
    [JSON.stringify({ business_name: "Riverside Studio" }), "a brain missing everything else"],
  ]) {
    const { FALLBACK_BRAIN, said } = await loadWith({ DR_FALLBACK_BRAIN_JSON: raw });
    assert.equal(FALLBACK_BRAIN.business_name, "", `${why}: the neutral default stands in`);
    assert.ok(said.some((line) => /dr_fallback_brain_(invalid|unparseable)/.test(line)), `${why}: and an operator can see why in the log`);
  }
});

/* ------------------------------------------------------- who is told, and from */

test("the notices go to the addresses the environment names, and to the platform's own when it names none", async () => {
  const platform = { LEAD_TO: "ops@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };

  const own = await loadWith({ ...platform, DR_FALLBACK_ESCALATION_EMAILS: "owner@riverside.example, second@riverside.example", DR_FALLBACK_FROM: "Riverside Studio <hello@platform.test>" });
  assert.deepEqual(own.FALLBACK_NOTIFICATIONS, {
    escalation_emails: ["owner@riverside.example", "second@riverside.example"],
    from: "Riverside Studio <hello@platform.test>",
  }, "comma-separated, trimmed");

  // Unset, it falls to the pair notify.ts already addresses platform mail
  // with. The tenant this path serves IS that mailbox's own workspace, which
  // is the one case chooseAddressing lets the env pair answer for.
  const fell = await loadWith(platform);
  assert.deepEqual(fell.FALLBACK_NOTIFICATIONS, { escalation_emails: ["ops@platform.test"], from: "Pager <pager@platform.test>" });

  // And with nothing anywhere: an empty list, which chooseAddressing reads as
  // "no tenant mailbox" and pages the platform with instead. No personal
  // address is written down for it to guess with.
  const nothing = await loadWith({});
  assert.deepEqual(nothing.FALLBACK_NOTIFICATIONS, { escalation_emails: [] });
});
