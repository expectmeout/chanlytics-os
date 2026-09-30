/**
 * What Glass puts above the Inbox (surfaces/inbox/pages/inbox-head.tsx and the kit's look/look.tsx, the plan's step 5.4):
 * the sentence that says where the Inbox stands, said from the same rules as the sidebar's badge; the date in the
 * business's zone; and the look's one door: what only Glass draws is drawn in Glass and is nothing in Classic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, installLegacyReact } from "../_legacy-react.mjs";

installLegacyReact({ __surfaceState: () => "live", __DEMO_MODE: false });
const { inboxDateline, inboxStanding } =
  await import("../../../../apps/dashboard/src/surfaces/inbox/pages/inbox-head.tsx");
const { Glass, useLook } = await import("../../../../apps/dashboard/src/surfaces/kit/look/look.tsx");
const { PageHead } = await import("../../../../apps/dashboard/src/surfaces/kit/head/page-head.tsx");

// Friday 2 October 2026, 4:02 PM in New York (20:02 UTC).
const NOW = Date.UTC(2026, 9, 2, 20, 2, 0);
const ZONE = "America/New_York";
const MIN = 60_000;
/** A real thread nobody has taken, which has been waiting `waitingMin` minutes. */
const waiting = (id, waitingMin) => ({ id, real: true, state: "escalated", needsYou: true, waitingMin });
/** A real thread whose reply counts down to auto-send for another 42 seconds. */
const sending = (id) => ({
  id,
  real: true,
  state: "escalated",
  needsYou: false,
  veto: { messageId: `m-${id}`, endsAtMs: NOW + 42_000 },
});
const handled = (id) => ({ id, real: true, state: "done", needsYou: false });

test("the dateline is the day and the time in the business's zone, not the machine's", () => {
  assert.equal(inboxDateline(NOW, ZONE), "Friday, October 2 · 4:02 PM");
  assert.equal(inboxDateline(NOW, "Asia/Tokyo"), "Saturday, October 3 · 5:02 AM");
});

test("the standing sentence counts what waits on you and names the oldest's hour", () => {
  const threads = [waiting("a", 96), waiting("b", 42), waiting("c", 18), waiting("d", 5), handled("e")];
  assert.equal(inboxStanding(threads, NOW, ZONE), "4 need you · the oldest since 2:26 PM");
  assert.equal(
    new Date(NOW - 96 * MIN).getUTCHours(),
    18,
    "96 minutes before 20:02 UTC is 18:26 UTC, 2:26 PM in New York",
  );
});

test("a draft counting down waits on you, and the sentence says it is on its way in place of the oldest", () => {
  const threads = [waiting("a", 96), waiting("b", 42), sending("c"), handled("e")];
  assert.equal(inboxStanding(threads, NOW, ZONE), "3 need you · 1 draft on its way");
  assert.equal(inboxStanding([sending("c"), sending("d")], NOW, ZONE), "2 need you · 2 drafts on its way");
});

test("nothing waiting is said plainly, and a thread with no wait yet says no hour", () => {
  assert.equal(inboxStanding([handled("e")], NOW, ZONE), "Nothing needs you");
  assert.equal(inboxStanding([], NOW, ZONE), "Nothing needs you");
  assert.equal(inboxStanding([waiting("a", 0)], NOW, ZONE), "1 need you");
});

/** The page's own draw of the head, on the stub: what it puts on the page for a look. */
function drawLook(look, child) {
  fresh();
  globalThis.document = {
    documentElement: { getAttribute: (name) => (name === "data-look" ? look : null) },
  };
  return Glass({ children: child });
}

test("what only Glass draws is nothing in Classic, and its children in Glass", () => {
  const child = { type: "p", props: {} };
  assert.equal(drawLook("classic", child), null);
  assert.equal(drawLook(null, child), null, "a document with no look stamped is Classic");
  assert.equal(drawLook("glass", child), child);
  delete globalThis.document;
  fresh();
  assert.equal(useLook(), "classic", "with no document (a server), Classic");
});

test("the page head is its date, its name as the page's heading and its sentence, and only what it has", () => {
  const full = PageHead({ dateline: "Friday, October 2 · 4:02 PM", title: "Inbox", sentence: "4 need you" });
  assert.equal(full.type, "header");
  assert.equal(full.props.className, "pg-head");
  const [dateline, line] = full.props.children;
  assert.equal(dateline.props.className, "pg-dateline");
  const [title, sentence] = line.props.children;
  assert.equal(title.type, "h1");
  assert.deepEqual([title.props.children].flat(), ["Inbox"]);
  assert.equal(sentence.props.className, "pg-sentence");
  const bare = PageHead({ title: "Inbox" });
  const [noDate, bareLine] = bare.props.children;
  assert.equal(noDate, null);
  assert.equal(bareLine.props.children[1], null);
});
