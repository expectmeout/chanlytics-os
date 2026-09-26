import {
  CONSENT_SOURCES,
  DEAL_ACT_WORDS,
  DEAL_REFUSALS,
  DEAL_CARD_WORDS,
  DEAL_SHEET_WORDS,
  NOTE_MAX,
  NOTE_WORDS,
  dueStepDay,
  stepDayOf,
  stepDays,
  stepSheetBody,
  stepSheetDirty,
  stepSheetFor,
  stepSheetMerge,
  STEP_SHEET_WORDS,
  TIMELINE_FILTERS,
  dealCardsOf,
  dealMenuActs,
  dealNextAct,
  dealSheetBody,
  dealSheetDirty,
  dealSheetFor,
  dealSheetMerge,
  dealSheetMessage,
  dealSheetRefusal,
  filterTimeline,
  isDealSheetMode,
  mayReceive,
  offersYesRefusal,
  toPersonVM,
  verbalOptInScript,
  type DealClearable,
  type DealDto,
  type DealLostReason,
  type DealPer,
  type DealStage,
  type PersonNoteDto,
  type PersonVM,
  type AskedPurpose,
} from "@chanlytics/contracts";
import { api } from "./api";
import { ApiError, type ApiResult } from "../client/api";
import { workspaceZone } from "./zone";
import { readCache, staleReadCaches } from "./read-cache";
import { keepSavedView, placeDeal } from "./surface-data";
import { personRouteId } from "./surface-registry";
import { afterBoot, bootWaitsFor } from "./surface-runner";
import { getActiveWorkspace } from "./workspace";

/**
 * The profile courier: `window.__personDetail(id)`.
 *
 * The list feeds the surface through the seam's globals; a profile is one
 * person in full — every message, call and decision — and is fetched when it
 * opens, the way the Inbox fetches an off-page escalation. The mockup's
 * ClientProfile (a classic script that cannot import) calls this and renders
 * the view model it gets back, so the mapping stays in contracts where it is
 * tested by execution.
 *
 * Resolves null for "not in your workspace" (404) so the page can say so;
 * a session expiry has already signed the tab out by the time this throws.
 */
export function personDetail(id: string): Promise<PersonVM | null> {
  return people.through(id, async () => {
    // Its days and times by the business's clock (zone.ts), read beside the person rather than after.
    const [r, tz] = await Promise.all([api()("GET contacts/[id]", { params: { id } }), workspaceZone()]);
    // For the member looking (__ME): a teammate's thread is theirs, not waiting on you.
    const me = (window as unknown as { __ME?: { id?: string | null } }).__ME?.id ?? null;
    if (r.ok) return toPersonVM(r.data.person, tz, new Date(), me);
    // Gone: the copy this tab kept of them goes too, or the next open would paint someone who is not there.
    if (r.status === 404) {
      people.forget(id);
      return null;
    }
    throw new ApiError(r.code, r.status, r.message);
  });
}

/** The person this tab already read, if it has. Synchronous: what the page paints first. */
export function peekPerson(id: string): PersonVM | null {
  return people.peek(id);
}

/**
 * Read someone before their row is clicked. People is a list you open, go back
 * from and open again, and every one of those opens re-read the person and put
 * "Loading..." over the page while it did.
 */
export function warmPerson(id: string): Promise<PersonVM | null> | null {
  return people.warm(id, () => personDetail(id));
}

/** How many of a list's first rows are read ahead, and how many of those reads are out at once. */
const AHEAD = 12;
const AHEAD_LANES = 2;
let ahead: string[] = [];
let aheadOut = 0;

/**
 * Read the people a list shows before any of them is pressed: `window.__warmPeople(ids)`, the rows on screen in their
 * order. A person the tab does not hold opens on nothing of theirs until their whole page is in (client-profile.jsx),
 * so the one way their page opens at once is to have read them already. Measured on production (24 Sep 2026): a person
 * never opened drew their page 289 ms after the press; one the tab held, in 8. Only after the boot (afterBoot), two at
 * a time, the first twelve, and only those the tab does not hold at all (a copy from before is read again as a pointer
 * reaches it). A later list replaces what an earlier one was still waiting to read.
 */
