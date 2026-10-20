/**
 * A list to choose one from, as a phone holds it (the kit's Picker and Select; kit.css draws it under the kit's 900px from
 * `data-sheet` on its popup): the phone's action sheet, as the kit's Menu is, whose pull down from its top lets it go,
 * following the finger (kit/motion/swipe.ts touchSwipe), its touch kept its own (keepTouch). Open is Base UI's to decide; it is held
 * here only so the pull can close it.
 */
import { useState } from "react";
import { keepTouch, onAPhone, touchSwipe } from "../../legacy-verbs";

export function usePhoneList() {
  const [open, setOpen] = useState(false);
  // The pull is read only while the list is open: closed, nothing of it is drawn, and a server drawing the token has no
  // window for the thumb's reader.
  const pull = open ? keepTouch(touchSwipe({ onDown: () => setOpen(false), when: onAPhone })) : {};
  return { open, onOpenChange: (next: boolean) => setOpen(next), sheet: { "data-sheet": "", ...pull } };
}
