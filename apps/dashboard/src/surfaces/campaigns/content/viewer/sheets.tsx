/**
 * The sheets the viewer opens over the picture, each the kit's Sheet, dark as the viewer is: the drafts (the composer for both
 * places, a post's new version, a video's words made again), whose body and foot the desk's pane draws in its own
 * body (desk.tsx); Rename, with Files' own name field; and the line to Ask alone, where nothing is changed by hand.
 */
import type { ReactNode } from "react";
import { CONTENT_WORDS as W, type FileDto } from "@chanlytics/contracts";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { NameField } from "../../../files/file-fields";
import type { FileChange } from "../../../files/verbs";
import { draftBody, draftFoot, type usePieceDrafts } from "../piece-presses";
import { postBothTitleOf, type PlaceDoors } from "../post-both";
import { AskLine, type ChangeAbout } from "../sheets/ask-change";

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

const CLOSE = { label: W.viewer.close, glyph: <Icon name="x" size={13} /> };

/**
 * The open draft's name, and how it is let go of. A title alone (Ruben, 12 Nov 2026: no copy that says the obvious): the
 * piece's name stands behind the sheet, and what each draft does is its own fields' to show.
 */
export function draftHeadOf(drafts: PieceDrafts): { title: string; sub: string | null; cancel: () => void } {
  if (drafts.again.open) return { title: W.piece.changeIt, sub: null, cancel: drafts.again.cancel };
  if (drafts.version.open) return { title: W.piece.changeIt, sub: null, cancel: drafts.version.cancel };
  return { title: postBothTitleOf(drafts.both), sub: null, cancel: drafts.both.cancel };
}

/**
 * A draft open over the viewer: its body and its foot, as the desk's pane draws them. Each ends on its one press (the list's
 * send, Save as new, Make it again), and the sheet's × lets it go, as the canvas draws them. What a sheet holds stands clear of
 * its head's rule
 * (`.cnv-over`): the kit's sheet gives its body no room at its top, and the first box touched the rule.
 */
export function ViewerDrafts({
  drafts,
  doors,
  piece,
}: {
  drafts: PieceDrafts;
  doors: PlaceDoors;
  /** The piece's own sheet, where the list of places opens (Ruben, 12 Nov 2026: one sheet, not two): its name and its facts. */
  piece: { name: string; facts: ReactNode };
}) {
  const own = drafts.both.open;
  // Its name alone: what kind it is and its size stand on the piece behind the sheet already.
  const head = own ? { title: piece.name, sub: null, cancel: drafts.both.cancel } : draftHeadOf(drafts);
  return (
    <Sheet
      open={drafts.open}
      onClose={head.cancel}
      title={head.title}
      sub={head.sub ?? undefined}
      close={CLOSE}
      foot={draftFoot(drafts)}
      dark
      fit={own}
      testid="cnv-draft"
    >
      <div className="cnv-over">{draftBody(drafts, null, doors, piece.facts)}</div>
    </Sheet>
  );
}

/** Rename: Files' own name field, saved by Return or its Save. */
export function ViewerRename(props: {
  open: boolean;
  onClose: () => void;
  file: FileDto;
  change: (body: FileChange) => Promise<string | null>;
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={W.piece.rename} close={CLOSE} dark fit testid="cnv-rename">
      <div className="cnv-over">
        <NameField file={props.file} change={props.change} />
      </div>
    </Sheet>
  );
}

/**
 * Change it, for a piece Ask made that has nothing to change by hand (a post whose photo is gone): the one line to Ask alone.
 * A post's words and shape, and a video's words, carry the same line under them (piece-presses.tsx draftBody). `about` is the
 * piece, as the pane's drafts name it (usePieceDrafts).
 */
export function ViewerAskChange(props: { open: boolean; onClose: () => void; about: ChangeAbout }) {
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title={W.piece.changeIt}
      close={CLOSE}
      dark
      fit
      testid="cnv-ask-change-sheet"
    >
      <div className="cnv-over">
        <AskLine about={props.about} onAsked={props.onClose} alone />
      </div>
    </Sheet>
  );
}
