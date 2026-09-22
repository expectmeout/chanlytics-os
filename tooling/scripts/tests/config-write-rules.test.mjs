/**
 * The rules that only apply on the way IN.
 *
 * Data already in the database has to keep parsing; data on its way in does
 * not. A refinement on the READ schema turns an already-stored bad row into a
 * whole-config parse failure, and on this codepath that is not a warning — it
 * is configBroken: the receptionist goes silent and staff are told the
 * settings could not be read. So the read path carries shape only and
 * everything that is wrong-rather-than-malformed is checked here, where the
 * answer is a message naming the field instead of a muted phone line.
 *
 * Every rule below has to name its day or its row, because the alternative was
 * real: the route reported issues[0].message with the path thrown away, so a
 * form rejected for two bad days said "a day needs both an opening and a
 * closing time" — no day named — and the owner fixed one, resubmitted, and got
 * the same unattributed sentence back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INTERVALS_PER_DAY,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  isRealDate,
  MAX_CLOSURES,
} from "@chanlytics/contracts";

const BRAIN = {
  business_name: "Aurora",
  phone_display: "(555) 010-1234",
  booking_link: "https://booksy.example/aurora",
  system_prompt: "You are the assistant for Aurora. " + "x".repeat(40),
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
const write = (profile) => TenantConfigWriteSchema.safeParse({ brain: { ...BRAIN, profile } });
const issues = (profile) => {
  const r = write(profile);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}|${i.message}`);
};

/* ------------------------- read stays lenient ----------------------------- */

test("every shape the write rules reject still READS", () => {
  // This is the whole point of the split. If any of these failed the read
  // schema, the tenant that has one stored is a tenant with a silent line.
  const bad = [
    { hours: { mon: { open: "09:00" } } },
    { hours: { mon: { open: "18:00", close: "09:00" } } },
    {
      hours: {
        wed: {
          intervals: [
            { open: "09:00", close: "18:00" },
            { open: "10:00", close: "12:00" },
          ],
        },
      },
    },
    { hours: { wed: { intervals: Array.from({ length: 9 }, () => ({ open: "09:00", close: "10:00" })) } } },
    { closures: [{ date: "2026-11-31" }] },
    { closures: [{ date: "2027-01-02", until: "2026-12-24" }] },
  ];
  for (const profile of bad) {
    assert.equal(write(profile).success, false, `should be refused on write: ${JSON.stringify(profile)}`);
    assert.equal(
      TenantConfigSchema.safeParse({ brain: { ...BRAIN, profile } }).success,
      true,
      `must still READ: ${JSON.stringify(profile)}`,
    );
  }
});

/* --------------------------------- hours ---------------------------------- */

test("a day with one time and not the other is refused, and named", () => {
  assert.deepEqual(issues({ hours: { mon: { open: "09:00" } } }), [
    "brain.profile.hours.mon.close|Monday needs both an opening and a closing time, or neither.",
  ]);
});

test("a day that closes before it opens is refused, and named", () => {
  assert.deepEqual(issues({ hours: { fri: { open: "20:00", close: "02:00" } } }), [
    "brain.profile.hours.fri.close|Friday closes at or before it opens.",
  ]);
});

test("TOUCHING shifts are allowed — two stylists back to back is a normal day", () => {
  const r = write({
    hours: {
      wed: {
        intervals: [
          { open: "09:00", close: "13:00" },
          { open: "13:00", close: "19:00" },
        ],
      },
    },
  });
  assert.equal(r.success, true, JSON.stringify(issues({})));
});

test("overlapping shifts are refused", () => {
  assert.deepEqual(
    issues({
      hours: {
        wed: {
          intervals: [
            { open: "09:00", close: "18:00" },
            { open: "10:00", close: "12:00" },
          ],
        },
      },
    }),
    ["brain.profile.hours.wed.intervals.1.open|Wednesday: two shifts overlap."],
  );
});

test("typing the afternoon shift first is not an error", () => {
  // The owner is not told their day is wrong merely because of entry order —
  // the composer sorts, so the rules compare sorted copies too.
  assert.equal(
    write({
      hours: {
        wed: {
          intervals: [
            { open: "15:00", close: "19:00" },
            { open: "09:30", close: "13:00" },
          ],
        },
      },
    }).success,
    true,
  );
});

