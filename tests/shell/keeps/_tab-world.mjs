/**
 * A tab as the browser keeps one, for the journeys that leave a workspace (a switch, a sign-out): its two storages, its
 * address, the ways a page leaves, and what a tab in Harbor Moving holds after a morning's work, each written by the
 * module that writes it in the app. Everything of Harbor's that could be read says "Harbor's", so a journey asks one thing
 * of what is left: does any of it still say so.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { importSrc } from "../../_source.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";

export const HARBOR = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "harbor-moving", name: "Harbor Moving" };
export const GLOW = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", slug: "glow-studio", name: "Glow Studio" };
/** What every row, name and word of Harbor's says in these tests. */
export const HARBORS = "Harbor's";

/** A store as the browser's are: read by name and walked by index, as a clear walks it. */
function storage() {
  const held = new Map();
  return {
    getItem: (k) => (held.has(k) ? held.get(k) : null),
    setItem: (k, v) => held.set(k, String(v)),
    removeItem: (k) => held.delete(k),
    key: (i) => [...held.keys()][i] ?? null,
    get length() {
      return held.size;
    },
    /** Every name and what it holds, for a test to read. */
    all: () => [...held.entries()],
  };
}

/** The tab: its window stands in for the browser's, and `left` is every load it asked for. */
export function tabWorld() {
  const left = [];
  const heard = {};
  const posted = [];
  const tab = storage();
  const device = storage();
  const win = {
    location: {
      pathname: `/w/${HARBOR.slug}/inbox`,
      search: "",
      hash: "",
      assign: (to) => left.push(["assign", to]),
      replace: (to) => left.push(["replace", to]),
      reload: () => left.push(["reload"]),
    },
    sessionStorage: tab,
    localStorage: device,
    addEventListener: (type, fn) => (heard[type] ||= []).push(fn),
    removeEventListener() {},
    dispatchEvent: () => true,
  };
  globalThis.sessionStorage = tab;
  globalThis.localStorage = device;
  globalThis.document = {
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ submit: () => posted.push("/auth/signout") }),
    body: { appendChild() {} },
  };
  win.document = globalThis.document;
  globalThis.window = win;
  globalThis.location = win.location;
  globalThis.CustomEvent ??= class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };
  /** The page going away: what waits to be written is written, as the browser's `pagehide` has it. */
  const hide = () => {
    for (const fn of heard.pagehide ?? []) fn();
  };
  /** Every name or value either storage holds that still says something of Harbor's. */
  const saysHarbors = () =>
    [...tab.all().map((kept) => ["tab", ...kept]), ...device.all().map((kept) => ["device", ...kept])]
      .filter(([, name, value]) => `${name} ${value}`.includes(HARBORS))
      .map(([where, name]) => `${where}: ${name}`);
  return { win, tab, device, left, posted, hide, saysHarbors };
}

/**
 * A morning in Harbor Moving, kept as the app keeps it: the Inbox's rows on the device, a person read in the tab, a reply
 * half-written, the sequence the next pile adds to, a reply carried to a thread, a phone's last rows, a clip half-sent.
 * Answers the stores a journey lands a late read through.
 */
export async function aMorningInHarbor(world) {
  const cache = await importSrc("apps/dashboard/src/bridge/surface-cache.ts");
  const { readCache, flushReadCaches } = await importSrc("apps/dashboard/src/bridge/read-cache.ts");
  const { tabMemoryFor } = await importSrc("apps/dashboard/src/bridge/tab-memory.ts");
  const carried = await importSrc("apps/dashboard/src/surfaces/inbox/carried-reply.ts");
  const video = await importSrc("apps/dashboard/src/surfaces/files/video/send.ts");

  bridgeHolds(
    {
      who: {
        workspaces: [
          { ...HARBOR, status: "active", timezone: "America/New_York" },
          { ...GLOW, status: "active", timezone: "America/New_York" },
        ],
        me: { id: "u1", email: "ada@example.com", role: "owner" },
        activeWorkspaceId: HARBOR.id,
      },
      values: { inbox: { threads: [{ id: "th-1", who: `${HARBORS} customer` }] } },
    },
    { fresh: true },
  );
  cache.snapshotSurface("inbox", HARBOR.id, undefined, "inbox");
  cache.flushSurfaceCache();

  const people = readCache("person", () => true, { tab: true });
  await people.through("p-1", async () => ({ name: `${HARBORS} first person` }));
  flushReadCaches();

  const memory = tabMemoryFor(world.win);
  memory.keepDraft("reply", `words to ${HARBORS} customer`, "th-1");
  memory.keepPlace("inbox", "all", { q: `${HARBORS} search` });

  // The pile's target as Sequences keeps it (campaigns/reach-out/surface.ts pileAsk.set), under its own name.
  world.tab.setItem("leads.pile.target", JSON.stringify({ id: "seq-1", name: `${HARBORS} winter offer` }));
  carried.carryReply("inbox/th-1", `a reply for ${HARBORS} customer`);
  carried.carryDraft("inbox/th-1");
  // A phone's last screen (surfaces/frame/first-rows.ts), under its own slot's head.
  world.device.setItem(`chanlytics.rows.v1:${HARBOR.slug}`, JSON.stringify({ rows: [`${HARBORS} first row`] }));
  video.keepUpload("clip-1", { id: "file-1", url: "https://upload.example.org/tus/1" });

  return { cache, people, flushReadCaches, memory, carried, video };
}
