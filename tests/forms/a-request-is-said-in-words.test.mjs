/**
 * A request, said in words (the Forms plan, 3.5; decision 0007): its answers as lines an owner reads (a choice by its
 * label, never its id), the note that waits on the person's page for a member's Keep, and the owner's notice, which
 * opens the request in Inbox. One reading of the answers feeds all three, so the page, the note and the notice can
 * never say a request three ways.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { consultForm } from "./_form-requests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { FormDescription } = await import(at("packages/contracts/src/forms/shape.ts"));
const { requestLines, throughPlace } = await import(at("packages/contracts/src/forms/request-words.ts"));
const { formRequestNote, formRequestNotice } = await import(at("packages/contracts/src/people/doors/form-request.ts"));
const { requestAddress, requestIdOf } = await import(at("packages/contracts/src/forms/address.ts"));

const form = FormDescription.parse(
  consultForm({
    fields: [
      ...consultForm().fields,
      {
        id: "f6when",
        kind: "several",
        label: "When suits you?",
        needed: false,
        choices: [
          { id: "c1", label: "Weekday mornings" },
          { id: "c3", label: "Saturdays" },
        ],
      },
    ],
  }),
);
const answers = {
  f1name: "Ana Ruiz",
  f2mail: "ana.ruiz@example.com",
  f4want: "Dark brown now. I'd love a warm, soft blonde for spring.",
  f5who0: "c1",
  f6when: ["c1", "c3"],
};

test("the answers as lines: each question with what was answered, a choice by its label, nothing for what was left empty", () => {
  assert.deepEqual(requestLines(form, answers), [
    { id: "f1name", kind: "short", label: "Your name", words: "Ana Ruiz" },
    { id: "f2mail", kind: "email", label: "Email", words: "ana.ruiz@example.com" },
    { id: "f4want", kind: "long", label: "What would you like?", words: answers.f4want },
    { id: "f5who0", kind: "one", label: "Who would you like?", words: "Maria" },
    { id: "f6when", kind: "several", label: "When suits you?", words: "Weekday mornings, Saturdays" },
  ]);
  // A choice the version no longer names is said as it was kept, never dropped: the entry is what the visitor sent.
  assert.equal(requestLines(form, { f5who0: "c9" })[0].words, "c9");
  assert.deepEqual(requestLines(form, {}), []);
});

test("the note that waits for Keep: which form, their own words first, then what else they answered, never who they are", () => {
  const note = formRequestNote(form, answers);
  assert.match(
    note,
    /^Sent a request: Colour consultation\. They wrote: "Dark brown now\. I'd love a warm, soft blonde for spring\."/,
  );
  assert.match(note, /Who would you like\?: Maria\./);
  assert.match(note, /When suits you\?: Weekday mornings, Saturdays\./);
  assert.equal(note.includes("ana.ruiz@example.com"), false, "an address is on their page already");
  assert.equal(note.includes("Ana Ruiz"), false);
  const long = formRequestNote(form, { ...answers, f4want: "x".repeat(3000) });
  assert.ok(long.length <= 2000, "at most a note's length: their words are cut, never the line");
  assert.equal(formRequestNote(form, { f1name: "Ana" }), "Sent a request: Colour consultation.");
});

test("how they came is said once, the same on the request, in the notice and in the note", () => {
  assert.equal(throughPlace("Instagram"), "Through Instagram");
  assert.equal(throughPlace("Printed code"), "Through the printed code");
  assert.equal(throughPlace("Your link"), "Through your link");
  assert.deepEqual([throughPlace(null), throughPlace("  ")], [null, null]);
  assert.equal(
    formRequestNote(form, { f1name: "Ana" }, throughPlace("Google listing")),
    "Sent a request: Colour consultation. Through Google listing.",
  );
  assert.match(
    formRequestNote(form, answers, "From Google (spring-offer)"),
    /^Sent a request: Colour consultation\. From Google \(spring-offer\)\. They wrote: "Dark brown now\./,
  );
  const long = formRequestNote(form, { ...answers, f4want: "x".repeat(3000) }, "From Google (spring-offer)");
  assert.ok(long.length <= 2000 && long.includes("From Google (spring-offer)."), "the words are cut, never the line");
});

test("the owner's notice opens the request in Inbox, and says who, what and how they came", () => {
  const notice = formRequestNotice(form, answers, {
    entryId: "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1",
    contactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    reach: { name: "Ana Ruiz", email: "ana.ruiz@example.com", phone: null },
    place: "Your link",
  });
  assert.equal(notice.kind, "form_request");
  assert.equal(notice.route, "inbox/rq-e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1");
  assert.deepEqual(notice.about, { type: "contact", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  assert.equal(notice.subject, "Ana Ruiz sent a request: Colour consultation");
  assert.match(notice.body, /They wrote: "Dark brown now/);
  assert.match(notice.body, /To reach them: ana\.ruiz@example\.com/);
  assert.match(notice.body, /Through your link\./);
  assert.match(notice.body, /It waits in Inbox, in Needs you, until it is answered\./);
  assert.equal(notice.redactedBody.includes("Ana"), false, "the platform's copy holds no person");
  const phoneOnly = formRequestNotice(
    form,
    { f4want: "Balayage" },
    { entryId: "e2", contactId: "c2", reach: { name: null, email: null, phone: "+17865550199" }, place: null },
  );
  assert.match(phoneOnly.subject, /^\+17865550199 sent a request/);
  assert.match(phoneOnly.body, /A number only: nothing can be texted to them first\./);
});

test("a request's address in Inbox, and the request an address names", () => {
  assert.equal(requestAddress("abc"), "inbox/rq-abc");
  assert.equal(requestIdOf("rq-e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1"), "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1");
  assert.equal(requestIdOf("th-e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1"), null);
  assert.equal(requestIdOf("rq-not-an-id"), null);
});
