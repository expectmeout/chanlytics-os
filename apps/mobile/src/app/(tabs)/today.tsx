import { Surface } from "@/shell/Surface";
import { TAB_ROUTES } from "@/shell/notifications-pure";

/** Today is the page's own Today: the tab's WebView, which also carries the session, the badge and the widget's snapshot. */
export default function TodayTab() {
  return <Surface route={TAB_ROUTES.today} tab="today" />;
}
