import "server-only";

/**
 * Forms the business's own website owns, as its screens read them (00709; Campaigns in three tabs, Lane B): each in
 * Campaigns › Forms beside the forms made here, under its site, one opened on its sheet, and the website connection's
 * sites with their keys and the forms found on each. A site's request is read as the same request shape as a form made
 * here (contracts siteFormOf), so the request's page, Needs you and AI say it as they say a hosted form's. Each read is
 * the member's own, under its row rules.
 */
import {
  AppError,
  type EntryHeldWhyDto,
  FORM_RESULT_DAYS,
  formSiteNameOf,
  outsideFormNameOf,
  recordOrEmpty,
  roleAtLeast,
  siteFormOf,
  siteReachOf,
  siteStandingOf,
  websiteKeyWorks,
  type FormDescription,
  type FormSiteDto,
  type OutsideFormRowDto,
  type OutsideFormSheetDto,
  type TenantId,
} from "@chanlytics/contracts";
import {
  findOutsideForm,
  listFormSites,
  listOutsideFormEntries,
  listOutsideForms,
  readFormEntryStandings,
  readFormResults,
  type FormEntryStanding,
  type FormSiteRead,
  type OutsideFormRead,
} from "@chanlytics/db/forms";
import { listFormKeys } from "@chanlytics/db/people";
import { logAndGoOn } from "@chanlytics/log";
import { findEmailReady } from "./email-readiness";
import { entryStandingOf } from "../forms/standing";
import { readerStamp, type Reader, type ReaderContext } from "../shared/reader";

type Db = ReaderContext["ctx"]["supabase"];

/** The most entries a site form's sheet lists: the newest. */
const SHEET_ENTRIES = 60;

/** A site form's name, as every screen says it. */
const formNameOf = (form: OutsideFormRead): string =>
  outsideFormNameOf({ name: form.name, sent_name: form.sentName, form: form.form });

/** Each site's name by its id. */
const siteNamesOf = (sites: readonly FormSiteRead[]): Map<string, string> =>
  new Map(sites.map((site) => [site.id, formSiteNameOf(site)]));

/**
 * Campaigns › Forms' rows for the forms the website owns, listed and hidden (the list says which), each under its site
 * with how many of its entries are held for a look (`held`, by form: packages/db countHeldFormEntries); and how many
 * sites the business sends entries from.
 */
export async function readOutsideRows(
  db: Db,
  tenantId: TenantId,
  held: ReadonlyMap<string, number>,
): Promise<{ rows: OutsideFormRowDto[]; sites: number }> {
  const [forms, sites] = await Promise.all([listOutsideForms(db, tenantId), listFormSites(db, tenantId)]);
  const names = siteNamesOf(sites);
  const rows = forms.flatMap((form): OutsideFormRowDto[] =>
    form.siteId
      ? [
          {
            id: form.id,
            name: formNameOf(form),
            form: form.form,
            site_id: form.siteId,
            site: names.get(form.siteId) ?? formSiteNameOf({ host: null, name: null }),
            listed: form.listed,
            last_entry_at: form.lastEntryAt,
            held: held.get(form.id) ?? 0,
          },
        ]
      : [],
  );
  return { rows, sites: sites.length };
}

/** What a site's request is read against, and the site it came from: by its form, read once for many requests. */
export interface SiteRequestShape {
  description: Pick<FormDescription, "heading" | "fields">;
  site: string;
}

/**
 * The shape each of the website's forms gives its requests, by form id: its name as the heading, the fields the website
 * door takes, and its site's name. Read once for a list of requests (Needs you) or for one (Inbox).
 */
export async function readSiteRequestShapes(db: Db, tenantId: TenantId): Promise<Map<string, SiteRequestShape>> {
  const [forms, sites] = await Promise.all([listOutsideForms(db, tenantId), listFormSites(db, tenantId)]);
  const names = siteNamesOf(sites);
  return new Map(
    forms.map((form) => [
      form.id,
      {
        description: siteFormOf(formNameOf(form)),
        site: (form.siteId ? names.get(form.siteId) : null) ?? formSiteNameOf({ host: null, name: null }),
      },
    ]),
  );
}

/** Whether a reply by email can go now: never a no where it could not be checked, and never ready. */
async function emailReadyOf(rc: Pick<ReaderContext, "ctx" | "tenantId">): Promise<boolean> {
  const email = await findEmailReady(rc.ctx.supabase, rc.tenantId).catch(
    logAndGoOn("a site form's email readiness", null),
  );
  return email?.ready === true;
}

/**
 * Where one entry of a site's form stands on its sheet: kept (a sign-up, or a request from before its form's
 * requests_from), or a request's own standing by the one rule (server/forms/standing.ts): open, sending, answered or
 * aged. A held one is listed apart, in the form's held pile.
 */
function siteEntryStanding(
  form: OutsideFormRead,
  entry: { id: string; createdAt: string },
  standings: ReadonlyMap<string, FormEntryStanding>,
): OutsideFormSheetDto["entries"][number]["standing"] {
  if (form.form !== "request" || Date.parse(entry.createdAt) < Date.parse(form.requestsFrom)) return "kept";
  const standing = entryStandingOf({ test: false, held: false }, standings.get(entry.id));
  return standing === "held" || standing === "test" ? "open" : standing;
}

