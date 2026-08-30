/**
 * Showing an owner what their receptionist is actually told.
 *
 * Every other card in Settings shows what somebody TYPED. None showed what
 * their customers' receptionist receives — the fields are composed, older
 * instructions are carried in beneath them, guardrails are appended, and the
 * result was visible only by reading the source.
 *
 * That gap cost a live salon twice in one afternoon: filling in the hours
 * silently swapped a 5,000-character prompt for a 700-character one, and the
 * composed hours then disagreed with the prose right below them about whether
 * Sunday was open. Both were obvious the moment anyone looked at the text.
 * Nobody could look at the text.
 *
 * The one thing that makes this worth having is that it is not a rendering of
 * the prompt — it is the prompt, from the same function the edge calls. A
 * preview free to drift is worse than none: a screen telling an owner their
 * receptionist knows something it does not.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode } from "./_source.mjs";

const verbs = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
const pane = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
const css = readCode("apps/dashboard/src/legacy/styles/settings.css");

test("the preview runs the SAME composer the edge runs", () => {
  assert.ok(
    verbs.includes('from "@chanlytics/contracts"'),
    "composed by the shared package, never re-implemented in the browser",
  );
  assert.ok(verbs.includes("resolveSystemPrompt("));
  assert.ok(verbs.includes("describeNow("));
});

test("it reads the workspace's own timezone, so the preview matches the call", () => {
  assert.ok(verbs.includes("ws?.timezone ?? null"));
  assert.ok(
    verbs.includes("resolveSystemPrompt(brain as Parameters<typeof resolveSystemPrompt>[0], channel, tz)"),
    "the zone must reach the composer, or the preview states different hours than the bot",
  );
});

test("the page asks for the prompt — it does not build one", () => {
  assert.ok(pane.includes("window.__composedPrompt"));
  for (const forbidden of ["Opening hours:", "Rules you must follow", "composeSystemPrompt"]) {
    assert.ok(!pane.includes(forbidden), `the page is composing its own prompt (${forbidden})`);
  }
});

test("nothing is shown when there is nothing true to show", () => {
  // A card that renders an empty box on a workspace with no config is a card
  // that says "your receptionist is told nothing", which is a different claim.
  assert.ok(verbs.includes("if (!brain) return null;"));
  assert.ok(verbs.includes("} catch {"), "a config the composer refuses is not a blank preview");
  assert.ok(pane.includes("if (!composed) return null;"));
  assert.ok(pane.includes("{real && <PromptPreview />}"), "never rendered over mockup data");
});

test("the clock is shown SEPARATELY, because it is sent separately", () => {
  // Concatenating them here would quietly teach an owner that the timestamp is
  // part of the cached prompt. It is not, and that distinction is the reason
  // their prompt cache survives.
  assert.ok(pane.includes("{composed.text}"));
  assert.ok(pane.includes("{composed.now}"));
  assert.ok(!pane.includes("composed.text + composed.now"));
  assert.ok(/rebuilt for every message/i.test(pane));
});

test("both channels can be read, since they are not the same text", () => {
  assert.ok(pane.includes('["whatsapp", "WhatsApp"], ["voice", "Phone"]'));
  assert.ok(pane.includes("window.__composedPrompt(channel)"), "the toggle must recompose");
});

test("six thousand characters cannot break the page layout", () => {
  const body = css.slice(css.indexOf(".set-prompt-body"));
  assert.ok(body.includes("white-space: pre-wrap"), "the prompt has real newlines and must keep them");
  assert.ok(body.includes("overflow-wrap: anywhere"), "an unbroken booking URL must not widen the page");
  assert.ok(body.includes("overflow-y: auto"));
});
