/**
 * Everything a workspace holds, as one JSON file, written a section at a time.
 *
 * The privacy page has said "an owner can export a workspace's data" since it
 * was written; what existed was three partial routes (everyone as a CSV, one
 * thread, one call). This is the whole: people, conversations with their
 * messages, calls with their transcripts, and the consent history -- every
 * change to either answer, with who recorded it and how -- because "when did
 * she say yes, to what, and how do we know" is the question an export is
 * requested for. Recordings are not in it: audio is removed on its own
 * schedule (contracts retention.ts) and the transcript is here.
 *
 * Pure: the readers are handed in and asked page by page, so the composer runs
 * in a test over a few rows and in the route over a workspace of any size
 * without holding it whole. A page is read by OFFSET under a fixed order
 * (created_at, then id): a keyset on created_at alone skips rows written by
 * one statement, which share a timestamp, and the export is the one place a
 * skipped row is worse than a slow page.
 */
import type { CallDto, ConsentChange, MessageDto, PersonRowDto } from "@chanlytics/contracts";
export { consentChangeOf } from "@chanlytics/contracts";

export const BUNDLE_FORMAT = "chanlytics-workspace-export";
export const BUNDLE_VERSION = 1;
/** Rows per page, per section. */
export const BUNDLE_PAGE = 500;

export interface BundleConversation {
  id: string;
  contact_id: string;
  state: string;
  created_at: string;
  last_message_at: string | null;
  last_inbound_at: string | null;
}

export interface BundleReaders {
  people(offset: number, limit: number): Promise<PersonRowDto[]>;
  conversations(offset: number, limit: number): Promise<BundleConversation[]>;
  messages(conversationId: string, offset: number, limit: number): Promise<MessageDto[]>;
  calls(offset: number, limit: number): Promise<CallDto[]>;
  consentHistory(offset: number, limit: number): Promise<ConsentChange[]>;
}

export interface BundleOpts {
  workspaceId: string;
  business: string;
  /** The workspace's zone, stated once in the header; every timestamp in the body is ISO 8601 UTC. */
  tz: string;
  exportedAt: Date;
  /** Rows per page; the tests page small. */
  page?: number;
}

/** Every page of a reader, in order, until a short one. */
async function* paged<T>(read: (offset: number, limit: number) => Promise<T[]>, page: number): AsyncGenerator<T> {
  for (let offset = 0; ; offset += page) {
    const rows = await read(offset, page);
    for (const r of rows) yield r;
    if (rows.length < page) return;
  }
}

/** The items of an async sequence as one JSON array, an item per chunk. */
async function* jsonArray<T>(items: AsyncIterable<T>): AsyncGenerator<string> {
  yield "[";
  let first = true;
  for await (const it of items) {
    yield (first ? "\n  " : ",\n  ") + JSON.stringify(it);
    first = false;
  }
  yield first ? "]" : "\n]";
}

/**
 * The bundle, as the chunks of one JSON document:
 *
 *   { "format", "version", "workspace": {...},
 *     "people": [...], "conversations": [{..., "messages": [...]}, ...],
 *     "calls": [...], "consent_history": [...] }
 */
export async function* workspaceBundle(readers: BundleReaders, opts: BundleOpts): AsyncGenerator<string> {
  const page = opts.page ?? BUNDLE_PAGE;
  const head = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    workspace: { id: opts.workspaceId, name: opts.business, timezone: opts.tz, exported_at: opts.exportedAt.toISOString() },
  };
  // The header, its closing brace dropped so the sections follow inside it.
  yield JSON.stringify(head, null, 2).replace(/\n\}$/, "") + ",\n";

  yield '"people": ';
  yield* jsonArray(paged(readers.people, page));

  yield ',\n"conversations": ';
  yield* jsonArray(withMessages(readers, page));

  yield ',\n"calls": ';
  yield* jsonArray(paged(readers.calls, page));

  yield ',\n"consent_history": ';
  yield* jsonArray(paged(readers.consentHistory, page));

  yield "\n}\n";
}

/** Each conversation with every one of its messages, oldest first. */
async function* withMessages(readers: BundleReaders, page: number): AsyncGenerator<BundleConversation & { messages: MessageDto[] }> {
  for await (const c of paged(readers.conversations, page)) {
    const messages: MessageDto[] = [];
    for await (const m of paged((o, l) => readers.messages(c.id, o, l), page)) messages.push(m);
    yield { ...c, messages };
  }
}
