/**
 * Lunch breaks and holidays — the two things a salon could not say.
 *
 * This design was written once, reviewed, and REJECTED. The rejection is the
 * reason this file reads the way it does, so the reasons are recorded here:
 *
 * The first draft put .strict(), .min(), .max() and .refine() on the new
 * nested schemas. Those sit INSIDE BusinessProfileSchema, which apps/edge
 * parses out of the database on every inbound message — and a parse failure
 * there is not a validation warning. It sets configBroken, the WhatsApp
 * receptionist stops replying, and the voice agent is handed no facts. An
 * owner adding a lunch break would have muted their own line.
 *
 * So the read path carries SHAPE only, and the composer is written to tell the
 * truth about whatever is already stored — including rows no form would ever
 * produce. Everything below is a case the reviewer demonstrated rendering a
 * falsehood.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BusinessProfileSchema,
  composeSystemPrompt,
  describeNow,
  hasProfile,
  hoursRuns,
} from "@chanlytics/contracts";

const base = { business_name: "Aurora", phone_display: "p", booking_link: "https://b.example" };
const TZ = "America/New_York";
const SEP1 = new Date("2026-09-01T15:00:00Z");
const text = (profile, now = SEP1) => composeSystemPrompt(base, profile, "whatsapp", TZ, now);
const day = (hours) => hoursRuns(hours).find((r) => r.text !== "Closed");

/* ------------------------- the read path stays open ----------------------- */

