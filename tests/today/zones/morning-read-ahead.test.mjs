/**
 * The AI's morning read ahead of a press to Today (first-draw-read.ts readTodaySoon), EXECUTED over the real surface and
 * Ask found on the stub React. Today's first draw waits for this read, and read only as Today was reached it held a press
 * 0.5 to 2.2 s on production (the phone re-measure of 16 Nov 2026). Off Today the read never asks the AI to write a morning:
 * that is a turn of the model, and a visit to Today's to start. A morning due is kept as Today draws it while one is being
 * written, and read again as Today is reached, which asks for it there, once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, byTestId, fresh } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { W, answerWith, json, wire } from "./_world.mjs";

const { askMorningOverride } = await import("../../../apps/dashboard/src/surfaces/today/ask-morning-surface.ts");
const { AskFound } = await import("../../../apps/dashboard/src/surfaces/today/zones/found.tsx");
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** The member's morning as the door answers it, in `state`: none written yet, being written, or written. */
const morning = (state) => ({
  day: "2026-09-18",
  state,
  offered: true,
  thread_id: null,
  message_id: null,
  headline: "",
  detail: "",
  cards: [],
  findings: [],
  rested: {},
  lately: [],
});
/** The door: GET reads `read`'s morning; POST asks the AI to write one, which it starts. */
const door = (read) =>
  answerWith((u, init) =>
    u.pathname !== "/api/v1/ask/morning"
      ? json(503, { ok: false, error: { code: "unavailable", message: "not read here" } })
      : json(200, { ok: true, data: { morning: morning(init.method === "POST" ? "writing" : read) } }),
  );
const asked = () => wire.filter((w) => w.method === "POST" && w.path === "/api/v1/ask/morning").length;
const at = (route) => {
  W.location = { pathname: `/w/studio/${route}`, search: "", hash: "" };
};

test("REGRESSION (16 Nov 2026): off Today, a morning due is read and kept as Today draws it while one is written, and asked for only as Today is reached, once", async () => {
  const was = W.location;
  try {
    door("none");
    at("calendar");
    const before = asked();
    await askMorningOverride.apply();
    assert.equal(asked(), before, "off Today nobody asks the AI to write a morning");
    assert.equal(surfaceValue("ask_morning").asking, true, "kept as Today draws it while one is being written");
    clearRowStates();
    fresh();
    const found = again(() => AskFound({ part: "lines", held: false }));
    assert.ok(byTestId(found, "today-found-reading"), "Ask found holds its place");
    assert.equal(askMorningOverride.isStale(), true, "and read again as Today is reached");
    // Today reached: its read again asks, once.
    at("today");
    await askMorningOverride.apply();
    await until(() => surfaceValue("ask_morning").dto.state === "writing", "the morning the ask started");
    assert.equal(asked(), before + 1, "asked for on Today, once");
    assert.equal(askMorningOverride.isStale(), false, "and not read again for it");
  } finally {
    W.location = was;
  }
});

test("a morning already written, read off Today, is kept as it is, and read again only once it has aged", async () => {
  const was = W.location;
  try {
    door("quiet");
    at("calendar");
    const before = asked();
    await askMorningOverride.apply();
    assert.equal(asked(), before);
    assert.equal(surfaceValue("ask_morning").dto.state, "quiet");
    assert.equal(surfaceValue("ask_morning").asking, false);
    assert.equal(askMorningOverride.isStale(), false);
  } finally {
    W.location = was;
  }
});
