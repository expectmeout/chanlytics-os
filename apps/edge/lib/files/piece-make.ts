/**
 * piece_make: a video made from a business's clips and photos, one step a run (00613, decisions 0122 and 0126). The press
 * writes the video's row and this job's first step; each run does one step and, where there is more to do, puts the next on
 * the ledger itself, so nothing waits on a retry's clock. A step that is run again does no harm: a machine started twice is
 * two drawings and one is let go, and a file begun twice is the one row.
 *
 *   start   The plan is checked again against its files as they now stand (one removed since the press ends it here, with
 *           nothing spent). Each clip's full-size playback copy is read for the parts its blocks need, and where the video
 *           platform has not made that copy yet, the step comes back a minute on; each photo gets an address the machine
 *           may fetch it from for a while. Then a machine is started from the image on record for the edition this code
 *           names (the template that reads what is handed here) and handed its job: each block's files to fetch, and
 *           the timeline to draw.
 *           Where its card should say so (a clip's copy still being made), the row's stage is said.
 *   wait    The drawing is asked after while the run has time. Done: the video's bytes are read, a place is reserved for
 *           exactly them at the video platform, its row is begun as a file made here, its own file is kept in its folder
 *           (what its Download gives: the platform plays a video and gives no file back), the bytes are sent, and its row
 *           says they went (piece_sent), after which only the platform's word ends it. Still drawing:
 *           the next tick. Failed, gone, or drawing for longer than a drawing takes: the machine is let go and the video is
 *           started once more on a fresh one; a second such end is the video's.
 *
 * The video platform's own word that the video can be played is what makes it made (00613 file_media_ready), and that word
 * rings the bell (tellPieceMoved, from the webhook and the sweep alike). A video that ends any other way tells its owner why,
 * in the video's own words. A throw is a fault of ours: the ledger tries it once more, then says so (settle.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FILE_MADE_OF_VIDEO_MIMES,
  MIN_MS,
  PIECE_FRAME,
  PIECE_ROUNDS_MAX,
  PIECE_TEMPLATE,
  SECOND_MS,
  compilePiece,
  fileMadePathOf,
  fileNameOf,
  filePathOf,
  isPieceStep,
  pieceCompositionOf,
  pieceFileIdsOf,
  pieceLookOf,
  pieceMachineOf,
  pieceOpeningOf,
  piecePlanOf,
  pieceRoundsOf,
  pieceWordsIn,
  recordOrEmpty,
  workspaceLogoSrc,
  type PieceFail,
  type PieceMachine,
  type PieceMaterial,
  type PiecePlan,
  type PieceSource,
  type PieceStep,
  type PieceTimeline,
} from "@chanlytics/contracts";
import {
  FINGERPRINT_BYTES,
  deleteStreamVideo,
  fileFingerprintOf,
  readRender,
  readRenderBytes,
  readStreamCopy,
  reserveStreamUpload,
  sendStreamBytes,
  startRender,
  stopRender,
  streamCutPartsOf,
  streamTokenOf,
  type RenderJob,
  type RenderMachine,
  type RenderState,
  type StreamCopy,
} from "@chanlytics/channels/files";
import {
  beginPieceFile,
  endPiece,
  filesBucket,
  findFileForWork,
  findPieceForWork,
  findPieceImage,
  keepPieceMachine,
  markPieceSent,
  sayPieceStage,
  type MediaFate,
  type PieceFileFate,
  type PieceRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { randomUUID } from "node:crypto";
import { recordNotification } from "../shared/alerts/notify.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { streamKeys } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** Eight cores: four drew a 12-second video in 20 to 33 seconds and once stalled; eight in 13 to 19 (the timed test, 10 Nov 2026). */
const MACHINE_VCPUS = 8;
/** A machine stops itself after this, whatever became of its job: a drawing's most, a retry's wait, and the send. */
const MACHINE_LIFE_MS = 8 * MIN_MS;
/** The longest a drawing is waited for: one took 13 to 19 seconds, and one in nine stalled for five minutes with no error. */
const DRAWING_MOST_MS = 3 * MIN_MS;
/** How often a drawing is asked after inside a run, and what a run keeps to finish a video once it is drawn. */
const ASK_EVERY_MS = 2 * SECOND_MS;
const FINISH_NEEDS_MS = 20 * SECOND_MS;
/** How long a start waits between looks for a clip's full-size copy or an edition's image, and how many looks it gives them. */
const START_AGAIN_MS = MIN_MS;
const START_TICKS_MAX = 30;
/** A playback token, and a photo's address, for the machine's fetches: it fetches within seconds of its start. */
const PARTS_TOKEN_S = 10 * 60;
/**
 * A photo as the machine is handed it: inside a square of this side (the most Storage resizes to, and more than a frame
 * pushed in needs), never enlarged, kept sharp. Asked for as a kind a browser draws, whatever the phone kept
 * (tooling/video/machine/make.mjs).
 */
