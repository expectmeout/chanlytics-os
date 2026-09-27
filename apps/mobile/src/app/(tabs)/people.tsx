import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

export default function PeopleTab() {
  const onReady = useCallback((h: SurfaceHandle) => front.set("people", h), []);
  return <Surface route="clients" tab="people" onReady={onReady} />;
}
