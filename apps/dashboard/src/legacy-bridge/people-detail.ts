import { CONSENT_SOURCES, TIMELINE_FILTERS, filterTimeline, mayReceive, offersYesRefusal, toPersonVM, verbalOptInScript, type PersonVM, type SendPurpose } from "@chanlytics/contracts";
import { api } from "./api";
import { ApiError, type ApiResult } from "../client/api";
import { workspaceZone } from "./zone";
import { readCache } from "./read-cache";

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
    if (r.ok) return toPersonVM(r.data.person, tz);
    if (r.status === 404) return null;
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
export function warmPerson(id: string): void {
  people.warm(id, () => personDetail(id));
}

/** The client's answer, as the pages read it: `ok`, `data`, or the refusal's `message`. */
export type DeleteResult = ApiResult<unknown>;

/**
 * Delete this person: `window.__deletePerson(id)`.
 *
 * The route is the one the privacy policy promises — Postgres rows, Storage
 * media, the Blob thread and any queued job — and it is owner-only on the
 * server, so a viewer's click returns the server's refusal rather than a
 * pretend success. After it lands the refresh map re-reads every surface that
 * named the person — the list, the Inbox, the threads and Today — so nothing
 * keeps showing someone who no longer exists.
 */
/**
 * The people this tab has opened.
 *
 * A "not in your workspace" is not held: it is the one answer that changes the
 * moment somebody adds them, and painting it from memory would say they are
 * gone when they are not. Every write clears this along with every other
 * on-demand answer (legacy-bridge/api.ts).
 */
const people = readCache<PersonVM | null>("person", (vm) => vm !== null);

export async function deletePerson(id: string): Promise<DeleteResult> {
  return api()("DELETE contacts/[id]", { params: { id } });
}

/**
 * Receptionist mode for one person: `window.__setPersonReceptionist(id, mode)`.
 *
 * "auto" / "ask" / "never" set the person's own row; "inherit" removes it so
 * they follow the workspace policy again. Owner-only on the server. The list
 * is re-read afterwards because the Receptionist column reads from it.
 */
export async function setPersonReceptionist(id: string, mode: "auto" | "ask" | "never" | "inherit"): Promise<DeleteResult> {
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
}

/** One transport, the route chosen by purpose, so neither answer can be posted to the other's door by a typo in a page. */
type ConsentRoute = "PUT contacts/[id]/consent" | "PUT contacts/[id]/marketing-consent";
const CONSENT_ROUTE: Record<SendPurpose, ConsentRoute> = {
  conversational: "PUT contacts/[id]/consent",
  marketing: "PUT contacts/[id]/marketing-consent",
};

async function recordOne(id: string, body: ConsentBody, purpose: SendPurpose): Promise<DeleteResult> {
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
export interface ManyResult { ok: boolean; done: number; failed: number; message?: string }

type ManyRoute = "PUT contacts/consent" | "PUT contacts/marketing-consent";
const MANY_ROUTE: Record<SendPurpose, ManyRoute> = {
  conversational: "PUT contacts/consent",
  marketing: "PUT contacts/marketing-consent",
};

/** A batch door's answer, in the bar's words. Not ours, or gone: not done, and said so -- it is not an error to have selected a row that changed underneath you. */
function manyResult(r: ApiResult<unknown>, asked: number, verb = "recorded"): ManyResult {
  if (!r.ok) return { ok: false, done: 0, failed: asked, message: r.message };
  const d = r.data as { done: number; failed: { id: string; message: string }[]; skipped: string[] };
  const failed = d.failed.length + d.skipped.length;
  const why = d.failed[0]?.message ?? (d.skipped.length ? "no longer in this workspace" : undefined);
  return { ok: failed === 0, done: d.done, failed, message: failed ? `${failed} could not be ${verb}${why ? ` — ${why}` : ""}` : undefined };
}

async function recordMany(ids: string[], body: ConsentBody, purpose: SendPurpose): Promise<ManyResult> {
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
export async function addPerson(body: { phone: string; name?: string }): Promise<ApiResult<{ contact_id: string; existed: boolean }>> {
  return api()("POST contacts", { body });
}

/**
 * A page remembering its view in this workspace: `window.__saveView("people",
 * { sortBy, sortDir, attentionTab })`. The member's own row, per workspace,
 * so a phone and a laptop show the page the same way. No surface re-read: the
 * view is the caller's own state already.
 */
export async function saveView(page: string, view: Record<string, unknown>): Promise<ApiResult<{ views: Record<string, unknown> }>> {
  return api()("PUT views/[page]", { params: { page }, body: { view }, refresh: false });
}

export async function setPersonConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "conversational");
}

