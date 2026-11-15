/**
 * The AI's drafter knows the ready-made starters, and a starter picked in New survives the AI changing the draft (the
 * review of 15 Nov 2026, C1 and B2): the drafter is offered each starter no message on file is named for, keyed after
 * the business's own (drafts/known-starters.ts), in the language the business's customers are written to in
 * (lib/starter-message.ts starterLanguageOf), made the one way New makes it (lib/starter-message.ts); a step that names one is kept with its key
 * and no id (draft-judge.ts peopleMessage), which Keep or Start files; and a draft that stands tells the AI the starter a
 * step sends (new/change.ts standsOf), which the judge finds again by its key (draft-stands.ts stoodStepsOf) and the
 * owner's price words never mistake for a written step's (numbers.ts ownerPriceWords).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, starterByKey, starterText } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { knownStartersOf } = await import("../../apps/dashboard/src/server/drafts/known-starters.ts");
const { draftKept } = await import("../../apps/dashboard/src/server/campaigns/sequences/draft-judge.ts");
const { stoodStepsOf } = await import("../../apps/dashboard/src/server/campaigns/sequences/draft-stands.ts");
const { ownerPriceWords } = await import("../../apps/dashboard/src/server/campaigns/sequences/numbers.ts");
const { profileLanguagesOf, starterLanguageOf, starterMessageOf } =
  await import("../../apps/dashboard/src/lib/starter-message.ts");
const { standsOf } = await import("../../apps/dashboard/src/surfaces/campaigns/sequences/new/change.ts");

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const pool = (candidates) => ({
  candidates,
  held: 0,
  pool: candidates,
  noYes: 0,
  stopped: 0,
  noNumber: 0,
  saidYes: candidates,
});

/** The business's one message on file, then the starters none of it is, as the drafter's read makes them. */
const ON_FILE = {
  key: "k1",
  templateId: ID(1),
  title: "Visit follow-up",
  body: "Hi {{1}}, thanks for coming in.",
  offer: false,
  channels: ["whatsapp", "sms"],
  slots: ["first_name"],
};
const knownWith = (languages) => {
  const messages = [
    ON_FILE,
    ...knownStartersOf([{ name: "after_visit_check" }], { reviewLink: false, languages, from: 1 }),
  ];
  return {
    business: "Harbor Studio",
    localNow: "2026-10-20T14:30",
    moments: [],
    lists: [],
    everyone: 214,
    everyonePool: pool(214),
    searches: [],
    messages,
    running: [],
    ready: ["whatsapp", "email", "sms"],
    channels: channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: { sms_state: "active", reg_mock: false },
      email: { mailbox: true, domain: true, offers: { campaigns: true, address: true, paused: null } },
    }),
    classModes: { campaign: "ask" },
    mailbox: null,
  };
};
const WRITE_NONE = { title: "", offer: false, whatsapp: "", email_subject: "", email_body: "", text: "" };
const step = (s) => ({
  does: "message",
  after_days: 0,
  only_if: [],
  message: "",
  texts: [],
  write: WRITE_NONE,
  subject: "",
  body: "",
  words: "",
  ...s,
});
const once = (s) => ({
  kind: "once",
  audience: "people",
  who: "everyone",
  name: "A quick note",
  hour: 10,
  when: "now",
  steps: [step(s)],
  cannot: "",
});
const LINE = { words: "Tell everyone we open late on Thursdays" };
const keyOf = (known, starter) => known.messages.find((m) => m.starter === starter).key;

test("a starter goes in the first language the business answers its customers in that the set writes it in, else English", () => {
  const note = starterByKey("quick_note");
  assert.equal(starterLanguageOf(note, ["Spanish"]), "es");
  assert.equal(starterLanguageOf(note, ["español", "English"]), "es", "its own word for Spanish, first");
  assert.equal(starterLanguageOf(note, ["English", "Spanish"]), "en_US");
  assert.equal(starterLanguageOf(note, []), "en_US", "a profile that names none");
  assert.equal(starterLanguageOf(note, profileLanguagesOf(null)), "en_US", "a profile that could not be read");
  assert.deepEqual(profileLanguagesOf({ brain: { profile: { languages: ["Spanish"] } } }), ["Spanish"]);
  assert.equal(starterLanguageOf(note, ["French"]), "en_US", "a language Chanlytics does not write its messages in");
  assert.equal(
    starterLanguageOf({ texts: { en_US: {} } }, ["Spanish"]),
    "en_US",
    "a starter the set wrote in English alone",
  );
  // Its channels are the ones the set writes in that language exactly, as its filing writes them: no English stand-in.
  const call = starterByKey("call_text");
  assert.deepEqual(starterMessageOf(call, "es").channels, ["whatsapp", ...(call.email?.es ? ["email"] : []), "sms"]);
  assert.equal(starterMessageOf(note, "es").body, starterText(note, "es").body);
});

test("the drafter is offered each starter no message on file is named for, after the business's own, in its customers' language, the review ask only where a review link is kept", () => {
  const known = knownWith(["Spanish"]);
  const starters = known.messages.filter((m) => m.starter);
  assert.equal(known.messages[0], ON_FILE, "the business's own first");
  assert.deepEqual(
    known.messages.map((m) => m.key),
    known.messages.map((_, at) => `k${at + 1}`),
    "keys continue after the business's own",
  );
  assert.equal(
    starters.some((m) => m.starter === "after_visit_check"),
    false,
    "one on file is the business's, never offered as new",
  );
  const note = starters.find((m) => m.starter === "quick_note");
  assert.deepEqual([note.templateId, note.body], [null, starterText(starterByKey("quick_note"), "es").body]);
  const withLink = knownStartersOf([], { reviewLink: true, languages: [], from: 0 }).length;
  assert.ok(withLink > knownStartersOf([], { reviewLink: false, languages: [], from: 0 }).length, "the review ask");
});

test("a step that names a ready-made starter is kept with its key and no id, which Keep or Start files; and the AI changing the draft keeps it", () => {
  const known = knownWith(["Spanish"]);
  const key = keyOf(known, "quick_note");
  const kept = draftKept(once({ message: key, texts: [] }), known, LINE).steps[0].message;
  assert.deepEqual(
    [kept.template_id, kept.starter, kept.title],
    [null, "quick_note", starterByKey("quick_note").title],
  );
  assert.equal(kept.body, starterText(starterByKey("quick_note"), "es").body, "in the words New shows");
  // The draft as it stands, told the AI: the starter by its key, found again by the judge, and kept by a change.
  const draft = draftKept(once({ message: key }), known, LINE);
  const stands = standsOf(draft);
  assert.equal(stands.steps[0].starter, "quick_note");
  assert.equal(stands.steps[0].template_id, null);
  const stood = stoodStepsOf(stands, known);
  assert.equal(stood[0].message, key, "REGRESSION: the step stood empty, and the AI's change dropped the starter");
  const changed = draftKept(once({ message: stood[0].message }), known, { words: "Shorter", stands });
  assert.equal(changed.steps[0].message.starter, "quick_note");
  // A written step names neither an id nor a starter: no starter's words are taken for the owner's.
  const written = { ...stands.steps[0], starter: null, write: { ...WRITE_NONE, title: "Late hours" } };
  assert.deepEqual(
    ownerPriceWords({ words: "", stands: { ...stands, said: "", steps: [written] } }, known.messages),
    [],
    "a starter's words are the set's, never what the owner said",
  );
});
