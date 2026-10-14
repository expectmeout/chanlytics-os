/**
 * Setup (moved from legacy-bridge/setup.ts with the first run, decision 0015 step 10): the facts from /api/v1/setup, the
 * rows from contracts/setup.ts, the rows this member put off (their saved view, on every device), the verbs the rows and
 * the first run press (`setupVerbs`), the forwarding card's words, and the landing rule -- an owner whose receptionist
 * answers nowhere yet lands on the first run once per session. Every write goes through the typed client; after one lands
 * the refresh map re-reads this surface.
 *
 * The value is the seam's (`useSurface("setup")`): undefined until read, null when the read failed, so a page shows a
 * retry rather than "Reading…" for ever. `__SETUP` is its mirror and `__setup` the verbs, for the panes of Settings that
 * still read them (settings.jsx, integrations-real.jsx, business-can.jsx), lines to delete as those panes move (step 11).
 */
import {
  setupSteps,
  setupLaterOf,
  setupPhoneWantOf,
  shouldLandOnFirstRun,
  FIRST_RUN_LANDED_KEY,
  FIRST_RUN_ROUTE,
  SETUP_LATER_REFUSED,
  type SetupDto,
  type SetupPhoneWant,
  type SetupVM,
  type SetupRequestKind,
  forwardingCodes,
  forwardingTestOpen,
  CARRIERS,
  forwardingDialLabel,
  FORWARDING_MODES,
  CARRIER_WORDS,
  FORWARDING_MODE_WORDS,
  formatPhoneDisplay,
  agoWords,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { api, read } from "@/legacy-bridge/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { goToRoute, routeOnScreen } from "@/legacy-bridge/workspace";
import { saveView } from "../people/people-detail";
import { declareSurfaceValue, setSurfaceValue, surfaceValue } from "../surface-values";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  /** The rows this member put off: their saved Setup view (memberships.views.setup), the same on every device. */
  later: string[];
  /** The number this member said they keep or move on the first run's phone step, from the same saved view. */
  want: SetupPhoneWant | null;
  vm: SetupVM;
  fetchedAt: number;
}

interface SetupApi {
  /** Put optional rows off, or take them back: this member's, saved to their view, on every device. */
  later(ids: string | string[], on: boolean): Promise<{ ok: boolean; message: string }>;
  /**
   * The number this member keeps or moves (the first run's phone step), or null for a new one: saved to their view
   * beside the rows they put off, so the step asks for its forwarding from any tab. Nothing to say where it stands.
   */
  want(next: SetupPhoneWant | null): Promise<{ ok: boolean; message: string }>;
  /**
   * The receptionist from what is known: set up where there is none, from Google's listing when one is linked and the
   * name typed at sign-up otherwise; filled from Google where one states none of it. `wrote` is false when there was
   * nothing to add. Owners only; the route says so.
   */
  receptionist(): Promise<{ ok: boolean; wrote: boolean; message: string }>;
  /** Ask a person at Chanlytics for something the product cannot provision yet. */
  request(what: SetupRequestKind): Promise<{ ok: boolean; already: boolean; message: string }>;
  /** The owner switches a tested capability on: a record, not a claim. Owners only; the route says so. */
  /** `firstRun`: the first run's Finish, whose first activation of calls emails the owner (the capability route). */
  activate(kind: string, opts?: { firstRun?: boolean }): Promise<{ ok: boolean; message: string }>;
  /** And off again: the row stays, the history does. Owners only. */
  deactivate(kind: string): Promise<{ ok: boolean; message: string }>;
  /** Read the workspace again: the failed card's retry. */
  refresh(): Promise<void>;
  /**
   * Look again without a word, for a step that waits on something outside the page (a plan, a number, a call): the live
   * feed says when it lands, and this asks at the step's own pace in case it did not. What is drawn stays if the look
   * fails, where a failed read would put the page's failed card over a step that is only waiting.
   */
  peek(): Promise<void>;
  /** The product's own line: numbers to choose from, the one chosen, a retry. Owners only; the route says so. */
  lines: {
    search(areaCode: string): Promise<{ ok: boolean; numbers: LineChoice[]; message: string }>;
    buy(number: string, areaCode: string): Promise<{ ok: boolean; queued: boolean; message: string }>;
    retry(lineId: string): Promise<{ ok: boolean; queued: boolean; message: string }>;
  };
  /** Keep the number you have: save the carrier and the mode, then open the test window. Owners only; the route says so. */
  forwarding: {
    set(o: { number: string; carrier: string; mode: string }): Promise<{ ok: boolean; message: string }>;
    test(lineId: string): Promise<{ ok: boolean; message: string }>;
  };
}

