import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

export default function TodayTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("today", h), []);
  return <Surface route="today" onReady={onReady} />;
}
