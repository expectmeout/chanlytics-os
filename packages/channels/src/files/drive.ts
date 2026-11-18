/**
 * Google Drive, as a footage source's provider (the footage sources plan, 17 November 2026): the one place Drive's wire
 * is written. It fills the contract every provider fills (contracts files/sources.ts) and adds the folder chooser's two
 * reads. It knows nothing of sources, the Library or jobs: a call takes an hour's access token and answers what Drive
 * said, judged once here as go on, rest, no access or gone.
 *
 * What is asked is the least that does the job. The change list covers the whole account, so it is asked for ids only
 * (the file, its parent, its type, trashed, removed) and never a name; a name is read only from an item's own record,
 * and never a photo's place or camera. Drive's cost since 1 May 2026 is in units: an item's record 5, a list 100.
 *
 * A reply that never came (a timeout, a 5xx after one more try) is not a verdict: the call throws SourceUnanswered and
 * its job is tried again by the ledger. Drive's own "not now" (403 rateLimitExceeded or userRateLimitExceeded, 429) is
 * the verdict `pace`, with how long to rest.
 */
import {
  FILE_IMAGE_MIMES,
  HOUR_MS,
  MIN_MS,
  SECOND_MS,
  WEEK_MS,
  isOneOf,
  isVideoMime,
  recordOrEmpty,
  recordOrNull,
  type SourceChange,
  type SourceChanges,
  type SourceChannel,
  type SourceChannelAsk,
  type SourceChildren,
  type SourceFolder,
  type SourceItemKind,
  type SourceItemRecord,
  type SourceProviderContract,
  type SourceReply,
} from "@chanlytics/contracts";
import { fetchFromProvider, type ProviderReply } from "../shared/provider-fetch";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

/** Drive's type for a folder. */
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** One call's bound: a list of a thousand items answers in a few seconds. */
const DRIVE_CALL_MS = 15 * SECOND_MS;

/** The most a page of a folder's children holds: Drive's own ceiling. */
const DRIVE_PAGE = 1000;

/**
 * How many changes one page of the change list holds. Each change inside a watched folder is then read by its own
 * record, so a page is kept small enough that all of them are read inside one job, whatever the account was doing.
 */
const CHANGES_PAGE = 300;

/** How long to rest when Drive says "not now" and names no time. */
const DRIVE_REST_MS = MIN_MS;

/** How long a push channel is asked to last: Drive's most for a change channel, less a little for the clocks' drift. */
const CHANNEL_LASTS_MS = WEEK_MS - HOUR_MS;

/** What an item's record is asked for: nothing of where or how a photo was taken. */
const ITEM_FIELDS =
  "id,name,mimeType,parents,modifiedTime,createdTime,md5Checksum,size,trashed,videoMediaMetadata(durationMillis),lastModifyingUser(displayName)";

/** What a change is asked for: ids, never a name. */
const CHANGE_FIELDS =
  "nextPageToken,newStartPageToken,changes(fileId,removed,changeType,file(id,parents,mimeType,trashed))";

/** What the table holds of each (00639's checks): a longer one is cut, never refused whole. */
const DRIVE_NAME_MAX = 1000;
const DRIVE_SHORT_MAX = 200;

/** Drive gave no answer to act on: its job is tried again. */
export class SourceUnanswered extends Error {
  constructor(
    readonly call: string,
    readonly status: number,
    readonly reason = "",
  ) {
    super(`drive ${call}: no answer (status ${status}${reason ? `, ${reason}` : ""})`);
    this.name = "SourceUnanswered";
  }
}

/**
 * Drive refused the account's key (a 401), or the key lacks the scope it was asked with. Never read as a verdict:
 * whoever asked settles it before anything is paused, a refused key by one forced refresh (only a refresh Google
 * refuses for good is a dead grant).
 */
export class SourceKeyRefused extends Error {
  constructor(
    readonly call: string,
    readonly refused: "key" | "scope",
  ) {
    super(`drive ${call}: the account's ${refused} was refused`);
    this.name = "SourceKeyRefused";
  }
}

