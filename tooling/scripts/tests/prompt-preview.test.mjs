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
 *
 * What an owner sees of it is the Business tab's prompt sheet since Phase 5
 * (pages/business-tab-prompt.jsx), where PromptPreview's <pre> stood. This file
 * read the page's and the bridge's source for five guarantees; each is now held by
 * drawing the sheet, in business-tab-prompt.test.mjs, and named where it went:
 *   - the page reads only what the server composed, and composes nothing:
 *     "the sheet draws what the server composed, word for word, and nothing
 *     when it composed nothing" (and business-tab-bridge.test.mjs runs the
 *     bridge's composedPrompt; e2e-harness.test.mjs holds the fixture's to it);
 *   - nothing is shown when there is nothing true to show: the same test, with
 *     the composition gone -- no told section and no door. The record itself
 *     is drawn only over a brain (BusinessTab returns null without one);
 *   - the clock is shown separately, because it is sent separately: "what is
 *     sent beside the prompt is drawn apart, and says why";
 *   - both channels can be read: "the head says what it is and who reads it,
 *     and counts nothing" and "every block is keyed by its id, and on a call the
 *     platform's text is drawn twice", each drawn on WhatsApp and on Phone.
 * Two stay here, on the stylesheet this file reads: no gradient and no second
 * typeface on the record, and the prompt's own layout rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCode } from "./_source.mjs";
import { describeNow, describeOpenings, freeWindows, parseIcs, resolveSystemPrompt } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { composePromptPreview, openingsBlock } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/prompt-preview.ts")).href
);

const css = readCode("apps/dashboard/src/legacy/styles/settings.css");

/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const TZ = "America/New_York";
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: {
    hours: { mon: { open: "09:00", close: "17:00" }, tue: { open: "09:00", close: "17:00" } },
    closures: [{ date: "2026-09-14", note: "Inventory" }],
  },
};
const KNOWN = {
  workspace: { name: "Harbor", timezone: TZ },
  channels: [{ kind: "whatsapp", number_e164: "+19295550100", status: "active" }],
  listing: { name: "Harbor Moving", address: "1 Pier St, Brooklyn, NY 11201" },
};
const POLICY = { booking: { mode: "ask" }, faq: { mode: "auto" } };

test("the preview is the edge's composition, argument for argument: the rows, the facts, the zone, the closures, the openings", () => {
  // Run, not read: whatsapp/inbound.ts and lib/call-start.ts make these calls
  // with these arguments, and the browser's own composition used to leave four
  // of them out.
  const openings = "Open times (from the calendar):\n- Tue Sep 15: 9:00 AM–12:00 PM";
  const p = composePromptPreview(BRAIN, { tz: TZ, policy: POLICY, known: KNOWN, openings }, NOW);
  assert.equal(
    p.whatsapp,
    resolveSystemPrompt(BRAIN, "whatsapp", TZ, NOW, POLICY, KNOWN),
    "the WhatsApp text the edge composes",
  );
  assert.equal(
    p.voice,
    resolveSystemPrompt(BRAIN, "voice", TZ, NOW, POLICY, KNOWN),
    "the phone text the edge composes",
  );
  assert.equal(
    p.now,
    `${describeNow(TZ, NOW, BRAIN.profile.closures)}\n\n${openings}`,
    "the uncached block: the clock with the closures, then the openings",
  );
  assert.equal(p.tz, TZ);
  assert.ok(
    p.whatsapp.includes("Booking: when someone wants to book, reschedule or cancel, do not send the booking link."),
    "an Autonomy row is a rule in the prompt",
  );
  assert.ok(p.voice.includes("do not offer the booking link"), "and the phone's version of it");
  assert.ok(p.now.includes("CLOSED today"), "the closure reached the clock");
  assert.notEqual(
    p.whatsapp,
    resolveSystemPrompt(BRAIN, "whatsapp", TZ),
    "what the browser used to compose was a different prompt",
  );
  const bare = composePromptPreview(BRAIN, { tz: TZ, policy: {}, known: KNOWN, openings: null }, NOW);
  assert.equal(
    bare.now,
    describeNow(TZ, NOW, BRAIN.profile.closures),
    "no openings, no block: the edge appends nothing either",
  );
  assert.ok(!bare.whatsapp.includes("Booking: when someone"), "every row on auto adds no rule");
});

