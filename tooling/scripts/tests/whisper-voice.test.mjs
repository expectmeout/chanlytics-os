/**
 * Whispers said aloud, and the signature tried both ways.
 *
 * The owner listens to the call; typing mid-call is the wrong tool. The
 * whisper box gains hold-to-talk: the browser's own speech recogniser
 * transcribes on the device while the button is held, and what was heard is
 * sent as an ordinary text whisper when the button is released. Nothing is
 * recorded or uploaded; browsers without a recogniser show no button.
 *
 * And the webhook signature: the provider's own example verifies
 * JSON.stringify(req.body) — the parsed body re-serialised — not the raw
 * bytes. Every delivery carries an em dash, and encoders escape it
 * differently, so a signature over one form fails over the other with the
 * RIGHT key. Both forms are tried and which one verified is recorded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "./_source.mjs";

test("hold to talk: the browser's recogniser, sent on release, hidden where it does not exist", () => {
  const page = readRaw("apps/dashboard/src/legacy/pages/live-monitor.jsx");
  assert.ok(page.includes("window.SpeechRecognition || window.webkitSpeechRecognition || null"));
  assert.ok(
    page.includes("{canTalk && (") && page.includes('data-testid="live-whisper-talk"'),
    "no button where the browser cannot listen",
  );
  assert.ok(page.includes("onPointerDown={startTalking}") && page.includes("onPointerUp={stopTalking}"));
  assert.ok(page.includes("if (heard) send(heard);"), "what was heard is sent when the recogniser finishes");
  assert.ok(page.includes("rec.interimResults = true;"), "the owner sees the words as they come");
  assert.ok(page.includes('ev.error === "not-allowed"'), "a refused microphone is said plainly");
  assert.ok(
    page.includes("window.__whisperCall(c.callId, t, false)"),
    "a spoken whisper is a whisper: no nudge to speak",
  );
  assert.ok(page.includes("Hold the button and say it, or type it."));
});