/** What a test hands in instead of the network. */
type DriveDeps = NonNullable<Parameters<typeof fetchFromProvider>[3]> & {
  /** Told what each call cost at Google, in its units, as it is made: a job adds up what it spent. */
  spent?: (units: number) => void;
};

/**
 * What a call costs at Google since 1 May 2026, by its path: a list, and a channel opened, 100; an item's record, the
 * place to start from and a channel closed 5 (developers.google.com/workspace/drive/api/guides/limits, read 18 Nov
 * 2026). A download is 200 there: none is made through here.
 */
function driveUnitsOf(path: string): number {
  return path === "/changes/startPageToken" || path === "/channels/stop" || path.startsWith("/files/") ? 5 : 100;
}

/** A folder the chooser offers: its id and its name, and nothing else of it. */
export interface DriveFolderChoice {
  id: string;
  name: string;
}

/** One page of what the chooser offers under a place. */
export interface DriveFolderChoices {
  folders: DriveFolderChoice[];
  nextPage: string | null;
}

/** Where the chooser looks: the account's own Drive, its shared drives, what was shared with it, or a folder opened. */
export type DrivePlace =
  { place: "mine" } | { place: "drives" } | { place: "shared" } | { place: "folder"; id: string };

/** Drive, as a provider of footage: the contract's calls, and the chooser's. */
export interface DriveSource extends SourceProviderContract {
  /**
   * One page of what sits directly in ANY of these folders of a shared drive, in one question: a call costs the same
   * whatever it holds, so a drive's tree is listed many folders at a time. Each item names the folder among them it
   * sits in. Where one of the folders is not there, or cannot be read, the whole question is refused (`gone` or
   * `no_access`), as it is for that folder alone: its asker then asks a folder at a time.
   *
   * Only inside a shared drive (`folder.driveId`), where the question is put to the whole drive. Anywhere else Drive
   * answers many folders from what the account itself made, opened or was given directly and leaves the rest out
   * (18 Nov 2026, a real account: 161 folders of more than 1,700), while one folder alone is always answered whole.
   * So more than one folder outside a shared drive is refused here, before anything is asked.
   */
  listChildrenOf(
    accessToken: string,
    folder: Pick<SourceFolder, "driveId">,
    parentIds: readonly string[],
    page: string | null,
  ): Promise<SourceReply<SourceChildren>>;
  /** One page of the folders under a place, by name. Folders only: no file is listed before a folder is chosen. */
  listFolders(accessToken: string, where: DrivePlace, page: string | null): Promise<SourceReply<DriveFolderChoices>>;
}

/** The first of Drive's own errors on a refusal (`error.errors[0]`): its reason, and the parameter it names. */
function driveErrorOf(reply: Pick<ProviderReply, "json">): { reason: string; location: string } {
  const errors = recordOrNull(recordOrNull(reply.json)?.error)?.errors;
  const first = Array.isArray(errors) ? recordOrEmpty(errors[0]) : {};
  return {
    reason: typeof first.reason === "string" ? first.reason : "",
    location: typeof first.location === "string" ? first.location : "",
  };
}

/** Whether Drive refused the page it was asked from: a token it no longer takes, never a fault in the rest of the ask. */
const pageRefused = (reply: ProviderReply): boolean =>
  reply.status === 400 && driveErrorOf(reply).location === "pageToken";

/** Drive's reasons for "not now": a rest, never a refusal. */
const RATE_REASONS = /ratelimit|dailylimit|quota/i;
/** Drive's reason for a key that lacks the scope its call needs. */
const SCOPE_REASONS = /^insufficientPermissions$|scope/i;
/** Drive's reasons for a refusal about the one file or folder asked for. */
const ITEM_REASONS =
  /^(insufficientFilePermissions|appNotAuthorizedToFile|teamDriveMembershipRequired|sharedDriveMembershipRequired)$/i;

/**
 * A reply that is not a yes, judged. Drive's "not now" is a rest and a 404 is gone. A 403 is no access only where it
 * is about the one item asked for (`about` an item, or a reason that names a file): a 403 on a list with a reason
 * this does not know may be about the project (its API switched off, its billing, a new limit), so it is no answer
 * and throws, as a reply that never came does, and nothing is paused for it. A refused key (a 401) and a missing
 * scope throw SourceKeyRefused: only their asker can settle whether the grant is dead.
 */
