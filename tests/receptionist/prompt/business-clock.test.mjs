/**
 * A receptionist with opening hours and no clock.
 *
 * "Are you open?" it could answer from the hours table. "Are you open RIGHT
 * NOW?" — the question customers actually ask — it was answering too, from
 * nothing at all: it had never been told the date, the time, or which zone the
 * stated hours were even in. A model given a table and no clock does not say
 * "I don't know what day it is"; it picks one.
 *
 * The timezone is `tenants.timezone`, the column the metrics RPCs and the Today
 * surface already read. Adding one to the business profile would have been the
 * second copy of a fact — the same mistake as keeping the hours in two places.
 *
 * The clock is deliberately NOT part of the composed prompt: that block is sent
 * with `cache_control`, and a value that changes every minute would evict the
 * whole business profile from the prompt cache on every single message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BusinessProfileSchema,
  TenantConfigWriteSchema,
  composeSystemPrompt,
  describeNow,
  resolveSystemPrompt,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";
import { runtime, text, world } from "../../inbound/_world.mjs";
import { sure } from "../../inbound/phases/_fixtures.mjs";
import { scripted, json } from "../../ai/_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
const { setModelFetch } = await importSrc("apps/edge/lib/ai/model.ts");
const { generateReply } = await importSrc("apps/edge/lib/ai/receptionist-brain.ts");
const { loadTenantRuntime } = await importSrc("apps/edge/lib/shared/tenant-runtime.ts");

const brain = {
  business_name: "Marisa's Beauty Salon",
  phone_display: "(212) 555-0142",
  booking_link: "https://example.com/book",
  system_prompt: "You are the assistant for the salon. " + "x".repeat(40),
  fallbacks: { greeting: "hi", error: "err", non_text: "nt" },
};
const profile = { hours: { mon: { open: "09:30", close: "18:00" } } };

/** 3:42 PM in New York, 12:42 PM in Los Angeles, on a Saturday. */
const INSTANT = new Date("2026-08-29T19:42:00Z");

/* -------------------------------- the clock -------------------------------- */

test("the receptionist is told the day, date and time in the business's own zone", () => {
  const s = describeNow("America/New_York", INSTANT);
  assert.ok(s.includes("Saturday"), s);
  assert.ok(s.includes("August 29, 2026"), s);
  assert.ok(s.includes("3:42 PM"), s);
  assert.ok(s.includes("America/New_York"), "the zone is named, not implied");
});

test("the SAME instant reads differently for a business on the other coast", () => {
  // The tenant's zone, not the server's. A Vercel lambda has no useful opinion
  // about what time it is where the salon is.
  const ny = describeNow("America/New_York", INSTANT);
  const la = describeNow("America/Los_Angeles", INSTANT);
  assert.ok(ny.includes("3:42 PM"));
  assert.ok(la.includes("12:42 PM"));
});

