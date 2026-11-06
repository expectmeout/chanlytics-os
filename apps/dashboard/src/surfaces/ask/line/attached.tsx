/**
 * The photos a question goes with (decision 0099, step 2): picked with the +, pasted into the field, or dropped on the panel.
 * Each goes up the moment it is chosen, by the same door as Settings › Files, so it lands in the library and Ask sees it in
 * that turn. Send waits for them: a question never leaves saying it has a picture that has not arrived.
 */
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { ASK_ATTACHED_MAX, type AskAttached } from "@chanlytics/contracts";
import { refreshSurface } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { LineFiles, LinePress } from "../../kit/line/line";
import { FILE_PICKS, fileVerbs, type AddSaid } from "../../settings/files/verbs";
import type { LineWords } from "../words";
import type { Line } from "./types";

/** One photo beside the field: on its way, there, or refused with its words. */
export interface AttachedPhoto {
  key: number;
  file: File;
  /** A picture of it to draw, held only while it stands beside the field. */
  picture: string | null;
  state: "sending" | "ready" | "failed";
  /** The file it became, once it is there. */
  id: string | null;
  message: string | null;
}

/** Whether every photo beside the field has arrived, so the question may go. */
export const allArrived = (photos: readonly AttachedPhoto[]): boolean => photos.every((p) => p.state === "ready");

/** The photos beside the field as a question carries them. */
export const photosAsked = (photos: readonly AttachedPhoto[]): AskAttached[] =>
  photos.flatMap((p) => (p.id ? [{ id: p.id, name: p.file.name }] : []));

const pictureOf = (file: File): string | null =>
  typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;

const letGoOf = (p: AttachedPhoto): void => {
  if (p.picture) URL.revokeObjectURL(p.picture);
};

let nextKey = 1;

/** What the Line does with the photos beside its field. Made each draw; a send under way finishes by the state's own updater. */
export const arAttach = ({ attached, setAttached, flash, t }: Line) => {
  const send = (key: number, file: File) =>
    void fileVerbs
      .add(file)
      .catch((): AddSaid => ({ kept: false, message: t.attachFailed }))
      .then((said) => {
        setAttached((now) =>
          now.map((p) =>
            p.key !== key
              ? p
              : said.kept
                ? { ...p, state: "ready", id: said.id, message: null }
                : { ...p, state: "failed", message: said.message },
          ),
        );
        if (said.kept) void refreshSurface("files");
      });
  const attach = (files: readonly File[]) => {
    const room = ASK_ATTACHED_MAX - attached.length;
    const taken = files.slice(0, Math.max(0, room));
    if (files.length > taken.length) flash({ tone: "warn", msg: <>{t.attachTook(ASK_ATTACHED_MAX)}</> });
    const photos = taken.map((file): AttachedPhoto => ({
      key: nextKey++,
      file,
      picture: pictureOf(file),
      state: "sending",
      id: null,
      message: null,
    }));
    setAttached((now) => [...now, ...photos]);
    for (const p of photos) send(p.key, p.file);
  };
  const detach = (key: number) =>
    setAttached((now) => {
      for (const p of now) if (p.key === key) letGoOf(p);
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
      for (const p of now) letGoOf(p);
      return [];
    });
  return { attach, detach, attachAgain, clearAttached };
};

/** The images a paste holds: a screenshot, a photo copied from another app. Words pasted stay the field's. */
export const pastedPhotos = (e: ClipboardEvent, attach: (files: readonly File[]) => void): void => {
  const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
  if (files.length === 0) return;
  e.preventDefault();
  attach(files);
};

/** The panel takes what is dropped on it, and says so while something is over it. */
export const useArDrop = (attach: (files: readonly File[]) => void) => {
  const [dropping, setDropping] = useState(false);
  const holdsFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return {
    dropping,
    onDragOver: (e: DragEvent) => {
      if (!holdsFiles(e)) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent) => {
      setDropping(false);
      if (!holdsFiles(e)) return;
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
      <LineFiles ref={picker} accept={FILE_PICKS} multiple onChange={chosen} data-testid="ask-picker" />
    </>
  );
}

/** One photo beside the field: its picture, dim while it goes, and its × to take it away. */
function AttachedTile({ photo, t, detach }: { photo: AttachedPhoto; t: LineWords; detach: (key: number) => void }) {
  const [unseen, setUnseen] = useState(!photo.picture);
  return (
    <span
      className={`ask-attached-tile ${photo.state}`}
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
      {photo.state === "sending" ? <span className="ask-said">{t.attachSending}</span> : null}
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
