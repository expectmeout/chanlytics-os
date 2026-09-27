import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

/** Today is the page's own Today: the tab's WebView, which also carries the session, the badge and the widget's snapshot. */
export default function TodayTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("today", h), []);
  return <Surface route="today" tab="today" onReady={onReady} />;
}