test("nothing the composer must survive is rejected by the parser", () => {
  // Each of these would have muted a live line under the rejected draft.
  const stored = [
    { hours: { mon: { intervals: [] } } },
    { hours: { mon: { intervals: [{ open: "09:00", close: "18:00", note: "am" }] } } },
    { hours: { mon: { intervals: [{ open: "20:00", close: "02:00" }] } } },
    { hours: { mon: { open: "09:00" } } },
    { closures: Array.from({ length: 60 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` })) },
    { closures: [{ date: "2027-01-02", until: "2026-12-24" }] },
    { closures: [{ date: "2026-09-07", note: "" }] },
    { closures: [{ date: "2026-11-31" }] },
  ];
  for (const p of stored) {
    assert.equal(BusinessProfileSchema.safeParse(p).success, true, JSON.stringify(p).slice(0, 60));
  }
});

/* ----------------------------- split shifts ------------------------------- */

test("a lunch break is stated, and so is the gap", () => {
  const r = day({ wed: { intervals: [{ open: "09:30", close: "13:00" }, { open: "15:00", close: "19:00" }] } });
  assert.equal(r.text, "09:30–13:00 and 15:00–19:00 (closed 13:00–15:00)");
});

test("array order is not chronology", () => {
  // Read positionally, these say "closed 19:00–09:30" — a window running
  // backwards through the night, stated to customers as fact.
  const scrambled = day({ wed: { intervals: [{ open: "15:00", close: "19:00" }, { open: "09:30", close: "13:00" }] } });
  const ordered = day({ wed: { intervals: [{ open: "09:30", close: "13:00" }, { open: "15:00", close: "19:00" }] } });
  assert.equal(scrambled.text, ordered.text);
});

test("touching shifts are one stretch, not a zero-length closure", () => {
  // Two stylists back to back is an ordinary day, and "closed 13:00–13:00" is
  // not a sentence anyone should read.
  const r = day({ wed: { intervals: [{ open: "09:00", close: "13:00" }, { open: "13:00", close: "19:00" }] } });
  assert.equal(r.text, "09:00–19:00");
});

test("open/close beside intervals loses neither", () => {
  // Both can be stored. Silently preferring one drops a fact from the prompt
  // with nothing to show it was there — the failure this area already had.
  const r = day({ wed: { open: "09:00", close: "18:00", intervals: [{ open: "18:00", close: "21:00" }] } });
  assert.equal(r.text, "09:00–21:00");
});

test("a day that says something unusable is NOT closed", () => {
  // "Closed" is an affirmative claim. Telling a customer not to come on a day
  // the business may be open is worse than admitting we cannot answer.
  for (const h of [{ open: "09:00" }, { close: "18:00" }, { open: "20:00", close: "02:00" }]) {
    const r = hoursRuns({ mon: h }).find((x) => x.from === "mon");
    assert.equal(r.text, "Hours not confirmed — ask them to call", JSON.stringify(h));
  }
  // Saying nothing at all is still Closed — that is a real answer.
  assert.equal(hoursRuns({ mon: {} })[0].text, "Closed");
});

/* ------------------------------- closures --------------------------------- */

test("upcoming closures are stated, past ones stop being said", () => {
  const p = text({ hours: { mon: { open: "09:00", close: "18:00" } }, closures: [
    { date: "2026-01-01", note: "gone" },
    { date: "2026-09-07", note: "Labor Day" },
  ] });
  assert.ok(p.includes("Monday, September 7, 2026 — Labor Day"));
  assert.ok(!p.includes("gone"), "a date that has passed is not news");
});

test("a date that does not exist is printed as stored, not as the wrong day", () => {
  // 2026-11-31 parses and rolls forward to 1 December. Announcing a closure on
  // a day the business is OPEN, then dropping the row on the day it claimed,
  // is worse than showing the typo.
  const p = text({ closures: [{ date: "2026-11-31", note: "typo" }] });
  assert.ok(p.includes("2026-11-31 — typo"));
  assert.ok(!p.includes("December 1, 2026"));
});

test("every upcoming closure is stated — no silent cap", () => {
  // Sorted oldest-first, so a cap always drops the furthest out: exactly the
  // dates customers book against months ahead.
  const closures = Array.from({ length: 12 }, (_, i) => ({
    date: `2026-1${i < 4 ? "0" : i < 8 ? "1" : "2"}-${String(i + 1).padStart(2, "0")}`,
    note: `holiday-${i}`,
  }));
  const p = text({ closures });
  for (const c of closures) assert.ok(p.includes(c.note), `${c.note} was dropped`);
});

test("a range is one line, not ten", () => {
  const p = text({ closures: [{ date: "2026-12-24", until: "2026-12-27", note: "Christmas" }] });
  assert.ok(p.includes("December 24, 2026 – December 27, 2026 — Christmas"));
});

/* ------------------- the tie-break the model actually reads ---------------- */

test("on a closure day the CLOCK says closed — the last thing it reads", () => {
  // The weekly grid says open and the closure list says shut. Leaving that to
  // block order decides "are you open today?" by accident.
  const shut = describeNow(TZ, new Date("2026-09-07T15:00:00Z"), [{ date: "2026-09-07", note: "Labor Day" }]);
  assert.ok(/CLOSED today — Labor Day/.test(shut));
  assert.ok(shut.includes("treat a closed date as final"));
  const open = describeNow(TZ, SEP1, [{ date: "2026-09-07" }]);
  assert.ok(!open.includes("CLOSED today"));
});

test("the subordination sentence names what is actually above it", () => {
  // It used to name "the address, hours or services" whatever was there, so a
  // closures-only profile pointed the model at three absent things and never
  // mentioned the one block it did have.
  const only = text({ closures: [{ date: "2026-09-07" }], address: "1 Main St", extra_instructions: "Be warm." });
  assert.ok(only.includes("disagree with the address and closed dates above"), only.slice(0, 400));
  const withHours = text({ hours: { mon: { open: "09:00", close: "18:00" } }, extra_instructions: "Be warm." });
  assert.ok(withHours.includes("disagree with the hours above"));
});

test("closures do NOT decide whether a workspace has a profile", () => {
  // Their contents expire. Counting them would let a prompt change what it
  // says the day after a date passed, from a config nobody touched.
  assert.equal(hasProfile({ closures: [{ date: "2099-01-01" }] }), false);
  assert.equal(hasProfile({ hours: { mon: { intervals: [{ open: "09:00", close: "17:00" }] } } }), true);
});
