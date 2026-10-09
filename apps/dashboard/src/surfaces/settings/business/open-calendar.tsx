// Chanlytics — Settings › Business: When you're open, the calendar link.
//
// The calendar link's last read, as the Booking tool row states it (BtoFeedRead), and its box in that row's fold
// (BtoFeedBox, drawn by open-bookings.tsx BtoLinkPart). The card draws the row (open.tsx BtOpenCard); what the fold
// opens with, refuses and writes is folds.ts's.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { CalendarVM } from "@chanlytics/contracts";
import type { CALENDAR_PAGE } from "../../calendar/words";
import { FailedRead } from "../../kit/empty/empty";
import { RecordBox } from "../../kit/record/field";
import { navigate } from "../../legacy-verbs";
import { businessTabSave } from "./saver";
import { calendarApi, calendarNow, calendarPage, chromeWords, surfaceFailedFn } from "./shell";

/* ------------------------------------ the calendar it reads ------------------------------------ */

/**
 * WHERE it reads, as the row states it: the host, and nothing after it.
 *
 * A private feed's address is a long secret (…/ical/<account>/private-<key>/basic.ics), the row is read over a
 * shoulder, and the path is not a thing anybody checks at a glance -- "app.chanlytics.com" answers "which calendar is
 * this?" and the whole of it waits in the box that edits it. An address this cannot parse (a non-owner's arrives
 * masked by the server, which is no address to take apart) is named for what it is instead.
 */
export const btoFeedHost = (url: string) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.replace(/^webcal:/i, "https:")).host || "Your calendar";
  } catch {
    return "Your calendar";
  }
};

/** Whether the read this row asked for is out, whether it failed, whether the row is still on the page to hear its answer, and the read (by when it was fetched) whose timer has fired. */
interface Flight {
  out: boolean;
  failed: boolean;
  gone: boolean;
  expired: number | null;
}

/**
 * The calendar row's hold on the last read: the hooks BtoFeedRead is made of, in the order they were drawn in (state,
 * ref, the page's listeners, the timer that says when the read stops being fresh, the ask for a new one), and the
 * values the row's words are worked out of.
 */