export function warmPeople(ids: string[]): void {
  if (!getActiveWorkspace()) return;
  ahead = [...new Set(ids)].slice(0, AHEAD).filter((id) => !people.peek(id));
  if (!ahead.length) return;
  // Asked a step later: on a reload a list draws from the tab before the shell starts the boot (a child's effects run
  // before its parent's), and asked at once, afterBoot answered for no boot at all.
  void Promise.resolve().then(afterBoot).then(readAhead);
}

function readAhead(): void {
  while (aheadOut < AHEAD_LANES && ahead.length) {
    const id = ahead.shift() as string;
    if (people.peek(id)) continue;
    aheadOut += 1;
    personDetail(id)
      .catch(() => null)
      .finally(() => {
        aheadOut -= 1;
        readAhead();
      });
  }
}

/**
 * A tab opened on a person's page reads them before anything else: called once, at module scope, before React and
 * the surfaces' boot (LegacyApp.tsx). The page's own read, a moment later, shares this one (client/api.ts). Measured
 * on production (23 Sep 2026): on a reload their read went out beside eight of the boot's and took 1.4 s, against
 * 0.3-0.7 s alone. Off a workspace page nothing is read: a read that names no workspace is refused.
 */
export function warmPersonOnScreen(win: Window = window): void {
  if (!getActiveWorkspace()) return;
  const [page, param] = (win.location.hash || "").replace(/^#[/]?/, "").split("/");
  const id = personRouteId(page, param);
  if (!id) return;
  // The surfaces nobody is looking at wait for this read as they wait for the page's own (surface-runner.ts
  // bootWaitsFor): out beside nine of theirs it took 3,236 ms, alone 773 (25 Sep 2026).
  const read = warmPerson(id);
  if (read) bootWaitsFor(read);
}

/** The client's answer, as the pages read it: `ok`, `data`, or the refusal's `message`. */
export type DeleteResult = ApiResult<unknown>;

/**
 * Delete this person: `window.__deletePerson(id)`.
 *
 * The route is the one the privacy policy promises — Postgres rows, Storage
 * media and any queued job — and it is owner-only on the
 * server, so a viewer's click returns the server's refusal rather than a
 * pretend success. After it lands the refresh map re-reads every surface that
 * named the person — the list, the Inbox, the threads and Today — so nothing
 * keeps showing someone who no longer exists.
 */
/**
 * The people this tab has opened, kept in the tab as the surfaces are
 * (read-cache.ts `tab`), so a reload paints the page whole and reads it again
 * behind, as Today and Leads do. After a write they are still painted and read
 * again as they open (every reader of this cache reads behind its paint:
 * the page, the deal sheet). Gone at sign-out with the surfaces.
 *
 * A "not in your workspace" is not held: it is the one answer that changes the
 * moment somebody adds them, and painting it from memory would say they are
 * gone when they are not. A person the server no longer has, or one deleted
 * here, is let go of.
 */
const people = readCache<PersonVM | null>("person", (vm) => vm !== null, { tab: true });

export async function deletePerson(id: string): Promise<DeleteResult> {
  const r = await api()("DELETE contacts/[id]", { params: { id } });
  if (r.ok) people.forget(id);
  return r;
}

/**
 * Receptionist mode for one person: `window.__setPersonReceptionist(id, mode)`.
 *
 * "auto" / "ask" / "never" set the person's own row; "inherit" removes it so
 * they follow the workspace policy again. Owner-only on the server. The list
 * is re-read afterwards because the Receptionist column reads from it.
 */
export async function setPersonReceptionist(
  id: string,
  mode: "auto" | "ask" | "never" | "inherit",
): Promise<DeleteResult> {
  return api()("PUT contacts/[id]/receptionist", { params: { id }, body: { mode } });
}

/**
 * A customer's answer, recorded by whoever heard it.
 *
 * TWO QUESTIONS, TWO DOORS, and they are never interchangeable:
 *
 *   "conversational"  messages about their own visit, and a reply when they
 *                     write. `window.__setPersonConsent(id, body)`.
 *   "marketing"       offers and news. `window.__setPersonMarketingConsent(...)`.
 *
 * The carriers require them collected separately (error 30913) and the database
 * keeps them in separate columns (00095). Both controls in this product used to
 * say "offers" and write the conversational column, so a signed marketing consent
 * could not be recorded at all — which is what this second door fixes.
 *
 * { consent: "opted_in" | "opted_out", source } or { consent: "unknown" }.
 * Owner or operator on the server. The list is re-read afterwards because the
 * Consent column and both consent lists read from it.
 */
export interface ConsentBody {
  consent: "opted_in" | "opted_out" | "unknown";
  source?: string;
  note?: string;
  /** The message they said it in, when the source is their own message (00137): one person's, so never a batch's. */
  message_id?: string;
}

/** One transport, the route chosen by purpose, so neither answer can be posted to the other's door by a typo in a page. */
type ConsentRoute = "PUT contacts/[id]/consent" | "PUT contacts/[id]/marketing-consent";
const CONSENT_ROUTE: Record<AskedPurpose, ConsentRoute> = {
  conversational: "PUT contacts/[id]/consent",
  marketing: "PUT contacts/[id]/marketing-consent",
};

async function recordOne(id: string, body: ConsentBody, purpose: AskedPurpose): Promise<DeleteResult> {
  return api()(CONSENT_ROUTE[purpose], { params: { id }, body });
}

export async function setPersonConsent(id: string, body: ConsentBody): Promise<DeleteResult> {
  return recordOne(id, body, "conversational");
}

/** Their answer about OFFERS, on its own column and its own ledger entry. */
export async function setPersonMarketingConsent(id: string, body: ConsentBody): Promise<DeleteResult> {
  return recordOne(id, body, "marketing");
}

/**
 * The same answer for many at once — a yes given at the desk by a whole
 * class, say: `window.__setPersonConsentMany(ids, body)`. ONE request, fifty
 * at most, through the batch door (server/consent.ts), which walks the same
 * per-person door each would go through alone and records a decision per
 * person. It used to be one request per person -- fifty round trips and
 * fifty takes of the consent bucket for one act at the desk.
 */
export interface ManyResult {
  ok: boolean;
  done: number;
  failed: number;
  message?: string;
}

type ManyRoute = "PUT contacts/consent" | "PUT contacts/marketing-consent";
const MANY_ROUTE: Record<AskedPurpose, ManyRoute> = {
  conversational: "PUT contacts/consent",
  marketing: "PUT contacts/marketing-consent",
};

/** A batch door's answer, in the bar's words. Not ours, or gone: not done, and said so -- it is not an error to have selected a row that changed underneath you. */
function manyResult(r: ApiResult<unknown>, asked: number, verb = "recorded"): ManyResult {
  if (!r.ok) return { ok: false, done: 0, failed: asked, message: r.message };
  const d = r.data as { done: number; failed: { id: string; message: string }[]; skipped: string[] };
  const failed = d.failed.length + d.skipped.length;
  const why = d.failed[0]?.message ?? (d.skipped.length ? "no longer in this workspace" : undefined);
  return {
    ok: failed === 0,
    done: d.done,
    failed,
    message: failed ? `${failed} could not be ${verb}${why ? ` — ${why}` : ""}` : undefined,
  };
}

async function recordMany(ids: string[], body: ConsentBody, purpose: AskedPurpose): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  return manyResult(await api()(MANY_ROUTE[purpose], { body: { ids: take, ...body } }), take.length);
}

