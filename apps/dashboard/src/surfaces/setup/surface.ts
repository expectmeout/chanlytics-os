/**
 * Setup (moved from legacy-bridge/setup.ts with the first run, decision 0015 step 10): the facts from /api/v1/setup, the
 * rows from contracts/setup.ts, the rows this member put off (their saved view, on every device), the verbs the rows and
 * the first run press (`setupVerbs`), the forwarding card's words, and the landing rule -- an owner whose receptionist
 * answers nowhere yet lands on the first run once per session. Every write goes through the typed client; after one lands
 * the refresh map re-reads this surface.
 *
 * The value is the seam's (`useSurface("setup")`): undefined until read, null when the read failed, so a page shows a
 * retry rather than "Reading…" for ever. The surface as the frame registers it (what it reads and hears, its mirror
 * `__SETUP`) and the first run's landing rule are override.ts's; this module, the read and the verbs, is fetched as the
 * surface is first read, or imported by the pages that press its verbs (the loadability review, 19 Oct 2026).
 */
import {
  setupSteps,
  setupLaterOf,
  setupRestsOf,
  setupPutOffNext,
  setupPhoneWantOf,
  SETUP_LATER_REFUSED,
  type SetupDto,
  type SetupPhoneWant,
  type SetupPutOff,
  type SetupPutOffChange,
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
import { api, read } from "@/legacy-bridge/api";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { saveView } from "../people/people-detail";
import { setupOverride } from "./override";
import { setSurfaceValue, surfaceValue } from "../surface-values";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  /** The rows this member put off for good: their saved Setup view (memberships.views.setup), the same on every device. */
  later: string[];
  /** The rows this member put off for a week, each with when it comes back: the same saved view's `rests`. */
  rests: Record<string, string>;
  /** The number this member said they keep or move on the first run's phone step, from the same saved view. */
  want: SetupPhoneWant | null;
  vm: SetupVM;
  fetchedAt: number;
}

/** A put-off saved, with the undo that puts its rows back exactly as they stood; or refused, and why. */
type SetupPutOffResult =
  { ok: true; message: string; undo: () => Promise<SetupPutOffResult> } | { ok: false; message: string };

interface SetupApi {
  /**
   * Put optional rows off, or take them back: this member's, saved to their view, on every device. A "not now" (`rest`)
   * puts a row off for a week, and once it is back from one, for good; an `answer` (not on Google, a new number, the
   * test call skipped) is for good at once; taking back undoes the last put-off (contracts setupPutOffNext).
   */
  later(ids: string | string[], change: SetupPutOffChange): Promise<SetupPutOffResult>;
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

function publish(
  dto: SetupDto,
  role: string,
  off: { later: string[]; rests: Record<string, string> },
  want: SetupPhoneWant | null,
): void {
  const { later, rests } = off;
  setSurfaceValue("setup", {
    dto,
    role,
    later,
    rests,
    want,
    vm: setupSteps({ ...dto, later, rests, want }),
    fetchedAt: Date.now(),
  });
}

/** The member's Setup view as it stands on the page: a save replaces the whole of it, so every save sends all of it. */
function viewNow(): Record<string, unknown> {
  const s = surfaceValue("setup");
  return {
    later: s?.later ?? [],
    ...(s && Object.keys(s.rests).length ? { rests: s.rests } : {}),
    ...(s?.want ? { phone: s.want } : {}),
  };
}

/** One row's put-off as the view holds it: whether for good, and when its week ends (none without one). */
interface PutOffEntry {
  id: string;
  good: boolean;
  until: string | undefined;
}

const entryOf = (s: SetupPutOff, id: string): PutOffEntry => ({
  id,
  good: s.later.includes(id),
  until: new Map(Object.entries(s.rests)).get(id),
});

/** The view's put-off rows with these rows' entries written over them, and every other row's as it is. */
function withEntries(
  s: SetupPutOff,
  entries: readonly PutOffEntry[],
): { later: string[]; rests: Record<string, string> } {
  const later = new Set(s.later);
  const rests = new Map(Object.entries(s.rests));
  for (const e of entries) {
    if (e.good) later.add(e.id);
    else later.delete(e.id);
    if (e.until === undefined) rests.delete(e.id);
    else rests.set(e.id, e.until);
  }
  return { later: [...later], rests: Object.fromEntries(rests) };
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
  const rests = held ? prior.rests : v ? setupRestsOf(v.views.setup) : {};
  const want = held ? prior.want : v ? setupPhoneWantOf(v.views.setup) : null;
  laterKnown = !!v || (laterKnown && !!prior);
  publish(d.setup, d.role, { later, rests }, want);
}

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
function later(ids: string | string[], change: SetupPutOffChange): Promise<SetupPutOffResult> {
  const s = surfaceValue("setup");
  if (!s) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.reading });
  if (!laterKnown) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.unread });
  const list = Array.isArray(ids) ? ids : [ids];
  const next = setupPutOffNext(s, list, change, Date.now());
  // This call's own rows, as they were and as they are now, so a refusal takes back only them, whatever else was put
  // off or back meanwhile.
  const moved = list
    .map((id) => ({ was: entryOf(s, id), is: entryOf(next, id) }))
    .filter((m) => m.was.good !== m.is.good || m.was.until !== m.is.until);
  return writeEntries(
    moved.map((m) => m.is),
    moved.map((m) => m.was),
  );
}

/**
 * These rows' put-offs written over the member's view: shown at once, saved through the view's one line of saves, and
 * put back as they were (`from`) where refused. Saved, it hands back its own undo, which writes `from` again exactly: a
 * toast's Undo puts a row back as it stood, where taking one back undoes only the last put-off (setupPutOffNext).
 */
function writeEntries(to: readonly PutOffEntry[], from: readonly PutOffEntry[]): Promise<SetupPutOffResult> {
  const undo = () => writeEntries(from, to);
  if (to.length === 0) return Promise.resolve({ ok: true, message: "", undo });
  const move = (entries: readonly PutOffEntry[]) => {
    const now = surfaceValue("setup");
    if (!now) return;
    publish(now.dto, now.role, withEntries(now, entries), now.want);
    window.dispatchEvent(new CustomEvent("surface:setup"));
  };
  move(to);
  laterPending += 1;
  const saved = laterSaving.then(async (): Promise<SetupPutOffResult> => {
    const r = await saveView("setup", viewNow());
    laterPending -= 1;
    // Not kept, so not put off (or back): this call's rows return as they were, and the caller says why.
    if (!r.ok) move(from);
    return r.ok ? { ok: true, message: "", undo } : { ok: false, message: r.message };
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
    publish(now.dto, now.role, now, w);
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

/** A quiet look still out: a second one waits for it. */
let peeking = false;

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

/** The read, as the surface's description in override.ts asks for it: a read that failed publishes null. */
export async function applySetup(): Promise<void> {
  try {
    await readSetup();
  } catch (e) {
    // Null, not undefined: the page draws a card with a retry instead of "Reading your workspace…" for ever.
    setSurfaceValue("setup", null);
    throw e;
  }
}
