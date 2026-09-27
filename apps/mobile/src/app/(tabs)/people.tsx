import { Surface } from "@/shell/Surface";
import { TAB_ROUTES } from "@/shell/notifications-pure";

/** People is the page's own People: the tab's WebView at its route. */
export default function PeopleTab() {
  return <Surface route={TAB_ROUTES.people} tab="people" />;
}
