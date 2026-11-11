/**
 * Vercel's Sandbox, the wire (the video maker; the SDK read against real machines, 10 Nov 2026): a machine started from a
 * saved image, handed one job for the script the image holds (tooling/video/machine/make.mjs), asked after, read and stopped.
 * The drawing runs detached, so whoever started it can leave and ask later: a machine is known by its name and the drawing by
 * its own id, and those two are all a later run needs. Whether a drawing is done is the script's own last word (renderStateOf).
 *
 * A machine is started not kept between sessions (`persistent: false`): one that is kept leaves a copy of its whole disk each
 * time it stops (750 MB a video, found on the tests' machines), and nothing of a drawing is wanted once its bytes are read. It is
 * deleted when done, and stops itself at its time if no one comes back for it.
 *
 * The machine signs in as the project it runs in (Vercel's own token for a function, read by the SDK): no key of ours is held.
 * The SDK is loaded where it is first used, so nothing that never draws a video pays for it. Nothing here knows a row, a
 * workspace or a plan: the job is whatever it is handed.
 */

/** A machine, by the name the platform gave it, and the drawing on it. */
export interface RenderMachine {
  name: string;
  cmdId: string;
}

/** What the machine's script is handed (its own input): files to fetch as parts beside the template, and what to draw. */
export interface RenderJob {
  fetch: { to: string; parts: string[] }[];
  composition: string;
  props: unknown;
}

/**
 * Where a drawing stands: still working; done, with the video's size; failed, in the script's own words; gone, where the
 * machine is no longer there (stopped, or past its time); or unread, where the platform did not answer and nothing is known.
 */
export type RenderState =
  | { stage: "working"; progress: number }
  | { stage: "done"; bytes: number }
  | { stage: "failed"; error: string }
  | { stage: "gone" }
  | { stage: "unread" };

const JOB_FILE = "piece/job.json";
const PROGRESS_FILE = "piece/progress.json";
const VIDEO_NAME = "video.mp4";
const VIDEO_FILE = `piece/${VIDEO_NAME}`;

const sdk = () => import("@vercel/sandbox");

/** Whether a failure says the machine is no longer there, in the platform's words for it. */
const saysGone = (e: unknown): boolean =>
  /sandbox_stopped|stopped execution|no longer available|not found|404/i.test(
    e instanceof Error ? e.message : String(e),
  );

/** The states of a machine that will run nothing more. */
const ENDED = ["stopping", "stopped", "failed", "aborted"];

/**
 * A machine started from an image, with the job's drawing begun on it. It stops itself after `timeoutMs` whatever happens, so
 * a run that dies leaves nothing running; a machine whose drawing could not be begun is stopped here.
 */
export async function startRender(
  snapshotId: string,
  job: RenderJob,
  machine: { vcpus: number; timeoutMs: number },
): Promise<RenderMachine> {
  const { Sandbox } = await sdk();
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    resources: { vcpus: machine.vcpus },
    timeout: machine.timeoutMs,
    persistent: false,
  });
  try {
    await sandbox.writeFiles([
      { path: JOB_FILE, content: Buffer.from(JSON.stringify({ ...job, out: VIDEO_NAME }), "utf8") },
    ]);
    const drawing = await sandbox.runCommand({ cmd: "node", args: ["make.mjs", JOB_FILE], detached: true });
    return { name: sandbox.name, cmdId: drawing.cmdId };
  } catch (e) {
    // The machine could not be let go either: it stops itself at its time, and the failure that matters is the first.
    await sandbox.delete().catch(() => undefined);
    throw e;
  }
}

/** What the machine's script last said of itself (tooling/video/machine/make.mjs). */
type Said = { stage?: unknown; progress?: unknown; bytes?: unknown; message?: unknown };

/**
 * Where a drawing stands, from what its script last said and how its process ended (`exit`, null while it has not, or while
 * nobody has asked). The script's own word says a video is drawn: the platform does not say a background command ended until
 * it is asked to wait for it (read on real machines, 10 Nov 2026: a drawing done at seven seconds read as running for four
 * minutes), so the end of a drawing is read from the file it writes last. The process's end tells a drawing still going from
 * one that died without a word.
 */
export function renderStateOf(written: Said | null, exit: number | null): RenderState {
  if (written?.stage === "done" && Number(written.bytes) > 0) return { stage: "done", bytes: Number(written.bytes) };
  if (written?.stage === "error" && typeof written.message === "string")
    return { stage: "failed", error: written.message };
  if (exit === null) return { stage: "working", progress: Number(written?.progress) || 0 };
  return { stage: "failed", error: exit === 0 ? "the drawing ended without a video" : `exit ${exit}` };
}

/**
 * How long the platform is asked whether a drawing's process ended. It answers at once for one that has, and holds the line
 * for one that has not, so the ask is let go after a moment and the drawing is taken as still going.
 */
const ENDED_ASK_MS = 1_500;

/** How a drawing's process ended, or null while it runs. */
async function endedWith(drawing: {
  wait(params?: { signal?: AbortSignal }): Promise<{ exitCode: number }>;
}): Promise<number | null> {
  const moment = AbortSignal.timeout(ENDED_ASK_MS);
  try {
    return (await drawing.wait({ signal: moment })).exitCode;
  } catch (e) {
    // Let go at its moment: still running. Anything else is the caller's to read.
    if (moment.aborted) return null;
    throw e;
  }
}

/** What the script last said of itself, or null where it has said nothing that reads. */
function progressOf(bytes: Buffer | null): Said | null {
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    // Read between two writes of it: nothing yet.
    return null;
  }
}

/** Where a drawing stands. Never throws: a platform that does not answer is `unread`, and the caller asks again. */
export async function readRender(machine: RenderMachine): Promise<RenderState> {
  try {
    const { Sandbox } = await sdk();
    const sandbox = await Sandbox.get({ name: machine.name });
    if (ENDED.includes(sandbox.status)) return { stage: "gone" };
    const heard = renderStateOf(progressOf(await sandbox.readFileToBuffer({ path: PROGRESS_FILE })), null);
    // Its own word settles it. Only a drawing that reads as still going is asked whether its process is.
    if (heard.stage !== "working") return heard;
    const exit = await endedWith(await sandbox.getCommand(machine.cmdId));
    if (exit === null) return heard;
    // Ended since that read: its last word is read again, so a video finished in between is not taken for none.
    return renderStateOf(progressOf(await sandbox.readFileToBuffer({ path: PROGRESS_FILE })), exit);
  } catch (e) {
    return saysGone(e) ? { stage: "gone" } : { stage: "unread" };
  }
}

/** The drawn video's bytes, or null where the machine no longer has them. */
export async function readRenderBytes(machine: RenderMachine): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const { Sandbox } = await sdk();
    const sandbox = await Sandbox.get({ name: machine.name });
    const bytes = await sandbox.readFileToBuffer({ path: VIDEO_FILE });
    return bytes ? new Uint8Array(bytes) : null;
  } catch {
    // Gone, or not answering: the caller draws again or says it could not.
    return null;
  }
}

/** The machine stopped and let go. One already gone is gone: nothing is raised for it. */
export async function stopRender(machine: RenderMachine): Promise<void> {
  try {
    const { Sandbox } = await sdk();
    await (await Sandbox.get({ name: machine.name })).delete();
  } catch {
    // Already gone, or it will stop itself at its time.
  }
}
