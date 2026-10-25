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
  setupPhoneWantOf,
  setupChoicesOf,
  SETUP_LATER_REFUSED,
  type ImportSource,
  type LineLookupDto,
  type SetupChoices,
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
import { api, read } from "@/legacy-bridge/api";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { saveView } from "../people/people-detail";
import { setupOverride } from "./override";
import { setSurfaceValue, surfaceValue } from "../surface-values";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  /** The rows this member put off: their saved Setup view (memberships.views.setup), the same on every device. */
  later: string[];
  /** The number this member said they keep, move or get at the first run's Where it answers, from the same saved view. */
  want: SetupPhoneWant | null;
  /** What else Where it answers chose (decision 0073: WhatsApp), from the same saved view. */
  choices: SetupChoices;
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
  /** What else Where it answers chose (WhatsApp): saved to the same view, through the same one line of saves. */
  choose(next: Partial<SetupChoices>): Promise<{ ok: boolean; message: string }>;
  /**
   * The receptionist from what is known: set up where there is none, from Google's listing when one is linked and the
   * name typed at sign-up otherwise; filled from Google where one states none of it. `wrote` is false when there was
   * nothing to add. Owners only; the route says so.
   */
  receptionist(): Promise<{ ok: boolean; wrote: boolean; message: string }>;
  /**
   * The workspace's receptionist made at the voice provider before any number (decision 0073, R1), as the first run's
   * Your receptionist goes on to rehearse. Best effort: `made` false where the provider is not there.
   */
  makeAgent(): Promise<{ made: boolean }>;
  /** Ask a person at Chanlytics for something the product cannot provision yet. */
  request(what: SetupRequestKind): Promise<{ ok: boolean; already: boolean; message: string }>;
  /**
   * Bring a source's history in again where its run stopped (decision 0073, R23): the job for that source is asked to
   * start where it left off. Owners and managers; the route says so.
   */
  importAgain(source: ImportSource): Promise<{ ok: boolean; message: string }>;
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
    /**
     * What a number's line is, by the carrier's own records (decision 0073, R11): a mobile, a landline or an office
     * phone system, and a mobile's company, so Go live's code is chosen with no question asked. Null where the lookup is
     * not on this deployment or could not say.
     */
    lookup(number: string): Promise<LineLookupDto | null>;
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

const NO_CHOICES: SetupChoices = { whatsapp: null };

/** Setup as the seam holds it: the read, the member's role, and their own saved view (put-offs, the number, choices). */
function publish(
  dto: SetupDto,
  role: string,
  view: { later: string[]; want: SetupPhoneWant | null; choices?: SetupChoices },
): void {
  const { later, want, choices = NO_CHOICES } = view;
  setSurfaceValue("setup", {
    dto,
    role,
    later,
    want,
    choices,
    vm: setupSteps({ ...dto, later, want, choices }),
    fetchedAt: Date.now(),
  });
}

/** The member's Setup view as it stands on the page: a save replaces the whole of it, so every save sends all of it. */
function viewNow(): Record<string, unknown> {
  const s = surfaceValue("setup");
  return {
    later: s?.later ?? [],
    ...(s?.want ? { phone: s.want } : {}),
    ...(s?.choices.whatsapp ? { whatsapp: s.choices.whatsapp } : {}),
  };
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
  const choices = held ? prior.choices : v ? setupChoicesOf(v.views.setup) : NO_CHOICES;
  laterKnown = !!v || (laterKnown && !!prior);
  publish(d.setup, d.role, { later, want, choices });
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
    publish(now.dto, now.role, { later: next, want: now.want, choices: now.choices });
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
  a === b ||
  (!!a &&
    !!b &&
    a.way === b.way &&
    a.number === b.number &&
    a.mode === b.mode &&
    a.rings === b.rings &&
    a.company === b.company);

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
    publish(now.dto, now.role, { later: now.later, want: w, choices: now.choices });
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

/**
 * What else Where it answers chose: shown at once, saved through the same one line of saves as the rows and the want,
 * and put back as it was where refused.
 */
function saveChoices(next: Partial<SetupChoices>): Promise<{ ok: boolean; message: string }> {
  const s = surfaceValue("setup");
  if (!s) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.reading });
  if (!laterKnown) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.unread });
  const before = s.choices;
  const after: SetupChoices = { ...before, ...next };
  if (after.whatsapp === before.whatsapp) return Promise.resolve({ ok: true, message: "" });
  const say = (c: SetupChoices) => {
    const now = surfaceValue("setup");
    if (!now) return;
    publish(now.dto, now.role, { later: now.later, want: now.want, choices: c });
    window.dispatchEvent(new CustomEvent("surface:setup"));
  };
  say(after);
  laterPending += 1;
  const saved = laterSaving.then(async () => {
    const r = await saveView("setup", viewNow());
    laterPending -= 1;
    if (!r.ok && surfaceValue("setup")?.choices.whatsapp === after.whatsapp) say(before);
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
  choose: saveChoices,
  async receptionist() {
    const r = await api()("POST settings/receptionist", { body: {} });
    return r.ok ? { ok: true, wrote: r.data.wrote, message: "" } : { ok: false, wrote: false, message: r.message };
  },
  async makeAgent() {
    const r = await api()("POST receptionist/agent", { body: {} });
    return { made: r.ok ? r.data.made === true : false };
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
    async lookup(number) {
      const r = await api()("POST lines/lookup", { body: { number } });
      return r.ok ? (r.data.lookup as LineLookupDto | null) : null;
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
  async importAgain(source) {
    const r = await api()("POST imports/again", { body: { source } });
    return { ok: r.ok, message: r.ok ? "" : r.message };
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
