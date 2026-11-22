import "server-only";

/**
 * A business's forms as its own screens read them (00680; the Forms plan, 3.6): the list in Campaigns › Forms, one
 * form's sheet, and one request as Inbox answers it. Each is read on the member's own session, under its row rules.
 * Nothing here is kept apart from the record: whether a request was answered is read from its links (the requests
 * nobody has answered are form_requests_open's), and what a place brought is form_results'.
 */
import {
  AppError,
  DAY_MS,
  FORM_HELD_SAID_AFTER_DAYS,
  formRequestNote,
  MIN_MS,
  recordOrEmpty,
  requestLines,
  roleAtLeast,
  Source,
  sourceInWords,
  type FormDescription,
  type FormEntryRowDto,
  type FormHeldDto,
  type FormLinkDto,
  type FormListRowDto,
  type FormOpenRequestDto,
  type FormRequestDto,
  type FormsDto,
  type FormSheetDto,
  type FormsReportDto,
} from "@chanlytics/contracts";
import { findOldestActiveChannel } from "@chanlytics/db/channels";
import {
  countHeldFormEntries,
  findForm,
  findFormRequest,
  findFormVersion,
  findLinkPlace,
  listFormEntries,
  listFormEntriesHeldBefore,
  listFormEntryLinks,
  listFormLinks,
  listForms,
  listFormVersions,
  listOpenFormRequests,
  listWorkspaceFormLinks,
  readFormResults,
  type FormEntryRead,
  type FormRead,
} from "@chanlytics/db/forms";
import { findPersonAddress } from "@chanlytics/db/people";
import { readerStamp, stableJson, type Reader, type ReaderContext } from "../shared/reader";

/** How far back a form's sheet counts what it brought. */
const RESULT_DAYS = 30;
/** The most entries a sheet lists: the newest; the rest are in Inbox as they were answered. */
const SHEET_ENTRIES = 60;

/** Whether a member may make and change forms: an owner, an operator, or a partner, as with a campaign's sequences. */
const mayChange = (rc: ReaderContext): boolean => roleAtLeast(rc.role, "operator");

/** Whether a published form's draft holds changes its visitors do not see yet. */
const changedSince = (draft: FormDescription | null, live: FormDescription | null): boolean =>
  !!draft && !!live && stableJson(draft) !== stableJson(live);

