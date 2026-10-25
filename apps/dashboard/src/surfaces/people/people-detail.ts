import {
  DEAL_ACT_WORDS,
  DEAL_REFUSALS,
  dueStepDay,
  dealMenuActs,
  type DealClearable,
  type DealDto,
  type DealLostReason,
  type DealPer,
  type DealStage,
  type PersonCallBody,
  type PersonNoteDto,
  type PersonVM,
  type AskedPurpose,
  MIN_MS,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { commitVerb, type VerbResult } from "@/legacy-bridge/verbs/commit";
import { ApiError, type ApiResult } from "@/client/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { codeOnce } from "@/lib/code-once";
import { readCache, staleReadCaches } from "@/legacy-bridge/read-cache";
import { holderName } from "../holder-names";
import { keepSavedView, peopleLoaded } from "./surface";
import { declareReads, personRouteId } from "@/legacy-bridge/surface-registry";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { afterBoot, bootWaitsFor } from "@/legacy-bridge/surface-runner";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { getActiveWorkspace, routeOnScreen } from "@/legacy-bridge/workspace";

/**
 * The profile courier: `personDetail(id)`.
 *
 * The list feeds the surface through the seam's globals; a profile is one
 * person in full — every message, call and decision — and is fetched when it
 * opens, the way the Inbox fetches an off-page escalation. The pages import it
 * (the mockup's ClientProfile, a classic script that could not, called it by its
 * window name, which went with the last such page) and render the view model
 * it gets back, so the mapping stays in contracts where it is tested by execution.
 *
 * Resolves null for "not in your workspace" (404) so the page can say so;
 * a session expiry has already signed the tab out by the time this throws.
 */
/** The person's page's shaping code: fetched once, shared; a fetch that failed is asked for again by the next read. */
const personShape = codeOnce(() => import("./person-shape"));

/**
 * A person's page (person/person-real.tsx) as a chunk of its own within People's route: People's list, Leads and the
 * Pipeline draw none of it, and carried in their first load it put People's page over its ceiling (the loadability review,
 * 19 Oct 2026). Fetched at once where the address the tab opened on names a person (people-route.tsx), once People's list
 * is idle, and as a pointer reaches a person's link anywhere (`__warmPerson`, below), so a press finds it in. What it
 * reads of the module is named, so the dead-exports check (knip) sees the use.
 */
export const profileCode = codeOnce(() =>
  import("./person/person-real").then(({ ClientProfile }) => ({ ClientProfile })),
);

export function personDetail(id: string): Promise<PersonVM | null> {
  return people().through(id, async () => {
    // Its days and times by the business's clock (zone.ts), read beside the person rather than after.
    // And the shaping's own code, fetched beside both the first time (person-shape.ts).
    const [r, tz, shape] = await Promise.all([
      api()("GET contacts/[id]", { params: { id } }),
      workspaceZone(),
      personShape(),
    ]);
    // For the member looking (__ME): a teammate's thread is theirs, not waiting on you.
    const me = (window as unknown as { __ME?: { id?: string | null } }).__ME?.id ?? null;
    // More's sends are judged against the lines People read (null until it has: the sheet judges them again).
    if (r.ok)
      return shape.toPersonVM(r.data.person, tz, new Date(), me, {
        names: holderName,
        ready: peopleLoaded?.channelsReady ?? null,
      });
    // Gone: the copy this tab kept of them goes too, or the next open would paint someone who is not there. Combined
    // into someone since (0028): the record kept is noted, for the page to open them instead (personMovedTo).
    if (r.status === 404) {
      people().forget(id);
      if (r.movedTo) movedTo.set(id, r.movedTo);
      else movedTo.delete(id);
      return null;
    }
    throw new ApiError(r.code, r.status, r.message);
  });
}

/** The people this tab asked for who were combined into another (0028), by the record kept, as the server said. */
const movedTo = new Map<string, string>();

/** The record a person was combined into, when the server said so of them (personDetail); null for anyone else. */
export function personMovedTo(id: string): string | null {
  return movedTo.get(id) ?? null;
}

/** The person this tab already read, if it has. Synchronous: what the page paints first. */
export function peekPerson(id: string): PersonVM | null {
  return people().peek(id);
}

/**
 * Read someone before their row is clicked. People is a list you open, go back
 * from and open again, and every one of those opens re-read the person and put
 * "Loading..." over the page while it did.
 */
export function warmPerson(id: string): Promise<PersonVM | null> | null {
  return people().warm(id, () => personDetail(id));
}

/** How old a person's page may be while it is on screen: its visits, steps and waits are said by the clock. */
const PERSON_READ_EVERY_MS = 5 * MIN_MS;

/** How many of a list's first rows are read ahead, and how many of those reads are out at once. */
const AHEAD = 12;
const AHEAD_LANES = 2;
let ahead: string[] = [];
let aheadOut = 0;

/**
 * Read the people a list shows before any of them is pressed: `warmPeople(ids)`, the rows on screen in their
 * order. A person the tab does not hold opens on nothing of theirs until their whole page is in (client-profile.jsx),
 * so the one way their page opens at once is to have read them already. Measured on production (24 Sep 2026): a person
 * never opened drew their page 289 ms after the press; one the tab held, in 8. Only after the boot (afterBoot), two at
 * a time, the first twelve, and only those the tab does not hold at all (a copy from before is read again as a pointer
 * reaches it). A later list replaces what an earlier one was still waiting to read.
 */
export function warmPeople(ids: string[]): void {
  if (!getActiveWorkspace()) return;
  ahead = [...new Set(ids)].slice(0, AHEAD).filter((id) => !people().peek(id));
  if (!ahead.length) return;
  // Asked a step later: on a reload a list draws from the tab before the shell starts the boot (a child's effects run
  // before its parent's), and asked at once, afterBoot answered for no boot at all.
  void Promise.resolve().then(afterBoot).then(readAhead);
}

function readAhead(): void {
  while (aheadOut < AHEAD_LANES && ahead.length) {
    const id = ahead.shift() as string;
    if (people().peek(id)) continue;
    aheadOut += 1;
    personDetail(id)
      .catch(() => null)
      .finally(() => {
        aheadOut -= 1;
        readAhead();
      });
  }
}

/** The person whose page is on screen, by the id in the address; null on any other page. */
function personOnScreen(win: Window = window): string | null {
  const [page = "", param] = routeOnScreen(win).split("/");
  return personRouteId(page, param);
}

/**
 * A tab opened on a person's page reads them before anything else: called once, at module scope, before React and
 * the surfaces' boot (LegacyApp.tsx). The page's own read, a moment later, shares this one (client/api.ts). Measured
 * on production (23 Sep 2026): on a reload their read went out beside eight of the boot's and took 1.4 s, against
 * 0.3-0.7 s alone. Off a workspace page nothing is read: a read that names no workspace is refused.
 */
export function warmPersonOnScreen(win: Window = window): void {
  if (!getActiveWorkspace()) return;
  const id = personOnScreen(win);
  if (!id) return;
  // The surfaces nobody is looking at wait for this read as they wait for the page's own (surface-runner.ts
  // bootWaitsFor): out beside nine of theirs it took 3,236 ms, alone 773 (25 Sep 2026).
  const read = warmPerson(id);
  if (read) bootWaitsFor(read);
}

/**
 * A person's page, as a surface of its own (decision 0058; the wiring's second audit, W-thread-wait-step-1,
 * W-person-list-lead-1, W-review-facts-rules-7): what the page draws of them that People does not hear on every page --
 * the person (a rename, a stop, a merge, the business they work at), a hold opened or settled, a call starting or ending, a
 * run made or sent, the campaigns and the rules their lines name, the business's facts, their business. People's whole book is
 * the dearest read
 * there is and hears those on its own list alone (onlyOnItsPage), so the page heard none of them; this reads the one person on
 * screen instead, and only there (PAGE_HEARS["clients/person"]): elsewhere a change is kept for the page, read once as it
 * comes on screen. A notice carries no id, so any change of these re-reads the one person, debounced like every surface.
 *
 * What People hears on every page (a visit, a deal, a step, a list, a reach-out reply's signer) still reaches the page through
 * People's read (`surface:clients`), and a message or a move of their thread through the Inbox and Conversations, which hear every one
 * (their-thread.ts). The page paints what this read left in the tab (`surface:person`).
 */
export const personOverride: SurfaceOverride = {
  key: "person",
  events: ["surface:person"],
  ...declareReads("person", {
    // And the team, whose names say who wrote a note or took a step; and the mailbox a business's emails left from, named in its
    // reach-out story (decision 0056).
    reads: ["person", "hold", "call", "send", "campaign", "rules", "facts", "lead", "team", "channel"],
    fresh: "its-page",
    omit: [
      {
        tables: ["lead_searches", "lead_rounds", "lead_search_members"],
        why: "the page names the business a person works at (a lead); the searches that found leads, their rounds and members are Leads'",
      },
      {
        tables: ["invitations"],
        why: "the page names the members who wrote or took something; an invitation not yet taken names no one",
      },
      {
        tables: ["tenant_channels", "lines", "mailboxes", "capability_activations", "business_records"],
        why: "the page names the connected mailbox a business's emails left from; the numbers, the lines, the hosted mailbox, an activation and the carriers' record are Connections'",
      },
    ],
    // A row made now is not the person on screen, nor the business they work at: a lead run inserts leads every few seconds
    // and an import inserts people by the hundred. A person linked to a business, or combined, is a change of the person. A
    // call's transcript turn changes nothing the page draws; its start and its end do.
    when: (c) => !isLiveCallTurn(c) && (c.event !== "INSERT" || (c.table !== "leads" && c.table !== "contacts")),
  }),
  // Read where a person's page is drawn (ROUTE_DRAWS), never by a boot on another page.
  onDemand: true,
  // And again every five minutes while it is on screen: their visits, a step falling due and a thread's wait are said by the
  // clock, and the page is made in the read (hearing/clock.ts; the wiring's second audit, W-visit-deal-1).
  readEveryMs: PERSON_READ_EVERY_MS,
  apply: async () => {
    const id = personOnScreen();
    if (id) await personDetail(id);
  },
};

/** The client's answer, as the pages read it: `ok`, `data`, or the refusal's `message`. */
type DeleteResult = ApiResult<unknown>;

/**
 * A verb's answer as this courier's callers read it: the door's answer, or its refusal. Each writer below commits through
 * its verb's spec (legacy-bridge/verbs, contracts PROPOSAL_SPECS), the walk Ask's cards take too, so the same act makes the
 * same call whichever hand pressed it (the sheets as verbs, 14 Oct 2026).
 */
function verbAnswer<O>(r: VerbResult): ApiResult<O> {
  return r.ok ? { ok: true, data: r.data as O } : r;
}

/**
 * Delete this person.
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
 *
 * Made on first use, not when this module loads: the frame's chrome for a person's address asks for the held copy
 * (person/read.ts), and the frame's own module graph (workspace.ts, routes.ts, chrome.ts) reaches this one from inside
 * read-cache.ts's imports, where its registry is not yet made.
 */
let personCache: ReturnType<typeof readCache<PersonVM | null>> | undefined;
const people = () => (personCache ??= readCache<PersonVM | null>("person", (vm) => vm !== null, { tab: true }));

export async function deletePerson(id: string): Promise<DeleteResult> {
  const r = await api()("DELETE contacts/[id]", { params: { id } });
  if (r.ok) {
    people().forget(id);
    deletedHere.add(id);
  }
  return r;
}

/** The people this tab deleted (deletePerson). */
const deletedHere = new Set<string>();

/**
 * Whether this tab deleted this person. A person's page leaves a delete by People's Back, to the entry they were opened
 * from, and since the peek (canvas A, PEEK-01) that entry is the view with them peeked at: a peek's address that names
 * someone deleted here is the view's own, never a peek that says they are not in the workspace.
 */
export function personDeletedHere(id: string): boolean {
  return deletedHere.has(id);
}

/**
 * Two records of one person become one (decision 0028): `keep` stays, `merge` folds into it. Owner-only on the server,
 * and never undone; the page asks for the kept person's name typed first. The write re-reads People (the merged record
 * is a marked row now, which People does not show) and the kept person's page; the merged page the tab held is dropped.
 */
export async function mergePerson(keep: string, merge: string): Promise<DeleteResult> {
  const r = verbAnswer<unknown>(await commitVerb("person_merge", { contact_id: keep, merge }));
  // Combine (0052) keeps the person, whichever was named to keep: the record the door merged away is the one let go.
  if (r.ok) people().forget(keptOf(r.data, keep) === keep ? merge : keep);
  return r;
}

/** The record a merge kept, as the door answers it (its contact_id), else the one named to keep. */
export function keptOf(answer: unknown, keep: string): string {
  const kept: unknown = answer && typeof answer === "object" ? Reflect.get(answer, "contact_id") : undefined;
  return typeof kept === "string" && kept ? kept : keep;
}

/**
 * Not the same (decision 0034, step 4): the doubt the door raised on this person is settled as two people, and the
 * next arrival never raises it again. Any acting member's; the page reads itself again afterwards, with the row gone.
 */
export async function settleDoubt(id: string, doubtId: string): Promise<DeleteResult> {
  return api()("POST contacts/[id]/doubts/dismiss", { params: { id }, body: { doubt_id: doubtId } });
}

/**
 * Receptionist mode for one person.
 *
 * "auto" / "ask" / "never" set the person's own row; "inherit" removes it so
 * they follow the workspace policy again. Owner-only on the server. The list
 * is re-read afterwards because the Receptionist column reads from it.
 */
export async function setPersonReceptionist(
  id: string,
  mode: "auto" | "ask" | "never" | "inherit",
): Promise<DeleteResult> {
  return verbAnswer(await commitVerb("person_mode", { contact_id: id, mode }));
}

/**
 * A customer's answer, recorded by whoever heard it.
 *
 * TWO QUESTIONS, TWO DOORS, and they are never interchangeable:
 *
 *   "conversational"  messages about their own visit, and a reply when they
 *                     write. `setPersonConsent(id, body)`.
 *   "marketing"       offers and news. `setPersonMarketingConsent(...)`.
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
interface ConsentBody {
  consent: "opted_in" | "opted_out" | "unknown";
  source?: string;
  note?: string;
  /** The message they said it in, when the source is their own message (00137): one person's, so never a batch's. */
  message_id?: string;
}

