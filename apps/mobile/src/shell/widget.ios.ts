/**
 * The widget's side of the bridge on iOS: a snapshot the page handed over becomes the widget's props, with the moment
 * said in the person's own clock (the widget runtime has no timezone of the workspace).
 */
import type { TodayWidgetSnapshot } from "@chanlytics/contracts/phone-app";
import TodayWidget from "../widgets/TodayWidget";

export function updateTodayWidget(s: TodayWidgetSnapshot): void {
  try {
    const asOf = new Date(s.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    TodayWidget.updateSnapshot({ headline: s.headline, figures: s.figures, waiting: s.waiting, first: s.first, asOf });
  } catch {
    /* a phone without the widget extension */
  }
}