export type ReceptionistMany = "auto" | "ask" | "never" | "inherit";

/** The receptionist's mode for a selection: `window.__setPersonReceptionistMany(ids, mode)`. Owners; one request. */
export async function setPersonReceptionistMany(ids: string[], mode: ReceptionistMany): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  return manyResult(await api()("PUT contacts/receptionist", { body: { ids: take, mode } }), take.length, "changed");
}

/** One note line under a selection's notes: `window.__appendPersonNotesMany(ids, line)`. Operator or owner; one request. */
export async function appendPersonNotesMany(ids: string[], line: string): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  return manyResult(await api()("PUT contacts/notes", { body: { ids: take, append: line } }), take.length, "noted");
}

/**
 * A person added by hand: a number and, if known, a name, through the door
 * the calendar sweep uses (POST /contacts: get-or-create, consent unknown).
 * `window.__addPerson({ phone, name })` answers with the id and whether they
 * were already here; the People surface re-reads after it.
 */
export async function addPerson(body: {
  phone: string;
  name?: string;
}): Promise<ApiResult<{ contact_id: string; existed: boolean }>> {
  return api()("POST contacts", { body });
}

/**
 * One part of an imported client list: `window.__importPeople({ import_id, rows })`, fifty rows at most, through the
 * owner's door (POST /contacts/import). The People surface re-reads after each part (refresh-map).
 */
