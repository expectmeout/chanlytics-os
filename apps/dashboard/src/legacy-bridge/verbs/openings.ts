/**
 * Rewrite the opening's own call after its decision (00505): the check of the emails pressed, now (POST
 * reach-out-sends/check). One email as a stream, each step handed on as the check takes it (the one ask,
 * campaigns/reach-out/rewrite-ask.tsx); many as one answer, as many at once as a check takes (a batch's Rewrite all).
 * The decision itself is the decide verb's (commit.ts, sequence_send_decide), so its receipt and Undo are the card's.
 */
import { REWRITE_NOW_MAX, type ReachOutCheckLine, type RewriteStep, type RewroteOpening } from "@chanlytics/contracts";
import { readLines, type Api } from "../../client/api";
import { apiFor } from "../api";

/** A rewrite's check waits at most this, a little past the route's own wait for the edge (server/campaigns/sequences/opening.ts). */
const CHECK_WAIT_MS = 30_000;

/** The check of one email, now, its steps handed on as they come; how it stands after, or null where none came back. */
export async function checkOpeningNow(
  sendId: string,
  onStep: (step: RewriteStep) => void,
  client: Api = apiFor(window),
): Promise<RewroteOpening | null> {
  let res: Response;
  try {
    res = await client.raw("POST reach-out-sends/check", {
      body: { send_ids: [sendId], stream: true },
      timeoutMs: CHECK_WAIT_MS,
    });
  } catch {
    return null;
  }
  if (!res.ok || !res.body) return null;
  let after: RewroteOpening | null = null;
  try {
    await readLines(res.body, (raw) => {
      let line: ReachOutCheckLine;
      try {
        line = JSON.parse(raw) as ReachOutCheckLine;
      } catch {
        return;
      }
      if (line.t === "step" && line.send_id === sendId) onStep(line.step);
      if (line.t === "done") after = line.sends.find((s) => s.send_id === sendId) ?? null;
    });
  } catch {
    /* the stream broke: the email is said as still being written, and the page shows it as it lands */
  }
  return after;
}

/** These emails' openings written now, as many at once as a check takes: how many came back written. */
export async function writeOpeningsNow(ids: readonly string[], client: Api = apiFor(window)): Promise<number> {
  let written = 0;
  for (let at = 0; at < ids.length; at += REWRITE_NOW_MAX) {
    const r = await client("POST reach-out-sends/check", { body: { send_ids: ids.slice(at, at + REWRITE_NOW_MAX) } });
    if (r.ok && "sends" in r.data) written += r.data.sends.filter((x) => x.written).length;
  }
  return written;
}
