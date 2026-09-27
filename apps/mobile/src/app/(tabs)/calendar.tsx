import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

export default function CalendarTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("calendar", h), []);
  return <Surface route="calendar" tab="calendar" onReady={onReady} />;
}