export async function importPeople(body: {
  import_id: string;
  rows: { name?: string; phone?: string; email?: string }[];
}): Promise<
  ApiResult<{
    added: number;
    existed: number;
    emails_set: number;
    skipped: { line: number; reason: string }[];
    failed: { line: number; message: string }[];
    stopped: boolean;
  }>
> {
  return api()("POST contacts/import", { body });
}

/**
 * A page remembering its view in this workspace: `window.__saveView("people",
 * { sortBy, sortDir, columns })`. Each save replaces the page's whole view
 * (member_view_set, 00113), so a page sends every key it owns. The member's own row, per workspace,
 * so a phone and a laptop show the page the same way. No surface re-read: the
 * view is the caller's own state already. The People surface's copy of the
 * views takes it before the request goes (keepSavedView): People mounted again
 * on Back read the view from before the save, and the next save wrote it back.
 * The copy is told when the reply lands, so a read of People that went out
 * before then keeps the view rather than the server's older answer.
 */
export async function saveView(
  page: string,
  view: Record<string, unknown>,
): Promise<ApiResult<{ views: Record<string, unknown> }>> {
  const landed = keepSavedView(page, view);
  try {
    return await api()("PUT views/[page]", { params: { page }, body: { view }, refresh: false });
  } finally {
    landed();
  }
}

export async function setPersonConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "conversational");
}

/** A signed marketing consent recorded for a whole class at once. */
export async function setPersonMarketingConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "marketing");
}

/**
 * A deal on a person's word (0004): `window.__recordDeal(id, body)`. No `deal_id`
 * is a new engagement, which starts proposed; with one and the version the page
 * saw, a move. The door decides; the route records the decision. The list is
 * re-read afterwards (refresh-map) because the row's deal columns and the
 * Journey lists read from it. A proposal's link, its valid-until day, a reason
 * for passing and what a person emptied (0008) go only when named.
 */
export interface DealBody {
  stage: DealStage;
  deal_id?: string;
  version?: number;
  service?: string;
  when?: string;
  amount_cents?: number;
  per?: DealPer;
  note?: string;
  message_id?: string;
  form_note?: string;
  proposal_url?: string;
  valid_until?: string | null;
  lost_reason?: DealLostReason;
  clear?: DealClearable[];
}

export async function recordDeal(
  id: string,
  body: DealBody,
  // One of several in turn (a selection's pass): each moves its row as the door answers, and only the last asks
  // for People to be read again, behind it.
  opts: { refresh?: false | "behind" } = {},
): Promise<ApiResult<{ deal: DealDto; from: string | null; decision_id: string; current: DealDto | null }>> {
  return api()("POST contacts/[id]/deal", {
    params: { id },
    body,
    // The row moves as the door answers (0008): the door answers the deal the person's People row shows now (`current`,
    // people_list's rule), which goes onto the row at once, and People and Reports are read again behind it, so the
    // sheet closes when the server takes the move rather than once every person has been read again. Not the deal it
    // recorded: a move on someone's older deal is not the one their row shows.
    onAccepted: (d) => {
      if (d && d.current) placeDeal(id, d.current);
    },
    refresh: opts.refresh === false ? false : "behind",
  });
}

