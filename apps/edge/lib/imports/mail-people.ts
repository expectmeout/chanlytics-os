/**
 * The people a connected mailbox's grant knows, into People (decision 0073, R19): the owner's own contacts, a page at
 * a time. Google's "other contacts" (everyone the owner ever wrote to) are not read: the people they wrote to in the six
 * months come in with their mail, in their threads (mail-history.ts). Each through the one door a person
 * passes (db resolvePerson, as a client list's: asserted, source import, so the erased stay erased and a name ranks as
 * a list's), filling what is empty and never overwriting; a number or an address that is not one is left out rather
 * than refused. Never a yes: a contact is someone the owner knows, not someone who asked to hear from the business.
 *
 * Only what the owner left ticked on the provider's screen is read (channels grantHolds); a list left unticked is
 * skipped, and with none ticked the source stops and says so on its row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  googleContacts,
  graphContacts,
  gmailSignedOut,
  graphSignedOut,
  grantHolds,
  type KnownPerson,
  type MailboxReach,
} from "../packages/channels.js";
import { IMPORT_STOPPED_WORDS, normalizeEmail, normalizePhone } from "../packages/contracts.js";
import {
  PERSON_FORGOTTEN,
  importCursorOf,
  mailboxConnectionOf,
  noteImport,
  resolvePerson,
  type Database,
  type Json,
  type MailboxConnectionRow,
} from "../packages/db.js";
import { tokenFor } from "../email/mailbox/mailbox-credentials.js";
import { markSignedOut } from "../email/mailbox/mailbox-wire.js";
import type { Part, PartOutcome } from "./history-import.js";

type Db = SupabaseClient<Database>;

/** The lists a provider keeps, in the order they are read. */
type ContactList = Extract<MailboxReach, "contacts">;
const LISTS: Record<"google" | "microsoft", readonly ContactList[]> = {
  google: ["contacts"],
  microsoft: ["contacts"],
};

/** Where the read stands (beside the mailbox it reads, which Try again finds there): the list, and the page in it. */
interface PeopleCursor {
  list: ContactList;
  page: string | null;
}

function cursorOf(raw: Json | null): PeopleCursor | null {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (c?.list !== "contacts") return null;
  return { list: c.list, page: typeof c.page === "string" ? c.page : null };
}

const providerOf = (row: MailboxConnectionRow): "google" | "microsoft" =>
  row.provider === "microsoft" ? "microsoft" : "google";

/** The lists this grant may read, in order: the provider's, less what the owner left unticked. */
const listsOf = (row: MailboxConnectionRow): ContactList[] =>
  LISTS[providerOf(row)].filter((l) => grantHolds(providerOf(row), row.scopes ?? [], l));

async function contactsPageOf(row: MailboxConnectionRow, token: string, page: string | null) {
  if (row.provider === "microsoft") return graphContacts(token, page);
  return googleContacts(token, page);
}

/**
 * One person into People: their first number and address that are ones, never the mailbox's own (`box.own`, the address
 * of the mailbox `box.via` reads). True when new.
 */
async function bring(db: Db, box: { tenantId: string; own: string; via: string }, p: KnownPerson): Promise<boolean> {
  const { tenantId, own, via } = box;
  const email = p.emails.map((e) => normalizeEmail(e)).find((e): e is string => !!e && e !== own) ?? null;
  const phone = p.phones.map((n) => normalizePhone(n)).find((n): n is string => !!n) ?? null;
  if (!email && !phone) return false;
  try {
    const r = await resolvePerson(db, {
      tenantId,
      phone,
      email,
      name: p.name,
      assurance: "asserted",
      source: "import",
      detail: { via, from: "contacts" },
    });
    return r.outcome === "new";
  } catch (e) {
    if ((e as { code?: unknown }).code === PERSON_FORGOTTEN) return false;
    throw e;
  }
}

async function contactsStopped(db: Db, part: Part, error: string): Promise<PartOutcome> {
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "contacts",
    connectionId: part.connectionId,
    run: part.run,
    state: "failed",
    error,
    add: true,
  });
  return { more: false };
}

export async function contactsPart(db: Db, part: Part): Promise<PartOutcome> {
  if (!part.connectionId) return contactsStopped(db, part, IMPORT_STOPPED_WORDS.removed);
  const row = await mailboxConnectionOf(db, part.tenantId, part.connectionId);
  if (!row || row.state === "removed") return contactsStopped(db, part, IMPORT_STOPPED_WORDS.removed);
  const lists = listsOf(row);
  const first = lists[0];
  if (!first) return contactsStopped(db, part, IMPORT_STOPPED_WORDS.notTicked("Your contacts"));
  const now = Date.now();
  const t = await tokenFor(db, row, now);
  if (!t.ok) {
    if (t.why === "signed_out") await markSignedOut(db, row, part.log, now);
    return contactsStopped(db, part, IMPORT_STOPPED_WORDS.signedOut);
  }
  const was = cursorOf(await importCursorOf(db, part.tenantId, "contacts", row.id));
  let cur: PeopleCursor = was && lists.includes(was.list) ? was : { list: first, page: null };
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "contacts",
    connectionId: row.id,
    run: part.run,
    state: "running",
    via: row.provider,
    add: true,
  });

  const own = row.address.toLowerCase();
  let added = 0;
  let done = false;
  while (Date.now() < part.until) {
    const got = await contactsPageOf(row, t.token, cur.page);
    if (!got.ok) {
      if (row.provider === "microsoft" ? graphSignedOut(got.reply) : gmailSignedOut(got.reply)) {
        await markSignedOut(db, row, part.log, Date.now());
        return contactsStopped(db, part, IMPORT_STOPPED_WORDS.signedOut);
      }
      throw new Error(`the mailbox's contacts could not be read: ${got.reply.status}`);
    }
    // A page is brought whole before the cursor moves past it: run again, a person already in People is matched.
    const box = { tenantId: part.tenantId, own, via: row.provider };
    for (const p of got.people) if (await bring(db, box, p)) added++;
    if (got.next) {
      cur = { list: cur.list, page: got.next };
      continue;
    }
    const next = lists[lists.indexOf(cur.list) + 1];
    if (!next) {
      done = true;
      break;
    }
    cur = { list: next, page: null };
  }
  await noteImport(db, {
    tenantId: part.tenantId,
    source: "contacts",
    connectionId: row.id,
    run: part.run,
    state: done ? "done" : "running",
    counts: { people: added },
    add: true,
    partsDone: part.n,
    via: row.provider,
    cursor: { connection: row.id, list: cur.list, page: cur.page },
  });
  return { more: !done };
}
