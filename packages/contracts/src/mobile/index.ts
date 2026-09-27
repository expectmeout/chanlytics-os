/** The phone app: the bridge between the web page and the native shell, the Today widget and the call's Live Activity. */
export { APP_ROUTE_RE, PUSH_TOKEN_MAX, parsePageMessage, parseShellMessage } from "./app-bridge";
export type { PageMessage, ShellMessage } from "./app-bridge";
export { CALL_ACTIVITY_NAME, CALL_ACTIVITY_STALE_MS, callActivityStart, callActivityPropsOf } from "./live-activity";
export type { CallActivityProps } from "./live-activity";
export { todayWidgetSnapshot, parseTodayWidgetSnapshot } from "./widget";
export type { TodayWidgetSnapshot } from "./widget";
