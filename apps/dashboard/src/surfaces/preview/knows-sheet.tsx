"use client";

/**
 * A lead's own preview, What it knows whole (decision 0079; the redesign's canvas, 6): a sheet over the page, from a
 * phone's bottom edge, with its title, the line under it and its Close, and under them every fact grouped by where it
 * was read (knows.tsx). The sheet is the kit's own, so its behaviour is the kit's: the page behind held still, Escape,
 * a press on the wash and a pull down closing it. The page loads this module as See all is first pressed
 * (preview-page.tsx), so a stranger's first load of a link from an email carries no sheet.
 */
import { LEAD_PREVIEW_WORDS as W, type PreviewPageVM } from "@chanlytics/contracts";
import { Icon } from "../kit/icon/icon";
import { Sheet } from "../kit/sheet/sheet";
import { PvKnownGroups } from "./knows";

export default function PvKnowsSheet({
  open,
  onClose,
  vm,
  told,
  token,
}: {
  open: boolean;
  onClose: () => void;
  vm: PreviewPageVM;
  told: readonly string[];
  token: string;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={W.knowsTitle}
      sub={W.knowsSub}
      close={{ label: W.knowsDone, glyph: <Icon name="x" size={13} /> }}
      testid="pv-knows"
    >
      <PvKnownGroups vm={vm} told={told} token={token} />
    </Sheet>
  );
}
