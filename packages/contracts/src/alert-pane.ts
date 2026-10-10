/**
 * The package's entry for what Settings › Notifications draws with (`@chanlytics/contracts/alert-pane`, decision 0040):
 * the topics in their groups, the grid's cells, the page's words, and the business's address list's own rules.
 *
 * The browser's entry (browser.generated.ts) is one module that every page's route loads, so a value any page imports
 * from it is on every page. Only the Notifications pane draws these, so they load with that pane, as Reports' date
 * control's words do (reports/report-window.ts). The server, the edge and the tests read the same values from the index.
 */
export {
  ALERT_PANE_WORDS,
  alertGrid,
  bellLineFor,
  phoneLine,
  withTopicEmail,
  withTopicPush,
} from "./today/notification-kinds";
export type { AlertTopic, AlertCell, AlertGridGroup, EmailHeld } from "./today/notification-kinds";
export {
  ALERT_ADDRESSES_MIN,
  ALERT_REFUSED_WORDS,
  alertAddressesOf,
  memberGetsAlerts,
  withAlertAddress,
} from "./config/workspace-config/alerts";