const PHOTO_SIDE = 2500;
const PHOTO_QUALITY = 90;
/** How much of a clip is fetched for one moment of it shown still: the part it is in, and the next where it ends close by. */
const MOMENT_S = 0.5;
/** The made video's reservation holds it to its own length and a little more, and lapses if its bytes never go. */
const UPLOAD_LIFE_MS = 30 * MIN_MS;
const LENGTH_SLACK_S = 2;
/**
 * A file begun this lately is another run's, still sending it: a send takes seconds and a run a minute. Older, and whoever began
 * it is gone (its own retry comes after its lease and its wait, three minutes and more on).
 */
const SEND_GRACE_MS = 2 * MIN_MS;
const LOGO_FILE = "logo.png";

/** The machines a video is drawn on: Vercel's, or a test's. */
interface PieceMachines {
  start(snapshotId: string, job: RenderJob): Promise<RenderMachine>;
  read(machine: RenderMachine): Promise<RenderState>;
  bytes(machine: RenderMachine): Promise<Uint8Array<ArrayBuffer> | null>;
  stop(machine: RenderMachine): Promise<void>;
  pause(ms: number): Promise<void>;
}

const VERCELS: PieceMachines = {
  start: (snapshotId, job) => startRender(snapshotId, job, { vcpus: MACHINE_VCPUS, timeoutMs: MACHINE_LIFE_MS }),
  read: readRender,
  bytes: readRenderBytes,
  stop: stopRender,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
let machines = VERCELS;
/** A test's machines in place of Vercel's; null puts Vercel's back. */
export const setPieceMachines = (fake: PieceMachines | null): void => {
  machines = fake ?? VERCELS;
};

const machineOf = (kept: PieceMachine): RenderMachine => ({ name: kept.name, cmdId: kept.cmd_id });

/** The most words a made file is named with. */
const NAME_WORDS = 5;

/**
 * What a made file is named: the words its video opens on, both lines where they are one short phrase (a line holds few
 * characters, so a phrase is often broken across two), else its first line whole, never one cut mid-thought.
 */
function madeNameOf(plan: PiecePlan): string {
  const opening = pieceOpeningOf(plan);
  const whole = opening.join(" ").trim();
  const named = whole.split(/\s+/).length <= NAME_WORDS ? whole : (opening[0] ?? "");
  return fileNameOf(named, NAME_WORDS) || "video";
}

/** The next step, on the ledger: which, its try, and due now or a while on. */
async function scheduleStep(
  db: Db,
  piece: PieceRow,
  { step, tick, afterMs = 0 }: { step: PieceStep; tick: number; afterMs?: number },
): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: piece.tenant_id,
    kind: "piece_make",
    dueAt: new Date(Date.now() + afterMs),
    payload: { piece_id: piece.id, step, tick: String(tick) },
  });
}

/** A video that could not be made: its row says why, and so does its owner's bell, in the video's own language. */
async function endWith(db: Db, piece: PieceRow, reason: PieceFail): Promise<void> {
  if (!(await endPiece(db, piece.id, reason))) return;
  const says = pieceWordsIn(piecePlanOf(recordOrEmpty(piece.plan)).language);
  logger({ tenant_id: piece.tenant_id }).warn("piece_failed", { piece: piece.id, why: reason });
  await recordNotification(
    piece.tenant_id,
    {
      kind: "job_failed",
      title: says.bell.failed,
      body: says.bell.failedBody(reason),
      route: "admin/files",
      about: { type: "piece", id: piece.id },
    },
    db,
  );
}

/* ----------------------------------------------------------------------------------------------------- start -- */