/** Why an entry is held, read back from the word the database keeps; null for a word nobody knows. */
const HELD_WHYS: readonly EntryHeldWhyDto[] = ["hidden_field", "too_fast", "too_many", "member", "elsewhere"];
const heldWhyOf = (kept: string | null): EntryHeldWhyDto | null => HELD_WHYS.find((why) => why === kept) ?? null;

/** A site's form opened in Campaigns › Forms: its names, its site, what it brought, and its newest entries. */
export const outsideFormSheet: Reader<{ form: string }, OutsideFormSheetDto> = {
  name: "outside_form_sheet",
  async read(rc, args) {
    const db = rc.ctx.supabase;
    const form = await findOutsideForm(db, rc.tenantId, args.form);
    if (!form?.siteId) throw new AppError("not_found", "That form isn't here any more.", 404);
    // Each entry with where it stands, read for the entries listed and no others (form_entries_standing).
    const listed = listOutsideFormEntries(db, { tenantId: rc.tenantId, formId: form.id, limit: SHEET_ENTRIES }).then(
      async (entries) => ({
        entries,
        standings: await readFormEntryStandings(
          db,
          rc.tenantId,
          entries.filter((entry) => !entry.held).map((entry) => entry.id),
        ),
      }),
    );
    const [sites, results, { entries, standings }, email] = await Promise.all([
      listFormSites(db, rc.tenantId),
      readFormResults(db, rc.tenantId, FORM_RESULT_DAYS),
      listed,
      emailReadyOf(rc),
    ]);
    const site = sites.find((one) => one.id === form.siteId) ?? null;
    if (!site) throw new AppError("not_found", "That form's site isn't here any more.", 404);
    const brought = results.outside.find((one) => one.outsideFormId === form.id);
    /** One entry as the sheet lists it: who it is about, as its answers say it. */
    const said = (entry: (typeof entries)[number]) => {
      const reach = siteReachOf(recordOrEmpty(entry.answers));
      return {
        id: entry.id,
        name: reach.name ?? reach.email ?? reach.phone,
        created_at: entry.createdAt,
        phone_only: !reach.email && !!reach.phone,
      };
    };
    const data: OutsideFormSheetDto = {
      id: form.id,
      name: formNameOf(form),
      own_name: form.name,
      sent_name: form.sentName,
      form: form.form,
      listed: form.listed,
      last_entry_at: form.lastEntryAt,
      requests_from: form.requestsFrom,
      site: {
        id: site.id,
        name: formSiteNameOf(site),
        host: site.host,
        standing: siteStandingOf({ last_entry_at: site.lastEntryAt, test_at: site.testAt }, rc.now.getTime()),
        last_entry_at: site.lastEntryAt,
      },
      results: {
        days: FORM_RESULT_DAYS,
        entries: brought?.entries ?? 0,
        people: brought?.people ?? 0,
        new_people: brought?.newPeople ?? 0,
        talked: brought?.talked ?? 0,
        visits: brought?.visits ?? 0,
        confirmed: brought?.confirmed ?? 0,
      },
      entries: entries
        .filter((entry) => !entry.held)
        .map((entry) => ({ ...said(entry), standing: siteEntryStanding(form, entry, standings) })),
      // Held for a look (00726): past the door's limit, or set aside by a member, each saying why.
      held: entries
        .filter((entry) => entry.held)
        .map((entry) => ({ ...said(entry), held_why: heldWhyOf(entry.heldWhy) })),
      email_ready: email,
      can_change: roleAtLeast(rc.role, "operator"),
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/**
 * The website connection's sites (GET website-forms): each with where it stands, its keys that still work, the newest
 * first (never a key itself), and the forms found on it. A key from before its site was kept (00709) stands under the
 * first site.
 */
export async function readWebsiteSites(db: Db, tenantId: TenantId, nowMs: number): Promise<FormSiteDto[]> {
  const [sites, keys, forms] = await Promise.all([
    listFormSites(db, tenantId),
    listFormKeys(db, tenantId),
    listOutsideForms(db, tenantId),
  ]);
  const working = keys
    .filter((key) => websiteKeyWorks(key, nowMs))
    .sort((one, other) => other.created_at.localeCompare(one.created_at));
  return sites.map((site, at) => ({
    id: site.id,
    name: formSiteNameOf(site),
    host: site.host,
    standing: siteStandingOf({ last_entry_at: site.lastEntryAt, test_at: site.testAt }, nowMs),
    last_entry_at: site.lastEntryAt,
    test_at: site.testAt,
    keys: working
      .filter((key) => key.site_id === site.id || (key.site_id === null && at === 0))
      .map((key) => ({
        id: key.id,
        name: key.name,
        first: key.first,
        made_at: key.created_at,
        last_used_at: key.last_used_at,
        ends_at: key.ends_at,
      })),
    forms: forms
      .filter((form) => form.siteId === site.id)
      .map((form) => ({ id: form.id, name: formNameOf(form), form: form.form, last_entry_at: form.lastEntryAt })),
  }));
}
