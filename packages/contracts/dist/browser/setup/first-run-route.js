export const FIRST_RUN_ROUTE = "start";
export function firstRunStepRoute(key) {
  return `${FIRST_RUN_ROUTE}/${key}`;
}
export const FIND_PARAM = "find";
export const FIRST_RUN_FIND_ROUTE = `${FIRST_RUN_ROUTE}/${FIND_PARAM}`;
