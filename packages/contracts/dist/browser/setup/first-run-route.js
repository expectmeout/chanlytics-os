export const FIRST_RUN_STEP_KEYS = ["business", "receptionist", "rehearse", "channels", "live"];
const FIRST_RUN_STEPS_BEFORE = { phone: "live", try: "live" };
export function firstRunStepOf(param) {
  if (!param) return null;
  return FIRST_RUN_STEP_KEYS.find((k) => k === param) ?? FIRST_RUN_STEPS_BEFORE[param] ?? null;
}
export const FIRST_RUN_ROUTE = "start";
export function firstRunStepRoute(key) {
  return `${FIRST_RUN_ROUTE}/${key}`;
}
export const FIND_PARAM = "find";
export const FIRST_RUN_FIND_ROUTE = `${FIRST_RUN_ROUTE}/${FIND_PARAM}`;