test("the openings block is the edge's: the feed's busy blocks against the hours, in the zone; nothing without a feed, a profile or a zone; nothing when the feed cannot be read", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    "BEGIN:VEVENT",
    "UID:1",
    "DTSTART:20260915T130000Z",
    "DTEND:20260915T150000Z",
    "SUMMARY:Move for Ada",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  const realFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).includes("broken")) return new Response("nope", { status: 500 });
    return new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } });
  };
  try {
    const got = await openingsBlock(
      "t-preview-1",
      { url: "webcal://cal.example/harbor.ics", brain: BRAIN, tz: TZ },
      NOW,
    );
    const parsed = parseIcs(ics, TZ, {
      horizon: { from: NOW.getTime() - 90 * 86_400_000, to: NOW.getTime() + 90 * 86_400_000 },
    });
    const expected = describeOpenings(
      freeWindows({
        hours: BRAIN.profile.hours,
        closures: BRAIN.profile.closures,
        tz: TZ,
        busy: parsed.busy,
        rules: null,
        now: NOW,
      }),
      TZ,
      { daysAhead: 14 },
    );
    assert.equal(got, expected, "the same functions the edge's openingsFor runs, with the same inputs");
    assert.ok(
      got.startsWith("Open times (from the calendar") && got.includes("Tuesday, September 15"),
      "the busy block on Tuesday morning leaves the afternoon, and Monday is closed",
    );
    assert.equal(fetched[0], "https://cal.example/harbor.ics", "webcal is https in a hat, as on the edge");

    assert.equal(await openingsBlock("t-preview-2", { url: null, brain: BRAIN, tz: TZ }, NOW), null, "no feed");
    assert.equal(
      await openingsBlock(
        "t-preview-3",
        { url: "https://cal.example/x.ics", brain: { ...BRAIN, profile: undefined }, tz: TZ },
        NOW,
      ),
      null,
      "no profile",
    );
    assert.equal(
      await openingsBlock("t-preview-4", { url: "https://cal.example/x.ics", brain: BRAIN, tz: null }, NOW),
      null,
      "no zone",
    );
    assert.equal(fetched.length, 1, "none of those reached for the feed");
    assert.equal(
      await openingsBlock("t-preview-5", { url: "https://cal.example/broken.ics", brain: BRAIN, tz: TZ }, NOW),
      null,
      "a feed that cannot be read: the receptionist says nothing about open times, and so does the preview",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the record's own rules in settings.css paint no gradient and set no second typeface", () => {
  // The owner named these two before he read a word of the page (the plan's Task 4.0), and both live only in CSS,
  // which the suite cannot execute: a mutant that put the fold's gradient back passed 265 tests. The journey proves it
  // the better way, by computed style in a browser over the whole record (e2e/settings-business.spec.ts, the 390px
  // test), and this stands beside it for the family settings.css owns, on the stylesheet this file already reads.
  // record.css's own rec-* rules are the journey's: reading a second stylesheet here would raise the source-scan
  // baseline, which may only fall.
  const SPLIT = String.fromCharCode(10);
  const rules = css.split("}").flatMap((block) => {
    const at = block.lastIndexOf("{");
    if (at < 0) return [];
    const selector = block.slice(0, at).trim().split(SPLIT).pop().trim();
    return [{ selector, body: block.slice(at + 1) }];
  });
  const ours = rules.filter((r) => /\.(bt|rec|act)-/.test(r.selector));
  assert.ok(ours.length > 40, `the record's rules are in this stylesheet (found ${ours.length})`);
  assert.deepEqual(
    ours.filter((r) => r.body.includes("gradient")).map((r) => r.selector),
    [],
    "a gradient on the record: the fold's ground, a closed day's stripes and the log's bones each were one",
  );
  assert.deepEqual(
    ours.filter((r) => /font-mono|--mono/.test(r.body)).map((r) => r.selector),
    [],
    "the page reads in ONE typeface",
  );
});

test("six thousand characters cannot break the sheet's layout", () => {
  // The rule the prompt's text is set by, on the stylesheet this file already reads. Found and bounded BEFORE the
  // slice: `indexOf` answers -1 for a rule that was renamed, and a slice from -1 is the empty string, so the
  // assertions below would stop being about the prompt without saying so.
  const from = css.indexOf(".bt-prompt-block-text {");
  assert.ok(from > -1, "the rule this test is about is still called .bt-prompt-block-text");
  const to = css.indexOf("}", from);
  assert.ok(to > from, "and it closes");
  const body = css.slice(from, to);
  assert.ok(body.includes("white-space: pre-wrap"), "the prompt has real newlines and must keep them");
  assert.ok(body.includes("overflow-wrap: anywhere"), "an unbroken booking URL must not widen the sheet");
  // The page reads in ONE typeface. The prompt is sentences somebody wrote about their business, not a listing, and a
  // second face here is the "font changes" an owner sees before he reads a word of it.
  assert.ok(body.includes("font-family: inherit"), "the prompt is set in the page's own face");
  assert.ok(!/font-mono|--mono/.test(body));
  // Where the <pre> scrolled inside the page (max-height 420px, overflow-y auto), the sheet's own body scrolls now:
  // the kit's (record.css .rec-sheet-body), which the 390px journey measures (e2e/settings-business.spec.ts).
});
