import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

export default function InboxTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("inbox", h), []);
  return <Surface route="inbox" tab="inbox" onReady={onReady} />;
}
