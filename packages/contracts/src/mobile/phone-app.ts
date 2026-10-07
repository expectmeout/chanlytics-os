/**
 * Everything the phone app reads of contracts, and nothing more: apps/mobile imports `@chanlytics/contracts/phone-app`
 * (this package's exports), which Metro bundles from these sources. The package's root is one built bundle of every
 * export with zod inside it: on 28 September 2026 that was 1.36 MB of the app's 3.34 MB of JavaScript, and every
 * update carried it. What this module reaches is eight modules.
 *
 * A name the app needs is added here from the module that declares it, never through a barrel, and no package is
 * imported by this or by a module it reaches (apps/mobile/test/phone-entry.test.mjs). A change here reaches an
 * installed app when a hand runs the preview workflow, never by itself (apps/mobile/.eas/workflows/preview.yml).
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