type FileForWork = NonNullable<Awaited<ReturnType<typeof findFileForWork>>>;

/** A file as the plan's checker reads it: a clip's length the playback copy's own where that was read. */
const sourceFromFile = (file: FileForWork, seconds: number | null): PieceSource => ({
  id: file.id,
  kind: file.kind,
  status: file.status,
  source: file.source,
  media_status: file.media_status,
  seconds: seconds ?? (file.seconds === null ? null : Number(file.seconds)),
  // Who is in a clip was settled at the press, where the owner's word is heard: nothing here can ask it again.
  people_unasked: false,
});

/** What was read of a plan's files: each as the checker reads it, each clip's playback copy, each photo's address. */
interface FilesRead {
  sources: PieceSource[];
  copies: Map<string, StreamCopy>;
  photos: Map<string, string>;
}
type CopiesRead = ({ ok: true } & FilesRead) | { ok: false; why: "clips" | "not_yet" };

/** A photo's address the machine may fetch for a while, resized by Storage on the way. */
async function signPhoto(db: Db, file: FileForWork): Promise<string> {
  const signed = await filesBucket(db).createSignedUrl(filePathOf(file.tenant_id, file.id, file.mime), PARTS_TOKEN_S, {
    transform: { width: PHOTO_SIDE, height: PHOTO_SIDE, resize: "contain", quality: PHOTO_QUALITY },
  });
  if (signed.error) throw new Error("piece_make: a photo's address could not be signed");
  return signed.data.signedUrl;
}

/** A ready clip's full-size playback copy; null while the video platform is still making it. */
async function readClipCopy(file: FileForWork, mediaRef: string): Promise<StreamCopy | null> {
  const keys = streamKeys();
  if (!keys) throw new Error("piece_make: Stream is not configured here");
  const token = streamTokenOf(keys.signing, { uid: mediaRef, seconds: PARTS_TOKEN_S });
  const read = await readStreamCopy(keys.signing.customerCode, token, { width: file.width, height: file.height });
  if (!read.ok && read.why === "not_full_size") return null;
  if (!read.ok) throw new Error("piece_make: a clip's playback list could not be read");
  return read.copy;
}

/**
 * Each file the plan names, as it now stands: a clip with its full-size playback copy's parts, a photo with its address.
 * One that is gone is left out, and a clip no longer ready is read with no length: the checker says which.
 */
async function copiesRead(db: Db, piece: PieceRow, plan: PiecePlan): Promise<CopiesRead> {
  const read: FilesRead = { sources: [], copies: new Map(), photos: new Map() };
  for (const id of pieceFileIdsOf(plan)) {
    const file = await findFileForWork(db, piece.tenant_id, id);
    if (!file || file.removed_at) continue;
    if (file.kind === "image") read.photos.set(id, await signPhoto(db, file));
    const ready = file.kind === "video" && file.media_status === "ready" && file.media_ref;
    const copy = ready ? await readClipCopy(file, ready) : null;
    if (ready && !copy) return { ok: false, why: "not_yet" };
    if (copy) read.copies.set(id, copy);
    read.sources.push(sourceFromFile(file, copy?.seconds ?? null));
  }
  return { ok: true, ...read };
}

type Fetch = RenderJob["fetch"][number];

/**
 * What the machine fetches for each block, in the block's own order, each under the name the template reads it by: a clip's
 * stretch by its parts, a photo from its address, a clip's moment by the parts around it. A words card has none.
 */
function fetchesOf(timeline: PieceTimeline, read: FilesRead): Fetch[][] {
  const stretch = (to: string, source: string, from: number, seconds: number): Fetch => {
    const copy = read.copies.get(source);
    if (!copy) throw new Error("piece_make: a block's clip has no playback copy read");
    return { to, parts: streamCutPartsOf(copy, from, from + seconds) };
  };
  const photo = (to: string, source: string): Fetch => {
    const address = read.photos.get(source);
    if (!address) throw new Error("piece_make: a block's photo has no address signed");
    return { to, parts: [address] };
  };
  return timeline.blocks.map((block, index) => {
    if (block.is === "clip")
      return [stretch(`block-${index}.mp4`, block.source, block.trim, block.frames / timeline.fps)];
    if (block.is === "photo") return [photo(`block-${index}.img`, block.source)];
    // The pictures it shows still, in its own order: a pair's two, a quote's ground.
    const shots =
      block.is === "pair" ? [block.before, block.after] : block.is === "quote" && block.over ? [block.over] : [];
    return shots.map((shot, n) =>
      shot.at === null
        ? photo(`block-${index}-${n}.img`, shot.source)
        : stretch(`block-${index}-${n}.mp4`, shot.source, shot.at, MOMENT_S),
    );
  });
}

