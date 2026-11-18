/**
 * A Google Drive that answers from memory, for the footage sources' tests (the footage sources plan, P2): a tree of
 * files and folders, the account's change list, its push channels and Google's token endpoint, behind one `fetch`.
 *
 * It keeps the rules of the real one that the sync leans on:
 *   - the change list holds each file once, at its newest change, so a file changed again moves to the end;
 *   - a place in the list (a page token, a start token) never expires, unless a test says it did (`forgetPlaces`);
 *   - a list answers a page at a time, and a page is at most what was asked for;
 *   - a file the account cannot see is a 404, the same as one that was deleted (`unshare`), and a file it may see
 *     but not read is a 403 (`forbid`);
 *   - a shared drive has a change list of its own;
 *   - a list may ask for the children of many folders at once (`'a' in parents or 'b' in parents`), and where
 *     one of them is not there the whole question is refused, as it is for that folder alone;
 *   - many folders asked together are answered in full only when the whole shared drive is asked
 *     (`corpora=drive`). Asked of the account's own files, only what it opened itself comes back (`viewedByMe`):
 *     measured on a real account, 161 folders of more than 1,700;
 *   - a file's bytes (`alt=media`) come by the range asked for, with the whole file's size beside them, and are a
 *     download: what the taking of a file asks for (`holds` gives a file its bytes; one given none holds none).
 *
 * Every call is kept (`calls`), with what it costs at Google since 1 May 2026 (`units()`): an item's record 5, a
 * list 100, a channel closed 5, a download 200. A test reads back what was asked, as Google would read it.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
const FOLDER = "application/vnd.google-apps.folder";

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const refusal = (status, reason, extra = {}, headers = {}) =>
  json(status, { error: { code: status, errors: [{ reason, ...extra }] } }, headers);

/** What each call costs, by its path; a file's bytes are a download. */
function unitsOf(method, path, media) {
  if (media && method === "GET" && path.startsWith("/drive/v3/files/")) return 200;
  if (path === "/drive/v3/changes/startPageToken") return 5;
  if (path === "/drive/v3/changes" || path === "/drive/v3/files" || path === "/drive/v3/drives") return 100;
  if (path === "/drive/v3/changes/watch") return 100;
  if (path === "/drive/v3/channels/stop") return 5;
  return method === "GET" && path.startsWith("/drive/v3/files/") ? 5 : 0;
}

