/**
 * What else can be done to an open piece, from a caret (never three dots): change it (a new version of a post,
 * files/post-version.tsx, or a made video's words, video-again.tsx), save a still of a video (still.tsx), rename it, set it
 * aside or put it back, delete it. Each
 * is Files' own verb; Delete asks first, in the pane's foot, as a sequence's End it does. Offered only to a person who may
 * change the piece. Saving is the foot's Save, never a second press here.
 */
import { CONTENT_WORDS as W, FILE_WORDS, STILL_WORDS, fileSaidOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuItem } from "../../kit/menu/menu";

export interface PieceMoreActs {
  /** A new version: of a post, where the photo it came from is still here; of a video Ask made, its words. Null otherwise. */
  onChange: (() => void) | null;
  /** A moment of a video that is ready kept as a photo (stage 3), for whoever may add photos; null otherwise. */
  onStill: (() => void) | null;
  onRename: () => void;
  onAside: () => void;
  onDelete: () => void;
}

export function PieceMore({ file, phone, acts }: { file: FileDto; phone: boolean; acts: PieceMoreActs }) {
  const items: MenuItem[] = [];
  if (acts.onChange)
    items.push({ label: W.piece.changeIt, glyph: <Icon name="pencil" size={13} />, onSelect: acts.onChange });
  if (acts.onStill)
    items.push({ label: STILL_WORDS.open, glyph: <Icon name="image" size={13} />, onSelect: acts.onStill });
  items.push({ label: W.piece.rename, glyph: <Icon name="edit" size={13} />, onSelect: acts.onRename });
  items.push({
    label: file.status === "set_aside" ? FILE_WORDS.putBack : FILE_WORDS.setAside,
    glyph: <Icon name="archive" size={13} />,
    onSelect: acts.onAside,
  });
  return (
    <Menu
      align="end"
      label={W.piece.more}
      trigger={
        <Button variant="quiet" size={phone ? "touch" : "sm"} iconOnly aria-label={W.piece.more} data-testid="cnv-more">
          <Icon name="chevron-down" size={phone ? 18 : 14} />
        </Button>
      }
      groups={[
        // A phone draws the menu as a sheet, headed by what it is about.
        { header: phone ? fileSaidOf(file.name) : undefined, items },
        {
          items: [
            {
              label: FILE_WORDS.remove,
              glyph: <Icon name="ban" size={13} />,
              tone: "danger",
              onSelect: acts.onDelete,
            },
          ],
        },
      ]}
    />
  );
}