async function startDrawing(db: Db, piece: PieceRow, tick: number): Promise<void> {
  const log = logger({ tenant_id: piece.tenant_id });
  // Run again after its machine was kept (a run that died before it wrote the next step): the drawing is under way.
  if (pieceMachineOf(piece.machine)) return scheduleStep(db, piece, { step: "wait", tick: 1 });
  const again = async (waitingFor: string) => {
    if (tick >= START_TICKS_MAX) return endWith(db, piece, waitingFor === "image" ? "draw" : "clips");
    log.info("piece_start_waits", { piece: piece.id, for: waitingFor, tick });
    await scheduleStep(db, piece, { step: "start", tick: tick + 1, afterMs: START_AGAIN_MS });
  };
  const plan = piecePlanOf(recordOrEmpty(piece.plan));
  const look = pieceLookOf(piece.look);
  const read = await copiesRead(db, piece, plan);
  if (!read.ok && read.why === "not_yet") {
    // Its card says why this one takes longer than a minute: the video platform is still making the clip's sharpest copy.
    await sayPieceStage(db, piece.id, "waiting_clip");
    return again("copy");
  }
  if (!read.ok) return endWith(db, piece, "clips");
  const logoUrl = workspaceLogoSrc(env.SUPABASE_URL, look.logo_path);
  const compiled = compilePiece(plan, read.sources, {
    accent: look.accent,
    logo: logoUrl !== null,
    name: look.name,
    book: look.book,
    address: look.address,
  });
  if (!compiled.ok) {
    log.warn("piece_plan_refused", { piece: piece.id, wont: compiled.wont, cut: compiled.cut ?? null });
    return endWith(db, piece, "clips");
  }
  // The edition this code names, never the row's: what is handed below is read by the template of this edition, and a row
  // may have been begun by a dashboard a deploy behind this one or ahead of it.
  const image = await findPieceImage(db, PIECE_TEMPLATE.edition);
  if (!image) {
    // A person builds an edition's image (tooling/video/README.md): until it is on record, nothing can be drawn.
    log.error("piece_image_missing", { piece: piece.id, edition: PIECE_TEMPLATE.edition });
    return again("image");
  }
  const fetches = fetchesOf(compiled.timeline, read);
  const material: PieceMaterial = {
    timeline: compiled.timeline,
    files: fetches.map((own) => own.map((f) => f.to)),
    logo: logoUrl ? LOGO_FILE : null,
  };
  const machine = await machines.start(image.snapshot_id, {
    fetch: [...fetches.flat(), ...(logoUrl ? [{ to: LOGO_FILE, parts: [logoUrl] }] : [])],
    composition: pieceCompositionOf(plan.shape),
    props: material,
  });
  const round = Math.min(pieceRoundsOf(piece.machine) + 1, PIECE_ROUNDS_MAX);
  const kept = await keepPieceMachine(db, piece.id, {
    name: machine.name,
    cmd_id: machine.cmdId,
    started_at: new Date().toISOString(),
    round,
    // The video's length, as compiled here from the clips' own copies: keeping the drawn video reads none of them again.
    frames: compiled.timeline.frames,
  });
  // Ended while its machine was starting: nothing wants the drawing.
  if (!kept) return machines.stop(machine);
  log.info("piece_started", { piece: piece.id, round, image: image.hash });
  await scheduleStep(db, piece, { step: "wait", tick: 1 });
}

/* ------------------------------------------------------------------------------------------------------ wait -- */

/** A drawing that will not finish on this machine: let go, and started once more, or the video's end. */
async function drawAgainOrEnd(db: Db, piece: PieceRow, kept: PieceMachine, ending: string): Promise<void> {
  await machines.stop(machineOf(kept));
  logger({ tenant_id: piece.tenant_id }).warn("piece_drawing_ended", {
    piece: piece.id,
    round: kept.round,
    said: ending,
  });
  if (kept.round >= PIECE_ROUNDS_MAX) return endWith(db, piece, "draw");
  // The row keeps that one try was made, and no machine: the next start is the second.
  if (!(await keepPieceMachine(db, piece.id, { round: kept.round }))) return;
  await scheduleStep(db, piece, { step: "start", tick: 1 });
}

