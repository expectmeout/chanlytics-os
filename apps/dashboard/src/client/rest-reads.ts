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
import { OPEN_READ_PATHS, openReadPathOf } from "@chanlytics/contracts";

/** The path every read is asked at, before its own: `/api/v1/contacts` is the read `contacts`. */
const READS_AT = "/api/v1/";
/** How long the rest may take, from its asking to its last line: what is not in by then is asked alone. */
const REST_WAIT_MS = 20_000;

/** One line of the answer (server/workspace/page-open.ts OpenLine): a read's key, its status, its envelope, its headers. */
interface RestLine {
  k?: string;
  s?: number;
  b?: unknown;
  h?: Record<string, string>;
}

/** A URL's read as GET open/rest names it: its path and its query, without the workspace, which the request names once. */
function keyOf(url: string): { key: string; workspace: string | null } {
  const at = new URL(url, "http://read.local");
  const workspace = at.searchParams.get("workspace");
  at.searchParams.delete("workspace");
  return { key: `${at.pathname.slice(READS_AT.length)}${at.search}`, workspace };
}

/** Whether GET open/rest answers this URL's read: its path, an id in it said `[id]`, is one of OPEN_READ_PATHS. */
function carries(url: string): boolean {
  const path = new URL(url, "http://read.local").pathname;
  const listed = openReadPathOf(path.slice(READS_AT.length));
  return path.startsWith(READS_AT) && (OPEN_READ_PATHS as readonly string[]).includes(listed);
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

/** A line's read as the Response its own request would have been: its envelope as the body, its status, its headers. */
function responseOf(line: RestLine): Response | null {
  if (typeof line.s !== "number" || line.s < 200 || line.s > 599) return null;
  return new Response(JSON.stringify(line.b ?? null), {
    status: line.s,
    headers: { "content-type": "application/json", ...(line.h ?? {}) },
  });
}

/** Every line of a streamed answer, each as it arrives. */
async function eachLine(res: Response, take: (line: RestLine) => void): Promise<void> {
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
    for (const raw of lines) if (raw.trim()) take(JSON.parse(raw) as RestLine);
    if (done) return;
  }
}

/**
 * What the client asks the rest of a load with (client/api.ts `together`), over the tab's own fetch: `ask` sends the URLs
 * as one GET open/rest and answers each as its line comes, a task at a time; a URL whose line never came (a read no route
 * answers, an answer cut short, a request refused whole) is rejected, and the client asks for it alone.
 */
export function restReads(fetchFor: (url: string, init: RequestInit) => Promise<Response>) {
  const handOver = oneATask();
  function ask(urls: readonly string[]): ReadonlyMap<string, Promise<Response>> {
    const byKey = new Map<string, { give: (r: Response) => void; refuse: (e: unknown) => void }>();
    const answers = new Map<string, Promise<Response>>();
    let workspace: string | null = null;
    for (const url of urls) {
      const named = keyOf(url);
      workspace ??= named.workspace;
      answers.set(url, new Promise<Response>((give, refuse) => byKey.set(named.key, { give, refuse })));
    }
    const query = new URLSearchParams({ reads: [...byKey.keys()].map(encodeURIComponent).join(",") });
    if (workspace) query.set("workspace", workspace);
    const notCarried = new Error("not carried");
    void fetchFor(`${READS_AT}open/rest?${query.toString()}`, { signal: AbortSignal.timeout(REST_WAIT_MS) })
      .then((res) => {
        if (!res.ok) throw notCarried;
        return eachLine(res, (line) => {
          const read = line.k === undefined ? undefined : byKey.get(line.k);
          const answer = responseOf(line);
          if (!read || !answer) return;
          byKey.delete(line.k ?? "");
          handOver(() => read.give(answer));
        });
      })
      .catch(() => {
        // Cut short or refused whole: what had no line is asked alone, below.
      })
      .finally(() => {
        for (const read of byKey.values()) handOver(() => read.refuse(notCarried));
        byKey.clear();
      });
    return answers;
  }
  return { carries, ask };
}