function driveRefusalOf(
  call: string,
  reply: ProviderReply,
  about: "item" | "list" = "list",
): Exclude<SourceReply<never>, { verdict: "ok" }> {
  const { reason } = driveErrorOf(reply);
  if (reply.status === 429 || (reply.status === 403 && RATE_REASONS.test(reason)))
    return { verdict: "pace", restMs: reply.retryAfterMs ?? DRIVE_REST_MS };
  if (reply.status === 404) return { verdict: "gone" };
  if (reply.status === 401) throw new SourceKeyRefused(call, "key");
  if (reply.status === 403 && SCOPE_REASONS.test(reason)) throw new SourceKeyRefused(call, "scope");
  if (reply.status === 403 && (about === "item" || ITEM_REASONS.test(reason))) return { verdict: "no_access" };
  throw new SourceUnanswered(call, reply.status, reason);
}

const driveTextOf = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * Whether a type is one a watched folder lists at all: a folder, a photo or a video. Nothing else is asked for,
 * kept or named: a business's documents are never listed (the review of 18 Nov, finding 2).
 */
const isFootageMime = (mime: string): boolean =>
  mime === FOLDER_MIME || mime.startsWith("image/") || mime.startsWith("video/");

/** The same, as Drive is asked it. */
const FOOTAGE_ONLY = `(mimeType = '${FOLDER_MIME}' or mimeType contains 'image/' or mimeType contains 'video/')`;

/**
 * An item's kind by its type: a folder, a picture or a video the Library takes, or a photo or a video of a type it
 * does not take (a RAW photo), which is listed and passed over.
 */
function driveKindOf(mime: string): SourceItemKind {
  if (mime === FOLDER_MIME) return "folder";
  if (isVideoMime(mime)) return "video";
  return isOneOf(FILE_IMAGE_MIMES, mime) ? "image" : "other";
}

/** A count Drive writes as text (a size, a length in milliseconds), read; null when it is not one. */
function driveCountOf(value: unknown): number | null {
  const read = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(read) && read >= 0 ? read : null;
}

/**
 * One item as Drive records it, cut to what the table holds; null for a record with no usable id. `among` are the
 * folders a listing asked about: what sits in one of them is in that folder, whichever parent Drive names first.
 */
function itemOf(raw: unknown, among?: ReadonlySet<string>): SourceItemRecord | null {
  const file = recordOrEmpty(raw);
  const id = driveTextOf(file.id);
  if (!id || id.length > DRIVE_SHORT_MAX) return null;
  const mime = driveTextOf(file.mimeType) ?? "";
  const parents = Array.isArray(file.parents) ? file.parents : [];
  const millis = driveCountOf(recordOrNull(file.videoMediaMetadata)?.durationMillis);
  return {
    id,
    kind: driveKindOf(mime),
    parentId: driveTextOf(parents.find((parent) => typeof parent === "string" && among?.has(parent)) ?? parents[0]),
    name: (driveTextOf(file.name) ?? id).slice(0, DRIVE_NAME_MAX),
    mime,
    modifiedAt: driveTextOf(file.modifiedTime),
    createdAt: driveTextOf(file.createdTime),
    checksum: driveTextOf(file.md5Checksum)?.slice(0, DRIVE_SHORT_MAX) ?? null,
    bytes: driveCountOf(file.size),
    seconds: millis === null ? null : millis / SECOND_MS,
    addedBy: driveTextOf(recordOrNull(file.lastModifyingUser)?.displayName)?.slice(0, DRIVE_SHORT_MAX) ?? null,
    trashed: file.trashed === true,
  };
}

/** One change as the feed gives it: a file's ids, or null for a change that is not a file's. */
function driveChangeOf(raw: unknown): SourceChange | null {
  const change = recordOrEmpty(raw);
  const id = driveTextOf(change.fileId);
  if (!id || id.length > DRIVE_SHORT_MAX || (change.changeType !== undefined && change.changeType !== "file"))
    return null;
  const file = recordOrNull(change.file);
  const parents = Array.isArray(file?.parents) ? file.parents : [];
  const mime = driveTextOf(file?.mimeType);
  return {
    id,
    parentId: driveTextOf(parents[0]),
    // A type the folder does not list (a document) is no kind: its change is passed over unread.
    kind: mime === null || !isFootageMime(mime) ? null : driveKindOf(mime),
    trashed: file?.trashed === true,
    removed: change.removed === true,
  };
}