/**
 * A selection's pass (0008, the Pipeline's Mark as passed · N): `window.__passDeals(items, reason)`.
 *
 * Each is recorded through the one deal door in turn, with the version the person's own read says -- read now, not
 * the tab's copy, which a teammate's move since does not age -- and only while that deal is still a proposal out: the
 * door moves any stage to any when the version matches, so a deal that became a client, or passed for another
 * reason, since the rows were drawn would be written over. Those are left as they are and said as changed, with a
 * move the door refuses as moved; a read or a write that failed otherwise is said as not marked, for another press.
 * Each row moves as its answer lands (placeDeal); People and Reports are read again once, after the last, by the
 * table a single move's re-read follows, whatever the last one answered (inboxBulk's rule).
 */
export async function passDeals(
  items: readonly { personId: string; dealId: string }[],
  reason: DealLostReason,
): Promise<{ passed: string[]; changed: string[]; failed: string[] }> {
  const passed: string[] = [];
  const changed: string[] = [];
  const failed: string[] = [];
  for (const it of items) {
    let person: PersonVM | null;
    try {
      person = await personDetail(it.personId);
    } catch {
      failed.push(it.personId);
      continue;
    }
    const deal = person ? (person.deals ?? []).find((d) => d.id === it.dealId) : undefined;
    if (!deal || deal.stage !== "proposed" || !deal.version) {
      changed.push(it.personId);
      continue;
    }
    const r = await recordDeal(
      it.personId,
      { stage: "lost", deal_id: it.dealId, version: deal.version, lost_reason: reason },
      { refresh: false },
    );
    if (r.ok) passed.push(it.personId);
    else if (r.message === DEAL_REFUSALS.moved) changed.push(it.personId);
    else failed.push(it.personId);
  }
  // As the client's own refresh after a write does: the tab's copies of what changed are read again, then the surfaces.
  if (items.length) {
    staleReadCaches();
    await import("./refresh-map").then((m) => m.refreshAfter("POST contacts/[id]/deal"));
  }
  return { passed, changed, failed };
}

/**
 * A person's notes (0007): `window.__personNotes.write(id, body)` adds one (no `note_id`) or changes its author's own
 * (with `note_id` and the version the page saw); `remove` takes one away; `decide` keeps or dismisses the
 * receptionist's suggestion. The page re-reads the person after each; nothing else shows a note.
 */
export interface NoteBody {
  body: string;
  for_user_id?: string | null;
  team_only?: boolean;
  note_id?: string;
  version?: number;
  /** Its day, which makes it a step (00166); a change that names none keeps the one it has, `clear_due` takes it. */
  due_on?: string | null;
  deal_id?: string | null;
  clear_due?: boolean;
}

// Each note write answers when the server takes it, and People (a row carries its next step) is read again behind it:
// the whole list was being read before a note said it was added. The page reads the person itself.
export async function writePersonNote(id: string, body: NoteBody): Promise<ApiResult<{ note: PersonNoteDto | null }>> {
  return api()("POST contacts/[id]/notes", { params: { id }, body, refresh: "behind" });
}

/** A step done, or open again (00166): any owner or operator, with the version the page saw. */
export async function markStepDone(
  id: string,
  noteId: string,
  done = true,
  version?: number,
): Promise<ApiResult<{ note: PersonNoteDto | null }>> {
  return api()("POST contacts/[id]/notes/done", {
    params: { id },
    body: { note_id: noteId, done, ...(version !== undefined ? { version } : {}) },
    refresh: "behind",
  });
}

