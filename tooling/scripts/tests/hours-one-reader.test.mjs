/**
 * One reader for "when is this day open".
 *
 * A stored day can hold both an open/close pair and a list of shifts. The
 * prompt unioned them; the free windows and the calendar board let the
 * shifts win. So a row holding both was described two ways, and "are you
 * open at nine?" had one answer in the receptionist's prompt and another
 * in the times it offered. Now every reader goes through availability.ts's
 * dayIntervals, and this holds the three to the same spans.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayIntervals, freeWindows, resolveSystemPrompt } from "@chanlytics/contracts";

const TZ = "America/New_York";
/** A Monday at 08:00 in New York. */
const NOW = new Date("2026-09-14T12:00:00Z");

test("the spans of a day: open/close and shifts unioned, touching and overlapping merged, a backwards span dropped, nothing for a closed day", () => {
  assert.deepEqual(dayIntervals({ open: "09:00", close: "17:00" }), [["09:00", "17:00"]]);
  assert.deepEqual(
    dayIntervals({
      intervals: [
        { open: "14:00", close: "18:00" },
        { open: "09:00", close: "13:00" },
      ],
    }),
    [
      ["09:00", "13:00"],
      ["14:00", "18:00"],
    ],
    "sorted, whatever order they were typed",
  );
  assert.deepEqual(
    dayIntervals({ open: "09:00", close: "12:00", intervals: [{ open: "14:00", close: "18:00" }] }),
    [
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ],
    "both kept: dropping either would lose a fact",
  );
  assert.deepEqual(
    dayIntervals({ open: "09:00", close: "13:00", intervals: [{ open: "13:00", close: "19:00" }] }),
    [["09:00", "19:00"]],
    "touching shifts are one stretch",
  );
  assert.deepEqual(
    dayIntervals({ open: "09:00", close: "15:00", intervals: [{ open: "12:00", close: "18:00" }] }),
    [["09:00", "18:00"]],
    "overlapping shifts are one stretch",
  );
  assert.deepEqual(
    dayIntervals({ open: "18:00", close: "09:00" }),
    [],
    "a span running backwards through the night is no span",
  );
  assert.deepEqual(dayIntervals({ intervals: [{ open: "", close: "12:00" }] }), []);
  assert.deepEqual(dayIntervals(undefined), []);
  assert.deepEqual(dayIntervals({}), []);
});

test("the prompt and the free windows read a day the same way: both spans of a day holding a pair and a shift", () => {
  const hours = { mon: { open: "09:00", close: "12:00", intervals: [{ open: "14:00", close: "17:00" }] } };
  const brain = {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
    system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
    fallbacks: { greeting: "g", error: "e", non_text: "n" },
    profile: { hours },
  };
  const prompt = resolveSystemPrompt(brain, "whatsapp", TZ, NOW, null, null);
  assert.ok(
    prompt.includes("Monday: 09:00–12:00 and 14:00–17:00 (closed 12:00–14:00)"),
    "the prompt states both spans, and the gap between them",
  );
  const windows = freeWindows({
    hours,
    closures: [],
    tz: TZ,
    busy: [],
    rules: { lead_hours: 0, buffer_min: 0, max_days_ahead: 1, slot_min: 30 },
    now: NOW,
  });
  const monday = windows.find((o) => o.key === "2026-09-14");
  assert.ok(monday, "today is offered");
  const spans = monday.windows.map((w) => [
    new Date(w.start).toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }),
    new Date(w.end).toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }),
  ]);
  assert.deepEqual(
    spans,
    [
      ["09:00", "12:00"],
      ["14:00", "17:00"],
    ],
    "the openings offered are the spans the prompt states: not only the shift",
  );
});