test("the shift cap the form enforces is the cap the schema enforces", () => {
  const tooMany = Array.from({ length: MAX_INTERVALS_PER_DAY + 1 }, (_, n) => ({
    open: `0${n}:00`,
    close: `0${n}:30`,
  }));
  assert.deepEqual(issues({ hours: { wed: { intervals: tooMany } } }), [
    `brain.profile.hours.wed.intervals|Wednesday can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`,
  ]);
});

/* -------------------------------- closures -------------------------------- */

test("a date that is not on the calendar is refused", () => {
  assert.equal(isRealDate("2026-11-31"), false);
  assert.equal(isRealDate("2027-02-29"), false);
  assert.equal(isRealDate("2028-02-29"), true, "2028 is a leap year");
  assert.deepEqual(issues({ closures: [{ date: "2026-11-31" }] }), [
    "brain.profile.closures.0.date|2026-11-31 is not a date on the calendar.",
  ]);
});

test("a closure cannot end before it starts", () => {
  assert.deepEqual(issues({ closures: [{ date: "2027-01-02", until: "2026-12-24" }] }), [
    "brain.profile.closures.0.until|A closure cannot end before it starts.",
  ]);
});

test("a shift that closes at or before it opens is refused, and named by its slot", () => {
  const out = issues({
    hours: {
      thu: {
        intervals: [
          { open: "09:00", close: "13:00" },
          { open: "15:00", close: "14:00" },
        ],
      },
    },
  });
  assert.deepEqual(out, ["brain.profile.hours.thu.intervals.1.close|Thursday: a shift has to close after it opens."]);
  assert.deepEqual(
    issues({ hours: { thu: { intervals: [{ open: "09:00", close: "09:00" }] } } }),
    ["brain.profile.hours.thu.intervals.0.close|Thursday: a shift has to close after it opens."],
    "a zero-length shift is not a shift",
  );
});

test("a closure's end has to be a day on the calendar, like its start", () => {
  assert.deepEqual(issues({ closures: [{ date: "2026-12-24", until: "2026-12-32" }] }), [
    "brain.profile.closures.0.until|2026-12-32 is not a date on the calendar.",
  ]);
  assert.deepEqual(
    issues({ closures: [{ date: "2026-12-24", until: "2027-02-29" }] }),
    ["brain.profile.closures.0.until|2027-02-29 is not a date on the calendar."],
    "not a leap year",
  );
});

test("at most sixty closures: the sixty-first is refused, in one sentence, and the cap is the form's", () => {
  const day = (n) => `2027-${String(1 + Math.floor(n / 28)).padStart(2, "0")}-${String(1 + (n % 28)).padStart(2, "0")}`;
  const sixty = Array.from({ length: MAX_CLOSURES }, (_, n) => ({ date: day(n) }));
  assert.equal(write({ closures: sixty }).success, true, "sixty is allowed");
  assert.deepEqual(issues({ closures: [...sixty, { date: "2027-06-01" }] }), [
    `brain.profile.closures|At most ${MAX_CLOSURES} closures.`,
  ]);
  assert.equal(MAX_CLOSURES, 60);
});

test("an ordinary holiday range is accepted", () => {
  assert.equal(write({ closures: [{ date: "2026-12-24", until: "2026-12-27", note: "Christmas" }] }).success, true);
});

/* ------------------------ what the owner is told -------------------------- */

test("two bad days produce two messages, each naming its day", () => {
  const got = issues({ hours: { mon: { open: "09:00" }, thu: { open: "18:00", close: "09:00" } } });
  assert.equal(got.length, 2);
  assert.ok(got.some((i) => i.includes("Monday needs both")));
  assert.ok(got.some((i) => i.includes("Thursday closes at or before")));
});

test("an untouched, ordinary config is not made harder to save", () => {
  // The form resubmits the whole profile, including keys the owner never
  // opened. Rules that fire on those would block every save.
  assert.equal(
    write({
      hours: { mon: { open: "09:30", close: "18:00" }, sun: {} },
      services: [{ name: "Silk press", duration_min: 210 }],
      guardrails: { never_quote_prices: true },
    }).success,
    true,
  );
  assert.equal(write(undefined).success, true, "a workspace with no profile saves");
});