/** A query's text for Drive's `q`: a value inside quotes, its own quotes and backslashes escaped. */
const driveQuoted = (value: string): string => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** What the chooser asks Drive for under each place. */
function foldersQueryOf(where: DrivePlace): string {
  const folder = `mimeType = '${FOLDER_MIME}' and trashed = false`;
  if (where.place === "shared") return `sharedWithMe = true and ${folder}`;
  return `${driveQuoted(where.place === "folder" ? where.id : "root")} in parents and ${folder}`;
}

/** A call to Drive beyond a plain read: what it sends, and whether asking again could do its work twice. */
interface DriveCall {
  method: "POST";
  body: string;
  tries: number;
}

/** One call to Drive with an account's hour-long key: a read unless said, bounded, and asked once more where safe. */
type Ask = (
  accessToken: string,
  path: string,
  query: Record<string, string>,
  call?: DriveCall,
) => Promise<ProviderReply>;

const askWith =
  (deps: DriveDeps | undefined): Ask =>
  (accessToken, path, query, call) => {
    deps?.spent?.(driveUnitsOf(path));
    return fetchFromProvider(
      "google",
      `${DRIVE_API}${path}?${new URLSearchParams(query).toString()}`,
      {
        method: call?.method ?? "GET",
        headers: { Authorization: `Bearer ${accessToken}`, ...(call ? { "Content-Type": "application/json" } : {}) },
        ...(call ? { body: call.body } : {}),
        timeoutMs: DRIVE_CALL_MS,
        // A read is asked once more when Drive gave no answer: asking again reads the same.
        tries: call?.tries ?? 2,
        idempotent: call === undefined || call.tries > 1,
      },
      deps,
    );
  };

/** Where a folder's changes are read: its shared drive's own list, or the account's. */
const changeListOf = (folder: SourceFolder): Record<string, string> =>
  folder.driveId
    ? { driveId: folder.driveId, supportsAllDrives: "true", includeItemsFromAllDrives: "true" }
    : { supportsAllDrives: "true" };

async function validateFolder(ask: Ask, accessToken: string, folderId: string): Promise<SourceReply<SourceFolder>> {
  const reply = await ask(accessToken, `/files/${encodeURIComponent(folderId)}`, {
    fields: "id,name,mimeType,driveId,trashed",
    supportsAllDrives: "true",
  });
  if (reply.outcome !== "ok") return driveRefusalOf("files.get", reply, "item");
  const file = recordOrEmpty(reply.json);
  const id = driveTextOf(file.id);
  // Something that is not a folder, or one in the bin, is not there to be watched.
  if (!id || file.mimeType !== FOLDER_MIME || file.trashed === true) return { verdict: "gone" };
  return {
    verdict: "ok",
    answer: { id, name: (driveTextOf(file.name) ?? id).slice(0, DRIVE_NAME_MAX), driveId: driveTextOf(file.driveId) },
  };
}

async function getStartCursor(ask: Ask, accessToken: string, folder: SourceFolder): Promise<SourceReply<string>> {
  const reply = await ask(accessToken, "/changes/startPageToken", changeListOf(folder));
  if (reply.outcome !== "ok") return driveRefusalOf("startPageToken", reply);
  const cursor = driveTextOf(recordOrNull(reply.json)?.startPageToken);
  if (!cursor) throw new SourceUnanswered("startPageToken", reply.status);
  return { verdict: "ok", answer: cursor };
}

