/**
 * The photos a question goes with (decision 0099, step 2): picked with the +, pasted into the field, or dropped on the panel.
 * Each goes up the moment it is chosen, by the same door as Settings › Files, so it lands in the library and Ask sees it in
 * that turn. Send waits for them: a question never leaves saying it has a picture that has not arrived.
 *
 * A video (stage B, D10), where the workspace takes them, goes up the same way, and Send waits while it is made ready, saying
 * so; past two minutes the question goes all the same, with the video named as still being prepared, and Ask says it will open
 * it once it is.
 */
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { ASK_ATTACHED_MAX, MIN_MS, SECOND_MS, videoPreviewOf, type AskAttached } from "@chanlytics/contracts";
import { refreshSurface } from "../../frame-verbs";
import { holdsFiles, imagesIn } from "../../kit/drop/drop";
import { Icon } from "../../kit/icon/icon";
import { LineFiles, LinePress } from "../../kit/line/line";
import { isVideoFile } from "../../files/sending";
import { FILE_PICKS, FILE_PICKS_WITH_VIDEO, fileVerbs, type AddSaid } from "../../files/verbs";
import { surfaceValue } from "../../surface-values";
import type { LineWords } from "../words";
import type { Line } from "./types";

/** How long a question waits for a video to be made ready, and how often it asks. */
const VIDEO_READY_WAIT_MS = 2 * MIN_MS;
const VIDEO_READY_ASK_MS = 3 * SECOND_MS;

/** Whether a video it was sent is ready, or past waiting for: the question may go either way. */
async function videoMadeReady(id: string): Promise<void> {
  for (const until = Date.now() + VIDEO_READY_WAIT_MS; Date.now() < until;) {
    const r = await fileVerbs.record(id).catch(() => null);
    const status = r?.ok ? r.data.file.media_status : null;
    if (status === "ready" || status === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, VIDEO_READY_ASK_MS));
  }
}

/** One photo or video beside the field: on its way, being made ready (a video), there, or refused with its words. */
export interface AttachedPhoto {
  key: number;
  file: File;
  /** A picture of it to draw, held only while it stands beside the field. */
  picture: string | null;
  state: "sending" | "preparing" | "ready" | "failed";
  /** The file it became, once it is there. */
  id: string | null;
  message: string | null;
}

/** Whether every photo beside the field has arrived, so the question may go. */
export const allArrived = (photos: readonly AttachedPhoto[]): boolean => photos.every((p) => p.state === "ready");

/** The photos beside the field as a question carries them. */
export const photosAsked = (photos: readonly AttachedPhoto[]): AskAttached[] =>
  photos.flatMap((p) => (p.id ? [{ id: p.id, name: p.file.name }] : []));

const heldPictureOf = (file: File): string | null =>
  typeof URL.createObjectURL === "function" && !isVideoFile(file) ? URL.createObjectURL(file) : null;

const letPictureGo = (p: AttachedPhoto): void => {
  if (p.picture) URL.revokeObjectURL(p.picture);
};

let nextKey = 1;

