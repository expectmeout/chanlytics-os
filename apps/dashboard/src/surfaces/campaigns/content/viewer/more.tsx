/**
 * More, from the caret pill on the viewer's glass top (the content canvas, board PhView "more"; never three dots), and from
 * the last of the desk pane's acts (board Desk): a picture from a video, rename it; then set it aside, and delete it in red.
 * Change it is the foot's round press (Ruben, 12 Nov 2026: one way to change a piece). No Copy: a long press copies the caption where Details says it, and Save video
 * copies it with the video (Ruben, 12 Nov 2026: no press for what the phone already does). Each is Files' own verb; Delete asks first, in place of the acts.
 */
import { CONTENT_SHEET_WORDS, CONTENT_WORDS as W, FILE_WORDS, fileSaidOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { Menu, type MenuItem } from "../../../kit/menu/menu";

/** What More's items do, each Files' own verb (piece.tsx pieceActsOf); Delete asks first. */
export interface PieceMoreActs {
  /** A new version: of a post, where the photo it came from is still here; of a video Ask made, its words. Null otherwise. */
  onChange: (() => void) | null;
  /** A post made from the best moment of a video, asked of Ask (piece.tsx): offered on a video Ask made. */
  onMakePost: () => void;
  onAside: () => void;
  onDelete: () => void;
}

interface ViewerMoreActs extends PieceMoreActs {
  /** Rename, in the viewer's sheet or the desk pane's body. */
  onRename: () => void;
}

/**
 * The first group's items: what is made from it, then its name. Change it is the foot's round press beside the lead (Ruben,
 * 12 Nov 2026: one way to change a piece), and not here too.
 */
function moreItemsOf(file: FileDto, acts: ViewerMoreActs): MenuItem[] {
  const items: MenuItem[] = [];
  // What the video's own Post sheet offered beside Save video, here once that sheet went (Ruben, 12 Nov 2026): Ask makes it.
  if (file.kind === "video" && file.source === "made")
    items.push({
      label: CONTENT_SHEET_WORDS.video.picture,
      glyph: <Icon name="three" size={13} />,
      onSelect: acts.onMakePost,
    });
  // Its name wears a tag: Change it holds the pencil, and two pencils in one list read as one thing twice.
  items.push({ label: W.piece.rename, glyph: <Icon name="tag" size={13} />, onSelect: acts.onRename });
  return items;
}

export function ViewerMore({
  file,
  acts,
  desk = false,
}: {
  file: FileDto;
  acts: ViewerMoreActs;
  /** In a desk's pane: its own press, and the kit's card under it, light as the page is. */
  desk?: boolean;
}) {
  return (
    <Menu
      align="end"
      label={W.piece.more}
      dark={!desk}
      trigger={
        <Button variant={desk ? "secondary" : "glass"} size="lg" data-testid="cnv-more">
          {W.piece.more}
          <Icon name="chevron-down" size={11} />
        </Button>
      }
      groups={[
        // A phone draws the menu as a sheet, headed by what it is about.
        { header: fileSaidOf(file.name), items: moreItemsOf(file, acts) },
        {
          items: [
            {
              label: file.status === "set_aside" ? FILE_WORDS.putBack : FILE_WORDS.setAside,
              glyph: <Icon name="archive" size={13} />,
              onSelect: acts.onAside,
            },
            { label: FILE_WORDS.remove, glyph: <Icon name="ban" size={13} />, tone: "danger", onSelect: acts.onDelete },
          ],
        },
      ]}
    />
  );
}
