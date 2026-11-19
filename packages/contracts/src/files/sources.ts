/**
 * Footage sources: the places a business's photos and videos already live, watched (the footage sources plan of 17
 * November 2026; its tables are 00639's). Here are the closed sets those tables hold and the contract each provider
 * fills. Types and sets only: nothing connects, reads or takes a file yet, so the folder's barrel names none of it
 * until a tree imports it. The sets are held to the schema by their path (shared/schema-sets.ts), the contract's shape
 * by the type test beside this, and a set's own type (`(typeof SET)[number]`) arrives with its first reader.
 */

/* ------------------------------------------------------------------------------------------------ the closed sets */

/** Whose account a source is read through (00639 source_connections.provider): Google, for Google Drive. */
export const SOURCE_PROVIDERS = ["google"] as const;

export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

/** How a connected account stands (source_connections.health): its column comment says each. */
export const SOURCE_CONNECTION_HEALTHS = ["ok", "needs_reconnect", "blocked_by_admin"] as const;

/** Where a watched folder stands (media_sources.state): its column comment says each. */
export const MEDIA_SOURCE_STATES = ["setting_up", "watching", "paused", "frozen", "stopped"] as const;

/**
 * The walk a watched folder has in flight (media_sources.walk_kind, 00641): the first listing of its whole tree, a
 * re-walk that finds what its changes missed, or the contents of a folder that appeared or moved in.
 */
export const SOURCE_WALK_KINDS = ["snapshot", "reconcile", "subtree"] as const;

export type SourceWalkKind = (typeof SOURCE_WALK_KINDS)[number];

/** What an item under a watched folder is (source_items.kind): `other` is seen and passed over. */
export const SOURCE_ITEM_KINDS = ["folder", "image", "video", "other"] as const;

export type SourceItemKind = (typeof SOURCE_ITEM_KINDS)[number];

/** Where an item stands (source_items.state): its column comment says each. */
export const SOURCE_ITEM_STATES = [
  "listed",
  "waiting",
  "taking",
  "in",
  "too_big",
  "not_media",
  "let_go",
  "failed",
  "outside",
  "gone",
  "no_access",
] as const;

export type SourceItemState = (typeof SOURCE_ITEM_STATES)[number];

/**
 * Why an item stands where it does (source_items.why, held by 00643's check): the one list a screen has words for.
 * Read with the item's state. First why it waits, then why it was passed over, then why its take failed.
 */
export const SOURCE_ITEM_WHYS = [
  /** A day's budget bound: it comes in tomorrow. */
  "budget",
  /** The workspace's videos are full. */
  "room",
  /** The Library is full. */
  "library_full",
  /** The workspace takes no videos yet, or this deployment cannot send one. */
  "videos_off",
  /** The video platform is preparing as many clips as it takes at once. */
  "busy",
  /** Its folder is not being read just now. */
  "folder",
  /** Its provider said "not now". */
  "pace",
  /** Its job ran out of time before a download could start. */
  "deadline",
  /** A fetch of it failed, and it is tried again. */
  "retry",
  /** Its take never ended (its job was lost), and it is taken again. */
  "lost",
  /** Not a photo or a video of a type the Library takes. */
  "kind",
  /** It holds no bytes. */
  "empty",
  /** A photo too small to use. */
  "too_small",
  /** Its bytes are not what its name says, or its provider would not give it. */
  "unreadable",
  /** Over the most bytes a photo or a video may have. */
  "bytes",
  /** A video longer than AI can watch. */
  "seconds",
  /** A photo of more pixels than one may have. */
  "pixels",
  /** Its job ended for good before it began a file. */
  "stopped",
  /** The video platform could not prepare it. */
  "stream",
  /** Its provider no longer shows it at all, and its bin never showed it: unreadable, never read as gone (the sync). */
  "not_found",
] as const;

export type SourceItemWhy = (typeof SOURCE_ITEM_WHYS)[number];

/**
 * What a provider's reply means to the read that asked. `pace` is "rest, then go on" (the provider's own limit, never
 * a refusal); `no_access` is a grant or an item the provider no longer lets be read, which is never read as `gone`.
 */
export type SourceVerdict = "ok" | "pace" | "no_access" | "gone";

/* ------------------------------------------------------------------------------------------- what a provider says */

/** A provider's answer to one call: what was asked for, how long to rest before asking again, or why there is none. */
export type SourceReply<Answer> =
  { verdict: "ok"; answer: Answer } | { verdict: "pace"; restMs: number } | { verdict: "no_access" | "gone" };

