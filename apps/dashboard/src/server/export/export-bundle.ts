/**
 * The owner's copy of the workspace, as one JSON file, written a section at a time.
 *
 * The privacy page has said "an owner can export a workspace's data" since it was written; what existed was three
 * partial routes (everyone as a CSV, one thread, one call). The first copy held the customer record alone: people,
 * conversations with their messages, calls with their transcripts, and the consent history -- every change to either
 * answer, with who recorded it and how -- because "when did she say yes, to what, and how do we know" is the question an
 * export is asked for. The card above "Delete this workspace" called it everything, and 54 of the 59 tables an owner's
 * session reads were in no section of it (the wiring's second audit, R14 X1).
 *
 * The file now holds a section for every kind of record (contracts EXPORT_OF, which a new kind cannot skip), in the order
 * EXPORT_SECTIONS names: the customer record, the files customers sent (with a link to each that holds for a day), then
 * notes and steps, deals, the business's own details, the team, bookings and the rest. It ends with what each section
 * counted (`manifest`) and what it does not hold, with why (`not_included`). Recordings are not in it: audio is removed
 * on its own schedule (contracts retention.ts) and the transcript is here.
 *
 * Pure: the readers are handed in and asked page by page, so the composer runs in a test over a few rows and in the route
 * over a workspace of any size without holding it whole. A page of any section is read by OFFSET under a fixed order
 * (created_at, then id): a keyset on created_at alone skips rows written by one statement, which share a timestamp, and
 * the export is the one place a skipped row is worse than a slow page. People are not: their order is people_list's, the
 * latest contact first, which moves whenever someone writes or calls, so by offset one who wrote between two pages was
 * never exported and the one on the boundary was exported twice. Their reader hands over pages of everyone exactly once
 * (server/people everyoneOnce), in whatever size it reads them. The messages are read for MESSAGES_BATCH conversations
 * at a time: a query a conversation was about ten thousand queries for a large workspace (R14 X7).
 *
 * One person's own copy (personBundle; GET export?person=<id>, "Download their records" on their page, R14 X5) is the
 * same file of them alone: the sections contracts PERSON_EXPORT_SECTIONS names, each read for them, with what it leaves
 * out of the workspace's and why (personExportLeftOut).
 */
import {
  DAY_MS,
  EXPORT_SECTIONS,
  PERSON_EXPORT_SECTIONS,
  exportLeftOut,
  personExportLeftOut,
  type CallDto,
  type ConsentChange,
  type ExportLeftOut,
  type ExportSection,
  type MessageDto,
  type PersonExportSection,
  type PersonRowDto,
} from "@chanlytics/contracts";
export { consentChangeOf } from "@chanlytics/contracts";

export const BUNDLE_FORMAT = "chanlytics-workspace-export";
const BUNDLE_VERSION = 2;
/** One person's own copy: the workspace's file of them alone, from its first version. */
const PERSON_BUNDLE_FORMAT = "chanlytics-person-export";
const PERSON_BUNDLE_VERSION = 1;
/** Rows per page, per section. */
export const BUNDLE_PAGE = 500;
/** Conversations whose messages are read in one query: a page of them, a few hundred messages, under the 8 KiB request line. */
const MESSAGES_BATCH = 50;
/** Stored files signed in one call. */
const SIGN_BATCH = 100;
/** How long a file's link in the copy opens it: a day, long enough to save what is wanted, never a link that lasts. */
const FILE_LINK_MS = DAY_MS;
/** The same, as the store's signer takes it. */
export const FILE_LINK_SECONDS = FILE_LINK_MS / 1000;

interface BundleConversation {
  id: string;
  contact_id: string;
  state: string;
  created_at: string;
  last_message_at: string | null;
  last_inbound_at: string | null;
}

/** A message as the bundle reads it: its conversation, and where a file it carried is stored, neither of them written. */
type BundleMessage = MessageDto & {
  conversation_id: string;
  /** The stored file's path, for its link in `files`; never in the file itself. */
  stored_path: string | null;
};

/** One of the team: a member, or an invitation not yet taken. */
export interface BundleTeamMember {
  email: string | null;
  name: string | null;
  role: string;
  state: "member" | "invited";
  /** When they joined, or were invited. */
  since: string | null;
  /** When an invitation lapses. */
  expires_at?: string | null;
}

/** The customer record: the sections every copy reads its own way, the workspace's and one person's alike. */
type CustomerSection = "people" | "conversations" | "files" | "calls" | "consent_history";

/** The sections read page by page, beside the ones the bundle reads its own way. */
export type PagedSection = Exclude<ExportSection, CustomerSection | "team">;

/** A page of a section: up to `limit` rows from `offset`, in the section's fixed order. */
type SectionPage = (offset: number, limit: number) => Promise<Record<string, unknown>[]>;