async function listChildrenOf(
  ask: Ask,
  accessToken: string,
  parents: { driveId: string | null; ids: readonly string[] },
  page: string | null,
): Promise<SourceReply<SourceChildren>> {
  const { driveId, ids: parentIds } = parents;
  if (parentIds.length > 1 && !driveId)
    throw new Error("drive files.list: many folders are asked together only inside a shared drive");
  const inAny = parentIds.map((parentId) => `${driveQuoted(parentId)} in parents`).join(" or ");
  const reply = await ask(accessToken, "/files", {
    q: `${parentIds.length === 1 ? inAny : `(${inAny})`} and trashed = false and ${FOOTAGE_ONLY}`,
    fields: `nextPageToken,files(${ITEM_FIELDS})`,
    pageSize: String(DRIVE_PAGE),
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    // Inside a shared drive the question is put to the whole drive, Google's documented way to a whole answer:
    // asked of the account's own files, many folders at once are answered only in part.
    ...(driveId ? { corpora: "drive", driveId } : {}),
    ...(page ? { pageToken: page } : {}),
  });
  // A page token Drive no longer takes (it lasts some hours) starts the folder again: every write is once an item.
  if (page && pageRefused(reply)) return listChildrenOf(ask, accessToken, parents, null);
  if (reply.outcome !== "ok") return driveRefusalOf("files.list", reply);
  const body = recordOrEmpty(reply.json);
  const files = Array.isArray(body.files) ? body.files : [];
  return {
    verdict: "ok",
    answer: {
      items: files.flatMap((file) => itemOf(file, new Set(parentIds)) ?? []),
      nextPage: driveTextOf(body.nextPageToken),
    },
  };
}

async function listChanges(
  ask: Ask,
  accessToken: string,
  folder: SourceFolder,
  cursor: string,
): Promise<SourceReply<SourceChanges>> {
  const reply = await ask(accessToken, "/changes", {
    pageToken: cursor,
    pageSize: String(CHANGES_PAGE),
    fields: CHANGE_FIELDS,
    includeRemoved: "true",
    ...changeListOf(folder),
  });
  // A place in the list Drive no longer knows: gone, and its reader starts again from a fresh walk.
  if (pageRefused(reply)) return { verdict: "gone" };
  // A shared drive's own list not found: the account is no longer that drive's member, and its folder cannot be read.
  if (reply.status === 404 && folder.driveId) return { verdict: "no_access" };
  if (reply.outcome !== "ok") return driveRefusalOf("changes.list", reply);
  const body = recordOrEmpty(reply.json);
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const answer: SourceChanges = {
    changes: changes.flatMap((change) => driveChangeOf(change) ?? []),
    nextPage: driveTextOf(body.nextPageToken),
    cursor: driveTextOf(body.newStartPageToken),
  };
  if (!answer.nextPage && !answer.cursor) throw new SourceUnanswered("changes.list", reply.status);
  return { verdict: "ok", answer };
}

async function getItem(ask: Ask, accessToken: string, itemId: string): Promise<SourceReply<SourceItemRecord>> {
  const reply = await ask(accessToken, `/files/${encodeURIComponent(itemId)}`, {
    fields: ITEM_FIELDS,
    supportsAllDrives: "true",
  });
  if (reply.outcome !== "ok") return driveRefusalOf("files.get", reply, "item");
  const item = itemOf(reply.json);
  if (!item) throw new SourceUnanswered("files.get", reply.status);
  return { verdict: "ok", answer: item };
}

async function openChannel(
  ask: Ask,
  accessToken: string,
  folder: SourceFolder,
  channelAsk: SourceChannelAsk,
): Promise<SourceReply<SourceChannel>> {
  // Drive watches from a place in the change list: now. What changed before is the source's own cursor's to read.
  const from = await getStartCursor(ask, accessToken, folder);
  if (from.verdict !== "ok") return from;
  const reply = await ask(
    accessToken,
    "/changes/watch",
    { pageToken: from.answer, ...changeListOf(folder) },
    {
      method: "POST",
      // Asked once: a second ask of a watch that did open would be refused for its id.
      tries: 1,
      body: JSON.stringify({
        id: channelAsk.id,
        type: "web_hook",
        address: channelAsk.address,
        token: channelAsk.token,
        expiration: String(Date.now() + CHANNEL_LASTS_MS),
      }),
    },
  );
  if (reply.outcome !== "ok") return driveRefusalOf("changes.watch", reply);
  const body = recordOrEmpty(reply.json);
  const resourceId = driveTextOf(body.resourceId);
  const expires = driveCountOf(body.expiration);
  if (!resourceId || expires === null) throw new SourceUnanswered("changes.watch", reply.status);
  return { verdict: "ok", answer: { id: channelAsk.id, resourceId, expiresAt: new Date(expires).toISOString() } };
}

