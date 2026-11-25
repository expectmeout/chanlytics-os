/**
 * The rest of a load's reads, asked as one (GET open/rest, "Pages that open at once" piece 8): what the client's `gather`
 * collects while the boot starts the pages not on screen (bridge/surface-runner.ts), sent as one streamed request whose
 * lines each answer one read, as GET open answers a page's own (server/workspace/page-open.ts).
 *
 * The boot asked each of them in a request of its own, four at a time: 36 requests a load, each a function started and a
 * session checked, and on a slow phone nine first opens in 52 waited five to nine seconds on a server busy with them (23 Nov
 * 2026). And each answer was handed over as it landed, so a page's store took several in one task, and the page drew again
 * for each in the same task: a press right after a load waited behind them, 150 to 280 ms on real phones. Here each answer
 * is handed over a task at a time, and a press waits behind one at most.
 */
import { FAILED_WHOLE, openReadPathOf } from "@chanlytics/contracts";

/** The path every read is asked at, before its own: `/api/v1/contacts` is the read `contacts`. */
const READS_AT = "/api/v1/";
/** How long the rest may take, from its asking to its last line: what is not in by then is asked alone. */
const REST_WAIT_MS = 20_000;

/** A URL's read as GET open/rest names it: its path and its query, without the workspace, which the request names once. */
function restKeyOf(url: string): { key: string; workspace: string | null } {
  const at = new URL(url, "http://read.local");
  const workspace = at.searchParams.get("workspace");
  at.searchParams.delete("workspace");
  return { key: `${at.pathname.slice(READS_AT.length)}${at.search}`, workspace };
}

/** Whether GET open/rest answers this URL's read: its path, an id in it said `[id]`, is one of contracts OPEN_READ_PATHS. */
function carries(url: string): boolean {
  const path = new URL(url, "http://read.local").pathname;
  return path.startsWith(READS_AT) && openReadPathOf(path.slice(READS_AT.length)) !== undefined;
}

/**
 * Each answer handed over in a task of its own: what it starts (the store it lands in, the page that draws from it) runs in
 * that task, and a press made meanwhile is heard between two of them. A message to itself is the next task without the
 * wait a timer's is held to; the channel is open only while answers wait, since an open one keeps a process (a test's) up.
 */
function oneATask(): (give: () => void) => void {
  const queue: (() => void)[] = [];
  let posted = false;
  let channel: MessageChannel | null = null;
  const drain = (): void => {
    posted = false;
    queue.shift()?.();
    if (queue.length) post();
    else {
      channel?.port1.close();
      channel = null;
    }
  };
  const post = (): void => {
    if (posted) return;
    posted = true;
    if (typeof MessageChannel !== "function") {
      setTimeout(drain, 0);
      return;
    }
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = drain;
    }
    channel.port2.postMessage(null);
  };
  return (give) => {
    queue.push(give);
    post();
  };
}

/**
 * A line's read (server/workspace/page-open.ts OpenLine): its key, and the Response its own request would have been, its
 * envelope as the body (`b`), its status (`s`) and the header a limit sets (`h`). Null for the last line, which names no
 * read (what the rest came to), and for one that is not a read's.
 */
function readOfLine(raw: string): { key: string; answer: Response } | null {
  const line: unknown = JSON.parse(raw);
  if (typeof line !== "object" || line === null || !("k" in line) || !("s" in line)) return null;
  const { k, s } = line;
  if (typeof k !== "string" || typeof s !== "number" || s < 200 || s > 599) return null;
  const headers = new Headers({ "content-type": "application/json" });
  if ("h" in line && typeof line.h === "object" && line.h !== null)
    for (const [name, value] of Object.entries(line.h)) if (typeof value === "string") headers.set(name, value);
  return { key: k, answer: new Response(JSON.stringify("b" in line ? line.b : null), { status: s, headers }) };
}

/** Every line of a streamed answer, each as it arrives. */
async function eachLine(res: Response, take: (raw: string) => void): Promise<void> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const text = new TextDecoder();
  let held = "";
  for (;;) {
    const { done, value } = await reader.read();
    held += done ? text.decode() : text.decode(value, { stream: true });
    const lines = held.split("\n");
    held = done ? "" : (lines.pop() ?? "");
    for (const raw of lines) if (raw.trim()) take(raw);
    if (done) return;
  }
}

/** A read the rest carries, waiting on its line: the hands that give it its answer, or send it to be asked alone. */
interface Waiting {
  give: (answer: Response) => void;
  refuse: (e: unknown) => void;
}

/** What a read the rest could not answer is refused with: the client then asks for it alone (client/api.ts `send`). */
const notCarried = (): Error => new Error("not carried");

/**
 * The URLs asked as one, each with the answer it waits on: the reads the request carries, by key, and the workspace it
 * names (the first URL's). One of another workspace than the first's, or a key asked twice over, which one request cannot
 * name, is refused at once, and the client asks for it alone.
 */
