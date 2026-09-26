/** Android has no expo-widgets: the snapshot goes nowhere. (widget.ios.ts is the iOS side.) */
import type { TodayWidgetSnapshot } from "@chanlytics/contracts";

export function updateTodayWidget(_s: TodayWidgetSnapshot): void {}
