import { ROLE_PERMS } from "../config/workspace-config/role-perms.js";
export const FIRST_RUN_TITLE = "Setting up";
export const FINISH_SETTING_UP = "Finish setting up";
export const FIRST_RUN_LANDED_KEY = "chanlytics.setup.landed";
export function shouldLandOnFirstRun(role, answering, route, landed) {
  if (landed || answering || !ROLE_PERMS[role]?.settings) return false;
  return route === "" || route === "today";
}
