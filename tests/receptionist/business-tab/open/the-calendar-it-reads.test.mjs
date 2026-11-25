/**
 * When you're open: the calendar it reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_FEED_WORDS, FEED_CHECK_WORDS, FEED_GUIDES } from "@chanlytics/contracts";
import { CALENDAR_PAGE } from "../../../../apps/dashboard/src/surfaces/calendar/words.ts";
import { unmount, settle, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import {
  cancelFoldOf,
  drawTab,
  foldOf,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  redrawTab,
  saveFoldOf,
  saving,
  settingsHeld,
  typeAt,
  W,
  went,
  without,
  written,
} from "../../../_business-tab-harness.mjs";
import {
  NEW_YEAR,
  XMAS,
  calendarRead,
  clock,
  linkBox,
  pastTheCheck,
  pickBooksWith,
  readOk,
  setSurfaceValue,
  surfaceValue,
} from "./_open.mjs";

test("the booking tool row says where its calendar link reads and when, and keeps the address, the count and the source in its fold", () => {
  setSurfaceValue("calendar", calendarRead(readOk()));
  try {
    const tree = drawTab({ profile: marisa });
    const row = byTestId(tree, "rec-row-calendar");
    assert.equal(
      find(row, (n) => /Check the (address|link)/i.test(textOf(n))),
      null,
      "a row that can say it needs no button",
    );
    // At rest: the host it reads, when it was last read, and one mark that says whether that worked. The words the
    // mark carries are the Calendar page's, in its accessible name and under a pointer -- not a pill of its own.
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-where"))), "app.chanlytics.com");
    const mark = byTestId(row, "rec-calendar-state");
    assert.equal(mark.props["aria-label"], CALENDAR_FEED_WORDS.ok);
    assert.equal(mark.props["data-tip"], CALENDAR_FEED_WORDS.ok);
    assert.equal(textOf(mark), "", "a mark, not a word on the row");
    assert.equal(textOf(byTestId(row, "rec-calendar-read")), surfaceValue("calendar").vm.feed.read);
    assert.equal(surfaceValue("calendar").vm.feed.read, "read 4m ago");
    // And nothing else: no secret of an address, no count of events, no "from" anybody.
    const words = textOf(byTestId(row, "rec-row-calendar"));
    assert.doesNotMatch(words, /\.ics/, "the whole address is a long secret, read over a shoulder");
    assert.doesNotMatch(words, /\d+ events?/);
    assert.doesNotMatch(words, /From Google Calendar/);
    assert.deepEqual(
      all(row, (n) => n.type === "button").map((b) => b.props["data-testid"]),
      ["rec-row-act-calendar"],
    );
    // Opened, the fold holds the address whole, and the whole of what the last read found, with the door to the board.
    openFold(tree, "calendar");
    const open = redrawTab();
    assert.equal(
      linkBox(open).props.value,
      "https://app.chanlytics.com/api/v1/calendar/filler.ics",
      "the address, whole",
    );
    assert.equal(linkBox(open).props["aria-label"], "Calendar link", "named by the part's head, heard on the box");
    const whole = byTestId(open, "rec-calendar-whole");
    assert.equal(textOf(find(whole, (n) => n.type === "span")), surfaceValue("calendar").vm.feed.detail);
    assert.match(surfaceValue("calendar").vm.feed.detail, /From Google Calendar · read 4m ago · 12 events/);
    went.length = 0;
    press(byTestId(whole, "rec-calendar-open"));
    assert.deepEqual(went, ["calendar"]);
    // A read that failed says in the fold what it tried and when, which the row at rest leaves to the reason.
    setSurfaceValue(
      "calendar",
      calendarRead(
        readOk({
          state: "unavailable",
          read_at: null,
          events: 0,
          reason: "http",
          status: 404,
          problem: "The calendar answered 404.",
        }),
      ),
    );
    const bad = redrawTab();
    assert.match(textOf(byTestId(bad, "rec-calendar-whole")), /tried 4m ago/);
  } finally {
    setSurfaceValue("calendar", undefined);
  }
});

test("the booking tool row states what the owner books with, and under it one mark with the next thing to do; nothing said, it says Not set up", () => {
  const nothing = { state: "none", present: false, read_at: null, events: 0 };
  const notices = (over = {}) => ({
    tool: "booksy",
    address: "marisa@mail.example.com",
    last_at: null,
    count: 0,
    held: 0,
    held_list: [],
    forwarding: null,
    ...over,
  });
  const lineOf = (row) => byTestId(row, "bt-bookings-read");
  const booksy = { calendar: undefined, bookings: { tool: "booksy" } };
  try {
    // Nothing said and nothing arrived: an empty row, its value alone (Ruben, 10 Oct 2026: a row says its value and
    // stops), and no line under it.
    setSurfaceValue("calendar", calendarRead(readOk(nothing)));
    let row = byTestId(drawTab({ config: { calendar: undefined } }), "rec-row-calendar");
    assert.equal(row.props["data-empty"], "true");
    assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-empty"))), "Not set up");
    assert.equal(
      find(row, (n) => classes(n).includes("rec-row-hint")),
      null,
    );
    assert.equal(lineOf(row), null);
    assert.equal(byTestId(row, "rec-calendar-read"), null, "and no read is stated of a link there is not");
    // A tool named: the row states it as the product says it, and the line says it waits for the first email. The
    // mark's own word is its accessible name and its tip, as the calendar link's mark carries the Calendar page's.
    setSurfaceValue("calendar", calendarRead(readOk({ ...nothing, notices: notices() })));
    row = byTestId(drawTab({ config: booksy }), "rec-row-calendar");
    assert.equal(row.props["data-empty"], "false");
    assert.equal(textOf(byTestId(row, "bt-bookings-tool")), "Booksy");
    assert.equal(textOf(lineOf(row)), "Waiting for the first booking email");
    assert.equal(lineOf(row).props["data-tone"], "plain");
    const mark = byTestId(row, "bt-bookings-state");
    assert.equal(mark.props["aria-label"], "Waiting");
    assert.equal(mark.props["data-tip"], "Waiting");
    assert.equal(textOf(mark), "", "a mark, not a word on the row");
    assert.doesNotMatch(textOf(row), /What you book with\./, "a row that has its fact states it and stops");
    // Held for a look before any has become a visit: the row says so, never that it is still waiting for the first.
    setSurfaceValue("calendar", calendarRead(readOk({ ...nothing, notices: notices({ held: 1 }) })));
    row = byTestId(drawTab({ config: booksy }), "rec-row-calendar");
    assert.equal(textOf(lineOf(row)), "1 booking email to look at");
    assert.equal(lineOf(row).props["data-tone"], "warn");
    // Emails arriving, two held for a look: one mark in the warn tone, and the count, never a list on the row.
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const heldRow = (id, reason) => ({
      id,
      tool: "booksy",
      from: "no-reply@booksy.com",
      subject: `New booking ${id}`,
      received_at: twoHoursAgo,
      reason,
    });
    setSurfaceValue(
      "calendar",
      calendarRead(
        readOk({
          ...nothing,
          notices: notices({
            last_at: twoHoursAgo,
            count: 5,
            held: 2,
            held_list: [heldRow("n1", "no_time"), heldRow("n2", "no_client")],
          }),
        }),
      ),
    );
    row = byTestId(drawTab({ config: booksy }), "rec-row-calendar");
    assert.equal(textOf(lineOf(row)), "Last booking email 2h ago · 2 to look at");
    assert.equal(lineOf(row).props["data-tone"], "warn");
    assert.deepEqual(
      all(row, (n) => n.type === "button").map((b) => b.props["data-testid"]),
      ["rec-row-act-calendar"],
      "the row's one act; Read again and Dismiss wait in the fold",
    );
    // The fold, for a tool known to give no calendar: one sentence in place of the link's box, which waits behind a
    // press; then the emails' part, with the address and its Copy, the steps folded now that emails arrive, and the
    // two held emails with their presses.
    openFold(drawTab({ config: booksy }), "calendar");
    let open = foldOf(redrawTab(), "calendar");
    assert.equal(
      textOf(byTestId(open, "bto-link-note")).replace("I have a calendar link", "").trim(),
      "Booksy offers no calendar link. AI sends your booking link instead of naming open times.",
    );
    assert.equal(byTestId(open, "bto-link"), null, "no box for a link the tool does not give");
    assert.match(textOf(byTestId(open, "bto-emails")), /^Booking emails/);
    assert.match(textOf(byTestId(open, "bto-bookings-address")), /Send your booking emails to this address\./);
    assert.match(textOf(byTestId(open, "bto-bookings-address")), /marisa@mail\.example\.com/);
    assert.equal(textOf(byTestId(open, "bto-bookings-copy")), "Copy");
    assert.equal(byTestId(open, "bto-bookings-steps").type, "details", "a thing to look up, once emails arrive");
    assert.match(textOf(byTestId(open, "bto-bookings-steps")), /no-reply@booksy\.com/);
    assert.match(textOf(byTestId(open, "bto-bookings-held")), /2 booking emails need a look\./);
    // Who a held email came from waits under a pointer, on its subject: the row stays two lines and two presses.
    const heldRows = all(
      byTestId(open, "bto-bookings-held"),
      (n) => n.props?.["data-testid"] === "bto-bookings-held-row",
    );
    assert.equal(heldRows.length, 2);
    assert.equal(find(heldRows[0], (n) => n.props?.title === "no-reply@booksy.com") != null, true);
    assert.doesNotMatch(textOf(heldRows[0]), /no-reply@booksy\.com/);
    // An owner who keeps a calendar of their own all the same: one press, and the box is there.
    press(byTestId(open, "bto-link-anyway"));
    open = foldOf(redrawTab(), "calendar");
    assert.ok(byTestId(open, "bto-link"));
    assert.equal(linkBox(redrawTab()).props.value, "");
    // Before any email: the steps stand open, with the way to see it work at once.
    setSurfaceValue("calendar", calendarRead(readOk({ ...nothing, notices: notices() })));
    openFold(drawTab({ config: booksy }), "calendar");
    open = foldOf(redrawTab(), "calendar");
    assert.equal(byTestId(open, "bto-bookings-steps").type, "div");
    assert.match(textOf(byTestId(open, "bto-bookings-steps")), /forward any past booking email/);
    // A tool and a link: the row states both, the tool and where its link is read from.
    setSurfaceValue(
      "calendar",
      calendarRead(readOk({ notices: notices({ tool: "square", last_at: twoHoursAgo, count: 3 }) })),
    );
    row = byTestId(drawTab({ config: { bookings: { tool: "square" } } }), "rec-row-calendar");
    assert.equal(textOf(byTestId(row, "bt-bookings-tool")), "Square · app.chanlytics.com");
    assert.ok(byTestId(row, "rec-calendar-read") && lineOf(row), "a line for the link's read and one for the emails");
  } finally {
    setSurfaceValue("calendar", undefined);
  }
});

test("the fold asks what the owner books with and draws only what that answer has: no address yet, a booking link that names its tool, and booking by hand", () => {
  const nothing = { state: "none", present: false, read_at: null, events: 0 };
  const sent = saving();
  try {
    // No address yet: the one its name gives is offered in one press, and the steps, which name "the address above",
    // wait for it.
    setSurfaceValue(
      "calendar",
      calendarRead(
        readOk({
          ...nothing,
          notices: {
            tool: "booksy",
            address: null,
            suggested: "marisas-beauty-salon@mail.example.com",
            last_at: null,
            count: 0,
            held: 0,
            held_list: [],
            forwarding: null,
          },
        }),
      ),
    );
    openFold(drawTab({ config: { calendar: undefined, bookings: { tool: "booksy" } } }), "calendar");
    let open = foldOf(redrawTab(), "calendar");
    assert.match(textOf(byTestId(open, "bto-bookings-address")), /Your workspace has no email address yet/);
    assert.match(textOf(byTestId(open, "bto-bookings-address")), /it cannot be changed later/);
    assert.equal(textOf(byTestId(open, "bto-bookings-make")), "Use marisas-beauty-salon@mail.example.com");
    assert.equal(byTestId(open, "bto-bookings-steps"), null);
    went.length = 0;
    press(byTestId(open, "bto-bookings-choose"));
    assert.deepEqual(went, ["admin/integrations"], "and Connections, for an owner who wants another");
    // Nothing said yet, and a booking link on a platform the product knows: the row and the fold name the tool, so the
    // owner who gave the link is not asked which tool it is. One press takes it, and Save writes it.
    setSurfaceValue("calendar", calendarRead(readOk(nothing)));
    const onBooksy = {
      config: { calendar: undefined },
      brain: { booking_link: "https://booksy.com/en-us/4471902_bright" },
    };
    let tree = drawTab(onBooksy);
    assert.match(
      textOf(byTestId(tree, "rec-row-calendar")),
      /Your booking link is on Booksy\. Set it up to fill your calendar\./,
    );
    const stored = written(settingsHeld().config);
    openFold(tree, "calendar");
    tree = redrawTab();
    const guess = byTestId(foldOf(tree, "calendar"), "bto-bookings-guess");
    assert.match(textOf(guess), /Your booking link is on Booksy\./);
    assert.equal(byTestId(tree, "bto-link"), null, "nothing of an answer before there is one");
    press(find(guess, (n) => n.type === "button"));
    tree = redrawTab();
    assert.equal(byTestId(tree, "bto-bookings-guess"), null, "taken, it is the answer");
    assert.ok(byTestId(tree, "bto-emails"));
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[0].config, { ...without(stored, "calendar"), bookings: { tool: "booksy" } });
    // By hand: nothing to connect, said once, and neither part drawn. Saved, it is the owner's own word.
    tree = drawTab({ config: { calendar: undefined } });
    const before = written(settingsHeld().config);
    openFold(tree, "calendar");
    pickBooksWith(redrawTab(), "hand");
    tree = redrawTab();
    assert.equal(
      textOf(byTestId(tree, "bto-link-note")),
      "Nothing to connect. AI sends your booking link instead of naming open times.",
    );
    assert.equal(byTestId(tree, "bto-link"), null);
    assert.equal(byTestId(tree, "bto-emails"), null);
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[1].config, { ...without(before, "calendar"), bookings: { by_hand: true } });
    const row = byTestId(drawTab({ config: { calendar: undefined, bookings: { by_hand: true } } }), "rec-row-calendar");
    assert.equal(textOf(byTestId(row, "bt-bookings-tool")), "Booked by hand");
  } finally {
    setSurfaceValue("calendar", undefined);
  }
});

test("REGRESSION (the review of 8 Oct 2026): 'I book by hand' over a calendar link that is kept hides its box, says the link goes, and saves without it -- it kept the link, which outranked the word, and the row said 'Calendar link'", () => {
  const sent = saving();
  try {
    setSurfaceValue("calendar", calendarRead(readOk()));
    let tree = drawTab();
    const before = written(settingsHeld().config);
    const kept = before.calendar.ical_url;
    assert.ok(kept, "the workspace keeps a calendar link");
    openFold(tree, "calendar");
    tree = redrawTab();
    const box = () => find(redrawTab(), (n) => n.props?.id === "bt-calendar");
    assert.equal(box().props.value, kept, "a calendar with a link draws it in its box");
    pickBooksWith(tree, "hand");
    tree = redrawTab();
    assert.equal(byTestId(tree, "bto-link"), null, "by hand has no box, even over a link that is kept");
    assert.equal(
      textOf(byTestId(tree, "bto-link-note")),
      "Nothing to connect. AI sends your booking link instead of naming open times. Saving this removes your calendar link.",
    );
    // Another answer before saving: the address is still in its box, so a change of mind loses nothing.
    pickBooksWith(tree, "calendar");
    assert.equal(box().props.value, kept);
    pickBooksWith(redrawTab(), "hand");
    tree = redrawTab();
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[0].config, { ...without(before, "calendar"), bookings: { by_hand: true } });
    // Saved, the row says the owner's own word, and no line of a calendar's read.
    const row = byTestId(drawTab({ config: { calendar: undefined, bookings: { by_hand: true } } }), "rec-row-calendar");
    assert.equal(textOf(byTestId(row, "bt-bookings-tool")), "Booked by hand");
    // A tool that gives no calendar, its box asked for, then "by hand": the press that asked is not carried over.
    openFold(drawTab({ config: { calendar: undefined, bookings: { tool: "booksy" } } }), "calendar");
    tree = redrawTab();
    press(byTestId(tree, "bto-link-anyway"));
    assert.ok(byTestId(redrawTab(), "bto-link"), "asked for, the box is drawn");
    pickBooksWith(redrawTab(), "hand");
    assert.equal(byTestId(redrawTab(), "bto-link"), null);
  } finally {
    setSurfaceValue("calendar", undefined);
  }
});

test("a workspace with no address is given the one its name makes in one press: the route Connections' own form calls, with the business's name; a refusal is said under the press, which is offered again", async () => {
  const nothing = { state: "none", present: false, read_at: null, events: 0 };
  const noAddress = {
    tool: "booksy",
    address: null,
    suggested: "marisas-beauty-salon@mail.example.com",
    last_at: null,
    count: 0,
    held: 0,
    held_list: [],
    forwarding: null,
  };
  // The page's own client makes the request (bridge/api.ts), over a fetch that answers as the route would.
  const asked = [];
  let answer = { status: 409, body: { ok: false, error: { code: "conflict", message: "That address is taken." } } };
  const fetchWas = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    setSurfaceValue("calendar", calendarRead(readOk({ ...nothing, notices: noAddress })));
    openFold(drawTab({ config: { calendar: undefined, bookings: { tool: "booksy" } } }), "calendar");
    const make = () => byTestId(foldOf(redrawTab(), "calendar"), "bto-bookings-make");
    assert.equal(textOf(make()), "Use marisas-beauty-salon@mail.example.com");
    assert.equal(byTestId(foldOf(redrawTab(), "calendar"), "bto-bookings-make-refused"), null);
    await make().props.onClick();
    assert.equal(asked.length, 1, "one request, for one press");
    assert.equal(asked[0].method, "POST");
    assert.match(asked[0].url, /^\/api\/v1\/mailboxes(\?|$)/);
    // The part before the @, and the name customers see beside it: the business's own.
    assert.deepEqual(asked[0].body, { local_part: "marisas-beauty-salon", from_name: "Marisa's Beauty Salon" });
    // Refused (the address is another workspace's): the door's own sentence, under the press, which is still there.
    const open = foldOf(redrawTab(), "calendar");
    assert.equal(textOf(byTestId(open, "bto-bookings-make-refused")), "That address is taken.");
    assert.equal(byTestId(open, "bto-bookings-make-refused").props.role, "alert");
    assert.equal(textOf(make()), "Use marisas-beauty-salon@mail.example.com");
    assert.ok(!make().props.disabled, "and may be pressed again");
    assert.equal(textOf(byTestId(open, "bto-bookings-choose")), "Choose another");
  } finally {
    globalThis.fetch = fetchWas;
    setSurfaceValue("calendar", undefined);
  }
});

test("a calendar that could not be read says so in the Calendar page's words; with no read, the row says nothing of one and asks", () => {
  const was = { calendar: W.__calendar, failed: W.__surfaceFailed };
  try {
    // The last read failed: the pill, the reason as the owner can act on it, and when it was tried.
    setSurfaceValue(
      "calendar",
      calendarRead(
        readOk({
          state: "unavailable",
          read_at: null,
          events: 0,
          reason: "http",
          status: 404,
          problem: "The calendar answered 404: the address no longer points at a calendar.",
        }),
      ),
    );
    let row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-state").props["aria-label"], CALENDAR_FEED_WORDS.unavailable);
    assert.match(textOf(row), /The calendar answered 404: the address no longer points at a calendar\./);
    assert.doesNotMatch(textOf(row), /tried 4m ago/, "when it was tried is in the fold, with the rest of the read");
    assert.doesNotMatch(textOf(row), /\d+ events?/, "no count is claimed of a calendar that was not read");
    // A last good read, shown as that.
    setSurfaceValue(
      "calendar",
      calendarRead(readOk({ stale: true, reason: "unreachable", problem: "The calendar couldn't be reached." })),
    );
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-state").props["aria-label"], CALENDAR_FEED_WORDS.stale);
    assert.match(textOf(row), /The calendar couldn't be reached\./);
    // With no reason given, each state is said in the Calendar page's own words for it, from where that page keeps
    // them: a last good read could not be REFRESHED, which is not the sentence for a calendar that could not be read.
    setSurfaceValue("calendar", calendarRead(readOk({ stale: true, reason: "unreachable", problem: null })));
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-problem"))), CALENDAR_PAGE.words.stale);
    assert.equal(CALENDAR_PAGE.words.stale, "The calendar couldn't be refreshed.");
    setSurfaceValue(
      "calendar",
      calendarRead(readOk({ state: "unavailable", read_at: null, events: 0, reason: null, problem: null })),
    );
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.equal(textOf(find(row, (n) => classes(n).includes("bt-feed-problem"))), CALENDAR_PAGE.words.unavailable);

    // No read in this tab: nothing is invented. The address is still stated.
    setSurfaceValue("calendar", undefined);
    const asked = [];
    W.__calendar = {
      refresh: () => {
        asked.push("refresh");
        return Promise.resolve(true);
      },
    };
    let tree = drawTab();
    row = byTestId(tree, "rec-row-calendar");
    assert.equal(byTestId(row, "rec-calendar-read"), null);
    assert.equal(
      textOf(find(row, (n) => classes(n).includes("rec-row-val"))),
      "app.chanlytics.com",
      "REGRESSION guard: where it reads, and never a read it does not have",
    );
    assert.deepEqual(asked, ["refresh"], "it asks for one as it mounts");
    // And says what that finds when it lands.
    setSurfaceValue("calendar", calendarRead(readOk({ events: 3 })));
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), surfaceValue("calendar").vm.feed.read);
    assert.equal(asked.length, 1, "fresh, it is not asked for again");
    // The surface itself could not be read: said where the line would be, with the one Retry.
    setSurfaceValue("calendar", undefined);
    W.__surfaceFailed = (key) => key === "calendar";
    row = byTestId(drawTab(), "rec-row-calendar");
    assert.match(textOf(byTestId(row, "rec-calendar-unread")), /Couldn't read what it found when it last updated/);
  } finally {
    setSurfaceValue("calendar", undefined);
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
    if (was.failed) W.__surfaceFailed = was.failed;
    else delete W.__surfaceFailed;
  }
});

test("(B1) an address pasted into the fold is read as it lands -- how many appointments and the next, or why not -- and each calendar says where it keeps one", async () => {
  const was = W.__calendar;
  const asked = [];
  let answer = {
    ok: true,
    data: { ok: true, events: 12, next: [{ start: "Tue, Sep 8, 2:00 PM", end: "3:30 PM", title: "Busy" }] },
  };
  W.__calendar = {
    refresh: () => Promise.resolve(true),
    previewFeed: async (url) => {
      asked.push(url);
      return answer;
    },
  };
  setSurfaceValue("calendar", calendarRead(readOk()));
  try {
    let tree = drawTab({ profile: marisa });
    openFold(tree, "calendar");
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-calendar-check"), null, "the address it already reads is not read again");
    // Where each calendar keeps its address, folded until asked for, in each calendar's own names for its screens.
    const guides = byTestId(tree, "rec-calendar-guides");
    assert.equal(guides.type, "details");
    assert.equal(textOf(find(guides, (n) => n.type === "summary")), FEED_CHECK_WORDS.guide);
    assert.deepEqual(all(guides, (n) => n.type === "b").map(textOf), [
      "Google Calendar",
      "Apple Calendar (iCloud)",
      "Outlook",
    ]);
    assert.match(textOf(guides), /Secret address in iCal format/);
    assert.equal(all(guides, (n) => n.type === "li").length, FEED_GUIDES.flatMap((g) => g.steps).length);

    const box = () => find(foldOf(tree, "calendar"), (n) => classes(n).includes("rec-input"));
    // The box takes the address, and the draw after says what its check set going (React draws again on the set).
    const paste = async (value) => {
      box().props.onChange({ target: { value } });
      redrawTab();
      tree = redrawTab();
    };
    // A good address: "Reading it…" at once, then what it holds.
    await paste("https://calendar.google.com/calendar/ical/marisa/private-abc/basic.ics");
    const check = () => byTestId(tree, "rec-calendar-check");
    assert.equal(textOf(check()), FEED_CHECK_WORDS.reading);
    assert.equal(check().props.role, "status");
    assert.deepEqual(asked, [], "not a request per keystroke: it waits for the typing to settle");
    await pastTheCheck();
    tree = redrawTab();
    assert.deepEqual(asked, ["https://calendar.google.com/calendar/ical/marisa/private-abc/basic.ics"]);
    assert.equal(textOf(check()), "Read it: 12 events, the next Tue, Sep 8, 2:00 PM.");

    // A refusal says why, in the preview's own words, as an alert.
    answer = { ok: false, message: "The calendar answered 404: the address no longer points at a calendar." };
    await paste("https://calendar.google.com/calendar/ical/marisa/private-old/basic.ics");
    await pastTheCheck();
    tree = redrawTab();
    assert.equal(check().props.role, "alert");
    assert.equal(textOf(check()), answer.message);

    // A newer paste wins: the one typed over is never asked about.
    answer = { ok: true, data: { ok: true, events: 0, next: [] } };
    asked.length = 0;
    await paste("https://cal.example/first.ics");
    await paste("https://cal.example/second.ics");
    await pastTheCheck();
    tree = redrawTab();
    assert.deepEqual(asked, ["https://cal.example/second.ics"]);
    assert.equal(textOf(check()), FEED_CHECK_WORDS.read(0, null));
    assert.match(textOf(check()), /empty so far/);

    // Half an address is the save's to refuse (in its words, on the box), not the preview's: nothing is asked.
    asked.length = 0;
    await paste("calendar.google.com/basic.ics");
    await pastTheCheck();
    tree = redrawTab();
    assert.equal(check(), null);
    assert.deepEqual(asked, []);
  } finally {
    setSurfaceValue("calendar", undefined);
    if (was) W.__calendar = was;
    else delete W.__calendar;
  }
});

test("(B1) the check's words: one event, many, the next or none this month -- events, never appointments", () => {
  // Every event the feed holds, past ones too: "events", as the fold's last read says it, never "appointments".
  assert.equal(FEED_CHECK_WORDS.read(1, null), "Read it: 1 event, none in the next 30 days.");
  assert.equal(FEED_CHECK_WORDS.read(3, "Fri, Oct 2, 10:00 AM"), "Read it: 3 events, the next Fri, Oct 2, 10:00 AM.");
  for (const g of FEED_GUIDES) assert.ok(g.steps.length >= 2 && g.steps.every((t) => t.endsWith(".")), g.name);
});

test("a calendar with no tool behind it: the fold holds the link's one box, checked under it, and saves only the address", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  setSurfaceValue("calendar", calendarRead(readOk()));
  try {
    let tree = drawTab({ flash, config: { calendar: undefined } });
    const stored = written(settingsHeld().config);
    assert.equal(textOf(byTestId(tree, "rec-row-act-calendar")), "Add one");
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    assert.equal(byTestId(tree, "bto-link"), null, "no box until the owner says what they book with");
    pickBooksWith(tree, "calendar");
    tree = redrawTab(flash);
    const fold = foldOf(tree, "calendar");
    assert.ok(textOf(byTestId(fold, "bto-link")).startsWith("Calendar link So AI can offer open times."));
    assert.match(
      textOf(byTestId(fold, "rec-calendar-note")),
      /^Paste the private address of the calendar your bookings land in\. It is only ever read\. Nothing is booked from here; your booking link does that\.$/,
    );
    assert.equal(byTestId(tree, "rec-calendar-open"), null, "no door to a calendar that is not connected");
    assert.equal(byTestId(tree, "bto-emails"), null, "and no emails' part: there is no tool to send them");
    assert.equal(
      find(fold, (n) => classes(n).includes("rec-says")),
      null,
      "the address is in no draft of the brain: it draws no block",
    );
    linkBox(tree).props.onChange({ target: { value: "calendar.google.com/basic.ics" } });
    tree = redrawTab(flash);
    saveFoldOf(tree, "calendar");
    tree = redrawTab(flash);
    assert.equal(linkBox(tree).props["aria-invalid"], true);
    assert.match(
      textOf(foldOf(tree, "calendar")),
      /The calendar link needs to be a full address, starting with https:\/\/ or webcal:\/\//,
    );
    assert.equal(sent.length, 0);
    linkBox(tree).props.onChange({
      target: { value: "  https://calendar.google.com/calendar/ical/marisa/private-abc/basic.ics  " },
    });
    tree = redrawTab(flash);
    assert.equal(linkBox(tree).props["aria-invalid"], undefined, "typing again takes the sentence away");
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[0].config, {
      ...without(stored, "calendar"),
      calendar: { ical_url: "https://calendar.google.com/calendar/ical/marisa/private-abc/basic.ics" },
    });

    // A link is stored: where to find one is no longer said, that it is only read still is; and an emptied box
    // disconnects it.
    tree = drawTab({ flash });
    const held = written(settingsHeld().config);
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    assert.equal(
      textOf(byTestId(tree, "rec-calendar-note")),
      "It is only ever read. Nothing is booked from here; your booking link does that.",
    );
    linkBox(tree).props.onChange({ target: { value: "" } });
    tree = redrawTab(flash);
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[1].config, without(held, "calendar"));

    // Anyone but the owner is sent the address masked: shown as it arrives, said to be hidden, and an untouched fold
    // sends nothing, so the mask is never saved over the address.
    const masked = { calendar: { ical_url: "https://calendar.google.c…ic.ics" } };
    tree = drawTab({ flash, config: masked });
    assert.equal(
      textOf(find(byTestId(tree, "rec-row-calendar"), (n) => classes(n).includes("bt-feed-where"))),
      "Your calendar",
      "a masked address is no address to take a host out of: the row names what it is instead",
    );
    openFold(tree, "calendar");
    tree = redrawTab(flash);
    assert.match(textOf(byTestId(tree, "rec-calendar-masked")), /Only an owner sees this address whole/);
    saveFoldOf(tree, "calendar");
    tree = redrawTab(flash);
    assert.deepEqual([sent.length, openFolds(tree)], [2, []]);
    // And the tool beside a masked address still saves: the mask goes back as it came (the route puts the stored
    // address in its place), judged by nobody on the way.
    tree = drawTab({ flash, config: masked });
    const kept = written(settingsHeld().config);
    openFold(tree, "calendar");
    pickBooksWith(redrawTab(flash), "square");
    tree = redrawTab(flash);
    saveFoldOf(tree, "calendar");
    assert.deepEqual(sent[2].config, { ...kept, bookings: { tool: "square" } });
  } finally {
    setSurfaceValue("calendar", undefined);
  }
});

test("each act of When you're open is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = W.gate;
  W.gate = (perm, doing) => {
    asked.push([perm, doing]);
    return {};
  };
  W.__workspace = { setTimezone: async () => ({ ok: true, tz: "", message: "" }) };
  try {
    const tree = drawTab();
    const mine = asked.filter(([, doing]) => /hours|timezone|closed|book with/.test(doing));
    assert.deepEqual(mine, [
      ["settings", "change your hours"],
      ["settings", "change the timezone"],
      ["settings", "change the days you are closed"],
      ["settings", "change what you book with"],
    ]);
    const heard = (row) => {
      const act = byTestId(tree, `rec-row-act-${row}`);
      return (
        act.props["aria-label"] ||
        act.props["aria-labelledby"]
          .split(" ")
          .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
          .join(" ")
      );
    };
    assert.deepEqual(["hours", "timezone", "closures", "calendar"].map(heard), [
      "Change your opening hours",
      "Change Timezone",
      "Add one: a day you are closed",
      "Change what you book with",
    ]);
  } finally {
    W.gate = was;
    delete W.__workspace;
  }
});

test("a refusal that is not the fold's to fix is said once in the fold, and never stops a fold that has nothing to write from closing", () => {
  // A stored closure on a date that is not on the calendar: the save's schema refuses the whole brain for it, whichever
  // fold is saving.
  const sent = saving();
  let tree = drawTab({ profile: { ...marisa, closures: [{ date: "2099-02-31", note: "Not a day" }] } });
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "18:00");
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(
    [sent.length, openFolds(tree)],
    [0, []],
    "typed and typed back: nothing to write, so nothing of the record is judged",
  );
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  saveFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, ["hours"]]);
  assert.match(
    textOf(byTestId(tree, "rec-fold-hours-elsewhere")),
    /^Something else in your settings stops this save · /,
    "said where the owner is looking, naming where it is",
  );
  assert.equal(byTestId(tree, "rec-hours-problem-mon"), null, "and under no day, since no day is wrong");
});

test("under Saving…, a press that would add or remove changes nothing and toasts nothing: it refuses the way Save does", () => {
  // The spec review's probe. update refused the change while the save was out, and the body toasted anyway: "Removed the
  // Mon shift at 14:00", with an Undo, of a shift that was still there.
  W.__saveSettings = () => new Promise(() => {});
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const held = (node) => [node.props["aria-disabled"], node.props.disabled];
  const two = {
    ...marisa,
    hours: {
      ...marisa.hours,
      mon: {
        intervals: [
          { open: "09:30", close: "13:00" },
          { open: "14:00", close: "18:00" },
        ],
      },
    },
  };
  let tree = drawTab({ flash, profile: two });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual(
    [held(byTestId(tree, "rec-hours-remove-mon-1")), held(byTestId(tree, "rec-hours-add-tue"))],
    [
      [undefined, undefined],
      [undefined, undefined],
    ],
    "pressable until the week is sent",
  );
  typeAt(tree, "Tuesday closes", "17:00");
  tree = redrawTab(flash);
  // The week's menu is open, with its copies on screen, as Save is pressed.
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu"));
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  // Pressed in the same breath as Save, before the page has drawn again: the press is still live on screen, so it is
  // update that answers, by whether it took the change, and the body says nothing of a change it did not make.
  let before = flashes.length;
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.props?.role === "menuitem" && textOf(n) === "Every day"));
  assert.deepEqual(flashes.slice(before), [], "update took nothing, and said so: no shift removed, no week copied");
  tree = redrawTab(flash);
  assert.ok(labelled(tree, "Monday opens, second shift"));
  assert.equal(
    byTestId(tree, "rec-hours-switch-sun").props["aria-checked"],
    false,
    "Sunday was not opened by a copy that did not happen",
  );
  assert.equal(textOf(byTestId(tree, "rec-fold-save-hours")), "Saving…");
  // Focusable, saying they are not to be pressed, and never `disabled`, which lets go of focus: as Save is.
  assert.deepEqual(
    [held(byTestId(tree, "rec-hours-remove-mon-1")), held(byTestId(tree, "rec-hours-add-tue"))],
    [
      [true, undefined],
      [true, undefined],
    ],
  );
  before = flashes.length;
  press(byTestId(tree, "rec-hours-remove-mon-1"));
  press(byTestId(tree, "rec-hours-add-tue"));
  tree = redrawTab(flash);
  assert.ok(labelled(tree, "Monday opens, second shift"), "the shift is still there");
  assert.equal(labelled(tree, "Tuesday opens, second shift"), null, "and no break was added");
  assert.deepEqual(
    flashes.slice(before).map((f) => textOf({ props: { children: f.msg } })),
    [],
    "nothing was removed, so nothing says it was",
  );

  tree = drawTab({ flash, profile: { ...marisa, closures: [XMAS, NEW_YEAR] } });
  openFold(tree, "closures");
  tree = redrawTab(flash);
  all(byTestId(tree, "rec-closure-1"), (n) => n.type === "input")[2].props.onChange({ target: { value: "New Year" } });
  tree = redrawTab(flash);
  saveFoldOf(tree, "closures");
  before = flashes.length;
  press(byTestId(tree, "rec-closure-remove-0"));
  assert.deepEqual(flashes.slice(before), [], "the same, of a closed day removed in the same breath as Save");
  tree = redrawTab(flash);
  assert.deepEqual(
    [held(byTestId(tree, "rec-closure-remove-0")), held(byTestId(tree, "rec-closures-add"))],
    [
      [true, undefined],
      [true, undefined],
    ],
  );
  before = flashes.length;
  press(byTestId(tree, "rec-closure-remove-0"));
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab(flash);
  assert.equal(
    all(foldOf(tree, "closures"), (n) => /^rec-closure-\d+$/.test(n.props?.["data-testid"] || "")).length,
    2,
    "both closed days are still there, and no third",
  );
  assert.deepEqual(flashes.slice(before), [], "and nothing toasts a removal that did not happen");
});

test("Cancel, another row and the rail ask before throwing away anything typed, whether or not the save would have written it", () => {
  // The spec review's probe. "Holds changes" was judged by what the save would write, so a shift typed half-way, a
  // closed day's note with no date yet, or a day switched on with no times read as nothing: Cancel closed at once and
  // the input was gone without a question. The form this replaces counted any change. What Save SENDS is still judged
  // by what it would write.
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab();
  typeAt(tree, "Sunday opens", "10:00");
  tree = redrawTab();
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"], "not thrown away");
  assert.match(textOf(byTestId(tree, "rec-fold-hours-cancel-confirm")), /Discard changes\?/);
  press(byTestId(tree, "rec-fold-hours-cancel-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Sunday opens").props.value, "10:00", "keep editing keeps it");
  // Another row's act, and the rail, the same.
  assert.equal(W.__settingsUnsaved(), true);
  openFold(tree, "website");
  tree = redrawTab();
  assert.deepEqual(
    [openFolds(tree), openRows(tree), !!byTestId(tree, "rec-fold-hours-ask-confirm")],
    [["hours"], [], true],
  );
  press(byTestId(tree, "rec-fold-hours-ask-no"));
  tree = redrawTab();
  // Switched off again, the day keeps the time picked (a switch never drops times), which is not how it opened.
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "a closed day keeps the time picked, which is not how it opened");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  press(byTestId(tree, "rec-fold-hours-cancel-yes"));
  tree = redrawTab();
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "18:00");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), false, "typed and typed back is the week it opened with");
  cancelFoldOf(tree, "hours");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), []);

  // A closed day's note with no date yet: a row the save would drop, and words somebody typed.
  openFold(tree, "closures");
  tree = redrawTab();
  press(byTestId(tree, "rec-closures-add"));
  tree = redrawTab();
  all(byTestId(tree, "rec-closure-0"), (n) => n.type === "input")[2].props.onChange({
    target: { value: "Staff training" },
  });
  tree = redrawTab();
  cancelFoldOf(tree, "closures");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!byTestId(tree, "rec-fold-closures-cancel-confirm")], [["closures"], true]);
  press(byTestId(tree, "rec-fold-closures-cancel-no"));
  tree = redrawTab();
  // And Save still sends nothing of it, and closes: nothing it holds is anything to write.
  saveFoldOf(tree, "closures");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []]);
});

test("a day switched on with no times is said under its day, and the week is not closed as if it had been saved", () => {
  // The save writes a day with no times as closed, so the week "changed nothing", and the fold closed without a word
  // with the owner's Sunday gone.
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-hours-switch-sun"));
  tree = redrawTab(flash);
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.deepEqual([sent.length, flashes.length, openFolds(tree)], [0, 0, ["hours"]]);
  assert.equal(
    textOf(byTestId(tree, "rec-hours-problem-sun")),
    "Sunday is switched on with no times. Give it an opening and a closing time, or switch it off.",
  );
  assert.equal(labelled(tree, "Sunday opens").props["aria-invalid"], true, "on the boxes it is about");
  assert.equal(byTestId(tree, "rec-fold-says-hours"), null, "and nothing is told to AI of a week the page refuses");
  // Either answer takes the sentence away: its times, or the switch.
  typeAt(tree, "Sunday opens", "10:00");
  tree = redrawTab(flash);
  typeAt(tree, "Sunday closes", "14:00");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-hours-problem-sun"), null);
  saveFoldOf(tree, "hours");
  assert.deepEqual(
    sent.map((s) => s.config.brain.profile.hours.sun),
    [{ open: "10:00", close: "14:00" }],
  );
});

test("an idle page stops stating a read when the Calendar page would have read again: one timer, at the read's own age", () => {
  // The spec review's probe: `fresh` was worked out as the row drew and nothing looked again, so a page left open said
  // "read 4m ago" for forty minutes.
  const was = { calendar: W.__calendar };
  const time = clock();
  const asked = [];
  W.__calendar = {
    refresh: () => {
      asked.push("refresh");
      return new Promise(() => {});
    },
  };
  try {
    const keeps = CALENDAR_PAGE.refreshMs;
    assert.equal(keeps, 5 * 60 * 1000, "the Calendar page's own window, never a second number");
    setSurfaceValue("calendar", calendarRead(readOk(), 60000));
    // A toast's own timer is not the row's, and does not count against ONE.
    globalThis.setTimeout(() => {}, 4000);
    let tree = drawTab();
    assert.equal(
      byTestId(tree, "rec-calendar-read").props["data-reading"],
      undefined,
      "a minute old: stated as it stands",
    );
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps - 60000],
      "ONE timer, for the moment this read stops being fresh",
    );
    assert.equal(time.timers.length, 2, "the toast's is recorded, and left out of the count");
    assert.equal(asked.length, 0);
    // Drawn again for any reason, it schedules no second one.
    tree = redrawTab();
    tree = redrawTab();
    assert.equal(time.live().length, 1);

    // Forty minutes pass with nothing pressed. The timer is what draws the row again.
    time.pass(40 * 60000);
    tree = redrawTab();
    assert.equal(asked.length, 1, "it asks for a new read");
    assert.equal(
      byTestId(tree, "rec-calendar-read").props["data-reading"],
      "true",
      "and no longer states the old one as it stands",
    );
    assert.equal(time.live().length, 0, "nothing is scheduled for a read that is not fresh");

    // The new read lands: stated, and the next timer is for ITS age.
    setSurfaceValue("calendar", { ...calendarRead(readOk({ events: 3 })), fetchedAt: Date.now() });
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.deepEqual(
      [
        byTestId(tree, "rec-calendar-read").props["data-reading"],
        textOf(byTestId(tree, "rec-calendar-read")) === surfaceValue("calendar").vm.feed.read,
      ],
      [undefined, true],
    );
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps],
    );
    // The page goes: its timer goes with it.
    unmount();
    assert.equal(time.live().length, 0, "cleared as the row unmounts");

    // The quality review's probe. The timer fires a millisecond before the wall clock says the read is stale. Asked of
    // the clock again, the row read "still fresh", its effect's inputs had not moved, so no second timer was set and
    // nothing ever looked again: the very page the timer was added for. The timer decides: the read it was set for has
    // expired, whatever the clock says.
    setSurfaceValue("calendar", { ...calendarRead(readOk()), fetchedAt: Date.now() });
    tree = drawTab();
    assert.deepEqual(
      time.live().map((t) => t.ms),
      [keeps],
    );
    const before = asked.length;
    time.early(keeps - 1);
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-calendar-read").props["data-reading"], "true", "no longer stated as it stands");
    assert.equal(asked.length, before + 1, "and a new read is asked for");
    // A newer read is judged afresh: the expiry was that read's, not the row's.
    setSurfaceValue("calendar", { ...calendarRead(readOk({ events: 7 })), fetchedAt: Date.now() });
    W.dispatchEvent({ type: "surface:calendar" });
    tree = redrawTab();
    assert.deepEqual(
      [byTestId(tree, "rec-calendar-read").props["data-reading"], time.live().map((t) => t.ms)],
      [undefined, [keeps]],
    );
  } finally {
    time.restore();
    setSurfaceValue("calendar", undefined);
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
  }
});

test("while a new read is on its way the last one stays where it is, dimmed; it does not vanish and move the rows under it", async () => {
  const was = { calendar: W.__calendar };
  let land = null;
  W.__calendar = {
    refresh: () =>
      new Promise((resolve) => {
        land = resolve;
      }),
  };
  try {
    setSurfaceValue("calendar", calendarRead(readOk(), 30 * 60000));
    let tree = drawTab();
    const read = byTestId(tree, "rec-calendar-read");
    assert.ok(read, "the last read is still drawn");
    assert.deepEqual(
      [read.props["data-reading"], read.props["aria-busy"]],
      ["true", true],
      "dimmed (spec 9: a read in flight dims the last value), and said to be busy",
    );
    assert.match(textOf(read), /read 4m ago/, "the same words, not a skeleton and not a gap");
    assert.equal(byTestId(tree, "rec-calendar-unread"), null);
    // Landed, it is stated plainly.
    setSurfaceValue("calendar", calendarRead(readOk({ events: 9 })));
    W.dispatchEvent({ type: "surface:calendar" });
    land(true);
    await settle();
    tree = redrawTab();
    assert.deepEqual(
      [
        byTestId(tree, "rec-calendar-read").props["data-reading"],
        byTestId(tree, "rec-calendar-read").props["aria-busy"],
      ],
      [undefined, undefined],
    );
    assert.equal(textOf(byTestId(tree, "rec-calendar-read")), surfaceValue("calendar").vm.feed.read);

    // No read is asked for from a tab nobody is looking at, as the Calendar page's own timer holds off; back in view,
    // the row looks again and asks.
    const asked = [];
    W.__calendar = {
      refresh: () => {
        asked.push("refresh");
        return new Promise(() => {});
      },
    };
    setSurfaceValue("calendar", calendarRead(readOk(), 30 * 60000));
    globalThis.document.visibilityState = "hidden";
    tree = drawTab();
    assert.equal(asked.length, 0);
    globalThis.document.visibilityState = "visible";
    tree = redrawTab();
    assert.equal(asked.length, 1);
  } finally {
    delete globalThis.document.visibilityState;
    setSurfaceValue("calendar", undefined);
    if (was.calendar) W.__calendar = was.calendar;
    else delete W.__calendar;
  }
});
