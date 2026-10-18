import { runDecidedOnItsPage } from "../waits/waits.js";
import { runSheetRoute, sequenceRoute } from "./sequence-address.js";
export function arrivedRunOf(route) {
  const [path = ""] = route.split("?");
  const [root, param = "", rest] = path.split("/");
  const run = root === "broadcasts" && rest === void 0 ? /^run:([^:/]+)$/.exec(param) : null;
  return run?.[1] ?? null;
}
export function runLandingOf(route, run) {
  const id = arrivedRunOf(route);
  if (!id || id !== run.id) return null;
  return runDecidedOnItsPage(run) ? runSheetRoute(id) : sequenceRoute(run.sequence_id || id, "history", id);
}