async function closeChannel(
  ask: Ask,
  accessToken: string,
  channel: Pick<SourceChannel, "id" | "resourceId">,
): Promise<SourceReply<null>> {
  // Asked once more where Drive gave no answer: a channel closed twice is only gone.
  const reply = await ask(
    accessToken,
    "/channels/stop",
    {},
    { method: "POST", tries: 2, body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }) },
  );
  return reply.outcome === "ok" ? { verdict: "ok", answer: null } : driveRefusalOf("channels.stop", reply);
}

async function listFolders(
  ask: Ask,
  accessToken: string,
  where: DrivePlace,
  page: string | null,
): Promise<SourceReply<DriveFolderChoices>> {
  if (where.place === "drives") {
    const reply = await ask(accessToken, "/drives", {
      pageSize: "100",
      fields: "nextPageToken,drives(id,name)",
      ...(page ? { pageToken: page } : {}),
    });
    if (reply.outcome !== "ok") return driveRefusalOf("drives.list", reply);
    return { verdict: "ok", answer: folderChoicesOf(recordOrEmpty(reply.json), "drives") };
  }
  const reply = await ask(accessToken, "/files", {
    q: foldersQueryOf(where),
    fields: "nextPageToken,files(id,name)",
    orderBy: "name_natural",
    pageSize: "200",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    ...(page ? { pageToken: page } : {}),
  });
  if (reply.outcome !== "ok") return driveRefusalOf("files.list", reply);
  return { verdict: "ok", answer: folderChoicesOf(recordOrEmpty(reply.json), "files") };
}

/** Drive as a footage source's provider. `deps` is a test's network. */
export function driveSource(deps?: DriveDeps): DriveSource {
  const ask = askWith(deps);
  return {
    provider: "google",
    validateFolder: (accessToken, folderId) => validateFolder(ask, accessToken, folderId),
    getStartCursor: (accessToken, folder) => getStartCursor(ask, accessToken, folder),
    listChildren: (accessToken, parentId, page) =>
      listChildrenOf(ask, accessToken, { driveId: null, ids: [parentId] }, page),
    listChildrenOf: (accessToken, folder, parentIds, page) =>
      listChildrenOf(ask, accessToken, { driveId: folder.driveId, ids: parentIds }, page),
    listChanges: (accessToken, folder, cursor) => listChanges(ask, accessToken, folder, cursor),
    getItem: (accessToken, itemId) => getItem(ask, accessToken, itemId),
    openChannel: (accessToken, folder, channelAsk) => openChannel(ask, accessToken, folder, channelAsk),
    closeChannel: (accessToken, channel) => closeChannel(ask, accessToken, channel),
    // An hour, as the access token lasts: the address is asked for again by whoever needs it later.
    getBytesAddress: (accessToken, itemId) =>
      Promise.resolve({
        verdict: "ok",
        answer: {
          url: `${DRIVE_API}/files/${encodeURIComponent(itemId)}?alt=media&supportsAllDrives=true`,
          headers: { Authorization: `Bearer ${accessToken}` },
          expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
        },
      }),
    listFolders: (accessToken, where, page) => listFolders(ask, accessToken, where, page),
  };
}

/** A list's page as the chooser reads it: each entry's id and name. */
function folderChoicesOf(body: Record<string, unknown>, key: "files" | "drives"): DriveFolderChoices {
  const entries = Array.isArray(body[key]) ? body[key] : [];
  return {
    folders: entries.flatMap((raw) => {
      const entry = recordOrEmpty(raw);
      const id = driveTextOf(entry.id);
      return id ? [{ id, name: (driveTextOf(entry.name) ?? id).slice(0, DRIVE_NAME_MAX) }] : [];
    }),
    nextPage: driveTextOf(body.nextPageToken),
  };
}