export function fakeDrive() {
  /** id → the file as Drive records it. */
  const files = new Map();
  /** The change list: `{ seq, fileId, removed }`, each file once. */
  let changes = [];
  let seq = 100;
  const hidden = new Map();
  /** id → the bytes a file holds: all of them, or only its first, with `size` saying how many the whole has. */
  const contents = new Map();
  const channels = new Map();
  const calls = [];
  /** Replies handed out before the drive answers for itself, each for the next call whose path matches. */
  const queued = [];
  /** Grants the token endpoint hands out, in order; a function is called with the form it was sent. */
  const grants = [];
  const revoked = [];
  let placesForgotten = false;
  /** The most a page of files holds, whatever was asked for: a test makes a small folder take several pages. */
  let pageCap = 1000;
  /** Called with each call before it is answered: a test moves its clock on here. */
  let onCall = null;

  const changed = (fileId, removed = false) => {
    changes = changes.filter((change) => change.fileId !== fileId);
    changes.push({ seq: seq++, fileId, removed });
  };
  const visible = (file) => file && !hidden.has(file.id);
  const fieldsOf = (file) => ({ ...file, size: file.size === undefined ? undefined : String(file.size) });

  const drive = {
    calls,
    channels,
    revoked,
    /** A file or a folder put in the drive, or changed: `{ id, name, mimeType, parents, ... }`. */
    put(file) {
      const before = files.get(file.id) ?? {};
      const now = new Date().toISOString();
      files.set(file.id, { modifiedTime: now, createdTime: now, ...before, ...file });
      changed(file.id);
      return drive;
    },
    folder(id, name, parent, extra = {}) {
      return drive.put({ id, name, mimeType: FOLDER, parents: parent ? [parent] : [], ...extra });
    },
    video(id, name, parent, extra = {}) {
      return drive.put({
        id,
        name,
        mimeType: "video/quicktime",
        parents: [parent],
        size: 56_000_000,
        md5Checksum: `md5-${id}`,
        videoMediaMetadata: { durationMillis: "8000" },
        ...extra,
      });
    },
    photo(id, name, parent, extra = {}) {
      return drive.put({
        id,
        name,
        mimeType: "image/heic",
        parents: [parent],
        size: 3_000_000,
        md5Checksum: `md5-${id}`,
        ...extra,
      });
    },
    move(id, parent) {
      return drive.put({ id, parents: [parent] });
    },
    /** The bytes a file holds, read by `alt=media`: no change is listed for them. */
    holds(id, bytes) {
      contents.set(id, bytes);
      return drive;
    },
    trash(id) {
      return drive.put({ id, trashed: true });
    },
    /** A video's length arrives, as Drive measures an upload some minutes on: no change is listed for it. */
    measure(id, millis) {
      files.set(id, { ...files.get(id), videoMediaMetadata: { durationMillis: String(millis) } });
      return drive;
    },
    /** Deleted for good: its provider no longer knows it. */
    remove(id) {
      files.delete(id);
      changed(id, true);
      return drive;
    },
    /** No longer shared with the account: Drive answers as it does for a deleted file, a 404. */
    unshare(id) {
      hidden.set(id, 404);
      changed(id, true);
      return drive;
    },
    /** Shared with the account again, or readable again. */
    share(id) {
      hidden.delete(id);
      changed(id);
      return drive;
    },
    /** Visible but not readable by the account: a 403. */
    forbid(id) {
      hidden.set(id, 403);
      changed(id, true);
      return drive;
    },
    /** `count` changes elsewhere in the account: someone busy in their documents. */
    busyElsewhere(count, driveId = null) {
      for (let n = 0; n < count; n++) {
        const id = `doc-${seq}`;
        files.set(id, {
          id,
          name: `Notes ${seq}`,
          mimeType: "application/vnd.google-apps.document",
          parents: ["somewhere-else"],
          driveId,
        });
        changed(id);
      }
      return drive;
    },
    setPageCap(cap) {
      pageCap = cap;
      return drive;
    },
    onEachCall(hook) {
      onCall = hook;
      return drive;
    },
    /** The next call to `path` is answered with this instead. */
    answerNext(path, response) {
      queued.push({ path, response });
      return drive;
    },
    /** Every place in the change list handed out so far is refused from now on. */
    forgetPlaces() {
      placesForgotten = seq;
      return drive;
    },
    /** What the token endpoint hands out next. */
    grant(body) {
      grants.push(body);
      return drive;
    },
    /** The units every call so far cost, in all or for the calls a filter keeps. */
    units(keep = () => true) {
      return calls.filter(keep).reduce((sum, call) => sum + call.units, 0);
    },
    count(path) {
      return calls.filter(
        (call) => call.path === path || (path.endsWith("/*") && call.path.startsWith(path.slice(0, -1))),
      ).length;
    },
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method ?? "GET";
      const path = url.pathname;
      const call = {
        method,
        path,
        query: Object.fromEntries(url.searchParams),
        body: init.body ?? null,
        units: unitsOf(method, path, url.searchParams.get("alt") === "media"),
      };
      calls.push(call);
      onCall?.(call);
      const next = queued.findIndex((entry) => entry.path === path);
      if (next >= 0) return queued.splice(next, 1)[0].response;

      if (url.host === "oauth2.googleapis.com" && path === "/token") {
        const grant = grants.shift();
        if (!grant) return json(400, { error: "invalid_grant" });
        const body = typeof grant === "function" ? grant(new URLSearchParams(String(init.body))) : grant;
        return json(body.error ? 400 : 200, body);
      }
      if (url.host === "oauth2.googleapis.com" && path === "/revoke") {
        revoked.push(new URLSearchParams(String(init.body)).get("token"));
        return json(200, {});
      }
      if (path === "/drive/v3/changes/startPageToken") return json(200, { startPageToken: String(seq) });
      if (path === "/drive/v3/changes") return listChanges(url);
      if (path === "/drive/v3/changes/watch") {
        const asked = JSON.parse(String(init.body));
        const channel = {
          ...asked,
          resourceId: `resource-${channels.size + 1}`,
          driveId: url.searchParams.get("driveId"),
        };
        channels.set(asked.id, channel);
        return json(200, {
          kind: "api#channel",
          id: asked.id,
          resourceId: channel.resourceId,
          expiration: asked.expiration,
        });
      }
      if (path === "/drive/v3/channels/stop") {
        const asked = JSON.parse(String(init.body));
        return channels.delete(asked.id) ? new Response(null, { status: 204 }) : refusal(404, "notFound");
      }
      if (path === "/drive/v3/drives") {
        const drives = [...new Set([...files.values()].map((file) => file.driveId).filter(Boolean))];
        return json(200, { drives: drives.map((id) => ({ id, name: `Drive ${id}` })) });
      }
      if (path === "/drive/v3/files") return listFiles(url);
      if (path.startsWith("/drive/v3/files/")) {
        const id = decodeURIComponent(path.slice("/drive/v3/files/".length));
        const file = files.get(id);
        if (hidden.get(id) === 403) return refusal(403, "insufficientFilePermissions");
        if (!visible(file)) return refusal(404, "notFound");
        return url.searchParams.get("alt") === "media" ? bytesOf(file, init) : json(200, fieldsOf(file));
      }
      throw new Error(`the pretend drive does not answer ${method} ${url}`);
    },
  };

  /** A file's bytes, by the range asked for: what it holds of them, and the whole file's size beside. */
  function bytesOf(file, init) {
    const held = contents.get(file.id) ?? new Uint8Array(0);
    const size = Number(file.size ?? held.length);
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)]),
    );
    const range = /^bytes=(\d+)-(\d+)$/.exec(headers.range ?? "");
    const from = range ? Number(range[1]) : 0;
    const to = Math.min(range ? Number(range[2]) : size - 1, held.length - 1, size - 1);
    return new Response(held.subarray(from, to + 1), {
      status: 206,
      headers: { "content-type": file.mimeType, "content-range": `bytes ${from}-${to}/${size}` },
    });
  }

  function listChanges(url) {
    const from = Number(url.searchParams.get("pageToken"));
    if (!Number.isFinite(from) || (placesForgotten !== false && from < placesForgotten))
      return refusal(400, "invalid", { location: "pageToken", locationType: "parameter" });
    const driveId = url.searchParams.get("driveId");
    const size = Math.min(Number(url.searchParams.get("pageSize") ?? 100), 1000);
    const inList = changes.filter((change) => {
      if (change.seq < from) return false;
      const file = files.get(change.fileId);
      return (file?.driveId ?? null) === driveId || (!file && driveId === null);
    });
    const page = inList.slice(0, size);
    const rest = inList[size];
    return json(200, {
      changes: page.map((change) => {
        const file = files.get(change.fileId);
        return change.removed || !visible(file)
          ? { changeType: "file", fileId: change.fileId, removed: true }
          : {
              changeType: "file",
              fileId: change.fileId,
              removed: false,
              file: { id: file.id, parents: file.parents, mimeType: file.mimeType, trashed: file.trashed === true },
            };
      }),
      ...(rest ? { nextPageToken: String(rest.seq) } : { newStartPageToken: String(seq) }),
    });
  }

  function listFiles(url) {
    const query = url.searchParams.get("q") ?? "";
    const parents = [...query.matchAll(/'((?:[^'\\]|\\.)*)' in parents/g)].map((match) =>
      match[1].replace(/\\(.)/g, "$1"),
    );
    // A listing asks for folders, photos and videos alone; the chooser for folders alone.
    const mediaOnly = query.includes("mimeType contains 'image/'");
    const foldersOnly = !mediaOnly && query.includes(`mimeType = '${FOLDER}'`);
    const shared = query.startsWith("sharedWithMe = true");
    const root = [...files.values()].find((file) => file.root === true)?.id;
    for (const parent of parents.filter((asked) => asked !== "root")) {
      if (hidden.get(parent) === 403) return refusal(403, "insufficientFilePermissions");
      if (!visible(files.get(parent))) return refusal(404, "notFound");
    }
    const wanted = new Set(parents.map((asked) => (asked === "root" ? root : asked)));
    const wholeDrive = url.searchParams.get("corpora") === "drive" ? url.searchParams.get("driveId") : null;
    const inPart = parents.length > 1 && wholeDrive === null;
    const all = [...files.values()].filter(
      (file) =>
        visible(file) &&
        file.trashed !== true &&
        (!foldersOnly || file.mimeType === FOLDER) &&
        (!mediaOnly || file.mimeType === FOLDER || /^(image|video)\//.test(file.mimeType ?? "")) &&
        (shared ? file.sharedWithMe === true : (file.parents ?? []).some((parent) => wanted.has(parent))) &&
        (wholeDrive === null || file.driveId === wholeDrive) &&
        (!inPart || file.viewedByMe === true),
    );
    const size = Math.min(Number(url.searchParams.get("pageSize") ?? 100), pageCap);
    const from = Number(url.searchParams.get("pageToken") ?? 0);
    const page = all.slice(from, from + size);
    return json(200, {
      files: page.map(fieldsOf),
      ...(from + size < all.length ? { nextPageToken: String(from + size) } : {}),
    });
  }

  return drive;
}

export { refusal as driveRefusal };