/** A drawn video that could not be kept: the machine let go, and the video ended as not stored. */
async function endUnkept(
  db: Db,
  piece: PieceRow,
  machine: RenderMachine,
  fields: Record<string, unknown>,
): Promise<void> {
  logger({ tenant_id: piece.tenant_id }).warn("piece_send_failed", { piece: piece.id, ...fields });
  await machines.stop(machine);
  await endWith(db, piece, "store");
}

/**
 * What became of a drawn video whose row was not begun by this run's reservation. The same bytes are a file already (`here`):
 * the video is that one, and where that file was made ready long ago no word will come for it, so its owner is told here. A
 * row another run began moments ago (`kept`) is that run's to send, and to end if it cannot. One begun longer ago holds a
 * reservation no one here can send to: the video is asked for again, never sent twice. No room (`full`, `minutes`) is its end.
 */
async function settleNotOurs(db: Db, piece: PieceRow, machine: RenderMachine, file: PieceFileFate): Promise<void> {
  const log = logger({ tenant_id: piece.tenant_id });
  if (file.fate === "ended") return machines.stop(machine);
  if (file.fate === "here") {
    await machines.stop(machine);
    log.info("piece_drawn", { piece: piece.id, fate: file.fate, twin: file.twin });
    if (file.twin === "ready" || file.twin === "failed")
      await tellPieceMoved(db, {
        fate: file.twin,
        tenant_id: piece.tenant_id,
        file_id: file.file_id,
        made: true,
      });
    return;
  }
  const justBegun = file.begun_at !== null && Date.now() - new Date(file.begun_at).getTime() < SEND_GRACE_MS;
  if (file.fate === "kept" && justBegun) {
    log.info("piece_sender_elsewhere", { piece: piece.id });
    return;
  }
  await endUnkept(db, piece, machine, { fate: file.fate });
}

/** The drawn video into the video platform, as a file made here. Its row first, so the platform's word finds it. */
async function keepDrawn(db: Db, piece: PieceRow, kept: PieceMachine): Promise<void> {
  const machine = machineOf(kept);
  const keys = streamKeys();
  if (!keys) throw new Error("piece_make: Stream is not configured here");
  const bytes = await machines.bytes(machine);
  if (!bytes?.length) return drawAgainOrEnd(db, piece, kept, "the machine no longer has the video");
  const plan = piecePlanOf(recordOrEmpty(piece.plan));
  // The video's length is its timeline's, kept with its machine as the start compiled it: no clip is read again here.
  const frames = kept.frames > 0 ? kept.frames : PIECE_FRAME.end;
  const seconds = Math.round((frames / PIECE_FRAME.fps) * 100) / 100;
  const id = randomUUID();
  const reserved = await reserveStreamUpload(keys.account, {
    bytes: bytes.length,
    maxDurationSeconds: seconds + LENGTH_SLACK_S,
    expiresAt: new Date(Date.now() + UPLOAD_LIFE_MS),
    name: id,
  });
  if (!reserved.ok) {
    logger({ tenant_id: piece.tenant_id }).warn("piece_reserve_failed", { piece: piece.id, error: reserved.error });
    await machines.stop(machine);
    return endWith(db, piece, "store");
  }
  const file = await beginPieceFile(db, {
    pieceId: piece.id,
    id,
    mediaRef: reserved.mediaRef,
    name: madeNameOf(plan),
    bytes: bytes.length,
    fingerprint: fileFingerprintOf(bytes.subarray(0, FINGERPRINT_BYTES), bytes.length),
    seconds,
  });
  if (file.fate !== "kept" || file.file_id !== id) {
    // Not this reservation's row: the place reserved for nothing is let go, and what became of the video is said.
    await deleteStreamVideo(keys.account, reserved.mediaRef);
    return settleNotOurs(db, piece, machine, file);
  }
  // Its own file, kept in its folder: the video platform plays a video and gives no file back, and this one exists nowhere else.
  const stored = await filesBucket(db).upload(fileMadePathOf(piece.tenant_id, id, "video"), bytes, {
    contentType: FILE_MADE_OF_VIDEO_MIMES.video,
    upsert: true,
  });
  if (stored.error) return endUnkept(db, piece, machine, { fate: file.fate, error: stored.error.message });
  if (!(await sendStreamBytes(reserved.uploadUrl, bytes))) return endUnkept(db, piece, machine, { fate: file.fate });
  // Its bytes all went: its row says so first, in one step with its machine let go, so nothing after this can throw it away.
  await markPieceSent(db, piece.id);
  await machines.stop(machine);
  logger({ tenant_id: piece.tenant_id }).info("piece_drawn", { piece: piece.id, bytes: bytes.length, fate: file.fate });
}