/** A signed marketing consent recorded for a whole class at once. */
export async function setPersonMarketingConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "marketing");
}

declare global {
  interface Window {
    __personDetail?: (id: string) => Promise<PersonVM | null>;
    /** The person this tab already read: what the page paints before its own read lands. */
    __peekPerson?: (id: string) => PersonVM | null;
    /** Read someone before their row is clicked. */
    __warmPerson?: (id: string) => void;
    __setPersonConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __setPersonMarketingConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonMarketingConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __consentSources?: readonly { id: string; label: string }[];
    __timeline?: { filters: typeof TIMELINE_FILTERS; filter: typeof filterTimeline };
    /** The broadcast's own "may this person be reached", for pages that count people. */
    __mayReceive?: typeof mayReceive;
    /** The ways a yes to OFFERS may be recorded: in writing only (00100). A no keeps every source. */
    __offersYesSources?: readonly { id: string; label: string }[];
    /** What staff ask in person or on the phone -- the sentence the campaign files as its spoken opt-in. */
    __verbalOptInScript?: (businessName: string) => string;
    __setPersonReceptionistMany?: (ids: string[], mode: ReceptionistMany) => Promise<ManyResult>;
    __appendPersonNotesMany?: (ids: string[], line: string) => Promise<ManyResult>;
    __addPerson?: (body: { phone: string; name?: string }) => Promise<ApiResult<{ contact_id: string; existed: boolean }>>;
    __saveView?: (page: string, view: Record<string, unknown>) => Promise<ApiResult<{ views: Record<string, unknown> }>>;
    __deletePerson?: (id: string) => Promise<DeleteResult>;
    __setPersonDetails?: (id: string, body: DetailsBody) => Promise<DeleteResult>;
    __setPersonReceptionist?: (id: string, mode: "auto" | "ask" | "never" | "inherit") => Promise<DeleteResult>;
  }
}

/**
 * A person's name, the owner's notes and their email address:
 * `window.__setPersonDetails(id, { name?, notes?, email? })`.
 *
 * Owner or operator on the server; an empty string clears. The People list
 * is re-read because names show on every row, and the profile reloads on
 * the same event.
 */
export interface DetailsBody { name?: string; notes?: string; email?: string }

export async function setPersonDetails(id: string, body: DetailsBody): Promise<DeleteResult> {
  return api()("PUT contacts/[id]/details", { params: { id }, body });
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
  window.__peekPerson = peekPerson;
  window.__warmPerson = warmPerson;
  window.__setPersonConsentMany = setPersonConsentMany;
  window.__setPersonDetails = setPersonDetails;
  window.__deletePerson = deletePerson;
  window.__setPersonReceptionist = setPersonReceptionist;
  window.__setPersonConsent = setPersonConsent;
  window.__setPersonMarketingConsent = setPersonMarketingConsent;
  window.__setPersonMarketingConsentMany = setPersonMarketingConsentMany;
  window.__consentSources = CONSENT_SOURCES;
  // The timeline's filters and the rule that applies them: a profile narrows by the kinds contracts names.
  window.__timeline = { filters: TIMELINE_FILTERS, filter: filterTimeline };
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
  window.__saveView = saveView;
}