/** What the Line does with the photos beside its field. Made each draw; a send under way finishes by the state's own updater. */
export const arAttach = ({ attached, setAttached, flash, t }: Line) => {
  const swap = (key: number, change: Partial<AttachedPhoto>) =>
    setAttached((now) => now.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const send = (key: number, file: File) =>
    void fileVerbs
      .add(file)
      .catch((): AddSaid => ({ kept: false, message: t.attachFailed }))
      .then(async (said) => {
        if (!said.kept) return swap(key, { state: "failed", message: said.message });
        void refreshSurface("files");
        // A video already here, or still being made ready: Send waits for it, two minutes at most.
        if (said.video) {
          swap(key, { state: "preparing", id: said.id, message: null });
          await videoMadeReady(said.id);
        }
        swap(key, { state: "ready", id: said.id, message: null });
      });
  const attach = (files: readonly File[]) => {
    const room = ASK_ATTACHED_MAX - attached.length;
    const taken = files.slice(0, Math.max(0, room));
    if (files.length > taken.length) flash({ tone: "warn", msg: <>{t.attachTook(ASK_ATTACHED_MAX)}</> });
    const photos = taken.map((file): AttachedPhoto => ({
      key: nextKey++,
      file,
      picture: heldPictureOf(file),
      state: "sending",
      id: null,
      message: null,
    }));
    setAttached((now) => [...now, ...photos]);
    for (const p of photos) send(p.key, p.file);
  };
  const detach = (key: number) =>
    setAttached((now) => {
      for (const p of now) if (p.key === key) letPictureGo(p);
      return now.filter((p) => p.key !== key);
    });
  const attachAgain = (key: number) => {
    const p = attached.find((x) => x.key === key);
    if (!p) return;
    setAttached((now) => now.map((x) => (x.key === key ? { ...x, state: "sending", message: null } : x)));
    send(key, p.file);
  };
  const clearAttached = () =>
    setAttached((now) => {
      for (const p of now) letPictureGo(p);
      return [];
    });
  return { attach, detach, attachAgain, clearAttached };
};

/** The images a paste holds: a screenshot, a photo copied from another app. Words pasted stay the field's. */
export const pastedPhotos = (e: ClipboardEvent, attach: (files: readonly File[]) => void): void => {
  const files = imagesIn(e.clipboardData);
  if (files.length === 0) return;
  e.preventDefault();
  attach(files);
};

/** The panel takes what is dropped on it, and says so while something is over it. */
export const useArDrop = (attach: (files: readonly File[]) => void) => {
  const [dropping, setDropping] = useState(false);
  return {
    dropping,
    onDragOver: (e: DragEvent) => {
      if (!holdsFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent) => {
      setDropping(false);
      if (!holdsFiles(e.dataTransfer)) return;
      e.preventDefault();
      attach(Array.from(e.dataTransfer.files));
    },
  };
};

/** The + at the field's start, and the picker it opens: a phone's offers the camera and its library. */
export function AskAttachPress({ t, attach }: { t: LineWords; attach: (files: readonly File[]) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const chosen = (e: ChangeEvent<HTMLInputElement>) => {
    attach(Array.from(e.target.files ?? []));
    e.target.value = "";
  };
  return (
    <>
      <LinePress
        kind="attach"
        className="ask-attach"
        aria-label={t.attach}
        title={t.attach}
        onClick={() => picker.current?.click()}
        data-testid="ask-attach"
      >
        <Icon name="plus" size={15} />
      </LinePress>
      <LineFiles
        ref={picker}
        // Videos, where the workspace takes them: read off the settings surface where it has landed, photos alone before.
        accept={videoPreviewOf(surfaceValue("settings")?.settings?.config) ? FILE_PICKS_WITH_VIDEO : FILE_PICKS}
        multiple
        onChange={chosen}
        data-testid="ask-picker"
      />
    </>
  );
}

/** One photo beside the field: its picture, dim while it goes, and its × to take it away. */
function AttachedTile({ photo, t, detach }: { photo: AttachedPhoto; t: LineWords; detach: (key: number) => void }) {
  const [unseen, setUnseen] = useState(!photo.picture);
  return (
    <span
      className={`ask-attached-photo ${photo.state}`}
      title={photo.file.name}
      data-testid={`ask-attached-${photo.state}`}
    >
      {unseen ? (
        <span className="ask-attached-unseen">{photo.file.name}</span>
      ) : (
        <img
          className="ask-attached-pic"
          src={photo.picture ?? undefined}
          alt={photo.file.name}
          onError={() => setUnseen(true)}
        />
      )}
      {photo.state === "sending" ? (
        <span className="ask-said">{isVideoFile(photo.file) ? t.attachSendingVideo : t.attachSending}</span>
      ) : photo.state === "preparing" ? (
        <span className="ask-said">{t.attachPreparing}</span>
      ) : null}
      <LinePress
        kind="clear"
        className="ask-attached-away"
        aria-label={t.attachAway(photo.file.name)}
        onClick={() => detach(photo.key)}
        data-testid="ask-attached-away"
      >
        <Icon name="x" size={9} />
      </LinePress>
    </span>
  );
}

/** The photos beside the field, and what refused any of them, with its Try again. */
export function AskAttachedRow({
  photos,
  t,
  detach,
  attachAgain,
}: {
  photos: readonly AttachedPhoto[];
  t: LineWords;
  detach: (key: number) => void;
  attachAgain: (key: number) => void;
}) {
  const failed = photos.find((p) => p.state === "failed");
  return (
    <div className="ask-attached" data-testid="ask-attached">
      <div className="ask-attached-row">
        {photos.map((p) => (
          <AttachedTile key={p.key} photo={p} t={t} detach={detach} />
        ))}
      </div>
      {failed ? (
        <p className="ask-attached-why" role="alert" data-testid="ask-attached-why">
          {failed.file.name}: {failed.message}{" "}
          <LinePress kind="open" onClick={() => attachAgain(failed.key)} data-testid="ask-attached-again">
            {t.attachAgain}
          </LinePress>
        </p>
      ) : null}
    </div>
  );
}
