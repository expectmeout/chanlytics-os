/**
 * A kept post on the business's Google profile, and off it (decision 0099, step 3): a person's press, and only that. The picture is
 * the post's own wide shape, drawn for what Google shows and kept once in the file's own folder, so what empties the folder empties
 * it. Google fetches it by itself, some time after it answers, so its address lasts a day. The edge holds the token and says it to Google.
 *
 * The press keeps its placement as Instagram's does (00611, decision 0121, D16): one record of where each post went, written before
 * the edge is asked, its one send kept as an attempt, and settled by the answer: up, with Google's name for it, or refused in words.
 */
import "server-only";
import {
  AppError,
  DAY_MS,
  FILE_WORDS,
  ON_INSTAGRAM,
  POST_SOON_MS,
  SECOND_MS,
  intentOfAbout,
  type OwnersFact,
  type PostAbout,
  type PostPlan,
} from "@chanlytics/contracts";
import {
  closePostAttempt,
  findPlacementByName,
  movePost,
  openPostAttempt,
  type FileMemberRow,
} from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { callEdgeGoogle } from "@/server/connections/google";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { bucket } from "../files/file";
import { approvePlacements, prepareApproval } from "./approve";
import { getMaterial } from "./material";
import { getPhoto, googlePicturePathOf, postDrawn } from "./make";
import { readFileRecord } from "./record";

const ON_GOOGLE = FILE_WORDS.google;

/** Long enough for Google to come for it, whenever it does. */
const PICTURE_LINK_S = DAY_MS / SECOND_MS;
/** A photo read, a picture drawn and Google asked: the slowest a press waits. */
const GOOGLE_ASKED_MS = 25 * SECOND_MS;

/**
 * Whether a picture is in the bucket at this path. A look that fails says no (the client throws on an outage, where it
 * answers false for a picture that is not there): the store that follows never writes over one, and says why it failed.
 */
const pictureKept = (path: string): Promise<boolean> =>
  bucket()
    .exists(path)
    .then((found) => found.data === true)
    .catch(logAndGoOn("looking for the picture Google is sent", false));

/**
 * The picture Google is sent to fetch: the post's wide shape, kept once and never written over. A post keeps it from its making
 * (posts/make.ts), drawn with its other shapes; one made before that has it drawn the first time it is asked for, and it is that
 * picture from then on.
 *
 * It was drawn afresh at every press, under the one name, before the press was judged (14 Nov 2026): a second press, even one
 * refused because the first still waited for its time, replaced the picture the waiting post would send, with the logo and the
 * colour as they stood that minute.
 */
async function pictureForGoogle(ctx: RouteContext, member: Member, fileId: string, plan: PostPlan): Promise<string> {
  const path = googlePicturePathOf(member.tenantId, fileId);
  if (!(await pictureKept(path))) {
    const photo = await getPhoto(ctx, plan);
    const material = await getMaterial(ctx, member, { file: photo, at: plan.at });
    const picture = await postDrawn(plan, material, "wide", false);
    const stored = await bucket().upload(path, picture, { contentType: "image/jpeg", upsert: false });
    // Refused because another press kept it in the same moment: theirs stands, and this one sends it.
    if (stored.error && !(await pictureKept(path))) {
      log.error("file_google_store_failed", { tenant_id: member.tenantId, error: stored.error.message });
      throw new AppError("unavailable", ON_GOOGLE.notSent);
    }
  }
  const signed = await bucket().createSignedUrl(path, PICTURE_LINK_S);
  if (signed.error || !signed.data) {
    log.error("file_google_store_failed", { tenant_id: member.tenantId, error: signed.error?.message ?? "no address" });
    throw new AppError("unavailable", ON_GOOGLE.notSent);
  }
  return signed.data.signedUrl;
}

/** What the edge said, in a person's words. */
function refusedBy(args: { status: number; body?: Record<string, unknown> | null }): AppError {
  const reason = typeof args.body?.error === "string" ? args.body.error : "failed";
  if (reason === "not_connected") return new AppError("conflict", ON_GOOGLE.notConnected, 409);
  if (reason === "no_token") return new AppError("conflict", ON_GOOGLE.noToken, 409);
  if (reason === "not_found") return new AppError("not_found", FILE_WORDS.gone, 404);
  if (reason === "google_refused") {
    const detail = typeof args.body?.detail === "string" ? ` ${args.body.detail.slice(0, 200)}` : "";
    return new AppError("upstream_provider", `${ON_GOOGLE.refused}${detail}`);
  }
  return new AppError("upstream_provider", ON_GOOGLE.notSent);
}

/**
 * POST files/[id]/google: the post goes up, now, or at its time (00616): then the picture is drawn and kept now, and the
 * post's job asks Google at its time. What it says is a person's, and goes as they typed it.
 */
