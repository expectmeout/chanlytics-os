import { Surface } from "@/shell/Surface";
import { TAB_ROUTES } from "@/shell/notifications-pure";

/** Calendar is the page's own Calendar: the tab's WebView at its route. */
export default function CalendarTab() {
  return <Surface route={TAB_ROUTES.calendar} tab="calendar" />;
}
