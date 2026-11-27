/**
 * The person is the hub: the runs that reached them and what came of each, the lists that keep themselves current,
 * the lead that found them, and their deal as a card with its one next act (0004, 0008, 00155).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, byTestId, find, press, textOf } from "../../_stub-react.mjs";
import * as contracts from "@chanlytics/contracts";
import {
  D,
  H,
  LEAD,
  ListsSheet,
  Menu,
  NEXT,
  NOW,
  NewListRow,
  PeopleReal,
  PersonDealCard,
  PersonLists,
  SMART,
  StatePill,
  VISITS,
  ZONE,
  cardOf,
  carryingCompose,
  dealRow,
  detail,
  frames,
  iso,
  itemsIn,
  json,
  movesOf,
  nextActOf,
  openedRow,
  ours,
  peoplePage,
  profile,
  recFolds,
  row,
  setCells,
  setSurfaceValue,
  settle,
  sheetAsks,
  surfaceValue,
  toPersonRowVM,
  toPersonVM,
  took,
  went,
  withDeals,
  withRuns,
} from "./_person-page.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

test("a person's page names the runs that reached them and what came of each -- it said nothing of what a playbook or a broadcast had sent them", () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  assert.deepEqual(
    vm.campaigns.map((c) => [c.id, c.title, c.line, c.tone, c.to]),
    [
      // Each says the wire it went by, or would have: a person on three channels knows where to look.
      [
        "b-queued",
        "Autumn offer",
        "Sent once · Email · Waiting to send",
        "plain",
        "campaigns/sequences/b-queued/runs/b-queued",
      ],
      ["b-win", "Win-back", "Campaign · WhatsApp · Replied", "ok", "campaigns/sequences/b-win/runs/b-win"],
      // A run made before runs had channels went by WhatsApp, and says so.
      [
        "b-spring",
        "Spring offer",
        "Sent once · WhatsApp · Sent",
        "plain",
        "campaigns/sequences/b-spring/runs/b-spring",
      ],
      [
        "b-held",
        "Summer offer",
        "Sent once · Text · Held · no yes to offers",
        "warn",
        "campaigns/sequences/b-held/runs/b-held",
      ],
      // The refusal's own words stay the provider's, never WhatsApp's by default: the wire is said beside them.
      [
        "b-refused",
        "May offer",
        "Sent once · WhatsApp · Didn't send · the provider refused it",
        "warn",
        "campaigns/sequences/b-refused/runs/b-refused",
      ],
    ],
    "newest first; a reply inside the window is a reply, one four days later is not",
  );
  assert.ok(
    vm.campaigns.every((c) => c.when && c.when !== "—"),
    "each is dated",
  );
});

test("a run's row on a person's page says Replied only for their own words: not a call's note, not their mailbox answering for them", () => {
  const d = withRuns();
  const [reply] = d.conversations[0].messages.filter((m) => m.id === "mr-win");
  const outcomeOf = (over) => {
    Object.assign(reply, { sender: "customer", type: "text", meta: null, ...over });
    return toPersonVM(d, ZONE, new Date(NOW)).campaigns.find((c) => c.id === "b-win").outcome;
  };
  assert.equal(outcomeOf({}), "Replied");
  assert.equal(outcomeOf({ sender: "system", type: "call_summary" }), "Sent", "a call's note is not a reply");
  assert.equal(outcomeOf({ meta: { email: { claim: "auto_reply" } } }), "Sent", "nor an out-of-office");
  assert.equal(outcomeOf({ meta: { email: { claim: "person" } } }), "Replied", "an email they wrote is");
});

test("REGRESSION: the timeline says who sent each of ours in the Inbox's words -- every one read 'You', a playbook's run among them", () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  const who = (id) => vm.timeline.find((i) => i.id === `m-${id}`)?.who;
  assert.equal(who("mb-win"), "The Win-back campaign");
  assert.equal(who("mb-spring"), "A one-off send (Spring offer)");
  assert.equal(who("m-team"), "Your team", "the row does not say which member sent it");
  assert.equal(who("m1"), "Daniela", "their own words are theirs");
  // A run's message that kept no meta is still the run's: its recipient row names it.
  const bare = withRuns();
  bare.conversations[0].messages = bare.conversations[0].messages.map((m) =>
    m.id === "mb-win" ? { ...m, meta: null } : m,
  );
  const again = toPersonVM(bare, ZONE, new Date(NOW));
  assert.equal(again.timeline.find((i) => i.id === "m-mb-win")?.who, "The Win-back campaign");
  // A playbook whose name has its own article keeps one, here and in the Inbox (messageAuthor).
  const offer = ours("mb-offer", iso(D), {
    source: "broadcast",
    broadcast_name: "x",
    playbook_name: "The month's offer",
  });
  assert.equal(
    contracts.messageAuthor(offer).words,
    "The month's offer campaign",
    "REGRESSION: the The month's offer campaign",
  );
});

test("a person's page names the lists that keep themselves current and have them on, by the rail's own tests -- and not the ones it already says", () => {
  // Booked this week is Monday to Sunday by the workspace clock, and the fixture books two days ahead of the real
  // one: run on a Saturday or a Sunday, the booking fell into next week and this failed (CI, 26 Sep 2026). So this
  // one reads at noon on the most recent Wednesday, with the booking two days on from THAT; the rest of the file
  // keeps the real clock, which the drawn pages read for themselves.
  const wed = new Date(NOW);
  wed.setUTCDate(wed.getUTCDate() - ((wed.getUTCDay() + 4) % 7));
  wed.setUTCHours(16, 0, 0, 0);
  const midweek = {
    ...NEXT,
    start: new Date(wed.getTime() + 2 * D).toISOString(),
    end: new Date(wed.getTime() + 2 * D + 2 * H).toISOString(),
  };
  const booked = toPersonVM(detail({ visits: { ...VISITS, next: midweek } }), ZONE, wed);
  assert.deepEqual(
    booked.smartLists.map((l) => l.id),
    ["booked_week", "booked"],
    "booked this week and booked; not Needs you, which Right now says, nor their yes, which the consent rows say",
  );
  const noCalendar = toPersonVM(detail({ row: row(), visits: undefined }), ZONE, new Date(NOW));
  assert.deepEqual(noCalendar.smartLists, [], "a calendar's lists only with a calendar");
});

test("a person found as a lead says so, with the way back to the lead -- About said they were added by hand", async () => {
  const d = detail({
    lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D) },
    added: { at: iso(8 * D), source: "lead", title: null },
  });
  const vm = toPersonVM(d, ZONE, new Date(NOW));
  const added = vm.about.find((a) => a.k === "Added");
  assert.ok(added && added.v.endsWith("from a lead you found"), `REGRESSION: ${added && added.v}`);
  assert.deepEqual(vm.lead && [vm.lead.name, vm.lead.to], ["Glow Studio", `clients/leads:p-${LEAD}`]);
  const noEvent = toPersonVM(
    detail({ lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D) } }),
    ZONE,
    new Date(NOW),
  );
  assert.ok(
    noEvent.about.some((a) => a.k === "Added" && a.v.endsWith("from a lead you found")),
    "found as a lead, with no row saying when they were added: the lead's day says it",
  );
  const draw = await profile(vm);
  const door = byTestId(draw(), "fact-lead");
  assert.ok(door, "the Added row is a door to the lead");
  press(door);
  assert.deepEqual(went, [`clients/leads:p-${LEAD}`]);
});

test("a person a reach-out found reads its emails, how their reply was read, where they were found, and where they stand (Part 6, H11)", () => {
  const out = {
    id: "m-out",
    conversation_id: "cv1",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "Saw your studio on the map.",
    media: null,
    meta: { source: "reach_out" },
    status: "delivered",
    created_at: iso(5 * D),
  };
  const base = detail();
  const d = {
    ...base,
    conversations: [{ ...base.conversations[0], messages: [out, ...base.conversations[0].messages] }],
    lead: {
      id: LEAD,
      business_name: "Glow Studio",
      found_at: iso(9 * D),
      reach_out: {
        lead_id: LEAD,
        business_name: "Glow Studio",
        stage: "converted",
        closed_reason: null,
        found_at: iso(9 * D),
        email_state: "ok",
        resume_at: null,
        booked_at: null,
        stopped_at: null,
        chain: { root_id: "r1", name: "Salons in Miami", state: "running" },
        search: { id: "s1", name: "Salons · Miami", asked: "salons in Miami", fit: "strong" },
        conversation_id: "cv1",
        sends: [
          {
            id: "s1",
            n: 0,
            hand: null,
            state: "sent",
            reason: null,
            send_at: iso(5 * D),
            sent_at: iso(5 * D),
            angle: "their reviews",
            host: "mail.example.com",
            message_id: "m-out",
            email_status: "delivered",
            bounced: false,
            left: true,
          },
        ],
        readings: [
          {
            message_id: "m1",
            read_at: iso(3 * H),
            intent: "question",
            claim: "person",
            summary: "Asks about Saturday",
            undone: false,
            until_at: null,
            stops: true,
            convert: true,
            said_no: false,
            can_undo: false,
          },
        ],
        can_stop: false,
      },
    },
  };
  const vm = toPersonVM(d, ZONE, new Date(NOW));
  const email = vm.timeline.find((t) => t.id === "m-m-out");
  assert.deepEqual(
    [email.who, email.sub],
    ["Campaign · Salons in Miami", "Email 1 · angle: their reviews · from mail.example.com · delivered"],
  );
  const reply = vm.timeline.find((t) => t.id === "m-m1");
  assert.equal(reply.sub, "Read as a question · the campaign stopped · Talking");
  const found = vm.timeline.find((t) => t.id === "found");
  assert.deepEqual(
    [found.who, found.text, found.link && found.link.to],
    ["Leads", "Found on Google Maps by “salons in Miami” · strong fit · address checked", `clients/leads:p-${LEAD}`],
  );
  const about = vm.about.find((a) => a.k === "Campaign");
  assert.ok(about && about.v.startsWith("Salons in Miami · Talking · wrote back"), about && about.v);
  // A lead with no reach-out, or one whose story could not be read, adds none of it.
  const plain = toPersonVM(
    detail({ lead: { id: LEAD, business_name: "Glow Studio", found_at: iso(9 * D), reach_out: null } }),
    ZONE,
    new Date(NOW),
  );
  assert.equal(
    plain.timeline.find((t) => t.id === "found"),
    undefined,
  );
  assert.equal(
    plain.about.find((a) => a.k === "Campaign"),
    undefined,
  );
});

test("the profile's Campaigns rows open each run's report, and its Lists name the lists that keep themselves current, each opening on People", async () => {
  const vm = toPersonVM(withRuns(), ZONE, new Date(NOW));
  // On a desk Campaigns is its own tab (0052, 13).
  const draw = await profile(vm, "campaigns");
  const rows = all(draw(), (n) => n.props?.["data-testid"] === "person-campaign");
  assert.equal(rows.length, 5);
  assert.ok(
    textOf(rows[1]).includes("Win-back") && textOf(rows[1]).includes("Campaign · WhatsApp · Replied"),
    textOf(rows[1]),
  );
  press(rows[1]);
  assert.deepEqual(went, ["campaigns/sequences/b-win/runs/b-win"]);
  const quiet = await profile(toPersonVM(detail(), ZONE, new Date(NOW)), "campaigns");
  assert.equal(
    byTestId(quiet(), "person-campaigns"),
    null,
    "no runs, no section (and no tab: the Overview it falls to)",
  );

  await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: ["p1"] }]);
  setCells([]);
  frames.begin();
  const lists = PersonLists({
    personId: "p1",
    canEdit: true,
    first: "Daniela",
    flash: () => {},
    smart: [{ id: "booked", label: "Booked" }],
  });
  const chip = byTestId(lists, "person-smart-chip");
  assert.ok(chip && textOf(chip).includes("Booked"));
  // The chip's name is a door: a link to the list on People (the kit's chip link).
  press(find(chip, (n) => n.type === "a"));
  assert.deepEqual(went, ["clients/seg:booked"]);
});

test("clients/new-list opens People with the New list box open from the first draw -- the door fired segments:new on a 450ms timer and hoped", async () => {
  await peoplePage([row()], []);
  setCells([]);
  frames.begin();
  PeopleReal({ onOpenProfile: () => {}, newList: true });
  frames.begin();
  const tree = PeopleReal({ onOpenProfile: () => {}, newList: true });
  assert.ok(byTestId(tree, "new-list-name"), "the box, open, waiting for a name");
});

test("a smart list rides the rail with who its rule holds for, and says its rule; a profile shows it and never offers to put someone on it or take them off", async () => {
  const draw = await peoplePage([row()], [{ id: "s1", name: "Regulars", ids: [] }, SMART]);
  const tree = draw();
  const smartRow = byTestId(tree, "saved-smart");
  assert.ok(smartRow, "the smart list is on the rail, marked");
  assert.ok(textOf(smartRow).includes("WhatsApp people") && textOf(smartRow).includes("1"), textOf(smartRow));
  assert.equal(smartRow.props["data-tip"], "Keeps itself current: Reaches you by WhatsApp");
  const saved = surfaceValue("people").saved.find((s) => s.id === "s2");
  assert.deepEqual(
    [saved.ids, saved.rule],
    [["p1"], ["Reaches you by WhatsApp"]],
    "who its rule holds for, and its rule as chips",
  );

  setCells([]);
  frames.begin();
  const lists = PersonLists({ personId: "p1", canEdit: true, first: "Daniela", flash: () => {} });
  const chips = all(lists, (n) => n.props?.["data-testid"] === "person-list-chip");
  assert.deepEqual(chips.map(textOf), ["WhatsApp people"], "on the smart list today");
  assert.equal(
    find(chips[0], (n) => String(n.props?.className ?? "").includes("cl-seg-filter-x")),
    null,
    "no cross on a rule",
  );
  frames.begin();
  const sheet = ListsSheet({
    c: {
      p: { id: "p1", smartLists: [{ id: "s2", label: "WhatsApp people", why: "Reaches you by WhatsApp" }] },
      first: "Daniela",
      flash: () => {},
      listsOpen: true,
      setListsOpen: () => {},
    },
  });
  const rows = all(sheet, (n) => n.props?.className === "cl-prof-listpick-row");
  assert.deepEqual(
    all(sheet, (n) => n.props?.testid === "person-lists-sheet-switch").length,
    1,
    "a switch for Regulars alone: the picker offers only the lists kept by hand",
  );
  assert.ok(
    rows.some((r) => textOf(r).includes("WhatsApp people") && textOf(r).includes("Keeps itself")),
    "the smart list is said as it stands, a door to it on People",
  );
});

test("a new list may be described: the assistant drafts a rule, the box shows its chips, who it holds for and what it left out, and Save makes the smart list", async () => {
  // The lists' verbs are the module's own (lists/actions.ts), so the draft goes over the wire it would go over, and who the
  // rule holds for is counted by the real rule over the people the page has read: three of these four were last here
  // more than sixty days ago, on a calendar that reads. Sixty-two, never sixty-one: the rule counts the business's calendar
  // days, and 61 × 24 hours back across a clock change is sixty of them (it failed on 2 Nov 2026, the day after one).
  const lastHere = (i, daysAgo) =>
    row({
      id: `d${i}`,
      display_name: `Drifter ${i}`,
      phone_e164: `+1786555${2000 + i}`,
      visits: {
        ...VISITS,
        next: null,
        last: { ...NEXT, id: `d${i}:1`, start: iso(daysAgo * D), end: iso(daysAgo * D - 2 * H) },
      },
    });
  await peoplePage([lastHere(1, 90), lastHere(2, 75), lastHere(3, 62), lastHere(4, 10)]);
  const rule = { all: [{ field: "last_visit", op: "more_than", days: 60 }] };
  const drafted = [];
  const people = globalThis.window.fetch;
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname !== "/api/v1/segments/draft") return people(url, init);
    drafted.push([init.method, JSON.parse(init.body)]);
    return json(200, { ok: true, data: { name: "Drifting", rule, cannot: "who their stylist is" } });
  };
  const made = [];
  setCells([]);
  const onCreate = async (name, made_rule) => {
    made.push([name, made_rule]);
    return { ok: true };
  };
  const draw = () => {
    frames.begin();
    return NewListRow({ onCreate });
  };
  press(byTestId(draw(), "new-list"));
  press(byTestId(draw(), "new-list-smart"));
  byTestId(draw(), "new-list-words").props.onChange({ target: { value: "regulars who stopped coming" } });
  await press(byTestId(draw(), "new-list-build"));
  await settle();
  const tree = draw();
  assert.deepEqual(drafted, [["POST", { words: "regulars who stopped coming" }]]);
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "new-list-rule").map(textOf), [
    "Last on the calendar more than 60 days ago",
  ]);
  assert.equal(textOf(byTestId(tree, "new-list-holds")), "3 people on it today, and it keeps itself current.");
  assert.equal(textOf(byTestId(tree, "new-list-cannot")), "Left out: who their stylist is");
  assert.equal(byTestId(tree, "new-list-name").props.value, "Drifting", "the draft's name, to change or keep");
  await press(byTestId(tree, "new-list-add"));
  assert.deepEqual(made, [["Drifting", rule]]);
});

test("REGRESSION: a reply counting down to send waits on you on People as in the Inbox -- the rule lived in inbox.jsx, and People counted that person as waiting on nobody", () => {
  const { replyWaitsOnYou } = contracts;
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW + 20_000 }, NOW), true, "the Inbox: counting down");
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW - 1 }, NOW), false, "sent: it is in your name now");
  assert.equal(replyWaitsOnYou({ endsAtMs: NOW + 20_000, held: true }, NOW), false, "held in this tab: stopped");
  assert.equal(replyWaitsOnYou({ queued: true }, NOW), true, "People: queued is exactly while it can be stopped");
  assert.equal(replyWaitsOnYou({}, NOW), false);
  const quiet = { needs_human: false, open_escalation_reason: null, open_escalation_since: null };
  const queued = toPersonRowVM(row({ ...quiet, queued_reply_at: iso(10_000) }), ZONE, new Date(NOW));
  assert.equal(queued.state, "needs_you", "REGRESSION: 'active' while the Inbox counted them in Needs you");
  assert.equal(queued.stateDetail, "a reply is about to send · you can still stop it");
  assert.equal(
    toPersonRowVM(row(quiet), ZONE, new Date(NOW)).state === "needs_you",
    false,
    "nothing queued, nothing waiting",
  );
});

test("a proposal's send sits beside the booking link in More, 'again' once it went out, nothing to press for a viewer or for someone who said stop, in every workspace; and About no longer says the link, the deal does (0008, amended 18 Oct 2026)", async () => {
  const url = "https://docs.example.com/p/dani";
  // The send is a deal's (0008): the workspace here says some customers get a proposal first. The last case is one
  // whose customers book. With no deal at all, the link left on the person (00154) is theirs, until it retires.
  const outbound = (at, status) => ({
    id: `m-${status}`,
    conversation_id: "cv1",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: contracts.proposalMessage(url),
    media: null,
    meta: null,
    status,
    channel: "whatsapp",
    created_at: at,
  });
  const aboutKeys = (t) => all(t, (n) => String(n.props?.className || "") === "cl-prof-attr-key").map((k) => textOf(k));
  const vm = toPersonVM(detail({ proposal_url: url, booking_link: "https://book.example/salon" }), ZONE, new Date(NOW));
  let tree = (await profile(vm))();
  assert.equal(byTestId(tree, "person-proposal"), null, "REGRESSION: the link was an About row of its own");
  assert.ok(!aboutKeys(tree).includes("Proposal"), `About says it no more: ${aboutKeys(tree)}`);
  // The sends are the More menu's first items, in plain words, each saying what it does under it.
  const moreOf = (t) => find(t, (n) => n.type === Menu);
  const labels = (t) => (moreOf(t) ? itemsIn(moreOf(t)).map((i) => i.label) : []);
  const items = itemsIn(moreOf(tree));
  // More's first group reaches them (canvas A): Text them, the booking link, then the proposal (Call is the head's).
  assert.deepEqual(
    items.slice(0, 3).map((i) => i.label),
    ["Text them", "Send booking link", "Send proposal"],
    "the booking link, then the proposal",
  );
  const proposal = items.find((i) => i.label === "Send proposal");
  assert.ok(
    /^Opens their conversation with it ready to send/.test(proposal.title),
    `what it does, on hover: ${proposal.title}`,
  );
  const send = { props: { onClick: proposal.onSelect } };

  // The press carries the contract's words into the thread's composer and opens the thread; nothing is sent.
  const carried = [];
  const putBack = carryingCompose(carried);
  try {
    went.length = 0;
    press(send);
    assert.deepEqual(went, [vm.openThread], "it opens the conversation");
    assert.equal(carried.length, 1);
    assert.equal(carried[0][0], "chanlytics-compose");
    assert.deepEqual(JSON.parse(carried[0][1]), {
      threadId: vm.openThread.replace(/^inbox\//, ""),
      text: contracts.proposalMessage(url),
    });
  } finally {
    putBack();
  }

  // Once the address went out the label says so; a message still in its cancel window does not count.
  const d = detail({ proposal_url: url });
  d.conversations[0].messages.push(outbound(iso(2 * H), "queued"));
  tree = (await profile(toPersonVM(d, ZONE, new Date(NOW))))();
  assert.ok(labels(tree).includes("Send proposal"));
  d.conversations[0].messages.push(outbound(iso(H), "sent"));
  tree = (await profile(toPersonVM(d, ZONE, new Date(NOW))))();
  assert.ok(labels(tree).includes("Send proposal again"), labels(tree).join(", "));

  // None on file: no send, and no row inviting one: a proposal is started from the Deal section.
  tree = (await profile(toPersonVM(detail(), ZONE, new Date(NOW))))();
  assert.equal(byTestId(tree, "person-proposal"), null);
  assert.ok(!labels(tree).some((l) => /^Send proposal/.test(l)), "no proposal, no send");
  assert.ok(labels(tree).includes("Start a proposal"), "a proposal is started, in the sheet");

  // A viewer sends nothing, and may still call them from their own phone.
  bridgeHolds({ who: { me: { role: "viewer" } } });
  try {
    tree = (await profile(vm))();
    assert.ok(!labels(tree).some((l) => /^Send/.test(l)), `a viewer sends nothing: ${labels(tree)}`);
    // A link on a phone; on a desk the press the call's popover hangs from (call.tsx), which the popover holds as its trigger.
    const call =
      byTestId(tree, "person-call") ?? find(tree, (n) => n.props?.trigger?.props?.["data-testid"] === "person-call");
    assert.ok(call, "the head's own Call, beside More (0052)");
  } finally {
    bridgeHolds({ who: { me: { role: "owner" } } });
  }

  // Someone who said stop: never the send.
  const quiet = toPersonVM(
    detail({ row: row({ visits: VISITS, consent: "opted_out" }), proposal_url: url }),
    ZONE,
    new Date(NOW),
  );
  tree = (await profile(quiet))();
  // Nothing is sent to someone who said stop: what would send is drawn, disabled, and says why (canvas A, More).
  const sends = itemsIn(moreOf(tree)).filter((i) => /^(Send|Text them|Email them)/.test(i.label));
  assert.ok(sends.length > 0, "the sends are drawn");
  assert.ok(
    sends.every((i) => i.disabled === true && /asked to stop/.test(i.title)),
    `nothing is sent to someone who said stop: ${sends.map((i) => `${i.label}:${i.disabled}`)}`,
  );

  // A salon (0008, amended 18 Oct 2026): the booking link's send, and the proposal's beside it, as every workspace has;
  // with nothing on file, no Deal section on the page.
  tree = (
    await profile(
      toPersonVM(
        detail({ proposal_url: url, booking_link: "https://book.example/salon", appointment_word: "visit" }),
        ZONE,
        new Date(NOW),
      ),
    )
  )();
  assert.ok(labels(tree).includes("Send booking link"));
  assert.ok(labels(tree).includes("Send proposal"), `a salon may send its proposal too: ${labels(tree)}`);
  assert.equal(byTestId(tree, "person-deal"), null, "and no Deal section with nothing on file");
  assert.ok(!aboutKeys(tree).includes("Proposal"));
});

test("the Deal section stands on the Overview above Coming up for someone a deal is true of; with nothing on file it is no line on the page, the proposal started from More (0008, amended 18 Oct 2026); the card's settings have no Deal row", async () => {
  recFolds.reset();
  const asked = sheetAsks();
  const none = (await profile(withDeals([])))();
  assert.equal(byTestId(none, "person-deal"), null, "nothing on file and no consultation waiting: no Deal section");
  const tree = (await profile(withDeals([dealRow()])))();
  const section = byTestId(tree, "person-deal");
  assert.equal(textOf(find(section, (n) => n.type === "h2")), "Deals");
  const story = find(tree, (n) => typeof n.type === "function" && n.type.name === "StoryParts");
  const kids = story.rendered.props.children.filter((k) => k && typeof k === "object");
  const at = kids.findIndex((k) => k.type === PersonDealCard);
  assert.ok(at >= 0 && kids[at].props.rung, "the deal, in their story, its next act Now's");
  assert.ok(kids.findIndex((k) => k.props?.["data-testid"] === "person-coming-up") > at, "then what is coming");
  const more = find(none, (n) => n.type === Menu && n.props.trigger?.props?.["data-testid"] === "person-more");
  const start = itemsIn(more).find((i) => /^Start a proposal/.test(i.label));
  assert.ok(start, "More offers a proposal to start");
  start.onSelect();
  assert.deepEqual(asked, [{ personId: "p1", mode: "propose" }], "the one sheet, for a new proposal");
  const cls = (n) => String(n.props?.className || "");
  assert.deepEqual(
    all(byTestId(tree, "person-settings"), (n) => cls(n).split(" ").includes("rec-row")).map((r) =>
      textOf(find(r, (n) => cls(n) === "rec-row-key")),
    ),
    ["AI", "Messages", "Offers & news"],
    "REGRESSION: the deal was a row of the card and a fold under it (canvas A's order: the answers, then who answers)",
  );
  assert.equal(byTestId(tree, "rec-row-person-deal"), null);
  assert.ok(!all(tree, (n) => n.type === "h2").some((h) => textOf(h) === "Proposal"));
});

test("a proposal out is a card: its service and value, its steps, its link and whether it went, its one next act as the outline button and the other moves as words, each opening the sheet or the thread", async () => {
  recFolds.reset();
  const asked = sheetAsks();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  const putBack = carryingCompose(carried);
  try {
    // The person's own link (00154) stays theirs: the card says the deal's.
    const vm = withDeals([dealRow({ proposal_url: url })], { proposal_url: "https://docs.example.com/p/own" });
    let tree = await openedRow(vm);
    const card = cardOf(tree);
    assert.equal(textOf(byTestId(card, "person-deal-title")), "Ad management");
    assert.equal(textOf(byTestId(card, "person-deal-value")), "$1,200", "a proposal says its value (0008)");
    assert.deepEqual(
      all(card, (n) => n.props?.["data-testid"] === "person-deal-step").map((s) => [
        textOf(find(s, (n) => n.props?.className === "cl-prof-deal-step-label")),
        s.props["data-at"],
      ]),
      [
        ["Proposal out", "current"],
        ["Client", "ahead"],
      ],
      "no consultation, no Consultation step",
    );
    const link = byTestId(card, "person-deal-link");
    assert.deepEqual([link.props.href, link.props.target, link.props.rel], [url, "_blank", "noopener noreferrer"]);
    assert.equal(textOf(link), "quotes.example.com", "the deal's link, not the one left on the person");
    assert.deepEqual(all(card, (n) => n.props?.["data-testid"] === "person-deal-fact").map(textOf), ["Not sent yet"]);
    // Not sent, and it can go: the next act is the send, an outline button; the page's one filled button is the thread.
    const next = nextActOf(tree);
    assert.equal(textOf(next), "Send proposal");
    assert.notEqual(next.props.variant, "primary", "an outline button: the page's one filled button is the thread");
    assert.deepEqual(movesOf(card).map(textOf), ["Mark as client", "Mark as passed", "Edit proposal"]);
    // The card leads with the send, so the More menu does not say it again.
    const more = find(tree, (n) => n.type === Menu);
    assert.ok(
      !itemsIn(more).some((i) => /^Send proposal/i.test(i.label || "")),
      "REGRESSION: Send proposal on the card and again under More",
    );
    went.length = 0;
    press(next);
    assert.deepEqual(went, [vm.openThread], "the send opens their thread...");
    assert.deepEqual(JSON.parse(carried.at(-1)[1]), {
      threadId: vm.openThread.replace(/^inbox\//, ""),
      text: contracts.proposalMessage(url),
    });
    assert.equal(asked.length, 0, "...and never the sheet");
    press(movesOf(card)[0]);
    press(movesOf(card)[1]);
    assert.deepEqual(asked, [
      { personId: "p1", mode: "won", dealId: "d1" },
      { personId: "p1", mode: "lost", dealId: "d1" },
    ]);

    // Recorded without a link: said, and adding it is the next act.
    tree = await openedRow(withDeals([dealRow()]));
    assert.deepEqual(all(cardOf(tree), (n) => n.props?.["data-testid"] === "person-deal-fact").map(textOf), [
      "No link yet",
    ]);
    assert.equal(textOf(nextActOf(tree)), "Edit proposal");
    assert.deepEqual(movesOf(tree).map(textOf), ["Mark as client", "Mark as passed"], "the edit is said once");
    assert.equal(byTestId(tree, "person-deal-flag"), null, "they wrote since: nothing waiting");
    // Nothing back in a week: a state in the warn tone, the house's one pill. A proposal recorded without a link went
    // some other way, so it waits as one whose link went.
    tree = await openedRow(withDeals([dealRow()], {}, { last_inbound_at: iso(12 * D) }));
    const flag = find(tree, (n) => n.type === StatePill && n.props.testid === "person-deal-flag");
    assert.deepEqual([flag.props.kind, flag.props.value, flag.props.label], ["tone", "warn", "Nothing back in 9 days"]);

    // A client: the steps say it; the one move is the end, in quiet words.
    tree = await openedRow(
      withDeals([
        dealRow({ stage: "won", decided_at: iso(2 * D), per: "month", amount_cents: 250_000, proposal_url: url }),
      ]),
    );
    assert.equal(textOf(byTestId(cardOf(tree), "person-deal-value")), "$2,500 a month");
    assert.equal(byTestId(tree, "person-deal-link"), null, "a client's proposal is history");
    assert.equal(nextActOf(tree), null);
    assert.deepEqual(movesOf(tree).map(textOf), ["End the engagement"]);
    const current = find(cardOf(tree), (n) => n.props?.["aria-current"] === "step");
    assert.deepEqual(
      [current.props["data-tone"], textOf(find(current, (n) => n.props?.className === "cl-prof-deal-step-label"))],
      ["ok", "Client"],
    );

    // Passed: no card, one line with the reason, and proposing again moves that row.
    asked.length = 0;
    tree = (await profile(withDeals([dealRow({ stage: "lost", decided_at: iso(2 * D), lost_reason: "price" })])))();
    assert.equal(cardOf(tree), null);
    assert.match(textOf(byTestId(tree, "person-deal-said")), /^Ad management · Passed \w{3} \d+ · Price$/);
    press(byTestId(tree, "person-deal-start"));
    assert.deepEqual(asked, [{ personId: "p1", mode: "again", dealId: "d1" }]);

    // A viewer reads the card and presses nothing.
    bridgeHolds({ who: { me: { role: "viewer" } } });
    try {
      tree = (await profile(vm))();
      assert.ok(cardOf(tree));
      assert.equal(nextActOf(tree), null);
      assert.deepEqual(movesOf(tree), []);
    } finally {
      bridgeHolds({ who: { me: { role: "owner" } } });
    }
  } finally {
    putBack();
  }
});

test("where only an approved message can reach them, the card's follow-up opens their thread with nothing written in it and says why on hover; someone who said stop is offered none", async () => {
  recFolds.reset();
  const url = "https://quotes.example.com/p/dani";
  const carried = [];
  const putBack = carryingCompose(carried);
  const said = (id, dir, body, ago) => ({
    id,
    conversation_id: "cv1",
    direction: dir,
    sender: dir === "inbound" ? "customer" : "human",
    type: "text",
    body,
    media: null,
    meta: null,
    status: dir === "inbound" ? "received" : "sent",
    channel: "whatsapp",
    created_at: iso(ago),
  });
  // Sent on WhatsApp eight days ago, and nothing from them in twelve: their window is shut.
  const quiet = (rowOver = {}) =>
    withDeals(
      [dealRow({ proposal_url: url })],
      {
        conversations: [
          {
            ...detail().conversations[0],
            last_wa_inbound_at: iso(12 * D),
            messages: [
              said("m1", "inbound", "Send it over", 12 * D),
              said("m2", "outbound", contracts.proposalMessage(url), 8 * D),
            ],
          },
        ],
      },
      { latest_wa_inbound_at: iso(12 * D), last_inbound_at: iso(12 * D), last_message_at: iso(8 * D), ...rowOver },
    );
  try {
    const vm = quiet();
    const tree = await openedRow(vm);
    const next = nextActOf(tree);
    assert.deepEqual([textOf(next), next.props["data-tip"]], ["Follow up", contracts.DEAL_ACT_HINTS.approved]);
    press(next);
    assert.deepEqual(went, [vm.openThread], "their conversation, which offers the approved messages");
    assert.deepEqual(carried, [], "and nothing written for them: no free text can go");
    for (const rowOver of [{ consent: "opted_out" }, { dnc: true }]) {
      const stopped = await openedRow(quiet(rowOver));
      assert.equal(textOf(nextActOf(stopped)), "Mark as client", JSON.stringify(rowOver));
    }
    // Where their People row says the proposal follow-up has them (0006): the day its run goes, and the card leads
    // with no nudge of its own.
    const keep = surfaceValue("people");
    try {
      const draw = await profile(quiet());
      setSurfaceValue("people", {
        ...(keep || {}),
        rows: [{ id: vm.id, followUp: { kind: "will", at_ms: NOW, asks: true } }],
      });
      for (const title of all(draw(), (n) => n.props?.["data-testid"] === "person-deal-title")) press(title);
      const inHand = draw();
      assert.equal(textOf(nextActOf(inHand)), "Mark as client");
      const flag = find(inHand, (n) => n.type === StatePill && n.props.testid === "person-deal-flag");
      assert.deepEqual([flag.props.value, flag.props.label], ["info", "Follow-up to approve today"]);
    } finally {
      setSurfaceValue("people", keep);
    }
  } finally {
    putBack();
  }
});

test("the page reads the person again when People lands or changes, which a deal recorded in the sheet or a step saved is read with; the sheets' own events read nothing (0047)", async () => {
  const vm = withDeals([dealRow()]);
  const draw = await profile(vm);
  draw();
  await settle();
  // Counted from here: drawing the page is not what is being proved.
  const reads = () => took("GET", "/api/v1/contacts/p1").length;
  const drawn = reads();
  // The sheets say `deal:recorded` (the Pipeline's focus) and nothing of a note: neither reads the page, for anyone.
  globalThis.window.dispatchEvent({ type: "deal:recorded", detail: { personId: "p1" } });
  globalThis.window.dispatchEvent({ type: "note:saved", detail: { personId: "p1" } });
  await settle();
  assert.equal(reads() - drawn, 0, "REGRESSION: a window event the sheets once said read the page a second time");
  globalThis.window.dispatchEvent({ type: "surface:clients" });
  await settle();
  assert.equal(reads() - drawn, 1, "People landing or changing reads their page again, once");
});

test("the page reads the person again when the Inbox or Conversations shows a message or call of theirs newer than the page holds, and not for anyone else's (N1)", async () => {
  // People re-reads a message only while its own list is on screen (#1347), and a person's page is another route: a customer who
  // answered while their page was open changed nothing on it. The Inbox and Conversations are read for every message, so the page
  // hears them and reads its one person: never People's list.
  const vm = toPersonVM(detail(), ZONE, new Date(NOW));
  const held = vm.lastContact.ts;
  assert.ok(held, "the person was last heard from at a moment the page holds");
  const keep = [surfaceValue("inbox"), surfaceValue("conversations")];
  try {
    const draw = await profile(vm);
    draw();
    await settle();
    const reads = () => took("GET", "/api/v1/contacts/p1").length;
    const drawn = reads();
    const told = async (type) => {
      globalThis.window.dispatchEvent({ type, detail: {} });
      await settle();
    };
    setSurfaceValue("inbox", { THREADS: [{ clientId: "someone-else", lastAtMs: held + 60_000 }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 0, "someone else wrote");
    setSurfaceValue("inbox", { THREADS: [{ clientId: "p1", lastAtMs: held }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 0, "nothing newer than the page holds");
    setSurfaceValue("inbox", { THREADS: [{ clientId: "p1", lastAtMs: held + 60_000 }] });
    await told("surface:inbox");
    assert.equal(reads() - drawn, 1, "they wrote: their page is read again");
    await told("surface:inbox");
    await told("surface:conversations");
    assert.equal(reads() - drawn, 1, "and the same message, told by the next read, is not read twice");
    setSurfaceValue("conversations", { CONVERSATIONS: [{ clientId: "p1", ts: held + 120_000 }] });
    await told("surface:conversations");
    assert.equal(reads() - drawn, 2, "they phoned: read again");
    assert.equal(took("GET", "/api/v1/contacts").length, 0, "and People's list is not read for it");
  } finally {
    setSurfaceValue("inbox", keep[0]);
    setSurfaceValue("conversations", keep[1]);
  }
});
