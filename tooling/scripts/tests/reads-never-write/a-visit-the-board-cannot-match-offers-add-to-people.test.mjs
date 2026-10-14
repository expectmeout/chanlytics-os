/**
 * A visit whose person the board cannot match offers "Add to People" (finding R1a, decision 0047 lane 6; decision 0034
 * section 4: a read never writes a person).
 *
 * Opening the Calendar used to add, in the same read, the people its appointments name by phone (up to forty a read, as
 * 'consent unknown'), and the Activity log named whoever had the page open as the one who added them. The read adds
 * nobody now (calendar/calendar-feed.test.mjs runs that); the hourly sweep and the booking email's reader put the
 * calendar's people in People, and a visit the board has no match for offers the press, through the door "Add a person"
 * uses (POST contacts: an existing number or address returns that person, consent stays unknown, nobody is messaged).
 *
 * The rule (contracts addToPeopleOf) is run on its cases; the visit (visit-sheet.tsx OpenVisit, the desk's peek) is the real
 * TSX drawn on a stub React, its press sent over a scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADD_TO_PEOPLE_WORDS, addToPeopleOf, toCalendarVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId, textOf } from "../_legacy-react.mjs";

const TZ = "America/New_York";
const NOW = new Date("2026-09-08T16:00:00.000Z");
const ANA = { phone: "+19175550100", email: "ana@example.com" };

test("what a press adds: one number names one person (its one address beside it), or with none one address does; several are nobody's", () => {
  const block = (over) => ({ person: null, guess: "Ana Ruiz", contacts: { e164: [], emails: [] }, ...over });
  const contacts = (e164, emails) => ({ contacts: { e164, emails } });
  assert.deepEqual(addToPeopleOf(block(contacts([ANA.phone], [ANA.email]))), {
    phone: ANA.phone,
    email: ANA.email,
    name: "Ana Ruiz",
  });
  assert.deepEqual(
    addToPeopleOf(block(contacts([ANA.phone], []))),
    { phone: ANA.phone, email: null, name: "Ana Ruiz" },
    "a number alone",
  );
  assert.deepEqual(
    addToPeopleOf(block(contacts([ANA.phone], ["a@example.com", "b@example.com"]))),
    { phone: ANA.phone, email: null, name: "Ana Ruiz" },
    "two addresses are nobody's: the number is the person, as the sweep has it",
  );
  assert.deepEqual(
    addToPeopleOf(block({ ...contacts([], [ANA.email]), guess: null })),
    { phone: null, email: ANA.email, name: null },
    "no number, one address, no name the event gave",
  );
  assert.equal(
    addToPeopleOf(block(contacts([ANA.phone, "+19175550101"], []))),
    null,
    "two numbers: which is the customer?",
  );
  assert.equal(
    addToPeopleOf(block(contacts([], ["a@example.com", "b@example.com"]))),
    null,
    "two addresses and no number",
  );
  assert.equal(addToPeopleOf(block(contacts([], []))), null, "nothing to add them by");
  assert.equal(
    addToPeopleOf(block({ contacts: undefined })),
    null,
    "a week the tab cached before the panel read contacts",
  );
  assert.equal(
    addToPeopleOf(block({ ...contacts([ANA.phone], [ANA.email]), person: { id: "p1", name: "Ana Ruiz" } })),
    null,
    "a visit People already matched needs no press",
  );
});

test("the words", () => {
  assert.equal(ADD_TO_PEOPLE_WORDS.act, "Add to People");
  assert.equal(ADD_TO_PEOPLE_WORDS.added("Ana Ruiz"), "Ana Ruiz is in People now");
  assert.equal(ADD_TO_PEOPLE_WORDS.added(null), "In People now");
  assert.equal(ADD_TO_PEOPLE_WORDS.existed("Ana Ruiz"), "Ana Ruiz was in People already");
  assert.equal(ADD_TO_PEOPLE_WORDS.existed(null), "They were in People already");
});

/* ---- the visit, drawn ---- */
installLegacyReact({ __DEMO_MODE: false, CHANLY: { nav: () => {} } });
const { OpenVisit } = await import("../../../../apps/dashboard/src/surfaces/calendar/visit/visit-sheet");

