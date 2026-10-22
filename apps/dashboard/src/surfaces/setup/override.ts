/**
 * Setup's surface as the frame registers it: what it reads and hears, its mirror for the pages that have not moved, and
 * the first run's landing rule, here; the read, the verbs and the forwarding card's words in surface.ts, fetched as the
 * surface is first read (code-once.ts), at once where a page that draws it is the one opened (legacy-bridge/surfaces/code.ts). Every page
 * hears Setup (Today's card is Setup's), and its whole making was in every page's first load (the loadability review,
 * 19 Oct 2026).
 */
import { FIRST_RUN_LANDED_KEY, FIRST_RUN_ROUTE, shouldLandOnFirstRun } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { surfaceCode } from "@/legacy-bridge/surfaces/code";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { goToRoute, routeOnScreen } from "@/legacy-bridge/workspace";
import { declareSurfaceValue, surfaceValue } from "../surface-values";

declareSurfaceValue("setup", "__SETUP");

/** Setup's read and verbs: fetched once, shared (legacy-bridge/surfaces/code.ts). */
const setupCode = surfaceCode("setup", () => import("./surface"));

/** How long after the last change Setup is read again, and the longest after the first. */
const SETUP_QUIET_MS = 2_000;
const SETUP_LONGEST_WAIT_MS = 10_000;

/**
 * Whether a message or a thread may be the first WhatsApp message Setup is waiting for: the number connected and on, and none
 * answered yet (its `lastInboundAt`). Closed while Setup is unread, and for good once one has arrived: every other message is
 * nothing Setup states, so a busy workspace never reads it for one (the wiring's second audit, W-thread-wait-step-3).
 */
function awaitsFirstMessage(): boolean {
  const w = surfaceValue("setup")?.dto?.channels?.whatsapp;
  return !!w && w.present && w.active && !w.lastInboundAt;
}

export const setupOverride: SurfaceOverride = {
  key: "setup",
  value: "setup",
  events: ["surface:setup"],
  // Every row this page derives from: a line's saga steps; a channel connected or
  // switched off; the owner's activations; the business record the carriers read;
  // Stripe's answer; the Google profile.
  // Each is published by the database (00057, 00066, 00108, 00075, 00073,
  // 00070, 00117), so a change in another tab, or by a webhook, repaints here.
  // A call reaching the receptionist makes Try it's row ready (the first run's third step and Today's card): read
  // again when a call ends, until one has reached it, and never for each turn of a call or what follows its end.
  // A sending domain added, checked, verified or held by the ten-minute clock: Connections' Email row (00175). The Google
  // row's listing too: its name, rating and count of reviews, which the daily read and the hourly sync write
  // (W-review-facts-rules-4). And the team step's seats and invitations: a teammate invited or joining in another tab (S3-6,
  // W-channel-team-plus-2).
  // These are a few a day, and Today's card is Setup's: heard on every page (`always`).
  //
  // The rest of what its rows state is heard where they are drawn, Start and Today's card (and Connections' calendar row), and
  // read once as one of them comes back (surface-registry.ts PAGE_HEARS; the wiring's second audit, S4-3):
  // the templates' verdicts ("Add the starters", W-campaign-run-template-reachout-5), the settings and the rules, a visit
  // read from the calendar, a person's answer and their deals (who can receive an offer: offers_email_reach; a person made is no
  // answer), the first WhatsApp message (awaitsFirstMessage, W-thread-wait-step-3), and a sequence turned on or off: Today's
  // card stops offering the day-before reminder once one runs (SetupDto.reminders, its sequence_steps).
  ...declareReads("setup", {
    reads: [
      "channel",
      "billing",
      "review",
      "call",
      "team",
      "template",
      "facts",
      "rules",
      "visit",
      "person",
      "deal",
      "conversation",
      "campaign",
    ],
    fresh: "its-page",
    always: ["channel", "billing", "review", "call", "team"],
    // The mailbox is heard (the wiring's second audit, W-channel-team-plus-3): the Email row draws it, made, its address, its
    // intake's error and the first yes it can offer (offersByEmailOf reads its pause).
    omit: [
      {
        tables: ["google_reviews"],
        why: "the Google row says the listing's count of reviews, which the listing carries; a review seen is no row of its",
      },
    ],
    when: (c) => {
      if (c.table === "calls")
        return (
          c.event === "UPDATE" &&
          c.row.status === "ended" &&
          !surfaceValue("setup")?.dto?.channels?.voice?.lastInboundAt
        );
      if (c.table === "messages" || c.table === "conversations") return c.event === "INSERT" && awaitsFirstMessage();
      return c.table !== "contacts" || c.event !== "INSERT";
    },
  }),
  // Its read is the whole workspace's: a burst (a first campaign's messages while the first reply is awaited, an import's
  // people) is read once it has quietened, and at least every ten seconds while it lasts.
  debounceMs: SETUP_QUIET_MS,
  maxWaitMs: SETUP_LONGEST_WAIT_MS,
  apply: async () => (await setupCode()).applySetup(),
};

/** The landing rule: an owner whose receptionist answers nowhere yet lands on the first run, once a session. */
export function installSetup(win: Window = window): void {
  win.addEventListener("surface:setup", () => {
    let landed: boolean;
    try {
      landed = win.sessionStorage.getItem(FIRST_RUN_LANDED_KEY) === "1";
    } catch {
      landed = false;
    }
    const s = surfaceValue("setup");
    if (!s || !shouldLandOnFirstRun(s.role, s.vm.readiness.answering, routeOnScreen(win), landed)) return;
    try {
      win.sessionStorage.setItem(FIRST_RUN_LANDED_KEY, "1");
    } catch {
      /* still land, once */
    }
    if (win.appNavigate) win.appNavigate(FIRST_RUN_ROUTE);
    else goToRoute(FIRST_RUN_ROUTE, {}, win);
  });
}
