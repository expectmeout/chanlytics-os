import { Surface } from "@/shell/Surface";

/** Today is the page's own Today: the tab's WebView, which also carries the session, the badge and the widget's snapshot. */
export default function TodayTab() {
  return <Surface route="today" tab="today" />;
}