async function wait(db: Db, piece: PieceRow, tick: number, deadline: number): Promise<void> {
  const kept = pieceMachineOf(piece.machine);
  // No machine on the row: its start never kept one, or a run before this one already let it go.
  if (!kept) return piece.file_id ? undefined : scheduleStep(db, piece, { step: "start", tick: 1 });
  const stalled = () => Date.now() - new Date(kept.started_at).getTime() > DRAWING_MOST_MS;
  for (;;) {
    const state = await machines.read(machineOf(kept));
    if (state.stage === "done") {
      // Not enough of this run left to send it: the next tick finds it done and sends it.
      if (deadline - Date.now() < FINISH_NEEDS_MS) return scheduleStep(db, piece, { step: "wait", tick: tick + 1 });
      return keepDrawn(db, piece, kept);
    }
    if (state.stage === "failed") return drawAgainOrEnd(db, piece, kept, state.error);
    if (state.stage === "gone") return drawAgainOrEnd(db, piece, kept, "the machine is gone");
    if (stalled()) return drawAgainOrEnd(db, piece, kept, "still drawing after its most");
    if (deadline - Date.now() < FINISH_NEEDS_MS + ASK_EVERY_MS)
      return scheduleStep(db, piece, { step: "wait", tick: tick + 1 });
    await machines.pause(ASK_EVERY_MS);
  }
}

/* ------------------------------------------------------------------------------------------------------- the job -- */

export async function makePiece(db: Db, job: ClaimedJob, deadline: number): Promise<void> {
  const step = job.payload.step;
  const pieceId = String(job.payload.piece_id);
  if (!isPieceStep(step)) {
    logger({ tenant_id: job.tenant_id }).warn("piece_unknown_step", { piece: pieceId });
    return;
  }
  const piece = await findPieceForWork(db, job.tenant_id, pieceId);
  // Ended, or gone with its workspace: nothing to make.
  if (!piece || piece.status !== "making") return;
  const tick = Math.max(1, Number(job.payload.tick) || 1);
  if (step === "start") await startDrawing(db, piece, tick);
  else await wait(db, piece, tick, deadline);
}

/**
 * The video platform's word about a video made here, told to its owner: one that can be played rings the bell, one the platform
 * could not read says so. Called where that word is heard (the webhook, and the sweep that asks after a lost one), with what
 * the door answered: `made` is true only for the delivery that moved the piece, so a word delivered again rings nothing.
 */
export async function tellPieceMoved(db: Db, fate: MediaFate): Promise<void> {
  if (!fate.made || !fate.tenant_id || !fate.file_id) return;
  if (fate.fate !== "ready" && fate.fate !== "failed") return;
  const file = await findFileForWork(db, fate.tenant_id, fate.file_id);
  const plan = piecePlanOf(recordOrEmpty(recordOrEmpty(file?.made).plan));
  const says = pieceWordsIn(plan.language);
  const about = { type: "file", id: fate.file_id };
  await recordNotification(
    fate.tenant_id,
    fate.fate === "ready"
      ? {
          kind: "video_ready",
          title: says.bell.ready,
          body: says.bell.readyBody(file?.name ?? ""),
          // Its own sheet on Files, where it plays (the page reads `?do=file:<id>` as it opens).
          route: `admin/files?do=file:${fate.file_id}`,
          about,
        }
      : {
          kind: "job_failed",
          title: says.bell.failed,
          body: says.bell.failedBody("store"),
          route: "admin/files",
          about,
        },
    db,
  );
}