/* One verb, the door chosen by purpose in its spec (contracts answerSpec), so neither answer can be posted to the other's
   door by a typo in a page. */

async function recordOne(id: string, body: ConsentBody, purpose: AskedPurpose): Promise<DeleteResult> {
  return verbAnswer(await commitVerb("answer", { contact_id: id, purpose, ...body }));
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
 * class, say: `setPersonConsentMany(ids, body)`. ONE request, fifty
 * at most, through the batch door (server/people/consent.ts), which walks the same
 * per-person door each would go through alone and records a decision per
 * person. It used to be one request per person -- fifty round trips and
 * fifty takes of the consent bucket for one act at the desk.
 */
interface ManyResult {
  ok: boolean;
  done: number;
  failed: number;
  message?: string;
}

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
  return manyResult(verbAnswer(await commitVerb("answer_many", { ids: take, purpose, ...body })), take.length);
}

export type ReceptionistMany = "auto" | "ask" | "never" | "inherit";

/** The receptionist's mode for a selection. Owners; one request. */
export async function setPersonReceptionistMany(ids: string[], mode: ReceptionistMany): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  return manyResult(verbAnswer(await commitVerb("person_mode_many", { ids: take, mode })), take.length, "changed");
}

/** One note line under a selection's notes. Operator or owner; one request. */
export async function appendPersonNotesMany(ids: string[], line: string): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  return manyResult(verbAnswer(await commitVerb("note_many", { ids: take, append: line })), take.length, "noted");
}

