/**
 * Everything the phone app reads of contracts, and nothing more: apps/mobile imports `@chanlytics/contracts/phone-app`
 * (this package's exports), which Metro bundles from these sources. The package's root is one built bundle of every
 * export with zod inside it: on 28 September 2026 that was 1.36 MB of the app's 3.34 MB of JavaScript, and every
 * update carried it. What this module reaches is eight modules.
 *
 * A name the app needs is added here from the module that declares it, never through a barrel. The preview
 * workflow publishes an update when one of the modules this reaches changes, so its paths list them
 * (apps/mobile/.eas/workflows/preview.yml, held to this module's imports by apps/mobile/test/preview-paths.test.mjs).
 */
export { APP_ROUTE_RE, parsePageMessage } from "./app-bridge";
export type { PageMessage, ShellMessage } from "./app-bridge";
export { CALL_ACTIVITY_NAME } from "./live-activity";
export type { CallActivityProps } from "./live-activity";
export type { TodayWidgetSnapshot } from "./widget";
export { APP_KEYS_RESIZE_CLASS, THEME_COLORS, THEME_INK } from "../shell/chrome";
export type { Theme } from "../shell/chrome";
export { UUID } from "../shared/identity";
export { MIN_MS } from "../shared/time";