test("no zone means no clock, and saying so — never a guess", () => {
  for (const bad of [null, undefined, "", "Mars/Olympus_Mons"]) {
    const s = describeNow(bad, INSTANT);
    assert.ok(/do not know today's date/i.test(s), `${bad} produced: ${s}`);
    assert.ok(/never guess/i.test(s), "it must forbid picking a day");
    assert.ok(!s.includes("3:42"), "a wrong clock is worse than no clock");
  }
});

/* ------------------------- what stays in the cache ------------------------- */

test("the clock is NOT in the composed prompt — that block is cached", () => {
  const p = resolveSystemPrompt({ ...brain, profile }, "whatsapp", "America/New_York");
  assert.ok(!p.includes("Right now it is"), "a per-minute value must not sit in a cached block");
  assert.ok(!p.includes("August 29"));
});

test("the hours say WHICH clock they are on", () => {
  const withTz = composeSystemPrompt(brain, profile, "whatsapp", "America/New_York");
  assert.ok(withTz.includes("Opening hours (all times America/New_York):"));
  // Unknown zone: state the hours plainly rather than label them wrongly.
  const without = composeSystemPrompt(brain, profile, "whatsapp");
  assert.ok(without.includes("Opening hours:"));
  assert.ok(!without.includes("all times"));
});

test("the timezone has ONE home, and it is not the business profile", () => {
  // tenants.timezone is the column. A profile field would be a second copy,
  // free to drift from the one the dashboard's own "today" is computed with.
  const read = BusinessProfileSchema.parse({ timezone: "America/New_York" });
  assert.equal("timezone" in read, false, "the profile must never carry a timezone of its own");
  const saved = TenantConfigWriteSchema.safeParse({ brain: { ...brain, profile: { timezone: "America/New_York" } } });
  assert.equal(saved.success, false, "and a save must refuse one");
});

/* ----------------------------- the call sites ------------------------------ */

test("the clock is sent as its OWN system block, uncached", async () => {
  // One line per contact would otherwise evict the business profile from the cache on every new customer. Run through
  // the receptionist's own call with the model at the wire (pinned as receptionist-brain.ts's text until 26 Nov 2026).
  const api = scripted(
    json({
      reply: "We open at 9:30.",
      intent: "hours",
      escalate: false,
      reason: "",
      confidence: 0.9,
      facts_used: [],
      language: "en",
    }),
  );
  setModelFetch(api.fetch);
  try {
    const system = composeSystemPrompt(brain, profile, "whatsapp", "America/New_York");
    const now = describeNow("America/New_York", INSTANT);
    await generateReply({
      history: [],
      userText: "are you open right now?",
      systemPrompt: system,
      fallbackText: "Hold on.",
      nowNote: now,
      call: { tenantId: null },
    });
    const blocks = api.calls[0].body.system;
    assert.deepEqual(
      blocks.map((b) => [b.text, b.cache_control ?? null]),
      [
        [system, { type: "ephemeral" }],
        [now, null],
      ],
      "the cached prompt first, then the clock after it, uncached",
    );
  } finally {
    setModelFetch(null);
  }
});

test("both channels read the tenant's zone, from its row, and neither invents one", async () => {
  // Run in a zone the code was not written in (pinned as the message path's text, with a lint for a hard-coded New York,
  // until 26 Nov 2026). The runtime reads the zone from the tenants row, never from config.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-0000000c10c4";
  const db = fakeDb(
    {
      tenants: [{ id: T, name: "Harbor", timezone: "Pacific/Auckland", status: "active" }],
      tenant_channels: [],
      tenant_config: [{ tenant_id: T, config: { brain: { ...brain, profile } } }],
      policies: [],
      google_listings: [],
    },
    {},
    { runtime_stamp: () => "stamp-clock" },
  );
  const rt = await loadTenantRuntime(db, { tenantId: T, channelId: "wa-1", kind: "whatsapp", credentialsRef: null });
  assert.equal(rt.timezone, "Pacific/Auckland", "the tenants row's zone");

  // A text's turn: one clock for the prompt and the clock note, both in the workspace's zone.
  for (const tz of ["Pacific/Auckland", null]) {
    let asked = null;
    const before = new Date();
    const rtOf = runtime({ brain: { ...brain, profile }, timezone: tz });
    await world({ env: { modelKey: "sk-test" }, rt: rtOf }).run(text("are you open right now?"), {
      brain: async () => ({
        generateReply: async (a) => {
          asked = a;
          return { text: "We open at 9:30.", escalate: false, meta: sure, usage: { input_tokens: 40 } };
        },
      }),
    });
    const after = new Date();
    const either = (f) => [f(before), f(after)];
    assert.ok(
      either((d) => describeNow(tz, d, undefined)).includes(asked.nowNote.split("\n\n")[0]),
      `${tz}: the clock note`,
    );
    assert.ok(
      either((d) => resolveSystemPrompt({ ...brain, profile }, "whatsapp", tz, d, rtOf.policy, rtOf.known)).includes(
        asked.systemPrompt,
      ),
      `${tz}: the prompt in the same zone, by the one resolver`,
    );
  }
});