/** The words and the codes the forwarding card needs. */
interface ForwardingWords {
  codes: typeof forwardingCodes;
  dialLabel: typeof forwardingDialLabel;
  testOpen: typeof forwardingTestOpen;
  carriers: readonly string[];
  modes: readonly string[];
  carrierWords: Record<string, string>;
  modeWords: Record<string, string>;
  display: (e164: string | null | undefined) => string | null;
  ago: (iso: string) => string;
}

export interface LineChoice {
  e164: string;
  friendly: string;
  locality: string | null;
  region: string | null;
}

declare global {
  interface Window {
    __setup?: SetupApi;
  }
}

declareSurfaceValue("setup", "__SETUP");

function publish(dto: SetupDto, role: string, later: string[], want: SetupPhoneWant | null): void {
  setSurfaceValue("setup", { dto, role, later, want, vm: setupSteps({ ...dto, later, want }), fetchedAt: Date.now() });
}

/** The member's Setup view as it stands on the page: a save replaces the whole of it, so every save sends all of it. */
function viewNow(): Record<string, unknown> {
  const s = surfaceValue("setup");
  return { later: s?.later ?? [], ...(s?.want ? { phone: s.want } : {}) };
}

/**
 * The put-off rows' saves: one at a time, each sending the list as it stands when it goes, because a save replaces
 * the page's whole view (member_view_set, 00113) and two in flight can land out of order. While one is on its way a
 * re-read keeps the list on screen, which is newer than anything the read can say.
 */
let laterSaving: Promise<unknown> = Promise.resolve();
let laterPending = 0;
/** Whether the member's saved view was read. A save made without it would replace what they put off with less. */
let laterKnown = false;

/**
 * Setup read and published: the workspace's facts, and beside them the member's own saved view (the door People's view
 * goes through), which holds the rows they put off and the number they keep. A views read that fails puts nothing off
 * rather than failing Setup.
 */
async function readSetup(): Promise<void> {
  const [d, v] = await Promise.all([read("GET setup"), read("GET views").catch(() => null)]);
  const prior = surfaceValue("setup");
  // While a save of the view is out, or its read failed, what is on the page is newer than anything the read says.
  const held = !!prior && (laterPending > 0 || !v);
  const later = held ? prior.later : v ? setupLaterOf(v.views.setup) : [];
  const want = held ? prior.want : v ? setupPhoneWantOf(v.views.setup) : null;
  laterKnown = !!v || (laterKnown && !!prior);
  publish(d.setup, d.role, later, want);
}

/** A quiet look still out: a second one waits for it. */
let peeking = false;

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
  // answer), and the first WhatsApp message (awaitsFirstMessage, W-thread-wait-step-3).
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
  apply: async () => {
    try {
      await readSetup();
    } catch (e) {
      // Null, not undefined: the page draws a card with a retry instead of "Reading your workspace…" for ever.
      setSurfaceValue("setup", null);
      throw e;
    }
  },
};

/** The forwarding card's words and codes: contracts', with the number and the age as the app writes them. */
export const FORWARDING_WORDS: ForwardingWords = {
  codes: forwardingCodes,
  dialLabel: forwardingDialLabel,
  testOpen: forwardingTestOpen,
  carriers: CARRIERS,
  modes: FORWARDING_MODES,
  carrierWords: CARRIER_WORDS,
  modeWords: FORWARDING_MODE_WORDS,
  display: formatPhoneDisplay,
  ago: (iso) => agoWords(Date.parse(iso), Date.now()),
};

/** Put rows off, or take them back: shown at once, saved one at a time, and put back as they were where refused. */
function later(ids: string | string[], on: boolean): Promise<{ ok: boolean; message: string }> {
  const s = surfaceValue("setup");
  if (!s) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.reading });
  if (!laterKnown) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.unread });
  const list = Array.isArray(ids) ? ids : [ids];
  // This call's own change, so a refusal takes back only it, whatever else was put off or back meanwhile.
  const changed = list.filter((x) => s.later.includes(x) !== on);
  if (changed.length === 0) return Promise.resolve({ ok: true, message: "" });
  const move = (off: boolean) => {
    const now = surfaceValue("setup");
    if (!now) return;
    const next = off ? [...new Set([...now.later, ...changed])] : now.later.filter((x) => !changed.includes(x));
    publish(now.dto, now.role, next, now.want);
    window.dispatchEvent(new CustomEvent("surface:setup"));
  };
  move(on);
  laterPending += 1;
  const saved = laterSaving.then(async () => {
    const r = await saveView("setup", viewNow());
    laterPending -= 1;
    // Not kept, so not put off (or back): this call's rows return as they were, and the caller says why.
    if (!r.ok) move(!on);
    return r.ok ? { ok: true, message: "" } : { ok: false, message: r.message };
  });
  laterSaving = saved;
  return saved;
}

