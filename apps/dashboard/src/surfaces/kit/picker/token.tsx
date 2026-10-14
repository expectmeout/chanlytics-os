/**
 * A word of a sentence that is pressed rather than chosen from a list, drawn as the picker's inline token: a campaign's
 * channels, which open their switches in the kit's popover; the rule it runs under, which opens Autonomy; a deal's day,
 * which opens the kit's month. Pressed, it acts or opens a page where it has an address, as the kit's press does; it is
 * the trigger a popover is opened by. A module apart from the picker (picker.tsx re-exports it), so a page that draws a
 * token alone, the deal sheet on every page's frame, does not load Base UI's Combobox and Select with it.
 */
import { Press } from "../press";
import type { PressAct, PressDoor } from "../press";
import { cx } from "../variants";

export function Token({ className, children, ...element }: PressAct | PressDoor) {
  return (
    <Press {...element} className={cx("token", "token-inline", className)}>
      <span className="token-face">{children}</span>
    </Press>
  );
}