/**
 * A person added by hand: a number and, if known, a name, through the door
 * the calendar sweep uses (POST /contacts: get-or-create, consent unknown).
 * `addPerson({ phone, name })` answers with the id and whether they
 * were already here; the People surface re-reads after it.
 */
export async function addPerson(body: {
  phone?: string;
  email?: string;
  name?: string;
}): Promise<ApiResult<{ contact_id: string; existed: boolean }>> {
  return verbAnswer(await commitVerb("person_add", body));
}

/**
 * One part of an imported client list: `importPeople({ import_id, rows })`, fifty rows at most, through the
 * owner's door (POST /contacts/import). The People surface re-reads after each part (refresh-map).
 */
export async function importPeople(body: {
  import_id: string;
  rows: {
    name?: string;
    phone?: string;
    email?: string;
    facts?: { last_visit?: string; visits?: number; birthday?: string; notes?: string };
  }[];
  part?: { n: number; of: number };
  via?: string;
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
 * A page remembering its view in this workspace: `saveView("people",
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
 * A deal on a person's word (0004): `recordDeal(id, body)`. No `deal_id`
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
  // The row moves as the door answers (0008): the door answers the deal the person's People row shows now (`current`,
  // people_list's rule), which the verb walk lays on the row at once (legacy-bridge/verbs/effects.ts), and People and
  // Reports are read again behind it, so the sheet closes when the server takes the move rather than once every person
  // has been read again. One intent, however often Save is pressed (decision 0035).
  return verbAnswer(
    await commitVerb("deal", { contact_id: id, ...body }, { refresh: opts.refresh === false ? false : "behind" }),
  );
}

/**
 * A selection's pass (0008, the Pipeline's Mark as passed · N): `passDeals(items, reason)`.
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
  // `rowId`: the Pipeline row each was picked as (0029), which is what `passed` names, so its selection drops those rows.
  items: readonly { personId: string; dealId: string; rowId?: string }[],
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
    if (r.ok) passed.push(it.rowId ?? it.personId);
    else if (r.message === DEAL_REFUSALS.moved) changed.push(it.personId);
    else failed.push(it.personId);
  }
  // As the client's own refresh after a write does: the tab's copies of what changed are read again, then the surfaces.
  if (items.length) {
    staleReadCaches();
    await import("@/legacy-bridge/refresh-map").then((m) => m.refreshAfter("POST contacts/[id]/deal"));
  }
  return { passed, changed, failed };
}

/**
 * A person's notes (0007): `writePersonNote(id, body)` adds one (no `note_id`) or changes its author's own (with
 * `note_id` and the version the page saw); `removePersonNote` takes one away; `decidePersonNote` keeps or dismisses the
 * receptionist's suggestion. The page re-reads the person after each; nothing else shows a note.
 */
interface NoteBody {
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
  // Who reads it is the note's own word, the door's default (the receptionist's) where a caller says none.
  return verbAnswer(await commitVerb("note", { contact_id: id, ...body, team_only: body.team_only ?? false }));
}

/**
 * A call the member made, logged (0052, canvas A M4): a note, a step with a day, and the outcome on the lead their business
 * is, where it is open. Once: a second press of a slow Save is not a second call.
 */
export async function logCallOn(
  id: string,
  body: PersonCallBody,
): Promise<ApiResult<{ note: PersonNoteDto | null; step: PersonNoteDto | null; lead: { stage: string } | null }>> {
  return api()("POST contacts/[id]/call", { params: { id }, body, refresh: "behind", once: true });
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

/** Got it (canvas A, Up next): a note for the reader, marked read; it leaves their Up next. */
export async function seePersonNote(id: string, noteId: string): Promise<ApiResult<{ seen: string }>> {
  return api()("POST contacts/[id]/notes/seen", { params: { id }, body: { note_id: noteId } });
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
    /** A person's steps as the shell's pages still reach them (0007): one done or open again (00166), and a step's day once
     * it has come, as every page judges it (contracts steps.ts): Today's queue and the Inbox's thread header. */
    __personNotes?: {
      done: typeof markStepDone;
      dueDay: typeof dueStepDay;
    };
    /** Read someone before their row is clicked (the shell's `routeDoor` asks, frame-doors.ts). */
    __warmPerson?: (id: string) => void;
    /** A deal's acts as the thread's Deal group offers them (0008: deal-sheet.ts dealMenuActs), and their words. */
    __deal?: {
      menu: typeof dealMenuActs;
      actWords: typeof DEAL_ACT_WORDS;
    };
  }
}

/**
 * A person's name, the owner's notes and their email address:
 * `setPersonDetails(id, { name?, notes?, email? })`. A proposal's link is its deal's, set in the deal
 * sheet (0008).
 *
 * Owner or operator on the server; an empty string clears. The People list
 * is re-read because names show on every row, and the profile reloads on
 * the same event.
 */
interface DetailsBody {
  name?: string;
  notes?: string;
  email?: string;
}

export async function setPersonDetails(id: string, body: DetailsBody): Promise<DeleteResult> {
  return api()("PUT contacts/[id]/details", { params: { id }, body });
}

/** "Link a business…" (a lead of the workspace) and "Not at this business" (null), decision 0052. */
export async function setPersonBusiness(id: string, leadId: string | null): Promise<DeleteResult> {
  if (leadId === null) return api()("DELETE people/[id]/business", { params: { id } });
  return api()("PUT people/[id]/business", { params: { id }, body: { lead_id: leadId } });
}

/**
 * What the shell's pages still reach a person's steps and deals through: only what one reads (the hover's warm, a step's
 * day and its done, the thread's deal acts). The sheets, cards and notes import their rules from contracts; published here
 * too, every page's first load carried the deal and step sheets' rules for nobody (the loadability review, 19 Oct 2026).
 */
export function installPeopleCourier(): void {
  // A pointer at a person's link: their read, and the page's own code where it is not in yet (profileCode, above).
  window.__warmPerson = (id) => {
    void warmPerson(id);
    profileCode.warm();
  };
  window.__personNotes = { done: markStepDone, dueDay: dueStepDay };
  window.__deal = { menu: dealMenuActs, actWords: DEAL_ACT_WORDS };
}
