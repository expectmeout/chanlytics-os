/**
 * What a run of the footage proof says (footage sources, plan v4, P1; ./footage-proof.mjs runs it): the settings read from
 * a file, a clip's address at the relay, and the numbers a run brings back turned into the lines a person reads. Nothing
 * here asks anyone anything, so each piece is held by a test (tests/files/relay/the-proof-reads-its-run.test.mjs).
 */

/** Google's units since 1 May 2026 (Drive API, "Usage limits"): a file's record, and a download of any size. */
export const DRIVE_UNITS = { record: 5, download: 200 };

/** A settings file's pairs: `NAME=value` a line, a `#` line a note, quotes around a value dropped. Later files win. */
export function settingsOf(...texts) {
  const settings = {};
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const pair = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!pair) continue;
      const value = pair[2].replace(/^(["'])(.*)\1$/, "$2");
      if (value) settings[pair[1]] = value;
    }
  }
  return settings;
}

/** What a clip's address ends in, by its type: nothing of its name, which stays in Drive. */
const clipTailOf = (mime) =>
  mime === "video/quicktime" ? "clip.mov" : mime === "video/webm" ? "clip.webm" : "clip.mp4";

/** A clip's address at the relay: the item, a tail that says its type, and the ticket. */
export function clipAddressOf(relayUrl, clip, ticket) {
  const address = new URL(`/clip/${clip.item}/${clipTailOf(clip.mime)}`, relayUrl);
  address.searchParams.set("ticket", ticket);
  return address.href;
}

/** How many requests the relay served for a clip, and what they cost at Google: a HEAD reads a record, a GET downloads. */
export function unitsOf(asked) {
  const heads = asked.filter((a) => a.method === "HEAD").length;
  const gets = asked.length - heads;
  return { requests: asked.length, heads, gets, units: heads * DRIVE_UNITS.record + gets * DRIVE_UNITS.download };
}

/** The byte a range begins at: 0 for the whole clip, null for a clip's last bytes (which begin wherever its size says). */
function firstByteOf(range) {
  if (range === null) return 0;
  const from = /^bytes=(\d+)-/.exec(range)?.[1];
  return from === undefined ? null : Number(from);
}

/**
 * What became of the forced break, read from what the relay was asked: whether a download was told to break, and whether
 * the fetcher came back after it, from the first byte or from where it stood.
 */
export function breakOf(asked) {
  const at = asked.findIndex((a) => typeof a.break_after_ms === "number");
  if (at < 0) return { handed: false, request: null, afterMs: null, cameBack: false, from: null };
  const next = asked.slice(at + 1).find((a) => a.method === "GET");
  return {
    handed: true,
    request: at + 1,
    afterMs: asked[at].break_after_ms,
    cameBack: next !== undefined,
    from: next === undefined ? null : firstByteOf(next.range),
  };
}

/** A stretch of time as a person says it: seconds under two minutes, then minutes and seconds. */
export function durationWords(ms) {
  if (ms === null || ms === undefined) return "not reached";
  const seconds = ms / 1000;
  if (seconds < 120) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

/** A size as a person says it. */
export const sizeWords = (bytes) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(0, Math.round(bytes / 1000))} KB`;

/** Each request the relay served, a line each: when (from the moment Stream was asked), what, and whether it was the broken one. */
export function askedLines(asked, startedMs) {
  return asked.map((a, i) => {
    const when = `+${((a.at - startedMs) / 1000).toFixed(1)} s`.padStart(10);
    const what = `${a.method} ${a.range ?? "(whole clip)"}`;
    const broke =
      typeof a.break_after_ms === "number" ? `   <- told to break after ${durationWords(a.break_after_ms)}` : "";
    return `  ${String(i + 1).padStart(3)} ${when}  ${what}${broke}`;
  });
}

/** The forced break in a sentence or two, for the run's last lines. */
export function breakLines(asked, askedForMs) {
  const read = breakOf(asked);
  if (!read.handed)
    return [
      `Forced break: asked for after ${durationWords(askedForMs)}, but never handed out: no download was large enough to break.`,
    ];
  if (!read.cameBack)
    return [
      `Forced break: request ${read.request} was told to break after ${durationWords(read.afterMs)}, and no download followed it.`,
      "  Either the clip was through before the break came (try a shorter --break-after), or Stream did not ask again.",
    ];
  const where =
    read.from === null
      ? "for the clip's last bytes"
      : read.from === 0
        ? "from the first byte (it began again)"
        : `from byte ${read.from.toLocaleString("en-US")} (it went on from where it stood)`;
  return [
    `Forced break: request ${read.request} was broken off after ${durationWords(read.afterMs)}; Stream asked again ${where}.`,
  ];
}

/**
 * The run's verdict in plain words: whether the clip is a ready video at Stream, and whether Stream holds the same number
 * of bytes Drive does (a break that left a short copy would show here).
 */
export function verdictLines(run) {
  const lines = [];
  if (run.state === "ready") lines.push(`Result: READY at Stream in ${durationWords(run.readyMs)}.`);
  else if (run.state === "error")
    lines.push(`Result: FAILED at Stream after ${durationWords(run.endedMs)}: ${run.errorCode ?? "no reason given"}.`);
  else lines.push(`Result: NOT READY after ${durationWords(run.endedMs)} (Stream still says "${run.state}").`);
  if (run.state === "ready" && typeof run.streamBytes === "number" && run.streamBytes > 0)
    lines.push(
      run.streamBytes === run.driveBytes
        ? `Whole clip: yes. Stream holds ${sizeWords(run.streamBytes)}, the size Drive gives.`
        : `Whole clip: NO. Stream holds ${run.streamBytes} bytes and Drive gives ${run.driveBytes}.`,
    );
  if (run.state === "ready" && run.sharpest !== undefined)
    lines.push(
      run.sharpest.ms === null
        ? `Sharpest copy: ${run.sharpest.why}.`
        : `Sharpest copy: there ${durationWords(run.sharpest.ms)} after Stream was asked (${run.sharpest.width}x${run.sharpest.height}).`,
    );
  return lines;
}