function readsToCarry(urls: readonly string[]) {
  const byKey = new Map<string, Waiting>();
  const answers = new Map<string, Promise<Response>>();
  let workspace: string | null | undefined;
  for (const url of urls) {
    const named = restKeyOf(url);
    // The first URL's workspace is the request's (null where it names none, which `??=` would not keep).
    if (workspace === undefined) workspace = named.workspace;
    const alone = named.workspace !== workspace || byKey.has(named.key);
    answers.set(
      url,
      alone
        ? Promise.reject(notCarried())
        : new Promise<Response>((give, refuse) => byKey.set(named.key, { give, refuse })),
    );
  }
  return { byKey, answers, workspace: workspace ?? null };
}

/**
 * What every read still waiting is refused with where the request that carried them failed whole (the server could not
 * answer it, or it never arrived): the client sends one of them to look, and the rest follow it or are held with it
 * (client/api.ts, client/trouble.ts `failedWhole`). Each sent to be asked alone, one request that failed became every
 * read it carried, a request of its own each in the same instant, thirty-seven of them on a load, of a server that had
 * just said it could not answer (24 Nov 2026). A refusal that is no fault (a server from before this route, a session
 * ended) still sends each read to be asked alone, as its own request would have been refused: either deploy order works.
 */
const failedWhole = (): Error => new Error(FAILED_WHOLE);

/** From this status an answer is the server failing, not a refusal of the request. */
const FAULT_FROM = 500;

/** Each line of the answer handed to the read it answers, a task at a time; a line no read waits for is let go of. */
async function handLines(res: Response, byKey: Map<string, Waiting>, handOver: (give: () => void) => void) {
  await eachLine(res, (raw) => {
    const line = readOfLine(raw);
    const read = line && byKey.get(line.key);
    if (!line || !read) return;
    byKey.delete(line.key);
    handOver(() => read.give(line.answer));
  });
}

/** The reads a page opens on, among those still waiting on a line, refused now to be asked alone: a line that comes is let go of. */
function hurryIn(out: ReadonlySet<Map<string, Waiting>>, keys: readonly string[]): void {
  for (const { key } of keys.map((k) => restKeyOf(`${READS_AT}${k}`)))
    for (const byKey of out) {
      const read = byKey.get(key);
      if (!read) continue;
      byKey.delete(key);
      read.refuse(notCarried());
    }
}

/**
 * What the client asks the rest of a load with (client/api.ts `together`), over the tab's own fetch: `ask` sends the URLs
 * as one GET open/rest and answers each as its line comes, a task at a time; a URL whose line never came from an answer
 * that did (a read no route answers, an answer cut short) is refused, and the client asks for it alone (readsToCarry says
 * which never go). A request the server could not answer (a 5xx), or one that never arrived, refuses every read it carried
 * as failed whole (failedWhole). `hurry` sends the reads a page opens on to be asked alone, where they still wait on their line: a move
 * made while the rest is out (bridge/api.ts), whose page would otherwise wait its turn among the reads of every other.
 */
export function restReads(fetchFor: (url: string, init: RequestInit) => Promise<Response>) {
  const handOver = oneATask();
  /** The reads still waiting on a line, by key, of each GET open/rest out. */
  const out = new Set<Map<string, Waiting>>();
  function ask(urls: readonly string[]): ReadonlyMap<string, Promise<Response>> {
    const { byKey, answers, workspace } = readsToCarry(urls);
    const query = new URLSearchParams({ reads: [...byKey.keys()].map(encodeURIComponent).join(",") });
    if (workspace) query.set("workspace", workspace);
    out.add(byKey);
    const carried = byKey.size;
    /** Every read still waiting, refused as the request itself failed. */
    const failAll = () => {
      for (const read of byKey.values()) handOver(() => read.refuse(failedWhole()));
      byKey.clear();
    };
    void fetchFor(`${READS_AT}open/rest?${query.toString()}`, { signal: AbortSignal.timeout(REST_WAIT_MS) })
      .then((res) => {
        if (res.ok) return handLines(res, byKey, handOver);
        // The server could not answer: each read hears that the whole failed. Any other refusal: each is asked alone, below.
        if (res.status >= FAULT_FROM) failAll();
        return undefined;
      })
      .catch(() => {
        // Never arrived, with no line of its own handed over: failed whole. Cut short after some: the rest alone, below.
        if (byKey.size === carried) failAll();
      })
      .finally(() => {
        out.delete(byKey);
        for (const read of byKey.values()) handOver(() => read.refuse(notCarried()));
        byKey.clear();
      });
    return answers;
  }
  return { carries, ask, hurry: (keys: readonly string[]) => hurryIn(out, keys) };
}
