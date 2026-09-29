/**
 * The tenant config schema has to survive the two apps deploying separately.
 *
 * apps/edge and apps/dashboard are different Vercel projects and ship
 * independently, so there is always a window where one is newer. A strict
 * read turns that window into silence: the first dashboard deploy to write a
 * new section, or a new field inside one, is refused in its entirety by the
 * older edge running beside it, the receptionist goes completely silent on a
 * live line, and the log says the config is broken while the persona sits
 * there intact. The top level stopped being strict for this; the sections
 * stayed strict until 27 September 2026, which kept the same mute one level
 * down.
 *
 * So: the READ leaves out any key it has never heard of, at any depth, and
 * says which (`ignored`); the SAVE refuses an unknown field inside a section,
 * by name, since there it is a typo the runtime would silently never apply.
 *
 * This must hold before any new config field is added, which is why it is
 * pinned here rather than left to reviewer memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseTenantConfig,
  parseTenantConfigResult,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  withFirstAlertAddress,
  withStoredKeysKept,
} from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { loadTenantRuntime } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/tenant-runtime.ts")).href);

const brain = {
  business_name: "Test Salon",
  phone_display: "(555) 123-4567",
  booking_link: "https://example.com/book",
  system_prompt: "x".repeat(60),
  fallbacks: { greeting: "hi", error: "sorry", non_text: "got it" },
};
const notifications = { from: "desk@example.com", escalation_emails: ["owner@example.com"] };

const issuesOf = (r) => r.error.issues.map((i) => ({ code: i.code, path: i.path, message: i.message }));

test("a section the running code has never heard of is IGNORED, not fatal, and said", () => {
  // The forward-compatibility case: a newer dashboard wrote `guardrails`.
  const r = parseTenantConfigResult({ brain, guardrails: { no_prices: true } });
  assert.equal(r.ok, true, "an unknown top-level section broke the whole config");
  assert.equal(r.config.brain?.business_name, "Test Salon", "the persona must survive intact");
  assert.equal("guardrails" in r.config, false, "unknown keys are stripped, not carried");
  assert.deepEqual(r.ignored, ["guardrails"]);
});

test("a field the running code has never heard of, inside a section, is IGNORED and said, not fatal", () => {
  // The case the strict sections kept: a newer dashboard wrote a new field into brain.
  const r = parseTenantConfigResult({ brain: { ...brain, greeting_style: "warm" } });
  assert.equal(r.ok, true, "an unknown field inside brain broke the whole config");
  assert.equal(r.config.brain?.business_name, "Test Salon", "the persona must survive intact");
  assert.equal("greeting_style" in r.config.brain, false, "the field is left out, not carried");
  assert.deepEqual(r.ignored, ["brain.greeting_style"]);
});

test("an unknown field at any depth is left out and named by its path, and nothing else is", () => {
  const r = parseTenantConfigResult({
    brain: {
      ...brain,
      fallbacks: { ...brain.fallbacks, sms: "later" },
      profile: { services: [{ name: "Cut" }, { name: "Colour", colour_code: "7N" }] },
    },
    notifications,
    features: { vision: true, video: true },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ignored.sort(), ["brain.fallbacks.sms", "brain.profile.services.1.colour_code", "features.video"]);
  assert.deepEqual(r.config.brain.profile.services, [{ name: "Cut" }, { name: "Colour" }]);
  assert.deepEqual(r.config.notifications, notifications, "a known section passes through whole");
  assert.equal(r.config.features.vision, true);
});

test("the receptionist keeps speaking across a split deploy", () => {
  // The consequence, stated as the thing that actually matters.
  for (const cfg of [{ brain, some_future_section: { anything: 1 } }, { brain: { ...brain, some_future_field: 1 } }]) {
    const parsed = parseTenantConfig(cfg);
    assert.ok(parsed?.brain, `a split deploy muted the live line: ${JSON.stringify(Object.keys(cfg))}`);
  }
});

test("the edge's receptionist keeps its brain over a field it has never heard of, and logs what it left out", async () => {
  const tenantId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const db = fakeDb(
    {
      tenant_config: [{ tenant_id: tenantId, config: { brain: { ...brain, greeting_style: "warm" } } }],
      tenants: [{ id: tenantId, name: "Test Salon", timezone: "America/New_York" }],
    },
    {},
    { runtime_stamp: () => "1|a|b" },
  );
  const lines = [];
  const warn = console.warn;
  console.warn = (line) => lines.push(String(line));
  let rt;
  try {
    rt = await loadTenantRuntime(db, { tenantId, channelId: "ch1", kind: "whatsapp", credentialsRef: null });
  } finally {
    console.warn = warn;
  }
  assert.equal(rt.brain?.business_name, "Test Salon", "the receptionist lost its brain over an unknown field");
  const said = lines.map((l) => JSON.parse(l)).find((l) => l.event === "tenant_config_keys_ignored");
  assert.ok(said, `no tenant_config_keys_ignored line: ${lines.join(" | ")}`);
  assert.equal(said.tenant, tenantId);
  assert.deepEqual(said.keys, ["brain.greeting_style"]);
});

test("the save still refuses a typo INSIDE a known section, by name, where zod's strict object said it", () => {
  // Strictness is kept where it catches real mistakes: a misspelled field is
  // one the runtime would silently never apply.
  const r = TenantConfigWriteSchema.safeParse({ brain: { ...brain, buisness_name: "typo" } });
  assert.equal(r.success, false, "an unknown field inside brain was saved");
  assert.deepEqual(issuesOf(r), [
    { code: "unrecognized_keys", path: ["brain"], message: 'Unrecognized key: "buisness_name"' },
  ]);
});

test("the save names every unknown field, once per object, at any depth", () => {
  const r = TenantConfigWriteSchema.safeParse({
    brain: { ...brain, colour: 1, shade: 2, profile: { services: [{ name: "Cut", price: 30 }] } },
  });
  assert.equal(r.success, false);
  assert.deepEqual(issuesOf(r), [
    { code: "unrecognized_keys", path: ["brain"], message: 'Unrecognized keys: "colour", "shade"' },
    { code: "unrecognized_keys", path: ["brain", "profile", "services", 0], message: 'Unrecognized key: "price"' },
  ]);
});

test("a save that is malformed as well is refused on what is malformed; an unknown field is never stored", () => {
  // The unknown fields are found against what the read kept, and a config the
  // read refuses keeps nothing: the save names the malformed field, and the
  // unknown one once the rest is well formed. Either way nothing is saved.
  const both = { brain: { ...brain, booking_link: "not-a-url", colour: 1 } };
  const first = TenantConfigWriteSchema.safeParse(both);
  assert.equal(first.success, false);
  assert.deepEqual(
    issuesOf(first).map((i) => i.path.join(".")),
    ["brain.booking_link"],
  );
  const then = TenantConfigWriteSchema.safeParse({ brain: { ...both.brain, booking_link: brain.booking_link } });
  assert.equal(then.success, false);
  assert.deepEqual(issuesOf(then), [
    { code: "unrecognized_keys", path: ["brain"], message: 'Unrecognized key: "colour"' },
  ]);
});

test("a section a page SENDS that this build has never heard of is dropped from the save, and the rest kept", () => {
  const r = TenantConfigWriteSchema.safeParse({ brain, guardrails: { no_prices: true } });
  assert.equal(r.success, true, JSON.stringify(r.error?.issues));
  assert.equal("guardrails" in r.data, false);
  assert.equal(r.data.brain.business_name, "Test Salon");
});

/** Every path in a JSON value, an array's elements by index, as the dotted names `ignored` uses. */
const pathsOf = (v, at = []) =>
  v && typeof v === "object"
    ? Object.entries(v).flatMap(([k, x]) => [[...at, k].join("."), ...pathsOf(x, [...at, k])])
    : [];

