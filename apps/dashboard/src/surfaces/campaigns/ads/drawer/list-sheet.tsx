/**
 * A tapped word on a phone (MOCKUP; Ruben, 11 Oct 2026, decision 6): a bottom list, the kit's sheet in a job's shape, over the
 * drawer it was tapped in, titled with the list it opens. One at a time: the sheet is modal, so the drawer behind it takes no
 * press, and Escape, the wash and a pull down close it. A desk keeps the popover (sentence.tsx).
 */
import type { ReactNode } from "react";
import { DRAWER } from "@chanlytics/contracts/ads-page";
import { Sheet } from "../../../kit/sheet/sheet";

/** Its word to close it: a choice not made, nothing changed. */
const CANCEL = { word: DRAWER.foot.cancel };

interface ListSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function ListSheet({ open, onClose, title, children }: ListSheetProps) {
  return (
    <Sheet
      shape="job"
      open={open}
      onClose={onClose}
      title={title}
      close={CANCEL}
      className="ads-bottom"
      testid="ads-list-sheet"
    >
      {open ? children : null}
    </Sheet>
  );
}