/** The readers of the customer record, which the workspace's copy reads for everyone and a person's for them. */
interface CustomerRecordReaders {
  /**
   * Every person exactly once, a page at a time: their order moves as they write, so it is not read by offset. One
   * person's copy hands over their row as its one page.
   */
  people(): AsyncIterable<PersonRowDto[]> | Iterable<PersonRowDto[]>;
  conversations(offset: number, limit: number): Promise<BundleConversation[]>;
  /** The messages of these conversations, a page at a time: by conversation, then oldest first. */
  messages(conversationIds: readonly string[], offset: number, limit: number): Promise<BundleMessage[]>;
  calls(offset: number, limit: number): Promise<CallDto[]>;
  consentHistory(offset: number, limit: number): Promise<ConsentChange[]>;
  /** A link to each of these stored files that holds for FILE_LINK_SECONDS, in the order asked; null for one not signed. */
  signFiles(paths: readonly string[]): Promise<(string | null)[]>;
}

export interface BundleReaders extends CustomerRecordReaders {
  /** The team: its members, and the invitations not yet taken. */
  team(): Promise<BundleTeamMember[]>;
  /** Every other section, page by page (packages/db exportSectionPages). */
  sections: Record<PagedSection, SectionPage>;
}

/** The sections of one person's copy read page by page. */
type PersonPagedSection = Extract<PersonExportSection, PagedSection>;

/** The readers of one person's own copy: the customer record read for them, and their sections (personExportPages). */
export interface PersonBundleReaders extends CustomerRecordReaders {
  sections: Record<PersonPagedSection, SectionPage>;
}

interface BundleOpts {
  workspaceId: string;
  business: string;
  /** The workspace's zone, stated once in the header; every timestamp in the body is ISO 8601 UTC. */
  tz: string;
  exportedAt: Date;
  /** Rows per page; the tests page small. */
  page?: number;
  /** Conversations per messages query; the tests batch small. */
  batch?: number;
}

/** A file a customer sent, found as its message is written, and given its link once the conversations are. */
interface StoredFile {
  conversation_id: string;
  message_id: string;
  type: string | null;
  filename: string | null;
  sent_at: string;
  path: string;
}

/** Every page of a reader, in order, until a short one. */
async function* paged<T>(read: (offset: number, limit: number) => Promise<T[]>, page: number): AsyncGenerator<T> {
  for (let offset = 0; ; offset += page) {
    const rows = await read(offset, page);
    for (const r of rows) yield r;
    if (rows.length < page) return;
  }
}

/** Every row of a sequence of pages, in order. */
async function* each<T>(pages: AsyncIterable<T[]> | Iterable<T[]>): AsyncGenerator<T> {
  for await (const rows of pages) yield* rows;
}

/** The items of an async sequence as one JSON array, an item per chunk, counting them. */
async function* jsonArray<T>(items: AsyncIterable<T>, counted: (n: number) => void): AsyncGenerator<string> {
  yield "[";
  let n = 0;
  for await (const it of items) {
    yield (n === 0 ? "\n  " : ",\n  ") + JSON.stringify(it);
    n += 1;
  }
  counted(n);
  yield n === 0 ? "]" : "\n]";
}

/** The header's workspace: whose copy it is, its zone, and when it was taken. */
const workspaceHead = (opts: BundleOpts) => ({
  id: opts.workspaceId,
  name: opts.business,
  timezone: opts.tz,
  exported_at: opts.exportedAt.toISOString(),
});

/**
 * The bundle, as the chunks of one JSON document:
 *
 *   { "format", "version", "workspace": {...},
 *     "people": [...], "conversations": [{..., "messages": [...]}, ...], "files": [...], "calls": [...],
 *     "consent_history": [...], "notes_and_steps": [...], ... each section of EXPORT_SECTIONS, in its order,
 *     "manifest": { section: count, ..., "messages": count },
 *     "not_included": [{ "what", "why" }, ...] }
 */
export function workspaceBundle(readers: BundleReaders, opts: BundleOpts): AsyncGenerator<string> {
  return recordsBundle(readers, opts, {
    head: { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, workspace: workspaceHead(opts) },
    sections: EXPORT_SECTIONS,
    leftOut: exportLeftOut(),
    own: (section, page) =>
      section === "team" ? each(asOnePage(readers.team())) : paged(readers.sections[section], page),
  });
}

/**
 * One person's own copy (R14 X5): the same document of them alone, `"person": { "id" }` in its header, the sections of
 * PERSON_EXPORT_SECTIONS in the workspace's order, and what it leaves out of the workspace's, each with why.
 */
export function personBundle(
  readers: PersonBundleReaders,
  opts: BundleOpts & { personId: string },
): AsyncGenerator<string> {
  const theirs = (section: string): section is PersonPagedSection => section in readers.sections;
  return recordsBundle(readers, opts, {
    head: {
      format: PERSON_BUNDLE_FORMAT,
      version: PERSON_BUNDLE_VERSION,
      workspace: workspaceHead(opts),
      person: { id: opts.personId },
    },
    sections: PERSON_EXPORT_SECTIONS,
    leftOut: personExportLeftOut(),
    own: (section, page) => {
      if (!theirs(section)) throw new Error(`A person's copy has no ${section}.`);
      return paged(readers.sections[section], page);
    },
  });
}