test("REGRESSION (defect 19): a save after a rollback keeps what a newer build stored, at every depth", () => {
  // A newer build wrote a section and fields inside sections; this build's read (the settings GET) leaves them out,
  // and the page sends back what it was shown with one edit. The column is written whole, so the save puts back
  // every stored key the read left out, and the page's edit lands.
  const stored = {
    brain: {
      ...brain,
      a_new_brain_field: { on: true },
      fallbacks: { ...brain.fallbacks, sms: "later" },
      profile: { services: [{ name: "Cut" }, { name: "Colour", colour_code: "7N" }] },
    },
    notifications,
    guardrails: { no_prices: true },
  };
  const read = parseTenantConfigResult(stored);
  assert.deepEqual(read.ignored.sort(), [
    "brain.a_new_brain_field",
    "brain.fallbacks.sms",
    "brain.profile.services.1.colour_code",
    "guardrails",
  ]);
  const page = structuredClone(read.config);
  page.brain.business_name = "Test Salon & Spa";
  const sent = TenantConfigWriteSchema.safeParse(page);
  assert.equal(sent.success, true, JSON.stringify(sent.error?.issues));
  const saved = withStoredKeysKept(sent.data, stored);
  assert.deepEqual(
    pathsOf(stored).filter((p) => !pathsOf(saved).includes(p)),
    [],
    "a stored path the page never saw was deleted",
  );
  assert.equal(saved.brain.business_name, "Test Salon & Spa", "the page's edit lands");
  assert.deepEqual(saved.guardrails, { no_prices: true });
  assert.deepEqual(saved.brain.profile.services[1], { name: "Colour", colour_code: "7N" });
  assert.deepEqual(parseTenantConfigResult(saved).config, sent.data, "what this build reads is what the page sent");
});