export async function removePersonNote(id: string, noteId: string): Promise<ApiResult<{ removed: string }>> {
  return api()("POST contacts/[id]/notes/remove", { params: { id }, body: { note_id: noteId }, refresh: "behind" });
}

export async function decidePersonNote(
  id: string,
  body: { note_id: string; keep: boolean; body?: string; team_only?: boolean },
): Promise<ApiResult<{ note?: PersonNoteDto; removed?: string }>> {
  return api()("POST contacts/[id]/notes/decide", { params: { id }, body });
}

declare global {
  interface Window {
    /** A person's notes (0007): the three writes, and the card's words and limit from contracts. */
    __personNotes?: {
      write: typeof writePersonNote;
      remove: typeof removePersonNote;
      decide: typeof decidePersonNote;
      /** A step done, or open again (00166). */
      done: typeof markStepDone;
      /** The days a step's picker offers, and a day as every page says it (contracts steps.ts). */
      days: typeof stepDays;
      dayOf: typeof stepDayOf;
      /** A step's day once it has come, as every page judges it (contracts steps.ts). */
      dueDay: typeof dueStepDay;
      /** The step sheet's words, what it opens with, what it sends, and whether anything was typed (step-sheet.ts). */
      sheet: typeof stepSheetFor;
      sheetBody: typeof stepSheetBody;
      sheetDirty: typeof stepSheetDirty;
      sheetMerge: typeof stepSheetMerge;
      sheetWords: typeof STEP_SHEET_WORDS;
      words: typeof NOTE_WORDS;
      max: number;
    };
    __personDetail?: (id: string) => Promise<PersonVM | null>;
    /** The person this tab already read: what the page paints before its own read lands. */
    __peekPerson?: (id: string) => PersonVM | null;
    /** Read someone before their row is clicked. */
    __warmPerson?: (id: string) => void;
    /** Read the people a list shows, after the boot, a few at a time. */
    __warmPeople?: (ids: string[]) => void;
    __setPersonConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __setPersonMarketingConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonMarketingConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __consentSources?: readonly { id: string; label: string }[];
    __timeline?: { filters: typeof TIMELINE_FILTERS; filter: typeof filterTimeline };
    __recordDeal?: typeof recordDeal;
    __passDeals?: typeof passDeals;
    /**
     * A deal on the page (0008): the one sheet every move goes through (deal-sheet.ts: its modes, what it says and
     * opens with, the draft once they are read again, the body it sends, where a refusal goes), the person page's deal
     * cards and their words, and the thread's Deal group with the acts' words.
     */
    __deal?: {
      isMode: typeof isDealSheetMode;
      sheet: typeof dealSheetFor;
      body: typeof dealSheetBody;
      message: typeof dealSheetMessage;
      dirty: typeof dealSheetDirty;
      merge: typeof dealSheetMerge;
      refusal: typeof dealSheetRefusal;
      sheetWords: typeof DEAL_SHEET_WORDS;
      cards: typeof dealCardsOf;
      cardWords: typeof DEAL_CARD_WORDS;
      menu: typeof dealMenuActs;
      next: typeof dealNextAct;
      actWords: typeof DEAL_ACT_WORDS;
    };
    /** The broadcast's own "may this person be reached", for pages that count people. */
    __mayReceive?: typeof mayReceive;
    /** The ways a yes to OFFERS may be recorded: in writing only (00100). A no keeps every source. */
    __offersYesSources?: readonly { id: string; label: string }[];
    /** What staff ask in person or on the phone -- the sentence the campaign files as its spoken opt-in. */
    __verbalOptInScript?: (businessName: string) => string;
    __setPersonReceptionistMany?: (ids: string[], mode: ReceptionistMany) => Promise<ManyResult>;
    __appendPersonNotesMany?: (ids: string[], line: string) => Promise<ManyResult>;
    __addPerson?: (body: {
      phone: string;
      name?: string;
    }) => Promise<ApiResult<{ contact_id: string; existed: boolean }>>;
    __importPeople?: typeof importPeople;
    __saveView?: (
      page: string,
      view: Record<string, unknown>,
    ) => Promise<ApiResult<{ views: Record<string, unknown> }>>;
    __deletePerson?: (id: string) => Promise<DeleteResult>;
    __setPersonDetails?: (id: string, body: DetailsBody) => Promise<DeleteResult>;
    __setPersonReceptionist?: (id: string, mode: "auto" | "ask" | "never" | "inherit") => Promise<DeleteResult>;
  }
}