/** What makes one copy: its header, its sections in order, what it leaves out, and how a section past the record is read. */
interface BundleShape {
  head: Record<string, unknown>;
  sections: readonly ExportSection[];
  leftOut: readonly ExportLeftOut[];
  own(section: Exclude<ExportSection, CustomerSection>, page: number): AsyncIterable<unknown>;
}

/** Either copy, as the chunks of one JSON document: the header, each section in turn, the manifest, what it leaves out. */
async function* recordsBundle(
  readers: CustomerRecordReaders,
  opts: BundleOpts,
  shape: BundleShape,
): AsyncGenerator<string> {
  const page = opts.page ?? BUNDLE_PAGE;
  const batch = opts.batch ?? MESSAGES_BATCH;
  // The header, its closing brace dropped so the sections follow inside it.
  yield JSON.stringify(shape.head, null, 2).replace(/\n\}$/, "") + ",\n";

  const manifest: Record<string, number> = {};
  const messages = { count: 0 };
  const files: StoredFile[] = [];
  const linksExpire = new Date(opts.exportedAt.getTime() + FILE_LINK_MS).toISOString();
  const itemsOf = (section: ExportSection): AsyncIterable<unknown> => {
    switch (section) {
      case "people":
        return each(readers.people());
      case "conversations":
        return withMessages(readers, { page, batch }, files, messages);
      case "files":
        return linked(readers, files, linksExpire);
      case "calls":
        return paged(readers.calls, page);
      case "consent_history":
        return paged(readers.consentHistory, page);
      default:
        return shape.own(section, page);
    }
  };
  for (const [i, section] of shape.sections.entries()) {
    yield `${i === 0 ? "" : ",\n"}${JSON.stringify(section)}: `;
    yield* jsonArray(itemsOf(section), (n) => {
      manifest[section] = n;
    });
  }
  manifest.messages = messages.count;

  yield ',\n"manifest": ' + JSON.stringify(manifest, null, 2);
  yield ',\n"not_included": ' + JSON.stringify(shape.leftOut, null, 2);
  yield "\n}\n";
}

/** A single answer as a sequence of one page. */
async function* asOnePage<T>(rows: Promise<T[]>): AsyncGenerator<T[]> {
  yield await rows;
}

/**
 * Each conversation with every one of its messages, oldest first. The messages of a batch of conversations are read
 * together and handed back to each; a file a message carried is noted for `files`, and its path is not written.
 */
async function* withMessages(
  readers: CustomerRecordReaders,
  size: { page: number; batch: number },
  files: StoredFile[],
  messages: { count: number },
): AsyncGenerator<BundleConversation & { messages: MessageDto[] }> {
  let held: BundleConversation[] = [];
  const written = async function* (convs: BundleConversation[]) {
    const ids = convs.map((c) => c.id);
    const by = new Map<string, MessageDto[]>(ids.map((id) => [id, []]));
    for await (const m of paged((o, l) => readers.messages(ids, o, l), size.page)) {
      const { conversation_id, stored_path, ...message } = m;
      by.get(conversation_id)?.push(message);
      messages.count += 1;
      if (stored_path)
        files.push({
          conversation_id,
          message_id: message.id,
          type: message.media?.mime_type ?? null,
          filename: message.media?.filename ?? null,
          sent_at: message.created_at,
          path: stored_path,
        });
    }
    for (const c of convs) yield { ...c, messages: by.get(c.id) ?? [] };
  };
  for await (const c of paged(readers.conversations, size.page)) {
    held.push(c);
    if (held.length < size.batch) continue;
    yield* written(held);
    held = [];
  }
  if (held.length) yield* written(held);
}

/**
 * Every file a customer sent, with a link that opens it until `expiresAt` (R14 X6): the card said only that call audio
 * was left out, and a photo was a line with its type and name and nothing to open it with. One the store would not sign
 * is listed with no link, and the copy says so.
 */
async function* linked(
  readers: CustomerRecordReaders,
  files: readonly StoredFile[],
  expiresAt: string,
): AsyncGenerator<Omit<StoredFile, "path"> & { url: string | null; url_expires_at: string | null }> {
  for (let i = 0; i < files.length; i += SIGN_BATCH) {
    const chunk = files.slice(i, i + SIGN_BATCH);
    const urls = await readers.signFiles(chunk.map((f) => f.path));
    for (const [j, f] of chunk.entries()) {
      const url = urls.at(j) ?? null;
      yield {
        conversation_id: f.conversation_id,
        message_id: f.message_id,
        type: f.type,
        filename: f.filename,
        sent_at: f.sent_at,
        url,
        url_expires_at: url ? expiresAt : null,
      };
    }
  }
}
