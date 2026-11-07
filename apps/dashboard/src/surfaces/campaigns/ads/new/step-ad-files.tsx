/**
 * New ad's photo, from the business's Files (MOCKUP for the ad, real for the pictures; decision 0099): a tile for each kept picture,
 * a post Ask made among them and saying so, what to know of the one picked, and the door to Files, where a photo is added. Pressing a
 * tile changes the draft and nothing else, and the preview under it draws the picture. A picture that cannot be drawn keeps its tile.
 */
import { useState } from "react";
import { FILE_WORDS, fileSaidOf, fileViewOf } from "@chanlytics/contracts";
import type { FileDto } from "@chanlytics/contracts";
import { NEW_AD, adFileNotes } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { routeDoor } from "../../../frame-verbs";
import { useKeptFiles } from "./kept-files";
import { Cap, Sec } from "./new-bits";
import type { StepProps } from "./new-bits";

/** Where Settings › Files is. */
const FILES_ROUTE = "admin/files";

/** How wide a tile's picture is asked for: twice the tile, for a sharp screen. */
const TILE_WIDTH = 240;

interface FileTileProps {
  file: FileDto;
  picked: boolean;
  onPick: () => void;
}

/** One kept picture as a tile: the picture, the name it goes by, and where a post Ask made came from. */
function FileTile({ file, picked, onPick }: FileTileProps) {
  const [broken, setBroken] = useState(false);
  const said = fileSaidOf(file.name);
  const made = file.source === "made";
  return (
    <LinkButton
      size="inherit"
      className="ads-new-post"
      aria-pressed={picked}
      aria-label={made ? `${said}, ${FILE_WORDS.shelves.made}` : said}
      onClick={onPick}
      data-testid={`ads-new-file-${file.id}`}
    >
      <span className="ads-new-post-art" aria-hidden="true">
        {broken ? (
          <Icon name="content" size={14} />
        ) : (
          <img
            className="ads-new-file-pic"
            src={`${fileViewOf(file.id)}?w=${TILE_WIDTH}`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        )}
      </span>
      <span className="ads-new-file-name">{said}</span>
      {made ? <span className="ads-new-file-name">{FILE_WORDS.shelves.made}</span> : null}
    </LinkButton>
  );
}

/** What is said in place of the tiles: reading, a read that failed, or nothing kept. */
function NoTiles({ held, again }: { held: ReturnType<typeof useKeptFiles>["held"]; again: () => void }) {
  if (held === undefined) return <Cap>{FILE_WORDS.reading}</Cap>;
  if (held === null) {
    return (
      <p className="ads-new-cap" role="alert" data-testid="ads-new-files-failed">
        {FILE_WORDS.failedRead}{" "}
        <LinkButton onClick={again} data-testid="ads-new-files-again">
          {FILE_WORDS.retry}
        </LinkButton>
      </p>
    );
  }
  return (
    <p className="ads-new-cap" data-testid="ads-new-files-none">
      {held.waiting > 0 ? FILE_WORDS.noneFiled : NEW_AD.step2.files.none}
    </p>
  );
}

/** What to know of the picture picked: amber, as a price the receptionist never quotes is. */
function FileNotes({ file }: { file: FileDto }) {
  return adFileNotes(file).map((note) => (
    <p key={note} className="cm-callout" data-testid="ads-new-file-note">
      <Icon name="notice" size={14} />
      <span className="cm-callout-words">{note}</span>
    </p>
  ));
}

export function FilesSec({ state, patch }: StepProps) {
  const { held, more, again } = useKeptFiles();
  const files = held?.files ?? [];
  const pickedId = state.draft.file?.fileId ?? null;
  const picked = files.find((f) => f.id === pickedId) ?? null;
  const { label, door } = NEW_AD.step2.files;
  return (
    <Sec label={label}>
      {files.length > 0 ? (
        <div className="ads-new-posts" role="group" aria-label={label} data-testid="ads-new-files">
          {files.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              picked={f.id === pickedId}
              onPick={() => patch({ postId: null, file: { fileId: f.id, name: f.name, made: f.source === "made" } })}
            />
          ))}
        </div>
      ) : (
        <NoTiles held={held} again={again} />
      )}
      {more ? (
        <LinkButton className="ads-new-files-more" onClick={more} data-testid="ads-new-files-more">
          {FILE_WORDS.showMore}
        </LinkButton>
      ) : null}
      {picked ? <FileNotes file={picked} /> : null}
      <Cap>{NEW_AD.step2.photoHint}</Cap>
      <LinkButton className="ads-new-files-door" {...routeDoor(FILES_ROUTE)} data-testid="ads-new-files-door">
        {door} <Icon name="chevron" size={11} />
      </LinkButton>
    </Sec>
  );
}
