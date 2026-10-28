/** The phone app: the bridge between the web page and the native shell, the Today widget and the call's Live Activity. */
export { APP_ROUTE_RE, parsePageMessage, parseShellMessage, PUSH_TOKEN_MAX } from "./app-bridge";
export type { PageMessage, ShellMessage } from "./app-bridge";
export {
  CALL_ACTIVITY_NAME,
  CALL_ACTIVITY_ROLES,
  CALL_ACTIVITY_STALE_MS,
  callActivityPropsOf,
  callActivityStart,
} from "./live-activity";
export type { CallActivityProps } from "./live-activity";
export { todayWidgetSnapshot } from "./today-widget";
export { parseTodayWidgetSnapshot } from "./widget";
export type { TodayWidgetSnapshot } from "./widget";