/** The same want, said twice: nothing to save. */
const sameWant = (a: SetupPhoneWant | null, b: SetupPhoneWant | null): boolean =>
  a === b || (!!a && !!b && a.way === b.way && a.number === b.number);

/**
 * The number kept or moved, or none: shown at once, saved through the put-off rows' one line of saves (the view is one
 * object), and put back as it was where refused.
 */
function want(next: SetupPhoneWant | null): Promise<{ ok: boolean; message: string }> {
  const s = surfaceValue("setup");
  if (!s) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.reading });
  if (!laterKnown) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.unread });
  const before = s.want;
  if (sameWant(before, next)) return Promise.resolve({ ok: true, message: "" });
  const say = (w: SetupPhoneWant | null) => {
    const now = surfaceValue("setup");
    if (!now) return;
    publish(now.dto, now.role, now.later, w);
    window.dispatchEvent(new CustomEvent("surface:setup"));
  };
  say(next);
  laterPending += 1;
  const saved = laterSaving.then(async () => {
    const r = await saveView("setup", viewNow());
    laterPending -= 1;
    // Not kept: the page says what the member's view still holds. Only this call's own change is taken back.
    if (!r.ok && sameWant(surfaceValue("setup")?.want ?? null, next)) say(before);
    return r.ok ? { ok: true, message: "" } : { ok: false, message: r.message };
  });
  laterSaving = saved;
  return saved;
}

/** Setup's verbs, each through its door. */
export const setupVerbs: SetupApi = {
  later,
  want,
  async receptionist() {
    const r = await api()("POST settings/receptionist", { body: {} });
    return r.ok ? { ok: true, wrote: r.data.wrote, message: "" } : { ok: false, wrote: false, message: r.message };
  },
  async activate(kind, opts) {
    const r = await api()("POST capabilities/[kind]", {
      params: { kind },
      body: opts && opts.firstRun ? { first_run: true } : {},
    });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  async deactivate(kind) {
    const r = await api()("DELETE capabilities/[kind]", { params: { kind } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  async refresh() {
    api().forget();
    await refreshSurfaces([setupOverride]);
  },
  async peek() {
    if (peeking || !surfaceValue("setup")) return;
    peeking = true;
    try {
      await readSetup();
      window.dispatchEvent(new CustomEvent("surface:setup"));
    } catch {
      /* what is drawn stands: the step is waiting, not failed */
    } finally {
      peeking = false;
    }
  },
  lines: {
    async search(areaCode) {
      const r = await api()("POST lines/search", { body: { area_code: areaCode } });
      if (!r.ok) return { ok: false, numbers: [], message: r.message };
      return { ok: true, numbers: r.data.numbers as LineChoice[], message: "" };
    },
    async buy(number, areaCode) {
      const r = await api()("POST lines/buy", { body: { number, area_code: areaCode }, once: true });
      if (!r.ok) return { ok: false, queued: false, message: r.message };
      return { ok: r.data.ok, queued: r.data.queued, message: "" };
    },
    async retry(lineId) {
      const r = await api()("POST lines/retry", { body: { line_id: lineId } });
      if (!r.ok) return { ok: false, queued: false, message: r.message };
      return {
        ok: r.data.ok,
        queued: r.data.queued,
        message: r.data.ok ? "" : "It stopped again — a person at Chanlytics has it.",
      };
    },
  },
  forwarding: {
    async set(o) {
      const r = await api()("POST lines/forwarding", { body: o });
      return { ok: r.ok, message: r.ok ? "" : r.message };
    },
    async test(lineId) {
      const r = await api()("POST lines/forwarding/test", { body: { line_id: lineId }, once: true });
      return { ok: r.ok, message: r.ok ? "" : r.message };
    },
  },
  async request(what) {
    const r = await api()("POST setup/request", { body: { what }, once: true });
    if (!r.ok) return { ok: false, already: false, message: r.message };
    const req = r.data.request;
    const already =
      !!req && typeof req === "object" && "already" in req && (req as { already?: unknown }).already === true;
    return { ok: true, already, message: "" };
  },
};

/**
 * Setup's verbs for the panes of Settings that still read them (`__setup`), and the landing rule: an owner whose
 * receptionist answers nowhere yet lands on the first run, once a session.
 */
export function installSetup(win: Window = window): void {
  win.__setup = setupVerbs;
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
