/**
 * The first run on its App Router route (`/w/<slug>/start`, `/w/<slug>/start/<step>`; decision 0015 step 10): the step
 * the address names, read from the path the page hands it, and the page's moves. A step's own move replaces the address
 * (so Back leaves the first run) and tells the frame, as the shell's own replace did; any other move is the frame's
 * (`navigate`). The route word is the shell's own, `start`, which is the product's word too.
 */
import { routeOfPath } from "@chanlytics/contracts";
import { navigate } from "../../legacy-verbs";
import { addressReplace } from "../../people/shell-verbs";
import { FirstRun } from "./page";

const firstRunGo = (to: string, opts?: { replace?: boolean }) =>
  opts?.replace ? addressReplace(to, { quiet: false }) : navigate(to);

export function FirstRunRoute({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "start";
  const param = route.includes("/") ? route.slice(route.indexOf("/") + 1) : "";
  return <FirstRun param={param || null} onNavigate={firstRunGo} />;
}