/** What the wire saw (request line and body) and what it answers a POST contacts with. */
const sent = [];
let answer = () => ({ status: 200, body: { ok: true, data: { contact_id: "p9", existed: false } } });
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  sent.push({ line: `${init.method ?? "GET"} ${u.pathname}`, body: init.body ? JSON.parse(init.body) : undefined });
  const a = answer();
  return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
};
/** The adds the wire saw: the re-reads that follow an add (behind its answer) are the surfaces' own, and land when they land. */
const adds = () => sent.filter((s) => s.line === "POST /api/v1/contacts");
const flush = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** The Calendar's block for an appointment the board has no person for, with what the event carried. */
const blockOf = (item) => {
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: `2026-09-${String(7 + i).padStart(2, "0")}`, items: [], windows: [] });
  days[1].items.push({
    id: "e1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T19:30:00.000Z",
    title: "Ana Ruiz · Balayage",
    all_day: false,
    person: null,
    contacts: { phones: [ANA.phone], emails: [ANA.email] },
    guess: "Ana Ruiz",
    visit: { id: "v1", status: "booked" },
    ...item,
  });
  const vm = toCalendarVM(
    {
      timezone: TZ,
      from: "2026-09-07",
      to: "2026-09-13",
      feed: {
        present: true,
        state: "ok",
        read_at: "2026-09-08T15:58:00.000Z",
        events: 1,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      hours: { tue: { open: "09:00", close: "18:00" } },
      closures: [],
      rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
      booking_link: null,
      days,
    },
    NOW,
  );
  return { block: vm.days[1].blocks[0], vm };
};
/** What the board's toast said, newest last. */
const flashed = [];
const draw = ({ block, vm }) =>
  again(() =>
    OpenVisit({
      b: block,
      day: vm.days[1],
      todayKey: vm.today,
      tz: TZ,
      source: "your calendar",
      bookingLink: null,
      moments: null,
      days: vm.days,
      onClose() {},
      onWalk() {},
      flash: (text) => flashed.push(text),
    }),
  );
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const ADD = "cal-visit-primary-add";

test("a visit with no person in People leads with Add to People; one People matched, or one that names several, offers none", () => {
  fresh();
  const tree = draw(blockOf({}));
  const add = byTestId(tree, ADD);
  assert.ok(add, "the press is drawn");
  assert.equal(textOf(add).trim(), "Add to People");
  assert.ok(byTestId(tree, "cal-visit-contact"), "beside the line that says they are not in People yet");

  fresh();
  const matched = draw(blockOf({ person: { id: "p1", name: "Ana Ruiz", via: "phone" } }));
  assert.equal(byTestId(matched, ADD), null, "a matched visit has no press");
  assert.ok(byTestId(matched, "cal-visit-person"));

  fresh();
  const several = draw(blockOf({ contacts: { phones: [ANA.phone, "+19175550101"], emails: [] } }));
  assert.equal(byTestId(several, ADD), null, "two numbers: the sweep adds them within the hour");
  assert.equal(sent.length, 0, "and drawing the visit asked the server for nothing");
});

test("the press goes through the door Add a person uses, with what the event carried, and the board says what happened", async () => {
  fresh();
  sent.length = 0;
  flashed.length = 0;
  const shown = blockOf({});
  const tree = draw(shown);
  press(byTestId(tree, ADD));
  await flush();
  assert.deepEqual(
    adds(),
    [{ line: "POST /api/v1/contacts", body: { phone: ANA.phone, email: ANA.email, name: "Ana Ruiz" } }],
    "the number, the one address beside it and the name the event gave: the door fills only what is empty",
  );
  assert.deepEqual(flashed, ["Ana Ruiz is in People now"]);
});

test("a person already in People is said so, and a refusal is said in the door's words, the press still there to try again", async () => {
  fresh();
  sent.length = 0;
  flashed.length = 0;
  answer = () => ({ status: 200, body: { ok: true, data: { contact_id: "p1", existed: true } } });
  const shown = blockOf({});
  let tree = draw(shown);
  press(byTestId(tree, ADD));
  await flush();
  assert.deepEqual(flashed, ["Ana Ruiz was in People already"]);

  fresh();
  answer = () => ({
    status: 400,
    body: { ok: false, error: { code: "validation", message: "That is not a phone number." } },
  });
  tree = draw(shown);
  press(byTestId(tree, ADD));
  await flush();
  assert.equal(flashed.at(-1), "That is not a phone number.");
  tree = draw(shown);
  assert.ok(byTestId(tree, ADD), "and the press stays, to try again");
  answer = () => ({ status: 200, body: { ok: true, data: { contact_id: "p9", existed: false } } });
});

test("a role that may not add people is told why at the press, and the press adds nobody", async () => {
  fresh();
  sent.length = 0;
  const told = [];
  globalThis.window.gate = (action, doing) => ({
    "data-gated": "",
    "aria-disabled": true,
    "aria-description": `Your role can't ${doing}.`,
    onClick: () => told.push(action),
  });
  try {
    const tree = draw(blockOf({}));
    const add = byTestId(tree, ADD);
    assert.equal(add.props["data-gated"], "", "gated, and still in the tab order");
    assert.match(add.props["aria-description"], /add this person to People/);
    press(add);
    await flush();
    assert.deepEqual(told, ["approve"], "the gate answered the press");
    assert.deepEqual(adds(), [], "and nobody was added");
  } finally {
    delete globalThis.window.gate;
  }
});