/**
 * A person's name, the owner's notes and their email address:
 * `window.__setPersonDetails(id, { name?, notes?, email? })`. A proposal's link is its deal's, set in the deal
 * sheet (0008).
 *
 * Owner or operator on the server; an empty string clears. The People list
 * is re-read because names show on every row, and the profile reloads on
 * the same event.
 */
export interface DetailsBody {
  name?: string;
  notes?: string;
  email?: string;
}

export async function setPersonDetails(id: string, body: DetailsBody): Promise<DeleteResult> {
  return api()("PUT contacts/[id]/details", { params: { id }, body });
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
  window.__peekPerson = peekPerson;
  window.__warmPerson = warmPerson;
  window.__warmPeople = warmPeople;
  window.__setPersonConsentMany = setPersonConsentMany;
  window.__setPersonDetails = setPersonDetails;
  window.__personNotes = {
    write: writePersonNote,
    remove: removePersonNote,
    decide: decidePersonNote,
    done: markStepDone,
    days: stepDays,
    dayOf: stepDayOf,
    dueDay: dueStepDay,
    sheet: stepSheetFor,
    sheetBody: stepSheetBody,
    sheetDirty: stepSheetDirty,
    sheetMerge: stepSheetMerge,
    sheetWords: STEP_SHEET_WORDS,
    words: NOTE_WORDS,
    max: NOTE_MAX,
  };
  window.__deletePerson = deletePerson;
  window.__setPersonReceptionist = setPersonReceptionist;
  window.__setPersonConsent = setPersonConsent;
  window.__setPersonMarketingConsent = setPersonMarketingConsent;
  window.__setPersonMarketingConsentMany = setPersonMarketingConsentMany;
  window.__consentSources = CONSENT_SOURCES;
  // The timeline's filters and the rule that applies them: a profile narrows by the kinds contracts names.
  window.__timeline = { filters: TIMELINE_FILTERS, filter: filterTimeline };
  // A deal on a person's word, and the words the page says one in: the rule, not a copy of it (0004).
  window.__recordDeal = recordDeal;
  window.__passDeals = passDeals;
  // One sheet for every move, and the card and the thread's group that open it (0008): the rules, never a copy.
  window.__deal = {
    isMode: isDealSheetMode,
    sheet: dealSheetFor,
    body: dealSheetBody,
    message: dealSheetMessage,
    dirty: dealSheetDirty,
    merge: dealSheetMerge,
    refusal: dealSheetRefusal,
    sheetWords: DEAL_SHEET_WORDS,
    cards: dealCardsOf,
    cardWords: DEAL_CARD_WORDS,
    menu: dealMenuActs,
    // The card's one next act, which a phone's peek pins under it.
    next: dealNextAct,
    actWords: DEAL_ACT_WORDS,
  };
  // The rule, not a copy of it: the Lists page counts who a broadcast reaches, and
  // it was spelling that by hand -- without the phone the route requires.
  window.__mayReceive = mayReceive;
  // The rule, applied once, so the profile and the bulk menu offer the same ways.
  window.__offersYesSources = CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null);
  // The words, not a copy of them: the filing quotes this sentence as the way a
  // yes is asked for in person or on the phone, so the desk sees the same one.
  window.__verbalOptInScript = verbalOptInScript;
  window.__setPersonReceptionistMany = setPersonReceptionistMany;
  window.__appendPersonNotesMany = appendPersonNotesMany;
  window.__addPerson = addPerson;
  window.__importPeople = importPeople;
  window.__saveView = saveView;
}