test("the save keeps only what the read left out: a known field the page cleared, a section it removed and an element it changed are the page's", () => {
  const stored = {
    brain: {
      ...brain,
      booking_link: "https://example.com/book",
      profile: {
        services: [
          { name: "Cut", tint: "a" },
          { name: "Colour", tint: "b" },
        ],
      },
    },
    calendar: { ical_url: "https://calendar.example.com/a.ics", feed_v2: true },
  };
  const page = structuredClone(parseTenantConfigResult(stored).config);
  delete page.brain.booking_link;
  delete page.calendar;
  // The services reordered, and Cut renamed: Colour came back as it was shown, so it keeps its tint wherever it
  // sits; Trim is not an element the read showed, so which stored one it was is not guessed.
  page.brain.profile.services = [{ name: "Colour" }, { name: "Trim" }];
  const saved = withStoredKeysKept(TenantConfigWriteSchema.parse(page), stored);
  assert.equal("booking_link" in saved.brain, false, "a known field the page cleared stays cleared");
  assert.equal("calendar" in saved, false, "a section the page removed stays removed, its unknown keys with it");
  assert.deepEqual(saved.brain.profile.services, [{ name: "Colour", tint: "b" }, { name: "Trim" }]);
  // A stored config the read refuses keeps nothing: which of its keys are unknown cannot be told.
  const broken = { brain: { ...brain, booking_link: "not-a-url", extra: 1 } };
  assert.deepEqual(withStoredKeysKept({ brain }, broken), { brain });
});

test("the first alert address is added to a config without deleting what a newer build stored in it", () => {
  const stored = { brain: { ...brain, a_new_brain_field: 1 }, guardrails: { no_prices: true } };
  const next = withFirstAlertAddress(stored, "Owner@Example.com");
  assert.deepEqual(next.notifications, { escalation_emails: ["owner@example.com"] });
  assert.equal(next.brain.a_new_brain_field, 1);
  assert.deepEqual(next.guardrails, { no_prices: true });
});

test("a malformed section reports WHERE, not just that it failed", () => {
  // "no brain profile configured" while a good persona sits behind one bad
  // field is the message that wastes an operator's afternoon.
  const r = parseTenantConfigResult({ brain: { ...brain, booking_link: "not-a-url" } });
  assert.equal(r.ok, false);
  assert.ok(
    r.issues.some((i) => i.includes("booking_link")),
    `the offending path must be named: ${r.issues.join("; ")}`,
  );
});

test("an absent config is valid and empty — not an error, and nothing is ignored", () => {
  for (const empty of [undefined, null, {}]) {
    const r = parseTenantConfigResult(empty);
    assert.equal(r.ok, true, `${JSON.stringify(empty)} should parse`);
    assert.equal(r.config.brain, undefined);
    assert.deepEqual(r.ignored, []);
  }
});

test("nothing on the read path is strict, and the save is", () => {
  // Asserted structurally too: this is the property a future edit is most
  // likely to reverse by reflex, since `.strict()` reads as the safer choice.
  // The addresses are real ones, so the section's other rules pass and only
  // the unknown field is judged.
  assert.equal(TenantConfigSchema.safeParse({ notifications }).success, true, "the section itself must parse");
  assert.equal(
    TenantConfigSchema.safeParse({ unknown_section: 1 }).success,
    true,
    "the read must tolerate unknown sections",
  );
  assert.equal(
    TenantConfigSchema.safeParse({ notifications: { ...notifications, extra: 1 } }).success,
    true,
    "the read must tolerate unknown fields inside a section",
  );
  assert.equal(
    TenantConfigWriteSchema.safeParse({ notifications: { ...notifications, extra: 1 } }).success,
    false,
    "the save must refuse unknown fields inside a section",
  );
});