/** A folder a source may watch, as its provider names it; `driveId` where it sits in a shared drive. */
export interface SourceFolder {
  id: string;
  name: string;
  driveId: string | null;
}

/**
 * One item as its provider records it: all the take reads before any bytes move. Never a photo's place or camera.
 * What a provider gives is cut to what the table holds before it is written (00639's checks): an id and a checksum
 * 200 characters, a name 1,000, who added it 200. A longer one refused whole would lose its row, and its page with it.
 */
export interface SourceItemRecord {
  id: string;
  kind: SourceItemKind;
  parentId: string | null;
  name: string;
  mime: string;
  modifiedAt: string | null;
  /** When its provider first held it (an upload's moment), where the provider says. */
  createdAt: string | null;
  checksum: string | null;
  bytes: number | null;
  /** A video's length, where the provider says: it may come some time after an upload. */
  seconds: number | null;
  /** Who added it, where the provider names them (in a shared drive, whoever changed it last). */
  addedBy: string | null;
  trashed: boolean;
}

/**
 * One change as a provider's feed gives it: ids only, since the feed covers the whole account and a name is read only
 * for an item inside the watched folder. `kind` is null where the feed names no type, or one a watched folder does
 * not list (a document): such a change is never read. `removed` alone is "deleted, or no longer readable": the item's own record
 * says which.
 */
export interface SourceChange {
  id: string;
  parentId: string | null;
  kind: SourceItemKind | null;
  trashed: boolean;
  removed: boolean;
}

/** One page of a folder's children, and the token for the next; null on the last. */
export interface SourceChildren {
  items: SourceItemRecord[];
  nextPage: string | null;
}

/** One page of changes: the token for the next page, or, on the last, the cursor the next read starts from. */
export interface SourceChanges {
  changes: SourceChange[];
  nextPage: string | null;
  cursor: string | null;
}

/**
 * A push channel as the provider opened it: it ends by itself and is never renewed, only replaced. `resourceId` is the
 * provider's own name for what the channel watches, which it asks for, with our id, to close it.
 */
export interface SourceChannel {
  id: string;
  resourceId: string;
  expiresAt: string;
}

/** Where an item's bytes can be fetched from, for a short time: an address and the headers that open it. */
export interface SourceBytesAddress {
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

/** The channel a provider is asked to open: our id for it, the token it sends back with each signal, where it calls. */
export interface SourceChannelAsk {
  id: string;
  token: string;
  address: string;
}

/* --------------------------------------------------------------------------------------------------- the contract */

/**
 * The contract each provider fills (Google Drive first; Dropbox and OneDrive later, the same shape). Every call takes
 * the grant's access token and answers a SourceReply, so the verdict on a reply (go on, rest, no access, gone) is the
 * provider's own to give and one reader's to act on. An adapter owns its wire and knows nothing of sources, the
 * Library or jobs.
 */
export interface SourceProviderContract {
  provider: SourceProvider;
  /** The folder by its id: that it exists, can be listed, and where its changes are read. */
  validateFolder(accessToken: string, folderId: string): Promise<SourceReply<SourceFolder>>;
  /** Where the folder's changes stand now: taken before a first walk, so nothing changed during it is missed. */
  getStartCursor(accessToken: string, folder: SourceFolder): Promise<SourceReply<string>>;
  /** One page of what sits directly in a folder. */
  listChildren(accessToken: string, parentId: string, page: string | null): Promise<SourceReply<SourceChildren>>;
  /** One page of what changed since a cursor. */
  listChanges(accessToken: string, folder: SourceFolder, cursor: string): Promise<SourceReply<SourceChanges>>;
  /** One item's own record. */
  getItem(accessToken: string, itemId: string): Promise<SourceReply<SourceItemRecord>>;
  /** Opens a push channel on the folder's changes. */
  openChannel(accessToken: string, folder: SourceFolder, ask: SourceChannelAsk): Promise<SourceReply<SourceChannel>>;
  /** Closes a push channel this account opened: one already gone answers `gone`. */
  closeChannel(accessToken: string, channel: Pick<SourceChannel, "id" | "resourceId">): Promise<SourceReply<null>>;
  /** Where one item's bytes can be fetched from. */
  getBytesAddress(accessToken: string, itemId: string): Promise<SourceReply<SourceBytesAddress>>;
}