/** Campaigns › Forms: every form, the newest first, each with whether it is live and how many entries it holds. */
export const formsList: Reader<undefined, FormsDto> = {
  name: "forms_list",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [forms, held] = await Promise.all([listForms(db, rc.tenantId), countHeldFormEntries(db, rc.tenantId)]);
    const versions = await listFormVersions(
      db,
      rc.tenantId,
      forms.flatMap((form) => (form.liveVersionId ? [form.liveVersionId] : [])),
    );
    const liveBy = new Map(versions.map((version) => [version.id, version.description]));
    const rows: FormListRowDto[] = forms.map((form) => {
      const live = form.liveVersionId ? (liveBy.get(form.liveVersionId) ?? null) : null;
      return {
        id: form.id,
        slug: form.slug,
        heading: form.draft?.heading ?? live?.heading ?? form.slug,
        state: form.state,
        changed: changedSince(form.draft, live),
        last_entry_at: form.lastEntryAt,
        held: held.get(form.id) ?? 0,
      };
    });
    const data: FormsDto = { forms: rows, can_change: mayChange(rc) };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/** One entry as a sheet lists it. `open`: the requests nobody has answered. `places`: where each link is shared. */
function entryRow(
  entry: FormEntryRead,
  open: ReadonlySet<string>,
  places: ReadonlyMap<string, string>,
): FormEntryRowDto {
  const standing = entry.test ? "test" : entry.state === "held" ? "held" : open.has(entry.id) ? "open" : "answered";
  return {
    id: entry.id,
    name: entry.reach.name ?? entry.reach.email ?? entry.reach.phone,
    created_at: entry.createdAt,
    standing,
    held_why: entry.heldWhy,
    place: entry.linkId ? (places.get(entry.linkId) ?? null) : null,
    phone_only: !entry.reach.email && !!entry.reach.phone,
  };
}

/** The form a sheet or a press names, or a refusal in the house's words where the workspace has none by that id. */
export async function findFormOrRefuse(
  rc: Pick<ReaderContext, "ctx" | "tenantId">,
  formId: string,
): Promise<FormRead & { draft: FormDescription }> {
  const form = await findForm(rc.ctx.supabase, rc.tenantId, formId);
  if (!form?.draft) throw new AppError("not_found", "That form isn't here any more.", 404);
  return { ...form, draft: form.draft };
}

/** A form's sheet: the form as it is being changed, where it is shared and what each place brought, and its entries. */
export const formSheet: Reader<{ form: string }, FormSheetDto> = {
  name: "form_sheet",
  async read(rc, args) {
    const db = rc.ctx.supabase;
    const form = await findFormOrRefuse(rc, args.form);
    const [live, links, results, entries, open, chat] = await Promise.all([
      form.liveVersionId ? findFormVersion(db, rc.tenantId, form.liveVersionId) : null,
      listFormLinks(db, rc.tenantId, form.id),
      readFormResults(db, rc.tenantId, RESULT_DAYS),
      listFormEntries(db, { tenantId: rc.tenantId, formId: form.id, limit: SHEET_ENTRIES }),
      listOpenFormRequests(db, rc.tenantId),
      findOldestActiveChannel(db, rc.tenantId, "whatsapp"),
    ]);
    const mine = results.places.filter((place) => place.formId === form.id);
    const sum = (pick: (place: (typeof mine)[number]) => number) =>
      mine.reduce((total, place) => total + pick(place), 0);
    const linkRows: FormLinkDto[] = links.map((link) => {
      const brought = mine.find((place) => place.linkId === link.id);
      return {
        id: link.id,
        code: link.code,
        place: link.place,
        printed: link.printed,
        stopped: link.stoppedAt !== null,
        opens: results.opens.get(link.id) ?? 0,
        requests: brought?.requests ?? 0,
        visits: brought?.visits ?? 0,
      };
    });
    const openIds = new Set(open.map((request) => request.id));
    const places = new Map(links.map((link) => [link.id, link.place]));
    const rows = entries.map((entry) => entryRow(entry, openIds, places));
    const people = sum((place) => place.people);
    const newPeople = sum((place) => place.newPeople);
    const data: FormSheetDto = {
      id: form.id,
      slug: form.slug,
      state: form.state,
      draft: form.draft,
      live: live?.description ?? null,
      changed: changedSince(form.draft, live?.description ?? null),
      published_at: live?.publishedAt ?? null,
      last_entry_at: form.lastEntryAt,
      links: linkRows,
      results: {
        days: RESULT_DAYS,
        opens: linkRows.reduce((total, link) => total + link.opens, 0),
        requests: sum((place) => place.requests),
        talked: sum((place) => place.talked),
        visits: sum((place) => place.visits),
        new_people: newPeople,
        known_people: Math.max(0, people - newPeople),
      },
      entries: rows.filter((row) => row.standing !== "held"),
      held: rows.filter((row) => row.standing === "held"),
      chat: chat !== null,
      can_change: mayChange(rc),
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/**
 * What the workspace's forms brought over the last thirty days, as Reports › Campaigns says it (form_results, read
 * under the member's own row rules): each form that was ever published, by the places its requests came through. A
 * request that came through no link (the form's own address) is the form's alone, in its totals and under no place.
 */
export const formsReport: Reader<undefined, FormsReportDto> = {
  name: "forms_report",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [forms, links, results] = await Promise.all([
      listForms(db, rc.tenantId),
      listWorkspaceFormLinks(db, rc.tenantId),
      readFormResults(db, rc.tenantId, RESULT_DAYS),
    ]);
    const published = forms.filter((form) => form.liveVersionId !== null);
    const versions = await listFormVersions(
      db,
      rc.tenantId,
      published.flatMap((form) => (form.liveVersionId ? [form.liveVersionId] : [])),
    );
    const headingBy = new Map(versions.map((version) => [version.id, version.description?.heading ?? null]));
    const data: FormsReportDto = {
      days: RESULT_DAYS,
      forms: published.map((form) => {
        const mine = results.places.filter((place) => place.formId === form.id);
        const sum = (pick: (place: (typeof mine)[number]) => number) =>
          mine.reduce((total, place) => total + pick(place), 0);
        const own = links.filter((link) => link.formId === form.id);
        const people = sum((place) => place.people);
        const newPeople = sum((place) => place.newPeople);
        return {
          id: form.id,
          heading: (form.liveVersionId ? headingBy.get(form.liveVersionId) : null) ?? form.draft?.heading ?? form.slug,
          results: {
            opens: own.reduce((total, link) => total + (results.opens.get(link.id) ?? 0), 0),
            requests: sum((place) => place.requests),
            talked: sum((place) => place.talked),
            visits: sum((place) => place.visits),
            new_people: newPeople,
            known_people: Math.max(0, people - newPeople),
          },
          places: own.flatMap((link) => {
            const brought = mine.find((place) => place.linkId === link.id);
            return brought ? [{ place: link.place, requests: brought.requests, visits: brought.visits }] : [];
          }),
        };
      }),
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/** The most of a person's own words a row carries: the row cuts it to its lines. */
const ROW_WORDS_MAX = 240;

/**
 * What a request says first: their own words (the first longer answer), else the first thing they answered that is not
 * who they are. Empty where the form asked for nothing else.
 */
function requestWordsOf(described: FormDescription | null, answers: Record<string, unknown>): string {
  if (!described) return "";
  const lines = requestLines(described, answers);
  const nameId = described.fields.find((field) => field.kind === "short")?.id;
  const wrote =
    lines.find((line) => line.kind === "long") ??
    lines.find((line) => line.id !== nameId && line.kind !== "email" && line.kind !== "phone");
  return (wrote?.words ?? "").slice(0, ROW_WORDS_MAX);
}

/**
 * The requests nobody has answered, as Needs you lists them (form_requests_open: sixty days, the newest first): Today's
 * read carries them, so the page, the Inbox's tab, the one count and AI say the same people. Each is read against the
 * version its visitor saw, which says which answer is their own words.
 */
export const formRequestsOpen: Reader<undefined, { requests: FormOpenRequestDto[]; held: FormHeldDto[] }> = {
  name: "form_requests_open",
  async read(rc) {
    const db = rc.ctx.supabase;
    const leftSince = new Date(rc.now.getTime() - FORM_HELD_SAID_AFTER_DAYS * DAY_MS).toISOString();
    const [open, left] = await Promise.all([
      listOpenFormRequests(db, rc.tenantId),
      listFormEntriesHeldBefore(db, rc.tenantId, leftSince),
    ]);
    const versions = await listFormVersions(db, rc.tenantId, [
      ...new Set([...open, ...left].map((entry) => entry.versionId)),
    ]);
    const describedBy = new Map(versions.map((version) => [version.id, version.description]));
    const requests: FormOpenRequestDto[] = open.map((request) => ({
      id: request.id,
      form_id: request.formId,
      heading: request.heading ?? "",
      created_at: request.createdAt,
      person_id: request.contactId,
      name: request.reach.name ?? request.reach.email ?? request.reach.phone,
      words: requestWordsOf(describedBy.get(request.versionId) ?? null, request.answers),
      place: request.place,
      phone_only: !request.reach.email && !!request.reach.phone,
      unreached: request.unreached,
    }));
    // Each form's held pile nobody has looked at, the oldest first: its heading as its newest visitor saw it.
    const piles = new Map<string, FormHeldDto>();
    for (const entry of left) {
      const pile = piles.get(entry.formId);
      const heading = describedBy.get(entry.versionId)?.heading ?? pile?.heading ?? "";
      piles.set(entry.formId, {
        form_id: entry.formId,
        heading,
        held: (pile?.held ?? 0) + 1,
        oldest_at: pile?.oldest_at ?? entry.createdAt,
      });
    }
    return { data: { requests, held: [...piles.values()] }, rows: [], stamp: readerStamp() };
  },
};

/** What answered a request, from its links: a member's word first, then a conversation, then the newest reply. */
function answeredBy(
  links: Awaited<ReturnType<typeof listFormEntryLinks>>,
): NonNullable<FormRequestDto["answered"]> | null {
  const by = (kind: "marked" | "conversation" | "reply") => links.filter((link) => link.kind === kind).at(-1);
  const link = by("marked") ?? by("conversation") ?? by("reply");
  if (!link || link.kind === "visit") return null;
  return { how: link.kind, at: link.createdAt, conversation_id: link.conversationId };
}

/** One request as Inbox answers it: what was asked, who, how they came, and where it stands. */
export const formRequest: Reader<{ id: string }, FormRequestDto> = {
  name: "form_request",
  async read(rc, args) {
    const db = rc.ctx.supabase;
    const entry = await findFormRequest(db, rc.tenantId, args.id);
    if (!entry) throw new AppError("not_found", "That request isn't here any more.", 404);
    const [version, place, links, open, person] = await Promise.all([
      findFormVersion(db, rc.tenantId, entry.versionId),
      entry.linkId ? findLinkPlace(db, rc.tenantId, entry.linkId) : null,
      listFormEntryLinks(db, rc.tenantId, [entry.id]),
      listOpenFormRequests(db, rc.tenantId),
      entry.contactId ? findPersonAddress(db, rc.tenantId, entry.contactId) : null,
    ]);
    const described = version?.description;
    if (!described) throw new AppError("not_found", "That request's form can't be read any more.", 404);
    const answers = recordOrEmpty(entry.answers);
    const stillOpen = open.find((request) => request.id === entry.id);
    const standing = entry.test ? "test" : entry.state === "held" ? "held" : stillOpen ? "open" : "answered";
    const source = Source.safeParse(entry.source);
    const typed = entry.reach.email;
    const data: FormRequestDto = {
      id: entry.id,
      form_id: entry.formId,
      heading: described.heading,
      created_at: entry.createdAt,
      lines: requestLines(described, answers),
      reach: entry.reach,
      place,
      sender: source.success ? sourceInWords(source.data) : null,
      person: person ? { id: person.id, name: person.name, email: person.email } : null,
      // New with the request: their record was made by it, in the same minute (form_results reads it the same way).
      known: person ? Date.parse(person.createdAt) < Date.parse(entry.createdAt) - MIN_MS : null,
      standing,
      held_why: entry.heldWhy,
      answered: standing === "answered" ? answeredBy(links) : null,
      unreached: stillOpen?.unreached ?? false,
      // A person's page is never overwritten by a form: where the two addresses differ, the reply waits for a pick.
      other_email: typed && person?.email && person.email.toLowerCase() !== typed ? typed : null,
      note: formRequestNote(described, answers),
      drafts: described.next.draft,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};
