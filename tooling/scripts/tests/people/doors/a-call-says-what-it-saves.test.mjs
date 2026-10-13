/**
 * A call says what it saves (decision 0052, canvas A M4): the number Call rings (their own, digits only, or the listing's
 * for someone at a business with none of their own, and nothing where there is neither), the outcomes it offers (a lead's
 * own two only at an open lead), who answered asked only of a stand-in, the day Call back later starts on, the words of
 * the note and of Save, the line beside Save, and what the lead is asked: Leads' own arguments for the same outcome.
 *
 * Run against the contracts the page and the route both read; the door itself is the .db suite beside this.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSON_CALL_WORDS,
  PersonCallSchema,
  callBackWaits,
  personCallClosesBack,
  personCallDays,
  personCallFoot,
  personCallLeadArgs,
  personCallNote,
  personCallOf,
  personCallSave,
  stageArgs,
} from "@chanlytics/contracts";

const listing = { value: "+1 (512) 555-0187", tel: "tel:+15125550187", hours: "Open until 7 PM today" };
const at = (open) => ({ name: "Bloom & Vow Bridal", open, phone: listing });

test("Call rings their own number, as digits; the listing's for someone with none; nothing where there is neither", () => {
  const own = personCallOf({ phone: "+1 (512) 555-0199", standIn: false, business: null });
  assert.equal(own.tel, "tel:+15125550199", "the digits and the plus: a page once rang tel:+ alone");
  assert.equal(own.number, "+1 (512) 555-0199");
  assert.equal(own.sub, "from your phone");
  assert.equal(own.listing, false);
  const viaListing = personCallOf({ phone: null, standIn: true, business: at(true) });
  assert.equal(viaListing.tel, "tel:+15125550187");
  assert.equal(viaListing.heading, "Bloom & Vow Bridal · +1 (512) 555-0187");
  assert.equal(viaListing.sub, "Open until 7 PM today · logged on the lead");
  assert.equal(viaListing.listing, true);
  assert.equal(viaListing.asksWho, true, "a stand-in's call asks who answered");
  assert.equal(personCallOf({ phone: "", standIn: false, business: null }), null);
  assert.equal(personCallOf({ phone: "ext.", standIn: false, business: { ...at(true), phone: null } }), null);
});

test("the outcomes: five for anyone, a lead's two more only where their business is an open lead", () => {
  const ids = (vm) => vm.outcomes.map((o) => o.id);
  assert.deepEqual(ids(personCallOf({ phone: "+15125550199", standIn: false, business: null })), [
    "spoke",
    "call_back",
    "voicemail",
    "no_answer",
    "wrong_number",
  ]);
  const open = personCallOf({ phone: "+15125550199", standIn: false, business: at(true) });
  assert.deepEqual(ids(open), [
    "spoke",
    "interested",
    "not_interested",
    "call_back",
    "voicemail",
    "no_answer",
    "wrong_number",
  ]);
  assert.deepEqual(
    open.outcomes.map((o) => o.label),
    ["Spoke", "Interested", "Not interested", "Call back later", "Left a voicemail", "No answer", "Wrong number"],
  );
  assert.equal(ids(personCallOf({ phone: "+15125550199", standIn: false, business: at(false) })).length, 5);
});

test("Call back is offered under every outcome but Wrong number, and Call back later starts on Tomorrow", () => {
  assert.deepEqual(personCallDays(null), { offered: false, tomorrow: false });
  assert.deepEqual(personCallDays("call_back"), { offered: true, tomorrow: true });
  assert.deepEqual(personCallDays("spoke"), { offered: true, tomorrow: false });
  assert.deepEqual(personCallDays("wrong_number"), { offered: false, tomorrow: false });
});

test("the note, Save and the line beside it say what will be kept, and where", () => {
  assert.equal(
    personCallNote("voicemail", "  asked her to ring after five "),
    "Call · Left a voicemail: asked her to ring after five",
  );
  assert.equal(personCallNote("no_answer", ""), "Call · No answer");
  assert.equal(personCallSave("call_back", "Tomorrow"), "Save as Call back Tomorrow");
  assert.equal(personCallSave("call_back", null), "Save as Call back later");
  assert.equal(personCallSave("spoke", "Fri"), "Save as Spoke · call back Fri");
  assert.equal(personCallSave("wrong_number", null), "Save as Wrong number");

  const own = personCallOf({ phone: "+15125550199", standIn: false, business: at(true) });
  const listed = personCallOf({ phone: null, standIn: true, business: at(true) });
  const nobody = personCallOf({ phone: "+15125550199", standIn: false, business: null });
  assert.equal(personCallFoot(nobody, "spoke", false), "Logged as a team-only note");
  assert.equal(personCallFoot(nobody, "spoke", true), "Logged as a note the receptionist reads");
  assert.equal(personCallFoot(own, "interested", false), "Moves the lead to Talking");
  assert.equal(personCallFoot(own, "not_interested", false), "Closes the lead: Said no");
  assert.equal(personCallFoot(own, "no_answer", false), "Logged on the lead");
  assert.equal(personCallFoot(own, "spoke", false), "Logged as a team-only note", "Spoke is no lead's");
  assert.equal(personCallFoot(own, "wrong_number", false), "Logged as a team-only note", "their own number was wrong");
  assert.equal(personCallFoot(listed, "wrong_number", false), "Marks the listing's number wrong");
});

test("the lead is asked what Leads asks for the same outcome; Spoke asks it nothing", () => {
  assert.equal(personCallLeadArgs("spoke", "hi", null), null);
  for (const o of ["interested", "not_interested", "call_back", "voicemail", "no_answer", "wrong_number"]) {
    const a = stageArgs({ kind: "outcome", outcome: o, note: "rang twice", spoke_with: "Priya Nair" });
    assert.deepEqual(personCallLeadArgs(o, " rang twice ", " Priya Nair "), {
      p_lead_stage: a.p_stage,
      p_lead_reason: a.p_reason,
      p_lead_note: a.p_note,
      p_spoke_with: a.p_spoke_with,
    });
  }
  assert.deepEqual(personCallLeadArgs("call_back", "", ""), {
    p_lead_stage: "nurture",
    p_lead_reason: null,
    p_lead_note: null,
    p_spoke_with: null,
  });
});

test("the route takes an outcome it knows, words within the lead's note, and a real day", () => {
  assert.equal(PersonCallSchema.safeParse({ outcome: "spoke" }).success, true);
  assert.equal(PersonCallSchema.safeParse({ outcome: "hung_up" }).success, false);
  assert.equal(PersonCallSchema.safeParse({ outcome: "spoke", said: "x".repeat(281) }).success, false);
  assert.equal(PersonCallSchema.safeParse({ outcome: "call_back", due_on: "2026-02-30" }).success, false);
  assert.equal(PersonCallSchema.safeParse({ outcome: "call_back", due_on: "2026-10-20", tell: true }).success, true);
  assert.equal(PersonCallSchema.safeParse({ outcome: "spoke", extra: 1 }).success, false, "nothing it does not name");
});

test("REGRESSION (the wiring's second audit, X3-1): a call that reached them is the call back they asked for unless the member says not; one that went nowhere is not; the sheet asks only while one is open and no teammate has the thread", () => {
  const reached = ["spoke", "interested", "not_interested"];
  for (const o of ["spoke", "interested", "not_interested", "call_back", "voicemail", "no_answer", "wrong_number"])
    assert.equal(personCallClosesBack(o), reached.includes(o), o);
  assert.equal(personCallClosesBack(null), false, "nothing picked yet closes nothing");
  // Open on their thread: asked. Resolved, or a hold that asks for something else: not. A teammate's thread: theirs.
  const hold = (state, reason) => ({ state, reason });
  assert.equal(callBackWaits([hold("open", "callback")], false), true);
  assert.equal(callBackWaits([hold("open", "callback")], true), false, "a teammate has it: theirs to close");
  assert.equal(callBackWaits([hold("resolved", "callback"), hold("open", "manual")], false), false);
  assert.equal(callBackWaits([], false), false);
  assert.match(PERSON_CALL_WORDS.closesCallBack, /call back they asked for/);
  // The route takes the member's answer, and only a yes or a no.
  const body = { outcome: "spoke", closes_call_back: true };
  assert.deepEqual(PersonCallSchema.parse(body), body);
  assert.equal(PersonCallSchema.safeParse({ outcome: "spoke", closes_call_back: "yes" }).success, false);
});