const useBtoFeedRead = (stored: boolean) => {
  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const flight = useRef<Flight>({ out: false, failed: false, gone: false, expired: null });
  useEffect(() => {
    // The one record the row keeps for its life: its fields are what change.
    const mine = flight.current;
    mine.gone = false;
    window.addEventListener("surface:calendar", bump);
    // Back in view, the row looks again: a read that went stale in a tab nobody was looking at is asked for then.
    document.addEventListener("visibilitychange", bump);
    return () => {
      mine.gone = true;
      window.removeEventListener("surface:calendar", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);
  const keeps: Partial<typeof CALENDAR_PAGE> = calendarPage() || {};
  const C = calendarNow() || null;
  const at = C && typeof C.fetchedAt === "number" ? C.fetchedAt : null;
  const fresh =
    at != null &&
    flight.current.expired !== at &&
    typeof keeps.refreshMs === "number" &&
    Date.now() - at < keeps.refreshMs;
  const api = calendarApi();
  const canAsk = !!(api && typeof api.refresh === "function");
  const visible = document.visibilityState !== "hidden";
  // The saver says when the server last took the calendar fold's save in this tab: a read from before it is the old
  // calendar's.
  const saver = businessTabSave.saver;
  const savedAt = saver && saver.takenAt ? saver.takenAt("calendar") : null;
  const before = at != null && savedAt != null && at <= savedAt;
  const ask = () => {
    flight.current.out = true;
    const settled = (landed: boolean) => {
      if (flight.current.gone) return;
      flight.current.out = false;
      flight.current.failed = !landed;
      bump();
    };
    let sent: Promise<boolean>;
    try {
      const cal = calendarApi();
      if (!cal) throw new TypeError("There is no calendar to read.");
      sent = cal.refresh();
    } catch (e) {
      sent = Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    void Promise.resolve(sent).then(
      (landed) => settled(landed !== false),
      () => settled(false),
    );
    bump();
  };
  useEffect(() => {
    const ms = keeps.refreshMs;
    if (!stored || !fresh || at == null || ms === undefined) return undefined;
    // Named, so a test that holds the clock can tell this timer from a toast's.
    const btoReadExpires = () => {
      flight.current.expired = at;
      bump();
    };
    const timer = window.setTimeout(btoReadExpires, at + ms - Date.now());
    return () => window.clearTimeout(timer);
  }, [stored, at, keeps.refreshMs]);
  useEffect(() => {
    if (stored && !fresh && !before && canAsk && visible) ask();
  }, [stored, fresh, before, canAsk, visible]);
  return { flight, keeps, C, fresh, canAsk, before, ask };
};

type CalendarFeed = CalendarVM["feed"];

/**
 * One mark for whether the last read worked, and one phrase for when it was. The mark carries the Calendar page's
 * own words (contracts CALENDAR_FEED_WORDS through the chrome bridge, as its pill does) in its accessible name and
 * under a pointer: a coloured pill of four words on a row that already states a fact is two facts, and on a phone it
 * took a line. Where it read from and how many events it found are in the fold (BtoFeedBox) -- EXCEPT for a reader
 * who has no fold: a viewer is offered no act on any row, so the fold is not a place to keep anything from them, and
 * `whole` puts the Calendar page's own line on the row instead. It is still this component's read, with its
 * freshness and its failures, so a viewer is never shown a stale one as if it were the latest.
 */
const btoFeedLine = (
  feed: CalendarFeed,
  whole: boolean,
  fresh: boolean,
  words: Partial<typeof CALENDAR_PAGE.words>,
): ReactNode => {
  const chrome = chromeWords();
  const state = chrome && chrome.state ? chrome.state("calendar", feed.health) : { tone: "plain", label: feed.health };
  const said = whole ? feed.detail : feed.read;
  return (
    <span
      className="bt-feed"
      data-testid="rec-calendar-read"
      data-state={feed.health}
      data-reading={fresh ? undefined : "true"}
      aria-busy={fresh ? undefined : true}
    >
      <span
        className="bt-feed-dot"
        role="img"
        aria-label={state.label}
        data-tip={state.label}
        data-tone={state.tone}
        data-testid="rec-calendar-state"
      />
      {said ? <span className="bt-feed-when">{said}</span> : null}
      {feed.state !== "ok" || feed.stale ? (
        <span className="bt-feed-problem">
          {feed.problem || (feed.stale ? words.stale : words.unavailable) || null}
        </span>
      ) : null}
    </span>
  );
};

/**
 * What the calendar's last read found, in the words the Calendar page says it in: the same pill (contracts
 * CALENDAR_FEED_WORDS, through StatePill's `calendar` kind) and the same line (toCalendarVM's feed.detail: where it was
 * read from, when, how many events; feed.problem when it could not be, or that page's own words where the read gives no
 * reason, calendarPage().words). The form had a "Check the address" button for this; a row that can say it needs
 * no button (spec §4.3).
 *
 * Only a read this tab HAS is stated, and only while it is fresh. The Calendar surface is read as the app boots on
 * every route, so it is here; but its "read 4m ago" is counted from the moment IT was read (contracts toCalendarVM),
 * so on a tab open since the morning the words would be the morning's. Fresh is as long as the Calendar page itself
 * keeps a read before it reads again (its CR_REFRESH_MS, calendarPage().refreshMs: one number, that page's).
 *   fresh                 stated as it stands, and ONE timer is set for the moment it stops being fresh, which draws
 *                         the row again: worked out only as the row drew, an idle page said "read 4m ago" for forty
 *                         minutes. The timer DECIDES: as it fires it records that the read it was set for has expired,
 *                         and an expired read is not fresh whatever the clock says. A timer runs on the monotonic
 *                         clock and Date.now() on the wall clock, so one that fired a moment early met a row that
 *                         still read fresh, whose effect's inputs had not moved: no second timer, and the same bug;
 *   not fresh             a new read is asked for (calendarApi().refresh: the route's few minutes' cache, never the
 *                         calendar itself; not from a tab nobody is looking at, as that page's own timer holds off),
 *                         and while it is on its way the last read stays where it is, dimmed (spec §9: a read in
 *                         flight dims the last value): it does not vanish and move the rows under it;
 *   that read failed      said where the read would be (spec §3), with a Retry, by the refresh's own answer or the
 *                         runner's (surfaceFailedFn): the old read is never stated as if it were the latest.
 *                         Retry keeps the block, busy, until its read answers: it flipped to the dimmed line and back;
 *   no way to ask         nothing is said of a read that is not fresh (the standalone mockup has no bridge to ask).
 * A read from before the calendar's address was saved is said nothing of, until the read after the save lands: the
 * saver says when it took the calendar fold's save (takenAt), and a read fetched before that moment is the old
 * calendar's, whatever it found. The save reads the calendar again (refresh-map.ts), so nothing is asked for it here.
 * The surface carries no address to hold a read against (the address never leaves the server), so the moment of the
 * save is the one thing the row can know it by. A read that says no calendar is connected is said nothing of either.
 * And a re-read after the save that FAILED is said, as a failed read is, with its Retry: the read still in the window
 * is the old calendar's, so waiting for a newer one to land waited for good.
 */
export const BtoFeedRead = ({ stored, whole = false }: { stored: boolean; whole?: boolean }) => {
  const s = useBtoFeedRead(stored);
  if (!stored) return null;
  const failedFn = surfaceFailedFn();
  const surfaceFailed = !!(failedFn && failedFn("calendar"));
  // From before the address was saved: nothing of it is stated, and the save's own re-read is on its way. Unless that
  // re-read failed, which is said where the read would be, as any failed read is: asked first, a failed re-read left the
  // row blank for good, since the read in the window stays the old calendar's and `before` never stops being true.
  if (s.before && !surfaceFailed) return null;
  const failed = s.before || (!s.fresh && (s.flight.current.failed || surfaceFailed));
  if (failed) {
    return (
      <FailedRead
        kind="line"
        what="what its last read found"
        onRetry={s.canAsk ? s.ask : null}
        busy={s.flight.current.out}
        surface="calendar"
        testid="rec-calendar-unread"
      />
    );
  }
  // Not fresh, and no way to ask for a new one: nothing is said of it.
  if (!s.fresh && !s.canAsk) return null;
  const feed = s.C && s.C.vm ? s.C.vm.feed : null;
  if (!feed || feed.state === "none") return null;
  return btoFeedLine(feed, whole, s.fresh, s.keeps.words || {});
};

/**
 * The whole of what the last read found, for the fold: where it read from, when, and how many events it took
 * (contracts toCalendarVM's feed.detail, the Calendar page's own line). Hookless, and drawn from the read the row is
 * already keeping fresh: a fold is only open while somebody is looking at it.
 */
const BtoFeedWhole = () => {
  const C = calendarNow() || null;
  const feed = C && C.vm ? C.vm.feed : null;
  if (!feed || feed.state === "none" || !feed.detail) return null;
  return (
    <p className="bt-fold-note bt-fold-line" data-testid="rec-calendar-whole">
      <span>{feed.detail}</span>
      <button type="button" className="bt-link" onClick={() => navigate("calendar")} data-testid="rec-calendar-open">
        Open Calendar
      </button>
    </p>
  );
};

/** What a pasted address's check has found so far. */
type FeedCheck =
  { state: "reading" } | { state: "read"; events: number; next: string | null } | { state: "refused"; words: string };

/**
 * A pasted address, read as it is pasted (the preview route: reached, read as iCal, its appointments counted), so a
 * wrong one is caught here and not weeks later as a receptionist that never names an open time. Only an address the
 * rule allows (feedUrlOk), not the one stored, and not a masked one; a moment after the last keystroke, and a newer
 * paste wins. Hookless of its own: the box's hooks hold it.
 */
const BtoFeedCheck = ({ check }: { check: FeedCheck | null }) => {
  if (!check) return null;
  const W = BUSINESS_TAB.FEED_CHECK_WORDS;
  if (!W) return null;
  if (check.state === "reading")
    return (
      <p className="bt-fold-note" role="status" data-testid="rec-calendar-check">
        {W.reading}
      </p>
    );
  if (check.state === "read")
    return (
      <p className="bt-fold-note" role="status" data-testid="rec-calendar-check">
        {W.read(check.events, check.next)}
      </p>
    );
  return (
    <p className="bt-fold-note bt-fold-refused" role="alert" data-testid="rec-calendar-check">
      {check.words}
    </p>
  );
};

/** Where each calendar keeps the address (contracts FEED_GUIDES), folded until asked for. */
const BtoFeedGuides = () => {
  const tab = BUSINESS_TAB;
  if (!tab.FEED_GUIDES || !tab.FEED_CHECK_WORDS) return null;
  return (
    <details className="bt-feed-guides" data-testid="rec-calendar-guides">
      <summary className="bt-link">{tab.FEED_CHECK_WORDS.guide}</summary>
      {tab.FEED_GUIDES.map((g) => (
        <div key={g.name} className="bt-feed-guide">
          <b>{g.name}</b>
          <ol>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ))}
    </details>
  );
};

/** How long after the last keystroke a pasted address is read: a paste lands at once, typing settles. */
const BTO_FEED_CHECK_MS = 600;

/** Whether a pasted address is one to read: not empty, not the one stored, not a masked one, and one the rule allows, with a calendar to ask. */
const btoFeedReadable = (url: string, stored: string) => {
  const tab = BUSINESS_TAB;
  const cal = calendarApi();
  return !(
    !url ||
    url === stored ||
    url.includes("…") ||
    !tab.feedUrlOk ||
    !tab.feedUrlOk(url) ||
    !cal ||
    !cal.previewFeed
  );
};

/** What the box says about the address typed into it, a moment after the last keystroke. */
const useBtoFeedCheck = (url: string, stored: string) => {
  const [check, setCheck] = useState<FeedCheck | null>(null);
  useEffect(() => {
    const cal = calendarApi();
    if (!cal || !btoFeedReadable(url, String(stored || ""))) {
      setCheck(null);
      return undefined;
    }
    let live = true;
    setCheck({ state: "reading" });
    const read = async () => {
      const r = await cal.previewFeed(url);
      if (!live) return;
      setCheck(
        r && r.ok && r.data
          ? { state: "read", events: r.data.events, next: r.data.next && r.data.next[0] ? r.data.next[0].start : null }
          : { state: "refused", words: (r && "message" in r && r.message) || "" },
      );
    };
    const t = setTimeout(() => {
      void read();
    }, BTO_FEED_CHECK_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [url]);
  return check;
};

/** What the box is drawn from: the address typed, how to change it, and what the fold knows beside it. */
interface FeedBoxProps {
  url: string;
  onUrl: (url: string) => void;
  problem: string | null;
  readOnly: boolean;
  /** The address as stored (masked for anyone but an owner), "" for none. */
  stored: string;
  /** Whether the receptionist has a booking link to send. */
  offers: boolean;
  /** Where to find the link for what the owner books with, in one sentence (contracts calendarLinkNote). */
  note: string;
}

/**
 * The calendar link's box, in the Booking tool fold (open-bookings.tsx BtoLinkPart): what the last read found, the box,
 * a check of what is pasted into it, where to find the link for what the owner books with, and that it is only ever
 * read. It stood in a fold of its own, under four sentences, one of which sent the owner to the row below.
 */
export const BtoFeedBox = ({ url, onUrl, problem, readOnly, stored, offers, note }: FeedBoxProps) => {
  const check = useBtoFeedCheck(String(url || "").trim(), stored);
  return (
    <>
      {/* The part's head names it on screen (open-bookings.tsx BtoLinkPart): the box carries the same name, heard. */}
      <RecordBox
        id="bt-calendar"
        label="Calendar link"
        value={url}
        onChange={onUrl}
        problem={problem}
        placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        readOnly={readOnly}
      />
      <BtoFeedCheck check={check} />
      {stored ? <BtoFeedWhole /> : null}
      {/* Where to find it, until there is one; and, always, that it is read and never written. */}
      <p className="bt-fold-note" data-testid="rec-calendar-note">
        {stored ? "" : `${note} `}It is only ever read. Nothing is booked from here;{" "}
        {offers ? "your booking link does that." : "your team does that, from the details it takes."}
      </p>
      {readOnly ? null : <BtoFeedGuides />}
      {/* Only an owner is sent the address whole (the settings route masks it for everyone else), and a masked address
          edited in part would be saved as written. */}
      {String(stored || "").includes("…") ? (
        <p className="bt-fold-note" data-testid="rec-calendar-masked">
          Only an owner sees this address whole. Leave it as it is to keep it, or paste a new one over it.
        </p>
      ) : null}
    </>
  );
};
