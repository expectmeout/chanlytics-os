/**
 * The page says it is done (the phone canvas, 28 Oct 2026; the spec's §8): on a phone the last thing above the tab bar, so
 * a thumb that reaches it knows there is nothing under it.
 */
import { TODAY_PHONE_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";

export function TodayEnd() {
  return (
    <p className="tp-end" data-testid="today-end">
      <Icon name="check" size={13} />
      {TODAY_PHONE_WORDS.end}
    </p>
  );
}