export async function postFileToGoogle(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: {
    summary: string;
    when?: string | undefined;
    about?: PostAbout | undefined;
    facts?: OwnersFact[] | undefined;
    /** AI's approval under the owner's rung (00712), never a person's press. */
    via?: "rung" | undefined;
  },
): Promise<{ name: string | null; search_url: string | null; state: string | null }> {
  // Google takes a picture: a video made here is not a post for it.
  if (row.source !== "made" || row.kind === "video") throw new AppError("validation", ON_GOOGLE.notAPost);
  const { made, google } = await readFileRecord(ctx, member, row);
  if (!made?.from) throw new AppError("validation", ON_GOOGLE.noPhoto);
  // Up already, it is done: a second would be the same post twice on the profile (contracts postPlaceTakenOf). A press sent
  // again finds it so (Ask's card, pressed again after Instagram refused, sends each place's door in its order once more).
  if (google?.posted) return { name: google.posted.name, search_url: google.posted.search_url, state: null };
  // The picture is drawn and kept first: the approval is of its bytes, and it keeps the words that go on the piece once
  // its checks have passed (posts/approve.ts).
  const photoUrl = await pictureForGoogle(ctx, member, row.id, made.plan);
  // Later than soon, it waits for its time on Google (00616's own line); sooner, it goes at the press.
  const later = !!input.when && Date.parse(input.when) - Date.now() > POST_SOON_MS;
  const placed = await approvePlacements(ctx, member, row, {
    placements: [
      { place: "google", kind: "picture", caption: input.summary, when: later ? (input.when ?? null) : null },
    ],
    intent: intentOfAbout(input.about),
    facts: input.facts ?? [],
    via: input.via ?? "press",
    connections: { google: "yes" },
  }).catch((e: unknown) => {
    throw e instanceof AppError && e.message === ON_INSTAGRAM.busy
      ? new AppError("conflict", ON_GOOGLE.onItsWay, 409)
      : e;
  });
  const postId = placed.posts[0]?.post_id;
  if (!postId) throw new AppError("not_found", FILE_WORDS.gone, 404);
  // Its time is its job's: the picture is kept in the folder, and Google is asked to fetch it then.
  if (later) return { name: null, search_url: null, state: "scheduled" };
  const db = serviceDb();
  const send = await openPostAttempt(db, {
    postId,
    attemptNo: 1,
    step: "publish",
    request: { summary_chars: input.summary.length, photo: new URL(photoUrl).host },
  });
  const answer = await callEdgeGoogle(
    {
      op: "post",
      tenant_id: member.tenantId,
      // AI under the owner's rung (00712) is nobody: the post is written down as no person's.
      ...(ctx.userId ? { user_id: ctx.userId } : {}),
      file_id: row.id,
      summary: input.summary,
      photo_url: photoUrl,
      language: made.plan.language,
      call: made.plan.book,
    },
    GOOGLE_ASKED_MS,
  );
  if (answer.status !== 200 || answer.body?.ok !== true) {
    const refused = refusedBy(answer);
    await closePostAttempt(db, {
      attemptId: send.id,
      outcome: answer.status === 0 || answer.status >= 500 ? "no_answer" : "refused",
      httpStatus: answer.status || null,
      answer: null,
      error: { code: null, subcode: null, words: refused.message },
    });
    await movePost(db, {
      postId,
      from: ["publishing"],
      to: "failed",
      patch: { error: { code: null, subcode: null, words: refused.message } },
    });
    throw refused;
  }
  const posted = {
    name: String(answer.body.name),
    search_url: typeof answer.body.search_url === "string" ? answer.body.search_url : null,
    state: typeof answer.body.state === "string" ? answer.body.state : null,
  };
  await closePostAttempt(db, {
    attemptId: send.id,
    outcome: "ok",
    httpStatus: 200,
    answer: null,
    externalId: posted.name,
  });
  await movePost(db, {
    postId,
    from: ["publishing"],
    to: "published",
    patch: { external_id: posted.name, permalink: posted.search_url },
  });
  return posted;
}

/** DELETE files/[id]/google: the post comes off the profile. It stays in Files. */
/**
 * A held week's Google placement readied overnight (00712): the picture drawn and kept for Google, every check, nothing
 * approved; the door takes it at 8:00, and the post's job asks Google at its time. Only for a time later than soon.
 */
export async function prepareOnGoogle(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { summary: string; when: string; about?: PostAbout | undefined },
) {
  if (row.source !== "made" || row.kind === "video") throw new AppError("validation", ON_GOOGLE.notAPost);
  const { made } = await readFileRecord(ctx, member, row);
  if (!made?.from) throw new AppError("validation", ON_GOOGLE.noPhoto);
  await pictureForGoogle(ctx, member, row.id, made.plan);
  return prepareApproval(ctx, member, row, {
    placements: [{ place: "google", kind: "picture", caption: input.summary, when: input.when }],
    intent: intentOfAbout(input.about),
    facts: [],
    via: "rung",
    connections: { google: "yes" },
  });
}

export async function takeFileOffGoogle(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { name: string },
): Promise<{ down: true }> {
  const a = await callEdgeGoogle(
    { op: "unpost", tenant_id: member.tenantId, user_id: ctx.userId, file_id: row.id, post_name: input.name },
    GOOGLE_ASKED_MS,
  );
  if (a.status !== 200 || a.body?.ok !== true) throw refusedBy(a);
  await takenDownOnGoogle(member, row.id, input.name);
  return { down: true };
}

/** Its placement, where one was kept, marked taken down: the sheet then reads it as off Google. A post made before is its events'. */
async function takenDownOnGoogle(member: Member, fileId: string, name: string): Promise<void> {
  const placed = await findPlacementByName(serviceDb(), member.tenantId, fileId, name);
  if (placed) await movePost(serviceDb(), { postId: placed, from: ["published"], to: "taken_down" });
}
